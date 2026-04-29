<script lang="ts">
    import { cn } from "../../utils";
    import type { Snippet } from "svelte";
    import type { HTMLButtonAttributes } from "svelte/elements";

    type Variant =
        | "primary"
        | "secondary"
        | "ghost"
        | "outline"
        | "destructive"
        | "brand";
    type Size = "sm" | "md" | "lg" | "icon";

    interface Props extends HTMLButtonAttributes {
        variant?: Variant;
        size?: Size;
        children?: Snippet;
        loading?: boolean;
    }

    let {
        variant = "secondary",
        size = "md",
        class: className = "",
        type = "button",
        children,
        loading = false,
        disabled,
        ...rest
    }: Props = $props();

    const variants: Record<Variant, string> = {
        primary:
            "bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover",
        secondary:
            "bg-vscode-button-secondary-bg text-vscode-button-secondary-fg hover:bg-vscode-button-secondary-hover",
        ghost: "bg-transparent hover:bg-vscode-list-hover",
        outline:
            "bg-transparent border border-vscode-border hover:bg-vscode-list-hover",
        destructive:
            "bg-vscode-error/15 text-vscode-error hover:bg-vscode-error/25 border border-vscode-error/30",
        brand: "bg-brand text-brand-fg hover:opacity-90",
    };
    const sizes: Record<Size, string> = {
        sm: "h-7 px-2 text-xs",
        md: "h-8 px-3 text-sm",
        lg: "h-10 px-4 text-sm",
        icon: "h-8 w-8 p-0",
    };
</script>

<button
    {type}
    disabled={disabled || loading}
    class={cn(
        "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-vscode-focus disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
        variants[variant],
        sizes[size],
        className,
    )}
    {...rest}
>
    {#if loading}
        <svg
            class="h-3.5 w-3.5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
        >
            <path d="M21 12a9 9 0 1 1-6.2-8.55" stroke-linecap="round" />
        </svg>
    {/if}
    {#if children}{@render children()}{/if}
</button>
