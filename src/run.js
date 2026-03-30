const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Launching Agentic Mesh Sidecar...');

/**
 * Utility to spawn and log processes
 */
function launch(name, script, args = []) {
    const proc = spawn('node', [script, ...args], {
        cwd: __dirname,
        stdio: 'inherit'
    });
    proc.on('exit', (code) => console.log(`📦 ${name} exited with code ${code}`));
    return proc;
}

// 1. Start the Ingestion Bridge
const bridge = launch('Bridge', './mesh_bridge.js');

// 2. Start the MCP Server (Note: Stdio transport expects a client like Codex/Antigravity)
// For manual testing, we might just keep it ready.
const mcp = launch('MCP Server', './mcp_server.ts');

process.on('SIGINT', () => {
    bridge.kill();
    mcp.kill();
    process.exit();
});
