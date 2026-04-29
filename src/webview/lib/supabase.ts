import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { request } from "./ipc";

// SecretStorage-backed adapter so the Supabase session survives panel close
// (webview localStorage is wiped on dispose).
const proxyStorage = {
  async getItem(key: string): Promise<string | null> {
    const r = (await request("secrets/get", { key })) as {
      value: string | null;
    };
    return r.value;
  },
  async setItem(key: string, value: string): Promise<void> {
    await request("secrets/set", { key, value });
  },
  async removeItem(key: string): Promise<void> {
    await request("secrets/delete", { key });
  },
};

let client: SupabaseClient | null = null;

export function initSupabase(url: string, anonKey: string): SupabaseClient {
  if (client) return client;
  client = createClient(url, anonKey, {
    auth: {
      storage: proxyStorage as unknown as Storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  return client;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      "Supabase client not initialized — call initSupabase first.",
    );
  }
  return client;
}

export function hasSupabase(): boolean {
  return !!client;
}
