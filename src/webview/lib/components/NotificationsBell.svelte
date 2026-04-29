<script lang="ts">
    import { Bell, Check, CheckCheck } from "lucide-svelte";
    import { formatDistanceToNow } from "date-fns";
    import { toast } from "svelte-sonner";
    import {
        useNotificationsQuery,
        useMarkNotificationReadMutation,
        useMarkAllNotificationsReadMutation,
    } from "../queries/notifications";
    import Button from "./ui/Button.svelte";

    const notificationsQuery = useNotificationsQuery();
    const markRead = useMarkNotificationReadMutation();
    const markAll = useMarkAllNotificationsReadMutation();

    const items = $derived($notificationsQuery.data ?? []);
    const unreadCount = $derived(items.filter((n) => !n.read).length);

    let open = $state(false);
    let bellEl: HTMLDivElement | undefined = $state();

    function toggle() {
        open = !open;
    }

    function onDocClick(e: MouseEvent) {
        if (!open || !bellEl) {
            return;
        }
        if (!bellEl.contains(e.target as Node)) {
            open = false;
        }
    }

    function onKey(e: KeyboardEvent) {
        if (e.key === "Escape" && open) {
            open = false;
        }
    }

    async function onMarkRead(id: string) {
        try {
            await $markRead.mutateAsync(id);
        } catch (e) {
            toast.error((e as Error).message);
        }
    }

    async function onMarkAll() {
        try {
            await $markAll.mutateAsync();
        } catch (e) {
            toast.error((e as Error).message);
        }
    }
</script>

<svelte:window onclick={onDocClick} onkeydown={onKey} />

<div class="relative" bind:this={bellEl}>
    <button
        type="button"
        aria-label="Notifications"
        class="relative inline-flex h-7 w-7 items-center justify-center rounded hover:bg-vscode-list-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-vscode-focus"
        onclick={toggle}
    >
        <Bell class="h-4 w-4" />
        {#if unreadCount > 0}
            <span
                class="absolute -right-0.5 -top-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-brand-fg"
            >
                {unreadCount > 9 ? "9+" : unreadCount}
            </span>
        {/if}
    </button>

    {#if open}
        <div
            role="menu"
            class="absolute right-0 top-9 z-50 w-80 overflow-hidden rounded-lg border border-vscode-card-border bg-vscode-card-bg shadow-lg"
        >
            <div
                class="flex items-center justify-between border-b border-vscode-card-border px-3 py-2"
            >
                <span class="text-xs font-semibold">Notifications</span>
                {#if unreadCount > 0}
                    <Button size="sm" variant="ghost" onclick={onMarkAll}>
                        <CheckCheck class="h-3.5 w-3.5" /> Mark all read
                    </Button>
                {/if}
            </div>
            <div class="max-h-80 overflow-y-auto">
                {#if $notificationsQuery.isLoading}
                    <p
                        class="px-3 py-4 text-center text-xs text-vscode-description"
                    >
                        Loading…
                    </p>
                {:else if items.length === 0}
                    <p
                        class="px-3 py-6 text-center text-xs text-vscode-description"
                    >
                        You're all caught up.
                    </p>
                {:else}
                    <ul class="divide-y divide-vscode-border">
                        {#each items as n (n.id)}
                            <li
                                class={`flex items-start gap-2 px-3 py-2 text-sm ${
                                    n.read ? "opacity-60" : ""
                                }`}
                            >
                                {#if !n.read}
                                    <span
                                        class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                                    ></span>
                                {:else}
                                    <span class="w-1.5 shrink-0"></span>
                                {/if}
                                <div class="min-w-0 flex-1">
                                    <p class="truncate font-medium">
                                        {n.title}
                                    </p>
                                    {#if n.message}
                                        <p
                                            class="line-clamp-2 text-xs text-vscode-description"
                                        >
                                            {n.message}
                                        </p>
                                    {/if}
                                    <p
                                        class="mt-0.5 text-[10px] text-vscode-description"
                                    >
                                        {formatDistanceToNow(
                                            new Date(n.created_at),
                                            { addSuffix: true },
                                        )}
                                    </p>
                                </div>
                                {#if !n.read}
                                    <button
                                        type="button"
                                        class="rounded p-1 hover:bg-vscode-list-hover"
                                        aria-label="Mark read"
                                        onclick={() => onMarkRead(n.id)}
                                    >
                                        <Check class="h-3 w-3" />
                                    </button>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        </div>
    {/if}
</div>
