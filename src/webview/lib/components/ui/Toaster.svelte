<script lang="ts">
    import { Toaster as SonnerToaster } from "svelte-sonner";
</script>

<SonnerToaster
    theme="system"
    position="bottom-right"
    richColors
    toastOptions={{
        classes: {
            toast: "!bg-[var(--vscode-editorWidget-background)] !text-[var(--vscode-editorWidget-foreground,inherit)] !border-[var(--vscode-panel-border)]",
        },
    }}
/>
