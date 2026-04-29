<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Plus, Trash2, Pencil, Calendar } from "lucide-svelte";
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
    import { profile } from "../lib/stores/profile.svelte";
    import { formatCurrency } from "../lib/utils";

    type Project = {
        id: string;
        name: string;
        description: string | null;
        status: string;
        client_id: string | null;
        start_date: string | null;
        end_date: string | null;
        budget: number;
    };
    type Client = { id: string; name: string };

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

    let projects = $state<Project[]>([]);
    let clients = $state<Client[]>([]);
    let loaded = $state(false);
    let open = $state(false);
    let editing = $state<Project | null>(null);
    let form = $state({ ...blank });

    async function load() {
        if (!auth.user) {
            return;
        }
        const supa = getSupabase();
        const [p, c] = await Promise.all([
            supa
                .from("projects")
                .select("*")
                .eq("user_id", auth.user.id)
                .order("created_at", { ascending: false }),
            supa
                .from("clients")
                .select("id,name")
                .eq("user_id", auth.user.id)
                .order("name"),
        ]);
        projects = (p.data as Project[]) ?? [];
        clients = (c.data as Client[]) ?? [];
        loaded = true;
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

    async function save() {
        if (!auth.user || !form.name.trim()) {
            toast.error("Name required");
            return;
        }
        const payload = {
            user_id: auth.user.id,
            name: form.name.trim().slice(0, 200),
            description: form.description.trim() || null,
            status: form.status,
            client_id: form.client_id === "none" ? null : form.client_id,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            budget: Number(form.budget) || 0,
        };
        const supa = getSupabase();
        const { error } = editing
            ? await supa.from("projects").update(payload).eq("id", editing.id)
            : await supa.from("projects").insert(payload);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success(editing ? "Updated" : "Project created");
        open = false;
        load();
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
        await getSupabase().from("projects").delete().eq("id", id);
        load();
    }

    function clientName(id: string | null) {
        return clients.find((c) => c.id === id)?.name ?? "—";
    }
    function statusInfo(id: string) {
        return STATUSES.find((s) => s.id === id) ?? STATUSES[0];
    }

    onMount(load);
</script>

<div class="p-6">
    <PageHeader title="Projects" description="Track all the work you're doing.">
        {#snippet actions()}
            <Button variant="brand" onclick={openNew}>
                <Plus class="h-4 w-4" /> New project
            </Button>
        {/snippet}
    </PageHeader>

    {#if !loaded}
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
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each projects as p (p.id)}
                {@const s = statusInfo(p.status)}
                <Card class="group">
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
                                onclick={() => openEdit(p)}
                            >
                                <Pencil class="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                class="text-vscode-error"
                                aria-label="Delete"
                                onclick={() => remove(p.id)}
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
