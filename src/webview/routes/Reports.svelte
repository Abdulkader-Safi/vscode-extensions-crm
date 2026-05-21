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
    import { convertToBase } from "../lib/fx";
    import { saveTextFile } from "../lib/saveFile";
    import { toast } from "svelte-sonner";
    import { _ } from "../i18n";

    const reportsQuery = useReportsQuery();
    // Helper closures that bake in the user's base currency + saved FX rates.
    // All monetary aggregation goes through these so mixed-currency totals
    // come out in the profile currency. Currencies without a saved rate fall
    // through at face value (footnote calls this out).
    const inv = (v: number, c: string) =>
        convertToBase(v, c, profile.currency, profile.fxRates);
    const invoices = $derived($reportsQuery.data?.invoices ?? []);
    const expenses = $derived($reportsQuery.data?.expenses ?? []);
    const clients = $derived($reportsQuery.data?.clients ?? []);
    const projects = $derived($reportsQuery.data?.projects ?? []);
    const timeEntries = $derived($reportsQuery.data?.timeEntries ?? []);

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
                m[k].revenue += inv(Number(i.total), i.currency);
            }
        }
        for (const e of expenses) {
            const k = e.expense_date.slice(0, 7);
            if (m[k]) {
                m[k].expenses += inv(Number(e.amount), e.currency);
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
            t[i.client_id] =
                (t[i.client_id] ?? 0) + inv(Number(i.total), i.currency);
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
            .reduce((s, i) => s + inv(Number(i.total), i.currency), 0),
    );
    const totalExp = $derived(
        expenses.reduce((s, e) => s + inv(Number(e.amount), e.currency), 0),
    );
    const profit = $derived(totalRev - totalExp);

    // DSO (days sales outstanding): mean (paid_at - issue_date) over invoices
    // paid in the trailing 90 days. Surfaces collection speed; high DSO = slow
    // payers. Invoices without paid_at are excluded; if no qualifying rows,
    // we render "—" so the metric isn't misleading.
    const dso = $derived.by(() => {
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const samples: number[] = [];
        for (const i of invoices) {
            if (i.status !== "paid" || !i.paid_at) {
                continue;
            }
            const paid = new Date(i.paid_at).getTime();
            if (paid < cutoff) {
                continue;
            }
            const issued = new Date(i.issue_date).getTime();
            const days = (paid - issued) / (24 * 60 * 60 * 1000);
            if (days >= 0) {
                samples.push(days);
            }
        }
        if (samples.length === 0) {
            return null;
        }
        const mean = samples.reduce((s, d) => s + d, 0) / samples.length;
        return Math.round(mean);
    });

    // Per-project ROI: paid revenue minus expenses tagged to that project.
    // Hourly rate: paid revenue divided by total hours logged on the project.
    // Hours come from `time_entries.duration_minutes`; we don't filter by a
    // billable flag (no such column today — every entry counts) and unpaid
    // invoices are excluded so the rate reflects collected, not invoiced, work.
    type ProjectRow = {
        id: string;
        name: string;
        revenue: number;
        expense: number;
        hours: number;
        roi: number;
        rate: number | null;
    };

    const perProject = $derived.by<ProjectRow[]>(() => {
        const byId = new Map<string, ProjectRow>();
        for (const p of projects) {
            byId.set(p.id, {
                id: p.id,
                name: p.name,
                revenue: 0,
                expense: 0,
                hours: 0,
                roi: 0,
                rate: null,
            });
        }
        for (const i of invoices) {
            if (i.status !== "paid" || !i.project_id) {
                continue;
            }
            const row = byId.get(i.project_id);
            if (row) {
                row.revenue += inv(Number(i.total), i.currency);
            }
        }
        for (const e of expenses) {
            if (!e.project_id) {
                continue;
            }
            const row = byId.get(e.project_id);
            if (row) {
                row.expense += inv(Number(e.amount), e.currency);
            }
        }
        for (const t of timeEntries) {
            if (!t.project_id || !t.duration_minutes) {
                continue;
            }
            const row = byId.get(t.project_id);
            if (row) {
                row.hours += Number(t.duration_minutes) / 60;
            }
        }
        for (const row of byId.values()) {
            row.roi = row.revenue - row.expense;
            row.rate = row.hours > 0 ? row.revenue / row.hours : null;
        }
        return Array.from(byId.values()).sort((a, b) => b.roi - a.roi);
    });

    const topRoi = $derived(
        perProject.filter((p) => p.revenue || p.expense).slice(0, 6),
    );

    // Cash-flow projection: outstanding invoices summed by their `due_date`
    // month for the next 6 months, plus a "projected" series that fills any
    // future month with the trailing-3-month paid average. Recurring
    // templates (is_template=true) are skipped — they're not billed
    // themselves; their cron-spawned children appear as regular invoices
    // and show up under "outstanding" automatically once they exist.
    const cashFlow = $derived.by(() => {
        const months = Array.from({ length: 6 }, (_, idx) => {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() + idx);
            return d.toISOString().slice(0, 7);
        });
        const outstanding: Record<string, number> = {};
        months.forEach((k) => (outstanding[k] = 0));
        for (const i of invoices) {
            if (i.is_template || i.status === "paid" || !i.due_date) {
                continue;
            }
            const k = i.due_date.slice(0, 7);
            if (k in outstanding) {
                outstanding[k] += inv(Number(i.total), i.currency);
            }
        }

        // Trailing-3-month paid average for forward smoothing.
        const trailing: Record<string, number> = {};
        for (const i of invoices) {
            if (i.status !== "paid" || !i.paid_at) {
                continue;
            }
            const k = i.paid_at.slice(0, 7);
            trailing[k] = (trailing[k] ?? 0) + inv(Number(i.total), i.currency);
        }
        const trailingKeys = Object.keys(trailing).sort().slice(-3);
        const smoothed =
            trailingKeys.length > 0
                ? trailingKeys.reduce((s, k) => s + trailing[k], 0) /
                  trailingKeys.length
                : 0;

        return months.map((k) => ({
            label: k.slice(5) + "/" + k.slice(2, 4),
            outstanding: outstanding[k],
            projected: smoothed,
        }));
    });

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

    const cashFlowConfig = $derived({
        type: "bar" as const,
        data: {
            labels: cashFlow.map((c) => c.label),
            datasets: [
                {
                    label: "Outstanding (due)",
                    data: cashFlow.map((c) => c.outstanding),
                    backgroundColor: "#7c5cff",
                    borderRadius: 6,
                },
                {
                    label: "Projected (3-mo avg paid)",
                    data: cashFlow.map((c) => c.projected),
                    backgroundColor: "rgba(16,185,129,.5)",
                    borderRadius: 6,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: "currentColor" } } },
            scales: {
                x: { stacked: false, ticks: { color: "currentColor" } },
                y: { ticks: { color: "currentColor" } },
            },
        },
    });

    const roiConfig = $derived({
        type: "bar" as const,
        data: {
            labels: topRoi.map((p) => p.name),
            datasets: [
                {
                    label: "ROI",
                    data: topRoi.map((p) => p.roi),
                    backgroundColor: topRoi.map((p) =>
                        p.roi >= 0 ? "#10b981" : "#ef4444",
                    ),
                    borderRadius: 6,
                },
            ],
        },
        options: {
            indexAxis: "y" as const,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: "currentColor" } },
                y: { ticks: { color: "currentColor" } },
            },
        },
    });

    async function exportCsv() {
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
        try {
            const result = await saveTextFile(
                "vs-crm-export.csv",
                "text/csv",
                csv,
            );
            if (result.saved) {
                toast.success("CSV saved");
            }
        } catch (e) {
            toast.error((e as Error).message);
        }
    }
