<script lang="ts">
    import { cn } from "../../utils";
    import type { HTMLTextareaAttributes } from "svelte/elements";

    interface Props extends HTMLTextareaAttributes {
        value?: string | null;
    }

    let {
        class: className = "",
        value = $bindable(""),
        ...rest
    }: Props = $props();
</script>

<textarea
    bind:value
    class={cn(
        "min-h-15 w-full rounded border border-vscode-input-border bg-vscode-input-bg p-2 text-sm text-vscode-input-fg",
        "placeholder:text-vscode-input-placeholder focus:outline-none focus-visible:ring-2 focus-visible:ring-vscode-focus",
        className,
    )}
    {...rest}
></textarea>
