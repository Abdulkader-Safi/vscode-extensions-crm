<script lang="ts">
    import { RefreshCw } from "lucide-svelte";
    import Spinner from "./Spinner.svelte";
    import { connection } from "../../connection.svelte";
</script>

{#if connection.status !== "online"}
    <div
        class="flex h-7 shrink-0 items-center justify-center gap-2 border-b border-vscode-panel-border bg-vscode-card-bg px-4 text-xs text-vscode-description"
    >
        {#if connection.status === "connecting"}
            <Spinner size={12} />
            <span>Connecting to Supabase…</span>
        {:else}
            <RefreshCw class="h-3 w-3" />
            <span
                >Reconnecting… changes will sync when the connection returns.</span
            >
        {/if}
    </div>
{/if}
