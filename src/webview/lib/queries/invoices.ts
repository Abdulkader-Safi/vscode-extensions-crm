import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";
import { patchInCaches } from "./pagination";

export type RecurrenceFreq = "weekly" | "monthly" | "quarterly" | "yearly";

export type InvoiceRecurrence = {
  freq: RecurrenceFreq;
  interval: number;
  until?: string | null; // YYYY-MM-DD
  count?: number | null;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  client_id: string | null;
  project_id: string | null;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total: number;
  currency: string;
  notes: string | null;
  paid_at: string | null;
  // Batch 12 — recurring/template invoices. `is_template = true` rows are
  // billing templates spawned daily by crm_run_recurring_invoices().
  is_template?: boolean;
  parent_invoice_id?: string | null;
  recurrence?: InvoiceRecurrence | null;
  next_run_at?: string | null;
  // Batch 14 — public client portal. When share_token is set the invoice is
  // viewable read-only at the portal URL until share_expires_at.
  share_token?: string | null;
  share_expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type InvoiceItem = {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  position: number;
};

export type InvoicePayload = Omit<Invoice, "id" | "created_at" | "updated_at">;

async function fetchInvoices(): Promise<Invoice[]> {
  if (!auth.user) {
    return [];
  }
  const { data, error } = await getSupabase()
    .from("invoices")
    .select("*")
    .eq("user_id", auth.user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data as Invoice[]) ?? [];
}

async function fetchInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  const { data, error } = await getSupabase()
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("position");
  if (error) {
    throw error;
  }
  return (data as InvoiceItem[]) ?? [];
}

export function useInvoicesQuery() {
  return createQuery<Invoice[], Error>({
    queryKey: qk.invoices(),
    queryFn: fetchInvoices,
  });
}

// Filter + sort shape consumed by the paginated list query.
// All fields optional; empty / undefined means "no filter on this dimension".
export type InvoiceListFilters = {
  status?: string;
  from?: string; // ISO date — issue_date lower bound (inclusive)
  to?: string; // ISO date — issue_date upper bound (inclusive)
  clientId?: string;
};
export type InvoiceListSortField = "invoice_number" | "issue_date" | "total";
export type InvoiceListSort = {
  field: InvoiceListSortField;
  direction: "asc" | "desc";
};

// Fetch invoice items on demand (e.g. PDF export) — we don't keep them
// in sync with the invoice list query.
export async function loadInvoiceItems(
  invoiceId: string,
): Promise<InvoiceItem[]> {
  return fetchInvoiceItems(invoiceId);
}

type UpdateCtx = {
  // Snapshot of every cache entry under qk.invoices() so we can roll back on
  // error. Each entry can be either a plain Invoice[] (fetch-all) or an
  // InfiniteData<Invoice[]> (paginated list); we restore whatever shape we
  // saw.
  snapshots: [readonly unknown[], unknown][];
};

// Save-invoice (upsert + replace items) — atomic via the `crm_save_invoice`
// plpgsql function (migrations/0008_invoice_save_fn.sql). The whole
// invoice-row + line-items replacement runs in a single Postgres transaction,
// so a mid-save failure can't leave an orphaned invoice or stale items.
export function useSaveInvoiceMutation() {
  const client = useQueryClient();
  return createMutation<
    string,
    Error,
    {
      editingId: string | null;
      payload: Omit<
        InvoicePayload,
        "user_id" | "subtotal" | "tax_amount" | "total"
      > & {
        subtotal: number;
        tax_amount: number;
        total: number;
      };
      items: InvoiceItem[];
    }
  >({
    mutationFn: async (vars) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const items = vars.items
        .filter((i) => i.description.trim())
        .map((i, idx) => ({
          description: i.description.slice(0, 500),
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          total: Number(i.quantity) * Number(i.unit_price),
          position: idx,
        }));
      const { data, error } = await getSupabase().rpc("crm_save_invoice", {
        p_invoice_id: vars.editingId,
        p_invoice: vars.payload,
        p_items: items,
      });
      if (error) {
        throw error;
      }
      return data as string;
    },
    onSettled: (invId) => {
      client.invalidateQueries({ queryKey: qk.invoices() });
      if (invId) {
        client.invalidateQueries({ queryKey: qk.invoiceItems(invId) });
      }
    },
  });
}

