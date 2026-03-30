const { db, init } = require('./db');
const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');
const express = require('express');
const cors = require('cors');

// Paths (standard locations)
const CODEX_HISTORY = path.join(process.env.HOME, '.codex/history.jsonl');
const ANTIGRAVITY_BRAIN = path.join(process.env.HOME, '.gemini/antigravity/brain');
const GEMINI_LOGS = path.join(process.env.HOME, '.gemini/tmp/ubuntubox/logs.json');
const CLAUDE_TODOS = path.join(process.env.HOME, '.claude/todos');

// Initialize database
init();

// SSE Clients for real-time pulsing
let sseClients = [];
function broadcast(event, data) {
    sseClients.forEach(c => c.res.write(`data: ${JSON.stringify({ event, data })}\n\n`));
}

// Optimized Broadcast: Debounce graph updates to prevent UI flood
let updateTimeout = null;
function debouncedBroadcastUpdate() {
    if (updateTimeout) clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => {
        broadcast('graph_update', { timestamp: Date.now() });
        updateTimeout = null;
    }, 200); // 200ms grace period for multiple file writes
}

function broadcastPulse(target, action) {
    broadcast('pulse', { target, actor: target.includes('sidecar') ? target.split('-')[0] : target, action });
}

function logSkillUsage(agentId, action) {
    // Extract potential skill name from action string
    const skillMatch = action.match(/\[(\w+)\]|(\w+)\s+task|using\s+(\w+)|(\w+)\(\)/i);
    const skillName = skillMatch ? (skillMatch[1] || skillMatch[2] || skillMatch[3] || skillMatch[4]).toLowerCase() : null;
    
    if (skillName && skillName.length > 2) {
        try {
            db.prepare(`
                INSERT INTO agent_skills (agent_id, skill_name, usage_count, last_used)
                VALUES (?, ?, 1, CURRENT_TIMESTAMP)
                ON CONFLICT(agent_id, skill_name) DO UPDATE SET 
                    usage_count = usage_count + 1,
                    last_used = CURRENT_TIMESTAMP
            `).run(agentId, skillName);
            broadcast('skill_used', { agentId, skillName });
        } catch (e) {
            console.error("Skill log error:", e.message);
        }
    }
}

// Sync functions
async function syncCodex() {
    if (!fs.existsSync(CODEX_HISTORY)) return;
    const lines = (await fs.readFile(CODEX_HISTORY, 'utf8')).trim().split('\n');
    
    db.transaction(() => {
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const actionText = entry.text || entry.command || 'Unknown interaction';
                if (!actionText) continue;

                // 🛡️ INTENT EXTRACTION: Derive a goal from the first 50 chars of the command
                let goal = actionText.split('\n')[0].substring(0, 80);
                if (goal.length < 5) goal = 'Codex Command';

                db.prepare(`
                    INSERT INTO decisions (task_id, agent_id, action, outcome, rationale)
                    VALUES (?, ?, ?, ?, ?)
                `).run(
                    entry.session_id || 'global',
                    'codex',
                    actionText.substring(0, 255),
                    'info',
                    null
                );

                db.prepare(`
                    INSERT OR REPLACE INTO tasks (id, goal, status, owner_agent)
                    VALUES (?, ?, ?, ?)
                `).run(entry.session_id || 'global', goal, 'done', 'codex');
                
                logSkillUsage('codex', actionText);
            } catch (e) {}
        }
    })();
    broadcastPulse('codex', 'Codex History Synced');
    console.log(`✅ Synced ${lines.length} lines from Codex History.`);
}

