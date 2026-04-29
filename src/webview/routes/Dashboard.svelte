<script lang="ts">
    import { onMount } from "svelte";
    import { link } from "svelte-spa-router";
    import {
        Users,
        FolderKanban,
        Receipt,
        TrendingUp,
        Plus,
        FileText,
        Briefcase,
    } from "lucide-svelte";
    import { formatDistanceToNow } from "date-fns";

    import PageHeader from "../lib/components/PageHeader.svelte";
    import StatCard from "../lib/components/StatCard.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import { getSupabase } from "../lib/supabase";
    import { auth } from "../lib/stores/auth.svelte";
    import { profile } from "../lib/stores/profile.svelte";
    import { formatCurrency } from "../lib/utils";

    type Activity = {
        kind: "client" | "invoice" | "task";
        id: string;
        label: string;
        created_at: string;
    };

    let stats = $state({ clients: 0, projects: 0, unpaid: 0, revenue: 0 });
    let activity = $state<Activity[]>([]);
    let loaded = $state(false);

    const firstName = $derived(
        profile.profile?.display_name?.split(" ")[0] ??
            auth.user?.email?.split("@")[0] ??
            "",
    );

    onMount(async () => {
        if (!auth.user) return;
        const supa = getSupabase();
        const userId = auth.user.id;

        const [clientsRes, projectsRes, invoicesRes] = await Promise.all([
            supa
                .from("clients")
                .select("id", { count: "exact", head: true })
                .eq("user_id", userId),
            supa
                .from("projects")
                .select("id", { count: "exact", head: true })
                .eq("user_id", userId)
                .in("status", ["planning", "in_progress"]),
            supa
                .from("invoices")
                .select("status, total, paid_at, created_at")
                .eq("user_id", userId),
        ]);

        const inv = (invoicesRes.data ?? []) as Array<{
            status: string;
            total: number;
            paid_at: string | null;
            created_at: string;
        }>;
        const unpaid = inv
            .filter((i) => i.status === "sent" || i.status === "overdue")
            .reduce((s, i) => s + Number(i.total), 0);
        const startMonth = new Date();
        startMonth.setDate(1);
        startMonth.setHours(0, 0, 0, 0);
        const revenue = inv
            .filter(
                (i) =>
                    i.status === "paid" &&
                    i.paid_at &&
                    new Date(i.paid_at) >= startMonth,
            )
            .reduce((s, i) => s + Number(i.total), 0);

        stats = {
            clients: clientsRes.count ?? 0,
            projects: projectsRes.count ?? 0,
            unpaid,
            revenue,
        };

        const [recentClients, recentInvoices, recentTasks] = await Promise.all([
            supa
                .from("clients")
                .select("id,name,created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(5),
            supa
                .from("invoices")
                .select("id,invoice_number,total,status,created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(5),
            supa
                .from("tasks")
                .select("id,title,status,created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(5),
        ]);

        const all: Activity[] = [
            ...(recentClients.data ?? []).map((x) => ({
                kind: "client" as const,
                id: x.id,
                label: `Added client ${x.name}`,
                created_at: x.created_at,
            })),
            ...(recentInvoices.data ?? []).map((x) => ({
                kind: "invoice" as const,
                id: x.id,
                label: `Invoice ${x.invoice_number} — ${x.status}`,
                created_at: x.created_at,
            })),
            ...(recentTasks.data ?? []).map((x) => ({
                kind: "task" as const,
                id: x.id,
                label: `Task: ${x.title}`,
                created_at: x.created_at,
            })),
        ]
            .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
            .slice(0, 8);
        activity = all;
        loaded = true;
    });
</script>

<div class="p-6">
    <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ""}`}
        description="Here's a snapshot of your workspace today."
    >
        {#snippet actions()}
            <a use:link href="/clients">
                <Button variant="outline" size="sm">
                    <Plus class="h-4 w-4" /> Client
                </Button>
            </a>
            <a use:link href="/invoices">
                <Button variant="brand" size="sm">
                    <Plus class="h-4 w-4" /> Invoice
                </Button>
            </a>
        {/snippet}
    </PageHeader>

    <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
            label="Total clients"
            value={String(stats.clients)}
            icon={Users}
            accent="brand"
        />
        <StatCard
            label="Active projects"
            value={String(stats.projects)}
            icon={FolderKanban}
            accent="info"
        />
        <StatCard
            label="Unpaid"
            value={formatCurrency(stats.unpaid, profile.currency)}
            icon={Receipt}
            accent="warning"
        />
        <StatCard
            label="Revenue (month)"
            value={formatCurrency(stats.revenue, profile.currency)}
            icon={TrendingUp}
            accent="success"
        />
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
        <div class="lg:col-span-2">
            <Card title="Recent activity">
                {#if !loaded}
                    <div class="text-xs text-vscode-description">Loading…</div>
                {:else if activity.length === 0}
                    <div
                        class="py-8 text-center text-xs text-vscode-description"
                    >
                        No activity yet — start by adding a client.
                    </div>
                {:else}
                    <div class="space-y-3 text-sm">
                        {#each activity as a (a.kind + a.id)}
                            <div
                                class="flex items-center justify-between border-b border-vscode-border pb-2 last:border-0 last:pb-0"
                            >
                                <div class="flex items-center gap-2">
                                    <span
                                        class="h-1.5 w-1.5 rounded-full bg-brand"
                                    ></span>
                                    <span>{a.label}</span>
                                </div>
                                <span
                                    class="text-[11px] text-vscode-description"
                                >
                                    {formatDistanceToNow(
                                        new Date(a.created_at),
                                        {
                                            addSuffix: true,
                                        },
                                    )}
                                </span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </Card>
        </div>
        <Card title="Quick actions">
            <div class="space-y-2">
                <a use:link href="/clients">
                    <Button variant="outline" class="w-full justify-start">
                        <Users class="h-4 w-4" /> Add client
                    </Button>
                </a>
                <a use:link href="/leads">
                    <Button variant="outline" class="w-full justify-start">
                        <Briefcase class="h-4 w-4" /> New lead
                    </Button>
                </a>
                <a use:link href="/projects">
                    <Button variant="outline" class="w-full justify-start">
                        <FolderKanban class="h-4 w-4" /> New project
                    </Button>
                </a>
                <a use:link href="/invoices">
                    <Button variant="outline" class="w-full justify-start">
                        <FileText class="h-4 w-4" /> Create invoice
                    </Button>
                </a>
            </div>
        </Card>
    </div>
</div>
