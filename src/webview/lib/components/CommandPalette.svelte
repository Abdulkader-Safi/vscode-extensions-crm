<script lang="ts">
    import { Search } from "lucide-svelte";
    import { commands, type Command } from "../commands.svelte";

    let inputEl: HTMLInputElement | null = $state(null);
    let activeIndex = $state(0);

    const visible = $derived(commands.filtered);

    // Refocus + reset cursor whenever the palette opens.
    $effect(() => {
        if (commands.open) {
            activeIndex = 0;
            // Wait for DOM mount before focusing.
            queueMicrotask(() => inputEl?.focus());
        }
    });

    // Clamp activeIndex when the filtered list shrinks below the cursor.
    $effect(() => {
        if (activeIndex >= visible.length) {
            activeIndex = Math.max(0, visible.length - 1);
        }
    });

    async function run(cmd: Command) {
        commands.hide();
        try {
            await cmd.run();
        } catch (err) {
            console.error("[command-palette]", cmd.id, err);
        }
    }

    function onKey(e: KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (visible.length > 0) {
                activeIndex = (activeIndex + 1) % visible.length;
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (visible.length > 0) {
                activeIndex =
                    (activeIndex - 1 + visible.length) % visible.length;
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            const cmd = visible[activeIndex];
            if (cmd) {
                run(cmd);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            commands.hide();
        }
    }

    function onBackdropKey(e: KeyboardEvent) {
        if (e.key === "Escape") {
            commands.hide();
        }
    }
</script>

{#if commands.open}
    <div
        class="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[15vh]"
        onclick={() => commands.hide()}
        onkeydown={onBackdropKey}
        role="button"
        tabindex="-1"
        aria-label="Close command palette"
    >
        <div
            class="w-full max-w-xl overflow-hidden rounded-lg border border-vscode-card-border bg-vscode-card-bg text-vscode-card-fg shadow-xl"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            tabindex="-1"
        >
            <div
                class="flex items-center gap-2 border-b border-vscode-card-border px-3 py-2"
            >
                <Search class="h-4 w-4 shrink-0 text-vscode-description" />
                <input
                    bind:this={inputEl}
                    bind:value={commands.query}
                    onkeydown={onKey}
                    type="text"
                    placeholder="Type a command…"
                    class="flex-1 bg-transparent text-sm outline-none placeholder:text-vscode-description"
                />
                <span
                    class="rounded border border-vscode-border px-1.5 py-0.5 text-[10px] text-vscode-description"
                >
                    ESC
                </span>
            </div>
            <ul class="max-h-[50vh] overflow-y-auto py-1">
                {#if visible.length === 0}
                    <li
                        class="px-3 py-6 text-center text-xs text-vscode-description"
                    >
                        No matching commands.
                    </li>
                {/if}
                {#each visible as cmd, idx (cmd.id)}
                    {@const active = idx === activeIndex}
                    <li>
                        <button
                            type="button"
                            class="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm {active
                                ? 'bg-vscode-list-active-bg text-vscode-list-active-fg'
                                : 'hover:bg-vscode-list-hover'}"
                            onmouseenter={() => (activeIndex = idx)}
                            onclick={() => run(cmd)}
                        >
                            <span class="flex min-w-0 items-baseline gap-2">
                                {#if cmd.group}
                                    <span
                                        class="shrink-0 text-[10px] uppercase tracking-wide text-vscode-description"
                                    >
                                        {cmd.group}
                                    </span>
                                {/if}
                                <span class="truncate">{cmd.title}</span>
                            </span>
                            {#if cmd.hint}
                                <span
                                    class="shrink-0 text-[11px] text-vscode-description"
                                >
                                    {cmd.hint}
                                </span>
                            {/if}
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    </div>
{/if}
