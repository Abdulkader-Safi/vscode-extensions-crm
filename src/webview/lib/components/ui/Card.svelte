<script lang="ts">
    import { cn } from "../../utils";
    import type { Snippet } from "svelte";

    interface Props {
        class?: string;
        children?: Snippet;
        title?: string;
        description?: string;
    }

    let {
        class: className = "",
        children,
        title,
        description,
    }: Props = $props();
</script>

<div
    class={cn(
        "rounded-lg border border-vscode-card-border bg-vscode-card-bg text-vscode-card-fg",
        className,
    )}
>
    {#if title || description}
        <div class="border-b border-vscode-card-border px-4 py-3">
            {#if title}
                <div class="text-sm font-semibold">{title}</div>
            {/if}
            {#if description}
                <div class="text-xs text-vscode-description mt-0.5">
                    {description}
                </div>
            {/if}
        </div>
    {/if}
    {#if children}
        <div class="p-4">{@render children()}</div>
    {/if}
</div>
