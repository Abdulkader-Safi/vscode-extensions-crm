# vs-crm — TODO

## Missing features

### High impact
- [ ] Wire TanStack Query into all routes (replace `onMount` + manual `load()`)
- [ ] Add optimistic mutations (no more full refetch after every write)
- [ ] Subscribe to Supabase realtime for multi-tab sync
- [ ] Add client detail page at `/clients/:id` (timeline of `communication_logs`, linked projects, totals)
- [ ] Add project detail page at `/projects/:id` (linked tasks, invoices, expenses, time)
- [ ] Surface `notifications` in the AppLayout header (bell + dropdown + mark-as-read)
- [ ] Provision a Supabase Storage bucket in a new migration
- [ ] Add logo upload UI in Settings (writes to `profiles.logo_url`)
- [ ] Add avatar upload UI in Settings (writes to `profiles.avatar_url`)

### Medium impact
- [ ] Add status / date-range / client / tag filters to Invoices
- [ ] Add status / date-range / client filters to Expenses
- [ ] Add status / client filters to Projects
- [ ] Add status / project / priority filters to Tasks
- [ ] Add column sorting on every table
- [ ] Add a "vs-crm: Apply pending migrations" command for shipped upgrades
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
- [ ] Move `CREATE TABLE IF NOT EXISTS public._vscrm_migrations(...)` to top of `0001_schema.sql`
- [ ] Delete `migrations/0003_vsccrm_tracking.sql`
- [ ] Remove the special-case branches for `0003` in `runMigrations()`
- [ ] Move `clearServiceRoleKey()` into the orchestrator success path (don't wait for `boot/finalize`)
- [ ] Wrap invoice + line-item save in a Postgres function (or compensate on failure)
- [ ] Add `UNIQUE(user_id, invoice_number)` constraint in a new migration
- [ ] Surface a friendly "duplicate invoice number" error in the UI
- [ ] Fix Expenses "This month" calc — use current `YYYY-MM` key, not `monthlyMap[0]`

### UX / inconsistency
- [ ] Test CSV download (Reports) in Extension Dev Host — verify CSP allows `blob:`
- [ ] Test PDF download (Invoices) in Extension Dev Host — verify CSP allows `blob:`
- [ ] If `blob:` blocked, send bytes via IPC and save with `vscode.workspace.fs.writeFile` + `showSaveDialog`
- [ ] Build a `<ConfirmDialog>` component on top of `<Dialog>`
- [ ] Replace `confirm()` in Clients delete
- [ ] Replace `confirm()` in Projects delete
- [ ] Replace `confirm()` in Tasks delete
- [ ] Replace `confirm()` in Invoices delete
- [ ] Replace `confirm()` in Expenses delete
- [ ] Add a "I added the redirect URI to Supabase" checkbox before completing onboarding

### Cleanup
- [ ] Move bootstrap snippet to `src/shared/bootstrapSnippet.ts`
- [ ] Import shared snippet from `src/extension/bootstrap/migrations.ts`
- [ ] Import shared snippet from `src/webview/onboarding/Onboarding.svelte`
- [ ] Delete `src/webview/onboarding/bootstrapSnippet.ts`
- [ ] Remove unused `BOOTSTRAP_FUNCTION_SQL` import in `WebviewProvider.ts`
- [ ] Remove unused `TEARDOWN_FUNCTION_SQL` import in `WebviewProvider.ts`
- [ ] Delete `CrmWebviewProvider.notifyAuthTokens` static method
- [ ] Remove `"verify"` from the `Step` type in `Onboarding.svelte`
- [ ] Convert `on:click` → `onclick` across all components
- [ ] Convert `on:submit` → `onsubmit` in `AuthScreen.svelte`
- [ ] Convert `on:change` → `onchange` in `Tasks.svelte`
- [ ] Convert `on:consider` / `on:finalize` → `onconsider` / `onfinalize` in `Leads.svelte`
- [ ] Fix self-closing `<div />` in `Onboarding.svelte`
- [ ] Add `tabindex="-1"` to `<div role="dialog">` in `Dialog.svelte`
- [ ] Add a keyboard handler for backdrop click in `Dialog.svelte`
- [ ] Document why `0002_revoke.sql` revokes execute on trigger-only functions (or remove)
- [ ] Document why `splitSqlStatements` handles nested dollar-quotes (or simplify)

## Quick wins (each under 30 min)
- [ ] Move bootstrap snippet to `src/shared/`
- [ ] Delete dead imports + `notifyAuthTokens` + `"verify"` step
- [ ] Add `UNIQUE(user_id, invoice_number)` constraint
- [ ] Replace `confirm()` with Dialog
- [ ] Fix Expenses "This month" calc
- [ ] Move `clearServiceRoleKey()` into orchestrator
- [ ] Inline migration tracking into `0001`, delete `0003`
