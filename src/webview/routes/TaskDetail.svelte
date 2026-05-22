<script lang="ts">
    import { writable } from "svelte/store";
    import { toast } from "svelte-sonner";
    import { push } from "svelte-spa-router";
    import { formatDistanceToNow } from "date-fns";
    import { dndzone, type DndEvent } from "svelte-dnd-action";
    import { flip } from "svelte/animate";
    import {
        ArrowLeft,
        GripVertical,
        Plus,
        StickyNote,
        Trash2,
    } from "lucide-svelte";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Textarea from "../lib/components/ui/Textarea.svelte";
    import Select from "../lib/components/ui/Select.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import EmptyState from "../lib/components/ui/EmptyState.svelte";
    import { softDelete } from "../lib/softDelete";
    import { useQueryClient } from "@tanstack/svelte-query";
    import {
        useTaskQuery,
        useSubtasksQuery,
        useTaskCategoriesQuery,
        useUpdateTaskMutation,
        useCreateTaskMutation,
        useReorderSubtasksMutation,
        type Task,
    } from "../lib/queries/tasks";
    import { useProjectsQuery } from "../lib/queries/projects";
    import {
        useTaskCommunicationLogsQuery,
        useCreateTaskCommunicationLogMutation,
    } from "../lib/queries/communicationLogs";

    interface Props {
        params: { id: string };
    }
    let { params }: Props = $props();

    const idStore = writable("");
    $effect(() => idStore.set(params.id));

    const queryClient = useQueryClient();
    const taskQuery = useTaskQuery(idStore);
    const subtasksQuery = useSubtasksQuery(idStore);
    const categoriesQuery = useTaskCategoriesQuery();
    const projectsQuery = useProjectsQuery();
    const updateMutation = useUpdateTaskMutation();
    const createMutation = useCreateTaskMutation();
    const reorderMutation = useReorderSubtasksMutation();
    // Activity log hooks key on the id at mount — svelte-spa-router mounts a
    // fresh TaskDetail when arriving from the list/kanban (the common path).
    // svelte-ignore state_referenced_locally
    const logsQuery = useTaskCommunicationLogsQuery(params.id);
    // svelte-ignore state_referenced_locally
    const createLogMutation = useCreateTaskCommunicationLogMutation(params.id);

    const PRIORITIES = ["low", "medium", "high", "urgent"];
    const STATUSES = ["todo", "in_progress", "done"];
    const LOG_TYPES = ["note", "comment", "call", "email", "meeting"];

    const task = $derived($taskQuery.data ?? null);
    const categories = $derived($categoriesQuery.data ?? []);
    const projects = $derived($projectsQuery.data ?? []);
    const logs = $derived($logsQuery.data ?? []);

    let logForm = $state({ type: "note", title: "", content: "" });

    // Local optimistic order for drag-and-drop — synced from query data,
    // mutated by drag, persisted on finalize.
    let subtasks = $state<Task[]>([]);
    $effect(() => {
        subtasks = $subtasksQuery.data ?? [];
    });

    let newSubtask = $state("");

    function onConsider(e: CustomEvent<DndEvent<Task>>) {
        subtasks = e.detail.items;
    }

    async function onFinalize(e: CustomEvent<DndEvent<Task>>) {
        subtasks = e.detail.items;
        if (!task) return;
        try {
            await $reorderMutation.mutateAsync({
                parentId: task.id,
                orderedIds: subtasks.map((s) => s.id),
            });
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function patch(p: Partial<Task>) {
        if (!task) return;
        try {
            await $updateMutation.mutateAsync({ id: task.id, patch: p });
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function addSubtask() {
        const title = newSubtask.trim();
        if (!title || !task) return;
        try {
            await $createMutation.mutateAsync({
                title: title.slice(0, 200),
                description: null,
                status: "todo",
                priority: "medium",
                due_date: null,
                project_id: task.project_id,
                parent_task_id: task.id,
                time_spent_minutes: 0,
                completed_at: null,
            });
            newSubtask = "";
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function toggleSubtask(st: Task) {
        const next = st.status === "done" ? "todo" : "done";
        try {
            await $updateMutation.mutateAsync({
                id: st.id,
                patch: {
                    status: next,
                    completed_at:
                        next === "done" ? new Date().toISOString() : null,
                },
            });
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function removeSubtask(id: string) {
        await softDelete(queryClient, "tasks", [id]);
    }

    async function addLog() {
        if (!logForm.title.trim() && !logForm.content.trim()) {
            toast.error("Add a title or content");
            return;
        }
        try {
            await $createLogMutation.mutateAsync({
                type: logForm.type,
                title: logForm.title.trim() || null,
                content: logForm.content.trim() || null,
                occurred_at: new Date().toISOString(),
            });
            logForm = { type: "note", title: "", content: "" };
            toast.success("Added");
        } catch (e) {
            toast.error((e as Error).message);
        }
    }
</script>

<div class="p-6">
    <button
        class="mb-4 flex items-center gap-1 text-xs text-vscode-description hover:text-vscode-fg"
        onclick={() => push("/tasks")}
    >
        <ArrowLeft class="h-3.5 w-3.5" /> Back to tasks
    </button>

    {#if $taskQuery.isLoading}
        <div class="text-xs text-vscode-description">Loading…</div>
    {:else if !task}
        <Card>
            <EmptyState
                title="Task not found"
                description="This task may have been deleted."
            />
        </Card>
    {:else}
        <PageHeader title={task.title} description="Task detail" />

        <div class="grid gap-4 lg:grid-cols-3">
            <Card title="Details" class="lg:col-span-2">
                <div class="grid gap-3 sm:grid-cols-2">
                    <Field class="sm:col-span-2" label="Title">
                        <Input
                            value={task.title}
                            onchange={(e: Event) =>
                                patch({
                                    title: (
                                        e.target as HTMLInputElement
                                    ).value.slice(0, 200),
                                })}
                        />
                    </Field>
                    <Field label="Status">
                        <Select
                            value={task.status}
                            onchange={(e: Event) =>
                                patch({
                                    status: (e.target as HTMLSelectElement)
                                        .value,
                                    completed_at:
                                        (e.target as HTMLSelectElement)
                                            .value === "done"
                                            ? new Date().toISOString()
                                            : null,
                                })}
                        >
                            {#each STATUSES as s (s)}
                                <option value={s}>{s}</option>
                            {/each}
                        </Select>
                    </Field>
                    <Field label="Priority">
                        <Select
                            value={task.priority}
                            onchange={(e: Event) =>
                                patch({
                                    priority: (e.target as HTMLSelectElement)
                                        .value,
                                })}
                        >
                            {#each PRIORITIES as p (p)}
                                <option value={p}>{p}</option>
                            {/each}
                        </Select>
                    </Field>
                    <Field label="Due date">
                        <Input
                            type="date"
                            value={task.due_date ?? ""}
                            onchange={(e: Event) =>
                                patch({
                                    due_date:
                                        (e.target as HTMLInputElement).value ||
                                        null,
                                })}
                        />
                    </Field>
                    <Field label="Category">
                        <Input
                            list="task-categories"
                            value={task.category ?? ""}
                            placeholder="e.g. Design, Dev, Admin"
                            onchange={(e: Event) =>
                                patch({
                                    category:
                                        (
                                            e.target as HTMLInputElement
                                        ).value.trim() || null,
                                })}
                        />
                        <datalist id="task-categories">
                            {#each categories as c (c)}
                                <option value={c}></option>
                            {/each}
                        </datalist>
                    </Field>
                    <Field class="sm:col-span-2" label="Project">
                        <Select
                            value={task.project_id ?? "none"}
                            onchange={(e: Event) => {
                                const v = (e.target as HTMLSelectElement).value;
                                patch({ project_id: v === "none" ? null : v });
                            }}
                        >
                            <option value="none">No project</option>
                            {#each projects as p (p.id)}
                                <option value={p.id}>{p.name}</option>
                            {/each}
                        </Select>
                    </Field>
                </div>
            </Card>

            <Card title="Subtasks">
                <div class="mb-3 flex gap-2">
                    <Input
                        bind:value={newSubtask}
                        placeholder="Add a subtask…"
                        onkeydown={(e: KeyboardEvent) => {
                            if (e.key === "Enter") addSubtask();
                        }}
                    />
                    <Button size="icon" variant="brand" onclick={addSubtask}>
                        <Plus class="h-4 w-4" />
                    </Button>
                </div>
                {#if subtasks.length === 0}
                    <p class="text-xs text-vscode-description">
                        No subtasks yet.
                    </p>
                {:else}
                    <ul
                        class="divide-y divide-vscode-border"
                        use:dndzone={{
                            items: subtasks,
                            flipDurationMs: 150,
                            type: "subtask",
                            dropTargetStyle: {},
                        }}
                        onconsider={(e) =>
                            onConsider(e as CustomEvent<DndEvent<Task>>)}
                        onfinalize={(e) =>
                            onFinalize(e as CustomEvent<DndEvent<Task>>)}
                    >
                        {#each subtasks as st (st.id)}
                            <li
                                animate:flip={{ duration: 150 }}
                                class="group flex items-center justify-between gap-2 py-2 text-sm"
                            >
                                <div class="flex min-w-0 items-center gap-2">
                                    <span
                                        class="cursor-grab text-vscode-description active:cursor-grabbing"
                                        aria-label="Drag to reorder"
                                    >
                                        <GripVertical class="h-3.5 w-3.5" />
                                    </span>
                                    <label class="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={st.status === "done"}
                                            onchange={() => toggleSubtask(st)}
                                        />
                                        <span
                                            class:line-through={st.status ===
                                                "done"}
                                            class:text-vscode-description={st.status ===
                                                "done"}
                                        >
                                            {st.title}
                                        </span>
                                    </label>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    class="text-vscode-error opacity-0 transition-opacity group-hover:opacity-100"
                                    aria-label="Delete subtask"
                                    onclick={() => removeSubtask(st.id)}
                                >
                                    <Trash2 class="h-3.5 w-3.5" />
                                </Button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </Card>

            <Card title="Activity" class="lg:col-span-3">
                <div class="mb-4 space-y-2 border-b border-vscode-border pb-4">
                    <Select bind:value={logForm.type}>
                        {#each LOG_TYPES as t (t)}
                            <option value={t}>{t}</option>
                        {/each}
                    </Select>
                    <Input placeholder="Title" bind:value={logForm.title} />
                    <Textarea
                        placeholder="What happened?"
                        rows={2}
                        bind:value={logForm.content}
                    />
                    <Button
                        variant="brand"
                        size="sm"
                        class="w-full"
                        onclick={addLog}
                    >
                        <Plus class="h-3.5 w-3.5" /> Add
                    </Button>
                </div>
                {#if logs.length === 0}
                    <p class="text-xs text-vscode-description">
                        No activity yet.
                    </p>
                {:else}
                    <ul class="space-y-3">
                        {#each logs as log (log.id)}
                            <li class="flex gap-2 text-sm">
                                <StickyNote
                                    class="mt-0.5 h-3.5 w-3.5 shrink-0 text-vscode-description"
                                />
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2">
                                        <span class="font-medium"
                                            >{log.title || log.type}</span
                                        >
                                        <span
                                            class="text-[11px] text-vscode-description"
                                        >
                                            {formatDistanceToNow(
                                                new Date(log.occurred_at),
                                                { addSuffix: true },
                                            )}
                                        </span>
                                    </div>
                                    {#if log.content}
                                        <p
                                            class="text-xs text-vscode-description"
                                        >
                                            {log.content}
                                        </p>
                                    {/if}
                                </div>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </Card>
        </div>
    {/if}
</div>
