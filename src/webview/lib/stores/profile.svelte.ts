import { getSupabase } from "../supabase";
import { auth } from "./auth.svelte";

type Profile = {
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

class ProfileStore {
  profile = $state<Profile | null>(null);
  loading = $state(false);

  async load() {
    if (!auth.user) {
      this.profile = null;
      return;
    }
    this.loading = true;
    const { data, error } = await getSupabase()
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .maybeSingle();
    this.loading = false;
    if (error) {
      console.error("[vs-crm] profile load error:", error);
      return;
    }
    this.profile = data as Profile | null;
  }

  async update(patch: Partial<Profile>) {
    if (!auth.user) return;
    const { data, error } = await getSupabase()
      .from("profiles")
      .upsert({ id: auth.user.id, ...patch })
      .select()
      .maybeSingle();
    if (error) throw error;
    this.profile = data as Profile;
  }

  get currency(): string {
    return this.profile?.currency ?? "USD";
  }

  get taxRate(): number {
    return Number(this.profile?.tax_rate ?? 0);
  }
}

export const profile = new ProfileStore();
