<script lang="ts">
  import { onMount } from 'svelte';
  
  let policies: any[] = [];
  let loading = true;

  onMount(async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:5189/api/policies`);
      policies = await res.json();
    } catch(e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="policy-container">
  <h2>GLOBAL SWARM DIRECTIVES</h2>
  
  {#if loading}
    <div class="status">Loading policy matrix...</div>
  {:else if policies.length === 0}
    <div class="status">No core directives found. Swarm operating unconstrained.</div>
  {:else}
    <div class="list">
      {#each policies as policy}
        <div class="policy-row">
          <div class="policy-id">[{policy.id}]</div>
          <div class="policy-rule">{policy.rule}</div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .policy-container {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 1rem;
    font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
  }
  
  h2 {
    color: #fff;
    margin-top: 0;
    margin-bottom: 2rem;
    font-size: 1.25rem;
    letter-spacing: 2px;
    border-bottom: 1px solid #333;
    padding-bottom: 0.5rem;
  }
  
  .list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .policy-row {
    background: #0a0a0c;
    border: 1px solid #333;
    padding: 1rem;
    display: flex;
    flex-direction: row;
    gap: 1.5rem;
    transition: border-color 0.2s;
  }
  
  .policy-row:hover {
    border-color: #00ffcc;
  }

  .policy-id {
    color: #00ffcc;
    font-weight: 600;
    white-space: nowrap;
    width: 120px;
    font-size: 0.85rem;
    padding-top: 2px;
  }

  .policy-rule {
    color: #e0e0e0;
    font-size: 0.95rem;
    line-height: 1.6;
    flex-grow: 1;
  }
  
  .status {
    color: #888;
  }
</style>
