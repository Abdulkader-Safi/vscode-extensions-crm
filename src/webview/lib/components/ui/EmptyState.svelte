<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        // Lucide icons are class-based Svelte components — keep the prop loose.
        icon?: any;
        title: string;
        description?: string;
        action?: Snippet;
    }

    let { icon: Icon, title, description, action }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-12 text-center">
    {#if Icon}
        <Icon class="h-10 w-10 text-vscode-description mb-3" />
    {/if}
    <div class="text-sm font-semibold">{title}</div>
    {#if description}
        <div class="text-xs text-vscode-description mt-1 max-w-sm">
            {description}
        </div>
    {/if}
    {#if action}
        <div class="mt-4">{@render action()}</div>
    {/if}
</div>
