<script lang="ts">
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
    import { auth } from "../lib/stores/auth.svelte";
    import { profile } from "../lib/stores/profile.svelte";
    import { formatCurrency } from "../lib/utils";
    import { useDashboardQuery } from "../lib/queries/dashboard";

    const dashboardQuery = useDashboardQuery();

    const firstName = $derived(
        profile.profile?.display_name?.split(" ")[0] ??
            auth.user?.email?.split("@")[0] ??
            "",
    );

    const stats = $derived(
        $dashboardQuery.data?.stats ?? {
            clients: 0,
            projects: 0,
            unpaid: 0,
            revenue: 0,
        },
    );
    const activity = $derived($dashboardQuery.data?.activity ?? []);
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
                {#if $dashboardQuery.isLoading}
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
