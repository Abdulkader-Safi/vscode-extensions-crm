<script lang="ts">
    import { cn } from "../../utils";
    import type { HTMLInputAttributes } from "svelte/elements";

    interface Props extends HTMLInputAttributes {
        value?: string | number | null;
    }

    let {
        class: className = "",
        value = $bindable(""),
        ...rest
    }: Props = $props();
</script>

<input
    bind:value
    class={cn(
        "h-8 w-full rounded border border-vscode-input-border bg-vscode-input-bg px-2 text-sm text-vscode-input-fg",
        "placeholder:text-vscode-input-placeholder focus:outline-none focus-visible:ring-2 focus-visible:ring-vscode-focus",
        "disabled:opacity-60",
        className,
    )}
    {...rest}
/>
