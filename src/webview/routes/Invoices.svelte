<script lang="ts">
    import { toast } from "svelte-sonner";
    import { Plus, Trash2, Pencil, FileDown, Check } from "lucide-svelte";
    import jsPDF from "jspdf";
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
    import { confirm } from "../lib/confirm.svelte";
    import { profile } from "../lib/stores/profile.svelte";
    import { formatCurrency, ymd } from "../lib/utils";
    import {
        useInvoicesQuery,
        useSaveInvoiceMutation,
        useUpdateInvoiceMutation,
        useDeleteInvoiceMutation,
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

    const invoicesQuery = useInvoicesQuery();
    const clientsQuery = useClientsQuery();
    const projectsQuery = useProjectsQuery();
    const saveMutation = useSaveInvoiceMutation();
    const updateMutation = useUpdateInvoiceMutation();
    const deleteMutation = useDeleteInvoiceMutation();

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
        if (
            !(await confirm({
                title: "Delete invoice?",
                message: "Line items will be removed with it.",
                confirmLabel: "Delete",
                destructive: true,
            }))
        ) {
            return;
        }
        try {
            await $deleteMutation.mutateAsync(id);
        } catch (e) {
            toast.error((e as Error).message);
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

    async function exportPdf(inv: Invoice) {
        const itemRows = await loadInvoiceItems(inv.id);
        const client = clients.find((c) => c.id === inv.client_id);
        const doc = new jsPDF();
        const brand = profile.profile?.brand_color || "#7c5cff";
        const r = parseInt(brand.slice(1, 3), 16);
        const g = parseInt(brand.slice(3, 5), 16);
        const b = parseInt(brand.slice(5, 7), 16);
        doc.setFillColor(r, g, b);
        doc.rect(0, 0, 210, 28, "F");
        doc.setTextColor(255);
        doc.setFontSize(20);
        doc.text(
            profile.profile?.company_name ||
                profile.profile?.display_name ||
                "Invoice",
            14,
            18,
        );
        doc.setTextColor(0);
        doc.setFontSize(11);
        doc.text(`Invoice ${inv.invoice_number}`, 14, 42);
        doc.text(`Issued: ${inv.issue_date}`, 14, 49);
        if (inv.due_date) {
            doc.text(`Due: ${inv.due_date}`, 14, 56);
        }
        if (client) {
            doc.text("Bill to:", 130, 42);
            doc.text(client.name, 130, 49);
            if (client.company) {
                doc.text(client.company, 130, 56);
            }
            if (client.email) {
                doc.text(client.email, 130, 63);
            }
        }
        let y = 80;
        doc.setFillColor(245, 245, 245);
        doc.rect(14, y - 5, 182, 8, "F");
        doc.setFontSize(10);
        doc.text("Description", 16, y);
        doc.text("Qty", 130, y);
        doc.text("Price", 150, y);
        doc.text("Total", 178, y);
        y += 8;
        const rows = itemRows;
        for (const it of rows) {
            doc.text(String(it.description).slice(0, 70), 16, y);
            doc.text(String(it.quantity), 130, y);
            doc.text(
                formatCurrency(Number(it.unit_price), inv.currency),
                150,
                y,
            );
            doc.text(formatCurrency(Number(it.total), inv.currency), 178, y);
            y += 7;
        }
        y += 10;
        doc.text(
            `Subtotal: ${formatCurrency(Number(inv.subtotal), inv.currency)}`,
            140,
            y,
        );
        y += 6;
        doc.text(
            `Tax: ${formatCurrency(Number(inv.tax_amount), inv.currency)}`,
            140,
            y,
        );
        y += 6;
        doc.text(
            `Discount: ${formatCurrency(Number(inv.discount), inv.currency)}`,
            140,
            y,
        );
        y += 6;
        doc.setFontSize(13);
        doc.text(
            `Total: ${formatCurrency(Number(inv.total), inv.currency)}`,
            140,
            y,
        );
        if (inv.notes) {
            y += 14;
            doc.setFontSize(10);
            doc.text(`Notes: ${inv.notes}`, 14, y);
        }
        doc.save(`${inv.invoice_number}.pdf`);
    }
</script>

<div class="p-6">
    <PageHeader
        title="Invoices"
        description="Send branded invoices and track payments."
    >
        {#snippet actions()}
            <Button variant="brand" onclick={openNew}>
                <Plus class="h-4 w-4" /> New invoice
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
        <Card>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr
                            class="border-b border-vscode-border text-left text-[11px] uppercase tracking-wide text-vscode-description"
                        >
                            <th class="pb-2 font-medium">Number</th>
                            <th class="pb-2 font-medium">Client</th>
                            <th class="pb-2 font-medium">Issued</th>
                            <th class="pb-2 font-medium">Status</th>
                            <th class="pb-2 text-right font-medium">Total</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each invoices as inv (inv.id)}
                            <tr
                                class="group border-b border-vscode-border last:border-0"
                            >
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
