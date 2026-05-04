// Single source of truth for query keys. Hand-rolled factory keeps
// invalidation patterns consistent — every mutation uses qk.foo() and every
// realtime listener invalidates the same key.

export const qk = {
  clients: () => ["clients"] as const,
  client: (id: string) => ["clients", id] as const,

  projects: () => ["projects"] as const,
  project: (id: string) => ["projects", id] as const,

  tasks: (projectId?: string) =>
    (projectId ? ["tasks", { projectId }] : ["tasks"]) as readonly unknown[],

  invoices: () => ["invoices"] as const,
  invoice: (id: string) => ["invoices", id] as const,
  invoiceItems: (invoiceId: string) => ["invoice_items", invoiceId] as const,

  expenses: () => ["expenses"] as const,
  leads: () => ["leads"] as const,

  timeEntries: (projectId?: string) =>
    (projectId
      ? ["time_entries", { projectId }]
      : ["time_entries"]) as readonly unknown[],

  communicationLogs: (clientId: string) =>
    ["communication_logs", clientId] as const,

  notifications: () => ["notifications"] as const,
  profile: () => ["profile"] as const,

  dashboard: () => ["dashboard"] as const,
  reports: () => ["reports"] as const,
};

// Tables → query keys to invalidate when realtime fires for that table.
// Composite views (dashboard, reports) read from multiple tables so they
// invalidate on every relevant change.
export const TABLE_INVALIDATIONS: Record<
  string,
  readonly (readonly unknown[])[]
> = {
  clients: [qk.clients(), qk.dashboard(), qk.reports()],
  projects: [qk.projects(), qk.dashboard(), qk.reports()],
  tasks: [qk.tasks(), qk.dashboard()],
  invoices: [qk.invoices(), qk.dashboard(), qk.reports()],
  invoice_items: [qk.invoices()],
  expenses: [qk.expenses(), qk.reports()],
  leads: [qk.leads()],
  time_entries: [qk.timeEntries()],
  communication_logs: [],
  notifications: [qk.notifications()],
  profiles: [qk.profile()],
};
