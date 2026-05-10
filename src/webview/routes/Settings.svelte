<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Upload, Trash2, Database } from "lucide-svelte";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Select from "../lib/components/ui/Select.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Dialog from "../lib/components/ui/Dialog.svelte";
    import { auth } from "../lib/stores/auth.svelte";
    import { profile } from "../lib/stores/profile.svelte";
    import { config } from "../lib/stores/config.svelte";
    import { request } from "../lib/ipc";
    import { TIMEZONES } from "../lib/utils";
    import { useUpdateProfileMutation } from "../lib/queries/profile";
    import { useReportsQuery } from "../lib/queries/reports";
    import { _ } from "../i18n";
    import {
        uploadProfileAsset,
        removeProfileAsset,
        type ProfileAssetKind,
    } from "../lib/storage";

    const CURRENCIES = [
        "USD",
        "EUR",
        "GBP",
        "AED",
        "SAR",
        "EGP",
        "INR",
        "JPY",
        "CAD",
        "AUD",
    ];

    const updateMutation = useUpdateProfileMutation();
    // Reports query already fetches every invoice + expense (used here to
    // surface the set of currencies in active use). Cheap because this query
    // is shared with /reports.
    const reportsQuery = useReportsQuery();

    // Mirror of profile.fx_rates kept editable in Settings. Saved alongside
    // the other profile fields when the user clicks "Save changes".
    let fxRates = $state<Record<string, number>>({});

    const usedCurrencies = $derived.by(() => {
        const set = new Set<string>();
        for (const i of $reportsQuery.data?.invoices ?? []) {
            if (i.currency) {
                set.add(i.currency);
            }
        }
        for (const e of $reportsQuery.data?.expenses ?? []) {
            if (e.currency) {
                set.add(e.currency);
            }
        }
        // Drop the user's base currency — its rate is implicit (= 1).
        set.delete(form.currency);
        return Array.from(set).sort();
    });

    let form = $state({
        display_name: "",
        company_name: "",
        currency: "USD",
        tax_rate: "0",
        brand_color: "#7c5cff",
        language: "en",
        timezone: "UTC",
    });
    let saving = $state(false);
    let avatarBusy = $state(false);
    let logoBusy = $state(false);
    let avatarInput: HTMLInputElement | undefined = $state();
    let logoInput: HTMLInputElement | undefined = $state();

    async function pickFile(kind: ProfileAssetKind, file: File) {
        const setBusy = (v: boolean) => {
            if (kind === "avatar") {
                avatarBusy = v;
            } else {
                logoBusy = v;
            }
        };
        setBusy(true);
        try {
            const url = await uploadProfileAsset(kind, file);
            await $updateMutation.mutateAsync(
                kind === "avatar" ? { avatar_url: url } : { logo_url: url },
            );
            toast.success(
                kind === "avatar" ? "Avatar updated" : "Logo updated",
            );
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    async function clearAsset(kind: ProfileAssetKind) {
        const setBusy = (v: boolean) => {
            if (kind === "avatar") {
                avatarBusy = v;
            } else {
                logoBusy = v;
            }
        };
        setBusy(true);
        try {
            await removeProfileAsset(kind);
            await $updateMutation.mutateAsync(
                kind === "avatar" ? { avatar_url: null } : { logo_url: null },
            );
            toast.success("Removed");
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(false);
        }
    }

    onMount(async () => {
        if (!profile.profile) {
            await profile.load();
        }
        const p = profile.profile;
        if (!p) {
            return;
        }
        form = {
            display_name: p.display_name ?? "",
            company_name: p.company_name ?? "",
            currency: p.currency,
            tax_rate: String(p.tax_rate),
            brand_color: p.brand_color,
            language: p.language,
            timezone: p.timezone ?? "UTC",
        };
        fxRates = { ...(p.fx_rates ?? {}) };
    });

    let connectionOpen = $state(false);
    let connectionForm = $state({ url: "", anonKey: "", serviceRoleKey: "" });
    let connectionBusy = $state(false);
    let connectionError = $state<string | null>(null);

    function openConnectionDialog() {
        connectionForm = {
            url: config.supabaseUrl ?? "",
            anonKey: config.anonKey ?? "",
            serviceRoleKey: "",
        };
        connectionError = null;
        connectionOpen = true;
    }

    async function saveConnection() {
        const url = connectionForm.url.trim().replace(/\/$/, "");
        const anonKey = connectionForm.anonKey.trim();
        const serviceRoleKey = connectionForm.serviceRoleKey.trim();
        if (!url || !anonKey || !serviceRoleKey) {
            connectionError = "All three fields are required.";
            return;
        }
        connectionBusy = true;
        connectionError = null;
        try {
            const verify = (await request("boot/verify", {
                url,
                anonKey,
                serviceRoleKey,
            })) as { ok: true } | { ok: false; error: string };
            if (!verify.ok) {
                connectionError = verify.error;
                return;
            }
            await request("boot/save-creds", { url, anonKey, serviceRoleKey });
            // Switching connections during a live session means stale Supabase
            // client + realtime channels. Forcing a webview reload is the
            // simplest correct path; ErrorFallback already uses location.reload.
            toast.success("Connection saved. Reloading…");
            connectionOpen = false;
            setTimeout(() => location.reload(), 600);
        } catch (e) {
            connectionError = (e as Error).message;
        } finally {
            connectionBusy = false;
        }
    }

    async function save() {
        if (!auth.user) {
            return;
        }
        saving = true;
        try {
            // Strip any zero/blank rates before saving so the JSONB stays
            // tidy. The base currency is excluded from `usedCurrencies` so
            // it can never appear here.
            const cleanFx: Record<string, number> = {};
            for (const [k, v] of Object.entries(fxRates)) {
                const n = Number(v);
                if (Number.isFinite(n) && n > 0) {
                    cleanFx[k] = n;
                }
            }
            await $updateMutation.mutateAsync({
                display_name: form.display_name.trim().slice(0, 100) || null,
                company_name: form.company_name.trim().slice(0, 100) || null,
                currency: form.currency,
                tax_rate: Number(form.tax_rate),
                brand_color: form.brand_color,
                language: form.language,
                timezone: form.timezone,
                fx_rates: cleanFx,
            });
            toast.success("Settings saved");
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            saving = false;
        }
    }
</script>

<div class="p-6">
    <PageHeader
        title={$_("page.settings.title")}
        description={$_("page.settings.description")}
    />

    <div class="max-w-2xl space-y-4">
        <Card title="Profile">
            <div class="mb-4 flex items-center gap-3">
                {#if profile.profile?.avatar_url}
                    <img
                        src={profile.profile.avatar_url}
                        alt="Avatar"
                        class="h-12 w-12 rounded-full object-cover border border-vscode-border"
                    />
                {:else}
                    <div
                        class="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-fg text-sm font-semibold"
                    >
                        {(form.display_name || auth.user?.email || "?")
                            .slice(0, 2)
                            .toUpperCase()}
                    </div>
                {/if}
                <div class="flex gap-2">
                    <input
                        bind:this={avatarInput}
                        type="file"
                        accept="image/*"
                        class="hidden"
                        onchange={(e) => {
                            const f = (e.target as HTMLInputElement).files?.[0];
                            if (f) {
                                pickFile("avatar", f);
                            }
                            (e.target as HTMLInputElement).value = "";
                        }}
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        onclick={() => avatarInput?.click()}
                        loading={avatarBusy}
                    >
                        <Upload class="h-3.5 w-3.5" />
                        {profile.profile?.avatar_url ? "Replace" : "Upload"} avatar
                    </Button>
                    {#if profile.profile?.avatar_url}
                        <Button
                            size="sm"
                            variant="ghost"
                            class="text-vscode-error"
                            onclick={() => clearAsset("avatar")}
                            disabled={avatarBusy}
                        >
                            <Trash2 class="h-3.5 w-3.5" />
                        </Button>
                    {/if}
                </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
                <Field label="Display name">
                    <Input bind:value={form.display_name} />
                </Field>
                <Field label="Company">
                    <Input bind:value={form.company_name} />
                </Field>
                <Field label="Email">
                    <Input value={auth.user?.email ?? ""} disabled />
                </Field>
                <Field label="Language">
                    <Select bind:value={form.language}>
                        <option value="en">English</option>
                        <option value="ar">العربية</option>
                    </Select>
                </Field>
                <Field label={$_("settings.timezone")}>
                    <Select bind:value={form.timezone}>
                        {#each TIMEZONES as tz (tz)}
                            <option value={tz}>{tz}</option>
                        {/each}
                    </Select>
                </Field>
            </div>
        </Card>

        <Card title="Invoicing">
            <div class="grid gap-3 sm:grid-cols-2">
                <Field label="Currency">
                    <Select bind:value={form.currency}>
                        {#each CURRENCIES as c (c)}
                            <option value={c}>{c}</option>
                        {/each}
                    </Select>
                </Field>
                <Field label="Default tax rate (%)">
                    <Input
                        type="number"
                        step="0.01"
                        bind:value={form.tax_rate}
                    />
                </Field>
            </div>
        </Card>

        <Card title="Branding">
            <div class="mb-4 flex items-center gap-3">
                {#if profile.profile?.logo_url}
                    <img
                        src={profile.profile.logo_url}
                        alt="Logo"
                        class="h-12 w-auto max-w-40 rounded border border-vscode-border bg-white object-contain px-2 py-1"
                    />
                {:else}
                    <div
                        class="flex h-12 w-32 items-center justify-center rounded border border-dashed border-vscode-border text-[11px] text-vscode-description"
                    >
                        No logo
                    </div>
                {/if}
                <div class="flex gap-2">
                    <input
                        bind:this={logoInput}
                        type="file"
                        accept="image/*"
                        class="hidden"
                        onchange={(e) => {
                            const f = (e.target as HTMLInputElement).files?.[0];
                            if (f) {
                                pickFile("logo", f);
                            }
                            (e.target as HTMLInputElement).value = "";
                        }}
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        onclick={() => logoInput?.click()}
                        loading={logoBusy}
                    >
                        <Upload class="h-3.5 w-3.5" />
                        {profile.profile?.logo_url ? "Replace" : "Upload"} logo
                    </Button>
                    {#if profile.profile?.logo_url}
                        <Button
                            size="sm"
                            variant="ghost"
                            class="text-vscode-error"
                            onclick={() => clearAsset("logo")}
                            disabled={logoBusy}
                        >
                            <Trash2 class="h-3.5 w-3.5" />
                        </Button>
                    {/if}
                </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
                <Field label="Brand color (used on PDFs)">
                    <div class="flex items-center gap-2">
                        <input
                            type="color"
                            bind:value={form.brand_color}
                            class="h-8 w-12 rounded border border-vscode-input-border bg-vscode-input-bg"
                        />
                        <Input bind:value={form.brand_color} class="flex-1" />
                    </div>
                </Field>
                <div class="flex flex-col gap-1.5">
                    <span class="text-xs font-medium">Preview</span>
                    <div
                        class="h-10 rounded border border-vscode-border"
                        style="background: {form.brand_color}"
                    ></div>
                </div>
            </div>
        </Card>

        <Card title={$_("settings.fxRates")}>
            <p class="mb-3 text-xs text-vscode-description">
                {$_("settings.fxRatesHint")}
                <span class="font-semibold">{form.currency}</span>.
            </p>
            {#if usedCurrencies.length === 0}
                <p class="text-xs text-vscode-description">
                    No non-base currencies in use yet — rates appear here once
                    you log an invoice or expense in a different currency.
                </p>
            {:else}
                <div class="grid gap-2 sm:grid-cols-2">
                    {#each usedCurrencies as cur (cur)}
                        <div class="flex items-center gap-2">
                            <span class="w-12 font-mono text-xs">1 {cur}</span>
                            <span class="text-xs text-vscode-description"
                                >=</span
                            >
                            <Input
                                type="number"
                                step="0.0001"
                                placeholder="0.00"
                                value={fxRates[cur] ?? ""}
                                oninput={(e) => {
                                    const v = (e.target as HTMLInputElement)
                                        .value;
                                    if (v === "") {
                                        delete fxRates[cur];
                                        fxRates = { ...fxRates };
                                    } else {
                                        fxRates = {
                                            ...fxRates,
                                            [cur]: Number(v),
                                        };
                                    }
                                }}
                            />
                            <span class="text-xs text-vscode-description"
                                >{form.currency}</span
                            >
                        </div>
                    {/each}
                </div>
            {/if}
        </Card>

        <Button variant="brand" size="lg" onclick={save} loading={saving}>
            {$_("common.saveChanges")}
        </Button>

        <Card title={$_("settings.connection")}>
            <div class="flex items-start gap-3">
                <Database
                    class="mt-0.5 h-4 w-4 shrink-0 text-vscode-description"
                />
                <div class="min-w-0 flex-1">
                    <div class="text-xs text-vscode-description">
                        {$_("settings.connectedTo")}
                    </div>
                    <div class="truncate font-mono text-xs">
                        {config.supabaseUrl ?? "—"}
                    </div>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onclick={openConnectionDialog}
                >
                    {$_("settings.change")}
                </Button>
            </div>
        </Card>
    </div>
</div>

<Dialog
    bind:open={connectionOpen}
    title="Update Supabase connection"
    description="The webview will reload after saving so the new credentials take effect."
    size="lg"
>
    <div class="space-y-3">
        <Field label="Project URL">
            <Input
                placeholder="https://xxxxx.supabase.co"
                bind:value={connectionForm.url}
            />
        </Field>
        <Field label="Anon key">
            <Input
                type="password"
                placeholder="eyJ…"
                bind:value={connectionForm.anonKey}
            />
        </Field>
        <Field
            label="Service-role key"
            hint="Used once to apply migrations, then stored in SecretStorage."
        >
            <Input
                type="password"
                placeholder="eyJ…"
                bind:value={connectionForm.serviceRoleKey}
            />
        </Field>
        {#if connectionError}
            <div
                class="rounded border border-vscode-error/40 bg-vscode-error/10 px-3 py-2 text-xs text-vscode-error"
            >
                {connectionError}
            </div>
        {/if}
    </div>
    {#snippet footer()}
        <Button variant="ghost" onclick={() => (connectionOpen = false)}>
            Cancel
        </Button>
        <Button
            variant="brand"
            onclick={saveConnection}
            loading={connectionBusy}
        >
            Verify &amp; save
        </Button>
    {/snippet}
</Dialog>
