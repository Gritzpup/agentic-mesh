<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade, slide } from 'svelte/transition';
  import BrainGraph3D from './lib/BrainGraph3D.svelte';
  import ArtifactRenderer from './lib/ArtifactRenderer.svelte';
  import TasksList from './lib/TasksList.svelte';

  interface Node {
    id: string;
    group: string;
    label: string;
    status?: string;
    agent?: string;
    type?: string;
    path?: string;
    val?: number;
    x?: number;
    y?: number;
    z?: number;
  }

  interface Link {
    source: string;
    target: string;
  }

  let nodes: Node[] = [];
  let links: Link[] = [];
  let selectedNodeId: string | null = null;
  let showArtifactId: string | null = null;
  let sidebarMetrics: { key: string, label: string, count: number, color: string }[] = [];
  // Persistent attributes with reliable defaults
  const getPersisted = (key: string, def: boolean) => {
    if (typeof localStorage === 'undefined') return def;
    const val = localStorage.getItem(key);
    return val === null ? def : val === 'true';
  };

  let showSidebar = getPersisted('mesh_showSidebar', true);
  let isSpinning = getPersisted('mesh_isSpinning', true);

  // Persistence handler
  $: if (typeof localStorage !== 'undefined') {
    localStorage.setItem('mesh_showSidebar', showSidebar.toString());
    localStorage.setItem('mesh_isSpinning', isSpinning.toString());
  }

  let stats = {
    tasks: 0,
    artifacts: 0,
    policies: 0,
    node_count: 0,
    errors: 0
  };

  async function fetchGraph() {
    try {
      const res = await fetch(`/api/graph`);
      const data = await res.json();
      nodes = data.nodes;
      links = data.links;
      
      const counts = nodes.reduce((acc: Record<string, number>, n) => {
        acc[n.group] = (acc[n.group] || 0) + 1;
        if (n.status === 'failed') acc.errors++;
        return acc;
      }, { task: 0, artifact: 0, policy: 0, errors: 0 });

      stats = {
        tasks: counts.task || 0,
        artifacts: counts.artifact || 0,
        policies: counts.policy || 0,
        node_count: nodes.length,
        errors: counts.errors || 0
      };

      // 📊 Sidebar Legend Metrics (Groups in the image)
      sidebarMetrics = [
        { key: 'task', label: 'TASKS', count: counts.task || 0, color: '#3b82f6' },
        { key: 'done', label: 'COMPLETED', count: nodes.filter(n => n.status === 'done').length, color: '#10b981' },
        { key: 'failed', label: 'STALLED', count: nodes.filter(n => n.status === 'failed').length, color: '#f59e0b' },
        { key: 'artifact', label: 'ARTIFACTS', count: counts.artifact || 0, color: '#f59e0b' },
        { key: 'agent', label: 'AGENTS', count: counts.agent || 0, color: '#ef4444' },
        { key: 'skill', label: 'SKILLS', count: nodes.filter(n => n.group === 'skill').length, color: '#06b6d4' }
      ].sort((a, b) => b.count - a.count);

    } catch (e) {
      console.error("UI Fetch Error:", e);
    }
  }

  let sseSource: EventSource;
  let pulseData: any = null;
  let updateTrigger = 0;
  let activityLogs: { id: number, text: string, type: string, time: string }[] = [];
  let logId = 0;

  function addLog(text: string, type: string = 'info') {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    activityLogs = [{ id: logId++, text, type, time }, ...activityLogs].slice(0, 50);
  }

  onMount(() => {
    fetchGraph().then(() => {
      addLog(`SYSTEM // SESSION_READY`, 'system');
      addLog(`ENGINE // GPU_ACCELERATION_ACTIVE`, 'system');
    });
    
    // Initializing centralized streaming updates via SSE
    sseSource = new EventSource(`/api/events`);
    sseSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.event === 'graph_update') {
          fetchGraph();
          updateTrigger = Date.now(); // Notify children
          addLog(`SYSTEM // GRAPH_SYNC_COMPLETE`, 'system');
        } else if (parsed.event === 'pulse') {
          pulseData = { ...parsed.data, _t: Date.now() }; // Unique reference to trigger reactivity
          const actor = parsed.data.actor ? parsed.data.actor.toUpperCase() : 'UNKNOWN';
          const action = parsed.data.action || 'ACTIVE_SYNC';
          addLog(`${actor} // ${action}`, 'pulse');
        }
      } catch (e) {
        console.error("Stream parsing error:", e);
      }
    };
    
    return () => {
      if (sseSource) sseSource.close();
    };
  });
</script>

