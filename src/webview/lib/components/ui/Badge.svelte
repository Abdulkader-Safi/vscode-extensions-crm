<script lang="ts">
    import { cn } from "../../utils";
    import type { Snippet } from "svelte";

    type Tone =
        | "default"
        | "success"
        | "warning"
        | "error"
        | "info"
        | "brand"
        | "muted";

    interface Props {
        class?: string;
        tone?: Tone;
        children?: Snippet;
    }

    let { class: className = "", tone = "default", children }: Props = $props();

    const tones: Record<Tone, string> = {
        default: "bg-vscode-badge-bg text-vscode-badge-fg",
        muted: "bg-vscode-muted-bg text-vscode-description",
        success: "bg-emerald-500/20 text-emerald-400",
        warning: "bg-amber-500/20 text-amber-400",
        error: "bg-red-500/20 text-red-400",
        info: "bg-sky-500/20 text-sky-400",
        brand: "bg-brand-muted text-brand",
    };
</script>

<span
    class={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
    )}
>
    {#if children}{@render children()}{/if}
</span>
