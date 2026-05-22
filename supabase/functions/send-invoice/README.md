# send-invoice — Supabase Edge Function

Emails an invoice to a recipient via [Resend](https://resend.com). vs-crm calls it from the webview's "Email" button on each invoice row.

## How it works

1. Webview renders the PDF locally (jsPDF) and uploads it to
   `crm-files/<user_id>/invoices/<invoice_id>.pdf`.
2. Webview invokes this function with `{ invoice_id, recipient, subject?, body? }`.
3. Function authenticates the caller via their JWT, loads the invoice
   RLS-scoped, mints a 24-hour signed URL for the PDF, and POSTs to Resend.
4. Function logs the send into `communication_logs`.

No PDF rendering happens inside Deno — that's deliberate. jsPDF is bulky and the user's machine already has the data; running it in the Edge would only add cold-start latency.

## One-time deploy (per Supabase project)

You need the [Supabase CLI](https://supabase.com/docs/guides/cli) and a [Resend](https://resend.com) account.

```bash
# 1. Sign up at resend.com and verify a sending domain (or use the
#    onboarding@resend.dev sandbox for testing). Grab an API key.

# 2. Link this repo to your Supabase project (one-time):
supabase link --project-ref <your-project-ref>

# 3. Set secrets:
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
# Optional — defaults to onboarding@resend.dev. For production set a verified
# sender on your domain, e.g. invoices@yourdomain.com:
supabase secrets set RESEND_FROM=invoices@yourdomain.com

# 4. Deploy the function:
supabase functions deploy send-invoice

# 5. Verify (replace <project-ref> + <jwt>):
curl -X POST \
  https://<project-ref>.supabase.co/functions/v1/send-invoice \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"invoice_id":"<uuid>","recipient":"you@example.com"}'
```

## Free-tier notes

- **Resend free**: 3,000 emails/month, 100/day. Enough for any reasonable solo CRM workload. If you outgrow it, Resend's paid tier starts at $20/mo.
- **Supabase Edge Functions free**: 500K invocations/month + 2M CPU-seconds/month. Each email is ~1 invocation, well within bounds.

## What happens if you skip deploy?

The webview detects a 404 / network error from `supabase.functions.invoke('send-invoice', ...)` and surfaces a friendly toast: "Email not configured — see docs". The button stays visible but doesn't crash anything.

## Local testing

```bash
supabase functions serve send-invoice --env-file .env.local
# In .env.local:
#   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
#   RESEND_FROM=onboarding@resend.dev
```

Hit `http://127.0.0.1:54321/functions/v1/send-invoice` with the JWT from your active webview session (DevTools → Application → SecretStorage will not show this, but supabase-js exposes `supabase.auth.getSession()`).

## Troubleshooting

| Error from the function | Likely cause |
|---|---|
| `"Resend not configured — set RESEND_API_KEY..."` | Secret never got set. Re-run step 3. |
| `"could not sign PDF URL"` | The webview didn't upload the PDF first, or your `crm-files` bucket policy isn't permissive enough. Check `0005_storage.sql` ran. |
| `"Resend rejected the email (422)"` | Sender (`RESEND_FROM`) isn't verified on your Resend account. Either switch to `onboarding@resend.dev` for testing or verify the domain. |
| `"invalid or expired token"` | The user signed out between clicking Email and the function call. Retry. |
