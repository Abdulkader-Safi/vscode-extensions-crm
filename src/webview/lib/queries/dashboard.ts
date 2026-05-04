import { createQuery } from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";

export type Activity = {
  kind: "client" | "invoice" | "task";
  id: string;
  label: string;
  created_at: string;
};

export type DashboardData = {
  stats: { clients: number; projects: number; unpaid: number; revenue: number };
  activity: Activity[];
};

async function fetchDashboard(): Promise<DashboardData> {
  if (!auth.user) {
    return {
      stats: { clients: 0, projects: 0, unpaid: 0, revenue: 0 },
      activity: [],
    };
  }
  const supa = getSupabase();
  const userId = auth.user.id;

  const [clientsRes, projectsRes, invoicesRes] = await Promise.all([
    supa
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("deleted_at", null),
    supa
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("status", ["planning", "in_progress"]),
    supa
      .from("invoices")
      .select("status, total, paid_at, created_at")
      .eq("user_id", userId)
      .is("deleted_at", null),
  ]);

  const inv = (invoicesRes.data ?? []) as Array<{
    status: string;
    total: number;
    paid_at: string | null;
    created_at: string;
  }>;
  const unpaid = inv
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + Number(i.total), 0);
  const startMonth = new Date();
  startMonth.setDate(1);
  startMonth.setHours(0, 0, 0, 0);
  const revenue = inv
    .filter(
      (i) =>
        i.status === "paid" && i.paid_at && new Date(i.paid_at) >= startMonth,
    )
    .reduce((s, i) => s + Number(i.total), 0);

  const [recentClients, recentInvoices, recentTasks] = await Promise.all([
    supa
      .from("clients")
      .select("id,name,created_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supa
      .from("invoices")
      .select("id,invoice_number,total,status,created_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supa
      .from("tasks")
      .select("id,title,status,created_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const activity: Activity[] = [
    ...(recentClients.data ?? []).map((x) => ({
      kind: "client" as const,
      id: x.id,
      label: `Added client ${x.name}`,
      created_at: x.created_at,
    })),
    ...(recentInvoices.data ?? []).map((x) => ({
      kind: "invoice" as const,
      id: x.id,
      label: `Invoice ${x.invoice_number} — ${x.status}`,
      created_at: x.created_at,
    })),
    ...(recentTasks.data ?? []).map((x) => ({
      kind: "task" as const,
      id: x.id,
      label: `Task: ${x.title}`,
      created_at: x.created_at,
    })),
  ]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 8);

  return {
    stats: {
      clients: clientsRes.count ?? 0,
      projects: projectsRes.count ?? 0,
      unpaid,
      revenue,
    },
    activity,
  };
}

export function useDashboardQuery() {
  return createQuery<DashboardData, Error>({
    queryKey: qk.dashboard(),
    queryFn: fetchDashboard,
  });
}