<div class="layout">
  <aside class="sidebar glass" class:collapsed={!showSidebar}>
    <div class="sidebar-header">
      <div class="title-accent"></div>
      <h1 class="sidebar-title">CONTEXT MESH HUD</h1>
      
      <!-- 📜 HIGH DENSITY OPS LOG -->
      <div class="ops-log-container">
        <div class="section-title">// RECENT OPERATIONS</div>
        <div class="ops-log">
          {#each activityLogs as log (log.id)}
            <div class="log-row" transition:fade>
              <span class="log-time">[{log.time}]</span>
              <span class="log-text" class:pulse={log.type === 'pulse'}>{log.text}</span>
            </div>
          {/each}
          {#if activityLogs.length === 0}
            <div class="empty-state">MESH_IDLE_MONITORING...</div>
          {/if}
        </div>
      </div>
    </div>
    
    <div class="sidebar-scroll">
      <TasksList 
        {updateTrigger}
        on:selectTask={(e) => { selectedNodeId = e.detail; isSpinning = false; }} 
      />
    </div>

    <div class="sidebar-footer">
      <div class="footer-stats">
        <div class="stat-row">
          <span class="stat-label">OPERATIONS</span>
          <span class="stat-value">{stats.tasks}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">SESSION_NODES</span>
          <span class="stat-value">{stats.node_count}</span>
        </div>
      </div>
    </div>
  </aside>

  <!-- 🏷️ LIVE ENERGY TAGS: Left-side Dynamic Ranking -->
  <div class="live-tags-container">
    {#each sidebarMetrics as metric (metric.key)}
      <div 
        animate:flip={{duration: 600}} 
        transition:fade
        class="live-tag glass"
        style="border-left: 3px solid {metric.color}"
      >
        <div class="tag-label">{metric.label}</div>
        <div class="tag-count" style="color: {metric.color}; text-shadow: 0 0 10px {metric.color}66">{metric.count}</div>
      </div>
    {/each}
  </div>

  <main class="mesh-viewport">
    <div class="graph-container">
      <BrainGraph3D 
        {nodes} 
        {links} 
        {selectedNodeId} 
        {pulseData}
        bind:isSpinning
        onArtifactSelect={(id: string) => showArtifactId = id} 
      />
    </div>

    <div class="scanlines"></div>

    <button class="hamburger-btn" on:click={() => showSidebar = !showSidebar} type="button" aria-label="Toggle Sidebar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>

    {#if showArtifactId}
      <div class="artifact-panel glass" transition:slide={{axis: 'x', duration: 400}}>
        <ArtifactRenderer {showArtifactId} on:close={() => showArtifactId = null} />
      </div>
    {/if}
  </main>
</div>

<style>
  :global(body) {
    margin: 0; padding: 0; background: #000; color: #fff;
    font-family: 'JetBrains Mono', 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased; overflow: hidden;
  }

  /* GOURCE HUD Styles - Optimized */
  .layout { display: flex; width: 100vw; height: 100vh; background: #000; }
  .glass { 
    background: rgba(8, 8, 12, 0.95); 
    backdrop-filter: blur(20px); 
    border: 1px solid rgba(255, 255, 255, 0.1); 
    border-radius: 0;
  }

  .sidebar {
    width: 380px; height: 100vh; background: #000;
    border-left: 2px solid rgba(255, 255, 255, 0.05);
    display: flex; flex-direction: column; z-index: 1000;
    position: absolute; right: 0; top: 0;
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: auto; /* Re-enable for the actual panel */
  }
  .sidebar.collapsed { transform: translateX(100%); }

  .hamburger-btn {
    position: absolute; top: 2rem; right: 2rem; z-index: 1001;
    background: rgba(0,0,0,0.5); border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff; padding: 0.8rem; cursor: pointer; transition: all 0.2s;
    border-radius: 0; backdrop-filter: blur(10px);
  }
  .hamburger-btn:hover { background: #3b82f6; border-color: #3b82f6; }

  .sidebar-header { padding: 3rem 2rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
  .sidebar-title { margin: 0; font-size: 0.7rem; font-weight: 900; letter-spacing: 0.5em; color: #fff; text-transform: uppercase; }
  .sidebar-scroll { flex: 1; overflow-y: auto; }
  .sidebar-footer { padding: 2rem; border-top: 1px solid rgba(255, 255, 255, 0.05); background: rgba(255,255,255,0.02); }
  .stat-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .stat-label { font-size: 9px; font-weight: 900; color: rgba(255, 255, 255, 0.3); letter-spacing: 1px; }
  .stat-value { font-size: 1rem; font-weight: 900; color: #3b82f6; font-family: 'JetBrains Mono'; }

  /* 🏷️ LIVE TAG STYLES */
  .live-tags-container {
    position: absolute; top: 0; left: 0; display: flex; flex-direction: column;
    gap: 0; z-index: 10; width: 140px;
    pointer-events: none; /* 🛡️ DATA FREEDOM: Allow orbiting through tags */
  }
  .live-tag {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.2rem 0.6rem; background: rgba(0, 0, 0, 0.7);
    border-radius: 0; min-width: 100px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    box-shadow: 2px 2px 8px rgba(0,0,0,0.4);
    pointer-events: auto; /* Only tag itself blocks drag */
  }
  .tag-label { font-size: 7px; font-weight: 900; letter-spacing: 1px; color: rgba(255,255,255,0.4); }
  .tag-count { font-size: 0.9rem; font-weight: 900; font-family: 'JetBrains Mono'; }

  .mesh-viewport { flex: 1; position: relative; overflow: hidden; }
  .graph-container { position: absolute; inset: 0; }

  .scanlines {
    position: absolute; inset: 0; z-index: 5; pointer-events: none; opacity: 0.03;
    background: linear-gradient(to bottom, transparent 50%, #000 50%);
    background-size: 100% 4px;
  }

  .artifact-panel {
    position: absolute; top: 0; right: 0; width: 600px; height: 100vh;
    z-index: 1002; background: rgba(0,0,0,0.9);
    border-left: 1px solid rgba(255,255,255,0.1);
    box-shadow: -20px 0 50px rgba(0,0,0,0.8);
  }
</style>
