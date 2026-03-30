<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { marked } from 'marked';

  const dispatch = createEventDispatcher();
  export let showArtifactId: string | null = null;
  
  let content = "";
  let meta: any = null;
  let loading = false;
  let error = "";

  async function loadArtifact() {
    if (!showArtifactId) return;
    loading = true;
    error = "";
    try {
      const res = await fetch(`/api/artifacts/${showArtifactId}`);
      if (!res.ok) throw new Error("Artifact not found or server error");
      const data = await res.json();
      meta = data;
      if (data.path.endsWith('.md')) {
        content = await marked.parse(data.content);
      } else {
        content = `<pre><code>${data.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: if (showArtifactId) {
    loadArtifact();
  }
</script>

<div class="artifact-panel hud-card">
  <button class="close-btn" on:click={() => dispatch('close')} type="button" aria-label="Close panel">&times;</button>
  
  {#if loading}
    <div class="status-box">
      <div class="spinner"></div>
      DECRYPTING_LOG...
    </div>
  {:else if error}
    <div class="error-box">
      <div class="error-icon">!</div>
      {error}
    </div>
  {:else if meta}
    <div class="artifact-header">
      <div class="meta-info">
        <div class="hud-title-wrap">
          <div class="hud-title">{meta.type.toUpperCase()}_LOG</div>
          <div class="hud-title-accent"></div>
        </div>
        <h3 class="path">{meta.path.split('/').pop()}</h3>
      </div>
      <a href="vscodium://file/{meta.path}" class="open-btn">OPEN_IN_EDITOR</a>
    </div>
    <div class="artifact-content markdown-body">
      {@html content}
    </div>
  {:else}
    <div class="empty">INITIALIZE_DATA_STREAM</div>
  {/if}
</div>

<style>
  .artifact-panel {
    height: 100%; display: flex; flex-direction: column; overflow: hidden;
    position: relative; border-radius: 0; background: rgba(5, 7, 10, 0.95);
    backdrop-filter: blur(40px);
  }

  .hud-card { border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 0 50px rgba(0,0,0,0.8); }

  .close-btn {
    position: absolute; top: 1rem; right: 1.5rem; background: none; border: none;
    color: #4b5563; font-size: 2rem; cursor: pointer; z-index: 10;
  }
  .close-btn:hover { color: #ef4444; }

  .status-box, .error-box, .empty {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 1.5rem; color: #4b5563; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;
  }

  .spinner {
    width: 32px; height: 32px; border: 2px solid rgba(59, 130, 246, 0.1);
    border-top-color: #3b82f6; animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .artifact-header { padding: 2rem; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }

  .hud-title-wrap { position: relative; margin-bottom: 8px; }
  .hud-title { font-size: 10px; font-weight: 900; letter-spacing: 2px; color: #3b82f6; position: relative; z-index: 2; padding: 2px 6px; }
  .hud-title-accent { position: absolute; inset: 0; background: rgba(59, 130, 246, 0.1); border-left: 2px solid #3b82f6; z-index: 1; }

  .path { margin: 0; font-size: 1.25rem; font-weight: 700; color: #f1f5f9; letter-spacing: -0.025em; }

  .open-btn {
    padding: 10px 20px; background: rgba(59, 130, 246, 0.05); color: #3b82f6;
    border: 1px solid rgba(59, 130, 246, 0.3); font-size: 10px; font-weight: 800;
    font-family: 'JetBrains Mono', monospace; text-decoration: none;
  }
  .open-btn:hover { background: #3b82f6; color: #fff; box-shadow: 0 0 20px rgba(59, 130, 246, 0.4); }

  .artifact-content { flex: 1; overflow-y: auto; padding: 3rem; color: #94a3b8; font-family: 'Inter', sans-serif; line-height: 1.7; }

  :global(.markdown-body h1, .markdown-body h2) { color: #fff; margin-top: 2rem; }
  :global(.markdown-body pre) { background: #000; border: 1px solid #1e293b; padding: 1.5rem; margin: 1.5rem 0; }
  :global(.markdown-body code) { font-family: 'JetBrains Mono', monospace; color: #3b82f6; }
</style>
