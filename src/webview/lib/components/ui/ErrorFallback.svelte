<script lang="ts">
    import { AlertTriangle } from "lucide-svelte";
    import Button from "./Button.svelte";

    interface Props {
        error: unknown;
        reset: () => void;
    }
    let { error, reset }: Props = $props();

    const message = $derived(
        error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : (() => {
                    try {
                        return JSON.stringify(error);
                    } catch {
                        return String(error);
                    }
                })(),
    );
</script>

<div class="flex h-full items-center justify-center p-8">
    <div
        class="flex max-w-lg flex-col gap-4 rounded border border-vscode-panel-border bg-vscode-card-bg p-6"
    >
        <div class="flex items-center gap-2 text-vscode-error">
            <AlertTriangle class="h-5 w-5" />
            <h2 class="text-base font-semibold">Something went wrong</h2>
        </div>
        <p class="text-sm text-vscode-description">
            This view crashed unexpectedly. Try again to re-mount it, or reload
            the extension if the problem persists.
        </p>
        <pre
            class="max-h-40 overflow-auto rounded border border-vscode-panel-border bg-vscode-bg p-2 text-[11px] text-vscode-description font-mono whitespace-pre-wrap wrap-break-word">{message}</pre>
        <div class="flex gap-2">
            <Button variant="primary" onclick={() => reset()}>Try again</Button>
            <Button variant="ghost" onclick={() => location.reload()}
                >Reload extension</Button
            >
        </div>
    </div>
</div>
