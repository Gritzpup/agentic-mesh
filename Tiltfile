# Agentic Mesh Orchestration (Docker Compose + Tilt HUD)

# 1. Start the Dockerized Mesh (UI & MCP)
docker_compose('./docker-compose.yml')

# 2. Add Host Networking for the UI resource
# (This ensures the Tilt HUD link works correctly)
dc_resource('mesh-ui', labels=['frontend'])
dc_resource('mesh-mcp', labels=['backend'])

# 3. Add the Host Ingestion Bridge
# This resource MUST stay on the host to have direct access to ~/.codex logs.
local_resource('mesh-bridge',
    cmd='cd src && node mesh_bridge.js',
    deps=['src/mesh_bridge.js', 'src/db.js'],
    labels=['ingestion']
)
