// Pure data-prep + jsPDF rendering for invoices, extracted from
// Invoices.svelte's old `exportPdf()`. Two consumers:
//   - InvoicePreviewDialog renders the InvoicePreview shape as styled HTML
//   - exportPdf() turns the same shape into a jsPDF document for download
// Sharing the shape avoids loading invoice items twice and keeps the visual
// preview faithful to the downloaded PDF.

import jsPDF from "jspdf";
import {
  loadInvoiceItems,
  type Invoice,
  type InvoiceItem,
} from "./queries/invoices";
import type { Client } from "./queries/clients";
import { formatCurrency } from "./utils";

export type InvoiceBrand = {
  color: string;
  companyName: string;
};

export type InvoicePreview = {
  invoice: Invoice;
  items: InvoiceItem[];
  client: Client | null;
  brand: InvoiceBrand;
};

export type ProfileForPreview = {
  brand_color?: string | null;
  company_name?: string | null;
  display_name?: string | null;
};

export async function loadInvoicePreview(
  inv: Invoice,
  clients: Client[],
  prof: ProfileForPreview | null | undefined,
): Promise<InvoicePreview> {
  const items = await loadInvoiceItems(inv.id);
  const client = clients.find((c) => c.id === inv.client_id) ?? null;
  return {
    invoice: inv,
    items,
    client,
    brand: {
      color: prof?.brand_color || "#7c5cff",
      companyName: prof?.company_name || prof?.display_name || "Invoice",
    },
  };
}

export function renderInvoicePdf(preview: InvoicePreview): jsPDF {
  const { invoice: inv, items, client, brand } = preview;
  const doc = new jsPDF();

  const r = parseInt(brand.color.slice(1, 3), 16);
  const g = parseInt(brand.color.slice(3, 5), 16);
  const b = parseInt(brand.color.slice(5, 7), 16);
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255);
  doc.setFontSize(20);
  doc.text(brand.companyName, 14, 18);

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
  for (const it of items) {
    doc.text(String(it.description).slice(0, 70), 16, y);
    doc.text(String(it.quantity), 130, y);
    doc.text(formatCurrency(Number(it.unit_price), inv.currency), 150, y);
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
  doc.text(`Total: ${formatCurrency(Number(inv.total), inv.currency)}`, 140, y);

  if (inv.notes) {
    y += 14;
    doc.setFontSize(10);
    doc.text(`Notes: ${inv.notes}`, 14, y);
  }
  return doc;
}
