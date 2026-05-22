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
- [x] Add pagination or virtualization to all list tables — Batch 11: five list routes (Clients/Invoices/Expenses/Projects/Tasks) now use `createInfiniteQuery` with server-side filters + sort via `.eq()/.gte()/.lte()/.order()/.range()`. New helpers in `src/webview/lib/queries/pagination.ts` (`PAGE_SIZE=50`, `derivedStore`, shape-aware cache helpers). Each list hook accepts a Svelte store of `{ filters, sort }` so changing them refetches from page 0. Mutations migrate to `setQueriesData` with shape-aware patches so plain `T[]` (legacy fetch-all) and `InfiniteData<T[]>` variants both update. Leads stays non-paginated (kanban needs the full board). New aggregates query `useExpenseTotalsQuery` keeps the StatCards correct across pages. Distinct-tags query keeps the Clients chip strip complete. Tasks priority sort degrades to alphabetical (high/low/medium/urgent) — documented inline; rank-by-urgency would need a generated column.

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

- [x] Add invoice email send (Resend or Supabase Edge Function) — Batch 13: `supabase/functions/send-invoice/index.ts` (Deno) authenticates the caller's JWT, loads the invoice RLS-scoped, mints a 24h signed URL for the PDF the webview pre-uploaded to `crm-files/<uid>/invoices/<id>.pdf`, POSTs to Resend, logs a `communication_logs` row. Webview: new `uploadInvoicePdf` storage helper + `useSendInvoiceMutation` (renders PDF locally → uploads → invokes function, unwrapping Edge errors into friendly toasts). Email icon on each invoice row opens a dialog (recipient pre-filled from `client.email`, subject, optional message); on success a draft auto-flips to "sent". Friendly "Email not configured" toast when the function isn't deployed. Deploy steps + Resend free-tier notes in `supabase/functions/send-invoice/README.md`.
- [x] Add recurring / template invoices — Batch 12: `migrations/0009_invoice_recurring.sql` adds `is_template` / `parent_invoice_id` / `recurrence` (RRULE subset: freq/interval/until/count) / `next_run_at` columns + a partial index for the cron probe. New `crm_run_recurring_invoices()` plpgsql function clones due templates (suffixes the invoice_number with the run date for uniqueness, copies items, advances next_run_at per the recurrence rule, stops at until/count). `cron.schedule('vscrm-recurring-invoices', '0 1 * * *', ...)` wrapped in a DO block that gracefully NOTICEs when pg_cron isn't enabled. `crm_save_invoice` re-created to also persist the recurring fields. Invoices editor gets a "Recurring invoice (template)" toggle that reveals frequency / interval / end (Never|Until|Count) pickers. 🔁 badge surfaces on template rows in the list. Reports cash-flow projection now skips templates so their children appear under "outstanding" without double-counting.
- [ ] Add a public client portal (token-based read-only invoice link) — migration `0009_invoice_share.sql` adds `share_token UUID UNIQUE` + `share_expires_at`. New RLS policy lets anon read tokenized invoices only. Public page is a separate static site (Vercel/Netlify/Cloudflare Pages) using the public anon key + token query param; the portal scaffold lives in `public-portal/` and deploys independently.

## Logic / flow issues

### Correctness

