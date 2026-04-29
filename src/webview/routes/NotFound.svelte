<script lang="ts">
    import { link } from "svelte-spa-router";
</script>

<div
    class="flex h-full flex-col items-center justify-center text-vscode-description"
>
    <div class="text-sm font-semibold mb-2">Page not found</div>
    <a use:link href="/" class="text-xs text-vscode-link hover:underline">
        Back to dashboard
    </a>
</div>
