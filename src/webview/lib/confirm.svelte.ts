// Imperative confirm() helper backed by ConfirmDialog.svelte.
// Usage:  if (!(await confirm({ title: "Delete?", message: "..." }))) return;
//
// One pending request at a time — call sites await before issuing the next.
// The state object is exported as a Svelte 5 rune-state holder so the dialog
// component can read/write it reactively.

type ConfirmOptions = {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Pending = {
  options: Required<Omit<ConfirmOptions, "destructive">> & {
    destructive: boolean;
  };
  resolve: (value: boolean) => void;
};

class ConfirmStore {
  pending = $state<Pending | null>(null);

  request(opts: ConfirmOptions): Promise<boolean> {
    // If something is already pending, auto-decline it before opening the new one.
    this.pending?.resolve(false);
    return new Promise((resolve) => {
      this.pending = {
        options: {
          title: opts.title ?? "Are you sure?",
          message: opts.message ?? "",
          confirmLabel: opts.confirmLabel ?? "Confirm",
          cancelLabel: opts.cancelLabel ?? "Cancel",
          destructive: opts.destructive ?? false,
        },
        resolve,
      };
    });
  }

  resolve(value: boolean) {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    p.resolve(value);
  }
}

export const confirmStore = new ConfirmStore();

export function confirm(opts: ConfirmOptions = {}): Promise<boolean> {
  return confirmStore.request(opts);
}
