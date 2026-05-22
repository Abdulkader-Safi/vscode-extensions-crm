<script lang="ts">
    import { writable } from "svelte/store";
    import { toast } from "svelte-sonner";
    import { push } from "svelte-spa-router";
    import { formatDistanceToNow } from "date-fns";
    import { ArrowLeft, StickyNote, Plus } from "lucide-svelte";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Textarea from "../lib/components/ui/Textarea.svelte";
    import Select from "../lib/components/ui/Select.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import EmptyState from "../lib/components/ui/EmptyState.svelte";
    import { profile } from "../lib/stores/profile.svelte";
    import { formatCurrency } from "../lib/utils";
    import {
        useLeadQuery,
        useUpdateLeadMutation,
        type Lead,
    } from "../lib/queries/leads";
    import {
        useLeadCommunicationLogsQuery,
        useCreateLeadCommunicationLogMutation,
    } from "../lib/queries/communicationLogs";

    interface Props {
        params: { id: string };
    }
    let { params }: Props = $props();

    const idStore = writable("");
    $effect(() => idStore.set(params.id));

    const STAGES = ["new", "contacted", "proposal", "won", "lost"];
    const LOG_TYPES = ["note", "call", "email", "meeting"];

    const leadQuery = useLeadQuery(idStore);
    const updateMutation = useUpdateLeadMutation();
    // The log hooks key on the id at mount. svelte-spa-router mounts a fresh
    // LeadDetail when arriving from the board (the common path); in-place
    // lead→lead param changes are rare and would need a manual refetch.
    // svelte-ignore state_referenced_locally
    const logsQuery = useLeadCommunicationLogsQuery(params.id);
    // svelte-ignore state_referenced_locally
    const createLogMutation = useCreateLeadCommunicationLogMutation(params.id);

    const lead = $derived($leadQuery.data ?? null);
    const logs = $derived($logsQuery.data ?? []);

    let logForm = $state({ type: "note", title: "", content: "" });

    async function patch(p: Partial<Lead>) {
        if (!lead) return;
        try {
            await $updateMutation.mutateAsync({ id: lead.id, patch: p });
        } catch (e) {
            toast.error((e as Error).message);
        }
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
            toast.success("Note added");
        } catch (e) {
            toast.error((e as Error).message);
        }
    }
</script>

<div class="p-6">
    <button
        class="mb-4 flex items-center gap-1 text-xs text-vscode-description hover:text-vscode-fg"
        onclick={() => push("/leads")}
    >
        <ArrowLeft class="h-3.5 w-3.5" /> Back to leads
    </button>

    {#if $leadQuery.isLoading}
        <div class="text-xs text-vscode-description">Loading…</div>
    {:else if !lead}
        <Card>
            <EmptyState
                title="Lead not found"
                description="This lead may have been deleted."
            />
        </Card>
    {:else}
        <PageHeader title={lead.name} description="Lead detail" />

        <div class="grid gap-4 lg:grid-cols-3">
            <Card title="Details" class="lg:col-span-2">
                <div class="grid gap-3 sm:grid-cols-2">
                    <Field class="sm:col-span-2" label="Name">
                        <Input
                            value={lead.name}
                            onchange={(e: Event) =>
                                patch({
                                    name: (
                                        e.target as HTMLInputElement
                                    ).value.slice(0, 200),
                                })}
                        />
                    </Field>
                    <Field label="Company">
                        <Input
                            value={lead.company ?? ""}
                            onchange={(e: Event) =>
                                patch({
                                    company:
                                        (e.target as HTMLInputElement).value ||
                                        null,
                                })}
                        />
                    </Field>
                    <Field label="Stage">
                        <Select
                            value={lead.stage}
                            onchange={(e: Event) =>
                                patch({
                                    stage: (e.target as HTMLSelectElement)
                                        .value,
                                })}
                        >
                            {#each STAGES as s (s)}
                                <option value={s}>{s}</option>
                            {/each}
                        </Select>
                    </Field>
                    <Field label="Email">
                        <Input
                            type="email"
                            value={lead.email ?? ""}
                            onchange={(e: Event) =>
                                patch({
                                    email:
                                        (e.target as HTMLInputElement).value ||
                                        null,
                                })}
                        />
                    </Field>
                    <Field label="Phone">
                        <Input
                            value={lead.phone ?? ""}
                            onchange={(e: Event) =>
                                patch({
                                    phone:
                                        (e.target as HTMLInputElement).value ||
                                        null,
                                })}
                        />
                    </Field>
                    <Field label="Source">
                        <Input
                            value={lead.source ?? ""}
                            onchange={(e: Event) =>
                                patch({
                                    source:
                                        (e.target as HTMLInputElement).value ||
                                        null,
                                })}
                        />
                    </Field>
                    <Field label="Estimated value">
                        <Input
                            type="number"
                            step="0.01"
                            value={String(lead.value ?? 0)}
                            onchange={(e: Event) =>
                                patch({
                                    value:
                                        Number(
                                            (e.target as HTMLInputElement)
                                                .value,
                                        ) || 0,
                                })}
                        />
                    </Field>
                    <Field class="sm:col-span-2" label="Notes">
                        <Textarea
                            value={lead.notes ?? ""}
                            rows={2}
                            onchange={(e: Event) =>
                                patch({
                                    notes:
                                        (e.target as HTMLTextAreaElement)
                                            .value || null,
                                })}
                        />
                    </Field>
                    <div class="sm:col-span-2 text-xs text-vscode-description">
                        Worth {formatCurrency(
                            Number(lead.value),
                            profile.currency,
                        )}
                    </div>
                </div>
            </Card>

            <Card title="Activity">
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
                        <Plus class="h-3.5 w-3.5" /> Add note
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
