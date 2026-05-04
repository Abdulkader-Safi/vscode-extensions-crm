<script lang="ts">
    import type { Snippet } from "svelte";
    import { X } from "lucide-svelte";
    import { cn } from "../../utils";

    // Sticky footer that appears whenever the parent's selection set is
    // non-empty. Slot in action buttons via `actions`; the X button clears.
    interface Props {
        count: number;
        label?: string;
        onclear: () => void;
        actions: Snippet;
        class?: string;
    }

    let {
        count,
        label,
        onclear,
        actions,
        class: className = "",
    }: Props = $props();
</script>

{#if count > 0}
    <div
        class={cn(
            "fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3",
            "rounded-lg border border-vscode-border bg-vscode-card-bg",
            "px-3 py-2 shadow-lg shadow-black/30",
            className,
        )}
        role="region"
        aria-label="Bulk actions"
    >
        <button
            type="button"
            class="rounded p-1 text-vscode-description hover:bg-vscode-list-hover hover:text-vscode-fg"
            onclick={onclear}
            aria-label="Clear selection"
        >
            <X class="h-4 w-4" />
        </button>
        <div class="text-sm font-medium">
            {count}
            {label ?? "selected"}
        </div>
        <div class="h-5 w-px bg-vscode-border"></div>
        <div class="flex items-center gap-2">
            {@render actions()}
        </div>
    </div>
{/if}
