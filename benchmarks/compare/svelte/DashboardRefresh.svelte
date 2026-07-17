<script>
  import { tick } from "svelte";

  export let cards = [];
  let value = 0;

  export async function run(updates) {
    for (let i = 1; i <= updates; i++) {
      value = i;
      await tick();
    }
  }
</script>

<section class="dashboard-grid">
  {#each cards as card (card.id)}
    <article class="metric-card">
      <h3>{card.label}</h3>
      <strong>{value}</strong>
      <p>{card.status}</p>
    </article>
  {/each}
</section>
