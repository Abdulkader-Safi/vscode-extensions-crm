<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import {
        Plus,
        Search,
        Mail,
        Phone,
        Building2,
        Trash2,
        Pencil,
    } from "lucide-svelte";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Textarea from "../lib/components/ui/Textarea.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Dialog from "../lib/components/ui/Dialog.svelte";
    import Badge from "../lib/components/ui/Badge.svelte";
    import EmptyState from "../lib/components/ui/EmptyState.svelte";
    import { getSupabase } from "../lib/supabase";
    import { auth } from "../lib/stores/auth.svelte";
    import { confirm } from "../lib/confirm.svelte";

    type Client = {
        id: string;
        name: string;
        company: string | null;
        email: string | null;
        phone: string | null;
        website: string | null;
        notes: string | null;
        tags: string[];
        status: string;
    };

    const blank = {
        name: "",
        company: "",
        email: "",
        phone: "",
        website: "",
        notes: "",
        tags: "",
    };

    let clients = $state<Client[]>([]);
    let loaded = $state(false);
    let open = $state(false);
    let editing = $state<Client | null>(null);
    let form = $state({ ...blank });
    let search = $state("");

    const filtered = $derived(
        clients.filter((c) => {
            if (!search) {
                return true;
            }
            const q = search.toLowerCase();
            return (
                c.name.toLowerCase().includes(q) ||
                (c.company ?? "").toLowerCase().includes(q) ||
                (c.email ?? "").toLowerCase().includes(q)
            );
        }),
    );

    async function load() {
        if (!auth.user) {
            return;
        }
        const { data } = await getSupabase()
            .from("clients")
            .select("*")
            .eq("user_id", auth.user.id)
            .order("created_at", { ascending: false });
        clients = (data as Client[]) ?? [];
        loaded = true;
    }

    function openNew() {
        editing = null;
        form = { ...blank };
        open = true;
    }
    function openEdit(c: Client) {
        editing = c;
        form = {
            name: c.name,
            company: c.company ?? "",
            email: c.email ?? "",
            phone: c.phone ?? "",
            website: c.website ?? "",
            notes: c.notes ?? "",
            tags: c.tags.join(", "),
        };
        open = true;
    }

    async function save() {
        if (!auth.user || !form.name.trim()) {
            toast.error("Name is required");
            return;
        }
        const payload = {
            user_id: auth.user.id,
            name: form.name.trim().slice(0, 200),
            company: form.company.trim().slice(0, 200) || null,
            email: form.email.trim().slice(0, 255) || null,
            phone: form.phone.trim().slice(0, 50) || null,
            website: form.website.trim().slice(0, 255) || null,
            notes: form.notes.trim().slice(0, 5000) || null,
            tags: form.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 20),
        };
        const supa = getSupabase();
        const { error } = editing
            ? await supa.from("clients").update(payload).eq("id", editing.id)
            : await supa.from("clients").insert(payload);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success(editing ? "Client updated" : "Client added");
        open = false;
        load();
    }

    async function remove(id: string) {
        if (
            !(await confirm({
                title: "Delete client?",
                message:
                    "This will permanently remove the client and any communication logs.",
                confirmLabel: "Delete",
                destructive: true,
            }))
        ) {
            return;
        }
        const { error } = await getSupabase()
            .from("clients")
            .delete()
            .eq("id", id);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("Client deleted");
        load();
    }

    onMount(load);
</script>

<div class="p-6">
    <PageHeader title="Clients" description="Manage everyone you work with.">
        {#snippet actions()}
            <Button variant="brand" onclick={openNew}>
                <Plus class="h-4 w-4" /> Add client
            </Button>
        {/snippet}
    </PageHeader>

    <div class="relative mb-4 max-w-sm">
        <Search
            class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-vscode-description"
        />
        <Input
            class="pl-8"
            placeholder="Search clients..."
            bind:value={search}
        />
    </div>

    {#if !loaded}
        <div class="text-xs text-vscode-description">Loading…</div>
    {:else if filtered.length === 0}
        <Card>
            <EmptyState
                title={search ? "No matches" : "No clients yet"}
                description={search
                    ? "Try a different search term."
                    : "Start by adding your first client."}
            >
                {#snippet action()}
                    {#if !search}
                        <Button variant="brand" onclick={openNew}>
                            <Plus class="h-4 w-4" /> Add client
                        </Button>
                    {/if}
                {/snippet}
            </EmptyState>
        </Card>
    {:else}
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each filtered as c (c.id)}
                <Card class="group">
                    <div class="mb-2 flex items-start justify-between">
                        <div class="min-w-0">
                            <h3 class="truncate text-sm font-semibold">
                                {c.name}
                            </h3>
                            {#if c.company}
                                <p
                                    class="mt-0.5 flex items-center gap-1 text-xs text-vscode-description"
                                >
                                    <Building2 class="h-3 w-3" />
                                    <span class="truncate">{c.company}</span>
                                </p>
                            {/if}
                        </div>
                        <div
                            class="flex opacity-0 transition-opacity group-hover:opacity-100"
                        >
                            <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Edit"
                                onclick={() => openEdit(c)}
                            >
                                <Pencil class="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                class="text-vscode-error"
                                aria-label="Delete"
                                onclick={() => remove(c.id)}
                            >
                                <Trash2 class="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                    <div class="space-y-1 text-xs text-vscode-description">
                        {#if c.email}
                            <p class="flex items-center gap-1.5">
                                <Mail class="h-3 w-3" />
                                {c.email}
                            </p>
                        {/if}
                        {#if c.phone}
                            <p class="flex items-center gap-1.5">
                                <Phone class="h-3 w-3" />
                                {c.phone}
                            </p>
                        {/if}
                    </div>
                    {#if c.tags.length > 0}
                        <div class="mt-3 flex flex-wrap gap-1">
                            {#each c.tags as t (t)}
                                <Badge tone="muted">{t}</Badge>
                            {/each}
                        </div>
                    {/if}
                </Card>
            {/each}
        </div>
    {/if}
</div>

<Dialog bind:open title={editing ? "Edit client" : "New client"} size="lg">
    <div class="grid gap-3 sm:grid-cols-2">
        <Field class="sm:col-span-2" label="Name" required>
            <Input bind:value={form.name} />
        </Field>
        <Field label="Company"><Input bind:value={form.company} /></Field>
        <Field label="Website"><Input bind:value={form.website} /></Field>
        <Field label="Email"
            ><Input type="email" bind:value={form.email} /></Field
        >
        <Field label="Phone"><Input bind:value={form.phone} /></Field>
        <Field
            class="sm:col-span-2"
            label="Tags (comma-separated)"
            hint="e.g. high value, retainer"
        >
            <Input bind:value={form.tags} />
        </Field>
        <Field class="sm:col-span-2" label="Notes">
            <Textarea bind:value={form.notes} rows={3} />
        </Field>
    </div>
    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
        <Button variant="brand" onclick={save}>
            {editing ? "Update" : "Create"}
        </Button>
    {/snippet}
</Dialog>
