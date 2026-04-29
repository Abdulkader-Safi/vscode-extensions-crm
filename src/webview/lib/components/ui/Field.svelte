<script lang="ts">
    import type { Snippet } from "svelte";
    import { cn } from "../../utils";

    interface Props {
        label?: string;
        hint?: string;
        error?: string;
        required?: boolean;
        class?: string;
        children?: Snippet;
    }

    let {
        label,
        hint,
        error,
        required,
        class: className = "",
        children,
    }: Props = $props();
</script>

<label class={cn("flex flex-col gap-1.5", className)}>
    {#if label}
        <span class="text-xs font-medium text-vscode-fg">
            {label}
            {#if required}<span class="text-vscode-error">*</span>{/if}
        </span>
    {/if}
    {#if children}{@render children()}{/if}
    {#if error}
        <span class="text-xs text-vscode-error">{error}</span>
    {:else if hint}
        <span class="text-xs text-vscode-description">{hint}</span>
    {/if}
</label>
