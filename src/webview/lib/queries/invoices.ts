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

// Save-invoice (upsert + replace items) — invoice + line items committed
// together. Failure mode: items insert is best-effort; UI shows server error
// and refetches. Wrapping in a Postgres function is a TODO follow-up.
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
      const supa = getSupabase();
      const fullPayload = { ...vars.payload, user_id: auth.user.id };
      let invId = vars.editingId;
      if (vars.editingId) {
        const { error } = await supa
          .from("invoices")
          .update(fullPayload)
          .eq("id", vars.editingId);
        if (error) {
          throw error;
        }
        await supa
          .from("invoice_items")
          .delete()
          .eq("invoice_id", vars.editingId);
      } else {
        const { data, error } = await supa
          .from("invoices")
          .insert(fullPayload)
          .select()
          .single();
        if (error) {
          throw error;
        }
        invId = data.id;
      }
      if (invId) {
        const rows = vars.items
          .filter((i) => i.description.trim())
          .map((i, idx) => ({
            user_id: auth.user!.id,
            invoice_id: invId,
            description: i.description.slice(0, 500),
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price),
            total: Number(i.quantity) * Number(i.unit_price),
            position: idx,
          }));
        if (rows.length) {
          const { error } = await supa.from("invoice_items").insert(rows);
          if (error) {
            throw error;
          }
        }
      }
      return invId!;
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