export function useUpdateInvoiceMutation() {
  const client = useQueryClient();
  return createMutation<
    Invoice,
    Error,
    { id: string; patch: Partial<Invoice> },
    UpdateCtx
  >({
    mutationFn: async (vars) => {
      const { data, error } = await getSupabase()
        .from("invoices")
        .update(vars.patch)
        .eq("id", vars.id)
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as Invoice;
    },
    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: qk.invoices() });
      // Snapshot every cache entry under ["invoices"] (fetch-all + every
      // paginated list variant). Each may have a different shape.
      const snapshots = client.getQueriesData({ queryKey: qk.invoices() }) as [
        readonly unknown[],
        unknown,
      ][];
      client.setQueriesData({ queryKey: qk.invoices() }, (old) =>
        patchInCaches(old, vars.id, vars.patch),
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        for (const [key, data] of ctx.snapshots) {
          client.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.invoices() });
    },
  });
}

// Email an invoice (Batch 13). The webview renders the PDF locally, uploads
// it to crm-files/<uid>/invoices/<id>.pdf via the shared `uploadInvoicePdf`
// helper, then invokes the `send-invoice` Edge Function which signs the URL
// and hands it to Resend.
//
// Friendly errors: when the function isn't deployed, supabase-js surfaces a
// FunctionsHttpError / FunctionsRelayError. We unwrap those into a single
// message the toast can render.
export function useSendInvoiceMutation() {
  const client = useQueryClient();
  return createMutation<
    { resend_id: string | null },
    Error,
    {
      invoiceId: string;
      pdfBytes: ArrayBuffer;
      recipient: string;
      subject?: string;
      body?: string;
    }
  >({
    mutationFn: async (vars) => {
      const supa = getSupabase();
      const { uploadInvoicePdf } = await import("../storage");
      await uploadInvoicePdf(vars.invoiceId, vars.pdfBytes);
      const { data, error } = await supa.functions.invoke("send-invoice", {
        body: {
          invoice_id: vars.invoiceId,
          recipient: vars.recipient,
          subject: vars.subject,
          body: vars.body,
        },
      });
      if (error) {
        // Edge Function error → unwrap. supabase-js attaches the raw body on
        // `error.context.response` for FunctionsHttpError; fall back to .message.
        const ctx = (error as { context?: { response?: Response } }).context;
        if (ctx?.response) {
          try {
            const j = await ctx.response.clone().json();
            throw new Error(j?.error ?? error.message);
          } catch {
            /* fall through */
          }
        }
        throw error;
      }
      return data as { resend_id: string | null };
    },
    onSuccess: () => {
      // Refresh communication_logs cache (client detail timelines etc).
      client.invalidateQueries({ queryKey: ["communication_logs"] });
    },
  });
}

// Share an invoice (Batch 14) — mints a share_token (or reuses the existing
// one) and sets share_expires_at. Returns the token so the route can build the
// portal URL. Authenticated UPDATE; RLS scopes it to the owner.
export function useShareInvoiceMutation() {
  const client = useQueryClient();
  return createMutation<
    { token: string; expiresAt: string | null },
    Error,
    { id: string; existingToken?: string | null; expiresAt: string | null }
  >({
    mutationFn: async (vars) => {
      const token = vars.existingToken ?? crypto.randomUUID();
      const { error } = await getSupabase()
        .from("invoices")
        .update({ share_token: token, share_expires_at: vars.expiresAt })
        .eq("id", vars.id);
      if (error) throw error;
      return { token, expiresAt: vars.expiresAt };
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.invoices() });
    },
  });
}

// Revoke a share link — clears token + expiry so the portal returns "not found".
export function useRevokeShareMutation() {
  const client = useQueryClient();
  return createMutation<void, Error, { id: string }>({
    mutationFn: async (vars) => {
      const { error } = await getSupabase()
        .from("invoices")
        .update({ share_token: null, share_expires_at: null })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.invoices() });
    },
  });
}

// Delete uses the centralized softDelete() helper in src/webview/lib/softDelete.ts.
