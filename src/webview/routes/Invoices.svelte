<script lang="ts">
    import { toast } from "svelte-sonner";
    import { SvelteSet } from "svelte/reactivity";
    import { useQueryClient } from "@tanstack/svelte-query";
    import { Plus, Trash2, Pencil, FileDown, Eye, Check } from "lucide-svelte";
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
    import { compareBy, type SortDir } from "../lib/sort";
    import { inDateRange } from "../lib/dateFilter";
    import {
        loadInvoicePreview,
        renderInvoicePdf,
        type InvoicePreview,
    } from "../lib/invoicePreview";
    import {
        useInvoicesQuery,
        useSaveInvoiceMutation,
        useUpdateInvoiceMutation,
        loadInvoiceItems,
        type Invoice,
        type InvoiceItem as Item,
    } from "../lib/queries/invoices";
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
    const invoicesQuery = useInvoicesQuery();
    const clientsQuery = useClientsQuery();
    const projectsQuery = useProjectsQuery();
    const saveMutation = useSaveInvoiceMutation();
    const updateMutation = useUpdateInvoiceMutation();

    let selected = $state(new SvelteSet<string>());
    let previewOpen = $state(false);
    let preview = $state<InvoicePreview | null>(null);

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

    const invoices = $derived($invoicesQuery.data ?? []);
    const clients = $derived($clientsQuery.data ?? []);
    const projects = $derived($projectsQuery.data ?? []);

    type SortField = "invoice_number" | "issue_date" | "total";
    let filters = $state({ status: "", from: "", to: "", clientId: "" });
    let sort = $state<{ field: SortField; direction: SortDir }>({
        field: "issue_date",
        direction: "desc",
    });

    const filteredSorted = $derived.by(() => {
        const filtered = invoices.filter(
            (i) =>
                (!filters.status || i.status === filters.status) &&
                (!filters.clientId || i.client_id === filters.clientId) &&
                inDateRange(i.issue_date, filters.from, filters.to),
        );
        const sortKey: (i: (typeof invoices)[number]) => unknown =
            sort.field === "total"
                ? (i) => Number(i.total)
                : (i) => i[sort.field];
        return [...filtered].sort(compareBy(sortKey, sort.direction));
    });

    const filtersActive = $derived(
        !!filters.status ||
            !!filters.from ||
            !!filters.to ||
            !!filters.clientId ||
            sort.field !== "issue_date" ||
            sort.direction !== "desc",
    );

    function toggleSort(field: SortField) {
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

    async function save() {
        if (!form.invoice_number.trim()) {
            toast.error("Invoice number required");
            return;
        }
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

    async function exportPdf(inv: Invoice) {
        try {
            const p = await loadInvoicePreview(inv, clients, profile.profile);
            renderInvoicePdf(p).save(`${inv.invoice_number}.pdf`);
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    function downloadFromPreview() {
        if (!preview) {
            return;
        }
        renderInvoicePdf(preview).save(`${preview.invoice.invoice_number}.pdf`);
    }

    function editFromPreview() {
        if (!preview) {
            return;
        }
        const inv = preview.invoice;
        previewOpen = false;
        openEdit(inv);
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
                                    ids={filteredSorted.map((i) => i.id)}
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
                        {#if filteredSorted.length === 0}
                            <tr>
                                <td
                                    colspan="7"
                                    class="py-6 text-center text-xs text-vscode-description"
                                >
                                    No invoices match these filters.
                                </td>
                            </tr>
                        {/if}
                        {#each filteredSorted as inv (inv.id)}
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
                                    <Badge
                                        tone={statusTone[inv.status] ?? "muted"}
                                    >
                                        {inv.status}
                                    </Badge>
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

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
        <Button variant="brand" onclick={save}>
            {editing ? "Update" : "Create"}
        </Button>
    {/snippet}
</Dialog>
