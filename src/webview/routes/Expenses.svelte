<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Plus, Trash2 } from "lucide-svelte";
    import PageHeader from "../lib/components/PageHeader.svelte";
    import Card from "../lib/components/ui/Card.svelte";
    import Button from "../lib/components/ui/Button.svelte";
    import Input from "../lib/components/ui/Input.svelte";
    import Select from "../lib/components/ui/Select.svelte";
    import Field from "../lib/components/ui/Field.svelte";
    import Dialog from "../lib/components/ui/Dialog.svelte";
    import EmptyState from "../lib/components/ui/EmptyState.svelte";
    import StatCard from "../lib/components/StatCard.svelte";
    import { getSupabase } from "../lib/supabase";
    import { auth } from "../lib/stores/auth.svelte";
    import { confirm } from "../lib/confirm.svelte";
    import { profile } from "../lib/stores/profile.svelte";
    import { formatCurrency, ymd } from "../lib/utils";

    type Expense = {
        id: string;
        category: string;
        amount: number;
        vendor: string | null;
        description: string | null;
        expense_date: string;
        currency: string;
        project_id: string | null;
    };
    type Project = { id: string; name: string };

    const CATEGORIES = [
        "software",
        "hardware",
        "marketing",
        "travel",
        "meals",
        "office",
        "subscriptions",
        "contractors",
        "other",
    ];

    let expenses = $state<Expense[]>([]);
    let projects = $state<Project[]>([]);
    let loaded = $state(false);
    let open = $state(false);
    let form = $state({
        category: "software",
        amount: "0",
        vendor: "",
        description: "",
        expense_date: ymd(),
        project_id: "none",
    });

    const total = $derived(expenses.reduce((s, e) => s + Number(e.amount), 0));
    const monthlyMap = $derived.by(() => {
        const m: Record<string, number> = {};
        for (const e of expenses) {
            const k = e.expense_date.slice(0, 7);
            m[k] = (m[k] ?? 0) + Number(e.amount);
        }
        return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]));
    });
    // Use the actual current month — `monthlyMap[0]` would mislabel the most
    // recent past month as "this month" when nothing has been logged yet.
    const thisMonth = $derived.by(() => {
        const ym = new Date().toISOString().slice(0, 7);
        return expenses
            .filter((e) => e.expense_date.slice(0, 7) === ym)
            .reduce((s, e) => s + Number(e.amount), 0);
    });

    async function load() {
        if (!auth.user) {
            return;
        }
        const supa = getSupabase();
        const [e, p] = await Promise.all([
            supa
                .from("expenses")
                .select("*")
                .eq("user_id", auth.user.id)
                .order("expense_date", { ascending: false }),
            supa.from("projects").select("id,name").eq("user_id", auth.user.id),
        ]);
        expenses = (e.data as Expense[]) ?? [];
        projects = (p.data as Project[]) ?? [];
        loaded = true;
    }

    async function create() {
        if (!auth.user) {
            return;
        }
        const { error } = await getSupabase()
            .from("expenses")
            .insert({
                user_id: auth.user.id,
                category: form.category,
                amount: Number(form.amount),
                currency: profile.currency,
                vendor: form.vendor.trim() || null,
                description: form.description.trim() || null,
                expense_date: form.expense_date,
                project_id: form.project_id === "none" ? null : form.project_id,
            });
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("Expense logged");
        open = false;
        form = { ...form, amount: "0", vendor: "", description: "" };
        load();
    }

    async function remove(id: string) {
        if (
            !(await confirm({
                title: "Delete expense?",
                confirmLabel: "Delete",
                destructive: true,
            }))
        ) {
            return;
        }
        await getSupabase().from("expenses").delete().eq("id", id);
        load();
    }

    onMount(load);
</script>

<div class="p-6">
    <PageHeader title="Expenses" description="Log every business cost.">
        {#snippet actions()}
            <Button variant="brand" onclick={() => (open = true)}>
                <Plus class="h-4 w-4" /> New expense
            </Button>
        {/snippet}
    </PageHeader>

    <div class="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
            label="Total"
            value={formatCurrency(total, profile.currency)}
        />
        <StatCard
            label="This month"
            value={formatCurrency(thisMonth, profile.currency)}
            accent="warning"
        />
        <StatCard label="Entries" value={String(expenses.length)} />
    </div>

    {#if !loaded}
        <div class="text-xs text-vscode-description">Loading…</div>
    {:else if expenses.length === 0}
        <Card>
            <EmptyState
                title="No expenses logged yet"
                description="Track every receipt, vendor, and subscription."
            />
        </Card>
    {:else}
        <Card>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr
                            class="border-b border-vscode-border text-left text-[11px] uppercase tracking-wide text-vscode-description"
                        >
                            <th class="pb-2 font-medium">Date</th>
                            <th class="pb-2 font-medium">Category</th>
                            <th class="pb-2 font-medium">Vendor</th>
                            <th class="pb-2 font-medium">Notes</th>
                            <th class="pb-2 text-right font-medium">Amount</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each expenses as e (e.id)}
                            <tr
                                class="group border-b border-vscode-border last:border-0"
                            >
                                <td class="py-2">{e.expense_date}</td>
                                <td class="py-2 capitalize">{e.category}</td>
                                <td class="py-2 text-vscode-description"
                                    >{e.vendor ?? "—"}</td
                                >
                                <td
                                    class="max-w-xs truncate py-2 text-vscode-description"
                                >
                                    {e.description ?? "—"}
                                </td>
                                <td class="py-2 text-right font-semibold">
                                    {formatCurrency(
                                        Number(e.amount),
                                        e.currency,
                                    )}
                                </td>
                                <td class="py-2 text-right">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        class="opacity-0 transition-opacity group-hover:opacity-100 text-vscode-error"
                                        aria-label="Delete"
                                        onclick={() => remove(e.id)}
                                    >
                                        <Trash2 class="h-3.5 w-3.5" />
                                    </Button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </Card>
    {/if}
</div>

<Dialog bind:open title="New expense" size="lg">
    <div class="grid gap-3 sm:grid-cols-2">
        <Field label="Amount">
            <Input type="number" step="0.01" bind:value={form.amount} />
        </Field>
        <Field label="Date">
            <Input type="date" bind:value={form.expense_date} />
        </Field>
        <Field label="Category">
            <Select bind:value={form.category}>
                {#each CATEGORIES as c (c)}
                    <option value={c}>{c}</option>
                {/each}
            </Select>
        </Field>
        <Field label="Project">
            <Select bind:value={form.project_id}>
                <option value="none">None</option>
                {#each projects as p (p.id)}
                    <option value={p.id}>{p.name}</option>
                {/each}
            </Select>
        </Field>
        <Field class="sm:col-span-2" label="Vendor">
            <Input bind:value={form.vendor} />
        </Field>
        <Field class="sm:col-span-2" label="Notes">
            <Input bind:value={form.description} />
        </Field>
    </div>
    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
        <Button variant="brand" onclick={create}>Create</Button>
    {/snippet}
</Dialog>
