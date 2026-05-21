import * as vscode from "vscode";
import { CrmWebviewProvider } from "./WebviewProvider";
import { CrmSecrets } from "./extension/secrets";
import { CrmUriHandler, buildRedirectUri } from "./extension/auth/uriHandler";
import { applyPendingMigrations } from "./extension/bootstrap/autoApply";

export function activate(context: vscode.ExtensionContext) {
  const secrets = new CrmSecrets(context);
  const uriHandler = new CrmUriHandler();
  // Always derive the redirect URI from the runtime extension ID
  // (`<publisher>.<name>` per package.json). Renaming the publisher only
  // requires updating the Supabase Redirect URLs allow-list.
  const redirectUri = buildRedirectUri(context.extension.id);

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
  );

  // Fire-and-forget: apply any migration bundles shipped with this version
  // that the user's Supabase project hasn't recorded yet. No-ops if there's
  // nothing to do (or no service-role key stored).
  applyPendingMigrations(secrets);
}

export function deactivate() {}
