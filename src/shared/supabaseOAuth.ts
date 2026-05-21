// Single source of truth for the Supabase Management OAuth (PKCE) flow.
// CLIENT_ID is the public identifier of the vs-crm OAuth app registered at
// supabase.com → Org Settings → OAuth Apps. PKCE-only — no client secret is
// embedded in the extension (VS Code extensions can't keep secrets).

export const SUPABASE_OAUTH = {
  clientId: "46d2d9e1-4db7-44fe-a79b-22df91aba30d",
  authorizeUrl: "https://api.supabase.com/v1/oauth/authorize",
  tokenUrl: "https://api.supabase.com/v1/oauth/token",
  revokeUrl: "https://api.supabase.com/v1/oauth/revoke",
  managementApiBase: "https://api.supabase.com",
  // Default scope. We'll tighten in 10b once the consent screen reveals the
  // exact scope names the dashboard form maps to.
  scope: "all",
  // Supabase's OAuth requires an HTTPS redirect URI. Custom URI schemes
  // (vscode://) and plain HTTP loopback (http://127.0.0.1) are both rejected.
  // So we use an HTTPS bouncer: a static page that catches the redirect and
  // JS-redirects to vscode://<extensionId>/oauth-callback. Safi hosts this
  // page; it must be registered as the Redirect URI in the OAuth App.
  bouncerUrl: "https://vs-crm.abdulkadersafi.com/oauth-callback",
} as const;

// vscode:// URI the bouncer page redirects to. Caught by CrmUriHandler.
export function buildOAuthCallbackUri(extensionId: string): string {
  return `vscode://${extensionId}/oauth-callback`;
}
