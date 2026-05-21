import * as vscode from "vscode";
import { randomBytes, createHash } from "node:crypto";
import { SUPABASE_OAUTH } from "../shared/supabaseOAuth";

const NS = "vs-crm";
const KEY = {
  accessToken: `${NS}.mgmtOAuth.accessToken`,
  refreshToken: `${NS}.mgmtOAuth.refreshToken`,
  expiresAt: `${NS}.mgmtOAuth.expiresAt`,
  // One pending verifier per outstanding authorize call, keyed by the state
  // param so we can reject mismatched callbacks (CSRF defense).
  pendingVerifierPrefix: `${NS}.mgmtOAuth.pendingVerifier.`,
} as const;

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer" | string;
};

// Handles the Supabase Management API OAuth (PKCE) flow.
//
// Supabase requires an HTTPS redirect URI, but VS Code extensions can only
// receive callbacks via vscode:// URIs. The bridge is a tiny static HTTPS
// "bouncer" page (hosted by the extension owner) that catches the redirect
// from Supabase and JS-forwards it to vscode://<extensionId>/oauth-callback.
// That deep-link is captured by CrmUriHandler and passed to handleCallback().
//
// Tokens live in vscode.SecretStorage so they survive reloads and never appear
// in extension settings.
export class SupabaseManagementOAuth {
  private refreshInFlight: Promise<string> | null = null;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  async startFlow(): Promise<void> {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    const state = randomBytes(16).toString("base64url");

    await this.ctx.secrets.store(
      KEY.pendingVerifierPrefix + state,
      verifier,
    );

    const u = new URL(SUPABASE_OAUTH.authorizeUrl);
    u.searchParams.set("client_id", SUPABASE_OAUTH.clientId);
    u.searchParams.set("redirect_uri", SUPABASE_OAUTH.bouncerUrl);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("code_challenge", challenge);
    u.searchParams.set("code_challenge_method", "S256");
    u.searchParams.set("state", state);
    u.searchParams.set("scope", SUPABASE_OAUTH.scope);

    await vscode.env.openExternal(vscode.Uri.parse(u.toString()));
  }

  async handleCallback(uri: vscode.Uri): Promise<void> {
    const q = new URLSearchParams(uri.query);
    const err = q.get("error_description") ?? q.get("error");
    if (err) throw new Error(`OAuth error: ${err}`);

    const code = q.get("code");
    const state = q.get("state");
    if (!code || !state) {
      throw new Error("OAuth callback missing code or state");
    }

    const verifierKey = KEY.pendingVerifierPrefix + state;
    const verifier = await this.ctx.secrets.get(verifierKey);
    if (!verifier) {
      throw new Error("OAuth state not recognized — call startFlow first");
    }
    // One-shot: consume the verifier before exchanging so a replayed callback
    // can't reuse it.
    await this.ctx.secrets.delete(verifierKey);

    const tokens = await this.exchange({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: SUPABASE_OAUTH.bouncerUrl,
      client_id: SUPABASE_OAUTH.clientId,
    });
    await this.storeTokens(tokens);
  }

  // Returns a valid access token. Refreshes ~60s before expiry, or after.
  // Concurrent callers share a single in-flight refresh (single-flight) so we
  // don't burn the refresh token on a thundering herd.
  async getAccessToken(): Promise<string> {
    const access = await this.ctx.secrets.get(KEY.accessToken);
    const expiresAt = parseInt(
      (await this.ctx.secrets.get(KEY.expiresAt)) ?? "0",
      10,
    );
    if (access && Date.now() < expiresAt - 60_000) {
      return access;
    }
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.refresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  async revoke(): Promise<void> {
    const refresh = await this.ctx.secrets.get(KEY.refreshToken);
    if (refresh) {
      try {
        await fetch(SUPABASE_OAUTH.revokeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: SUPABASE_OAUTH.clientId,
            refresh_token: refresh,
          }).toString(),
        });
      } catch (e) {
        console.warn(
          "[vs-crm] OAuth revoke network failed (clearing locally anyway):",
          e,
        );
      }
    }
    await Promise.all([
      this.ctx.secrets.delete(KEY.accessToken),
      this.ctx.secrets.delete(KEY.refreshToken),
      this.ctx.secrets.delete(KEY.expiresAt),
    ]);
  }

  async isAuthorized(): Promise<boolean> {
    return !!(await this.ctx.secrets.get(KEY.refreshToken));
  }

  private async refresh(): Promise<string> {
    const refresh = await this.ctx.secrets.get(KEY.refreshToken);
    if (!refresh) {
      throw new Error("Supabase OAuth not authorized (no refresh token)");
    }
    const tokens = await this.exchange({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: SUPABASE_OAUTH.clientId,
    });
    await this.storeTokens(tokens);
    return tokens.access_token;
  }

  private async exchange(
    body: Record<string, string>,
  ): Promise<TokenResponse> {
    const res = await fetch(SUPABASE_OAUTH.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(
        `OAuth token endpoint failed (${res.status}): ${txt || res.statusText}`,
      );
    }
    return (await res.json()) as TokenResponse;
  }

  private async storeTokens(t: TokenResponse): Promise<void> {
    const expiresAt = Date.now() + t.expires_in * 1000;
    await Promise.all([
      this.ctx.secrets.store(KEY.accessToken, t.access_token),
      this.ctx.secrets.store(KEY.refreshToken, t.refresh_token),
      this.ctx.secrets.store(KEY.expiresAt, String(expiresAt)),
    ]);
  }
}
