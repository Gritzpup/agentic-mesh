<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import ForceGraph3D from '3d-force-graph';
  import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

  export let nodes: any[] = [];
  export let links: any[] = [];
  export let selectedNodeId: string | null = null;

  const colorMap = {
    'task': '#3b82f6',     
    'decision': '#00ff88', 
    'artifact': '#ffaa00', 
    'policy': '#8b5cf6',    
    'agent': '#ff1e1e',     // 🔴 NEON_RED: Distinct Agent Identity
    'skill': '#00ffff',     // 🔵 PURE_CYAN
    'done': '#00ff88',      // 🟢 NEON_GREEN
    'failed': '#ffaa00'     // 🟠 AMBER_ORANGE
  };

  let container: HTMLDivElement;
  let graph: any;
  let isInteracting = false;
  let lastUpdate = 0;

  const materialCache = new Map<string, THREE.MeshBasicMaterial>();
  const sharedSphereGeometry = new THREE.SphereGeometry(1, 16, 16);
  const sharedOctaGeometry = new THREE.OctahedronGeometry(1.2);

  function getMaterial(color: string) {
    if (materialCache.has(color)) return materialCache.get(color);
    const material = new THREE.MeshBasicMaterial({ 
      color,
      transparent: true,
      opacity: 0.95 // 🛡️ PURITY: Basic material ignores light/reflections
    });
    materialCache.set(color, material);
    return material;
  }

  onMount(() => {
    graph = new ForceGraph3D()(container)
      .backgroundColor('#000000')
      .showNavInfo(false)
      .nodeLabel((node: any) => `
        <div class="p-2 bg-black/80 border border-white/20 rounded shadow-xl backdrop-blur-sm text-xs">
          <div class="font-bold text-white mb-1">ID: ${node.id}</div>
          <div class="flex gap-2">
             <span class="px-1.5 py-0.5 rounded bg-blue-900/50 text-[10px] uppercase">${node.group}</span>
             <span class="text-white/60">${node.label || 'No label'}</span>
          </div>
          ${node.status ? `<div class="mt-1 text-[10px] ${node.status === 'failed' ? 'text-red-400' : 'text-green-400'}">Status: ${node.status}</div>` : ''}
        </div>
      `)
      .nodeThreeObject((node: any) => {
        const size = node.val || 10;
        const group = new THREE.Group();
        
        // 🛡️ IDENTITY_PROTECTION: Agents and Skills stay their signature color regardless of status
        const isIdentityNode = node.group === 'agent' || node.group === 'skill';
        const baseColor = colorMap[node.group as keyof typeof colorMap] || '#ffffff';
        const color = (!isIdentityNode && node.status && colorMap[node.status as keyof typeof colorMap]) 
          ? colorMap[node.status as keyof typeof colorMap] 
          : baseColor;
        
        const geometry = node.group === 'skill' ? sharedOctaGeometry : sharedSphereGeometry;
        const mesh = new THREE.Mesh(geometry, getMaterial(color)!);
        mesh.scale.set(size, size, size);
        group.add(mesh);

        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 64, 64);
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.2, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ 
          map: texture, 
          transparent: true, 
          blending: THREE.NormalBlending, // 🛡️ ISO_COLOR: Prevents color mixing/leaking from neighbors
          opacity: 0.9,
          depthWrite: false 
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(size * 5, size * 5, 1);
        group.add(sprite);

        return group;
      })
      // 🔦 GOURCE-STYLE: Thin Luminous Links (OpenViking Fidelity Spec)
      .linkDirectionalParticles((link: any) => link.__isPulsing ? 10 : 6)
      .linkDirectionalParticleSpeed((link: any) => link.__isPulsing ? 0.08 : 0.003)
      .linkDirectionalParticleWidth((link: any) => link.__isPulsing ? 6 : 3)
      .linkDirectionalParticleColor((link: any) => {
        const source = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
        return colorMap[source?.group as keyof typeof colorMap] || '#3b82f6';
      })
      .linkWidth((link: any) => {
        const source = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
        const isAgentOrigin = source?.group === 'agent';
        return (link.__isPulsing ? 6 : (isAgentOrigin ? 3 : 1.5)); // 🛡️ GOURCE_FIDELITY: Thin luminous fiber links
      })
      .linkColor((link: any) => {
        const source = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
        const color = colorMap[source?.group as keyof typeof colorMap] || '#ffffff';
        return link.__isPulsing ? color : `${color}66`; // 🌟 TRANSLUCENT: High-density spider-web look (60% opacity)
      })
      .onNodeClick((node: any) => {
        selectedNodeId = node.id;
        const distance = 300;
        const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);
        graph.cameraPosition(
          { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
          node,
          2000
        );
      });

    const controls = graph.controls();
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.addEventListener('start', () => { isInteracting = true; });
      controls.addEventListener('end', () => { isInteracting = false; });
    }

    // 🏎 RENDERING ENGINE: Isolated High-Fidelity (OpenViking Spec)
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.offsetWidth, container.offsetHeight),
      2.2,  // 🚀 VIBRANT_FORCE: High peak energy
      0.15, // 🛡️ TIGHT_ISO: Sharp glow, zero bleed (Prevents 'Yellow Wash')
      0.1   // 🔦 ACCESSIBILITY: Ensures thin links remain glowing
    );
    graph.postProcessingComposer().addPass(bloomPass);

    updateGraphData();
  });

  $: if (nodes && links && graph) {
    const now = Date.now();
    if (!isInteracting && now - lastUpdate > 1000) {
      updateGraphData();
      lastUpdate = now;
    }
  }

  function updateGraphData() {
    if (!graph) return;
    graph.graphData({ nodes, links });
  }

  onDestroy(() => {
    if (graph) graph._destructor?.();
  });
</script>

<div bind:this={container} class="w-full h-full cursor-grab active:cursor-grabbing"></div>
