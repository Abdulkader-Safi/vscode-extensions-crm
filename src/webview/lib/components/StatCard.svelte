<script lang="ts">
    import { cn } from "../utils";

    interface Props {
        label: string;
        value: string;
        // Lucide icons are class-based Svelte components — keep the prop loose.
        icon?: any;
        accent?: "brand" | "info" | "warning" | "success" | "muted";
    }
    let { label, value, icon: Icon, accent = "muted" }: Props = $props();

    const accents: Record<NonNullable<Props["accent"]>, string> = {
        brand: "text-brand",
        info: "text-sky-400",
        warning: "text-amber-400",
        success: "text-emerald-400",
        muted: "text-vscode-description",
    };
</script>

<div
    class="rounded-lg border border-vscode-card-border bg-vscode-card-bg p-4 text-vscode-card-fg"
>
    <div class="mb-2 flex items-center justify-between">
        <span
            class="text-[11px] font-medium uppercase tracking-wide text-vscode-description"
        >
            {label}
        </span>
        {#if Icon}<Icon class={cn("h-4 w-4", accents[accent])} />{/if}
    </div>
    <div class="text-xl font-semibold tracking-tight">{value}</div>
</div>
