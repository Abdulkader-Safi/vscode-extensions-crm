<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        title: string;
        description?: string;
        actions?: Snippet;
    }
    let { title, description, actions }: Props = $props();
</script>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
        <h1 class="text-base font-semibold tracking-tight">{title}</h1>
        {#if description}
            <p class="mt-0.5 text-xs text-vscode-description">{description}</p>
        {/if}
    </div>
    {#if actions}
        <div class="flex items-center gap-2">{@render actions()}</div>
    {/if}
</div>
