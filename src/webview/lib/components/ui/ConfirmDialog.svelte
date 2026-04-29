<script lang="ts">
    import Dialog from "./Dialog.svelte";
    import Button from "./Button.svelte";
    import { confirmStore } from "../../confirm.svelte";

    // Treat the store's pending entry as the source of truth; bind a derived
    // `open` flag to Dialog so closing via Escape / backdrop also resolves it.
    const open = $derived(confirmStore.pending !== null);
    const opts = $derived(confirmStore.pending?.options);

    function onCancel() {
        confirmStore.resolve(false);
    }
    function onConfirm() {
        confirmStore.resolve(true);
    }
</script>

<Dialog
    {open}
    onClose={onCancel}
    title={opts?.title}
    description={opts?.message}
    size="sm"
>
    {#snippet footer()}
        <Button variant="ghost" onclick={onCancel}>
            {opts?.cancelLabel ?? "Cancel"}
        </Button>
        <Button
            variant={opts?.destructive ? "destructive" : "brand"}
            onclick={onConfirm}
        >
            {opts?.confirmLabel ?? "Confirm"}
        </Button>
    {/snippet}
</Dialog>
