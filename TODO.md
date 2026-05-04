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

- [x] Add status / date-range / client filters to Invoices — tag filter dropped (no `tags` column on `invoices`; tags live on `clients` only)
- [x] Add category / date-range / client filters to Expenses — status filter dropped (no `status` column on `expenses`); client joins through `expenses.project_id → projects.client_id`
- [x] Add status / client filters to Projects (with sort field + direction toggle in toolbar)
- [x] Add status / project / priority filters to Tasks (with sort field + direction toggle in toolbar)
- [x] Add column sorting on every table — clickable headers on Invoices/Expenses, sort dropdown for Projects (cards) and Tasks (list)
- [x] ~~Add a "vs-crm: Apply pending migrations" command for shipped upgrades~~ — superseded: pending migrations now auto-apply on extension activate (`src/extension/bootstrap/autoApply.ts`). Service-role key + `_vscrm_exec_sql` helper persist so future bundles ship friction-free.
- [x] Add a top-level error boundary with a "Reload" button — `<svelte:boundary>` wraps `<Router>` inside `AppLayout`; `ErrorFallback.svelte` offers "Try again" (calls `reset`) + "Reload extension" (`location.reload()`). Sidebar/header stay rendered when a route crashes.
- [x] Show a "Reconnecting…" banner when Supabase is unreachable — `ConnectionBanner.svelte` driven by `connection.svelte.ts` rune store; mounts above header in `AppLayout`. Status comes from realtime channel's `subscribe()` callback (`SUBSCRIBED → online`, `CHANNEL_ERROR | TIMED_OUT | CLOSED → offline` with 1.5s debounce).
- [x] Retry queued mutations when connection comes back — TanStack Query's `onlineManager` is bound to the same connection store; `networkMode: "online"` on mutation defaults pauses + auto-replays on reconnect. No custom queue.
- [x] Write tests for `splitSqlStatements` — 15 cases in `src/extension/bootstrap/sqlSplitter.test.ts` covering line/block comments, single-quote `''` escapes, untagged/tagged/nested/unterminated dollar quotes, multi-stmt + tail emission.
- [x] Write tests for `runMigrations` (mock fetch) — 6 cases in `src/extension/bootstrap/orchestrator.test.ts`. Stubs `globalThis.fetch` per test; mocks `./migrations` via `mock.module` to bypass esbuild's `.sql` text loader and use deterministic fixtures. Covers all-applied, 404, mixed, RPC 500, network reject, headers.
- [x] Write tests for the IPC bus — 8 cases in `src/webview/lib/ipc.test.ts`. Stubs `window.addEventListener` (Bun has no DOM) and `../vscodeApi` via `mock.module`. Covers request/response promise resolve+reject, mismatched-id ignore, unique-id, on/off/multi-subscriber.

**Test runner:** `bun test` (Bun 1.3.9). Run with `bun run test:unit`. The existing `@vscode/test-cli` Mocha stub at `src/test/extension.test.ts` is untouched and reserved for future extension-host integration tests; the new unit suite is scoped to `src/extension src/webview src/shared`.

### Lower impact

**Batch 1 — Bulk-ops + Soft-delete + Undo (all shipped)**

- [x] Bulk select + delete for Clients — header tri-state checkbox + per-card checkbox + sticky `<BulkActionBar>` (`src/webview/routes/Clients.svelte`).
- [x] Bulk select + delete for Invoices — checkbox column in table head + body, `<SelectableHeader>` for select-all-visible (`src/webview/routes/Invoices.svelte`).
- [x] Bulk select + delete for Expenses — same table pattern as Invoices (`src/webview/routes/Expenses.svelte`).
- [x] Add `deleted_at` columns + Trash view — `migrations/0006_soft_delete.sql` adds `deleted_at TIMESTAMPTZ` + partial indexes on 8 tables. `<Trash>` route at `/trash` with tabbed list (Clients/Projects/Tasks/Invoices/Expenses/Leads), per-row Restore + permanent-delete, "Empty trash". Sidebar entry shows total count badge.
- [x] Add a 5-second undo toast on every delete — `softDelete()` in `src/webview/lib/softDelete.ts` uses svelte-sonner's built-in `action` button. Same helper drives per-row delete (Projects/Tasks/Leads) and bulk delete (Clients/Invoices/Expenses); call sites no longer hand-roll `confirm() + mutate + toast`. Per-row delete drops the confirm dialog (undo is the safety net).
- [ ] Add pagination or virtualization to all list tables

