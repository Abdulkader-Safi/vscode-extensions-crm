<script lang="ts">
    import { toast } from "svelte-sonner";
    import { Mail, KeyRound, Sparkles, Github } from "lucide-svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Spinner from "../lib/components/ui/Spinner.svelte";
    import { getSupabase } from "../lib/supabase";
    import { config } from "../lib/stores/config.svelte";
    import { request } from "../lib/ipc";

    type Mode = "signin" | "signup" | "magic";
    let mode = $state<Mode>("signin");
    let email = $state("");
    let password = $state("");
    let displayName = $state("");
    let busy = $state(false);
    let error = $state<string | null>(null);
    let magicSent = $state(false);

    function reset() {
        error = null;
        magicSent = false;
    }

    async function submitEmail(e: SubmitEvent) {
        e.preventDefault();
        reset();
        busy = true;
        const supa = getSupabase();
        try {
            if (mode === "signup") {
                const { error: err } = await supa.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: config.redirectUri,
                        data: { display_name: displayName || undefined },
                    },
                });
                if (err) {
                    throw err;
                }
                toast.success("Account created — check your inbox to confirm.");
            } else if (mode === "signin") {
                const { error: err } = await supa.auth.signInWithPassword({
                    email,
                    password,
                });
                if (err) {
                    throw err;
                }
            } else if (mode === "magic") {
                const { error: err } = await supa.auth.signInWithOtp({
                    email,
                    options: { emailRedirectTo: config.redirectUri },
                });
                if (err) {
                    throw err;
                }
                magicSent = true;
                toast.success("Magic link sent — check your inbox.");
            }
        } catch (e2) {
            error = (e2 as Error).message;
        } finally {
            busy = false;
        }
    }

    async function oauth(provider: "google" | "github") {
        reset();
        busy = true;
        try {
            const { data, error: err } =
                await getSupabase().auth.signInWithOAuth({
                    provider,
                    options: {
                        redirectTo: config.redirectUri,
                        skipBrowserRedirect: true,
                    },
                });
            if (err) {
                throw err;
            }
            if (!data?.url) {
                throw new Error("No OAuth URL returned");
            }
            await request("auth/oauth-start", { authorizeUrl: data.url });
            toast.info(
                `Continue in your browser to finish ${provider} sign-in.`,
            );
        } catch (e) {
            error = (e as Error).message;
        } finally {
            busy = false;
        }
    }
</script>

<div class="flex h-full items-center justify-center overflow-y-auto p-8">
    <div class="w-full max-w-md">
        <div class="mb-6 flex items-center gap-3">
            <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-brand-fg"
            >
                <Sparkles class="h-5 w-5" />
            </div>
            <div>
                <div class="text-base font-semibold">
                    {#if mode === "signup"}Create your account
                    {:else if mode === "magic"}Magic link sign-in
                    {:else}Welcome back{/if}
                </div>
                <div class="text-xs text-vscode-description">vs-crm</div>
            </div>
        </div>

        <Card>
            <form onsubmit={submitEmail} class="space-y-3">
                {#if mode === "signup"}
                    <Field label="Display name (optional)">
                        <Input
                            bind:value={displayName}
                            placeholder="Jane Doe"
                        />
                    </Field>
                {/if}

                <Field label="Email" required>
                    <Input
                        type="email"
                        bind:value={email}
                        placeholder="you@example.com"
                        autocomplete="email"
                        required
                    />
                </Field>

                {#if mode !== "magic"}
                    <Field label="Password" required>
                        <Input
                            type="password"
                            bind:value={password}
                            autocomplete={mode === "signup"
                                ? "new-password"
                                : "current-password"}
                            required
                        />
                    </Field>
                {/if}

                {#if error}
                    <div
                        class="rounded border border-vscode-error/30 bg-vscode-error/10 p-2 text-xs text-vscode-error"
                    >
                        {error}
                    </div>
                {/if}

                {#if magicSent}
                    <div
                        class="rounded border border-vscode-success/30 bg-vscode-success/10 p-2 text-xs"
                    >
                        Magic link sent. Click it in your inbox — VS Code will
                        pick up the callback.
                    </div>
                {/if}

                <Button
                    type="submit"
                    variant="brand"
                    class="w-full"
                    loading={busy}
                    disabled={busy}
                >
                    {#if mode === "signup"}
                        <KeyRound class="h-4 w-4" /> Sign up
                    {:else if mode === "magic"}
                        <Mail class="h-4 w-4" /> Send magic link
                    {:else}
                        <KeyRound class="h-4 w-4" /> Sign in
                    {/if}
                </Button>
            </form>

            <div
                class="my-4 flex items-center gap-2 text-[11px] text-vscode-description"
            >
                <div class="h-px flex-1 bg-vscode-border"></div>
                or continue with
                <div class="h-px flex-1 bg-vscode-border"></div>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <Button
                    variant="outline"
                    onclick={() => oauth("google")}
                    disabled={busy}
                >
                    <svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
                        />
                    </svg>
                    Google
                </Button>
                <Button
                    variant="outline"
                    onclick={() => oauth("github")}
                    disabled={busy}
                >
                    <Github class="h-4 w-4" /> GitHub
                </Button>
            </div>
        </Card>

        <div
            class="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-vscode-description"
        >
            {#if mode !== "signin"}
                <button
                    class="hover:text-vscode-fg"
                    onclick={() => {
                        mode = "signin";
                        reset();
                    }}
                >
                    Sign in with password
                </button>
            {/if}
            {#if mode !== "signup"}
                <button
                    class="hover:text-vscode-fg"
                    onclick={() => {
                        mode = "signup";
                        reset();
                    }}
                >
                    Create account
                </button>
            {/if}
            {#if mode !== "magic"}
                <button
                    class="hover:text-vscode-fg"
                    onclick={() => {
                        mode = "magic";
                        reset();
                    }}
                >
                    Email me a magic link
                </button>
            {/if}
        </div>

        <div class="mt-6 text-center text-[11px] text-vscode-description">
            {#if busy}<Spinner size={12} class="inline" />{/if}
            Connected to <code class="font-mono">{config.supabaseUrl}</code>
        </div>
    </div>
</div>
