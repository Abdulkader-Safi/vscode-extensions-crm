# vs-crm

A complete CRM that runs **inside VS Code**, on top of **your own Supabase project**. Manage clients, leads, projects, tasks, time, invoices (with PDF), expenses, and reports — without ever leaving the editor.

Your data stays in your Supabase project. The extension never sees a third-party server.

### Setup walkthrough (video)

[![Watch the vs-crm + Supabase setup walkthrough on YouTube](https://img.youtube.com/vi/QR_4xnOcwzI/maxresdefault.jpg)](https://www.youtube.com/watch?v=QR_4xnOcwzI)

## Features

- **Dashboard** — at-a-glance metrics: clients, active projects, unpaid invoices, monthly revenue, recent activity.
- **Clients** — CRUD with tags, search, contact info, communication history.
- **Leads** — Kanban pipeline (New → Contacted → Proposal → Won / Lost) with drag-and-drop.
- **Projects** — Linked to clients, status tracking, budget, dates.
- **Tasks** — List view with priority, status, due dates, and a built-in time tracker that writes to `time_entries`.
- **Invoices** — Line-item editor, tax/discount, status (draft/sent/paid/overdue), branded PDF export via `jsPDF`.
- **Expenses** — Categorized cost tracking, monthly aggregates, project allocation.
- **Reports** — Revenue vs. expenses (last 6 months), top clients, CSV export.
- **Settings** — Profile, currency, default tax rate, brand color (used on PDFs).
- **Auth** — Email/password, magic link, and OAuth (Google, GitHub) all routed back to VS Code via a custom URI handler.
- **Native theming** — Tailwind tokens bound to `--vscode-*` CSS variables. Light, dark, and high-contrast themes inherit automatically.

## Getting started

### 1. Install

Install **vs-crm** from the VS Code Marketplace, or via the command line:

```bash
code --install-extension abdulkadersafi.vs-crm
```

### 2. Create (or open) a Supabase project

You'll need:

- The **Project URL** (`https://xxxxx.supabase.co`)
- The **anon (public) key**
- The **service_role key** (used **once** during onboarding, then discarded)

Find them in your Supabase dashboard under **Settings → API**.

### 3. Run the onboarding

Open the Command Palette and run **`vs-crm: Open`**. The extension walks you through:

1. Pasting your Supabase URL + anon key + service_role key.
2. Pasting a small SQL helper into the Supabase SQL Editor (one-time, the extension drops it for you when bootstrap finishes).
3. Auto-applying the schema migrations (clients, projects, tasks, invoices, etc., all with row-level security).
4. Signing in to your new account.

### 4. Add the redirect URI to Supabase

Before magic-link or OAuth sign-in will work, you must add this exact URI to your Supabase project's **Authentication → URL Configuration → Redirect URLs**:

```
vscode://abdulkadersafi.vs-crm/auth-callback
```

The onboarding screen displays this with a Copy button.

For Google / GitHub OAuth, also configure the provider in **Authentication → Providers** with your own OAuth client IDs.

## Why your own Supabase?

Most CRMs lock you into their database. vs-crm gives you full ownership: you can query the tables directly with `psql`, back them up however you like, run other tools against them, and the extension never proxies your data.

## Why is there a GitHub Pages site for OAuth?

vs-crm uses **Supabase's Management API OAuth** (PKCE) to power the 1-click "Continue with Supabase" onboarding — the same pattern Lovable and other Supabase integrations use. This is separate from the end-user sign-in flow inside your CRM (magic links / Google / GitHub), which still uses the normal `vscode://abdulkadersafi.vs-crm/auth-callback` URI handler.

Supabase's Management OAuth (`https://api.supabase.com/v1/oauth/*`) — unlike Supabase Auth — **requires an HTTPS redirect URI**. It rejects both custom URI schemes (`vscode://…`) and plain HTTP loopback (`http://127.0.0.1:…`). VS Code extensions can't host HTTPS endpoints, so we use the standard native-app workaround:

1. We host a tiny static HTML page on GitHub Pages at [vs-crm-oauth.abdulkadersafi.com](https://vs-crm-oauth.abdulkadersafi.com) (or the equivalent `*.github.io` URL).
2. Supabase redirects the browser there after the user approves the consent screen, with `?code=…&state=…`.
3. The page reads those query params and immediately deep-links to `vscode://abdulkadersafi.vs-crm/oauth-callback?code=…&state=…`.
4. VS Code's URI handler catches it, the extension exchanges the code for tokens at Supabase's token endpoint, and we're authorized.

The bouncer page has **no backend** and reads no data — it's a 50-line HTML file. The source lives in [`docs/oauth-callback/index.html`](./docs/oauth-callback/index.html) in this repo and is served by GitHub Pages straight from the same repo's `/docs` folder. You can audit it before authorizing.

This pattern is used by GitHub Desktop, Linear, Raycast, and most other native Supabase integrations — it's the standard solution to OAuth providers that don't trust loopback URIs.

## Schema

The extension provisions:

- `profiles` — user metadata (currency, tax rate, brand color, etc.)
- `clients`, `leads`, `projects`, `tasks`, `time_entries`
- `invoices`, `invoice_items`, `expenses`
- `communication_logs`, `notifications`
- `_vscrm_migrations` — internal, tracks applied migrations

All user data is row-level security-scoped to `auth.uid() = user_id`.

## Reset

Need to start over (different Supabase project, etc.)? Run **`vs-crm: Reset Onboarding`**. This clears your stored credentials in VS Code's `SecretStorage` but **does not touch the data in your Supabase project** — drop tables manually if you want a clean slate there.

## Development

```bash
git clone <this-repo>
cd vs-crm
npm install
npm run watch       # esbuild watch + svelte-check watch
# In VS Code, press F5 to launch the Extension Development Host
```

OAuth and magic-link callbacks require the extension to be **installed** (not just running in the dev host). Build a `.vsix` with `vsce package` and `code --install-extension vs-crm-*.vsix` to test those flows end-to-end.

## License

MIT — see [LICENSE](./LICENSE).
