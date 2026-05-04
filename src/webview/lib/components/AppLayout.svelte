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
        LogOut,
    } from "lucide-svelte";
    import type { Snippet } from "svelte";
    import { auth } from "../stores/auth.svelte";
    import { profile } from "../stores/profile.svelte";
    import { cn } from "../utils";
    import NotificationsBell from "./NotificationsBell.svelte";
    import ConnectionBanner from "./ui/ConnectionBanner.svelte";

    interface Props {
        children?: Snippet;
    }
    let { children }: Props = $props();

    const navItems = [
        { path: "/", label: "Dashboard", icon: LayoutDashboard },
        { path: "/clients", label: "Clients", icon: Users },
        { path: "/leads", label: "Leads", icon: Briefcase },
        { path: "/projects", label: "Projects", icon: FolderKanban },
        { path: "/tasks", label: "Tasks", icon: ListChecks },
        { path: "/invoices", label: "Invoices", icon: Receipt },
        { path: "/expenses", label: "Expenses", icon: Wallet },
        { path: "/reports", label: "Reports", icon: BarChart3 },
        { path: "/settings", label: "Settings", icon: SettingsIcon },
    ];
</script>

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
                    {(profile.profile?.display_name ??
                        auth.user?.email ??
                        "?")
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
                    {item.label}
                </a>
            {/each}
        </nav>
        <div class="border-t border-vscode-sidebar-border p-2">
            <button
                class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-vscode-list-hover"
                on:click={() => auth.signOut()}
            >
                <LogOut class="h-3.5 w-3.5" />
                Sign out
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
