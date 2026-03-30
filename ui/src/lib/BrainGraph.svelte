<script lang="ts">
  import { onMount, createEventDispatcher, onDestroy } from 'svelte';
  import * as d3 from 'd3';

  const dispatch = createEventDispatcher();

  let canvasElement: HTMLCanvasElement;
  let containerElement: HTMLDivElement;
  let tooltipNode: HTMLDivElement;
  let tooltipData: any = null;
  let pinnedTooltipId: string | null = null;

  let simulation: any;
  let nodes: any[] = [];
  let links: any[] = [];
  let agents: any[] = [];
  let ctx: CanvasRenderingContext2D | null = null;
  let transform = d3.zoomIdentity;
  let resizeObserver: ResizeObserver;
  let animationFrame: number;

  const colorMap = {
    'task': '#3b82f6',     // Blue
    'decision': '#10b981', // Green
    'artifact': '#f59e0b', // Orange
    'policy': '#8b5cf6'    // Purple
  };

  const agentIcons = {
    'claude': '🤖',
    'openai': '🧠',
    'gemini': '✨',
    'antigravity': '🛸',
    'codex': '📚'
  };

  // Agent sprite logic
  class AgentSprite {
    id: string;
    icon: string;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    beamIntensity: number = 0;

    constructor(id: string, icon: string, x: number, y: number) {
      this.id = id;
      this.icon = icon;
      this.x = x;
      this.y = y;
      this.targetX = x;
      this.targetY = y;
    }

    update() {
      // Smooth travel
      this.x += (this.targetX - this.x) * 0.08;
      this.y += (this.targetY - this.y) * 0.08;
      if (this.beamIntensity > 0) this.beamIntensity -= 0.05;
    }

    draw(ctx: CanvasRenderingContext2D) {
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Draw Laser Beam if active
      if (this.beamIntensity > 0) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0, 255, 204, ${this.beamIntensity})`;
        ctx.lineWidth = 2;
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.targetX, this.targetY);
        ctx.stroke();
      }

      ctx.fillText(this.icon, this.x, this.y);
    }
  }

  let agentSprites = new Map<string, AgentSprite>();

  async function loadGraphData() {
    try {
      const res = await fetch(`http://${window.location.hostname}:5189/api/graph`);
      const data = await res.json();
      
      // Preserve positions
      const oldNodes = new Map(nodes.map((n: any) => [n.id, n]));
      nodes = data.nodes
        .filter((n: any) => n.status !== 'failed') // Hide archived
        .map((n: any) => {
          const prev = oldNodes.get(n.id);
          if (prev) {
            return Object.assign(prev, n);
          }
          return { ...n, x: containerElement.clientWidth / 2, y: containerElement.clientHeight / 2 };
        });
      links = data.links.filter((l: any) => {
          const s = nodes.find(n => n.id === (l.source.id || l.source));
          const t = nodes.find(n => n.id === (l.target.id || l.target));
          return s && t;
      });

      // Update agents based on decisions
      data.nodes.forEach((n: any) => {
        if (n.agent && n.group === 'decision') {
          let sprite = agentSprites.get(n.agent);
          if (!sprite) {
            sprite = new AgentSprite(n.agent, agentIcons[n.agent as keyof typeof agentIcons] || '👤', containerElement.clientWidth / 2, containerElement.clientHeight / 2);
            agentSprites.set(n.agent, sprite);
          }
          // Record latest target from this agent's recent nodes
          sprite.targetX = n.x || sprite.x;
          sprite.targetY = n.y || sprite.y;
          sprite.beamIntensity = 1.0;
        }
      });

      if (simulation) {
        simulation.nodes(nodes);
        simulation.force("link").links(links);
        simulation.alpha(0.3).restart();
      }
    } catch (e) {}
  }

  function render() {
    if (!ctx || !containerElement) return;
    
    const context = ctx!;
    context.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    context.save();
    context.translate(transform.x, transform.y);
    context.scale(transform.k, transform.k);

    // Draw Links
    context.strokeStyle = "rgba(100, 100, 100, 0.4)";
    context.lineWidth = 1;
    links.forEach(l => {
      context.beginPath();
      context.moveTo(l.source.x, l.source.y);
      context.lineTo(l.target.x, l.target.y);
      context.stroke();
    });

    // Draw Nodes
    nodes.forEach(n => {
      context.beginPath();
      const r = n.group === 'task' ? 12 : (n.group === 'artifact' ? 8 : 6);
      context.arc(n.x, n.y, r, 0, 2 * Math.PI);
      context.fillStyle = colorMap[n.group as keyof typeof colorMap] || '#999';
      context.fill();
      
      // Node glow
      context.shadowBlur = 10;
      context.shadowColor = context.fillStyle as string;
      
      if (pinnedTooltipId === n.id) {
        context.strokeStyle = "#fff";
        context.lineWidth = 2;
        context.stroke();
      }

      // Draw truncated labels for Tasks
      if (n.group === 'task' && n.label) {
        context.font = '10px Arial';
        context.fillStyle = '#aaa';
        context.textAlign = 'center';
        const label = n.label.length > 30 ? n.label.substring(0, 27) + '...' : n.label;
        context.fillText(label, n.x, n.y + 20);
      }
    });
    context.shadowBlur = 0;

    // Draw Agents
    agentSprites.forEach(sprite => {
      sprite.update();
      sprite.draw(context);
    });

    context.restore();

    animationFrame = requestAnimationFrame(render);
  }

  function handleCanvasClick(event: MouseEvent) {
    const rect = canvasElement.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;

    // Inverse transform for zoom/pan
    const x = (rawX - transform.x) / transform.k;
    const y = (rawY - transform.y) / transform.k;

    // Find closest node
    let closestNode: any = null;
    let minDist = 20 / transform.k; // Scaled selection radius

    nodes.forEach(n => {
      const dist = Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closestNode = n;
      }
    });

    if (closestNode) {
      if (pinnedTooltipId === closestNode.id) {
         pinnedTooltipId = null;
         tooltipData = null;
      } else {
         pinnedTooltipId = closestNode.id;
         tooltipData = closestNode;
         if (closestNode.group === 'artifact') {
           dispatch('selectArtifact', closestNode.id.split('-')[1]);
         }
      }
    } else {
      pinnedTooltipId = null;
      tooltipData = null;
    }
  }

  onMount(() => {
    ctx = canvasElement.getContext('2d');
    const width = containerElement.clientWidth;
    const height = containerElement.clientHeight;
    canvasElement.width = width;
    canvasElement.height = height;

    simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(80).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX((d: any) => {
          if (d.group === 'task') return width * 0.25;
          if (d.group === 'decision') return width * 0.5;
          if (d.group === 'artifact') return width * 0.75;
          return width / 2;
      }).strength(0.8))
      .force("y", d3.forceY(height / 2).strength(0.1));

    const zoomFn = d3.zoom()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        transform = event.transform;
      });

    d3.select(canvasElement).call(zoomFn as any);

    loadGraphData();
    const syncInterval = setInterval(loadGraphData, 5000);
    render();

    resizeObserver = new ResizeObserver(() => {
      const w = containerElement.clientWidth;
      const h = containerElement.clientHeight;
      canvasElement.width = w;
      canvasElement.height = h;
      simulation.force("center", d3.forceCenter(w / 2, h / 2));
      simulation.alpha(0.3).restart();
    });
    resizeObserver.observe(containerElement);

    return () => {
      clearInterval(syncInterval);
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  });
</script>

