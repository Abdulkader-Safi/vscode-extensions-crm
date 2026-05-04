<script lang="ts">
    import type { Snippet } from "svelte";
    import { cn } from "../../utils";
    import { X } from "lucide-svelte";

    interface Props {
        open: boolean;
        onClose?: () => void;
        title?: string;
        description?: string;
        children?: Snippet;
        footer?: Snippet;
        size?: "sm" | "md" | "lg" | "xl";
    }

    let {
        open = $bindable(false),
        onClose,
        title,
        description,
        children,
        footer,
        size = "md",
    }: Props = $props();

    const sizes = {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-2xl",
        xl: "max-w-4xl",
    };

    function close() {
        open = false;
        onClose?.();
    }

    function onKey(e: KeyboardEvent) {
        if (open && e.key === "Escape") {
            close();
        }
    }

    function onBackdropKey(e: KeyboardEvent) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            close();
        }
    }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onclick={close}
        onkeydown={onBackdropKey}
        role="button"
        tabindex="-1"
        aria-label="Close dialog"
    >
        <div
            class={cn(
                "relative w-full rounded-lg border border-vscode-card-border bg-vscode-card-bg text-vscode-card-fg shadow-lg",
                sizes[size],
            )}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            tabindex="-1"
        >
            {#if title || description}
                <div
                    class="flex items-start justify-between border-b border-vscode-card-border px-4 py-3"
                >
                    <div>
                        {#if title}
                            <div class="text-sm font-semibold">{title}</div>
                        {/if}
                        {#if description}
                            <div class="text-xs text-vscode-description mt-0.5">
                                {description}
                            </div>
                        {/if}
                    </div>
                    <button
                        class="rounded p-1 hover:bg-vscode-list-hover"
                        onclick={close}
                        aria-label="Close"
                    >
                        <X class="h-4 w-4" />
                    </button>
                </div>
            {/if}
            <div class="px-4 py-4">
                {#if children}{@render children()}{/if}
            </div>
            {#if footer}
                <div
                    class="flex justify-end gap-2 border-t border-vscode-card-border px-4 py-3"
                >
                    {@render footer()}
                </div>
            {/if}
        </div>
    </div>
{/if}
