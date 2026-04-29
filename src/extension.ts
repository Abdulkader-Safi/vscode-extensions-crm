import * as vscode from "vscode";
import { CrmWebviewProvider } from "./WebviewProvider";
import { CrmSecrets } from "./extension/secrets";
import { CrmUriHandler, buildRedirectUri } from "./extension/auth/uriHandler";

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
        "Reset vs-crm? This clears your stored Supabase URL, anon key, service-role key (if still kept), and any saved session. Data in your Supabase project is NOT touched.",
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
}

export function deactivate() {}
