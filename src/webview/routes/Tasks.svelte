<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { toast } from "svelte-sonner";
    import { Plus, Trash2, Play, Square, Clock } from "lucide-svelte";
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
    import { getSupabase } from "../lib/supabase";
    import { auth } from "../lib/stores/auth.svelte";
    import { confirm } from "../lib/confirm.svelte";
    import { formatMinutes } from "../lib/utils";

    type Task = {
        id: string;
        title: string;
        description: string | null;
        status: string;
        priority: string;
        due_date: string | null;
        project_id: string | null;
        time_spent_minutes: number;
        completed_at: string | null;
    };
    type Project = { id: string; name: string };

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

    let tasks = $state<Task[]>([]);
    let projects = $state<Project[]>([]);
    let loaded = $state(false);
    let open = $state(false);
    let form = $state({ ...blank });
    let running = $state<{ taskId: string; startedAt: number } | null>(null);
    let now = $state(Date.now());
    let timer: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        load();
        timer = setInterval(() => (now = Date.now()), 1000);
    });
    onDestroy(() => {
        if (timer) {
            clearInterval(timer);
        }
    });

    async function load() {
        if (!auth.user) {
            return;
        }
        const supa = getSupabase();
        const [t, p] = await Promise.all([
            supa
                .from("tasks")
                .select("*")
                .eq("user_id", auth.user.id)
                .order("created_at", { ascending: false }),
            supa.from("projects").select("id,name").eq("user_id", auth.user.id),
        ]);
        tasks = (t.data as Task[]) ?? [];
        projects = (p.data as Project[]) ?? [];
        loaded = true;
    }

    async function create() {
        if (!auth.user || !form.title.trim()) {
            toast.error("Title required");
            return;
        }
        const { error } = await getSupabase()
            .from("tasks")
            .insert({
                user_id: auth.user.id,
                title: form.title.trim().slice(0, 200),
                description: form.description.trim() || null,
                status: form.status,
                priority: form.priority,
                due_date: form.due_date || null,
                project_id: form.project_id === "none" ? null : form.project_id,
            });
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("Task created");
        form = { ...blank };
        open = false;
        load();
    }

    async function toggleDone(t: Task) {
        const newStatus = t.status === "done" ? "todo" : "done";
        await getSupabase()
            .from("tasks")
            .update({
                status: newStatus,
                completed_at:
                    newStatus === "done" ? new Date().toISOString() : null,
            })
            .eq("id", t.id);
        load();
    }

    async function remove(id: string) {
        if (
            !(await confirm({
                title: "Delete task?",
                confirmLabel: "Delete",
                destructive: true,
            }))
        ) {
            return;
        }
        await getSupabase().from("tasks").delete().eq("id", id);
        load();
    }

    function startTimer(t: Task) {
        running = { taskId: t.id, startedAt: Date.now() };
    }

    async function stopTimer() {
        if (!running || !auth.user) {
            return;
        }
        const minutes = Math.max(
            1,
            Math.round((Date.now() - running.startedAt) / 60000),
        );
        const t = tasks.find((x) => x.id === running!.taskId);
        if (t) {
            const supa = getSupabase();
            await supa
                .from("tasks")
                .update({
                    time_spent_minutes: t.time_spent_minutes + minutes,
                })
                .eq("id", t.id);
            await supa.from("time_entries").insert({
                user_id: auth.user.id,
                task_id: t.id,
                project_id: t.project_id,
                started_at: new Date(running.startedAt).toISOString(),
                ended_at: new Date().toISOString(),
                duration_minutes: minutes,
            });
        }
        running = null;
        load();
    }

    function projectName(id: string | null) {
        return projects.find((p) => p.id === id)?.name;
    }

    const elapsed = $derived(
        running ? Math.floor((now - running.startedAt) / 1000) : 0,
    );
</script>

<div class="p-6">
    <PageHeader title="Tasks" description="Stay on top of every deliverable.">
        {#snippet actions()}
            <Button variant="brand" onclick={() => (open = true)}>
                <Plus class="h-4 w-4" /> New task
            </Button>
        {/snippet}
    </PageHeader>

    {#if !loaded}
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
        <Card>
            <div class="divide-y divide-vscode-border">
                {#each tasks as t (t.id)}
                    {@const isRunning = running?.taskId === t.id}
                    {@const pn = projectName(t.project_id)}
                    <div class="group flex items-center gap-3 py-2">
                        <input
                            type="checkbox"
                            class="h-4 w-4"
                            checked={t.status === "done"}
                            on:change={() => toggleDone(t)}
                        />
                        <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-2">
                                <p
                                    class="text-sm font-medium {t.status ===
                                    'done'
                                        ? 'line-through text-vscode-description'
                                        : ''}"
                                >
                                    {t.title}
                                </p>
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
