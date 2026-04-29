import { vscode } from "../vscodeApi";
import type {
  HostEvent,
  ResponseEnvelope,
  WebviewRequest,
} from "../../shared/messages";

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

const pending = new Map<string, Pending>();
const listeners = new Map<HostEvent["type"], Set<(p: unknown) => void>>();

let installed = false;
function install() {
  if (installed) {
    return;
  }
  installed = true;
  window.addEventListener("message", (ev) => {
    const data = ev.data as
      | ResponseEnvelope<string, unknown>
      | HostEvent
      | undefined;
    if (!data) {
      return;
    }
    if (data.direction === "response") {
      const p = pending.get(data.id);
      if (!p) {
        return;
      }
      pending.delete(data.id);
      if (data.ok) {
        p.resolve(data.payload);
      } else {
        p.reject(new Error(data.error));
      }
      return;
    }
    if (data.direction === "event") {
      const set = listeners.get(data.type);
      if (set) {
        for (const fn of set) {
          fn(data.payload);
        }
      }
    }
  });
}

let counter = 0;
function nextId() {
  counter++;
  return `${Date.now().toString(36)}-${counter}`;
}

type Req = WebviewRequest;
type ReqByType<T extends Req["type"]> = Extract<Req, { type: T }>;
type PayloadOf<T extends Req["type"]> = ReqByType<T>["payload"];

export function request<T extends Req["type"]>(
  type: T,
  payload: PayloadOf<T>,
): Promise<unknown> {
  install();
  return new Promise((resolve, reject) => {
    const id = nextId();
    pending.set(id, { resolve, reject });
    vscode.postMessage({
      id,
      direction: "request",
      type,
      payload,
    });
  });
}

export function on<T extends HostEvent["type"]>(
  type: T,
  fn: (payload: Extract<HostEvent, { type: T }>["payload"]) => void,
): () => void {
  install();
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  const wrapped = fn as (p: unknown) => void;
  set.add(wrapped);
  return () => set!.delete(wrapped);
}
