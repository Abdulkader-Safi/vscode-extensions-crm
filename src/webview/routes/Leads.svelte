<script lang="ts">
    import { toast } from "svelte-sonner";
    import { dndzone, type DndEvent } from "svelte-dnd-action";
    import { flip } from "svelte/animate";
    import { Plus, ArrowRightLeft, Trash2 } from "lucide-svelte";
    import { push } from "svelte-spa-router";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Textarea from "../lib/components/ui/Textarea.svelte";
    import Select from "../lib/components/ui/Select.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Dialog from "../lib/components/ui/Dialog.svelte";
    import { useQueryClient } from "@tanstack/svelte-query";
    import { softDelete } from "../lib/softDelete";
    import { commands } from "../lib/commands.svelte";
    import { _ } from "../i18n";
    import { profile } from "../lib/stores/profile.svelte";
    import { formatCurrency } from "../lib/utils";
    import {
        useLeadsQuery,
        useCreateLeadMutation,
        useConvertLeadMutation,
        useReorderLeadsMutation,
        type Lead,
    } from "../lib/queries/leads";
    import { useClientsQuery } from "../lib/queries/clients";

    const STAGES = [
        { id: "new", label: "New" },
        { id: "contacted", label: "Contacted" },
        { id: "proposal", label: "Proposal sent" },
        { id: "won", label: "Won" },
        { id: "lost", label: "Lost" },
    ];

    const blank = {
        name: "",
        company: "",
        email: "",
        phone: "",
        source: "",
        value: "0",
        notes: "",
    };

    const queryClient = useQueryClient();
    const leadsQuery = useLeadsQuery();
    const clientsQuery = useClientsQuery();
    const createMutation = useCreateLeadMutation();
    const convertMutation = useConvertLeadMutation();
    const reorderMutation = useReorderLeadsMutation();

    let open = $state(false);
    let form = $state({ ...blank });
    const clients = $derived($clientsQuery.data ?? []);

    // "From existing client" picker. When set, the contact fields are
    // auto-filled and locked (toggle "edit" to override) and client_id links
    // the lead back to the client.
    let fromClientId = $state("");
    let lockFromClient = $state(true);

    function applyClient(id: string) {
        fromClientId = id;
        const c = clients.find((x) => x.id === id);
        if (c) {
            form = {
                ...form,
                name: c.name,
                company: c.company ?? "",
                email: c.email ?? "",
                phone: c.phone ?? "",
            };
            lockFromClient = true;
        }
    }

    function resetForm() {
        form = { ...blank };
        fromClientId = "";
        lockFromClient = true;
    }

    $effect(() =>
        commands.register({
            id: "primary-new",
            title: "New lead",
            group: "Create",
            hint: "⌘N",
            run: () => {
                open = true;
            },
        }),
    );
    // Local optimistic dnd state — synced from query data, mutated by drag.
    let columns = $state<Record<string, Lead[]>>({});

    const leads = $derived($leadsQuery.data ?? []);

    // Rebuild columns whenever leads change (initial load + after mutations).
    $effect(() => {
        const map: Record<string, Lead[]> = Object.fromEntries(
            STAGES.map((s) => [s.id, [] as Lead[]]),
        );
        for (const l of leads) {
            (map[l.stage] ?? map["new"]).push(l);
        }
        for (const k of Object.keys(map)) {
            map[k].sort((a, b) => a.position - b.position);
        }
        columns = map;
    });

    async function create() {
        if (!form.name.trim()) {
            toast.error("Name required");
            return;
        }
        try {
            await $createMutation.mutateAsync({
                name: form.name.trim().slice(0, 200),
                company: form.company.trim() || null,
                email: form.email.trim() || null,
                phone: form.phone.trim() || null,
                source: form.source.trim() || null,
                value: Number(form.value) || 0,
                notes: form.notes.trim() || null,
                client_id: fromClientId || null,
                stage: "new",
                position: (columns["new"] ?? []).length,
            });
            toast.success("Lead added");
            resetForm();
            open = false;
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function remove(id: string) {
        await softDelete(queryClient, "leads", [id]);
    }

    async function convert(lead: Lead) {
        try {
            await $convertMutation.mutateAsync(lead);
            toast.success("Lead converted to client");
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    function onConsider(stageId: string, e: CustomEvent<DndEvent<Lead>>) {
        columns = { ...columns, [stageId]: e.detail.items };
    }
    async function onFinalize(stageId: string, e: CustomEvent<DndEvent<Lead>>) {
        columns = { ...columns, [stageId]: e.detail.items };
        const updates = e.detail.items.map((l, idx) => ({
            id: l.id,
            stage: stageId,
            position: idx,
        }));
        try {
            await $reorderMutation.mutateAsync(updates);
        } catch (err) {
            toast.error((err as Error).message);
        }
    }

    function stageTotal(stageId: string) {
        return (columns[stageId] ?? []).reduce(
            (s, l) => s + Number(l.value),
            0,
        );
    }
</script>

<div class="p-6">
    <PageHeader
        title={$_("page.leads.title")}
        description={$_("page.leads.description")}
    >
        {#snippet actions()}
            <Button variant="brand" onclick={() => (open = true)}>
                <Plus class="h-4 w-4" />
                {$_("page.leads.newAction")}
            </Button>
        {/snippet}
    </PageHeader>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                    <span class="text-[10px] text-vscode-description">
                        {formatCurrency(stageTotal(stage.id), profile.currency)}
                    </span>
                </div>
                <div
                    class="min-h-50 flex-1 space-y-2 rounded-lg border border-vscode-card-border bg-vscode-muted-bg p-2"
                    use:dndzone={{
                        items: columns[stage.id] ?? [],
                        flipDurationMs: 150,
                        type: "lead",
                    }}
                    onconsider={(e) => onConsider(stage.id, e)}
                    onfinalize={(e) => onFinalize(stage.id, e)}
                >
                    {#each columns[stage.id] ?? [] as lead (lead.id)}
                        <div
                            animate:flip={{ duration: 150 }}
                            class="group cursor-grab rounded-md border border-vscode-card-border bg-vscode-card-bg p-2 active:cursor-grabbing"
                        >
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                    <button
                                        type="button"
                                        class="block max-w-full truncate text-left text-sm font-medium hover:underline"
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            push(`/leads/${lead.id}`);
                                        }}
                                    >
                                        {lead.name}
                                    </button>
                                    {#if lead.company}
                                        <p
                                            class="truncate text-[11px] text-vscode-description"
                                        >
                                            {lead.company}
                                        </p>
                                    {/if}
                                </div>
                                <span
                                    class="whitespace-nowrap text-xs font-semibold text-brand"
                                >
                                    {formatCurrency(
                                        Number(lead.value),
                                        profile.currency,
                                    )}
                                </span>
                            </div>
                            {#if lead.source}
                                <p
                                    class="mt-2 text-[10px] text-vscode-description"
                                >
                                    via {lead.source}
                                </p>
                            {/if}
                            <div
                                class="mt-2 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                            >
                                <button
                                    class="rounded p-1 hover:bg-vscode-list-hover"
                                    aria-label="Convert to client"
                                    title="Convert to client"
                                    onclick={() => convert(lead)}
                                >
                                    <ArrowRightLeft class="h-3 w-3" />
                                </button>
                                <button
                                    class="rounded p-1 text-vscode-error hover:bg-vscode-list-hover"
                                    aria-label="Delete"
                                    onclick={() => remove(lead.id)}
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

<Dialog bind:open title="New lead" size="lg">
    <div class="grid gap-3 sm:grid-cols-2">
        {#if clients.length > 0}
            <Field
                class="sm:col-span-2"
                label="From existing client"
                hint="Auto-fills contact details and links the lead"
            >
                <Select
                    value={fromClientId}
                    onchange={(e: Event) => {
                        const v = (e.target as HTMLSelectElement).value;
                        if (v) applyClient(v);
                        else {
                            fromClientId = "";
                        }
                    }}
                >
                    <option value="">Manual entry (not a client)</option>
                    {#each clients as c (c.id)}
                        <option value={c.id}>{c.name}</option>
                    {/each}
                </Select>
            </Field>
            {#if fromClientId}
                <div class="sm:col-span-2 -mt-1">
                    <label
                        class="flex items-center gap-2 text-xs text-vscode-description"
                    >
                        <input
                            type="checkbox"
                            checked={!lockFromClient}
                            onchange={(e) =>
                                (lockFromClient = !(
                                    e.target as HTMLInputElement
                                ).checked)}
                        />
                        Edit auto-filled contact fields
                    </label>
                </div>
            {/if}
        {/if}
        <Field class="sm:col-span-2" label="Name" required>
            <Input
                bind:value={form.name}
                disabled={!!fromClientId && lockFromClient}
            />
        </Field>
        <Field label="Company">
            <Input
                bind:value={form.company}
                disabled={!!fromClientId && lockFromClient}
            />
        </Field>
        <Field label="Source" hint="Referral, LinkedIn…">
            <Input bind:value={form.source} />
        </Field>
        <Field label="Email">
            <Input
                type="email"
                bind:value={form.email}
                disabled={!!fromClientId && lockFromClient}
            />
        </Field>
        <Field label="Phone">
            <Input
                bind:value={form.phone}
                disabled={!!fromClientId && lockFromClient}
            />
        </Field>
        <Field class="sm:col-span-2" label="Estimated value">
            <Input type="number" step="0.01" bind:value={form.value} />
        </Field>
        <Field class="sm:col-span-2" label="Notes">
            <Textarea bind:value={form.notes} rows={2} />
        </Field>
    </div>
    {#snippet footer()}
        <Button
            variant="ghost"
            onclick={() => {
                open = false;
                resetForm();
            }}>Cancel</Button
        >
        <Button variant="brand" onclick={create}>Create</Button>
    {/snippet}
</Dialog>
