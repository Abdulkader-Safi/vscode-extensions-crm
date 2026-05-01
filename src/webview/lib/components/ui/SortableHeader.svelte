<script lang="ts" generics="F extends string">
    import { ArrowDown, ArrowUp } from "lucide-svelte";
    import { cn } from "../../utils";
    import type { Snippet } from "svelte";
    import type { SortDir } from "../../sort";

    interface Props {
        field: F;
        current: { field: F; direction: SortDir };
        align?: "left" | "right";
        class?: string;
        onsort: (field: F) => void;
        children?: Snippet;
    }

    let {
        field,
        current,
        align = "left",
        class: className = "",
        onsort,
        children,
    }: Props = $props();

    const active = $derived(current.field === field);
</script>

<th class={cn("pb-2 font-medium", align === "right" && "text-right", className)}>
    <button
        type="button"
        class={cn(
            "inline-flex items-center gap-1 text-[11px] uppercase tracking-wide",
            "text-vscode-description hover:text-vscode-fg transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-vscode-focus rounded",
            active && "text-vscode-fg",
        )}
        onclick={() => onsort(field)}
    >
        {#if children}{@render children()}{/if}
        {#if active}
            {#if current.direction === "asc"}
                <ArrowUp class="h-3 w-3" />
            {:else}
                <ArrowDown class="h-3 w-3" />
            {/if}
        {/if}
    </button>
</th>