async function syncAntigravity() {
    if (!fs.existsSync(ANTIGRAVITY_BRAIN)) return;
    const folders = fs.readdirSync(ANTIGRAVITY_BRAIN);
    
    for (const folder of folders) {
        try {
            const sessionPath = path.join(ANTIGRAVITY_BRAIN, folder);
            const taskPath = path.join(sessionPath, 'task.md');
            const planPath = path.join(sessionPath, 'implementation_plan.md');
            const walkPath = path.join(sessionPath, 'walkthrough.md');
            const metaPath = path.join(sessionPath, 'implementation_plan.md.metadata.json');
            
            // 1. Check if session has any real work
            const hasFiles = fs.existsSync(taskPath) || fs.existsSync(planPath) || fs.existsSync(walkPath);
            if (!hasFiles) continue;

            const stat = fs.statSync(fs.existsSync(taskPath) ? taskPath : (fs.existsSync(planPath) ? planPath : walkPath));
            const ageInDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
            
            // 2. Extract Goal
            let goal = 'Antigravity Session';
            if (fs.existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    if (meta.summary) goal = meta.summary;
                } catch (e) {}
            } else if (fs.existsSync(planPath)) {
                try {
                    const content = fs.readFileSync(planPath, 'utf8');
                    const match = content.match(/^#\s+(.*)/m);
                    if (match) goal = match[1];
                } catch (e) {}
            }

            // 3. Status Logic
            const isOld = (Date.now() - stat.mtimeMs) > (30 * 60 * 1000); // 30 min idle = done
            let status = isOld ? 'done' : 'in_progress';
            
            if (ageInDays > 7) {
                status = 'failed'; 
            }

            // Validate status against CHECK constraint
            const validStatuses = ['open', 'in_progress', 'done', 'failed'];
            if (!validStatuses.includes(status)) status = 'in_progress';

            db.prepare(`
                INSERT OR REPLACE INTO tasks (id, goal, status, owner_agent)
                VALUES (?, ?, ?, ?)
            `).run(folder, goal.substring(0, 100), status, 'antigravity');
            
            const insertArtifact = (filePath, type) => {
                if (!fs.existsSync(filePath)) return;
                const exists = db.prepare("SELECT id FROM artifacts WHERE file_path = ?").get(filePath);
                if (!exists) {
                    db.prepare(`
                        INSERT INTO artifacts (task_id, file_path, artifact_type)
                        VALUES (?, ?, ?)
                    `).run(folder, filePath, type);
                }
            };

            const isNewAction = (stat.mtimeMs > Date.now() - 5000); // Only pulse for fresh activity
            if (isNewAction) {
                broadcastPulse('antigravity', goal);
                logSkillUsage('antigravity', goal);
            }

            insertArtifact(taskPath, 'task');
            insertArtifact(planPath, 'plan');
            insertArtifact(walkPath, 'walkthrough');
        } catch (e) {
            console.error(`Error syncing Antigravity folder ${folder}:`, e.message);
        }
    }
}

