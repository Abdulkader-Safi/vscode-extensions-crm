# Changelog

All notable changes to **vs-crm** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] — Unreleased

### Added
- Initial release.
- Onboarding flow: paste Supabase URL + anon + service_role keys, auto-apply schema migrations, drop the helper function and discard the service_role key on success.
- Auth: email/password, magic link, OAuth (Google, GitHub) via `vscode://abdulkadersafi.vs-crm/auth-callback` URI handler.
- Persistent sessions via VS Code `SecretStorage` (proxied to the webview through IPC).
- Modules: Dashboard, Clients, Leads (kanban), Projects, Tasks (with timer + time entries), Invoices (with jsPDF export), Expenses, Reports (Chart.js), Settings.
- Theming: Tailwind v4 tokens bound to `--vscode-*` CSS variables; light, dark, and high-contrast themes inherit automatically.
- Themed `<ConfirmDialog>` replacing browser `confirm()` everywhere.
- `UNIQUE(user_id, invoice_number)` constraint with friendly duplicate-number error message.
