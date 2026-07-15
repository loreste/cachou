<script>
  import { tick } from "svelte";

  export let count = 0;
  let value = 0;
  $: items = Array.from({ length: count });

  export async function run(updates) {
    for (let i = 1; i <= updates; i++) {
      value = i;
      await tick();
    }
  }
</script>

{#each items as _, i}
  <span>{value}</span>
{/each}
