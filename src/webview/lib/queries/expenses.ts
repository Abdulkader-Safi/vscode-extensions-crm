import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { qk } from "./keys";

export type Expense = {
  id: string;
  category: string;
  amount: number;
  vendor: string | null;
  description: string | null;
  expense_date: string;
  currency: string;
  project_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExpenseInsert = Omit<Expense, "id" | "created_at" | "updated_at">;

async function fetchExpenses(): Promise<Expense[]> {
  if (!auth.user) {
    return [];
  }
  const { data, error } = await getSupabase()
    .from("expenses")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("expense_date", { ascending: false });
  if (error) {
    throw error;
  }
  return (data as Expense[]) ?? [];
}

export function useExpensesQuery() {
  return createQuery<Expense[], Error>({
    queryKey: qk.expenses(),
    queryFn: fetchExpenses,
  });
}

type CreateCtx = { previous: Expense[]; optimisticId: string };
type DeleteCtx = { previous: Expense[] };

export function useCreateExpenseMutation() {
  const client = useQueryClient();
  return createMutation<
    Expense,
    Error,
    Omit<ExpenseInsert, "user_id">,
    CreateCtx
  >({
    mutationFn: async (payload) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const { data, error } = await getSupabase()
        .from("expenses")
        .insert({ ...payload, user_id: auth.user.id })
        .select()
        .single();
      if (error) {
        throw error;
      }
      return data as Expense;
    },
    onMutate: async (payload) => {
      await client.cancelQueries({ queryKey: qk.expenses() });
      const previous = client.getQueryData<Expense[]>(qk.expenses()) ?? [];
      const optimistic = {
        id: `optimistic-${crypto.randomUUID()}`,
        ...payload,
        created_at: new Date().toISOString(),
      } as Expense;
      client.setQueryData<Expense[]>(qk.expenses(), [optimistic, ...previous]);
      return { previous, optimisticId: optimistic.id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        client.setQueryData(qk.expenses(), ctx.previous);
      }
    },
    onSuccess: (real, _vars, ctx) => {
      client.setQueryData<Expense[]>(qk.expenses(), (old) =>
        (old ?? []).map((e) => (e.id === ctx?.optimisticId ? real : e)),
      );
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.expenses() });
    },
  });
}

export function useDeleteExpenseMutation() {
  const client = useQueryClient();
  return createMutation<string, Error, string, DeleteCtx>({
    mutationFn: async (id) => {
      const { error } = await getSupabase()
        .from("expenses")
        .delete()
        .eq("id", id);
      if (error) {
        throw error;
      }
      return id;
    },
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: qk.expenses() });
      const previous = client.getQueryData<Expense[]>(qk.expenses()) ?? [];
      client.setQueryData<Expense[]>(
        qk.expenses(),
        previous.filter((e) => e.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx) {
        client.setQueryData(qk.expenses(), ctx.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.expenses() });
    },
  });
}
