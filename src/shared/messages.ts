// Typed messages exchanged between the extension host and the webview.
// All messages share an envelope with `id` (for request/response correlation)
// and `type` (discriminator).

export type RequestEnvelope<T extends string, P> = {
  id: string;
  direction: "request";
  type: T;
  payload: P;
};

export type ResponseEnvelope<T extends string, R> =
  | {
      id: string;
      direction: "response";
      type: T;
      ok: true;
      payload: R;
    }
  | {
      id: string;
      direction: "response";
      type: T;
      ok: false;
      error: string;
    };

export type EventEnvelope<T extends string, P> = {
  id?: undefined;
  direction: "event";
  type: T;
  payload: P;
};

// ---- Boot / onboarding ----
export type BootConfig = {
  supabaseUrl: string | null;
  anonKey: string | null;
  bootstrapped: boolean;
  redirectUri: string;
};

export type SaveCredsPayload = {
  url: string;
  serviceRoleKey: string;
  anonKey: string;
};

export type MigrationProgress = {
  current: number;
  total: number;
  name: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
};

export type RunMigrationsResult = {
  applied: string[];
  skipped: string[];
};

// ---- Auth ----
export type AuthTokens =
  | {
      access_token: string;
      refresh_token: string;
    }
  | {
      code: string;
    }
  | {
      error: string;
    };

// ---- Generic secret storage (proxied for the Supabase storage adapter) ----
export type SecretGetPayload = { key: string };
export type SecretSetPayload = { key: string; value: string };
export type SecretDeletePayload = { key: string };

// ---- Notify ----
export type NotifyPayload = {
  level: "info" | "warning" | "error";
  message: string;
};

// ---- All requests (webview -> host) ----
export type WebviewRequest =
  | RequestEnvelope<"boot/request-config", undefined>
  | RequestEnvelope<"boot/save-creds", SaveCredsPayload>
  | RequestEnvelope<
      "boot/verify",
      { url: string; anonKey: string; serviceRoleKey: string }
    >
  | RequestEnvelope<"boot/run-migrations", undefined>
  | RequestEnvelope<"boot/finalize", undefined>
  | RequestEnvelope<"boot/reset", undefined>
  | RequestEnvelope<"auth/oauth-start", { authorizeUrl: string }>
  | RequestEnvelope<"secrets/get", SecretGetPayload>
  | RequestEnvelope<"secrets/set", SecretSetPayload>
  | RequestEnvelope<"secrets/delete", SecretDeletePayload>
  | RequestEnvelope<"notify", NotifyPayload>
  | RequestEnvelope<"copy", { text: string }>;

// ---- All events (host -> webview) ----
export type HostEvent =
  | EventEnvelope<"boot/config", BootConfig>
  | EventEnvelope<"boot/migration-progress", MigrationProgress>
  | EventEnvelope<"auth/tokens", AuthTokens>;

export type AnyMessage =
  | WebviewRequest
  | ResponseEnvelope<string, unknown>
  | HostEvent;