**Batch 3 — Tag filter + Tasks kanban + Invoice preview (all shipped)**

- [x] Add tag filtering on Clients — chip strip above search; OR-within-tags semantics; AND with search; auto-hidden when no tags exist (`src/webview/routes/Clients.svelte`).
- [x] Add a kanban view for Tasks (todo / in_progress / done) — new `/tasks/kanban` route with svelte-dnd-action, drag updates `tasks.status` (and `completed_at` on done) via the existing `useUpdateTaskMutation`. Within-column reorder deferred (no `position` column on tasks). Toolbar toggle in `Tasks.svelte` jumps to/from board view.
- [x] Add invoice preview before PDF download — `src/webview/lib/invoicePreview.ts` extracts the data-prep + jsPDF render; `<InvoicePreviewDialog>` shows HTML preview matching the PDF layout (no iframe, so no CSP change). Eye icon in `Invoices.svelte` opens the preview; "Download PDF" inside the dialog calls the same renderer the row's Download button uses.
**Batch 5 — Settings + Keyboard + Palette (all shipped)**

- [x] Add an inline "Update connection" affordance in Settings — Connection card in `Settings.svelte` shows current Supabase URL + a "Change…" button opening a Dialog with URL/anon-key/service-role inputs. Submit fires `boot/verify` → `boot/save-creds` → `location.reload()` so the new client + realtime + auth all reinit cleanly.
- [x] Add keyboard shortcuts — global `<svelte:window onkeydown>` on `AppLayout`. Cmd/Ctrl+K opens the palette unconditionally; Cmd/Ctrl+N runs the route's registered `primary-new` command (skipped while typing in INPUT/TEXTAREA).
- [x] Add a `cmdk`-style command palette inside the webview — `src/webview/lib/commands.svelte.ts` (rune store: register, show/hide, filter) + `src/webview/lib/components/CommandPalette.svelte` (mounted in `App.svelte`). Built native — no external lib (cmdk is React-only; Svelte equivalents are unmaintained). 11 core nav/account commands; each list route registers a `primary-new` dynamic command on mount.

**Cleanup folded into Batch 5**: all `on:click` / `on:submit` / `on:change` / `on:consider` / `on:finalize` / `on:keydown` converted to Svelte 5 attribute syntax across AuthScreen, AppLayout, Leads, Onboarding, Tasks, Dialog. Dialog gained `tabindex="-1"`, a backdrop keyboard handler, and `role="button"` on the backdrop. Self-closing `<div />` in Onboarding.svelte fixed. Build went from 19 warnings → 1 (an unrelated pre-existing Card.svelte note).

**Batch 6 — Reports enhancements (DSO + Cash-flow + ROI + Hourly rate shipped; FX deferred)**

