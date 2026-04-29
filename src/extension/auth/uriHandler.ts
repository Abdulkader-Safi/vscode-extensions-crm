import * as vscode from "vscode";
import type { AuthTokens } from "../../shared/messages";

export type AuthCallbackListener = (tokens: AuthTokens) => void;

export class CrmUriHandler implements vscode.UriHandler {
  private listeners: Set<AuthCallbackListener> = new Set();

  handleUri(uri: vscode.Uri): void {
    // Path is /auth-callback. Tokens may arrive as either:
    //  - query params:    ?code=... (PKCE flow)
    //  - fragment params: #access_token=...&refresh_token=... (implicit flow)
    if (!uri.path.includes("auth-callback")) return;

    const query = new URLSearchParams(uri.query);
    const fragment = new URLSearchParams(uri.fragment.replace(/^#/, ""));

    const error =
      query.get("error_description") || fragment.get("error_description");
    if (error) {
      this.emit({ error });
      return;
    }

    const code = query.get("code");
    if (code) {
      this.emit({ code });
      return;
    }

    const access_token = fragment.get("access_token");
    const refresh_token = fragment.get("refresh_token");
    if (access_token && refresh_token) {
      this.emit({ access_token, refresh_token });
      return;
    }

    this.emit({ error: "Auth callback received no tokens or code." });
  }

  onAuthCallback(listener: AuthCallbackListener): vscode.Disposable {
    this.listeners.add(listener);
    return new vscode.Disposable(() => this.listeners.delete(listener));
  }

  private emit(tokens: AuthTokens) {
    for (const l of this.listeners) {
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
