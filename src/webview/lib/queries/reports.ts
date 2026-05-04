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
  due_date: string | null;
  client_id: string | null;
  project_id: string | null;
  invoice_number: string;
  currency: string;
};
export type ReportExpense = {
  id: string;
  amount: number;
  expense_date: string;
  category: string;
  project_id: string | null;
  currency: string;
};
export type ReportClient = { id: string; name: string };
export type ReportProject = { id: string; name: string };
export type ReportTimeEntry = {
  id: string;
  project_id: string | null;
  duration_minutes: number | null;
};

export type ReportsData = {
  invoices: ReportInvoice[];
  expenses: ReportExpense[];
  clients: ReportClient[];
  projects: ReportProject[];
  timeEntries: ReportTimeEntry[];
};

async function fetchReports(): Promise<ReportsData> {
  if (!auth.user) {
    return {
      invoices: [],
      expenses: [],
      clients: [],
      projects: [],
      timeEntries: [],
    };
  }
  const supa = getSupabase();
  const [i, e, c, p, t] = await Promise.all([
    supa
      .from("invoices")
      .select("*")
      .eq("user_id", auth.user.id)
      .is("deleted_at", null),
    supa
      .from("expenses")
      .select("*")
      .eq("user_id", auth.user.id)
      .is("deleted_at", null),
    supa
      .from("clients")
      .select("id,name")
      .eq("user_id", auth.user.id)
      .is("deleted_at", null),
    supa
      .from("projects")
      .select("id,name")
      .eq("user_id", auth.user.id)
      .is("deleted_at", null),
    supa
      .from("time_entries")
      .select("id,project_id,duration_minutes")
      .eq("user_id", auth.user.id),
  ]);
  return {
    invoices: (i.data as ReportInvoice[]) ?? [],
    expenses: (e.data as ReportExpense[]) ?? [],
    clients: (c.data as ReportClient[]) ?? [],
    projects: (p.data as ReportProject[]) ?? [],
    timeEntries: (t.data as ReportTimeEntry[]) ?? [],
  };
}

export function useReportsQuery() {
  return createQuery<ReportsData, Error>({
    queryKey: qk.reports(),
    queryFn: fetchReports,
  });
}
