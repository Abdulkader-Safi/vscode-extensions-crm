// Supabase Edge Function — POST /functions/v1/send-invoice
//
// Emails an invoice to a recipient via Resend. The webview already generated
// the PDF locally and uploaded it to crm-files/<user_id>/invoices/<invoice_id>.pdf
// before calling this function, so all we do here is mint a signed URL for the
// upload, hand both the URL and a small HTML body to Resend, and log the send
// against communication_logs.
//
// Auth model: the user's JWT is forwarded in the Authorization header.
// We build a Supabase client bound to that JWT so every DB read here is
// RLS-scoped to the caller — the function can't email someone else's invoice
// even if invoice_id is forged.
//
// Required Supabase secrets:
//   RESEND_API_KEY      — set via `supabase secrets set RESEND_API_KEY=...`
//   RESEND_FROM (opt.)  — fallback sender; defaults to 'onboarding@resend.dev'

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24h
const BUCKET = "crm-files";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface RequestBody {
  invoice_id: string;
  recipient: string;
  subject?: string;
  body?: string; // optional plain-text body the user typed in the dialog
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, content-type, x-client-info, apikey",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true }, 200);
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return json({ error: "missing bearer token" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !anonKey) {
    return json(
      { error: "function not configured (missing SUPABASE_URL/ANON_KEY)" },
      500,
    );
  }
  if (!resendKey) {
    return json(
      {
        error:
          "Resend not configured — set RESEND_API_KEY via `supabase secrets set`",
      },
      500,
    );
  }

  let payload: RequestBody;
  try {
    payload = (await req.json()) as RequestBody;
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (!payload.invoice_id || !payload.recipient) {
    return json({ error: "invoice_id and recipient are required" }, 400);
  }
  // Cheap email format guard. Resend will reject malformed addresses anyway,
  // but a 400 here gives a better error to the webview.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.recipient)) {
    return json({ error: "recipient is not a valid email" }, 400);
  }

  const supa = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { data: userRes, error: userErr } = await supa.auth.getUser();
  if (userErr || !userRes.user) {
    return json({ error: "invalid or expired token" }, 401);
  }
  const userId = userRes.user.id;

  // Load the invoice RLS-scoped to the caller.
  const { data: invoice, error: invErr } = await supa
    .from("invoices")
    .select("id, invoice_number, total, currency, status, client_id, user_id")
    .eq("id", payload.invoice_id)
    .maybeSingle();
  if (invErr) return json({ error: invErr.message }, 500);
  if (!invoice) return json({ error: "invoice not found" }, 404);

  // Mint a signed URL for the PDF the webview already uploaded.
  const path = `${userId}/invoices/${invoice.id}.pdf`;
  const { data: signed, error: signErr } = await supa.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed) {
    return json(
      {
        error:
          "could not sign PDF URL — make sure the extension uploaded the PDF before invoking this function",
        detail: signErr?.message,
      },
      502,
    );
  }

  // Build the email body. Keep it short — the user can override via `body`.
  const from = Deno.env.get("RESEND_FROM") ?? "onboarding@resend.dev";
  const subject =
    payload.subject?.trim() || `Invoice ${invoice.invoice_number}`;
  const userBody = (payload.body ?? "").trim();
  const html = `<!doctype html><meta charset="utf-8">
<div style="font:14px -apple-system,system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto">
  ${userBody ? `<p style="white-space:pre-wrap">${escapeHtml(userBody)}</p>` : ""}
  <p>You can download <strong>Invoice ${escapeHtml(invoice.invoice_number)}</strong> here (link valid for 24 hours):</p>
  <p><a href="${signed.signedUrl}" style="display:inline-block;background:#6b46f1;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">View invoice PDF</a></p>
  <p style="font-size:12px;color:#666">If the button doesn't work, copy this URL: ${signed.signedUrl}</p>
</div>`;

  const sendRes = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.recipient],
      subject,
      html,
    }),
  });
  if (!sendRes.ok) {
    const text = await sendRes.text().catch(() => "");
    return json(
      { error: `Resend rejected the email (${sendRes.status})`, detail: text },
      502,
    );
  }
  const sendJson = (await sendRes.json().catch(() => ({}))) as { id?: string };

  // Best-effort: log the send. Don't fail the whole call if this insert errors —
  // the email has already gone out. Columns match the communication_logs
  // schema (type/title/content), not a channel/direction shape.
  await supa.from("communication_logs").insert({
    user_id: userId,
    client_id: invoice.client_id,
    type: "email",
    title: `Invoice ${invoice.invoice_number} emailed`,
    content: `Sent to ${payload.recipient}${
      subject ? ` — "${subject}"` : ""
    }${sendJson.id ? ` (resend id ${sendJson.id})` : ""}`,
  });

  return json({
    ok: true,
    resend_id: sendJson.id ?? null,
    signed_url: signed.signedUrl,
  });
});
