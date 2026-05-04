// Command palette registry. Routes register their context-specific commands
// (e.g. "New invoice" on /invoices) on mount, and unregister on destroy. The
// palette itself opens via Cmd/Ctrl+K and runs the selected command.
//
// Two layers:
//   1. `coreCommands` — always available (navigate to each route, sign out).
//   2. `dynamicCommands` — registered/unregistered by routes when mounted,
//      keyed by command id. Lets us bind Cmd+N to whatever "new" command
//      the current route exposes without baking that into a route table.

import { push } from "svelte-spa-router";
import { auth } from "./stores/auth.svelte";

export type Command = {
  id: string;
  title: string;
  // Short hint shown to the right of the command (e.g. shortcut, group).
  hint?: string;
  // Optional grouping label for the palette section header.
  group?: string;
  run: () => void | Promise<void>;
};

class CommandStore {
  open = $state(false);
  query = $state("");
  // Dynamic commands keyed by id (later registrations overwrite earlier).
  private dynamic = $state(new Map<string, Command>());

  // Core commands that don't change across routes.
  private core: readonly Command[] = [
    {
      id: "nav.dashboard",
      title: "Go to Dashboard",
      group: "Navigate",
      run: () => push("/"),
    },
    {
      id: "nav.clients",
      title: "Go to Clients",
      group: "Navigate",
      run: () => push("/clients"),
    },
    {
      id: "nav.leads",
      title: "Go to Leads",
      group: "Navigate",
      run: () => push("/leads"),
    },
    {
      id: "nav.projects",
      title: "Go to Projects",
      group: "Navigate",
      run: () => push("/projects"),
    },
    {
      id: "nav.tasks",
      title: "Go to Tasks",
      group: "Navigate",
      run: () => push("/tasks"),
    },
    {
      id: "nav.tasks.kanban",
      title: "Go to Tasks (Board)",
      group: "Navigate",
      run: () => push("/tasks/kanban"),
    },
    {
      id: "nav.invoices",
      title: "Go to Invoices",
      group: "Navigate",
      run: () => push("/invoices"),
    },
    {
      id: "nav.expenses",
      title: "Go to Expenses",
      group: "Navigate",
      run: () => push("/expenses"),
    },
    {
      id: "nav.reports",
      title: "Go to Reports",
      group: "Navigate",
      run: () => push("/reports"),
    },
    {
      id: "nav.settings",
      title: "Go to Settings",
      group: "Navigate",
      run: () => push("/settings"),
    },
    {
      id: "nav.trash",
      title: "Go to Trash",
      group: "Navigate",
      run: () => push("/trash"),
    },
    {
      id: "auth.signout",
      title: "Sign out",
      group: "Account",
      run: () => auth.signOut(),
    },
  ];

  get all(): readonly Command[] {
    // Dynamic first so route-specific actions like "New invoice" appear at
    // the top when the palette opens on that route.
    return [...this.dynamic.values(), ...this.core];
  }

  get filtered(): readonly Command[] {
    const q = this.query.trim().toLowerCase();
    if (!q) {
      return this.all;
    }
    return this.all.filter((c) => c.title.toLowerCase().includes(q));
  }

  register(cmd: Command): () => void {
    this.dynamic.set(cmd.id, cmd);
    return () => {
      this.dynamic.delete(cmd.id);
    };
  }

  show() {
    this.query = "";
    this.open = true;
  }

  hide() {
    this.open = false;
  }

  // Convenience: find a command tagged "primary-new" — used by Cmd+N to
  // dispatch the route's contextual "new X" action. Routes that expose a
  // creation flow should register their command with id `primary-new`.
  primaryNew(): Command | undefined {
    return this.dynamic.get("primary-new");
  }
}

export const commands = new CommandStore();
