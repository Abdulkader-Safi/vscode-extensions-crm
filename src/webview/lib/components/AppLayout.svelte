<script lang="ts">
    import { link, router } from "svelte-spa-router";
    import {
        LayoutDashboard,
        Users,
        Briefcase,
        FolderKanban,
        ListChecks,
        Receipt,
        Wallet,
        BarChart3,
        Settings as SettingsIcon,
        Trash2,
        LogOut,
    } from "lucide-svelte";
    import type { Snippet } from "svelte";
    import { auth } from "../stores/auth.svelte";
    import { profile } from "../stores/profile.svelte";
    import { cn } from "../utils";
    import NotificationsBell from "./NotificationsBell.svelte";
    import ConnectionBanner from "./ui/ConnectionBanner.svelte";
    import { useTrashCountsQuery } from "../queries/trash";
    import { commands } from "../commands.svelte";
    import { _ } from "../../i18n";

    interface Props {
        children?: Snippet;
    }
    let { children }: Props = $props();

    const navItems = [
        { path: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
        { path: "/clients", labelKey: "nav.clients", icon: Users },
        { path: "/leads", labelKey: "nav.leads", icon: Briefcase },
        { path: "/projects", labelKey: "nav.projects", icon: FolderKanban },
        { path: "/tasks", labelKey: "nav.tasks", icon: ListChecks },
        { path: "/invoices", labelKey: "nav.invoices", icon: Receipt },
        { path: "/expenses", labelKey: "nav.expenses", icon: Wallet },
        { path: "/reports", labelKey: "nav.reports", icon: BarChart3 },
        { path: "/settings", labelKey: "nav.settings", icon: SettingsIcon },
    ];

    const trashCounts = useTrashCountsQuery();
    const totalTrashed = $derived.by(() => {
        const c = $trashCounts.data;
        if (!c) {
            return 0;
        }
        return (
            c.clients + c.projects + c.tasks + c.invoices + c.expenses + c.leads
        );
    });

    // Global keyboard shortcuts. Cmd/Ctrl+K opens the palette unconditionally
    // (also from inside text inputs); Cmd+N runs the route's `primary-new`
    // command if registered. Bare keys are ignored when typing in form fields
    // so search inputs aren't hijacked.
    function isTypingTarget(t: EventTarget | null): boolean {
        if (!(t instanceof HTMLElement)) {
            return false;
        }
        return (
            t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.isContentEditable
        );
    }

    function onGlobalKey(e: KeyboardEvent) {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key.toLowerCase() === "k") {
            e.preventDefault();
            commands.show();
            return;
        }
        if (mod && e.key.toLowerCase() === "n" && !isTypingTarget(e.target)) {
            const cmd = commands.primaryNew();
            if (cmd) {
                e.preventDefault();
                cmd.run();
            }
        }
    }
</script>

<svelte:window onkeydown={onGlobalKey} />

<div class="flex h-full bg-vscode-bg text-vscode-fg">
    <aside
        class="flex w-56 shrink-0 flex-col border-r border-vscode-sidebar-border bg-vscode-sidebar-bg text-vscode-sidebar-fg"
    >
        <div
            class="flex items-center gap-2 px-4 py-3 border-b border-vscode-sidebar-border"
        >
            {#if profile.profile?.avatar_url}
                <img
                    src={profile.profile.avatar_url}
                    alt="Avatar"
                    class="h-7 w-7 rounded object-cover"
                />
            {:else}
                <div
                    class="h-7 w-7 rounded bg-brand text-brand-fg flex items-center justify-center text-xs font-bold"
                >
                    {(profile.profile?.display_name ?? auth.user?.email ?? "?")
                        .slice(0, 2)
                        .toUpperCase()}
                </div>
            {/if}
            <div>
                <div class="text-xs font-semibold">vs-crm</div>
                <div class="text-[10px] text-vscode-description truncate">
                    {profile.profile?.company_name ??
                        auth.user?.email ??
                        "Workspace"}
                </div>
            </div>
        </div>
        <nav class="flex flex-1 flex-col py-1 overflow-y-auto">
            {#each navItems as item (item.path)}
                {@const active = router.location === item.path}
                <a
                    use:link
                    href={item.path}
                    class={cn(
                        "flex items-center gap-2 px-4 py-1.5 text-sm hover:bg-vscode-list-hover",
                        active &&
                            "bg-vscode-list-active-bg text-vscode-list-active-fg",
                    )}
                >
                    <item.icon class="h-4 w-4" />
                    {$_(item.labelKey)}
                </a>
            {/each}
            <a
                use:link
                href="/trash"
                class={cn(
                    "mt-auto flex items-center gap-2 px-4 py-1.5 text-sm hover:bg-vscode-list-hover",
                    router.location === "/trash" &&
                        "bg-vscode-list-active-bg text-vscode-list-active-fg",
                )}
            >
                <Trash2 class="h-4 w-4" />
                <span>{$_("nav.trash")}</span>
                {#if totalTrashed > 0}
                    <span
                        class="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-vscode-button-secondary-bg px-1 text-[10px] font-semibold"
                    >
                        {totalTrashed}
                    </span>
                {/if}
            </a>
        </nav>
        <div class="border-t border-vscode-sidebar-border p-2">
            <button
                class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-vscode-list-hover"
                onclick={() => auth.signOut()}
            >
                <LogOut class="h-3.5 w-3.5" />
                {$_("nav.signOut")}
            </button>
        </div>
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
        <ConnectionBanner />
        <header
            class="flex h-10 shrink-0 items-center justify-end border-b border-vscode-border bg-vscode-bg px-4 gap-2"
        >
            <NotificationsBell />
        </header>
        <main class="flex-1 overflow-y-auto">
            {#if children}{@render children()}{/if}
        </main>
    </div>
</div>
