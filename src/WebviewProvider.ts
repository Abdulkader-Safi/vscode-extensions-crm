import * as vscode from "vscode";
import { CrmSecrets } from "./extension/secrets";
import {
  pingSupabase,
  runMigrations,
} from "./extension/bootstrap/orchestrator";
import { CrmUriHandler } from "./extension/auth/uriHandler";
import type {
  HostEvent,
  MigrationProgress,
  WebviewRequest,
  ResponseEnvelope,
} from "./shared/messages";

export class CrmWebviewProvider {
  public static currentPanel: CrmWebviewProvider | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _authSub: vscode.Disposable | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _extensionUri: vscode.Uri,
    private readonly _secrets: CrmSecrets,
    private readonly _uriHandler: CrmUriHandler,
    private readonly _redirectUri: string,
  ) {
    this._panel = panel;
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (data) => this._onMessage(data as WebviewRequest),
      null,
      this._disposables,
    );

    // Forward auth callback tokens to the webview as an event.
    this._authSub = this._uriHandler.onAuthCallback((tokens) => {
      this._sendEvent({
        direction: "event",
        type: "auth/tokens",
        payload: tokens,
      });
    });
    this._disposables.push(this._authSub);
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    secrets: CrmSecrets,
    uriHandler: CrmUriHandler,
    redirectUri: string,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (CrmWebviewProvider.currentPanel) {
      CrmWebviewProvider.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "vs-crm",
      "vs-crm",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
        retainContextWhenHidden: true,
      },
    );

    CrmWebviewProvider.currentPanel = new CrmWebviewProvider(
      panel,
      extensionUri,
      secrets,
      uriHandler,
      redirectUri,
    );
  }

  public dispose() {
    CrmWebviewProvider.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }

  private async _onMessage(msg: WebviewRequest) {
    if (!msg || msg.direction !== "request") return;
    try {
      const result = await this._dispatch(msg);
      this._respond(msg.id, msg.type, true, result);
    } catch (e) {
      this._respond(msg.id, msg.type, false, undefined, (e as Error).message);
    }
  }

  private async _dispatch(msg: WebviewRequest): Promise<unknown> {
    switch (msg.type) {
      case "boot/request-config": {
        return {
          supabaseUrl: (await this._secrets.getUrl()) ?? null,
          anonKey: (await this._secrets.getAnonKey()) ?? null,
          bootstrapped: this._secrets.isBootstrapped(),
          redirectUri: this._redirectUri,
        };
      }
      case "boot/save-creds": {
        const { url, serviceRoleKey, anonKey } = msg.payload;
        await this._secrets.setConnection(url, anonKey, serviceRoleKey);
        return { ok: true };
      }
      case "boot/verify": {
        return await pingSupabase(
          msg.payload.url,
          msg.payload.anonKey,
          msg.payload.serviceRoleKey,
        );
      }
      case "boot/run-migrations": {
        const url = await this._secrets.getUrl();
        const serviceRoleKey = await this._secrets.getServiceRoleKey();
        if (!url || !serviceRoleKey) {
          throw new Error("Connection not saved.");
        }
        // Service-role key intentionally stays in SecretStorage so the host
        // can apply future schema bundles automatically on extension activate
        // (see applyPendingMigrations in extension.ts). Tradeoff documented
        // in the README: zero-friction upgrades vs. persistent elevated key.
        return runMigrations(
          { url, serviceRoleKey },
          (p: MigrationProgress) => {
            this._sendEvent({
              direction: "event",
              type: "boot/migration-progress",
              payload: p,
            });
          },
        );
      }
      case "boot/finalize": {
        await this._secrets.setBootstrapped(true);
        return { ok: true };
      }
      case "boot/reset": {
        await this._secrets.reset();
        return { ok: true };
      }
      case "auth/oauth-start": {
        await vscode.env.openExternal(
          vscode.Uri.parse(msg.payload.authorizeUrl),
        );
        return { ok: true };
      }
      case "secrets/get": {
        return { value: await this._secrets.proxyGet(msg.payload.key) };
      }
      case "secrets/set": {
        await this._secrets.proxySet(msg.payload.key, msg.payload.value);
        return { ok: true };
      }
      case "secrets/delete": {
        await this._secrets.proxyDelete(msg.payload.key);
        return { ok: true };
      }
      case "notify": {
        const fn =
          msg.payload.level === "error"
            ? vscode.window.showErrorMessage
            : msg.payload.level === "warning"
              ? vscode.window.showWarningMessage
              : vscode.window.showInformationMessage;
        await fn(msg.payload.message);
        return { ok: true };
      }
      case "copy": {
        await vscode.env.clipboard.writeText(msg.payload.text);
        return { ok: true };
      }
      case "files/save-file": {
        const { filename, mimeType, bytes } = msg.payload;
        const ext = filename.includes(".")
          ? filename.slice(filename.lastIndexOf(".") + 1)
          : "";
        const filters: Record<string, string[]> = {};
        if (ext) {
          filters[mimeType || ext.toUpperCase()] = [ext];
        }
        filters["All Files"] = ["*"];
        const defaultUri = vscode.Uri.file(
          (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "") +
            "/" +
            filename,
        );
        const target = await vscode.window.showSaveDialog({
          defaultUri,
          filters,
        });
        if (!target) {
          return { saved: false };
        }
        await vscode.workspace.fs.writeFile(
          target,
          Buffer.from(bytes, "base64"),
        );
        return { saved: true, path: target.fsPath };
      }
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
        throw new Error(
          `Unknown request type: ${(msg as { type: string }).type}`,
        );
      }
    }
  }

  private _respond(
    id: string,
    type: string,
    ok: boolean,
    payload?: unknown,
    error?: string,
  ) {
    const env: ResponseEnvelope<string, unknown> = ok
      ? { id, direction: "response", type, ok: true, payload: payload ?? null }
      : {
          id,
          direction: "response",
          type,
          ok: false,
          error: error ?? "Unknown error",
        };
    this._panel.webview.postMessage(env);
  }

  private _sendEvent(event: HostEvent) {
    this._panel.webview.postMessage(event);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.css"),
    );

    const nonce = getNonce();

    // CSP: allow Supabase REST/realtime, plus inline styles for Svelte/runtime.
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data: blob: https:`,
      `connect-src ${webview.cspSource} https://*.supabase.co wss://*.supabase.co`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>vs-crm</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
