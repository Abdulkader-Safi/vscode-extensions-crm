<script lang="ts">
    import { toast } from "svelte-sonner";
    import { SvelteSet } from "svelte/reactivity";
    import { useQueryClient } from "@tanstack/svelte-query";
    import { Plus, Trash2 } from "lucide-svelte";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Select from "../lib/components/ui/Select.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Dialog from "../lib/components/ui/Dialog.svelte";
    import EmptyState from "../lib/components/ui/EmptyState.svelte";
    import SortableHeader from "../lib/components/ui/SortableHeader.svelte";
    import BulkActionBar from "../lib/components/ui/BulkActionBar.svelte";
    import SelectableHeader from "../lib/components/ui/SelectableHeader.svelte";
    import StatCard from "../lib/components/StatCard.svelte";
    import { confirm } from "../lib/confirm.svelte";
    import { softDelete } from "../lib/softDelete";
    import { commands } from "../lib/commands.svelte";
    import { _ } from "../i18n";
    import { profile } from "../lib/stores/profile.svelte";
    import { formatCurrency, ymd } from "../lib/utils";
    import { compareBy, type SortDir } from "../lib/sort";
    import { inDateRange } from "../lib/dateFilter";
    import {
        useExpensesQuery,
        useCreateExpenseMutation,
    } from "../lib/queries/expenses";
    import { useProjectsQuery } from "../lib/queries/projects";
    import { useClientsQuery } from "../lib/queries/clients";

    const CATEGORIES = [
        "software",
        "hardware",
        "marketing",
        "travel",
        "meals",
        "office",
        "subscriptions",
        "contractors",
        "other",
    ];

    const queryClient = useQueryClient();
    const expensesQuery = useExpensesQuery();
    const projectsQuery = useProjectsQuery();
    const clientsQuery = useClientsQuery();
    const createMutation = useCreateExpenseMutation();

    let selected = $state(new SvelteSet<string>());

    let open = $state(false);
    let form = $state({
        category: "software",
        amount: "0",
        vendor: "",
        description: "",
        expense_date: ymd(),
        project_id: "none",
    });

    $effect(() =>
        commands.register({
            id: "primary-new",
            title: "New expense",
            group: "Create",
            hint: "⌘N",
            run: () => {
                open = true;
            },
        }),
    );

    const expenses = $derived($expensesQuery.data ?? []);
    const projects = $derived($projectsQuery.data ?? []);
    const clients = $derived($clientsQuery.data ?? []);

    type SortField = "expense_date" | "category" | "amount";
    let filters = $state({ category: "", from: "", to: "", clientId: "" });
    let sort = $state<{ field: SortField; direction: SortDir }>({
        field: "expense_date",
        direction: "desc",
    });

    const clientIdByProject = $derived(
        new Map(projects.map((p) => [p.id, p.client_id])),
    );

    const filteredSorted = $derived.by(() => {
        const filtered = expenses.filter((e) => {
            if (filters.category && e.category !== filters.category) {
                return false;
            }
            if (!inDateRange(e.expense_date, filters.from, filters.to)) {
                return false;
            }
            if (filters.clientId) {
                const cid = e.project_id
                    ? (clientIdByProject.get(e.project_id) ?? null)
                    : null;
                if (cid !== filters.clientId) {
                    return false;
                }
            }
            return true;
        });
        const sortKey: (e: (typeof expenses)[number]) => unknown =
            sort.field === "amount"
                ? (e) => Number(e.amount)
                : (e) => e[sort.field];
        return [...filtered].sort(compareBy(sortKey, sort.direction));
    });

    const usedCategories = $derived(
        Array.from(new Set(expenses.map((e) => e.category))).sort(),
    );

    const filtersActive = $derived(
        !!filters.category ||
            !!filters.from ||
            !!filters.to ||
            !!filters.clientId ||
            sort.field !== "expense_date" ||
            sort.direction !== "desc",
    );

    function toggleSort(field: SortField) {
        if (sort.field === field) {
            sort = {
                field,
                direction: sort.direction === "asc" ? "desc" : "asc",
            };
        } else {
            sort = { field, direction: "asc" };
        }
    }

    function clearFilters() {
        filters = { category: "", from: "", to: "", clientId: "" };
        sort = { field: "expense_date", direction: "desc" };
    }

    const total = $derived(expenses.reduce((s, e) => s + Number(e.amount), 0));
    // Use the actual current month — `monthlyMap[0]` would mislabel the most
    // recent past month as "this month" when nothing has been logged yet.
    const thisMonth = $derived.by(() => {
        const ym = new Date().toISOString().slice(0, 7);
        return expenses
            .filter((e) => e.expense_date.slice(0, 7) === ym)
            .reduce((s, e) => s + Number(e.amount), 0);
    });

    async function create() {
        try {
            await $createMutation.mutateAsync({
                category: form.category,
                amount: Number(form.amount),
                currency: profile.currency,
                vendor: form.vendor.trim() || null,
                description: form.description.trim() || null,
                expense_date: form.expense_date,
                project_id: form.project_id === "none" ? null : form.project_id,
            });
            toast.success("Expense logged");
            open = false;
            form = { ...form, amount: "0", vendor: "", description: "" };
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function remove(id: string) {
        await softDelete(queryClient, "expenses", [id]);
    }

    async function bulkRemove() {
        if (selected.size === 0) {
            return;
        }
        const ids = Array.from(selected);
        if (
            !(await confirm({
                title:
                    ids.length === 1
                        ? "Delete expense?"
                        : `Delete ${ids.length} expenses?`,
                message:
                    "Soft-deleted — restore from Trash within 5 seconds via Undo, or permanently from the Trash view.",
                confirmLabel: "Delete",
                destructive: true,
            }))
        ) {
            return;
        }
        selected.clear();
        await softDelete(queryClient, "expenses", ids);
    }

    function toggleOne(id: string) {
        if (selected.has(id)) {
            selected.delete(id);
        } else {
            selected.add(id);
        }
    }
</script>

<div class="p-6">
    <PageHeader
        title={$_("page.expenses.title")}
        description={$_("page.expenses.description")}
    >
        {#snippet actions()}
            <Button variant="brand" onclick={() => (open = true)}>
                <Plus class="h-4 w-4" />
                {$_("page.expenses.newAction")}
            </Button>
        {/snippet}
    </PageHeader>

    <div class="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
            label="Total"
            value={formatCurrency(total, profile.currency)}
        />
        <StatCard
            label="This month"
            value={formatCurrency(thisMonth, profile.currency)}
            accent="warning"
        />
        <StatCard label="Entries" value={String(expenses.length)} />
    </div>

    {#if $expensesQuery.isLoading}
        <div class="text-xs text-vscode-description">Loading…</div>
    {:else if expenses.length === 0}
        <Card>
            <EmptyState
                title="No expenses logged yet"
                description="Track every receipt, vendor, and subscription."
            />
        </Card>
    {:else}
        <div class="mb-3 flex flex-wrap items-end gap-2">
            <Field label="Category">
                <Select bind:value={filters.category}>
                    <option value="">All</option>
                    {#each usedCategories as c (c)}
                        <option value={c}>{c}</option>
                    {/each}
                </Select>
            </Field>
            <Field label="Date from">
                <Input type="date" bind:value={filters.from} />
            </Field>
            <Field label="Date to">
                <Input type="date" bind:value={filters.to} />
            </Field>
            <Field label="Client">
                <Select bind:value={filters.clientId}>
                    <option value="">All</option>
                    {#each clients as c (c.id)}
                        <option value={c.id}>{c.name}</option>
                    {/each}
                </Select>
            </Field>
            {#if filtersActive}
                <Button variant="ghost" size="sm" onclick={clearFilters}>
                    Clear
                </Button>
            {/if}
        </div>
        <Card>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-vscode-border text-left">
                            <th class="w-6 pb-2">
                                <SelectableHeader
                                    ids={filteredSorted.map((e) => e.id)}
                                    {selected}
                                    onchange={(next) => {
                                        selected = new SvelteSet(next);
                                    }}
                                />
                            </th>
                            <SortableHeader
                                field="expense_date"
                                current={sort}
                                onsort={toggleSort}
                            >
                                Date
                            </SortableHeader>
                            <SortableHeader
                                field="category"
                                current={sort}
                                onsort={toggleSort}
                            >
                                Category
                            </SortableHeader>
                            <th
                                class="pb-2 font-medium text-[11px] uppercase tracking-wide text-vscode-description"
                            >
                                Vendor
                            </th>
                            <th
                                class="pb-2 font-medium text-[11px] uppercase tracking-wide text-vscode-description"
                            >
                                Notes
                            </th>
                            <SortableHeader
                                field="amount"
                                current={sort}
                                align="right"
                                onsort={toggleSort}
                            >
                                Amount
                            </SortableHeader>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {#if filteredSorted.length === 0}
                            <tr>
                                <td
                                    colspan="7"
                                    class="py-6 text-center text-xs text-vscode-description"
                                >
                                    No expenses match these filters.
                                </td>
                            </tr>
                        {/if}
                        {#each filteredSorted as e (e.id)}
                            <tr
                                class="group border-b border-vscode-border last:border-0"
                            >
                                <td class="w-6 py-2">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(e.id)}
                                        aria-label="Select expense"
                                        onchange={() => toggleOne(e.id)}
                                    />
                                </td>
                                <td class="py-2">{e.expense_date}</td>
                                <td class="py-2 capitalize">{e.category}</td>
                                <td class="py-2 text-vscode-description"
                                    >{e.vendor ?? "—"}</td
                                >
                                <td
                                    class="max-w-xs truncate py-2 text-vscode-description"
                                >
                                    {e.description ?? "—"}
                                </td>
                                <td class="py-2 text-right font-semibold">
                                    {formatCurrency(
                                        Number(e.amount),
                                        e.currency,
                                    )}
                                </td>
                                <td class="py-2 text-right">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        class="opacity-0 transition-opacity group-hover:opacity-100 text-vscode-error"
                                        aria-label="Delete"
                                        onclick={() => remove(e.id)}
                                    >
                                        <Trash2 class="h-3.5 w-3.5" />
                                    </Button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </Card>
    {/if}
</div>

<BulkActionBar
    count={selected.size}
    label={selected.size === 1 ? "expense selected" : "expenses selected"}
    onclear={() => selected.clear()}
>
    {#snippet actions()}
        <Button variant="destructive" size="sm" onclick={bulkRemove}>
            <Trash2 class="h-3.5 w-3.5" /> Delete
        </Button>
    {/snippet}
</BulkActionBar>

<Dialog bind:open title="New expense" size="lg">
    <div class="grid gap-3 sm:grid-cols-2">
        <Field label="Amount">
            <Input type="number" step="0.01" bind:value={form.amount} />
        </Field>
        <Field label="Date">
            <Input type="date" bind:value={form.expense_date} />
        </Field>
        <Field label="Category">
            <Select bind:value={form.category}>
                {#each CATEGORIES as c (c)}
                    <option value={c}>{c}</option>
                {/each}
            </Select>
        </Field>
        <Field label="Project">
            <Select bind:value={form.project_id}>
                <option value="none">None</option>
                {#each projects as p (p.id)}
                    <option value={p.id}>{p.name}</option>
                {/each}
            </Select>
        </Field>
        <Field class="sm:col-span-2" label="Vendor">
            <Input bind:value={form.vendor} />
        </Field>
        <Field class="sm:col-span-2" label="Notes">
            <Input bind:value={form.description} />
        </Field>
    </div>
    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
        <Button variant="brand" onclick={create}>Create</Button>
    {/snippet}
</Dialog>
