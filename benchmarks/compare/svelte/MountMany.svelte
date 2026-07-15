<script>
  export let iteration = 0;
  const items = Array.from({ length: 100 });
</script>

<div>
  {#each items as _, j}
    <span>{iteration}:{j}</span>
  {/each}
</div>
