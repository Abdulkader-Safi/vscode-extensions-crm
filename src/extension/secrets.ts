import * as vscode from "vscode";

const NS = "vs-crm";

const SecretKeys = {
  url: `${NS}.supabaseUrl`,
  anonKey: `${NS}.anonKey`,
  serviceRoleKey: `${NS}.serviceRoleKey`,
  // Anything starting with this prefix is treated as opaque storage proxied
  // for the Supabase client (e.g. `${NS}.session.<projectRef>`).
  proxyPrefix: `${NS}.proxy.`,
} as const;

const STATE_BOOTSTRAPPED = `${NS}.bootstrapped`;

export class CrmSecrets {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  // ---- Connection (URL + anon) — non-secret URL stored alongside as a secret for simplicity ----
  async getUrl() {
    return await this.ctx.secrets.get(SecretKeys.url);
  }
  async getAnonKey() {
    return await this.ctx.secrets.get(SecretKeys.anonKey);
  }
  async getServiceRoleKey() {
    return await this.ctx.secrets.get(SecretKeys.serviceRoleKey);
  }
  async setConnection(url: string, anonKey: string, serviceRoleKey: string) {
    await Promise.all([
      this.ctx.secrets.store(SecretKeys.url, url),
      this.ctx.secrets.store(SecretKeys.anonKey, anonKey),
      this.ctx.secrets.store(SecretKeys.serviceRoleKey, serviceRoleKey),
    ]);
  }
  async clearServiceRoleKey() {
    await this.ctx.secrets.delete(SecretKeys.serviceRoleKey);
  }

  // ---- Generic proxy (for Supabase storage adapter inside the webview) ----
  private proxyKey(k: string) {
    return SecretKeys.proxyPrefix + k;
  }
  async proxyGet(k: string) {
    return (await this.ctx.secrets.get(this.proxyKey(k))) ?? null;
  }
  async proxySet(k: string, v: string) {
    await this.ctx.secrets.store(this.proxyKey(k), v);
  }
  async proxyDelete(k: string) {
    await this.ctx.secrets.delete(this.proxyKey(k));
  }

  // ---- Bootstrap flag (non-secret state) ----
  isBootstrapped() {
    return !!this.ctx.globalState.get<boolean>(STATE_BOOTSTRAPPED);
  }
  async setBootstrapped(v: boolean) {
    await this.ctx.globalState.update(STATE_BOOTSTRAPPED, v);
  }

  // ---- Reset everything ----
  async reset() {
    await Promise.all([
      this.ctx.secrets.delete(SecretKeys.url),
      this.ctx.secrets.delete(SecretKeys.anonKey),
      this.ctx.secrets.delete(SecretKeys.serviceRoleKey),
    ]);
    // Walk known proxy keys is impossible without enumeration, so we just
    // delete the well-known session keys we use.
    await this.ctx.secrets.delete(this.proxyKey("supabase.auth.token"));
    await this.setBootstrapped(false);
  }
}
