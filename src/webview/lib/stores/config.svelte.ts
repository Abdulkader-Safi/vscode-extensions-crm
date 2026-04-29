import { request } from "../ipc";
import type { BootConfig } from "../../../shared/messages";
import { initSupabase } from "../supabase";

class ConfigStore {
  loaded = $state(false);
  supabaseUrl = $state<string | null>(null);
  anonKey = $state<string | null>(null);
  bootstrapped = $state(false);
  redirectUri = $state("");

  async load() {
    const cfg = (await request("boot/request-config", undefined)) as BootConfig;
    this.supabaseUrl = cfg.supabaseUrl;
    this.anonKey = cfg.anonKey;
    this.bootstrapped = cfg.bootstrapped;
    this.redirectUri = cfg.redirectUri;
    if (cfg.supabaseUrl && cfg.anonKey) {
      initSupabase(cfg.supabaseUrl, cfg.anonKey);
    }
    this.loaded = true;
  }

  async refresh() {
    this.loaded = false;
    await this.load();
  }

  get isReadyForApp() {
    return (
      this.loaded && this.bootstrapped && !!this.supabaseUrl && !!this.anonKey
    );
  }
}

export const config = new ConfigStore();
