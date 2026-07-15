<script>
  import { tick } from "svelte";

  export let rows = [];

  export async function reverse() {
    rows = rows.slice().reverse();
    await tick();
  }
</script>

<table>
  <tbody>
    {#each rows as row (row.id)}
      <tr><td>{row.id}</td><td>{row.label}</td></tr>
    {/each}
  </tbody>
</table>
