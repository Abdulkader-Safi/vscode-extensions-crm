<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Upload, Trash2 } from "lucide-svelte";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Select from "../lib/components/ui/Select.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import { auth } from "../lib/stores/auth.svelte";
    import { profile } from "../lib/stores/profile.svelte";
    import { useUpdateProfileMutation } from "../lib/queries/profile";
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

    let form = $state({
        display_name: "",
        company_name: "",
        currency: "USD",
        tax_rate: "0",
        brand_color: "#7c5cff",
        language: "en",
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
            toast.success(kind === "avatar" ? "Avatar updated" : "Logo updated");
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
        };
    });

    async function save() {
        if (!auth.user) {
            return;
        }
        saving = true;
        try {
            await $updateMutation.mutateAsync({
                display_name: form.display_name.trim().slice(0, 100) || null,
                company_name: form.company_name.trim().slice(0, 100) || null,
                currency: form.currency,
                tax_rate: Number(form.tax_rate),
                brand_color: form.brand_color,
                language: form.language,
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
        title="Settings"
        description="Customize your workspace and branding."
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
                        {(form.display_name ||
                            auth.user?.email ||
                            "?")
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
                            const f = (e.target as HTMLInputElement)
                                .files?.[0];
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
                        class="h-12 w-auto max-w-[160px] rounded border border-vscode-border bg-white object-contain px-2 py-1"
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
                            const f = (e.target as HTMLInputElement)
                                .files?.[0];
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

        <Button variant="brand" size="lg" onclick={save} loading={saving}>
            Save changes
        </Button>
    </div>
</div>
