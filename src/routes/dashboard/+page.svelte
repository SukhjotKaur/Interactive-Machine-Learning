<script>
  import { onMount } from 'svelte';
  import { showDashboard } from '$lib/marcelle/components/dashboard';

  onMount(() => {
    showDashboard();
  });
</script>

<div id="dashboard-root"></div>