- [x] Wrap each migration's statements atomically — Batch 8: orchestrator now sends each migration body as one `_vscrm_exec_sql` call. PostgREST wraps the call in a transaction; `EXECUTE` inside the plpgsql helper runs all statements in that transaction, so any mid-migration failure rolls back the whole file. Explicit BEGIN/COMMIT can't go inside the helper (plpgsql forbids transaction control), but the implicit transaction is enough. `splitSqlStatements` + tests deleted as the orchestrator no longer chunks.
- [x] Add `IF NOT EXISTS` / `OR REPLACE` to every `CREATE` in migrations — Batch 8: `0001_schema.sql` now uses `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS … ; CREATE POLICY …`, `DROP TRIGGER IF EXISTS … ; CREATE TRIGGER …`, `CREATE INDEX IF NOT EXISTS`. `0004_invoice_unique.sql` wraps `ADD CONSTRAINT` in a `pg_constraint` existence check.
- [x] Move `CREATE TABLE IF NOT EXISTS public._vscrm_migrations(...)` to top of `0001_schema.sql`
- [x] Delete `migrations/0003_vsccrm_tracking.sql`
- [x] Remove the special-case branches for `0003` in `runMigrations()`
- [x] ~~Move `clearServiceRoleKey()` into the orchestrator success path (don't wait for `boot/finalize`)~~ — reversed: we no longer clear the service-role key at all. It persists in SecretStorage so `applyPendingMigrations` can run on activate. Tradeoff: persistent elevated key vs. zero-friction upgrades.
- [x] Wrap invoice + line-item save in a Postgres function — Batch 8: `migrations/0008_invoice_save_fn.sql` adds `crm_save_invoice(p_invoice_id UUID, p_invoice JSONB, p_items JSONB) RETURNS UUID`. Replaces the 3-step Supabase mutation in `useSaveInvoiceMutation()` with one rpc call. SECURITY INVOKER + RLS enforces ownership.
- [x] Add `UNIQUE(user_id, invoice_number)` constraint in a new migration
- [x] Surface a friendly "duplicate invoice number" error in the UI — `Invoices.svelte:222–230` `invoiceSaveErrorMessage()` detects Postgres `23505` and shows "Invoice number already in use — pick another." Works the same with the new rpc-based mutation since supabase-js preserves `error.code`.
- [x] Fix Expenses "This month" calc — use current `YYYY-MM` key, not `monthlyMap[0]`

### UX / inconsistency

- [x] ~~Test CSV download (Reports) in Extension Dev Host — verify CSP allows `blob:`~~ — superseded by Batch 8: CSV no longer uses `blob:`. Goes through `files/save-file` IPC → `showSaveDialog` + `workspace.fs.writeFile`. CSP-independent.
- [x] ~~Test PDF download (Invoices) in Extension Dev Host — verify CSP allows `blob:`~~ — superseded: PDF takes the same IPC path (`jsPDF.output('arraybuffer')` → base64 → host writes file).
- [x] Send bytes via IPC and save with `vscode.workspace.fs.writeFile` + `showSaveDialog` — Batch 8: new `files/save-file` request type in `src/shared/messages.ts`, handler in `WebviewProvider.ts`, webview helpers `saveTextFile` + `saveBinaryFile` in `src/webview/lib/saveFile.ts`. Wired into Reports CSV export and Invoices PDF export (both row-level and from inside the preview dialog).
- [x] Build a `<ConfirmDialog>` component on top of `<Dialog>` — already shipped pre-Batch-8: `src/webview/lib/components/ui/ConfirmDialog.svelte` + imperative `confirm()` helper at `src/webview/lib/confirm.svelte.ts`. Adopted in Trash/Clients/Invoices/Expenses delete flows. TODO entry was stale.
- [x] Replace `confirm()` in Clients delete
- [x] Replace `confirm()` in Projects delete
- [x] Replace `confirm()` in Tasks delete
- [x] Replace `confirm()` in Invoices delete
- [x] Replace `confirm()` in Expenses delete
- [x] Replace `confirm()` in Leads delete (bonus)
- [x] Add a "I added the redirect URI to Supabase" checkbox before completing onboarding — Batch 9: welcome step in `Onboarding.svelte` now gates the "Get started" button on a `redirectUriAcknowledged` checkbox right beneath the URI display row. State persists across `Back` from later steps.

### Cleanup

- [x] Move bootstrap snippet to `src/shared/bootstrapSnippet.ts`
- [x] ~~Import shared snippet from `src/extension/bootstrap/migrations.ts`~~ — stale: `migrations.ts` never consumed the snippet (it only loads `.sql` migration files via esbuild's text loader). The snippet is used only by the onboarding UI, which already imports from `src/shared/bootstrapSnippet.ts`. The file's header comment (lines 3-4) already documents this.
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
- [x] Document why `0002_revoke.sql` revokes execute on trigger-only functions (or remove) — Batch 9: file now opens with a comment block explaining defense-in-depth rationale (trigger-only functions; `handle_new_user` is SECURITY DEFINER and writes to `profiles`; REVOKE is idempotent so safe to re-run).
- [x] ~~Document why `splitSqlStatements` handles nested dollar-quotes (or simplify)~~ — stale: file deleted in Batch 8 (orchestrator now sends each migration body as one EXECUTE; no client-side splitting needed).

## Quick wins (each under 30 min) — all done

- [x] Move bootstrap snippet to `src/shared/`
- [x] Delete dead imports + `notifyAuthTokens` + `"verify"` step
- [x] Add `UNIQUE(user_id, invoice_number)` constraint
- [x] Replace `confirm()` with Dialog
- [x] Fix Expenses "This month" calc
- [x] Move `clearServiceRoleKey()` into orchestrator
- [x] Inline migration tracking into `0001`, delete `0003`
