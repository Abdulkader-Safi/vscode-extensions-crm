<script lang="ts">
    import { toast } from "svelte-sonner";
    import { SvelteSet } from "svelte/reactivity";
    import { useQueryClient } from "@tanstack/svelte-query";
    import {
        Plus,
        Search,
        Mail,
        Phone,
        Building2,
        Trash2,
        Pencil,
    } from "lucide-svelte";
    import { push } from "svelte-spa-router";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Textarea from "../lib/components/ui/Textarea.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Dialog from "../lib/components/ui/Dialog.svelte";
    import Badge from "../lib/components/ui/Badge.svelte";
    import EmptyState from "../lib/components/ui/EmptyState.svelte";
    import BulkActionBar from "../lib/components/ui/BulkActionBar.svelte";
    import SelectableHeader from "../lib/components/ui/SelectableHeader.svelte";
    import { confirm } from "../lib/confirm.svelte";
    import { softDelete } from "../lib/softDelete";
    import { commands } from "../lib/commands.svelte";
    import { _ } from "../i18n";
    import {
        useClientsQuery,
        useCreateClientMutation,
        useUpdateClientMutation,
        type Client,
    } from "../lib/queries/clients";

    const blank = {
        name: "",
        company: "",
        email: "",
        phone: "",
        website: "",
        notes: "",
        tags: "",
    };

    const queryClient = useQueryClient();
    const clientsQuery = useClientsQuery();
    const createMutation = useCreateClientMutation();
    const updateMutation = useUpdateClientMutation();

    let open = $state(false);
    let editing = $state<Client | null>(null);
    let form = $state({ ...blank });
    let search = $state("");
    let selected = $state(new SvelteSet<string>());
    let selectedTags = $state(new SvelteSet<string>());

    const clients = $derived($clientsQuery.data ?? []);
    const allTags = $derived(
        Array.from(new Set(clients.flatMap((c) => c.tags))).sort(),
    );
    const filtered = $derived(
        clients.filter((c) => {
            // OR-within-tags: client matches if it has ANY selected tag.
            if (
                selectedTags.size > 0 &&
                !c.tags.some((t) => selectedTags.has(t))
            ) {
                return false;
            }
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

    function toggleTag(t: string) {
        if (selectedTags.has(t)) {
            selectedTags.delete(t);
        } else {
            selectedTags.add(t);
        }
    }

    function openNew() {
        editing = null;
        form = { ...blank };
        open = true;
    }

    $effect(() =>
        commands.register({
            id: "primary-new",
            title: "New client",
            group: "Create",
            hint: "⌘N",
            run: openNew,
        }),
    );
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

    function navigateToDetail(c: Client) {
        push(`/clients/${c.id}`);
    }

    async function save() {
        if (!form.name.trim()) {
            toast.error("Name is required");
            return;
        }
        const payload = {
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
            status: editing?.status ?? "active",
        };
        try {
            if (editing) {
                await $updateMutation.mutateAsync({
                    id: editing.id,
                    patch: payload,
                });
                toast.success("Client updated");
            } else {
                await $createMutation.mutateAsync(payload);
                toast.success("Client added");
            }
            open = false;
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function remove(id: string) {
        await softDelete(queryClient, "clients", [id]);
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
                        ? "Delete client?"
                        : `Delete ${ids.length} clients?`,
                message:
                    "Soft-deleted — restore from Trash within 5 seconds via Undo, or permanently from the Trash view.",
                confirmLabel: "Delete",
                destructive: true,
            }))
        ) {
            return;
        }
        selected.clear();
        await softDelete(queryClient, "clients", ids);
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
        title={$_("page.clients.title")}
        description={$_("page.clients.description")}
    >
        {#snippet actions()}
            <Button variant="brand" onclick={openNew}>
                <Plus class="h-4 w-4" />
                {$_("page.clients.newAction")}
            </Button>
        {/snippet}
    </PageHeader>

    <div class="mb-4 flex items-center gap-3">
        <div class="relative max-w-sm flex-1">
            <Search
                class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-vscode-description"
            />
            <Input
                class="pl-8"
                placeholder="Search clients..."
                bind:value={search}
            />
        </div>
        {#if filtered.length > 0}
            <label
                class="flex items-center gap-2 text-xs text-vscode-description"
            >
                <SelectableHeader
                    ids={filtered.map((c) => c.id)}
                    {selected}
                    onchange={(next) => {
                        selected = new SvelteSet(next);
                    }}
                />
                Select all
            </label>
        {/if}
    </div>

    {#if allTags.length > 0}
        <div class="mb-3 flex flex-wrap items-center gap-1.5">
            <span class="text-xs text-vscode-description">Tags:</span>
            {#each allTags as t (t)}
                {@const active = selectedTags.has(t)}
                <button
                    type="button"
                    class="rounded-full border px-2 py-0.5 text-[11px] transition-colors {active
                        ? 'border-brand bg-brand text-brand-fg'
                        : 'border-vscode-border text-vscode-description hover:bg-vscode-list-hover hover:text-vscode-fg'}"
                    onclick={() => toggleTag(t)}
                >
                    {t}
                </button>
            {/each}
            {#if selectedTags.size > 0}
                <button
                    type="button"
                    class="ml-1 text-[11px] text-vscode-description underline-offset-2 hover:underline"
                    onclick={() => selectedTags.clear()}
                >
                    Clear
                </button>
            {/if}
        </div>
    {/if}

    {#if $clientsQuery.isLoading}
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
                <Card
                    class="group cursor-pointer"
                    onclick={() => navigateToDetail(c)}
                >
                    <div class="mb-2 flex items-start gap-2">
                        <input
                            type="checkbox"
                            class="mt-1 shrink-0 transition-opacity {selected.has(
                                c.id,
                            )
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100'}"
                            checked={selected.has(c.id)}
                            aria-label="Select {c.name}"
                            onclick={(e) => e.stopPropagation()}
                            onchange={() => toggleOne(c.id)}
                        />
                        <div class="min-w-0 flex-1">
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
                                onclick={(e: MouseEvent) => {
                                    e.stopPropagation();
                                    openEdit(c);
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
                                    remove(c.id);
                                }}
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

<BulkActionBar
    count={selected.size}
    label={selected.size === 1 ? "client selected" : "clients selected"}
    onclear={() => selected.clear()}
>
    {#snippet actions()}
        <Button variant="destructive" size="sm" onclick={bulkRemove}>
            <Trash2 class="h-3.5 w-3.5" /> Delete
        </Button>
    {/snippet}
</BulkActionBar>

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
