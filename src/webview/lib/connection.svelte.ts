export type ConnectionStatus = "online" | "connecting" | "offline";

export const connection = $state<{ status: ConnectionStatus }>({
  status: "connecting",
});

const subscribers = new Set<(s: ConnectionStatus) => void>();

export function setConnectionStatus(s: ConnectionStatus): void {
  if (connection.status === s) {
    return;
  }
  connection.status = s;
  for (const fn of subscribers) {
    fn(s);
  }
}

export function subscribeConnection(
  cb: (s: ConnectionStatus) => void,
): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

let offlineTimer: ReturnType<typeof setTimeout> | null = null;

// 1.5s debounce so transient drops don't flicker the banner.
export function markRealtimeStatus(status: string): void {
  if (status === "SUBSCRIBED") {
    if (offlineTimer) {
      clearTimeout(offlineTimer);
      offlineTimer = null;
    }
    setConnectionStatus("online");
    return;
  }
  if (
    status === "CHANNEL_ERROR" ||
    status === "TIMED_OUT" ||
    status === "CLOSED"
  ) {
    if (offlineTimer) {
      return;
    }
    offlineTimer = setTimeout(() => {
      offlineTimer = null;
      setConnectionStatus("offline");
    }, 1500);
  }
}
