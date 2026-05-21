import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";

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

// Fetch invoice items on demand (e.g. PDF export) — we don't keep them
// in sync with the invoice list query.
export async function loadInvoiceItems(
  invoiceId: string,
): Promise<InvoiceItem[]> {
  return fetchInvoiceItems(invoiceId);
}

type UpdateCtx = { previous: Invoice[] };

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
      const previous = client.getQueryData<Invoice[]>(qk.invoices()) ?? [];
      client.setQueryData<Invoice[]>(qk.invoices(), (old) =>
        (old ?? []).map((i) =>
          i.id === vars.id ? { ...i, ...vars.patch } : i,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        client.setQueryData(qk.invoices(), ctx.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.invoices() });
    },
  });
}

// Delete uses the centralized softDelete() helper in src/webview/lib/softDelete.ts.
