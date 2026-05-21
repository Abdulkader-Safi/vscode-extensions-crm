import * as vscode from "vscode";
import { CrmWebviewProvider } from "./WebviewProvider";
import { CrmSecrets } from "./extension/secrets";
import { CrmUriHandler, buildRedirectUri } from "./extension/auth/uriHandler";
import { applyPendingMigrations } from "./extension/bootstrap/autoApply";
import { SupabaseManagementOAuth } from "./extension/supabaseOAuth";

export function activate(context: vscode.ExtensionContext) {
  const secrets = new CrmSecrets(context);
  const uriHandler = new CrmUriHandler();
  // Always derive the redirect URI from the runtime extension ID
  // (`<publisher>.<name>` per package.json). Renaming the publisher only
  // requires updating the Supabase Redirect URLs allow-list.
  const redirectUri = buildRedirectUri(context.extension.id);
  // Management API OAuth: token storage + PKCE flow. The actual callback URL
  // is the HTTPS bouncer (see src/shared/supabaseOAuth.ts) which deep-links
  // back to vscode://<id>/oauth-callback — captured by uriHandler below.
  const oauth = new SupabaseManagementOAuth(context);

  // Bridge the URI handler's /oauth-callback path into the OAuth class.
  uriHandler.onOAuthCallback(async (uri) => {
    try {
      await oauth.handleCallback(uri);
      vscode.window.showInformationMessage("Supabase: connected ✓");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Supabase authorize failed: ${msg}`);
    }
  });

  context.subscriptions.push(
    vscode.window.registerUriHandler(uriHandler),
    vscode.commands.registerCommand("vs-crm.open", () => {
      CrmWebviewProvider.createOrShow(
        context.extensionUri,
        secrets,
        uriHandler,
        redirectUri,
      );
    }),
    vscode.commands.registerCommand("vs-crm.resetOnboarding", async () => {
      const yes = await vscode.window.showWarningMessage(
        "Reset vs-crm? This clears your stored Supabase URL, anon key, service-role key, and any saved session. Data in your Supabase project is NOT touched.",
        { modal: true },
        "Reset",
      );
      if (yes !== "Reset") return;
      await secrets.reset();
      vscode.window.showInformationMessage(
        "vs-crm onboarding reset. Run 'vs-crm: Open' to start over.",
      );
    }),
    vscode.commands.registerCommand("vs-crm.devOAuthSmoke", async () => {
      // Dev-only command for verifying the Supabase Management OAuth flow.
      // Will be hidden once Batch 10c lands real onboarding UI.
      if (await oauth.isAuthorized()) {
        const action = await vscode.window.showQuickPick(
          ["Get access token (refresh if needed)", "Revoke + clear"],
          { placeHolder: "vs-crm OAuth: already authorized — pick an action" },
        );
        if (action === "Get access token (refresh if needed)") {
          try {
            const tok = await oauth.getAccessToken();
            vscode.window.showInformationMessage(
              `OAuth token (truncated): ${tok.slice(0, 16)}…`,
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            vscode.window.showErrorMessage(`Token fetch failed: ${msg}`);
          }
        } else if (action === "Revoke + clear") {
          await oauth.revoke();
          vscode.window.showInformationMessage("OAuth revoked.");
        }
        return;
      }
      await oauth.startFlow();
      vscode.window.showInformationMessage(
        "Opened Supabase consent in your browser — finish there to connect.",
      );
    }),
  );

  // Fire-and-forget: apply any migration bundles shipped with this version
  // that the user's Supabase project hasn't recorded yet. No-ops if there's
  // nothing to do (or no service-role key stored).
  applyPendingMigrations(secrets);
}

export function deactivate() {}
