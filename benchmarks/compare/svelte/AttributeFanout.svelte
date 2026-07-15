<script>
  import { tick } from "svelte";

  export let count = 0;
  let active = false;
  $: items = Array.from({ length: count });

  export async function run(updates) {
    for (let i = 0; i < updates; i++) {
      active = i % 2 === 0;
      await tick();
    }
  }
</script>

{#each items as _, i}
  <button class:active>{i}</button>
{/each}
