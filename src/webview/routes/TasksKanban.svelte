<script lang="ts">
    // Kanban view for tasks. Mirrors the Leads kanban layout (Leads.svelte)
    // but binds to `tasks.status`. Within-column ordering is NOT persisted —
    // tasks have no `position` column, so order falls back to created_at desc
    // on refetch. The meaningful drag is between status columns; intra-column
    // reordering is a low-value workflow signal and is deliberately deferred
    // until/unless we add a position column in a later batch.

    import { toast } from "svelte-sonner";
    import { dndzone, type DndEvent } from "svelte-dnd-action";
    import { flip } from "svelte/animate";
    import { Trash2, List as ListIcon } from "lucide-svelte";
    import { link } from "svelte-spa-router";
    import { useQueryClient } from "@tanstack/svelte-query";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Badge from "../lib/components/ui/Badge.svelte";
    import { softDelete } from "../lib/softDelete";
    import { formatMinutes } from "../lib/utils";
    import {
        useTasksQuery,
        useUpdateTaskMutation,
        type Task,
    } from "../lib/queries/tasks";

    const STAGES = [
        { id: "todo", label: "To do" },
        { id: "in_progress", label: "In progress" },
        { id: "done", label: "Done" },
    ];

    const priorityTone: Record<string, "muted" | "info" | "warning" | "error"> =
        {
            low: "muted",
            medium: "info",
            high: "warning",
            urgent: "error",
        };

    const queryClient = useQueryClient();
    const tasksQuery = useTasksQuery();
    const updateMutation = useUpdateTaskMutation();

    // Local optimistic dnd state — synced from query data, mutated by drag.
    let columns = $state<Record<string, Task[]>>({});

    const tasks = $derived($tasksQuery.data ?? []);

    // Rebuild columns whenever tasks change (initial load + after mutations).
    $effect(() => {
        const map: Record<string, Task[]> = Object.fromEntries(
            STAGES.map((s) => [s.id, [] as Task[]]),
        );
        for (const t of tasks) {
            (map[t.status] ?? map["todo"]).push(t);
        }
        // No `position` field; fall back to created_at desc within each column.
        for (const k of Object.keys(map)) {
            map[k].sort(
                (a, b) =>
                    +new Date(b.created_at ?? 0) - +new Date(a.created_at ?? 0),
            );
        }
        columns = map;
    });

    function onConsider(stageId: string, e: CustomEvent<DndEvent<Task>>) {
        columns = { ...columns, [stageId]: e.detail.items };
    }

    async function onFinalize(stageId: string, e: CustomEvent<DndEvent<Task>>) {
        const newItems = e.detail.items;
        columns = { ...columns, [stageId]: newItems };
        // Diff against the task's own status — anything that landed in a
        // column other than its current status needs a server update.
        const moved = newItems.filter((t) => t.status !== stageId);
        for (const t of moved) {
            try {
                await $updateMutation.mutateAsync({
                    id: t.id,
                    patch: {
                        status: stageId,
                        completed_at:
                            stageId === "done"
                                ? new Date().toISOString()
                                : null,
                    },
                });
            } catch (err) {
                toast.error((err as Error).message);
            }
        }
    }

    async function remove(id: string) {
        await softDelete(queryClient, "tasks", [id]);
    }
</script>

<div class="p-6">
    <PageHeader
        title="Tasks"
        description="Drag between columns to update status."
    >
        {#snippet actions()}
            <a use:link href="/tasks">
                <Button variant="ghost" size="sm">
                    <ListIcon class="h-3.5 w-3.5" /> List view
                </Button>
            </a>
        {/snippet}
    </PageHeader>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {#each STAGES as stage (stage.id)}
            <div class="flex flex-col">
                <div class="mb-2 flex items-center justify-between px-1">
                    <h3
                        class="text-[11px] font-semibold uppercase tracking-wide text-vscode-description"
                    >
                        {stage.label}
                        <span class="ml-1 text-[10px]">
                            ({(columns[stage.id] ?? []).length})
                        </span>
                    </h3>
                </div>
                <div
                    class="min-h-50 flex-1 space-y-2 rounded-lg border border-vscode-card-border bg-vscode-muted-bg p-2"
                    use:dndzone={{
                        items: columns[stage.id] ?? [],
                        flipDurationMs: 150,
                        type: "task",
                    }}
                    onconsider={(e) =>
                        onConsider(stage.id, e as CustomEvent<DndEvent<Task>>)}
                    onfinalize={(e) =>
                        onFinalize(stage.id, e as CustomEvent<DndEvent<Task>>)}
                >
                    {#each columns[stage.id] ?? [] as task (task.id)}
                        <div
                            animate:flip={{ duration: 150 }}
                            class="group cursor-grab rounded-md border border-vscode-card-border bg-vscode-card-bg p-2 active:cursor-grabbing"
                        >
                            <div class="flex items-start justify-between gap-2">
                                <p
                                    class="min-w-0 flex-1 truncate text-sm font-medium"
                                >
                                    {task.title}
                                </p>
                                <Badge
                                    tone={priorityTone[task.priority] ??
                                        "muted"}
                                >
                                    {task.priority}
                                </Badge>
                            </div>
                            {#if task.description}
                                <p
                                    class="mt-1 line-clamp-2 text-[11px] text-vscode-description"
                                >
                                    {task.description}
                                </p>
                            {/if}
                            <div
                                class="mt-2 flex items-center justify-between text-[10px] text-vscode-description"
                            >
                                <span>
                                    {#if task.due_date}
                                        Due {task.due_date}
                                    {:else if task.time_spent_minutes > 0}
                                        {formatMinutes(task.time_spent_minutes)}
                                    {:else}
                                        &nbsp;
                                    {/if}
                                </span>
                                <button
                                    class="rounded p-1 text-vscode-error opacity-0 transition-opacity group-hover:opacity-100 hover:bg-vscode-list-hover"
                                    aria-label="Delete task"
                                    onclick={() => remove(task.id)}
                                >
                                    <Trash2 class="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    </div>
</div>
