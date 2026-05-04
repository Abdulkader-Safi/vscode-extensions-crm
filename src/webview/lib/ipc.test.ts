import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// --- window stub (Bun runs in Node, no DOM by default) ---
let messageListener: ((ev: { data: unknown }) => void) | null = null;
(globalThis as unknown as { window: unknown }).window = {
  addEventListener: (
    type: string,
    fn: (ev: { data: unknown }) => void,
  ): void => {
    if (type === "message") {
      messageListener = fn;
    }
  },
};
function simulateMessage(data: unknown): void {
  messageListener?.({ data });
}

// --- vscodeApi stub via Bun's mock.module ---
const postMessage = mock<(msg: unknown) => void>(() => {});
mock.module("../vscodeApi", () => ({
  vscode: { postMessage },
}));

// Dynamic import AFTER both mocks are wired so the stubs bind.
const { request, on } = await import("./ipc");

beforeEach(() => {
  postMessage.mockClear();
});
afterEach(() => {
  // Clear any leftover state by clearing the captured listener invocations;
  // module-level `pending` and `listeners` maps don't leak across tests
  // because each test cleans up its own subscriptions / resolves its own
  // promises.
});

describe("ipc.request", () => {
  test("posts a request envelope and resolves on a matching response", async () => {
    const promise = request("notify", { level: "info", message: "hi" });

    expect(postMessage).toHaveBeenCalledTimes(1);
    const sent = postMessage.mock.calls[0][0] as {
      id: string;
      direction: string;
      type: string;
      payload: unknown;
    };
    expect(sent.direction).toBe("request");
    expect(sent.type).toBe("notify");
    expect(sent.payload).toEqual({ level: "info", message: "hi" });
    expect(typeof sent.id).toBe("string");
    expect(sent.id.length).toBeGreaterThan(0);

    simulateMessage({
      id: sent.id,
      direction: "response",
      type: "notify",
      ok: true,
      payload: { acknowledged: true },
    });
    await expect(promise).resolves.toEqual({ acknowledged: true });
  });

  test("rejects with the response error when ok=false", async () => {
    const promise = request("notify", { level: "error", message: "x" });
    const sent = postMessage.mock.calls.at(-1)![0] as { id: string };

    simulateMessage({
      id: sent.id,
      direction: "response",
      type: "notify",
      ok: false,
      error: "boom",
    });
    await expect(promise).rejects.toThrow("boom");
  });

  test("ignores responses with mismatched id, then resolves on the matching one", async () => {
    const promise = request("notify", { level: "info", message: "x" });
    const sent = postMessage.mock.calls.at(-1)![0] as { id: string };

    simulateMessage({
      id: "wrong-id",
      direction: "response",
      type: "notify",
      ok: true,
      payload: "should-be-ignored",
    });
    simulateMessage({
      id: sent.id,
      direction: "response",
      type: "notify",
      ok: true,
      payload: "matched",
    });
    await expect(promise).resolves.toBe("matched");
  });

  test("generates a unique id per request", () => {
    request("notify", { level: "info", message: "a" });
    request("notify", { level: "info", message: "b" });
    const id1 = (postMessage.mock.calls.at(-2)![0] as { id: string }).id;
    const id2 = (postMessage.mock.calls.at(-1)![0] as { id: string }).id;
    expect(id1).not.toBe(id2);
  });
});

describe("ipc.on", () => {
  test("invokes the callback for a matching event type", () => {
    const cb = mock<(p: unknown) => void>(() => {});
    const off = on("boot/config", cb as never);

    simulateMessage({
      direction: "event",
      type: "boot/config",
      payload: {
        supabaseUrl: "https://x",
        anonKey: "a",
        bootstrapped: true,
        redirectUri: "vscode://x",
      },
    });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(
      (cb.mock.calls[0][0] as { bootstrapped: boolean }).bootstrapped,
    ).toBe(true);
    off();
  });

  test("ignores events with a different type", () => {
    const cb = mock<(p: unknown) => void>(() => {});
    const off = on("boot/config", cb as never);

    simulateMessage({
      direction: "event",
      type: "auth/tokens",
      payload: { error: "no" },
    });

    expect(cb).not.toHaveBeenCalled();
    off();
  });

  test("the unsubscribe function stops further callbacks", () => {
    const cb = mock<(p: unknown) => void>(() => {});
    const off = on("boot/config", cb as never);
    off();

    simulateMessage({
      direction: "event",
      type: "boot/config",
      payload: {
        supabaseUrl: null,
        anonKey: null,
        bootstrapped: false,
        redirectUri: "x",
      },
    });

    expect(cb).not.toHaveBeenCalled();
  });

  test("multiple subscribers all receive the same event", () => {
    const cb1 = mock<(p: unknown) => void>(() => {});
    const cb2 = mock<(p: unknown) => void>(() => {});
    const off1 = on("boot/config", cb1 as never);
    const off2 = on("boot/config", cb2 as never);

    simulateMessage({
      direction: "event",
      type: "boot/config",
      payload: {
        supabaseUrl: null,
        anonKey: null,
        bootstrapped: false,
        redirectUri: "x",
      },
    });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    off1();
    off2();
  });
});
