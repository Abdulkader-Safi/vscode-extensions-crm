<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Select from "../lib/components/ui/Select.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import { auth } from "../lib/stores/auth.svelte";
    import { profile } from "../lib/stores/profile.svelte";

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

    let form = $state({
        display_name: "",
        company_name: "",
        currency: "USD",
        tax_rate: "0",
        brand_color: "#7c5cff",
        language: "en",
    });
    let saving = $state(false);

    onMount(async () => {
        if (!profile.profile) await profile.load();
        const p = profile.profile;
        if (!p) return;
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
        if (!auth.user) return;
        saving = true;
        try {
            await profile.update({
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
