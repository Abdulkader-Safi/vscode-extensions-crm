import * as vscode from "vscode";
import { CrmWebviewProvider } from "./WebviewProvider";
import { CrmSecrets } from "./extension/secrets";
import { CrmUriHandler } from "./extension/auth/uriHandler";

export function activate(context: vscode.ExtensionContext) {
  const secrets = new CrmSecrets(context);
  const uriHandler = new CrmUriHandler();

  context.subscriptions.push(
    vscode.window.registerUriHandler(uriHandler),
    vscode.commands.registerCommand("vs-crm.open", () => {
      CrmWebviewProvider.createOrShow(
        context.extensionUri,
        secrets,
        uriHandler,
      );
    }),
    vscode.commands.registerCommand(
      "vs-crm.resetOnboarding",
      async () => {
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
      },
    ),
  );
}

export function deactivate() {}
