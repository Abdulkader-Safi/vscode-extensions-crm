<script lang="ts">
    // HTML preview of an invoice, mirroring the PDF layout. Rendered in a
    // Dialog rather than an iframe to avoid extending the CSP — current CSP
    // has no `frame-src` so a `blob:` iframe would be blocked.
    import { FileDown, Pencil } from "lucide-svelte";
    import Dialog from "./Dialog.svelte";
    import Button from "./Button.svelte";
    import { formatCurrency } from "../../utils";
    import type { InvoicePreview } from "../../invoicePreview";

    interface Props {
        open: boolean;
        preview: InvoicePreview | null;
        onClose: () => void;
        onDownload: () => void;
        onEdit?: () => void;
    }

    let {
        open = $bindable(false),
        preview,
        onClose,
        onDownload,
        onEdit,
    }: Props = $props();
</script>

<Dialog
    {open}
    {onClose}
    title={preview ? `Invoice ${preview.invoice.invoice_number}` : "Invoice"}
    size="xl"
>
    {#if preview}
        {@const inv = preview.invoice}
        {@const client = preview.client}
        {@const brand = preview.brand}
        <div
            class="overflow-hidden rounded border border-vscode-border bg-white text-black"
        >
            <div
                class="flex items-center px-6 py-5"
                style="background-color: {brand.color}; color: white;"
            >
                <h2 class="text-xl font-bold">{brand.companyName}</h2>
            </div>

            <div class="grid gap-4 px-6 py-5 sm:grid-cols-2">
                <div class="text-sm">
                    <div class="font-semibold">
                        Invoice {inv.invoice_number}
                    </div>
                    <div class="mt-1 text-xs text-gray-600">
                        Issued: {inv.issue_date}
                    </div>
                    {#if inv.due_date}
                        <div class="text-xs text-gray-600">
                            Due: {inv.due_date}
                        </div>
                    {/if}
                </div>
                {#if client}
                    <div class="text-sm sm:text-right">
                        <div
                            class="text-xs uppercase tracking-wide text-gray-500"
                        >
                            Bill to
                        </div>
                        <div class="font-medium">{client.name}</div>
                        {#if client.company}
                            <div class="text-xs text-gray-600">
                                {client.company}
                            </div>
                        {/if}
                        {#if client.email}
                            <div class="text-xs text-gray-600">
                                {client.email}
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>

            <div class="px-6 pb-5">
                <table class="w-full text-sm">
                    <thead>
                        <tr
                            class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"
                        >
                            <th class="px-2 py-2">Description</th>
                            <th class="px-2 py-2 text-right">Qty</th>
                            <th class="px-2 py-2 text-right">Price</th>
                            <th class="px-2 py-2 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each preview.items as it, idx (it.id ?? idx)}
                            <tr class="border-b border-gray-100">
                                <td class="px-2 py-2">{it.description}</td>
                                <td class="px-2 py-2 text-right">
                                    {it.quantity}
                                </td>
                                <td class="px-2 py-2 text-right">
                                    {formatCurrency(
                                        Number(it.unit_price),
                                        inv.currency,
                                    )}
                                </td>
                                <td class="px-2 py-2 text-right">
                                    {formatCurrency(
                                        Number(it.total),
                                        inv.currency,
                                    )}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>

                <div class="mt-4 flex justify-end">
                    <dl
                        class="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm"
                    >
                        <dt class="text-gray-600">Subtotal</dt>
                        <dd class="text-right">
                            {formatCurrency(Number(inv.subtotal), inv.currency)}
                        </dd>
                        <dt class="text-gray-600">Tax</dt>
                        <dd class="text-right">
                            {formatCurrency(
                                Number(inv.tax_amount),
                                inv.currency,
                            )}
                        </dd>
                        <dt class="text-gray-600">Discount</dt>
                        <dd class="text-right">
                            {formatCurrency(Number(inv.discount), inv.currency)}
                        </dd>
                        <dt class="border-t border-gray-200 pt-1 font-semibold">
                            Total
                        </dt>
                        <dd
                            class="border-t border-gray-200 pt-1 text-right text-base font-semibold"
                        >
                            {formatCurrency(Number(inv.total), inv.currency)}
                        </dd>
                    </dl>
                </div>

                {#if inv.notes}
                    <div class="mt-6 border-t border-gray-200 pt-3 text-xs">
                        <div class="font-semibold text-gray-700">Notes</div>
                        <div class="mt-1 whitespace-pre-wrap text-gray-600">
                            {inv.notes}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    {#snippet footer()}
        {#if onEdit}
            <Button variant="ghost" onclick={onEdit}>
                <Pencil class="h-3.5 w-3.5" /> Edit
            </Button>
        {/if}
        <Button variant="ghost" onclick={onClose}>Close</Button>
        <Button variant="brand" onclick={onDownload}>
            <FileDown class="h-3.5 w-3.5" /> Download PDF
        </Button>
    {/snippet}
</Dialog>
