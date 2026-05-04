<script lang="ts">
    // Tri-state header checkbox (none / some / all). Bind `selected` to a
    // SvelteSet of ids; pass the visible row ids. Toggling fills or clears
    // the set against the visible ids only — out-of-view ids are untouched.
    interface Props {
        ids: string[];
        selected: Set<string>;
        onchange: (next: Set<string>) => void;
        class?: string;
    }

    let { ids, selected, onchange, class: className = "" }: Props = $props();

    const visibleSelected = $derived(
        ids.filter((id) => selected.has(id)).length,
    );
    const all = $derived(ids.length > 0 && visibleSelected === ids.length);
    const some = $derived(visibleSelected > 0 && !all);

    function toggle() {
        const next = new Set(selected);
        if (all) {
            for (const id of ids) {
                next.delete(id);
            }
        } else {
            for (const id of ids) {
                next.add(id);
            }
        }
        onchange(next);
    }

    let el: HTMLInputElement | undefined = $state();
    $effect(() => {
        if (el) {
            el.indeterminate = some;
        }
    });
</script>

<input
    bind:this={el}
    type="checkbox"
    checked={all}
    aria-label={all ? "Deselect all" : "Select all"}
    onchange={toggle}
    class={className}
/>
