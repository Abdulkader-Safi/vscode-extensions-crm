import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, hasSupabase } from "../supabase";
import { on } from "../ipc";
import { setConnectionStatus } from "../connection.svelte";
import type { AuthTokens } from "../../../shared/messages";

// If supabase-js's initial getSession() can't reach the project (DNS fails,
// project paused, VPN blocking *.supabase.co), it keeps retrying the refresh
// token call forever. Time-box it so the UI can render the ConnectionBanner
// + AuthScreen instead of spinning. When the network recovers,
// onAuthStateChange fires and the UI catches up automatically.
const SESSION_BOOT_TIMEOUT_MS = 8000;

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

    // Set up the auth listener FIRST so a late-resolving getSession() (network
    // came back) still wakes the UI even if we already gave up below.
    const sub = supa.auth.onAuthStateChange((_event, session) => {
      this.session = session;
      this.user = session?.user ?? null;
      if (session) {
        setConnectionStatus("online");
      }
    });
    this.unsubAuth = () => sub.data.subscription.unsubscribe();

    const timeout = new Promise<{ timedOut: true }>((resolve) =>
      setTimeout(
        () => resolve({ timedOut: true }),
        SESSION_BOOT_TIMEOUT_MS,
      ),
    );
    const session = supa.auth
      .getSession()
      .then((r) => ({ timedOut: false as const, data: r.data }))
      .catch((err) => {
        console.error("[vs-crm] auth.getSession failed:", err);
        return { timedOut: false as const, data: { session: null } };
      });
    const result = await Promise.race([session, timeout]);
    if ("data" in result) {
      this.session = result.data.session;
      this.user = result.data.session?.user ?? null;
    } else {
      // Couldn't reach Supabase within the budget. Surface offline state so
      // ConnectionBanner shows; user lands on AuthScreen (no session) instead
      // of the eternal spinner.
      setConnectionStatus("offline");
    }
    this.loading = false;

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
