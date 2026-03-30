import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { db } from './db.js';
import crypto from 'crypto';
import { exec } from 'child_process';

const server = new Server(
  {
    name: "agentic-mesh-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools.
 * Tools: mesh_get_active_task, mesh_log_action, mesh_search_decisions
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "mesh_get_active_task",
        description: "Retrieve the current active task state for seamless handoff between agents.",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "string" },
          },
        },
      },
      {
        name: "mesh_log_action",
        description: "Log a technical decision or action to the shared brain for documentation and cross-agent context.",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "string" },
            action: { type: "string" },
            outcome: { type: "string" },
            rationale: { type: "string" },
          },
          required: ["task_id", "action"],
        },
      },
      {
        name: "mesh_add_policy",
        description: "Register a new learning policy or rule into the collective brain based on recent success/failure.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            rule: { type: "string" },
          },
          required: ["name", "rule"],
        },
      },
      {
        name: "mesh_get_policies",
        description: "Fetch active policies, guidelines, and lessons learned from past agents.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "mesh_record_artifact",
        description: "Register an output file (artifact) generated during a task into the mesh brain.",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "string" },
            file_path: { type: "string" },
            artifact_type: { type: "string" },
          },
          required: ["task_id", "file_path"],
        },
      },
      {
        name: "mesh_save_trajectory",
        description: "Store the current agent's conversation/context trajectory to database so another CLI can resume it if you get rate limited or fail.",
        inputSchema: {
          type: "object",
          properties: {
            agent_id: { type: "string", description: "Your agent identifier (e.g. claude, openai, antigravity)" },
            session_id: { type: "string" },
            trajectory_data: { type: "string", description: "Stringified JSON of current context, files read, or conversation messages." },
          },
          required: ["agent_id", "session_id", "trajectory_data"],
        },
      },
      {
        name: "mesh_load_trajectory",
        description: "Pull the most recent agent trajectory from the brain database to instantly resume its work.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "mesh_delegate_task",
        description: "Spawn a subprocess of another agent CLI (e.g. `npx aider` or `claude`) to complete a subtask and return its console output.",
        inputSchema: {
          type: "object",
          properties: {
            agent_cli: { type: "string", description: "The CLI command to run (e.g., 'gemini', 'claude', 'npx aider')" },
            task_prompt: { type: "string", description: "The prompt or flags to pass to the CLI" },
          },
          required: ["agent_cli", "task_prompt"],
        },
      },
    ],
  };
});

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "mesh_get_active_task": {
      const { task_id } = request.params.arguments as any;
      const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task_id);
      const history = db.prepare("SELECT * FROM decisions WHERE task_id = ? ORDER BY timestamp DESC LIMIT 5").all(task_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ task, history }, null, 2),
          },
        ],
      };
    }

    case "mesh_log_action": {
      const { task_id, action, outcome, rationale } = request.params.arguments as any;
      db.prepare(`
        INSERT INTO decisions (task_id, agent_id, action, outcome, rationale)
        VALUES (?, ?, ?, ?, ?)
      `).run(task_id, 'mcp_client', action, outcome, rationale);
      return {
        content: [{ type: "text", text: "✅ Action logged to Mesh Brain." }],
      };
    }

    case "mesh_add_policy": {
      const { name, rule } = request.params.arguments as any;
      db.prepare(`
        INSERT OR REPLACE INTO policies (name, rule, is_active)
        VALUES (?, ?, 1)
      `).run(name, rule);
      return {
        content: [{ type: "text", text: `✅ Policy '${name}' registered in Brain.` }],
      };
    }

    case "mesh_get_policies": {
      const policies = db.prepare("SELECT name, rule FROM policies WHERE is_active = 1").all();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(policies, null, 2),
          },
        ],
      };
    }

    case "mesh_record_artifact": {
      const { task_id, file_path, artifact_type } = request.params.arguments as any;
      db.prepare(`
        INSERT INTO artifacts (task_id, file_path, artifact_type)
        VALUES (?, ?, ?)
      `).run(task_id, file_path, artifact_type || 'generic');
      return {
        content: [{ type: "text", text: `✅ Artifact '${file_path}' linked to task ${task_id}.` }],
      };
    }

    case "mesh_save_trajectory": {
      const { agent_id, session_id, trajectory_data } = request.params.arguments as any;
      try {
        db.prepare(`
          INSERT INTO trajectories (id, agent_id, session_id, trajectory_data)
          VALUES (?, ?, ?, ?)
        `).run(crypto.randomUUID(), agent_id, session_id, trajectory_data);
        return { content: [{ type: "text", text: "✅ Trajectory saved to Mesh Database successfully." }] };
      } catch (err: any) {
        // Table might not be active, but let's assume it is.
        if (err.message.includes('no such table')) {
          db.exec(`CREATE TABLE IF NOT EXISTS trajectories (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, session_id TEXT NOT NULL, trajectory_data TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
          db.prepare(`INSERT INTO trajectories (id, agent_id, session_id, trajectory_data) VALUES (?, ?, ?, ?)`).run(crypto.randomUUID(), agent_id, session_id, trajectory_data);
          return { content: [{ type: "text", text: "✅ Trajectory saved (table initialized on fly)." }] };
        }
        return { content: [{ type: "text", text: `❌ Trajectory save failed. ${err.message}` }] };
      }
    }

    case "mesh_load_trajectory": {
      try {
        const latest = db.prepare("SELECT * FROM trajectories ORDER BY timestamp DESC LIMIT 1").get();
        if (!latest) return { content: [{ type: "text", text: "No prior trajectories found." }] };
        return { content: [{ type: "text", text: JSON.stringify(latest, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: "❌ Database error retrieving trajectory." }] };
      }
    }

    case "mesh_delegate_task": {
      const { agent_cli, task_prompt } = request.params.arguments as any;
      
      // Guard Check: Is agent available?
      const agentRecord = db.prepare("SELECT status FROM agents WHERE id = ?").get(agent_cli.toLowerCase()) as any;
      if (agentRecord && agentRecord.status !== 'active') {
        return { 
          content: [{ 
            type: "text", 
            text: `⚠️ Execution Blocked: Agent '${agent_cli}' is currently ${agentRecord.status.toUpperCase()}. Use a different CLI or re-enable via Dashboard.` 
          }] 
        };
      }

      // Basic safeguard
      const safeCli = agent_cli.replace(/&|;/g, "");
      const command = `${safeCli} "${task_prompt.replace(/"/g, '\\"')}"`;

      return new Promise((resolve) => {
        exec(command, { timeout: 120000 }, (error, stdout, stderr) => {
          if (error) {
            resolve({ content: [{ type: "text", text: `❌ Delegation error: ${error.message}\n${stderr}` }] });
          } else {
            resolve({ content: [{ type: "text", text: `✅ Sub-Agent output:\n${stdout}` }] });
          }
        });
      });
    }

    default:
      throw new Error("Unknown tool");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Agentic Mesh MCP Server (stdio) is live and listening on stdin");
  
  // Keep the process alive even if stdin is redirected by Tilt
  setInterval(() => {}, 60000);
}

main().catch((error) => {
  console.error("致命的エラー:", error);
  process.exit(1);
});