</script>

<div class="p-6">
    <PageHeader
        title={$_("page.reports.title")}
        description={$_("page.reports.description")}
    >
        {#snippet actions()}
            <Button variant="outline" onclick={exportCsv}>
                <Download class="h-4 w-4" />
                {$_("page.reports.exportCsv")}
            </Button>
        {/snippet}
    </PageHeader>

    <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <StatCard
            label="DSO (90d)"
            value={dso === null ? "—" : `${dso} days`}
            accent="brand"
        />
    </div>

    <div class="mb-4 grid gap-4 lg:grid-cols-2">
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

    <div class="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Cash-flow projection (next 6 months)">
            <ChartCanvas config={cashFlowConfig} height={260} />
            <p class="mt-2 text-[11px] text-vscode-description">
                Outstanding bars show invoices grouped by due date. Projected
                bars reuse the trailing 3-month paid average as a simple
                forecast.
            </p>
        </Card>
        <Card title="Project ROI">
            {#if topRoi.length === 0}
                <EmptyState
                    title="No project activity"
                    description="ROI shows once invoices or expenses are tagged to a project."
                />
            {:else}
                <ChartCanvas config={roiConfig} height={260} />
            {/if}
        </Card>
    </div>

    <Card title="Effective hourly rate by project">
        {#if perProject.filter((p) => p.hours > 0).length === 0}
            <EmptyState
                title="No time tracked yet"
                description="Hourly rate computes once tasks have time entries."
            />
        {:else}
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr
                            class="border-b border-vscode-border text-left text-[11px] uppercase tracking-wide text-vscode-description"
                        >
                            <th class="pb-2">Project</th>
                            <th class="pb-2 text-right">Paid revenue</th>
                            <th class="pb-2 text-right">Hours</th>
                            <th class="pb-2 text-right">$/hr</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each perProject.filter((p) => p.hours > 0) as p (p.id)}
                            <tr
                                class="border-b border-vscode-border last:border-0"
                            >
                                <td class="py-2">{p.name}</td>
                                <td class="py-2 text-right">
                                    {formatCurrency(
                                        p.revenue,
                                        profile.currency,
                                    )}
                                </td>
                                <td class="py-2 text-right">
                                    {p.hours.toFixed(1)}
                                </td>
                                <td class="py-2 text-right font-semibold">
                                    {p.rate === null
                                        ? "—"
                                        : formatCurrency(
                                              p.rate,
                                              profile.currency,
                                          )}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            <p class="mt-2 text-[11px] text-vscode-description">
                Multi-currency totals are normalised to {profile.currency} via user-entered
                rates in Settings. Currencies without a saved rate pass through at
                face value.
            </p>
        {/if}
    </Card>
</div>
