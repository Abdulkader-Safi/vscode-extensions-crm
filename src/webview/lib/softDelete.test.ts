import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Stub a fluent Supabase query builder. The mutation calls look like:
//   supabase.from(table).update({ ... }).in("id", ids).eq("user_id", uid)
//   supabase.from(table).delete().in("id", ids).eq("user_id", uid)
// Each chain ends in a thenable that resolves to { data, error }.

type Operation = {
  table: string;
  kind: "update" | "delete";
  patch?: unknown;
  ids?: string[];
  userId?: string;
};

let nextResult: { data: unknown; error: unknown } = { data: null, error: null };
let operations: Operation[];

function makeBuilder(table: string, kind: "update" | "delete") {
  const op: Operation = { table, kind };
  operations.push(op);
  const builder: any = {
    update(patch: unknown) {
      op.patch = patch;
      return builder;
    },
    delete() {
      return builder;
    },
    in(_col: string, ids: string[]) {
      op.ids = ids;
      return builder;
    },
    eq(_col: string, val: string) {
      op.userId = val;
      return builder;
    },
    then(resolve: (v: typeof nextResult) => void) {
      resolve(nextResult);
    },
  };
  return builder;
}

const supaStub = {
  from(table: string) {
    return {
      update: (patch: unknown) => makeBuilder(table, "update").update(patch),
      delete: () => makeBuilder(table, "delete").delete(),
    };
  },
};

mock.module("./supabase", () => ({
  getSupabase: () => supaStub,
}));

const authState = { user: { id: "user-1" } as { id: string } | null };
mock.module("./stores/auth.svelte", () => ({
  auth: authState,
}));

type ToastSpy = ReturnType<typeof mock<(msg: string, opts?: unknown) => void>>;
const toastSuccess: ToastSpy = mock(() => {});
const toastError: ToastSpy = mock(() => {});
mock.module("svelte-sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

// Dynamic import AFTER mocks are wired.
const { QueryClient } = await import("@tanstack/svelte-query");
const { softDelete, restore, purge } = await import("./softDelete");
const { qk } = await import("./queries/keys");

let client: InstanceType<typeof QueryClient>;

beforeEach(() => {
  operations = [];
  nextResult = { data: null, error: null };
  toastSuccess.mockClear();
  toastError.mockClear();
  authState.user = { id: "user-1" };
  client = new QueryClient();
});

afterEach(() => {
  client.clear();
});

describe("softDelete", () => {
  test("optimistically removes rows from list cache and shows undo toast", async () => {
    client.setQueryData(qk.clients(), [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ]);

    await softDelete(client, "clients", ["a", "c"]);

    const after = client.getQueryData<{ id: string }[]>(qk.clients());
    expect(after?.map((r) => r.id)).toEqual(["b"]);

    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      table: "clients",
      kind: "update",
      ids: ["a", "c"],
      userId: "user-1",
    });
    expect(
      (operations[0].patch as { deleted_at: string }).deleted_at,
    ).toBeTypeOf("string");

    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const [msg, opts] = toastSuccess.mock.calls[0] as [string, any];
    expect(msg).toBe("2 clients deleted");
    expect(opts.duration).toBe(5000);
    expect(opts.action.label).toBe("Undo");
    expect(typeof opts.action.onClick).toBe("function");
    expect(toastError).not.toHaveBeenCalled();
  });

  test("rolls back optimistic removal on server error", async () => {
    const initial = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    client.setQueryData(qk.invoices(), initial);
    nextResult = { data: null, error: new Error("RLS denied") };

    let thrown: Error | null = null;
    try {
      await softDelete(client, "invoices", ["a"]);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown?.message).toBe("RLS denied");

    const after = client.getQueryData<{ id: string }[]>(qk.invoices());
    expect(after?.map((r) => r.id)).toEqual(["a", "b"]);

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toBe("RLS denied");
  });

  test("undo action restores via the same ids", async () => {
    client.setQueryData(qk.tasks(), [{ id: "t1", title: "Task 1" }]);

    await softDelete(client, "tasks", ["t1"]);

    const undo = (toastSuccess.mock.calls[0][1] as any).action.onClick;
    operations = [];
    nextResult = { data: null, error: null };
    // svelte-sonner's action.onClick is sync (fire-and-forget). The handler
    // dispatches restore() but doesn't await it — flush the microtask queue
    // before asserting.
    undo();
    await new Promise((r) => setTimeout(r, 10));

    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      table: "tasks",
      kind: "update",
      ids: ["t1"],
    });
    expect(
      (operations[0].patch as { deleted_at: string | null }).deleted_at,
    ).toBeNull();
    expect(toastSuccess).toHaveBeenCalledTimes(2);
    expect(toastSuccess.mock.calls[1][0]).toBe("Task restored");
  });

  test("no-ops on empty id array — no operations, no toasts", async () => {
    await softDelete(client, "expenses", []);
    expect(operations).toHaveLength(0);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  test("throws when not authenticated", async () => {
    authState.user = null;
    let thrown: Error | null = null;
    try {
      await softDelete(client, "clients", ["x"]);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown?.message).toBe("Not authenticated");
    expect(toastError.mock.calls[0][0]).toBe("Not authenticated");
  });
});

describe("restore", () => {
  test("PATCHes deleted_at=null and toasts success", async () => {
    await restore(client, "leads", ["l1", "l2"]);

    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      table: "leads",
      kind: "update",
      ids: ["l1", "l2"],
    });
    expect(
      (operations[0].patch as { deleted_at: string | null }).deleted_at,
    ).toBeNull();

    expect(toastSuccess).toHaveBeenCalledWith("2 leads restored");
  });

  test("toasts and rethrows on error", async () => {
    nextResult = { data: null, error: new Error("network") };
    let thrown: Error | null = null;
    try {
      await restore(client, "projects", ["p1"]);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown?.message).toBe("network");
    expect(toastError).toHaveBeenCalledWith("network");
  });
});

describe("purge", () => {
  test("hard-deletes via supabase.delete().in().eq()", async () => {
    await purge(client, "expenses", ["e1"]);

    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      table: "expenses",
      kind: "delete",
      ids: ["e1"],
      userId: "user-1",
    });
    expect(toastSuccess).toHaveBeenCalledWith("Expense permanently deleted");
  });

  test("toasts and rethrows on error", async () => {
    nextResult = { data: null, error: new Error("FK violation") };
    let thrown: Error | null = null;
    try {
      await purge(client, "clients", ["c1"]);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown?.message).toBe("FK violation");
    expect(toastError).toHaveBeenCalledWith("FK violation");
  });
});
