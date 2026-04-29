# vs-crm — TODO

## Missing features

### High impact — all done
- [x] Wire TanStack Query into all routes (replace `onMount` + manual `load()`)
- [x] Add optimistic mutations (no more full refetch after every write)
- [x] Subscribe to Supabase realtime for multi-tab sync
- [x] Add client detail page at `/clients/:id` (timeline of `communication_logs`, linked projects, totals)
- [x] Add project detail page at `/projects/:id` (linked tasks, invoices, expenses, time)
- [x] Surface `notifications` in the AppLayout header (bell + dropdown + mark-as-read)
- [x] Provision a Supabase Storage bucket in a new migration
- [x] Add logo upload UI in Settings (writes to `profiles.logo_url`)
- [x] Add avatar upload UI in Settings (writes to `profiles.avatar_url`)

### Medium impact
- [ ] Add status / date-range / client / tag filters to Invoices
- [ ] Add status / date-range / client filters to Expenses
- [ ] Add status / client filters to Projects
- [ ] Add status / project / priority filters to Tasks
- [ ] Add column sorting on every table
- [x] ~~Add a "vs-crm: Apply pending migrations" command for shipped upgrades~~ — superseded: pending migrations now auto-apply on extension activate (`src/extension/bootstrap/autoApply.ts`). Service-role key + `_vscrm_exec_sql` helper persist so future bundles ship friction-free.
- [ ] Add a top-level error boundary with a "Reload" button
- [ ] Show a "Reconnecting…" banner when Supabase is unreachable
- [ ] Retry queued mutations when connection comes back
- [ ] Write tests for `splitSqlStatements`
- [ ] Write tests for `runMigrations` (mock fetch)
- [ ] Write tests for the IPC bus

### Lower impact
- [ ] Bulk select + delete for Clients
- [ ] Bulk select + delete for Invoices
- [ ] Bulk select + delete for Expenses
- [ ] Add pagination or virtualization to all list tables
- [ ] Add `deleted_at` columns + Trash view (soft delete)
- [ ] Add a 5-second undo toast on every delete
- [ ] Add tag filtering on Clients
- [ ] Add a kanban view for Tasks (todo / in_progress / done)
- [ ] Add invoice preview before PDF download
- [ ] Add invoice email send (Resend or Supabase Edge Function)
- [ ] Add recurring / template invoices
- [ ] Add a public client portal (token-based read-only invoice link)
- [ ] Wire `svelte-i18n` for English / Arabic
- [ ] Add RTL support
- [ ] Add timezone field on profile + use across UI
- [ ] Add FX conversion to Reports for multi-currency
- [ ] Add an inline "Update connection" affordance in Settings
- [ ] Add DSO (days sales outstanding) to Reports
- [ ] Add cash-flow projection to Reports
- [ ] Add project ROI to Reports
- [ ] Compute hourly rate from `time_entries` in Reports
- [ ] Add keyboard shortcuts (`Cmd+N` new invoice, etc.)
- [ ] Add a `cmdk`-style command palette inside the webview

## Logic / flow issues

### Correctness
- [ ] Wrap each migration's statements in `BEGIN; … COMMIT;`
- [ ] Add `IF NOT EXISTS` / `OR REPLACE` to every `CREATE` in migrations
- [x] Move `CREATE TABLE IF NOT EXISTS public._vscrm_migrations(...)` to top of `0001_schema.sql`
- [x] Delete `migrations/0003_vsccrm_tracking.sql`
- [x] Remove the special-case branches for `0003` in `runMigrations()`
- [x] ~~Move `clearServiceRoleKey()` into the orchestrator success path (don't wait for `boot/finalize`)~~ — reversed: we no longer clear the service-role key at all. It persists in SecretStorage so `applyPendingMigrations` can run on activate. Tradeoff: persistent elevated key vs. zero-friction upgrades.
- [ ] Wrap invoice + line-item save in a Postgres function (or compensate on failure)
- [x] Add `UNIQUE(user_id, invoice_number)` constraint in a new migration
- [ ] Surface a friendly "duplicate invoice number" error in the UI
- [x] Fix Expenses "This month" calc — use current `YYYY-MM` key, not `monthlyMap[0]`

### UX / inconsistency
- [ ] Test CSV download (Reports) in Extension Dev Host — verify CSP allows `blob:`
- [ ] Test PDF download (Invoices) in Extension Dev Host — verify CSP allows `blob:`
- [ ] If `blob:` blocked, send bytes via IPC and save with `vscode.workspace.fs.writeFile` + `showSaveDialog`
- [ ] Build a `<ConfirmDialog>` component on top of `<Dialog>`
- [x] Replace `confirm()` in Clients delete
- [x] Replace `confirm()` in Projects delete
- [x] Replace `confirm()` in Tasks delete
- [x] Replace `confirm()` in Invoices delete
- [x] Replace `confirm()` in Expenses delete
- [x] Replace `confirm()` in Leads delete (bonus)
- [ ] Add a "I added the redirect URI to Supabase" checkbox before completing onboarding

### Cleanup
- [x] Move bootstrap snippet to `src/shared/bootstrapSnippet.ts`
- [ ] Import shared snippet from `src/extension/bootstrap/migrations.ts`
- [x] Import shared snippet from `src/webview/onboarding/Onboarding.svelte`
- [x] Delete `src/webview/onboarding/bootstrapSnippet.ts`
- [x] Remove unused `BOOTSTRAP_FUNCTION_SQL` import in `WebviewProvider.ts`
- [x] Remove unused `TEARDOWN_FUNCTION_SQL` import in `WebviewProvider.ts`
- [x] Delete `CrmWebviewProvider.notifyAuthTokens` static method
- [x] Remove `"verify"` from the `Step` type in `Onboarding.svelte`
- [ ] Convert `on:click` → `onclick` across all components (`AuthScreen`, `Dialog`, `AppLayout`, `Leads`, `Onboarding`)
- [ ] Convert `on:submit` → `onsubmit` in `AuthScreen.svelte`
- [ ] Convert `on:change` → `onchange` in `Tasks.svelte`
- [ ] Convert `on:consider` / `on:finalize` → `onconsider` / `onfinalize` in `Leads.svelte`
- [ ] Convert `<svelte:window on:keydown>` → `onkeydown` in `Dialog.svelte`
- [ ] Fix self-closing `<div />` in `Onboarding.svelte`
- [ ] Add `tabindex="-1"` to `<div role="dialog">` in `Dialog.svelte`
- [ ] Add a keyboard handler for backdrop click in `Dialog.svelte`
- [ ] Document why `0002_revoke.sql` revokes execute on trigger-only functions (or remove)
- [ ] Document why `splitSqlStatements` handles nested dollar-quotes (or simplify)

## Quick wins (each under 30 min) — all done
- [x] Move bootstrap snippet to `src/shared/`
- [x] Delete dead imports + `notifyAuthTokens` + `"verify"` step
- [x] Add `UNIQUE(user_id, invoice_number)` constraint
- [x] Replace `confirm()` with Dialog
- [x] Fix Expenses "This month" calc
- [x] Move `clearServiceRoleKey()` into orchestrator
- [x] Inline migration tracking into `0001`, delete `0003`
