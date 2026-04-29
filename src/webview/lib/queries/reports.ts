import { createQuery } from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";

export type ReportInvoice = {
  id: string;
  status: string;
  total: number;
  paid_at: string | null;
  issue_date: string;
  client_id: string | null;
  invoice_number: string;
};
export type ReportExpense = {
  id: string;
  amount: number;
  expense_date: string;
  category: string;
};
export type ReportClient = { id: string; name: string };

export type ReportsData = {
  invoices: ReportInvoice[];
  expenses: ReportExpense[];
  clients: ReportClient[];
};

async function fetchReports(): Promise<ReportsData> {
  if (!auth.user) {
    return { invoices: [], expenses: [], clients: [] };
  }
  const supa = getSupabase();
  const [i, e, c] = await Promise.all([
    supa.from("invoices").select("*").eq("user_id", auth.user.id),
    supa.from("expenses").select("*").eq("user_id", auth.user.id),
    supa.from("clients").select("id,name").eq("user_id", auth.user.id),
  ]);
  return {
    invoices: (i.data as ReportInvoice[]) ?? [],
    expenses: (e.data as ReportExpense[]) ?? [],
    clients: (c.data as ReportClient[]) ?? [],
  };
}

export function useReportsQuery() {
  return createQuery<ReportsData, Error>({
    queryKey: qk.reports(),
    queryFn: fetchReports,
  });
}
