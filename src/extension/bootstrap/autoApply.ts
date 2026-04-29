import * as vscode from "vscode";
import { CrmSecrets } from "../secrets";
import { listAppliedMigrations } from "./listAppliedMigrations";
import { MIGRATIONS } from "./migrations";
import { runMigrations } from "./orchestrator";

// Run on extension activate. If the user has finished onboarding AND there
// are migrations bundled in this extension version that have not yet been
// recorded in `_vscrm_migrations`, apply them silently in the background.
//
// Requires both the URL and the service-role key in SecretStorage. Under
// the persistent-credential model (option A) the key is kept after the
// first onboarding so this can run without prompting.
//
// Failures surface as a non-modal warning toast — never throw, since the
// extension must keep activating even if the network is down.
export async function applyPendingMigrations(
  secrets: CrmSecrets,
): Promise<void> {
  if (!secrets.isBootstrapped()) {
    return;
  }
  const url = await secrets.getUrl();
  const serviceRoleKey = await secrets.getServiceRoleKey();
  if (!url || !serviceRoleKey) {
    return;
  }

  let applied: Set<string>;
  try {
    applied = await listAppliedMigrations({ url, serviceRoleKey });
  } catch {
    return;
  }
  const pending = MIGRATIONS.filter((m) => !applied.has(m.name));
  if (pending.length === 0) {
    return;
  }

  try {
    const result = await runMigrations({ url, serviceRoleKey }, () => {
      // No progress UI here — user wasn't watching. Errors are toasted below.
    });
    if (result.applied.length > 0) {
      vscode.window.showInformationMessage(
        `vs-crm: applied ${result.applied.length} schema update${result.applied.length === 1 ? "" : "s"}.`,
      );
    }
  } catch (e) {
    vscode.window.showWarningMessage(
      `vs-crm: schema update failed — ${(e as Error).message}. Run "vs-crm: Open" and check the SQL Editor.`,
    );
  }
}
