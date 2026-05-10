<script lang="ts">
    import { useQueryClient } from "@tanstack/svelte-query";
    import { Trash2, RotateCcw, Trash } from "lucide-svelte";
    import { formatDistanceToNow } from "date-fns";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import EmptyState from "../lib/components/ui/EmptyState.svelte";
    import { confirm } from "../lib/confirm.svelte";
    import { purge, restore, type SoftDeletableTable } from "../lib/softDelete";
    import {
        useTrashQuery,
        useTrashCountsQuery,
        rowLabel,
    } from "../lib/queries/trash";
    import { _ } from "../i18n";

    const TABS: { id: SoftDeletableTable; label: string }[] = [
        { id: "clients", label: "Clients" },
        { id: "projects", label: "Projects" },
        { id: "tasks", label: "Tasks" },
        { id: "invoices", label: "Invoices" },
        { id: "expenses", label: "Expenses" },
        { id: "leads", label: "Leads" },
    ];

    let active: SoftDeletableTable = $state("clients");

    const queryClient = useQueryClient();
    const countsQuery = useTrashCountsQuery();
    // Re-keying createQuery on tab change is awkward; we let TanStack cache
    // each tab's list independently and only render the active one.
    let trashByTab = {
        clients: useTrashQuery("clients"),
        projects: useTrashQuery("projects"),
        tasks: useTrashQuery("tasks"),
        invoices: useTrashQuery("invoices"),
        expenses: useTrashQuery("expenses"),
        leads: useTrashQuery("leads"),
    };

    const counts = $derived($countsQuery.data);
    const activeQuery = $derived(trashByTab[active]);
    const rows = $derived($activeQuery.data ?? []);

    async function onRestore(id: string) {
        await restore(queryClient, active, [id]);
    }

    async function onPurge(id: string, label: string) {
        if (
            !(await confirm({
                title: "Delete forever?",
                message: `"${label}" will be permanently deleted. This cannot be undone.`,
                confirmLabel: "Delete forever",
                destructive: true,
            }))
        ) {
            return;
        }
        await purge(queryClient, active, [id]);
    }

    async function emptyTab() {
        if (rows.length === 0) {
            return;
        }
        if (
            !(await confirm({
                title: `Empty ${active} trash?`,
                message: `${rows.length} item(s) will be permanently deleted. This cannot be undone.`,
                confirmLabel: "Empty trash",
                destructive: true,
            }))
        ) {
            return;
        }
        await purge(
            queryClient,
            active,
            rows.map((r) => r.id),
        );
    }
</script>

<div class="p-6">
    <PageHeader
        title={$_("page.trash.title")}
        description={$_("page.trash.description")}
    >
        {#snippet actions()}
            {#if rows.length > 0}
                <Button variant="destructive" size="sm" onclick={emptyTab}>
                    <Trash class="h-3.5 w-3.5" /> Empty {active}
                </Button>
            {/if}
        {/snippet}
    </PageHeader>

    <div class="mb-4 flex flex-wrap gap-1 border-b border-vscode-border">
        {#each TABS as tab (tab.id)}
            {@const c = counts?.[tab.id] ?? 0}
            <button
                type="button"
                class="relative px-3 py-2 text-xs font-medium transition-colors hover:text-vscode-fg {active ===
                tab.id
                    ? 'text-vscode-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-brand'
                    : 'text-vscode-description'}"
                onclick={() => (active = tab.id)}
            >
                {tab.label}
                {#if c > 0}
                    <span
                        class="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-vscode-button-secondary-bg px-1 text-[10px] font-semibold"
                    >
                        {c}
                    </span>
                {/if}
            </button>
        {/each}
    </div>

    {#if $activeQuery.isLoading}
        <div class="text-xs text-vscode-description">Loading…</div>
    {:else if rows.length === 0}
        <Card>
            <EmptyState
                icon={Trash2}
                title="Nothing in {active} trash"
                description="Soft-deleted items appear here for restore or permanent removal."
            />
        </Card>
    {:else}
        <Card>
            <ul class="divide-y divide-vscode-border">
                {#each rows as row (row.id)}
                    {@const label = rowLabel(active, row)}
                    <li
                        class="group flex items-center justify-between gap-3 py-2"
                    >
                        <div class="min-w-0">
                            <div class="truncate text-sm">{label}</div>
                            <div class="text-[11px] text-vscode-description">
                                Deleted {formatDistanceToNow(
                                    new Date(row.deleted_at),
                                    { addSuffix: true },
                                )}
                            </div>
                        </div>
                        <div
                            class="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                        >
                            <Button
                                size="sm"
                                variant="outline"
                                onclick={() => onRestore(row.id)}
                            >
                                <RotateCcw class="h-3.5 w-3.5" /> Restore
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                onclick={() => onPurge(row.id, label)}
                            >
                                <Trash class="h-3.5 w-3.5" /> Delete forever
                            </Button>
                        </div>
                    </li>
                {/each}
            </ul>
        </Card>
    {/if}
</div>
