<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { Chart, type ChartConfiguration, registerables } from "chart.js";

    Chart.register(...registerables);

    interface Props {
        config: ChartConfiguration;
        height?: number;
    }
    let { config, height = 240 }: Props = $props();

    let canvas: HTMLCanvasElement | null = null;
    let chart: Chart | null = null;

    onMount(() => {
        if (!canvas) {
            return;
        }
        chart = new Chart(canvas, config);
    });

    $effect(() => {
        if (!chart) {
            return;
        }
        chart.data = config.data;
        chart.options = config.options ?? {};
        chart.update();
    });

    onDestroy(() => chart?.destroy());
</script>

<div style="height: {height}px;" class="w-full">
    <canvas bind:this={canvas}></canvas>
</div>
