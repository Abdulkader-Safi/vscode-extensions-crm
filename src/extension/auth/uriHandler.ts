import * as vscode from "vscode";
import type { AuthTokens } from "../../shared/messages";

type AuthCallbackListener = (tokens: AuthTokens) => void;
type OAuthCallbackListener = (uri: vscode.Uri) => void;

export class CrmUriHandler implements vscode.UriHandler {
  private authListeners: Set<AuthCallbackListener> = new Set();
  private oauthListeners: Set<OAuthCallbackListener> = new Set();

  handleUri(uri: vscode.Uri): void {
    // Two distinct callback paths share this single URI handler:
    //   /oauth-callback → Supabase Management API OAuth (PKCE) — Batch 10
    //   /auth-callback  → end-user app sign-in (magic link / OAuth provider)
    // Exact path comparison so "oauth-callback" doesn't accidentally also
    // trigger the auth-callback branch.
    if (uri.path === "/oauth-callback") {
      for (const l of this.oauthListeners) {
        try {
          l(uri);
        } catch (e) {
          console.error("[vs-crm] oauth listener error", e);
        }
      }
      return;
    }
    if (uri.path !== "/auth-callback") {
      return;
    }

    // Tokens may arrive as either:
    //  - query params:    ?code=... (PKCE flow)
    //  - fragment params: #access_token=...&refresh_token=... (implicit flow)
    const query = new URLSearchParams(uri.query);
    const fragment = new URLSearchParams(uri.fragment.replace(/^#/, ""));

    const error =
      query.get("error_description") || fragment.get("error_description");
    if (error) {
      this.emitAuth({ error });
      return;
    }

    const code = query.get("code");
    if (code) {
      this.emitAuth({ code });
      return;
    }

    const access_token = fragment.get("access_token");
    const refresh_token = fragment.get("refresh_token");
    if (access_token && refresh_token) {
      this.emitAuth({ access_token, refresh_token });
      return;
    }

    this.emitAuth({ error: "Auth callback received no tokens or code." });
  }

  onAuthCallback(listener: AuthCallbackListener): vscode.Disposable {
    this.authListeners.add(listener);
    return new vscode.Disposable(() => this.authListeners.delete(listener));
  }

  onOAuthCallback(listener: OAuthCallbackListener): vscode.Disposable {
    this.oauthListeners.add(listener);
    return new vscode.Disposable(() => this.oauthListeners.delete(listener));
  }

  private emitAuth(tokens: AuthTokens) {
    for (const l of this.authListeners) {
      try {
        l(tokens);
      } catch (e) {
        console.error("[vs-crm] auth listener error", e);
      }
    }
  }
}

// Build the redirect URI from the extension's runtime ID so it always matches
// what's published. `extensionId` is `${publisher}.${name}` from package.json.
// Users add this exact URI to Supabase Authentication -> URL Configuration -> Redirect URLs.
export function buildRedirectUri(extensionId: string): string {
  return `vscode://${extensionId}/auth-callback`;
}
