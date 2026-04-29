<script lang="ts">
    import { cn } from "../../utils";
    import type { Snippet } from "svelte";

    interface Props {
        class?: string;
        children?: Snippet;
        title?: string;
        description?: string;
        onclick?: (e: MouseEvent) => void;
    }

    let {
        class: className = "",
        children,
        title,
        description,
        onclick,
    }: Props = $props();

    function onKey(e: KeyboardEvent) {
        if (!onclick) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onclick(e as unknown as MouseEvent);
        }
    }
</script>

<div
    class={cn(
        "rounded-lg border border-vscode-card-border bg-vscode-card-bg text-vscode-card-fg",
        onclick && "focus:outline-none focus:ring-2 focus:ring-vscode-focus",
        className,
    )}
    role={onclick ? "button" : undefined}
    tabindex={onclick ? 0 : undefined}
    {onclick}
    onkeydown={onclick ? onKey : undefined}
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
