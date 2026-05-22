<script lang="ts">
    import { writable, derived as svelteDerived } from "svelte/store";
    import { toast } from "svelte-sonner";
    import { push, link } from "svelte-spa-router";
    import { createQuery } from "@tanstack/svelte-query";
    import {
        ArrowLeft,
        Pencil,
        Save,
        X,
        Calendar,
        Clock,
        FileText,
        Wallet,
    } from "lucide-svelte";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Textarea from "../lib/components/ui/Textarea.svelte";
    import Select from "../lib/components/ui/Select.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Badge from "../lib/components/ui/Badge.svelte";
    import EmptyState from "../lib/components/ui/EmptyState.svelte";
    import StatCard from "../lib/components/StatCard.svelte";
    import { profile } from "../lib/stores/profile.svelte";
    import { getSupabase } from "../lib/supabase";
    import { formatCurrency, formatMinutes } from "../lib/utils";
    import { qk } from "../lib/queries/keys";
    import {
        useUpdateProjectMutation,
        type Project,
    } from "../lib/queries/projects";
    import { useClientsQuery } from "../lib/queries/clients";
    import {
        useTasksQuery,
        useUpdateTaskMutation,
        useCreateTaskMutation,
        type Task,
    } from "../lib/queries/tasks";
    import { Plus } from "lucide-svelte";
    import { useInvoicesQuery } from "../lib/queries/invoices";
    import { useExpensesQuery } from "../lib/queries/expenses";
    import type { TimeEntry } from "../lib/queries/timeEntries";

    interface Props {
        params: { id: string };
    }
    let { params }: Props = $props();

    const idStore = writable("");
    $effect(() => {
        idStore.set(params.id);
    });

    const STATUSES = [
        { id: "planning", label: "Planning", tone: "info" as const },
        { id: "in_progress", label: "In Progress", tone: "brand" as const },
        { id: "on_hold", label: "On Hold", tone: "warning" as const },
        { id: "completed", label: "Completed", tone: "success" as const },
    ];

    const projectQuery = createQuery<Project | null, Error>(
        svelteDerived(idStore, ($id) => ({
            queryKey: qk.project($id),
            queryFn: async () => {
                const { data, error } = await getSupabase()
                    .from("projects")
                    .select("*")
                    .eq("id", $id)
                    .maybeSingle();
                if (error) {
                    throw error;
                }
                return (data as Project) ?? null;
            },
            enabled: !!$id,
        })),
    );

    const timeEntriesQuery = createQuery<TimeEntry[], Error>(
        svelteDerived(idStore, ($id) => ({
            queryKey: qk.timeEntries($id),
            queryFn: async () => {
                const { data, error } = await getSupabase()
                    .from("time_entries")
                    .select("*")
                    .eq("project_id", $id)
                    .order("started_at", { ascending: false });
                if (error) {
                    throw error;
                }
                return (data as TimeEntry[]) ?? [];
            },
            enabled: !!$id,
        })),
    );

    const clientsQuery = useClientsQuery();
    const tasksQuery = useTasksQuery();
    const invoicesQuery = useInvoicesQuery();
    const expensesQuery = useExpensesQuery();
    const updateMutation = useUpdateProjectMutation();
    const updateTaskMutation = useUpdateTaskMutation();
    const createTaskMutation = useCreateTaskMutation();

    const TASK_STATUSES = ["todo", "in_progress", "done"];
    const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];
    let newTaskTitle = $state("");

    async function patchTask(t: Task, p: Partial<Task>) {
        try {
            await $updateTaskMutation.mutateAsync({ id: t.id, patch: p });
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function addTask() {
        const title = newTaskTitle.trim();
        if (!title) return;
        try {
            await $createTaskMutation.mutateAsync({
                title: title.slice(0, 200),
                description: null,
                status: "todo",
                priority: "medium",
                due_date: null,
                project_id: params.id,
                time_spent_minutes: 0,
                completed_at: null,
            });
            newTaskTitle = "";
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    let editing = $state(false);
    let form = $state({
        name: "",
        description: "",
        status: "planning",
        client_id: "none",
        start_date: "",
        end_date: "",
        budget: "0",
    });

    const project = $derived($projectQuery.data ?? null);
    const clientName = $derived(
        ($clientsQuery.data ?? []).find((c) => c.id === project?.client_id)
            ?.name ?? null,
    );
    const tasks = $derived(
        ($tasksQuery.data ?? []).filter(
            (t) => t.project_id === params.id && !t.parent_task_id,
        ),
    );
    const invoices = $derived(
        ($invoicesQuery.data ?? []).filter((i) => i.project_id === params.id),
    );
    const expenses = $derived(
        ($expensesQuery.data ?? []).filter((e) => e.project_id === params.id),
    );
    const timeEntries = $derived($timeEntriesQuery.data ?? []);

    const totals = $derived.by(() => {
        const billed = invoices.reduce((s, i) => s + Number(i.total), 0);
        const paid = invoices
            .filter((i) => i.status === "paid")
            .reduce((s, i) => s + Number(i.total), 0);
        const expensesTotal = expenses.reduce(
            (s, e) => s + Number(e.amount),
            0,
        );
        const minutes = timeEntries.reduce(
            (s, t) => s + (t.duration_minutes ?? 0),
            0,
        );
        const taskMinutes = tasks.reduce(
            (s, t) => s + Number(t.time_spent_minutes ?? 0),
            0,
        );
        return {
            billed,
            paid,
            outstanding: billed - paid,
            expenses: expensesTotal,
            net: paid - expensesTotal,
            minutes: Math.max(minutes, taskMinutes),
        };
    });

    function statusInfo(id: string) {
        return STATUSES.find((s) => s.id === id) ?? STATUSES[0];
    }

    function startEdit() {
        if (!project) {
            return;
        }
        form = {
            name: project.name,
            description: project.description ?? "",
            status: project.status,
            client_id: project.client_id ?? "none",
            start_date: project.start_date ?? "",
            end_date: project.end_date ?? "",
            budget: String(project.budget ?? 0),
        };
        editing = true;
    }

    async function saveEdit() {
        if (!project) {
            return;
        }
        if (!form.name.trim()) {
            toast.error("Name required");
            return;
        }
        try {
            await $updateMutation.mutateAsync({
                id: project.id,
                patch: {
                    name: form.name.trim().slice(0, 200),
                    description: form.description.trim() || null,
                    status: form.status,
                    client_id:
                        form.client_id === "none" ? null : form.client_id,
                    start_date: form.start_date || null,
                    end_date: form.end_date || null,
                    budget: Number(form.budget) || 0,
                },
            });
            toast.success("Updated");
            editing = false;
        } catch (e) {
            toast.error((e as Error).message);
        }
    }
</script>

<div class="p-6">
    <Button
        size="sm"
        variant="ghost"
        class="mb-3"
        onclick={() => push("/projects")}
    >
        <ArrowLeft class="h-3.5 w-3.5" />
        All projects
    </Button>

    {#if $projectQuery.isLoading}
        <div class="text-xs text-vscode-description">Loading…</div>
    {:else if !project}
        <Card>
            <EmptyState
                title="Project not found"
                description="This project may have been deleted."
            />
        </Card>
    {:else}
        {@const s = statusInfo(project.status)}
        <PageHeader
            title={project.name}
            description={clientName ?? "No client"}
        >
            {#snippet actions()}
                {#if !editing}
                    <Button variant="outline" size="sm" onclick={startEdit}>
                        <Pencil class="h-3.5 w-3.5" /> Edit
                    </Button>
                {:else}
                    <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => (editing = false)}
                    >
                        <X class="h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button variant="brand" size="sm" onclick={saveEdit}>
                        <Save class="h-3.5 w-3.5" /> Save
                    </Button>
                {/if}
            {/snippet}
        </PageHeader>

        <div class="mb-4 grid gap-3 sm:grid-cols-4">
            <StatCard
                label="Billed"
                value={formatCurrency(totals.billed, profile.currency)}
                accent="brand"
            />
            <StatCard
                label="Outstanding"
                value={formatCurrency(totals.outstanding, profile.currency)}
                accent={totals.outstanding > 0 ? "warning" : "muted"}
            />
            <StatCard
                label="Expenses"
                value={formatCurrency(totals.expenses, profile.currency)}
                accent="warning"
            />
            <StatCard
                label="Net (paid − expenses)"
                value={formatCurrency(totals.net, profile.currency)}
                accent={totals.net >= 0 ? "success" : "warning"}
            />
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
            <div class="space-y-4 lg:col-span-2">
                <Card title="Project info">
                    {#if editing}
                        <div class="grid gap-3 sm:grid-cols-2">
                            <Field class="sm:col-span-2" label="Name" required>
                                <Input bind:value={form.name} />
                            </Field>
                            <Field label="Client">
                                <Select bind:value={form.client_id}>
                                    <option value="none">No client</option>
                                    {#each $clientsQuery.data ?? [] as c (c.id)}
                                        <option value={c.id}>{c.name}</option>
                                    {/each}
                                </Select>
                            </Field>
                            <Field label="Status">
                                <Select bind:value={form.status}>
                                    {#each STATUSES as st (st.id)}
                                        <option value={st.id}>{st.label}</option
                                        >
                                    {/each}
                                </Select>
                            </Field>
                            <Field label="Start date">
                                <Input
                                    type="date"
                                    bind:value={form.start_date}
                                />
                            </Field>
                            <Field label="End date">
                                <Input type="date" bind:value={form.end_date} />
                            </Field>
                            <Field class="sm:col-span-2" label="Budget">
                                <Input
                                    type="number"
                                    step="0.01"
                                    bind:value={form.budget}
                                />
                            </Field>
                            <Field class="sm:col-span-2" label="Description">
                                <Textarea
                                    bind:value={form.description}
                                    rows={3}
                                />
                            </Field>
                        </div>
                    {:else}
                        <div class="space-y-3 text-sm">
                            <div class="flex flex-wrap items-center gap-2">
                                <Badge tone={s.tone}>{s.label}</Badge>
                                {#if project.start_date}
                                    <span
                                        class="flex items-center gap-1 text-xs text-vscode-description"
                                    >
                                        <Calendar class="h-3 w-3" />
                                        {project.start_date}
                                    </span>
                                {/if}
                                {#if project.end_date}
                                    <span
                                        class="flex items-center gap-1 text-xs text-vscode-description"
                                    >
                                        → {project.end_date}
                                    </span>
                                {/if}
                                <span class="ml-auto font-semibold">
                                    Budget: {formatCurrency(
                                        Number(project.budget),
                                        profile.currency,
                                    )}
                                </span>
                            </div>
                            {#if project.description}
                                <p
                                    class="whitespace-pre-wrap text-vscode-description"
                                >
                                    {project.description}
                                </p>
                            {/if}
                            {#if totals.minutes > 0}
                                <p
                                    class="flex items-center gap-1.5 text-xs text-vscode-description"
                                >
                                    <Clock class="h-3 w-3" />
                                    Time logged: {formatMinutes(totals.minutes)}
                                </p>
                            {/if}
                        </div>
                    {/if}
                </Card>

                <Card title="Tasks">
                    <div class="mb-3 flex gap-2">
                        <Input
                            bind:value={newTaskTitle}
                            placeholder="Add a task to this project…"
                            onkeydown={(e: KeyboardEvent) => {
                                if (e.key === "Enter") addTask();
                            }}
                        />
                        <Button size="icon" variant="brand" onclick={addTask}>
                            <Plus class="h-4 w-4" />
                        </Button>
                    </div>
                    {#if tasks.length === 0}
                        <EmptyState
                            title="No tasks yet"
                            description="Add a task above to track work on this project."
                        />
                    {:else}
                        <ul class="divide-y divide-vscode-border">
                            {#each tasks as t (t.id)}
                                <li
                                    class="flex items-center justify-between gap-2 py-2 text-sm"
                                >
                                    <button
                                        type="button"
                                        class="min-w-0 flex-1 truncate text-left hover:underline {t.status ===
                                        'done'
                                            ? 'line-through text-vscode-description'
                                            : ''}"
                                        onclick={() => push(`/tasks/${t.id}`)}
                                    >
                                        {t.title}
                                        {#if t.category}
                                            <span
                                                class="ml-1 rounded-full bg-vscode-muted-bg px-1.5 py-0.5 text-[10px] text-vscode-description"
                                                >{t.category}</span
                                            >
                                        {/if}
                                    </button>
                                    <Input
                                        type="date"
                                        class="w-auto"
                                        value={t.due_date ?? ""}
                                        onchange={(e: Event) =>
                                            patchTask(t, {
                                                due_date:
                                                    (
                                                        e.target as HTMLInputElement
                                                    ).value || null,
                                            })}
                                    />
                                    <Select
                                        value={t.priority}
                                        onchange={(e: Event) =>
                                            patchTask(t, {
                                                priority: (
                                                    e.target as HTMLSelectElement
                                                ).value,
                                            })}
                                    >
                                        {#each TASK_PRIORITIES as p (p)}
                                            <option value={p}>{p}</option>
                                        {/each}
                                    </Select>
                                    <Select
                                        value={t.status}
                                        onchange={(e: Event) => {
                                            const v = (
                                                e.target as HTMLSelectElement
                                            ).value;
                                            patchTask(t, {
                                                status: v,
                                                completed_at:
                                                    v === "done"
                                                        ? new Date().toISOString()
                                                        : null,
                                            });
                                        }}
                                    >
                                        {#each TASK_STATUSES as s (s)}
                                            <option value={s}>{s}</option>
                                        {/each}
                                    </Select>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </Card>
            </div>

            <div class="space-y-4">
                <Card title="Invoices">
                    {#if invoices.length === 0}
                        <p
                            class="py-4 text-center text-xs text-vscode-description"
                        >
                            No invoices.
                        </p>
                    {:else}
                        <ul class="divide-y divide-vscode-border">
                            {#each invoices as inv (inv.id)}
                                <li
                                    class="flex items-center justify-between gap-3 py-2 text-sm"
                                >
                                    <a
                                        use:link
                                        href="/invoices"
                                        class="flex items-center gap-2 hover:underline"
                                    >
                                        <FileText class="h-3.5 w-3.5" />
                                        {inv.invoice_number}
                                    </a>
                                    <span
                                        class="font-medium text-vscode-description"
                                    >
                                        {formatCurrency(
                                            Number(inv.total),
                                            inv.currency,
                                        )}
                                    </span>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </Card>

                <Card title="Expenses">
                    {#if expenses.length === 0}
                        <p
                            class="py-4 text-center text-xs text-vscode-description"
                        >
                            No expenses.
                        </p>
                    {:else}
                        <ul class="divide-y divide-vscode-border">
                            {#each expenses as e (e.id)}
                                <li
                                    class="flex items-center justify-between gap-3 py-2 text-sm"
                                >
                                    <span class="flex items-center gap-2">
                                        <Wallet class="h-3.5 w-3.5" />
                                        <span class="capitalize">
                                            {e.category}
                                        </span>
                                    </span>
                                    <span class="font-medium">
                                        {formatCurrency(
                                            Number(e.amount),
                                            e.currency,
                                        )}
                                    </span>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </Card>
            </div>
        </div>
    {/if}
</div>
