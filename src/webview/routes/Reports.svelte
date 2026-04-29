<script lang="ts">
    import { Download } from "lucide-svelte";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import StatCard from "../lib/components/StatCard.svelte";
    import ChartCanvas from "../lib/components/ChartCanvas.svelte";
    import EmptyState from "../lib/components/ui/EmptyState.svelte";
    import { profile } from "../lib/stores/profile.svelte";
    import { formatCurrency } from "../lib/utils";
    import { useReportsQuery } from "../lib/queries/reports";

    const reportsQuery = useReportsQuery();
    const invoices = $derived($reportsQuery.data?.invoices ?? []);
    const expenses = $derived($reportsQuery.data?.expenses ?? []);
    const clients = $derived($reportsQuery.data?.clients ?? []);

    const monthly = $derived.by(() => {
        const months = Array.from({ length: 6 }, (_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - (5 - i));
            return d.toISOString().slice(0, 7);
        });
        const m: Record<string, { revenue: number; expenses: number }> = {};
        months.forEach((k) => (m[k] = { revenue: 0, expenses: 0 }));
        for (const i of invoices) {
            if (i.status !== "paid" || !i.paid_at) {
                continue;
            }
            const k = i.paid_at.slice(0, 7);
            if (m[k]) {
                m[k].revenue += Number(i.total);
            }
        }
        for (const e of expenses) {
            const k = e.expense_date.slice(0, 7);
            if (m[k]) {
                m[k].expenses += Number(e.amount);
            }
        }
        return months.map((k) => ({
            label: k.slice(5) + "/" + k.slice(2, 4),
            revenue: m[k].revenue,
            expenses: m[k].expenses,
        }));
    });

    const topClients = $derived.by(() => {
        const t: Record<string, number> = {};
        for (const i of invoices) {
            if (i.status !== "paid" || !i.client_id) {
                continue;
            }
            t[i.client_id] = (t[i.client_id] ?? 0) + Number(i.total);
        }
        return Object.entries(t)
            .map(([id, total]) => ({
                name: clients.find((c) => c.id === id)?.name ?? "Unknown",
                total,
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    });

    const totalRev = $derived(
        invoices
            .filter((i) => i.status === "paid")
            .reduce((s, i) => s + Number(i.total), 0),
    );
    const totalExp = $derived(
        expenses.reduce((s, e) => s + Number(e.amount), 0),
    );
    const profit = $derived(totalRev - totalExp);

    const lineConfig = $derived({
        type: "line" as const,
        data: {
            labels: monthly.map((m) => m.label),
            datasets: [
                {
                    label: "Revenue",
                    data: monthly.map((m) => m.revenue),
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16,185,129,.15)",
                    tension: 0.3,
                },
                {
                    label: "Expenses",
                    data: monthly.map((m) => m.expenses),
                    borderColor: "#f59e0b",
                    backgroundColor: "rgba(245,158,11,.15)",
                    tension: 0.3,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: "currentColor" } } },
            scales: {
                x: { ticks: { color: "currentColor" } },
                y: { ticks: { color: "currentColor" } },
            },
        },
    });

    const barConfig = $derived({
        type: "bar" as const,
        data: {
            labels: topClients.map((c) => c.name),
            datasets: [
                {
                    label: "Paid revenue",
                    data: topClients.map((c) => c.total),
                    backgroundColor: "#7c5cff",
                    borderRadius: 6,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: "currentColor" } },
                y: { ticks: { color: "currentColor" } },
            },
        },
    });

    function exportCsv() {
        const rows: string[][] = [["Type", "Date", "Description", "Amount"]];
        for (const i of invoices) {
            rows.push([
                "invoice",
                i.issue_date,
                i.invoice_number,
                String(i.total),
            ]);
        }
        for (const e of expenses) {
            rows.push([
                "expense",
                e.expense_date,
                e.category,
                String(e.amount),
            ]);
        }
        const csv = rows
            .map((r) =>
                r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
            )
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "vs-crm-export.csv";
        a.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="p-6">
    <PageHeader title="Reports" description="See where your business stands.">
        {#snippet actions()}
            <Button variant="outline" onclick={exportCsv}>
                <Download class="h-4 w-4" /> Export CSV
            </Button>
        {/snippet}
    </PageHeader>

    <div class="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
            label="Total revenue"
            value={formatCurrency(totalRev, profile.currency)}
            accent="success"
        />
        <StatCard
            label="Total expenses"
            value={formatCurrency(totalExp, profile.currency)}
            accent="warning"
        />
        <StatCard
            label="Net profit"
            value={formatCurrency(profit, profile.currency)}
            accent={profit >= 0 ? "brand" : "warning"}
        />
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
        <Card title="Revenue vs expenses">
            <ChartCanvas config={lineConfig} height={260} />
        </Card>
        <Card title="Top clients">
            {#if topClients.length === 0}
                <EmptyState
                    title="No paid invoices yet"
                    description="Charts populate once invoices are marked paid."
                />
            {:else}
                <ChartCanvas config={barConfig} height={260} />
            {/if}
        </Card>
    </div>
</div>
