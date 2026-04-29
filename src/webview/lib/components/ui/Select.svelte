<script lang="ts">
    import { cn } from "../../utils";
    import type { Snippet } from "svelte";
    import type { HTMLSelectAttributes } from "svelte/elements";

    interface Props extends HTMLSelectAttributes {
        value?: string | number | null;
        children?: Snippet;
    }

    let {
        class: className = "",
        value = $bindable(""),
        children,
        ...rest
    }: Props = $props();
</script>

<select
    bind:value
    class={cn(
        "h-8 rounded border border-vscode-input-border bg-vscode-input-bg px-2 text-sm text-vscode-input-fg",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-vscode-focus",
        className,
    )}
    {...rest}
>
    {#if children}{@render children()}{/if}
</select>
