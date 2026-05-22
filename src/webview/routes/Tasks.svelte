<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { toast } from "svelte-sonner";
    import {
        Plus,
        Trash2,
        Play,
        Square,
        Clock,
        ArrowDown,
        ArrowUp,
        Columns3,
    } from "lucide-svelte";
    import { link, push } from "svelte-spa-router";
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
    import { useQueryClient } from "@tanstack/svelte-query";
    import { softDelete } from "../lib/softDelete";
    import { commands } from "../lib/commands.svelte";
    import { _ } from "../i18n";
    import { formatMinutes } from "../lib/utils";
    import { writable } from "svelte/store";
    import {
        useTasksListQuery,
        useTaskCategoriesQuery,
        type TaskListFilters,
        type TaskListSort,
        useCreateTaskMutation,
        useUpdateTaskMutation,
        useStopTimerMutation,
        type Task,
    } from "../lib/queries/tasks";
    import { useProjectsQuery } from "../lib/queries/projects";

    const PRIORITIES = ["low", "medium", "high", "urgent"];
    const STATUSES = ["todo", "in_progress", "done"];

    const priorityTone: Record<string, "muted" | "info" | "warning" | "error"> =
        {
            low: "muted",
            medium: "info",
            high: "warning",
            urgent: "error",
        };

    const blank = {
        title: "",
        description: "",
        status: "todo",
        priority: "medium",
        due_date: "",
        project_id: "none",
    };

    const queryClient = useQueryClient();
    const projectsQuery = useProjectsQuery();
    const categoriesQuery = useTaskCategoriesQuery();
    const createMutation = useCreateTaskMutation();
    const updateMutation = useUpdateTaskMutation();
    const stopTimerMutation = useStopTimerMutation();

    let open = $state(false);
    let form = $state({ ...blank });
    let running = $state<{ taskId: string; startedAt: number } | null>(null);

    $effect(() =>
        commands.register({
            id: "primary-new",
            title: "New task",
            group: "Create",
            hint: "⌘N",
            run: () => {
                open = true;
            },
        }),
    );
    let now = $state(Date.now());
    let timer: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        timer = setInterval(() => (now = Date.now()), 1000);
    });
    onDestroy(() => {
        if (timer) {
            clearInterval(timer);
        }
    });

    const projects = $derived($projectsQuery.data ?? []);

    let filters = $state<TaskListFilters>({
        status: "",
        projectId: "",
        priority: "",
        category: "",
    });
    const taskCategories = $derived($categoriesQuery.data ?? []);
    let sort = $state<TaskListSort>({
        field: "created_at",
        direction: "desc",
    });

    const argsStore = writable<{
        filters: TaskListFilters;
        sort: TaskListSort;
    }>({
        // svelte-ignore state_referenced_locally
        filters: $state.snapshot(filters),
        // svelte-ignore state_referenced_locally
        sort: $state.snapshot(sort),
    });
    $effect(() => {
        argsStore.set({
            filters: $state.snapshot(filters),
            sort: $state.snapshot(sort),
        });
    });

    const tasksQuery = useTasksListQuery(argsStore);
    const tasks = $derived(($tasksQuery.data?.pages ?? []).flat() as Task[]);

    const filtersActive = $derived(
        !!filters.status ||
            !!filters.projectId ||
            !!filters.priority ||
            !!filters.category ||
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
        filters = { status: "", projectId: "", priority: "", category: "" };
        sort = { field: "created_at", direction: "desc" };
    }

    async function create() {
        if (!form.title.trim()) {
            toast.error("Title required");
            return;
        }
        try {
            await $createMutation.mutateAsync({
                title: form.title.trim().slice(0, 200),
                description: form.description.trim() || null,
                status: form.status,
                priority: form.priority,
                due_date: form.due_date || null,
                project_id: form.project_id === "none" ? null : form.project_id,
                time_spent_minutes: 0,
                completed_at: null,
            });
            toast.success("Task created");
            form = { ...blank };
            open = false;
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function toggleDone(t: Task) {
        const newStatus = t.status === "done" ? "todo" : "done";
        try {
            await $updateMutation.mutateAsync({
                id: t.id,
                patch: {
                    status: newStatus,
                    completed_at:
                        newStatus === "done" ? new Date().toISOString() : null,
                },
            });
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function remove(id: string) {
        await softDelete(queryClient, "tasks", [id]);
    }

    function startTimer(t: Task) {
        running = { taskId: t.id, startedAt: Date.now() };
    }

    async function stopTimer() {
        if (!running) {
            return;
        }
        const minutes = Math.max(
            1,
            Math.round((Date.now() - running.startedAt) / 60000),
        );
        const t = tasks.find((x) => x.id === running!.taskId);
        if (t) {
            try {
                await $stopTimerMutation.mutateAsync({
                    taskId: t.id,
                    projectId: t.project_id,
                    currentMinutes: t.time_spent_minutes,
                    addMinutes: minutes,
                    startedAt: new Date(running.startedAt).toISOString(),
                    endedAt: new Date().toISOString(),
                });
            } catch (e) {
                toast.error((e as Error).message);
            }
        }
        running = null;
    }

    function projectName(id: string | null) {
        return projects.find((p) => p.id === id)?.name;
    }

    const elapsed = $derived(
        running ? Math.floor((now - running.startedAt) / 1000) : 0,
    );
</script>

<div class="p-6">
    <PageHeader
        title={$_("page.tasks.title")}
        description={$_("page.tasks.description")}
    >
        {#snippet actions()}
            <a use:link href="/tasks/kanban">
                <Button variant="ghost" size="sm">
                    <Columns3 class="h-3.5 w-3.5" />
                    {$_("page.tasks.boardLink")}
                </Button>
            </a>
            <Button variant="brand" onclick={() => (open = true)}>
                <Plus class="h-4 w-4" />
                {$_("page.tasks.newAction")}
            </Button>
        {/snippet}
    </PageHeader>

    {#if $tasksQuery.isLoading}
        <div class="text-xs text-vscode-description">Loading…</div>
    {:else if tasks.length === 0}
        <Card>
            <EmptyState
                title="No tasks yet"
                description="Create tasks and track time against them."
            >
                {#snippet action()}
                    <Button variant="brand" onclick={() => (open = true)}>
                        <Plus class="h-4 w-4" /> New task
                    </Button>
                {/snippet}
            </EmptyState>
        </Card>
    {:else}
        <div class="mb-3 flex flex-wrap items-end gap-2">
            <Field label="Status">
                <Select bind:value={filters.status}>
                    <option value="">All</option>
                    {#each STATUSES as s (s)}
                        <option value={s}>{s.replace("_", " ")}</option>
                    {/each}
                </Select>
            </Field>
            <Field label="Project">
                <Select bind:value={filters.projectId}>
                    <option value="">All</option>
                    {#each projects as p (p.id)}
                        <option value={p.id}>{p.name}</option>
                    {/each}
                </Select>
            </Field>
            <Field label="Priority">
                <Select bind:value={filters.priority}>
                    <option value="">All</option>
                    {#each PRIORITIES as p (p)}
                        <option value={p}>{p}</option>
                    {/each}
                </Select>
            </Field>
            {#if taskCategories.length > 0}
                <Field label="Category">
                    <Select bind:value={filters.category}>
                        <option value="">All</option>
                        {#each taskCategories as c (c)}
                            <option value={c}>{c}</option>
                        {/each}
                    </Select>
                </Field>
            {/if}
            <Field label="Sort by">
                <Select bind:value={sort.field}>
                    <option value="created_at">Created</option>
                    <option value="due_date">Due date</option>
                    <option value="priority">Priority</option>
                    <option value="title">Title</option>
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
        <Card>
            <div class="divide-y divide-vscode-border">
                {#if tasks.length === 0}
                    <p class="py-6 text-center text-xs text-vscode-description">
                        No tasks match these filters.
                    </p>
                {/if}
                {#each tasks as t (t.id)}
                    {@const isRunning = running?.taskId === t.id}
                    {@const pn = projectName(t.project_id)}
                    <div class="group flex items-center gap-3 py-2">
                        <input
                            type="checkbox"
                            class="h-4 w-4"
                            checked={t.status === "done"}
                            onchange={() => toggleDone(t)}
                        />
                        <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    class="text-sm font-medium text-left hover:underline {t.status ===
                                    'done'
                                        ? 'line-through text-vscode-description'
                                        : ''}"
                                    onclick={() => push(`/tasks/${t.id}`)}
                                >
                                    {t.title}
                                </button>
                                <Badge
                                    tone={priorityTone[t.priority] ?? "muted"}
                                >
                                    {t.priority}
                                </Badge>
                                {#if pn}
                                    <span
                                        class="text-xs text-vscode-description"
                                    >
                                        · {pn}
                                    </span>
                                {/if}
                            </div>
                            <div
                                class="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-vscode-description"
                            >
                                {#if t.due_date}
                                    <span>Due {t.due_date}</span>
                                {/if}
                                {#if t.time_spent_minutes > 0}
                                    <span class="flex items-center gap-1">
                                        <Clock class="h-3 w-3" />
                                        {formatMinutes(t.time_spent_minutes)}
                                    </span>
                                {/if}
                                {#if isRunning}
                                    <span class="font-medium text-brand">
                                        + {Math.floor(elapsed / 60)}m {elapsed %
                                            60}s
                                    </span>
                                {/if}
                            </div>
                        </div>
                        {#if isRunning}
                            <Button
                                size="sm"
                                variant="outline"
                                onclick={stopTimer}
                            >
                                <Square class="h-3 w-3" /> Stop
                            </Button>
                        {:else}
                            <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Start timer"
                                onclick={() => startTimer(t)}
                                disabled={!!running}
                            >
                                <Play class="h-3.5 w-3.5" />
                            </Button>
                        {/if}
                        <Button
                            size="icon"
                            variant="ghost"
                            class="opacity-0 transition-opacity group-hover:opacity-100 text-vscode-error"
                            aria-label="Delete"
                            onclick={() => remove(t.id)}
                        >
                            <Trash2 class="h-3.5 w-3.5" />
                        </Button>
                    </div>
                {/each}
            </div>
        </Card>
        {#if $tasksQuery.hasNextPage}
            <div class="mt-3 flex justify-center">
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={$tasksQuery.isFetchingNextPage}
                    onclick={() => $tasksQuery.fetchNextPage()}
                >
                    {$tasksQuery.isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
            </div>
        {/if}
    {/if}
</div>

<Dialog bind:open title="New task" size="lg">
    <div class="grid gap-3 sm:grid-cols-2">
        <Field class="sm:col-span-2" label="Title" required>
            <Input bind:value={form.title} />
        </Field>
        <Field label="Project">
            <Select bind:value={form.project_id}>
                <option value="none">No project</option>
                {#each projects as p (p.id)}
                    <option value={p.id}>{p.name}</option>
                {/each}
            </Select>
        </Field>
        <Field label="Priority">
            <Select bind:value={form.priority}>
                {#each PRIORITIES as p (p)}
                    <option value={p}>{p}</option>
                {/each}
            </Select>
        </Field>
        <Field label="Status">
            <Select bind:value={form.status}>
                {#each STATUSES as s (s)}
                    <option value={s}>{s.replace("_", " ")}</option>
                {/each}
            </Select>
        </Field>
        <Field label="Due date">
            <Input type="date" bind:value={form.due_date} />
        </Field>
        <Field class="sm:col-span-2" label="Notes">
            <Textarea bind:value={form.description} rows={2} />
        </Field>
    </div>
    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
        <Button variant="brand" onclick={create}>Create</Button>
    {/snippet}
</Dialog>
