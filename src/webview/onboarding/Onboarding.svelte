<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { toast } from "svelte-sonner";
    import {
        ChevronRight,
        Copy,
        ExternalLink,
        CheckCircle2,
        AlertCircle,
        Database,
        KeyRound,
        Sparkles,
    } from "lucide-svelte";

    import { request, on } from "../lib/ipc";
    import { config } from "../lib/stores/config.svelte";
    import { initSupabase } from "../lib/supabase";
    import type {
        BootConfig,
        MigrationProgress,
        RunMigrationsResult,
    } from "../../shared/messages";
    import { BOOTSTRAP_FUNCTION_SNIPPET } from "../../shared/bootstrapSnippet";

    import Button from "../lib/components/ui/Button.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Spinner from "../lib/components/ui/Spinner.svelte";

    interface Props {
        onDone: () => void | Promise<void>;
    }
    let { onDone }: Props = $props();

    type Step = "welcome" | "paste" | "bootstrap" | "migrating" | "done";
    let step = $state<Step>("welcome");

    let url = $state("");
    let anonKey = $state("");
    let serviceRoleKey = $state("");
    let verifying = $state(false);
    let verifyError = $state<string | null>(null);

    let migrations = $state<MigrationProgress[]>([]);
    let migrationsError = $state<string | null>(null);
    let running = $state(false);
    let appliedSummary = $state<RunMigrationsResult | null>(null);

    let redirectUri = $state("");
    let redirectUriAcknowledged = $state(false);

    let unsubProgress: (() => void) | null = null;

    onMount(async () => {
        const cfg = (await request(
            "boot/request-config",
            undefined,
        )) as BootConfig;
        redirectUri = cfg.redirectUri;
        if (cfg.supabaseUrl) {
            url = cfg.supabaseUrl;
        }
        if (cfg.anonKey) {
            anonKey = cfg.anonKey;
        }

        unsubProgress = on("boot/migration-progress", (p) => {
            const idx = migrations.findIndex((m) => m.name === p.name);
            if (idx === -1) {
                migrations.push(p);
            } else {
                migrations[idx] = p;
            }
        });
    });

    onDestroy(() => unsubProgress?.());

    function isUrl(v: string) {
        return /^https?:\/\/.+\.supabase\.co\/?$/.test(v.trim());
    }

    function isJwt(v: string) {
        return /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
            v.trim(),
        );
    }

    function canVerify() {
        return isUrl(url) && isJwt(anonKey) && isJwt(serviceRoleKey);
    }

    async function verify() {
        verifyError = null;
        verifying = true;
        try {
            const cleanUrl = url.trim().replace(/\/$/, "");
            const res = (await request("boot/verify", {
                url: cleanUrl,
                anonKey: anonKey.trim(),
                serviceRoleKey: serviceRoleKey.trim(),
            })) as { ok: true } | { ok: false; error: string };
            if (!res.ok) {
                verifyError = res.error;
                return;
            }
            await request("boot/save-creds", {
                url: cleanUrl,
                anonKey: anonKey.trim(),
                serviceRoleKey: serviceRoleKey.trim(),
            });
            url = cleanUrl;
            step = "bootstrap";
        } catch (e) {
            verifyError = (e as Error).message;
        } finally {
            verifying = false;
        }
    }

    async function copySnippet() {
        await request("copy", { text: BOOTSTRAP_FUNCTION_SNIPPET });
        toast.success("Snippet copied to clipboard");
    }

    async function copyRedirectUri() {
        await request("copy", { text: redirectUri });
        toast.success("Redirect URI copied");
    }

    async function startMigrations() {
        migrations = [];
        migrationsError = null;
        running = true;
        step = "migrating";
        try {
            appliedSummary = (await request(
                "boot/run-migrations",
                undefined,
            )) as RunMigrationsResult;
            step = "done";
        } catch (e) {
            migrationsError = (e as Error).message;
        } finally {
            running = false;
        }
    }

    async function finalize() {
        await request("boot/finalize", undefined);
        initSupabase(url, anonKey);
        await config.refresh();
        await onDone();
    }
</script>

