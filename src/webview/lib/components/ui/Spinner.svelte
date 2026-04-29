<script lang="ts">
    import { cn } from "../../utils";

    interface Props {
        class?: string;
        size?: number;
    }

    let { class: className = "", size = 16 }: Props = $props();
</script>

<svg
    class={cn("animate-spin", className)}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
>
    <path d="M21 12a9 9 0 1 1-6.2-8.55" stroke-linecap="round" />
</svg>
