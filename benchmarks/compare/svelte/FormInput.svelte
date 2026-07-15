<script>
  import { tick } from "svelte";

  let value = "";

  export async function run(count) {
    for (let i = 0; i < count; i++) {
      value = `value-${i}`;
      await tick();
    }
    return value;
  }
</script>

<input bind:value>
