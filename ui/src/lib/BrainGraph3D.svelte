<script lang="ts">
  import { onMount, unmount } from 'svelte';
  import ForceGraph3D from '3d-force-graph';
  import * as THREE from 'three';
  import { forceCollide } from 'd3-force-3d';
  // @ts-ignore
  import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

  // Svelte 5 Runes
  let { 
    nodes = [], 
    links = [], 
    selectedNodeId = null, 
    isSpinning = $bindable(true),
    pulseData = null,
    onArtifactSelect = null
  } = $props();

  const colorMap = {
    'task': '#3b82f6',     
    'decision': '#10b981', 
    'artifact': '#f59e0b', 
    'policy': '#8b5cf6',    
    'agent': '#ef4444',
    'skill': '#06b6d4',
    'done': '#10b981',    // 🟢 MESH_COMPLETE
    'failed': '#f59e0b'   // 🟠 MESH_STALLED
  };

  let container: HTMLDivElement;
  let graph: any;
  
  // State tracking
  let lastUpdate = 0;
  let updateTimer: any = null;
  let lastNodeCount = 0;
  let lastSelectedNodeId: string | null = null;
  let isInteracting = false; 
  
  // High performance throttle for massive mesh environments
  const UPDATE_THROTTLE_MS = 500; 

  // Geometries and materials cache - MOVED INSIDE component to prevent stale states across HMR/Re-renders
  const sharedSphereGeometry = new THREE.IcosahedronGeometry(1, 2);
  const sharedOctaGeometry = new THREE.OctahedronGeometry(1);
  const materialCache = new Map<string, THREE.Material>();

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

  function applyGraphUpdate() {
    if (!graph || isInteracting) return;
    updateTimer = null;
    lastUpdate = Date.now();
    
    if (nodes.length === 0 && lastNodeCount === 0) return;
    
    // 🛡️ PERSISTENCE ENGINE: Merge new data with existing node positions to prevent 'reset to middle'
    const currentData = graph.graphData();
    const nodeMap = new Map(currentData.nodes.map((n: any) => [n.id, n]));
    
    const processedNodes = nodes.map(n => {
      const existing = nodeMap.get(n.id) as any;
      if (existing) {
        // Preserve position and velocity for stability
        return { 
          ...n, 
          x: existing.x, y: existing.y, z: existing.z, 
          vx: existing.vx, vy: existing.vy, vz: existing.vz 
        };
      }
      return n;
    });

    graph.graphData({ nodes: processedNodes, links });
    lastNodeCount = nodes.length;
    
    // Settle physics faster for high-frequency updates
    const simulatedTicks = nodes.length > 30 ? 10 : 30;
    graph.cooldownTicks(simulatedTicks);
  }

  function requestGraphUpdate() {
    const now = Date.now();
    if (now - lastUpdate > UPDATE_THROTTLE_MS) {
      applyGraphUpdate();
    } else if (!updateTimer) {
      updateTimer = setTimeout(applyGraphUpdate, UPDATE_THROTTLE_MS - (now - lastUpdate));
    }
  }

  // Warning Suppression (DADDU FIX: Cleaner console)
  try {
    const originalWarn = console.warn;
    console.warn = (...args) => {
      if (typeof args[0] === 'string' && (
        args[0].includes('THREE.Clock') || 
        args[0].includes('EME is not supported') ||
        args[0].includes('requestAnimationFrame')
      )) return;
      originalWarn.apply(console, args);
    };
  } catch (e) { /* ignore */ }

  onMount(() => {
    // 🛡️ CACHE-BUST: Clear stale materials from previous sessions/renders to ensure new intensity scales are applied
    materialCache.clear();
    
    graph = new ForceGraph3D(container, { 
      controlType: 'orbit',
      rendererConfig: { 
        powerPreference: 'high-performance', 
        antialias: true,
        precision: 'highp'
      }
    })
      .graphData({ nodes, links })
      .backgroundColor('#000000')
      .showNavInfo(false);

    // 🔦 BALANCED LIGHTING: Professional contrast without washing out the void
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    graph.scene().add(ambientLight);
    
    graph
      // 🔦 GOURCE-STYLE: Laser Flow (Real-time events)
      .linkDirectionalParticles((link: any) => link.__isPulsing ? 10 : 6)
      .linkDirectionalParticleSpeed((link: any) => link.__isPulsing ? 0.08 : 0.003)
      .linkDirectionalParticleWidth((link: any) => link.__isPulsing ? 12 : 6)
      .linkDirectionalParticleColor((link: any) => {
        const source = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
        return colorMap[source?.group as keyof typeof colorMap] || '#3b82f6';
      })
      .linkWidth((link: any) => {
        const source = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
        const isAgentOrigin = source?.group === 'agent';
        return (link.__isPulsing ? 10 : (isAgentOrigin ? 6 : 4)); // 🛡️ BALANCED: Bold but clean structure
      })
      .linkColor((link: any) => {
        const source = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
        const color = colorMap[source?.group as keyof typeof colorMap] || '#ffffff';
        return link.__isPulsing ? color : `${color}cc`; // 🛡️ BALANCED: 80% opacity for stability
      })

      .nodeLabel((node: any) => `
        <div style="background: rgba(0, 0, 0, 0.95); padding: 16px; border: 1px solid ${colorMap[node.group as keyof typeof colorMap] || '#fff'}; border-radius: 0; color: #fff; font-family: 'JetBrains Mono', monospace; box-shadow: 0 0 30px rgba(0,0,0,0.8); min-width: 150px;">
          <b style="color: ${colorMap[node.group as keyof typeof colorMap]}; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 2px; font-weight: 900;">// ${node.group}</b><br/>
          <div style="margin-top: 8px; font-size: 1rem; font-weight: 700; line-height: 1.2;">${node.label || node.id}</div>
          ${node.status ? `<div style="margin-top: 8px; font-size: 0.7rem; color: #64748b; font-family: 'JetBrains Mono';">${node.status.toUpperCase()}</div>` : ''}
        </div>
      `)
      .nodeThreeObject((node: any) => {
        // 💫 Glow Aura Overlay
        const size = node.val || 10;
        const group = new THREE.Group();
        
        // Core Node & Status Logic
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
        ctx.clearRect(0, 0, 64, 64); // 🛡️ ALPHA-TRUE: Definitively kill 'Black Squares'
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
        sprite.scale.set(size * 5, size * 5, 1); // 💡 BALANCED: 5x multiplier for depth visibility
        group.add(sprite);

        node.__mesh = mesh;
        node.__sprite = sprite;
        return group;
      })
      .onNodeClick((node: any) => {
        isSpinning = false;
        
        // 🧪 ARTIFACT-PREVIEW TRIGGER
        if (node.group === 'artifact' && onArtifactSelect) {
          onArtifactSelect(node.id.replace('artifact-', ''));
        }

        const distance = 400;
        const distRatio = 1 + distance/Math.hypot(node.x || 0, node.y || 0, node.z || 0);
        graph.cameraPosition(
          { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
          node,
          1000
        );
      })
      .onBackgroundClick(() => { isSpinning = false; })
      .onNodeDrag(() => { isSpinning = false; isInteracting = true; })
      .onNodeDragEnd(() => { isInteracting = false; })
      .cooldownTicks(60);

    // Physics Tuning for performance
    // 🧪 SPATIAL OVERHAUL: Increase repulsion and distance for high-density mesh
    graph.d3Force('link').distance(180).strength(0.4);
    graph.d3Force('charge').strength(-1200); 
    graph.d3Force('collide', (forceCollide as any)(40)); // 🛡️ COLLISION PROTECTION: Stop ball-clumping
    graph.d3VelocityDecay(0.1); // 🌊 FLUID_MOTION: Smoother spreading

    const controls = graph.controls();
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.autoRotate = isSpinning;
      controls.autoRotateSpeed = 0.4;
      
      // 🛡️ CONTROL STABILITY: Guard against Pointer Events during sync
      controls.addEventListener('start', () => { isInteracting = true; });
      controls.addEventListener('end', () => { isInteracting = false; });
    }

    // 🏎 RENDERING ENGINE: Isolated High-Fidelity
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.offsetWidth, container.offsetHeight),
      1.6, // 🚀 VIBRANT_FORCE
      0.2, // 🛡️ TIGHT_ISO: Prevents color bleeding/leaking between neighbors
      0.1  // 🛡️ SHARP: Keeps details clear
    );
    graph.postProcessingComposer().addPass(bloomPass);

    return () => {
      if (updateTimer) clearTimeout(updateTimer);
      // Clean cleanup
      sharedSphereGeometry.dispose();
      sharedOctaGeometry.dispose();
      materialCache.forEach(m => m.dispose());
      materialCache.clear();
      if (graph) {
        // Force cleanup of heavy objects
        try { graph._destructor?.(); } catch(e) {}
      }
    };
  });

  // Effect-based updates (Svelte 5)
  $effect(() => {
    if (graph && (nodes.length || links.length)) {
      requestGraphUpdate();
    }
  });

  $effect(() => {
    if (graph && pulseData) {
      const targetNodeId = pulseData.target.startsWith('task-') ? pulseData.target : `task-${pulseData.target}`;
      const sourceNodeId = pulseData.actor;
      
      // ⚡ LASER BURST: Find the specific link and trigger a visual surge
      const activeLink = links.find(l => 
        (l.source === sourceNodeId || (l.source as any).id === sourceNodeId) && 
        (l.target === targetNodeId || (l.target as any).id === targetNodeId)
      );

      if (activeLink) {
        (activeLink as any).__isPulsing = true;
        setTimeout(() => { 
          (activeLink as any).__isPulsing = false; 
        }, 1500);
      }

      const targetNode = nodes.find(n => n.id === targetNodeId);
      if (targetNode && targetNode.__mesh) {
        const mesh = targetNode.__mesh;
        const originalVal = targetNode.val || 10;
        mesh.scale.set(originalVal * 2.1, originalVal * 2.1, originalVal * 2.1);
        setTimeout(() => {
          if (mesh && mesh.scale) mesh.scale.set(originalVal, originalVal, originalVal);
        }, 500);
      }
    }
  });

  $effect(() => {
    if (graph && selectedNodeId && selectedNodeId !== lastSelectedNodeId) {
      lastSelectedNodeId = selectedNodeId;
      const node = nodes.find(n => n.id === selectedNodeId);
      // 🛡️ COORDINATE SAFETY: Avoid "reading x of undefined" during rapid data updates
      if (node && typeof node.x === 'number' && typeof node.y === 'number' && typeof node.z === 'number') {
        graph.cameraPosition({ x: node.x * 2.5, y: node.y * 2.5, z: node.z * 2.5 }, node, 1200);
      }
    }
  });

  // 🌌 AUTO-FRAME: Smarter framing logic to prevent 'zooming out' during small updates
  let zoomTimeout: any = null;
  let prevNodeCount = 0;
  $effect(() => {
    if (graph && nodes.length > 0) {
      const diff = Math.abs(nodes.length - prevNodeCount);
      const isInitial = prevNodeCount === 0;
      
      if (isInitial || diff > 4) { // 🛡️ JITTER_GUARD: Only frame on major changes
        if (zoomTimeout) clearTimeout(zoomTimeout);
        zoomTimeout = setTimeout(() => {
            graph.zoomToFit(1200, 150);
        }, 1200); // 🛡️ PHYSICS STABILITY: Wait longer for nodes to spread
      }
      prevNodeCount = nodes.length;
    }
  });
  
  $effect(() => {
    if (graph) {
      const controls = graph.controls();
      if (controls) controls.autoRotate = isSpinning;
    }
  });
</script>

<div class="container" bind:this={container}></div>

<style>
  .container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    touch-action: none;
    background: #000;
  }
</style>


