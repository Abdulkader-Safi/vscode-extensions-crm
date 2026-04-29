import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, hasSupabase } from "../supabase";
import { on } from "../ipc";
import type { AuthTokens } from "../../../shared/messages";

class AuthStore {
  session = $state<Session | null>(null);
  user = $state<User | null>(null);
  loading = $state(true);
  private unsubAuth: (() => void) | null = null;
  private unsubTokens: (() => void) | null = null;

  async init() {
    if (!hasSupabase()) {
      this.loading = false;
      return;
    }
    const supa = getSupabase();
    const { data } = await supa.auth.getSession();
    this.session = data.session;
    this.user = data.session?.user ?? null;
    this.loading = false;

    const sub = supa.auth.onAuthStateChange((_event, session) => {
      this.session = session;
      this.user = session?.user ?? null;
    });
    this.unsubAuth = () => sub.data.subscription.unsubscribe();

    // Wire URI-handler tokens (magic link / OAuth callback)
    this.unsubTokens = on("auth/tokens", async (tokens: AuthTokens) => {
      const c = getSupabase();
      if ("error" in tokens) {
        console.error("[vs-crm] auth callback error:", tokens.error);
        return;
      }
      if ("code" in tokens) {
        const { error } = await c.auth.exchangeCodeForSession(tokens.code);
        if (error) console.error("[vs-crm] exchangeCode error:", error);
        return;
      }
      const { error } = await c.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (error) console.error("[vs-crm] setSession error:", error);
    });
  }

  dispose() {
    this.unsubAuth?.();
    this.unsubTokens?.();
  }

  async signOut() {
    if (!hasSupabase()) return;
    await getSupabase().auth.signOut();
  }
}

export const auth = new AuthStore();
