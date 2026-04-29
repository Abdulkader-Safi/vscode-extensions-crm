import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/svelte-query";
import { getSupabase } from "../supabase";
import { auth } from "../stores/auth.svelte";
import { profile as profileStore } from "../stores/profile.svelte";
import { qk } from "./keys";

export type Profile = {
  id: string;
  display_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  brand_color: string;
  currency: string;
  tax_rate: number;
  language: string;
};

async function fetchProfile(): Promise<Profile | null> {
  if (!auth.user) {
    return null;
  }
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data as Profile) ?? null;
}

export function useProfileQuery() {
  return createQuery<Profile | null, Error>({
    queryKey: qk.profile(),
    queryFn: fetchProfile,
  });
}

type Ctx = { previous: Profile | undefined };

// Mirrors the existing `profile` rune store so legacy reads keep working —
// hooks invalidate the query *and* refresh the store.
export function useUpdateProfileMutation() {
  const client = useQueryClient();
  return createMutation<Profile, Error, Partial<Profile>, Ctx>({
    mutationFn: async (patch) => {
      if (!auth.user) {
        throw new Error("Not authenticated");
      }
      const { data, error } = await getSupabase()
        .from("profiles")
        .upsert({ id: auth.user.id, ...patch })
        .select()
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data as Profile;
    },
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: qk.profile() });
      const previous = client.getQueryData<Profile>(qk.profile());
      if (previous) {
        client.setQueryData<Profile>(qk.profile(), { ...previous, ...patch });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        client.setQueryData(qk.profile(), ctx.previous);
      }
    },
    onSuccess: (real) => {
      // Keep the legacy rune store in sync so consumers reading `profile.profile`
      // see the new value without restructuring the route.
      if (real) {
        profileStore.profile = real;
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.profile() });
    },
  });
}
