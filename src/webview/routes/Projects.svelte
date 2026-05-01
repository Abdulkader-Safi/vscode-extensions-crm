<script lang="ts">
    import { toast } from "svelte-sonner";
    import {
        Plus,
        Trash2,
        Pencil,
        Calendar,
        ArrowDown,
        ArrowUp,
    } from "lucide-svelte";
    import { push } from "svelte-spa-router";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Textarea from "../lib/components/ui/Textarea.svelte";
    import Select from "../lib/components/ui/Select.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Dialog from "../lib/components/ui/Dialog.svelte";
    import Badge from "../lib/components/ui/Badge.svelte";
    import EmptyState from "../lib/components/ui/EmptyState.svelte";
    import { confirm } from "../lib/confirm.svelte";
    import { profile } from "../lib/stores/profile.svelte";
    import { formatCurrency } from "../lib/utils";
    import { compareBy, type SortDir } from "../lib/sort";
    import {
        useProjectsQuery,
        useCreateProjectMutation,
        useUpdateProjectMutation,
        useDeleteProjectMutation,
        type Project,
    } from "../lib/queries/projects";
    import { useClientsQuery } from "../lib/queries/clients";

    const STATUSES = [
        { id: "planning", label: "Planning", tone: "info" as const },
        { id: "in_progress", label: "In Progress", tone: "brand" as const },
        { id: "on_hold", label: "On Hold", tone: "warning" as const },
        { id: "completed", label: "Completed", tone: "success" as const },
    ];

    const blank = {
        name: "",
        description: "",
        status: "planning",
        client_id: "none",
        start_date: "",
        end_date: "",
        budget: "0",
    };

    const projectsQuery = useProjectsQuery();
    const clientsQuery = useClientsQuery();
    const createMutation = useCreateProjectMutation();
    const updateMutation = useUpdateProjectMutation();
    const deleteMutation = useDeleteProjectMutation();

    let open = $state(false);
    let editing = $state<Project | null>(null);
    let form = $state({ ...blank });

    const projects = $derived($projectsQuery.data ?? []);
    const clients = $derived($clientsQuery.data ?? []);

    type SortField = "created_at" | "name" | "end_date" | "budget";
    let filters = $state({ status: "", clientId: "" });
    let sort = $state<{ field: SortField; direction: SortDir }>({
        field: "created_at",
        direction: "desc",
    });

    const filteredSorted = $derived.by(() => {
        const filtered = projects.filter(
            (p) =>
                (!filters.status || p.status === filters.status) &&
                (!filters.clientId || p.client_id === filters.clientId),
        );
        const sortKey: (p: Project) => unknown =
            sort.field === "budget"
                ? (p) => Number(p.budget ?? 0)
                : (p) => p[sort.field];
        return [...filtered].sort(compareBy(sortKey, sort.direction));
    });

    const filtersActive = $derived(
        !!filters.status ||
            !!filters.clientId ||
            sort.field !== "created_at" ||
            sort.direction !== "desc",
    );

    function toggleDirection() {
        sort = {
            field: sort.field,
            direction: sort.direction === "asc" ? "desc" : "asc",
        };
    }

    function clearFilters() {
        filters = { status: "", clientId: "" };
        sort = { field: "created_at", direction: "desc" };
    }

    function openNew() {
        editing = null;
        form = { ...blank };
        open = true;
    }
    function openEdit(p: Project) {
        editing = p;
        form = {
            name: p.name,
            description: p.description ?? "",
            status: p.status,
            client_id: p.client_id ?? "none",
            start_date: p.start_date ?? "",
            end_date: p.end_date ?? "",
            budget: String(p.budget ?? 0),
        };
        open = true;
    }

    function navigateToDetail(p: Project) {
        push(`/projects/${p.id}`);
    }

    async function save() {
        if (!form.name.trim()) {
            toast.error("Name required");
            return;
        }
        const payload = {
            name: form.name.trim().slice(0, 200),
            description: form.description.trim() || null,
            status: form.status,
            client_id: form.client_id === "none" ? null : form.client_id,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            budget: Number(form.budget) || 0,
        };
        try {
            if (editing) {
                await $updateMutation.mutateAsync({
                    id: editing.id,
                    patch: payload,
                });
                toast.success("Updated");
            } else {
                await $createMutation.mutateAsync(payload);
                toast.success("Project created");
            }
            open = false;
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function remove(id: string) {
        if (
            !(await confirm({
                title: "Delete project?",
                message: "Tasks linked to this project will be removed too.",
                confirmLabel: "Delete",
                destructive: true,
            }))
        ) {
            return;
        }
        try {
            await $deleteMutation.mutateAsync(id);
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    function clientName(id: string | null) {
        return clients.find((c) => c.id === id)?.name ?? "—";
    }
    function statusInfo(id: string) {
        return STATUSES.find((s) => s.id === id) ?? STATUSES[0];
    }
</script>

<div class="p-6">
    <PageHeader title="Projects" description="Track all the work you're doing.">
        {#snippet actions()}
            <Button variant="brand" onclick={openNew}>
                <Plus class="h-4 w-4" /> New project
            </Button>
        {/snippet}
    </PageHeader>

    {#if $projectsQuery.isLoading}
        <div class="text-xs text-vscode-description">Loading…</div>
    {:else if projects.length === 0}
        <Card>
            <EmptyState
                title="No projects yet"
                description="Track the work you're doing for clients."
            >
                {#snippet action()}
                    <Button variant="brand" onclick={openNew}>
                        <Plus class="h-4 w-4" /> Create project
                    </Button>
                {/snippet}
            </EmptyState>
        </Card>
    {:else}
        <div class="mb-3 flex flex-wrap items-end gap-2">
            <Field label="Status">
                <Select bind:value={filters.status}>
                    <option value="">All</option>
                    {#each STATUSES as s (s.id)}
                        <option value={s.id}>{s.label}</option>
                    {/each}
                </Select>
            </Field>
            <Field label="Client">
                <Select bind:value={filters.clientId}>
                    <option value="">All</option>
                    {#each clients as c (c.id)}
                        <option value={c.id}>{c.name}</option>
                    {/each}
                </Select>
            </Field>
            <Field label="Sort by">
                <Select bind:value={sort.field}>
                    <option value="created_at">Created</option>
                    <option value="name">Name</option>
                    <option value="end_date">End date</option>
                    <option value="budget">Budget</option>
                </Select>
            </Field>
            <Button
                variant="outline"
                size="icon"
                aria-label={sort.direction === "asc"
                    ? "Sort ascending"
                    : "Sort descending"}
                onclick={toggleDirection}
            >
                {#if sort.direction === "asc"}
                    <ArrowUp class="h-3.5 w-3.5" />
                {:else}
                    <ArrowDown class="h-3.5 w-3.5" />
                {/if}
            </Button>
            {#if filtersActive}
                <Button variant="ghost" size="sm" onclick={clearFilters}>
                    Clear
                </Button>
            {/if}
        </div>
        {#if filteredSorted.length === 0}
            <Card>
                <p class="py-6 text-center text-xs text-vscode-description">
                    No projects match these filters.
                </p>
            </Card>
        {:else}
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each filteredSorted as p (p.id)}
                {@const s = statusInfo(p.status)}
                <Card class="group cursor-pointer" onclick={() => navigateToDetail(p)}>
                    <div class="mb-2 flex items-start justify-between">
                        <div class="min-w-0">
                            <h3 class="truncate text-sm font-semibold">
                                {p.name}
                            </h3>
                            <p class="mt-0.5 text-xs text-vscode-description">
                                {clientName(p.client_id)}
                            </p>
                        </div>
                        <div class="flex opacity-0 group-hover:opacity-100">
                            <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Edit"
                                onclick={(e: MouseEvent) => {
                                    e.stopPropagation();
                                    openEdit(p);
                                }}
                            >
                                <Pencil class="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                class="text-vscode-error"
                                aria-label="Delete"
                                onclick={(e: MouseEvent) => {
                                    e.stopPropagation();
                                    remove(p.id);
                                }}
                            >
                                <Trash2 class="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                    <Badge tone={s.tone}>{s.label}</Badge>
                    {#if p.description}
                        <p
                            class="mt-3 line-clamp-2 text-xs text-vscode-description"
                        >
                            {p.description}
                        </p>
                    {/if}
                    <div
                        class="mt-3 flex items-center justify-between text-xs text-vscode-description"
                    >
                        {#if p.end_date}
                            <span class="flex items-center gap-1">
                                <Calendar class="h-3 w-3" />
                                {p.end_date}
                            </span>
                        {:else}<span></span>{/if}
                        <span class="font-medium text-vscode-fg">
                            {formatCurrency(Number(p.budget), profile.currency)}
                        </span>
                    </div>
                </Card>
            {/each}
        </div>
        {/if}
    {/if}
</div>

<Dialog bind:open title={editing ? "Edit project" : "New project"} size="lg">
    <div class="grid gap-3 sm:grid-cols-2">
        <Field class="sm:col-span-2" label="Name" required>
            <Input bind:value={form.name} />
        </Field>
        <Field label="Client">
            <Select bind:value={form.client_id}>
                <option value="none">No client</option>
                {#each clients as c (c.id)}
                    <option value={c.id}>{c.name}</option>
                {/each}
            </Select>
        </Field>
        <Field label="Status">
            <Select bind:value={form.status}>
                {#each STATUSES as s (s.id)}
                    <option value={s.id}>{s.label}</option>
                {/each}
            </Select>
        </Field>
        <Field label="Start date">
            <Input type="date" bind:value={form.start_date} />
        </Field>
        <Field label="End date">
            <Input type="date" bind:value={form.end_date} />
        </Field>
        <Field class="sm:col-span-2" label="Budget">
            <Input type="number" step="0.01" bind:value={form.budget} />
        </Field>
        <Field class="sm:col-span-2" label="Description">
            <Textarea bind:value={form.description} rows={3} />
        </Field>
    </div>
    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
        <Button variant="brand" onclick={save}>
            {editing ? "Update" : "Create"}
        </Button>
    {/snippet}
</Dialog>