async function syncGemini() {
    if (!fs.existsSync(GEMINI_LOGS)) return;
    try {
        const fileContent = await fs.readFile(GEMINI_LOGS, 'utf8');
        if (!fileContent.trim()) return;
        
        // Robust JSON Extraction: Handle truncated files during active streaming
        let logs;
        try {
            // Fast path: Whole file is valid
            logs = JSON.parse(fileContent);
        } catch (e) {
            try {
                // Rescue path: Find last complete object in the array
                const lastValidObjectEnd = fileContent.lastIndexOf('}');
                if (lastValidObjectEnd !== -1) {
                    const rescued = fileContent.substring(0, lastValidObjectEnd + 1) + ']';
                    logs = JSON.parse(rescued);
                }
            } catch (inner) {
                // If rescue fails, just skip this cycle
                return;
            }
        }
        
        if (!Array.isArray(logs)) return;

        // Process only latest entries to minimize DB pressure
        const recentLogs = logs.slice(-20); 

        db.transaction(() => {
            for (const entry of recentLogs) {
                if (entry.sessionId && entry.message) {
                    // 🛡️ INTENT EXTRACTION: Parse meaningful goal from Gemini interaction
                    const intentMatch = entry.message.match(/(Fixing|Refactoring|Building|Analyzing|Searching|Creating)\s+(\w+)/i);
                    const goal = intentMatch ? intentMatch[0] : (entry.message.length > 60 ? entry.message.substring(0, 57) + '...' : entry.message);

                    db.prepare(`
                        INSERT OR IGNORE INTO tasks (id, goal, status, owner_agent)
                        VALUES (?, ?, ?, ?)
                    `).run(entry.sessionId, goal, 'in_progress', 'gemini');

                    db.prepare(`
                        INSERT INTO decisions (task_id, agent_id, action, outcome, rationale)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(entry.sessionId, 'gemini', entry.message.substring(0, 255), 'info', null);
                    
                    broadcastPulse('gemini', entry.message);
                    logSkillUsage('gemini', entry.message);
                }
            }
        })();
    } catch (e) {
        // Silently skip to keep the bridge alive
    }
}

async function syncClaude() {
    if (!fs.existsSync(CLAUDE_TODOS)) return;
    try {
        const files = fs.readdirSync(CLAUDE_TODOS).filter(f => f.endsWith('.json'));
        if (files.length === 0) return;

        files.sort((a, b) => fs.statSync(path.join(CLAUDE_TODOS, b)).mtimeMs - fs.statSync(path.join(CLAUDE_TODOS, a)).mtimeMs);
        const latest = files[0];
        
        const content = fs.readFileSync(path.join(CLAUDE_TODOS, latest), 'utf8');
        if (content.toLowerCase().includes('rate limit')) {
            db.prepare("UPDATE agents SET status = 'rate_limited' WHERE id = 'claude'").run();
            broadcast('status_change', { agent: 'claude', status: 'rate_limited' });
        } else {
            db.prepare("UPDATE agents SET status = 'active' WHERE id = 'claude'").run();
            broadcast('status_change', { agent: 'claude', status: 'active' });
        }
    } catch (e) {
        console.error("Claude sync error:", e.message);
    }
}

// Watcher for real-time sync
function startWatcher() {
    const watchPaths = [CODEX_HISTORY, ANTIGRAVITY_BRAIN, GEMINI_LOGS, CLAUDE_TODOS].filter(p => fs.existsSync(p));
    chokidar.watch(watchPaths, { ignoreInitial: true }).on('all', (event, p) => {
        console.log(`📝 [${event}] Sync detected change in ${p}`);
        if (p.includes('.codex')) syncCodex().then(() => debouncedBroadcastUpdate());
        else if (p.includes('antigravity/brain')) syncAntigravity().then(() => debouncedBroadcastUpdate());
        else if (p.includes('gemini/tmp')) syncGemini().then(() => debouncedBroadcastUpdate());
        else if (p.includes('.claude')) syncClaude().then(() => debouncedBroadcastUpdate());
    });
}

// Initial sync
(async () => {
    try {
        await syncCodex();
        await syncAntigravity();
        await syncGemini();
        await syncClaude();
        startWatcher();
    } catch (e) {
        console.error("Startup sync failed:", e.message);
    }
})();

// ============================================
// EXPRESS API SERVER FOR SVELTE UI
// ============================================

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/graph', async (req, res) => {
    try {
        // Prune: Only fetch most recent context to keep 3D graph fluid
        const tasks = db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC LIMIT 50").all();
        const taskIds = tasks.map(t => `'${t.id}'`).join(',');
        
        // Only fetch children for the visible tasks
        const decisions = (taskIds ? db.prepare(`SELECT * FROM decisions WHERE task_id IN (${taskIds}) ORDER BY id DESC LIMIT 100`).all() : []);
        const artifacts = (taskIds ? db.prepare(`SELECT * FROM artifacts WHERE task_id IN (${taskIds})`).all() : []);
        const policies = db.prepare("SELECT * FROM policies WHERE is_active = 1 LIMIT 20").all();
        const agents = db.prepare("SELECT * FROM agents").all();
        
        const nodes = [];
        const links = [];

        // 1. Add agent nodes 
        agents.forEach(a => {
            nodes.push({ 
                id: a.id, 
                group: 'agent', 
                label: a.name, 
                status: a.status, 
                val: 15 // Sidecars are visible anchors
            });
        });

        tasks.forEach(t => {
            nodes.push({ 
                id: `task-${t.id}`, 
                group: 'task', 
                label: t.goal, 
                status: t.status, 
                agent: t.owner_agent,
                val: 18 // Slightly larger for tasks
            });
            // 2. Link tasks to their owner agent
            if (t.owner_agent) {
                links.push({ source: t.owner_agent, target: `task-${t.id}` });
            }
        });

        // Use a set to track node IDs and avoid duplicates
        const nodeIds = new Set(nodes.map(n => n.id));

        decisions.forEach(d => {
            const dId = `dec-${d.id}`;
            nodes.push({ id: dId, group: 'decision', label: d.action, outcome: d.outcome, agent: d.agent_id, val: 6 });
            links.push({ source: dId, target: `task-${d.task_id}` });
            
            // 🔗 GOURCE-LINK: Link decision to the agent that made it
            if (d.agent_id) {
                links.push({ source: d.agent_id, target: dId });
            }
        });

        artifacts.forEach(a => {
            const aId = `artifact-${a.id}`;
            const task = tasks.find(t => t.id === a.task_id);
            const taskHint = task ? `[${task.id.substring(0, 4)}]: ` : '';
            
            nodes.push({ 
                id: aId, 
                group: 'artifact', 
                label: `${taskHint}${path.basename(a.file_path)}`, 
                type: a.artifact_type, 
                path: a.file_path,
                val: 10
            });
            links.push({ source: aId, target: `task-${a.task_id}` });

            // 🔗 GOURCE-LINK: Link artifact to task owner agent if it exists
            if (task && task.owner_agent) {
                links.push({ source: task.owner_agent, target: aId });
            }
        });

        policies.forEach(p => {
            const pId = `pol-${p.id}`;
            nodes.push({ id: pId, group: 'policy', label: p.name, rule: p.rule, val: 12 });
            // Link policies to relevant tasks if possible (for now just floating nodes for context)
        });

        // 5. Add Skill/MCP nodes
        const skills = db.prepare("SELECT * FROM agent_skills ORDER BY usage_count DESC LIMIT 30").all();
        skills.forEach(s => {
            const sId = `skill-${s.agent_id}-${s.skill_name}`;
            nodes.push({ 
                id: sId, 
                group: 'skill', 
                label: s.skill_name.toUpperCase(), 
                val: 8 + (Math.log(s.usage_count) * 2) 
            });
            links.push({ source: s.agent_id, target: sId });
        });

        res.json({ nodes, links });
    } catch (e) {
        console.error("Graph generation error:", e);
        res.status(500).send("Database error: " + e.message);
    }
});

app.get('/api/tasks', (req, res) => {
    try {
        const tasks = db.prepare("SELECT * FROM tasks ORDER BY id DESC").all();
        res.json(tasks);
    } catch(e) { res.status(500).send(e.message); }
});

app.get('/api/agents', (req, res) => {
    try {
        const agents = db.prepare("SELECT * FROM agents").all();
        res.json(agents);
    } catch(e) { res.status(500).send(e.message); }
});

app.post('/api/agents/toggle', (req, res) => {
    try {
        const { id, status } = req.body;
        db.prepare("UPDATE agents SET status = ? WHERE id = ?").run(status, id);
        res.json({ success: true, newStatus: status });
    } catch(e) { res.status(500).send(e.message); }
});

app.get('/api/policies', (req, res) => {
    try {
        const policies = db.prepare("SELECT * FROM policies").all();
        res.json(policies);
    } catch(e) { res.status(500).send(e.message); }
});

app.get('/api/artifacts/:id', async (req, res) => {
    try {
        const artifact = db.prepare("SELECT * FROM artifacts WHERE id = ?").get(req.params.id);
        if (!artifact) {
            console.error(`❌ Artifact ID ${req.params.id} not found in DB`);
            return res.status(404).json({ error: "Artifact entry not found" });
        }
        
        if (!fs.existsSync(artifact.file_path)) {
            console.error(`❌ Artifact File ${artifact.file_path} missing on disk`);
            return res.status(404).json({ error: `File not found: ${path.basename(artifact.file_path)}` });
        }
        const content = await fs.readFile(artifact.file_path, 'utf8');
        res.json({ id: artifact.id, type: artifact.artifact_type, path: artifact.file_path, content });
    } catch (e) {
        console.error(`❌ Artifact Server Error:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    const client = { id: Date.now(), res };
    sseClients.push(client);
    
    req.on('close', () => {
        sseClients = sseClients.filter(c => c.id !== client.id);
    });
});

const PORT = process.env.PORT || 5189;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Mesh API Server orbiting on port ${PORT}`);
});
