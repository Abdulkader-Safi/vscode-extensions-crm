<script lang="ts">
    import { writable, derived as svelteDerived } from "svelte/store";
    import { toast } from "svelte-sonner";
    import { push, link } from "svelte-spa-router";
    import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
    import {
        ArrowLeft,
        Mail,
        Phone,
        Globe,
        Pencil,
        Save,
        X,
        Plus,
        FileText,
        Phone as PhoneIcon,
        Mail as MailIcon,
        StickyNote,
    } from "lucide-svelte";
    import { formatDistanceToNow } from "date-fns";
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
    import { auth } from "../lib/stores/auth.svelte";
    import { getSupabase } from "../lib/supabase";
    import { formatCurrency } from "../lib/utils";
    import { qk } from "../lib/queries/keys";
    import {
        useUpdateClientMutation,
        type Client,
    } from "../lib/queries/clients";
    import { useProjectsQuery } from "../lib/queries/projects";
    import { useInvoicesQuery } from "../lib/queries/invoices";
    import type {
        CommunicationLog,
        CommunicationLogInsert,
    } from "../lib/queries/communicationLogs";

    interface Props {
        params: { id: string };
    }
    let { params }: Props = $props();

    // svelte-spa-router preserves the component across param changes; expose
    // the id as a store so reactive query options re-key correctly.
    const idStore = writable("");
    $effect(() => {
        idStore.set(params.id);
    });

    const queryClient = useQueryClient();

    const clientQuery = createQuery<Client | null, Error>(
        svelteDerived(idStore, ($id) => ({
            queryKey: qk.client($id),
            queryFn: async () => {
                const { data, error } = await getSupabase()
                    .from("clients")
                    .select("*")
                    .eq("id", $id)
                    .maybeSingle();
                if (error) {
                    throw error;
                }
                return (data as Client) ?? null;
            },
            enabled: !!$id,
        })),
    );

    const logsQuery = createQuery<CommunicationLog[], Error>(
        svelteDerived(idStore, ($id) => ({
            queryKey: qk.communicationLogs($id),
            queryFn: async () => {
                if (!auth.user) {
                    return [];
                }
                const { data, error } = await getSupabase()
                    .from("communication_logs")
                    .select("*")
                    .eq("user_id", auth.user.id)
                    .eq("client_id", $id)
                    .order("occurred_at", { ascending: false });
                if (error) {
                    throw error;
                }
                return (data as CommunicationLog[]) ?? [];
            },
            enabled: !!$id,
        })),
    );

    const createLogMutation = createMutation<
        CommunicationLog,
        Error,
        Omit<CommunicationLogInsert, "user_id" | "client_id">
    >({
        mutationFn: async (payload) => {
            if (!auth.user) {
                throw new Error("Not authenticated");
            }
            const { data, error } = await getSupabase()
                .from("communication_logs")
                .insert({
                    ...payload,
                    user_id: auth.user.id,
                    client_id: params.id,
                })
                .select()
                .single();
            if (error) {
                throw error;
            }
            return data as CommunicationLog;
        },
        onSettled: () => {
            queryClient.invalidateQueries({
                queryKey: qk.communicationLogs(params.id),
            });
        },
    });

    const projectsQuery = useProjectsQuery();
    const invoicesQuery = useInvoicesQuery();
    const updateMutation = useUpdateClientMutation();

    let editing = $state(false);
    let form = $state({
        name: "",
        company: "",
        email: "",
        phone: "",
        website: "",
        notes: "",
        tags: "",
    });
    let logForm = $state({ type: "note", title: "", content: "" });

    const client = $derived($clientQuery.data ?? null);
    const linkedProjects = $derived(
        ($projectsQuery.data ?? []).filter((p) => p.client_id === params.id),
    );
    const linkedInvoices = $derived(
        ($invoicesQuery.data ?? []).filter((i) => i.client_id === params.id),
    );
    const totals = $derived.by(() => {
        const billed = linkedInvoices.reduce((s, i) => s + Number(i.total), 0);
        const paid = linkedInvoices
            .filter((i) => i.status === "paid")
            .reduce((s, i) => s + Number(i.total), 0);
        return { billed, paid, outstanding: billed - paid };
    });
    const logs = $derived($logsQuery.data ?? []);

    function startEdit() {
        if (!client) {
            return;
        }
        form = {
            name: client.name,
            company: client.company ?? "",
            email: client.email ?? "",
            phone: client.phone ?? "",
            website: client.website ?? "",
            notes: client.notes ?? "",
            tags: client.tags.join(", "),
        };
        editing = true;
    }

    async function saveEdit() {
        if (!client) {
            return;
        }
        if (!form.name.trim()) {
            toast.error("Name is required");
            return;
        }
        try {
            await $updateMutation.mutateAsync({
                id: client.id,
                patch: {
                    name: form.name.trim().slice(0, 200),
                    company: form.company.trim() || null,
                    email: form.email.trim() || null,
                    phone: form.phone.trim() || null,
                    website: form.website.trim() || null,
                    notes: form.notes.trim() || null,
                    tags: form.tags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .slice(0, 20),
                },
            });
            toast.success("Updated");
            editing = false;
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function addLog() {
        if (!logForm.title.trim() && !logForm.content.trim()) {
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
            toast.success("Logged");
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    function logIcon(type: string) {
        if (type === "call") {
            return PhoneIcon;
        }
        if (type === "email") {
            return MailIcon;
        }
        return StickyNote;
    }
</script>

<div class="p-6">
    <Button
        size="sm"
        variant="ghost"
        class="mb-3"
        onclick={() => push("/clients")}
    >
        <ArrowLeft class="h-3.5 w-3.5" />
        All clients
    </Button>

    {#if $clientQuery.isLoading}
        <div class="text-xs text-vscode-description">Loading…</div>
    {:else if !client}
        <Card>
            <EmptyState
                title="Client not found"
                description="This client may have been deleted."
            />
        </Card>
    {:else}
        <PageHeader title={client.name} description={client.company ?? ""}>
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

        <div class="mb-4 grid gap-3 sm:grid-cols-3">
            <StatCard
                label="Billed"
                value={formatCurrency(totals.billed, profile.currency)}
                accent="brand"
            />
            <StatCard
                label="Paid"
                value={formatCurrency(totals.paid, profile.currency)}
                accent="success"
            />
            <StatCard
                label="Outstanding"
                value={formatCurrency(totals.outstanding, profile.currency)}
                accent={totals.outstanding > 0 ? "warning" : "muted"}
            />
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
            <div class="space-y-4 lg:col-span-2">
                <Card title="Profile">
                    {#if editing}
                        <div class="grid gap-3 sm:grid-cols-2">
                            <Field
                                class="sm:col-span-2"
                                label="Name"
                                required
                            >
                                <Input bind:value={form.name} />
                            </Field>
                            <Field label="Company">
                                <Input bind:value={form.company} />
                            </Field>
                            <Field label="Website">
                                <Input bind:value={form.website} />
                            </Field>
                            <Field label="Email">
                                <Input bind:value={form.email} type="email" />
                            </Field>
                            <Field label="Phone">
                                <Input bind:value={form.phone} />
                            </Field>
                            <Field
                                class="sm:col-span-2"
                                label="Tags (comma-separated)"
                            >
                                <Input bind:value={form.tags} />
                            </Field>
                            <Field class="sm:col-span-2" label="Notes">
                                <Textarea bind:value={form.notes} rows={3} />
                            </Field>
                        </div>
                    {:else}
                        <dl
                            class="grid gap-3 text-sm sm:grid-cols-2 [&_dt]:text-[11px] [&_dt]:uppercase [&_dt]:tracking-wide [&_dt]:text-vscode-description [&_dd]:mt-0.5"
                        >
                            <div>
                                <dt>Email</dt>
                                <dd>
                                    {#if client.email}
                                        <a
                                            href={`mailto:${client.email}`}
                                            class="flex items-center gap-1.5 text-vscode-link hover:underline"
                                        >
                                            <Mail class="h-3.5 w-3.5" />
                                            {client.email}
                                        </a>
                                    {:else}
                                        <span class="text-vscode-description"
                                            >—</span
                                        >
                                    {/if}
                                </dd>
                            </div>
                            <div>
                                <dt>Phone</dt>
                                <dd>
                                    {#if client.phone}
                                        <span class="flex items-center gap-1.5">
                                            <Phone class="h-3.5 w-3.5" />
                                            {client.phone}
                                        </span>
                                    {:else}
                                        <span class="text-vscode-description"
                                            >—</span
                                        >
                                    {/if}
                                </dd>
                            </div>
                            <div>
                                <dt>Website</dt>
                                <dd>
                                    {#if client.website}
                                        <a
                                            href={client.website}
                                            target="_blank"
                                            rel="noopener"
                                            class="flex items-center gap-1.5 text-vscode-link hover:underline"
                                        >
                                            <Globe class="h-3.5 w-3.5" />
                                            {client.website}
                                        </a>
                                    {:else}
                                        <span class="text-vscode-description"
                                            >—</span
                                        >
                                    {/if}
                                </dd>
                            </div>
                            <div>
                                <dt>Status</dt>
                                <dd>{client.status}</dd>
                            </div>
                            {#if client.tags.length}
                                <div class="sm:col-span-2">
                                    <dt>Tags</dt>
                                    <dd class="flex flex-wrap gap-1">
                                        {#each client.tags as t (t)}
                                            <Badge tone="muted">{t}</Badge>
                                        {/each}
                                    </dd>
                                </div>
                            {/if}
                            {#if client.notes}
                                <div class="sm:col-span-2">
                                    <dt>Notes</dt>
                                    <dd class="whitespace-pre-wrap">
                                        {client.notes}
                                    </dd>
                                </div>
                            {/if}
                        </dl>
                    {/if}
                </Card>

                <Card title="Linked projects">
                    {#if linkedProjects.length === 0}
                        <EmptyState
                            title="No projects yet"
                            description="Projects you assign to this client will show up here."
                        />
                    {:else}
                        <ul class="divide-y divide-vscode-border">
                            {#each linkedProjects as p (p.id)}
                                <li class="py-2">
                                    <a
                                        use:link
                                        href={`/projects/${p.id}`}
                                        class="flex items-center justify-between gap-3 text-sm hover:underline"
                                    >
                                        <span>{p.name}</span>
                                        <span
                                            class="text-xs text-vscode-description"
                                        >
                                            {p.status} ·
                                            {formatCurrency(
                                                Number(p.budget),
                                                profile.currency,
                                            )}
                                        </span>
                                    </a>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </Card>

                <Card title="Linked invoices">
                    {#if linkedInvoices.length === 0}
                        <EmptyState
                            title="No invoices yet"
                            description="Invoices for this client will appear here."
                        />
                    {:else}
                        <ul class="divide-y divide-vscode-border">
                            {#each linkedInvoices as inv (inv.id)}
                                <li
                                    class="flex items-center justify-between gap-3 py-2 text-sm"
                                >
                                    <span class="flex items-center gap-2">
                                        <FileText class="h-3.5 w-3.5" />
                                        {inv.invoice_number}
                                    </span>
                                    <span class="flex items-center gap-3">
                                        <Badge tone="muted">{inv.status}</Badge>
                                        <span class="font-medium">
                                            {formatCurrency(
                                                Number(inv.total),
                                                inv.currency,
                                            )}
                                        </span>
                                    </span>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </Card>
            </div>

            <Card title="Activity">
                <div class="mb-4 space-y-2 border-b border-vscode-border pb-4">
                    <div class="grid grid-cols-2 gap-2">
                        <Select bind:value={logForm.type}>
                            <option value="note">Note</option>
                            <option value="call">Call</option>
                            <option value="email">Email</option>
                            <option value="meeting">Meeting</option>
                        </Select>
                        <Input
                            placeholder="Title (optional)"
                            bind:value={logForm.title}
                        />
                    </div>
                    <Textarea
                        rows={3}
                        placeholder="What happened?"
                        bind:value={logForm.content}
                    />
                    <Button
                        size="sm"
                        variant="brand"
                        class="w-full"
                        onclick={addLog}
                    >
                        <Plus class="h-3.5 w-3.5" /> Log activity
                    </Button>
                </div>
                {#if logs.length === 0}
                    <p class="py-4 text-center text-xs text-vscode-description">
                        No activity yet.
                    </p>
                {:else}
                    <ul class="space-y-3">
                        {#each logs as l (l.id)}
                            {@const Icon = logIcon(l.type)}
                            <li class="flex items-start gap-2 text-sm">
                                <Icon
                                    class="mt-0.5 h-3.5 w-3.5 shrink-0 text-vscode-description"
                                />
                                <div class="min-w-0 flex-1">
                                    {#if l.title}
                                        <p class="font-medium truncate">
                                            {l.title}
                                        </p>
                                    {/if}
                                    {#if l.content}
                                        <p
                                            class="text-xs text-vscode-description whitespace-pre-wrap"
                                        >
                                            {l.content}
                                        </p>
                                    {/if}
                                    <p
                                        class="mt-0.5 text-[10px] text-vscode-description"
                                    >
                                        {formatDistanceToNow(
                                            new Date(l.occurred_at),
                                            { addSuffix: true },
                                        )}
                                    </p>
                                </div>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </Card>
        </div>
    {/if}
</div>
