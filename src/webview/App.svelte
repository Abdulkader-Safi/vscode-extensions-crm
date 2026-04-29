<script lang="ts">
    import { onMount } from "svelte";
    import Router from "svelte-spa-router";
    import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";

    import { config } from "./lib/stores/config.svelte";
    import { auth } from "./lib/stores/auth.svelte";
    import { profile } from "./lib/stores/profile.svelte";

    import AppLayout from "./lib/components/AppLayout.svelte";
    import Toaster from "./lib/components/ui/Toaster.svelte";
    import Spinner from "./lib/components/ui/Spinner.svelte";

    import Onboarding from "./onboarding/Onboarding.svelte";
    import AuthScreen from "./auth/AuthScreen.svelte";

    import Dashboard from "./routes/Dashboard.svelte";
    import Clients from "./routes/Clients.svelte";
    import Leads from "./routes/Leads.svelte";
    import Projects from "./routes/Projects.svelte";
    import Tasks from "./routes/Tasks.svelte";
    import Invoices from "./routes/Invoices.svelte";
    import Expenses from "./routes/Expenses.svelte";
    import Reports from "./routes/Reports.svelte";
    import Settings from "./routes/Settings.svelte";
    import NotFound from "./routes/NotFound.svelte";

    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
    });

    const routes = {
        "/": Dashboard,
        "/clients": Clients,
        "/leads": Leads,
        "/projects": Projects,
        "/tasks": Tasks,
        "/invoices": Invoices,
        "/expenses": Expenses,
        "/reports": Reports,
        "/settings": Settings,
        "*": NotFound,
    };

    onMount(async () => {
        await config.load();
        if (config.isReadyForApp) {
            await auth.init();
            if (auth.user) await profile.load();
        }
    });

    // Re-init auth + profile whenever bootstrap completes / user signs in
    $effect(() => {
        if (config.isReadyForApp && auth.loading === false && auth.user) {
            profile.load();
        }
    });

    async function onOnboardingDone() {
        await config.refresh();
        await auth.init();
    }
</script>

<QueryClientProvider client={queryClient}>
    {#if !config.loaded}
        <div
            class="flex h-full items-center justify-center text-vscode-description"
        >
            <Spinner size={20} />
        </div>
    {:else if !config.bootstrapped}
        <Onboarding onDone={onOnboardingDone} />
    {:else if auth.loading}
        <div
            class="flex h-full items-center justify-center text-vscode-description"
        >
            <Spinner size={20} />
        </div>
    {:else if !auth.user}
        <AuthScreen />
    {:else}
        <AppLayout>
            <Router {routes} />
        </AppLayout>
    {/if}
    <Toaster />
</QueryClientProvider>