<div class="flex h-full items-center justify-center overflow-y-auto p-8">
    <div class="w-full max-w-2xl">
        <div class="mb-6 flex items-center gap-3">
            <div
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-brand-fg"
            >
                <Sparkles class="h-5 w-5" />
            </div>
            <div>
                <div class="text-base font-semibold">Welcome to vs-crm</div>
                <div class="text-xs text-vscode-description">
                    Connect to your Supabase project — your data stays in your
                    account.
                </div>
            </div>
        </div>

        <!-- Step indicator -->
        <div
            class="mb-4 flex items-center gap-2 text-[11px] text-vscode-description"
        >
            <span class={step === "welcome" ? "text-vscode-fg font-medium" : ""}
                >1. Welcome</span
            >
            <ChevronRight class="h-3 w-3" />
            <span class={step === "paste" ? "text-vscode-fg font-medium" : ""}
                >2. Connect</span
            >
            <ChevronRight class="h-3 w-3" />
            <span
                class={step === "bootstrap" ? "text-vscode-fg font-medium" : ""}
                >3. Bootstrap</span
            >
            <ChevronRight class="h-3 w-3" />
            <span
                class={step === "migrating" || step === "done"
                    ? "text-vscode-fg font-medium"
                    : ""}>4. Migrate</span
            >
            <ChevronRight class="h-3 w-3" />
            <span class={step === "done" ? "text-vscode-fg font-medium" : ""}
                >5. Done</span
            >
        </div>

        {#if step === "welcome"}
            <Card>
                <div class="space-y-4 text-sm">
                    <p>
                        vs-crm runs on top of <strong
                            >your own Supabase project</strong
                        >. We'll create 11 tables (clients, projects, invoices,
                        etc.) with row-level security so each user only sees
                        their own data.
                    </p>
                    <ol
                        class="list-decimal space-y-1 pl-5 text-vscode-description"
                    >
                        <li>
                            Open your Supabase project (or create one at
                            supabase.com).
                        </li>
                        <li>
                            Grab your <code>Project URL</code>,
                            <code>anon</code>
                            key, and <code>service_role</code> key.
                        </li>
                        <li>
                            Add this redirect URI to your project's
                            <em
                                >Authentication → URL Configuration → Redirect
                                URLs</em
                            >:
                        </li>
                    </ol>
                    <div
                        class="flex items-center gap-2 rounded border border-vscode-border bg-vscode-code-bg p-2 font-mono text-xs"
                    >
                        <code class="flex-1 truncate">{redirectUri}</code>
                        <button
                            class="rounded p-1 hover:bg-vscode-list-hover"
                            onclick={copyRedirectUri}
                            aria-label="Copy redirect URI"
                        >
                            <Copy class="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <label
                        class="flex cursor-pointer items-start gap-2 text-xs text-vscode-description"
                    >
                        <input
                            type="checkbox"
                            class="mt-0.5"
                            bind:checked={redirectUriAcknowledged}
                        />
                        <span>
                            I've added this redirect URI to my Supabase
                            project's <em
                                >Authentication → URL Configuration → Redirect
                                URLs</em
                            >.
                        </span>
                    </label>
                    <div class="flex justify-end pt-2">
                        <Button
                            variant="brand"
                            disabled={!redirectUriAcknowledged}
                            onclick={() => (step = "paste")}
                        >
                            Get started
                            <ChevronRight class="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </Card>
        {:else if step === "paste"}
            <Card title="Paste your Supabase credentials">
                <div class="space-y-3">
                    <Field
                        label="Project URL"
                        hint="Looks like https://xxxxx.supabase.co"
                        required
                    >
                        <Input
                            bind:value={url}
                            placeholder="https://xxxxx.supabase.co"
                            autocomplete="off"
                            spellcheck={false}
                        />
                    </Field>
                    <Field
                        label="anon (public) key"
                        hint="Settings → API → Project API keys → anon"
                        required
                    >
                        <Input
                            bind:value={anonKey}
                            placeholder="eyJhbGciOi..."
                            autocomplete="off"
                            spellcheck={false}
                        />
                    </Field>
                    <Field
                        label="service_role key (used once for schema setup, then discarded)"
                        hint="Settings → API → Project API keys → service_role. This key is powerful — it'll be deleted from storage after migrations finish."
                        required
                    >
                        <Input
                            type="password"
                            bind:value={serviceRoleKey}
                            placeholder="eyJhbGciOi..."
                            autocomplete="off"
                            spellcheck={false}
                        />
                    </Field>

                    {#if verifyError}
                        <div
                            class="flex items-start gap-2 rounded border border-vscode-error/30 bg-vscode-error/10 p-2 text-xs text-vscode-error"
                        >
                            <AlertCircle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{verifyError}</span>
                        </div>
                    {/if}

                    <div class="flex justify-between pt-2">
                        <Button
                            variant="ghost"
                            onclick={() => (step = "welcome")}>Back</Button
                        >
                        <Button
                            variant="brand"
                            disabled={!canVerify() || verifying}
                            loading={verifying}
                            onclick={verify}
                        >
                            Verify connection
                        </Button>
                    </div>
                </div>
            </Card>
        {:else if step === "bootstrap"}
            <Card title="Run this once in Supabase SQL Editor">
                <div class="space-y-3 text-sm">
                    <p class="text-vscode-description">
                        Postgres won't let us run schema changes via the public
                        API alone. Paste the snippet below into your Supabase
                        SQL Editor and run it once. vs-crm will use it to apply
                        migrations, then drop it again. Safe to delete manually
                        if you prefer.
                    </p>

                    <div class="relative">
                        <pre
                            class="max-h-72 overflow-auto rounded border border-vscode-border bg-vscode-code-bg p-3 font-mono text-[11px] leading-relaxed"><code
                                >{BOOTSTRAP_FUNCTION_SNIPPET}</code
                            ></pre>
                        <button
                            class="absolute right-2 top-2 rounded bg-vscode-button-secondary-bg p-1.5 text-vscode-button-secondary-fg hover:bg-vscode-button-secondary-hover"
                            onclick={copySnippet}
                            aria-label="Copy snippet"
                        >
                            <Copy class="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <div
                        class="flex items-center gap-2 text-xs text-vscode-description"
                    >
                        <ExternalLink class="h-3.5 w-3.5" />
                        <a
                            class="text-vscode-link hover:underline"
                            href={`${url}/project/_/sql/new`}
                            target="_blank"
                            rel="noopener">Open SQL Editor</a
                        >
                    </div>

                    <div class="flex justify-between pt-2">
                        <Button variant="ghost" onclick={() => (step = "paste")}
                            >Back</Button
                        >
                        <Button variant="brand" onclick={startMigrations}>
                            <Database class="h-4 w-4" />
                            I ran it — apply migrations
                        </Button>
                    </div>
                </div>
            </Card>
        {:else if step === "migrating"}
            <Card title="Applying migrations…">
                <div class="space-y-2 text-sm">
                    {#each migrations as m (m.name)}
                        <div class="flex items-center gap-2">
                            {#if m.status === "running"}
                                <Spinner
                                    size={14}
                                    class="text-vscode-description"
                                />
                            {:else if m.status === "done"}
                                <CheckCircle2
                                    class="h-4 w-4 text-vscode-success"
                                />
                            {:else if m.status === "error"}
                                <AlertCircle
                                    class="h-4 w-4 text-vscode-error"
                                />
                            {:else}
                                <div
                                    class="h-3.5 w-3.5 rounded-full border border-vscode-border"
                                ></div>
                            {/if}
                            <span class="font-mono text-xs">{m.name}</span>
                            <span class="text-[11px] text-vscode-description">
                                ({m.current}/{m.total})
                            </span>
                            {#if m.error}
                                <span class="text-xs text-vscode-error"
                                    >— {m.error}</span
                                >
                            {/if}
                        </div>
                    {/each}
                    {#if migrationsError}
                        <div
                            class="rounded border border-vscode-error/30 bg-vscode-error/10 p-2 text-xs text-vscode-error"
                        >
                            <div class="flex items-center gap-2">
                                <AlertCircle class="h-3.5 w-3.5" />
                                <span>Migration failed</span>
                            </div>
                            <pre
                                class="mt-1 whitespace-pre-wrap font-mono">{migrationsError}</pre>
                            <div class="mt-2 flex gap-2">
                                <Button
                                    size="sm"
                                    onclick={() => (step = "bootstrap")}
                                >
                                    Back
                                </Button>
                                <Button
                                    size="sm"
                                    variant="brand"
                                    onclick={startMigrations}
                                    disabled={running}>Retry</Button
                                >
                            </div>
                        </div>
                    {/if}
                </div>
            </Card>
        {:else if step === "done"}
            <Card title="All set">
                <div class="space-y-3 text-sm">
                    <div class="flex items-center gap-2 text-vscode-success">
                        <CheckCircle2 class="h-4 w-4" />
                        <span>
                            {appliedSummary?.applied.length ?? 0} migration(s) applied,
                            {appliedSummary?.skipped.length ?? 0} already up-to-date
                        </span>
                    </div>
                    <p class="text-vscode-description">
                        The service-role key has been removed from storage.
                        Next: sign in to your new account.
                    </p>
                    <div class="flex justify-end pt-2">
                        <Button variant="brand" onclick={finalize}>
                            <KeyRound class="h-4 w-4" />
                            Continue to sign-in
                        </Button>
                    </div>
                </div>
            </Card>
        {/if}
    </div>
</div>
