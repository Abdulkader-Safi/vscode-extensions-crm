<script lang="ts">
    import { toast } from "svelte-sonner";
    import { SvelteSet } from "svelte/reactivity";
    import { writable } from "svelte/store";
    import { useQueryClient } from "@tanstack/svelte-query";
    import {
        Plus,
        Trash2,
        Pencil,
        FileDown,
        Eye,
        Check,
        Mail,
    } from "lucide-svelte";
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
    import SortableHeader from "../lib/components/ui/SortableHeader.svelte";
    import BulkActionBar from "../lib/components/ui/BulkActionBar.svelte";
    import SelectableHeader from "../lib/components/ui/SelectableHeader.svelte";
    import InvoicePreviewDialog from "../lib/components/ui/InvoicePreviewDialog.svelte";
    import { confirm } from "../lib/confirm.svelte";
    import { softDelete } from "../lib/softDelete";
    import { commands } from "../lib/commands.svelte";
    import { _ } from "../i18n";
    import { profile } from "../lib/stores/profile.svelte";
    import { formatCurrency, ymd } from "../lib/utils";
    import {
        loadInvoicePreview,
        renderInvoicePdf,
        type InvoicePreview,
    } from "../lib/invoicePreview";
    import { saveBinaryFile } from "../lib/saveFile";
    import {
        useSaveInvoiceMutation,
        useUpdateInvoiceMutation,
        useSendInvoiceMutation,
        loadInvoiceItems,
        type Invoice,
        type InvoiceItem as Item,
        type InvoiceListFilters,
        type InvoiceListSort,
        type InvoiceListSortField,
    } from "../lib/queries/invoices";
    import { useInvoicesListQuery } from "../lib/queries/useInvoicesListQuery";
    import { useClientsQuery } from "../lib/queries/clients";
    import { useProjectsQuery } from "../lib/queries/projects";

    const STATUSES = ["draft", "sent", "paid", "overdue"];
    const statusTone: Record<string, "muted" | "info" | "success" | "error"> = {
        draft: "muted",
        sent: "info",
        paid: "success",
        overdue: "error",
    };

    function blankItem(position: number): Item {
        return {
            description: "",
            quantity: 1,
            unit_price: 0,
            total: 0,
            position,
        };
    }

    const queryClient = useQueryClient();
    const clientsQuery = useClientsQuery();
    const projectsQuery = useProjectsQuery();
    const saveMutation = useSaveInvoiceMutation();
    const updateMutation = useUpdateInvoiceMutation();
    const sendMutation = useSendInvoiceMutation();

    let selected = $state(new SvelteSet<string>());
    let previewOpen = $state(false);
    let preview = $state<InvoicePreview | null>(null);

    // Email dialog state. `target` is the invoice we're about to email;
    // null means the dialog is hidden.
    let emailDialog = $state<{
        target: Invoice;
        recipient: string;
        subject: string;
        body: string;
    } | null>(null);

    let open = $state(false);
    let editing = $state<Invoice | null>(null);

    let form = $state({
        invoice_number: "",
        status: "draft",
        client_id: "none",
        project_id: "none",
        issue_date: ymd(),
        due_date: "",
        tax_rate: "0",
        discount: "0",
        notes: "",
    });
    let items = $state<Item[]>([blankItem(0)]);

    // Recurring/template editor state — separate from `form` so toggling
    // off cleanly nulls the columns rather than leaving stale freq/interval.
    type RecurringEnd = "never" | "until" | "count";
    let recurring = $state({
        enabled: false,
        freq: "monthly" as "weekly" | "monthly" | "quarterly" | "yearly",
        interval: "1",
        endKind: "never" as RecurringEnd,
        until: "", // YYYY-MM-DD
        count: "12",
    });

    let filters = $state<InvoiceListFilters>({
        status: "",
        from: "",
        to: "",
        clientId: "",
    });
    let sort = $state<InvoiceListSort>({
        field: "issue_date",
        direction: "desc",
    });

    // Push the live filter+sort spec into a Svelte store so the paginated
    // query hook can include it in the queryKey + re-fetch on change. The
    // $effect below keeps the store in sync; the initial read is acceptable
    // here because we immediately update it inside an effect.
    // svelte-ignore state_referenced_locally
    const argsStore = writable({
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

    const invoicesQuery = useInvoicesListQuery(argsStore);
    const invoices = $derived(
        ($invoicesQuery.data?.pages ?? []).flat() as Invoice[],
    );
    const clients = $derived($clientsQuery.data ?? []);
    const projects = $derived($projectsQuery.data ?? []);

    const filtersActive = $derived(
        !!filters.status ||
            !!filters.from ||
            !!filters.to ||
            !!filters.clientId ||
            sort.field !== "issue_date" ||
            sort.direction !== "desc",
    );

    function toggleSort(field: InvoiceListSortField) {
        if (sort.field === field) {
            sort = {
                field,
                direction: sort.direction === "asc" ? "desc" : "asc",
            };
        } else {
            sort = { field, direction: "asc" };
        }
    }

    function clearFilters() {
        filters = { status: "", from: "", to: "", clientId: "" };
        sort = { field: "issue_date", direction: "desc" };
    }

    const computed = $derived.by(() => {
        const subtotal = items.reduce(
            (s, i) => s + Number(i.quantity) * Number(i.unit_price),
            0,
        );
        const tax_amount = (subtotal * Number(form.tax_rate)) / 100;
        const total = Math.max(
            0,
            subtotal + tax_amount - Number(form.discount),
        );
        return { subtotal, tax_amount, total };
    });

    $effect(() =>
        commands.register({
            id: "primary-new",
            title: "New invoice",
            group: "Create",
            hint: "⌘N",
            run: openNew,
        }),
    );

    function resetRecurring() {
        recurring = {
            enabled: false,
            freq: "monthly",
            interval: "1",
            endKind: "never",
            until: "",
            count: "12",
        };
    }

    function openNew() {
        editing = null;
        const num = `INV-${String(invoices.length + 1).padStart(4, "0")}`;
        form = {
            invoice_number: num,
            status: "draft",
            client_id: "none",
            project_id: "none",
            issue_date: ymd(),
            due_date: "",
            tax_rate: String(profile.taxRate),
            discount: "0",
            notes: "",
        };
        items = [blankItem(0)];
        resetRecurring();
        open = true;
    }

    async function openEdit(inv: Invoice) {
        editing = inv;
        form = {
            invoice_number: inv.invoice_number,
            status: inv.status,
            client_id: inv.client_id ?? "none",
            project_id: inv.project_id ?? "none",
            issue_date: inv.issue_date,
            due_date: inv.due_date ?? "",
            tax_rate: String(inv.tax_rate),
            discount: String(inv.discount),
            notes: inv.notes ?? "",
        };
        // Hydrate recurring fields from the row.
        if (inv.is_template && inv.recurrence) {
            recurring = {
                enabled: true,
                freq: inv.recurrence.freq ?? "monthly",
                interval: String(inv.recurrence.interval ?? 1),
                endKind: inv.recurrence.until
                    ? "until"
                    : inv.recurrence.count
                      ? "count"
                      : "never",
                until: inv.recurrence.until ?? "",
                count: String(inv.recurrence.count ?? 12),
            };
        } else {
            resetRecurring();
        }
        const data = await loadInvoiceItems(inv.id);
        items = data.length ? data : [blankItem(0)];
        open = true;
    }

    function updateItem(idx: number, patch: Partial<Item>) {
        items = items.map((it, i) =>
            i === idx
                ? {
                      ...it,
                      ...patch,
                      total:
                          (patch.quantity ?? it.quantity) *
                          (patch.unit_price ?? it.unit_price),
                  }
                : it,
        );
    }
    function removeItem(idx: number) {
        items = items.filter((_, i) => i !== idx);
        if (items.length === 0) {
            items = [blankItem(0)];
        }
    }
    function addItem() {
        items = [...items, blankItem(items.length)];
    }

    function invoiceSaveErrorMessage(err: {
        code?: string;
        message: string;
    }): string {
        // Postgres unique-violation on (user_id, invoice_number)
        if (err.code === "23505") {
            return "Invoice number already in use — pick another.";
        }
        return err.message;
    }

    function buildRecurrenceFields() {
        if (!recurring.enabled) {
            return {
                is_template: false,
                recurrence: null,
                next_run_at: null,
            };
        }
        const rrule: import("../lib/queries/invoices").InvoiceRecurrence = {
            freq: recurring.freq,
            interval: Math.max(1, Number(recurring.interval) || 1),
        };
        if (recurring.endKind === "until" && recurring.until) {
            rrule.until = recurring.until;
        } else if (recurring.endKind === "count") {
            rrule.count = Math.max(1, Number(recurring.count) || 1);
        }
        // First child runs from the same issue_date the user just picked.
        // For a brand-new template the user generally wants the first
        // invoice to spawn immediately; we set next_run_at = issue_date so
        // the cron picks it up on the next sweep.
        const next = form.issue_date
            ? new Date(`${form.issue_date}T01:00:00Z`).toISOString()
            : new Date().toISOString();
        return {
            is_template: true,
            recurrence: rrule,
            next_run_at: next,
        };
    }

    async function save() {
        if (!form.invoice_number.trim()) {
            toast.error("Invoice number required");
            return;
        }
        const recurFields = buildRecurrenceFields();
        const payload = {
            invoice_number: form.invoice_number.trim().slice(0, 50),
            status: form.status,
            client_id: form.client_id === "none" ? null : form.client_id,
            project_id: form.project_id === "none" ? null : form.project_id,
            issue_date: form.issue_date,
            due_date: form.due_date || null,
            tax_rate: Number(form.tax_rate),
            discount: Number(form.discount),
            subtotal: computed.subtotal,
            tax_amount: computed.tax_amount,
            total: computed.total,
            currency: profile.currency,
            notes: form.notes.trim() || null,
            paid_at: form.status === "paid" ? new Date().toISOString() : null,
            ...recurFields,
        };
        try {
            await $saveMutation.mutateAsync({
                editingId: editing?.id ?? null,
                payload,
                items,
            });
            toast.success(editing ? "Invoice updated" : "Invoice created");
            open = false;
        } catch (err) {
            toast.error(
                invoiceSaveErrorMessage(
                    err as { code?: string; message: string },
                ),
            );
        }
    }

    async function remove(id: string) {
        await softDelete(queryClient, "invoices", [id]);
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
                        ? "Delete invoice?"
                        : `Delete ${ids.length} invoices?`,
                message:
                    "Soft-deleted — restore from Trash within 5 seconds via Undo, or permanently from the Trash view.",
                confirmLabel: "Delete",
                destructive: true,
            }))
        ) {
            return;
        }
        selected.clear();
        await softDelete(queryClient, "invoices", ids);
    }

    function toggleOne(id: string) {
        if (selected.has(id)) {
            selected.delete(id);
        } else {
            selected.add(id);
        }
    }

    async function markPaid(inv: Invoice) {
        try {
            await $updateMutation.mutateAsync({
                id: inv.id,
                patch: { status: "paid", paid_at: new Date().toISOString() },
            });
            toast.success("Marked as paid");
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function openPreview(inv: Invoice) {
        try {
            preview = await loadInvoicePreview(inv, clients, profile.profile);
            previewOpen = true;
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function savePdf(p: InvoicePreview) {
        const pdf = renderInvoicePdf(p);
        const buf = pdf.output("arraybuffer") as ArrayBuffer;
        await saveBinaryFile(
            `${p.invoice.invoice_number}.pdf`,
            "application/pdf",
            buf,
        );
    }

    async function exportPdf(inv: Invoice) {
        try {
            const p = await loadInvoicePreview(inv, clients, profile.profile);
            await savePdf(p);
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function downloadFromPreview() {
        if (!preview) {
            return;
        }
        try {
            await savePdf(preview);
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    function editFromPreview() {
        if (!preview) {
            return;
        }
        const inv = preview.invoice;
        previewOpen = false;
        openEdit(inv);
    }

    // Email flow (Batch 13). Open dialog with client email pre-filled.
    function openEmail(inv: Invoice) {
        const client = clients.find((c) => c.id === inv.client_id);
        emailDialog = {
            target: inv,
            recipient: client?.email ?? "",
            subject: `Invoice ${inv.invoice_number}`,
            body: "",
        };
    }

    async function sendEmail() {
        if (!emailDialog) return;
        const { target, recipient, subject, body } = emailDialog;
        if (!recipient.trim()) {
            toast.error("Recipient email is required");
            return;
        }
        try {
            const p = await loadInvoicePreview(
                target,
                clients,
                profile.profile,
            );
            const pdf = renderInvoicePdf(p);
            const buf = pdf.output("arraybuffer") as ArrayBuffer;
            await $sendMutation.mutateAsync({
                invoiceId: target.id,
                pdfBytes: buf,
                recipient: recipient.trim(),
                subject: subject.trim() || undefined,
                body: body.trim() || undefined,
            });
            toast.success(`Sent to ${recipient.trim()}`);
            emailDialog = null;
            // If the invoice was a draft, flip it to "sent" — most users
            // would do this manually otherwise.
            if (target.status === "draft") {
                $updateMutation.mutate({
                    id: target.id,
                    patch: { status: "sent" },
                });
            }
        } catch (e) {
            const msg = (e as Error).message;
            // Specific friendly text when the Edge Function isn't deployed
            // (supabase-js returns 404 / "Failed to send a request to the Edge Function").
            if (/not configured|404|Failed to send/i.test(msg)) {
                toast.error(
                    "Email not configured — deploy supabase/functions/send-invoice and set RESEND_API_KEY. See README.",
                );
            } else {
                toast.error(msg);
            }
        }
    }
</script>

<div class="p-6">
    <PageHeader
        title={$_("page.invoices.title")}
        description={$_("page.invoices.description")}
    >
        {#snippet actions()}
            <Button variant="brand" onclick={openNew}>
                <Plus class="h-4 w-4" />
                {$_("page.invoices.newAction")}
            </Button>
        {/snippet}
    </PageHeader>

    {#if $invoicesQuery.isLoading}
        <div class="text-xs text-vscode-description">Loading…</div>
    {:else if invoices.length === 0}
        <Card>
            <EmptyState
                title="No invoices yet"
                description="Generate branded PDFs for your work."
            >
                {#snippet action()}
                    <Button variant="brand" onclick={openNew}>
                        <Plus class="h-4 w-4" /> New invoice
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
                        <option value={s}>{s}</option>
                    {/each}
                </Select>
            </Field>
            <Field label="Issued from">
                <Input type="date" bind:value={filters.from} />
            </Field>
            <Field label="Issued to">
                <Input type="date" bind:value={filters.to} />
            </Field>
            <Field label="Client">
                <Select bind:value={filters.clientId}>
                    <option value="">All</option>
                    {#each clients as c (c.id)}
                        <option value={c.id}>{c.name}</option>
                    {/each}
                </Select>
            </Field>
            {#if filtersActive}
                <Button variant="ghost" size="sm" onclick={clearFilters}>
                    Clear
                </Button>
            {/if}
        </div>
        <Card>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-vscode-border text-left">
                            <th class="w-6 pb-2">
                                <SelectableHeader
                                    ids={invoices.map((i) => i.id)}
                                    {selected}
                                    onchange={(next) => {
                                        selected = new SvelteSet(next);
                                    }}
                                />
                            </th>
                            <SortableHeader
                                field="invoice_number"
                                current={sort}
                                onsort={toggleSort}
                            >
                                Number
                            </SortableHeader>
                            <th
                                class="pb-2 font-medium text-[11px] uppercase tracking-wide text-vscode-description"
                            >
                                Client
                            </th>
                            <SortableHeader
                                field="issue_date"
                                current={sort}
                                onsort={toggleSort}
                            >
                                Issued
                            </SortableHeader>
                            <th
                                class="pb-2 font-medium text-[11px] uppercase tracking-wide text-vscode-description"
                            >
                                Status
                            </th>
                            <SortableHeader
                                field="total"
                                current={sort}
                                align="right"
                                onsort={toggleSort}
                            >
                                Total
                            </SortableHeader>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {#if invoices.length === 0}
                            <tr>
                                <td
                                    colspan="7"
                                    class="py-6 text-center text-xs text-vscode-description"
                                >
                                    No invoices match these filters.
                                </td>
                            </tr>
                        {/if}
                        {#each invoices as inv (inv.id)}
                            <tr
                                class="group border-b border-vscode-border last:border-0"
                            >
                                <td class="w-6 py-2">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(inv.id)}
                                        aria-label="Select {inv.invoice_number}"
                                        onchange={() => toggleOne(inv.id)}
                                    />
                                </td>
                                <td class="py-2 font-medium"
                                    >{inv.invoice_number}</td
                                >
                                <td class="py-2 text-vscode-description">
                                    {clients.find((c) => c.id === inv.client_id)
                                        ?.name ?? "—"}
                                </td>
                                <td class="py-2 text-vscode-description">
                                    {inv.issue_date}
                                </td>
                                <td class="py-2">
                                    <div class="flex items-center gap-1.5">
                                        <Badge
                                            tone={statusTone[inv.status] ??
                                                "muted"}
                                        >
                                            {inv.status}
                                        </Badge>
                                        {#if inv.is_template}
                                            <span
                                                title="Recurring template"
                                                aria-label="Recurring template"
                                                class="text-[13px]">🔁</span
                                            >
                                        {/if}
                                    </div>
                                </td>
                                <td class="py-2 text-right font-semibold">
                                    {formatCurrency(
                                        Number(inv.total),
                                        inv.currency,
                                    )}
                                </td>
                                <td class="py-2 text-right">
                                    <div
                                        class="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                                    >
                                        {#if inv.status !== "paid"}
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                class="text-vscode-success"
                                                aria-label="Mark paid"
                                                title="Mark paid"
                                                onclick={() => markPaid(inv)}
                                            >
                                                <Check class="h-3.5 w-3.5" />
                                            </Button>
                                        {/if}
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            aria-label="Preview"
                                            title="Preview"
                                            onclick={() => openPreview(inv)}
                                        >
                                            <Eye class="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            aria-label="Download PDF"
                                            title="Download PDF"
                                            onclick={() => exportPdf(inv)}
                                        >
                                            <FileDown class="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            aria-label="Email invoice"
                                            title="Email invoice"
                                            onclick={() => openEmail(inv)}
                                        >
                                            <Mail class="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            aria-label="Edit"
                                            onclick={() => openEdit(inv)}
                                        >
                                            <Pencil class="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            class="text-vscode-error"
                                            aria-label="Delete"
                                            onclick={() => remove(inv.id)}
                                        >
                                            <Trash2 class="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </Card>
        {#if $invoicesQuery.hasNextPage}
            <div class="mt-3 flex justify-center">
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={$invoicesQuery.isFetchingNextPage}
                    onclick={() => $invoicesQuery.fetchNextPage()}
                >
                    {$invoicesQuery.isFetchingNextPage
                        ? "Loading…"
                        : "Load more"}
                </Button>
            </div>
        {/if}
    {/if}
</div>

<BulkActionBar
    count={selected.size}
    label={selected.size === 1 ? "invoice selected" : "invoices selected"}
    onclear={() => selected.clear()}
>
    {#snippet actions()}
        <Button variant="destructive" size="sm" onclick={bulkRemove}>
            <Trash2 class="h-3.5 w-3.5" /> Delete
        </Button>
    {/snippet}
</BulkActionBar>

<InvoicePreviewDialog
    bind:open={previewOpen}
    {preview}
    onClose={() => (previewOpen = false)}
    onDownload={downloadFromPreview}
    onEdit={editFromPreview}
/>

{#if emailDialog}
    <Dialog
        open
        title="Email invoice {emailDialog.target.invoice_number}"
        size="md"
        onClose={() => (emailDialog = null)}
    >
        <div class="space-y-3">
            <Field label="To" required>
                <Input
                    type="email"
                    bind:value={emailDialog.recipient}
                    placeholder="client@example.com"
                />
            </Field>
            <Field label="Subject">
                <Input bind:value={emailDialog.subject} />
            </Field>
            <Field label="Message (optional)">
                <Textarea bind:value={emailDialog.body} rows={4} />
            </Field>
            <p class="text-xs text-vscode-description">
                The PDF is generated locally and attached as a secure download
                link (valid 24h). Requires the <code>send-invoice</code> Edge
                Function deployed with a Resend API key — see the function's
                README.
            </p>
        </div>
        {#snippet footer()}
            <Button variant="ghost" onclick={() => (emailDialog = null)}>
                Cancel
            </Button>
            <Button
                variant="brand"
                loading={$sendMutation.isPending}
                disabled={$sendMutation.isPending}
                onclick={sendEmail}
            >
                Send
            </Button>
        {/snippet}
    </Dialog>
{/if}

<Dialog bind:open title={editing ? "Edit invoice" : "New invoice"} size="xl">
    <div class="grid gap-3 sm:grid-cols-3">
        <Field label="Invoice #">
            <Input bind:value={form.invoice_number} />
        </Field>
        <Field label="Status">
            <Select bind:value={form.status}>
                {#each STATUSES as s (s)}
                    <option value={s}>{s}</option>
                {/each}
            </Select>
        </Field>
        <div></div>
        <Field label="Client">
            <Select bind:value={form.client_id}>
                <option value="none">No client</option>
                {#each clients as c (c.id)}
                    <option value={c.id}>{c.name}</option>
                {/each}
            </Select>
        </Field>
        <Field label="Project">
            <Select bind:value={form.project_id}>
                <option value="none">No project</option>
                {#each projects as p (p.id)}
                    <option value={p.id}>{p.name}</option>
                {/each}
            </Select>
        </Field>
        <div></div>
        <Field label="Issue date">
            <Input type="date" bind:value={form.issue_date} />
        </Field>
        <Field label="Due date">
            <Input type="date" bind:value={form.due_date} />
        </Field>
        <div></div>
    </div>

    <div class="mt-4">
        <div class="mb-1 text-xs font-medium">Items</div>
        <div class="space-y-2">
            {#each items as it, idx (idx)}
                <div class="grid grid-cols-12 gap-2">
                    <Input
                        class="col-span-6"
                        placeholder="Description"
                        bind:value={items[idx].description}
                    />
                    <Input
                        class="col-span-2"
                        type="number"
                        step="0.01"
                        placeholder="Qty"
                        value={it.quantity}
                        oninput={(e) =>
                            updateItem(idx, {
                                quantity: Number(
                                    (e.target as HTMLInputElement).value,
                                ),
                            })}
                    />
                    <Input
                        class="col-span-2"
                        type="number"
                        step="0.01"
                        placeholder="Price"
                        value={it.unit_price}
                        oninput={(e) =>
                            updateItem(idx, {
                                unit_price: Number(
                                    (e.target as HTMLInputElement).value,
                                ),
                            })}
                    />
                    <div
                        class="col-span-1 flex items-center justify-end text-xs"
                    >
                        {formatCurrency(it.total, profile.currency)}
                    </div>
                    <Button
                        size="icon"
                        variant="ghost"
                        class="col-span-1"
                        aria-label="Remove line"
                        onclick={() => removeItem(idx)}
                    >
                        <Trash2 class="h-3.5 w-3.5" />
                    </Button>
                </div>
            {/each}
            <Button size="sm" variant="outline" onclick={addItem}>
                <Plus class="h-3.5 w-3.5" /> Add line
            </Button>
        </div>
    </div>

    <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Tax rate (%)">
            <Input type="number" step="0.01" bind:value={form.tax_rate} />
        </Field>
        <Field label="Discount">
            <Input type="number" step="0.01" bind:value={form.discount} />
        </Field>
        <Field label="Total">
            <div class="flex h-8 items-center font-semibold">
                {formatCurrency(computed.total, profile.currency)}
            </div>
        </Field>
    </div>

    <div class="mt-4">
        <Field label="Notes">
            <Textarea bind:value={form.notes} rows={2} />
        </Field>
    </div>

    <!-- Recurring toggle + frequency picker. When enabled, this row becomes
         a billing template; pg_cron's daily sweep clones it on schedule. -->
    <div class="mt-4 rounded border border-vscode-border bg-vscode-card-bg p-3">
        <label class="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={recurring.enabled} />
            <span>Recurring invoice (template)</span>
        </label>
        {#if recurring.enabled}
            <div class="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Frequency">
                    <Select bind:value={recurring.freq}>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                    </Select>
                </Field>
                <Field label="Every">
                    <Input
                        type="number"
                        min="1"
                        bind:value={recurring.interval}
                    />
                </Field>
                <Field label="Ends">
                    <Select bind:value={recurring.endKind}>
                        <option value="never">Never</option>
                        <option value="until">On date</option>
                        <option value="count">After N invoices</option>
                    </Select>
                </Field>
                {#if recurring.endKind === "until"}
                    <Field label="Until">
                        <Input type="date" bind:value={recurring.until} />
                    </Field>
                {:else if recurring.endKind === "count"}
                    <Field label="Number of invoices">
                        <Input
                            type="number"
                            min="1"
                            bind:value={recurring.count}
                        />
                    </Field>
                {/if}
            </div>
            <p class="mt-2 text-xs text-vscode-description">
                The first child invoice spawns on the issue date you picked
                above, then every {recurring.interval}
                {recurring.freq}. Requires <code>pg_cron</code> enabled in Supabase
                Dashboard → Database → Extensions; templates can be edited or deleted
                anytime to pause/stop billing.
            </p>
        {/if}
    </div>

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
        <Button variant="brand" onclick={save}>
            {editing ? "Update" : "Create"}
        </Button>
    {/snippet}
</Dialog>