- [x] Add DSO (days sales outstanding) to Reports — mean of `paid_at - issue_date` over invoices paid in trailing 90d. Surfaced as a 4th `<StatCard>` next to Revenue/Expenses/Profit. Renders "—" when no qualifying paid invoices exist.
- [x] Add cash-flow projection to Reports — `<Card title="Cash-flow projection (next 6 months)">` shows outstanding invoices grouped by `due_date` month plus a "projected" series equal to the trailing-3-month paid average. Once recurring invoices ship (Batch 7), the projection should subtract templated months — flagged in code comments.
- [x] Add project ROI to Reports — per-project `paid_revenue - expense_total` rendered as a horizontal bar (`indexAxis: "y"`) with green/red bars based on sign. Top 6 projects by ROI shown.
- [x] Compute hourly rate from `time_entries` in Reports — table: project / paid revenue / hours / $/hr. Hours come from `time_entries.duration_minutes / 60`; rate = paid revenue / hours (unpaid invoices excluded so the metric reflects collected work). No `billable` filter (column doesn't exist; documented).
**Batch 4 — Globalization (all shipped)**

- [x] Wire `svelte-i18n` for English / Arabic — `src/webview/i18n/{index.ts,en.json,ar.json}`. `init()` runs on import; `App.svelte` syncs `$locale` from `profile.language` and sets `<html lang>` + `<html dir>`. Adding strings: append to both catalogs, then `{$_("key")}` in templates.
- [x] Add RTL support — `document.documentElement.dir` flips to `rtl` for Arabic (or any `RTL_LOCALES` entry). Tailwind v4 logical utilities work out-of-the-box. No per-component code.
- [x] Add timezone field on profile + use across UI — `0007_profile_timezone_fx.sql` adds `profiles.timezone TEXT DEFAULT 'UTC'`. Curated IANA dropdown (`TIMEZONES` in `src/webview/lib/utils.ts`) in Settings. New `formatDate(value, tz, locale)` and `formatDateTime` helpers wrap `Intl.DateTimeFormat`; routes can adopt them as needed.

**Translation coverage (v1)**: sidebar nav, page headers + descriptions, primary "New X" buttons, Trash header, common labels (`save`, `cancel`, `close`, etc.), and Settings card titles. Body copy of forms/dialogs/empty-states inherits English fallback for now — adding strings to the catalogs is a rolling task as the app evolves.

**FX conversion shipped (user-entered rates)**

- [x] Add FX conversion to Reports for multi-currency — `0007_profile_timezone_fx.sql` also adds `profiles.fx_rates JSONB`. Settings has a new "Currency rates" card listing every non-base currency that appears in the user's invoices/expenses, with an editable rate input. `src/webview/lib/fx.ts` exposes `convertToBase(amount, from, base, rates)`; Reports applies it to every aggregate (totals, monthly chart, top-clients, project ROI, cash-flow projection). Currencies without a saved rate fall through at face value with a footnote calling that out.

**Batch 7 — Architectural (planned, deployment-gated)**

The plan file has implementation-ready details for these (`/Users/safi/.claude/plans/...`). They each need infrastructure outside the extension bundle, so they're not shipped here.

- [ ] Add invoice email send (Resend or Supabase Edge Function) — `supabase/functions/send-invoice/` Edge Function + `RESEND_API_KEY` secret. Cleanest design: webview generates PDF locally → uploads to `crm-files/<user_id>/invoices/...` → function emails the signed URL. Avoids re-rendering jsPDF in TS-on-Deno.
- [ ] Add recurring / template invoices — migration `0008_invoice_recurring.sql` adds `parent_invoice_id` / `recurrence` (RRULE subset) / `next_run_at` to `invoices` + a `crm_run_recurring_invoices()` Postgres function scheduled via `pg_cron` (daily 01:00 UTC). User must enable `pg_cron` in Supabase dashboard.
- [ ] Add a public client portal (token-based read-only invoice link) — migration `0009_invoice_share.sql` adds `share_token UUID UNIQUE` + `share_expires_at`. New RLS policy lets anon read tokenized invoices only. Public page is a separate static site (Vercel/Netlify/Cloudflare Pages) using the public anon key + token query param; the portal scaffold lives in `public-portal/` and deploys independently.

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
- [x] Convert `on:click` → `onclick` across all components (`AuthScreen`, `Dialog`, `AppLayout`, `Leads`, `Onboarding`) — done in Batch 5 cleanup pass.
- [x] Convert `on:submit` → `onsubmit` in `AuthScreen.svelte`
- [x] Convert `on:change` → `onchange` in `Tasks.svelte`
- [x] Convert `on:consider` / `on:finalize` → `onconsider` / `onfinalize` in `Leads.svelte`
- [x] Convert `<svelte:window on:keydown>` → `onkeydown` in `Dialog.svelte`
- [x] Fix self-closing `<div />` in `Onboarding.svelte`
- [x] Add `tabindex="-1"` to `<div role="dialog">` in `Dialog.svelte`
- [x] Add a keyboard handler for backdrop click in `Dialog.svelte`
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
