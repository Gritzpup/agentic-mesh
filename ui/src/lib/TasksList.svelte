<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  export let updateTrigger = 0;
  
  let tasks: any[] = [];
  let loading = true;

  async function fetchTasks() {
    try {
      const res = await fetch(`/api/tasks`);
      tasks = await res.json();
    } catch(e) {
      console.error("Sidebar Fetch Error:", e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchTasks();
  });

  // Reactive Update Handler (Triggers from App.svelte)
  $: if (updateTrigger) {
    fetchTasks();
  }
</script>

<div class="tasks-container">
  <div class="sidebar-header-row">
    <div class="hud-title-wrap">
      <div class="hud-title">NODE_OPERATIONS</div>
      <div class="hud-title-accent"></div>
    </div>
    <span class="count-badge">{tasks.length}</span>
  </div>
  
  {#if loading && tasks.length === 0}
    <div class="status">
      <div class="spinner"></div>
      SYNCING_TASKS...
    </div>
  {:else if tasks.length === 0}
    <div class="status">NO_OPERATIONS_DETECTED</div>
  {:else}
    <div class="list">
      {#each tasks as task}
        <button class="task-item glass" on:click={() => dispatch('selectTask', `task-${task.id}`)} type="button" aria-label="Select operation {task.id}">
          <div class="card-header">
            <span class="status-dot {task.status}"></span>
            <span class="id">{task.id.slice(0, 12)}</span>
          </div>
          <div class="goal">
            {task.goal}
          </div>
          <div class="footer">
            <span class="agent-tag agent-{task.owner_agent}">{task.owner_agent.toUpperCase()}</span>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tasks-container { width: 100%; height: 100%; overflow-y: auto; padding: 2rem; font-family: 'JetBrains Mono', monospace; }

  .sidebar-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }

  .hud-title-wrap { position: relative; display: inline-block; }
  .hud-title { font-size: 10px; font-weight: 900; letter-spacing: 2px; color: #3b82f6; position: relative; z-index: 2; padding: 2px 6px; }
  .hud-title-accent { position: absolute; inset: 0; background: rgba(59, 130, 246, 0.1); border-left: 2px solid #3b82f6; z-index: 1; }

  .count-badge { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #3b82f6; font-size: 0.65rem; padding: 2px 8px; font-weight: 900; }

  .list { display: flex; flex-direction: column; gap: 1rem; }
  
  .task-item {
    display: block; width: 100%; text-align: left; padding: 1.5rem;
    cursor: pointer; border: 1px solid rgba(255, 255, 255, 0.1);
    background: #000; border-radius: 0;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  }
  .task-item:hover { background: #1a1a1a; border-color: #3b82f6; }
  
  .card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
  .id { font-size: 0.7rem; color: #4b5563; font-weight: 700; font-family: 'JetBrains Mono'; }

  .status-dot { width: 4px; height: 12px; border-radius: 0; } /* Forced square status */
  .status-dot.in_progress { background: #f59e0b; box-shadow: 0 0 10px rgba(245, 158, 11, 0.3); animation: pulse 1.5s infinite; }
  .status-dot.done { background: #10b981; }
  .status-dot.failed { background: #ef4444; }

  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

  .goal { color: #f1f5f9; font-size: 0.8rem; font-weight: 700; line-height: 1.5; margin-bottom: 1rem; }

  .agent-tag { font-size: 9px; font-weight: 900; padding: 4px 8px; border-radius: 0; background: #000; color: #3b82f6; border: 1px solid #3b82f6; }
  .agent-antigravity { color: #10b981; border-color: #10b981; }

  .status { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 4rem 0; color: #4b5563; font-size: 0.8rem; }
  .spinner { width: 12px; height: 12px; border: 2px solid #3b82f6; border-radius: 0; animation: spin 1s linear infinite; } /* Square spinner! */
  @keyframes spin { to { transform: rotate(360deg); } }

  .glass { backdrop-filter: blur(12px) saturate(180%); -webkit-backdrop-filter: blur(12px) saturate(180%); }

  .tasks-container::-webkit-scrollbar { width: 0px; }
</style>