<div class="graph-wrapper" bind:this={containerElement}>
  <div class="trajectory-legend">
    <div class="tag-group">
      <div class="tag task">TASKS</div>
      <div class="desc">Agent Inception Points</div>
    </div>
    <div class="tag-group">
      <div class="tag decision">DECISIONS</div>
      <div class="desc">Active LLM Cognition</div>
    </div>
    <div class="tag-group">
      <div class="tag artifact">ARTIFACTS</div>
      <div class="desc">FileSystem Evolution</div>
    </div>
    <div class="tag-group">
      <div class="tag policy">POLICIES</div>
      <div class="desc">Governing System Rules</div>
    </div>
  </div>

  <canvas 
    bind:this={canvasElement} 
    on:click={handleCanvasClick}
  ></canvas>
  
  {#if tooltipData}
    <div 
      class="tooltip" 
      style="left: {tooltipData.x * transform.k + transform.x + 20}px; top: {tooltipData.y * transform.k + transform.y - 20}px;"
    >
      <div class="tip-header">
        <span class="badge {tooltipData.group}">{tooltipData.group.toUpperCase()}</span>
      </div>
      <p class="tip-label">{tooltipData.label}</p>
      {#if tooltipData.status}
        <p class="tip-detail"><strong>Status:</strong> {tooltipData.status}</p>
      {/if}
      {#if tooltipData.agent}
        <p class="tip-detail"><strong>Agent:</strong> {tooltipData.agent}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .graph-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    background: #020203;
    overflow: hidden;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* Gource-style Legend on the Left Side */
  .trajectory-legend {
    position: absolute;
    left: 2rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 2rem;
    pointer-events: none;
    z-index: 10;
  }

  .tag-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    font-weight: 800;
    padding: 0.25rem 0.75rem;
    background: #000;
    border-left: 4px solid #fff;
    width: fit-content;
    letter-spacing: 0.1em;
  }

  .tag.task { border-color: #3b82f6; color: #3b82f6; }
  .tag.decision { border-color: #10b981; color: #10b981; }
  .tag.artifact { border-color: #f59e0b; color: #f59e0b; }
  .tag.policy { border-color: #8b5cf6; color: #8b5cf6; }

  .desc {
    font-size: 0.6rem;
    color: #666;
    text-transform: uppercase;
    padding-left: 0.5rem;
  }

  .tooltip {
    position: absolute;
    background: rgba(0, 0, 0, 0.95);
    border: 1px solid #00ffcc;
    padding: 12px;
    color: #e0e0e0;
    pointer-events: none;
    font-size: 0.85rem;
    box-shadow: 0 4px 20px rgba(0,255,204,0.2);
    z-index: 100;
    max-width: 250px;
    backdrop-filter: blur(4px);
  }

  .tip-header {
    margin-bottom: 8px;
  }

  .badge {
    font-size: 0.65rem;
    padding: 2px 6px;
    font-weight: bold;
    color: #000;
  }
  
  .badge.task { background: #3b82f6; }
  .badge.decision { background: #10b981; }
  .badge.artifact { background: #f59e0b; }
  .badge.policy { background: #8b5cf6; }

  .tip-label {
    margin: 0 0 8px 0;
    font-weight: bold;
    word-break: break-word;
  }

  .tip-detail {
    margin: 0 0 4px 0;
    color: #aaa;
  }
</style>

