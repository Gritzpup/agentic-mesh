-- Agentic Mesh Shared Brain Schema

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    goal TEXT NOT NULL,
    status TEXT CHECK(status IN ('open', 'in_progress', 'done', 'failed')) DEFAULT 'open',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    owner_agent TEXT
);

CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL,
    outcome TEXT,
    rationale TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    artifact_type TEXT, -- 'plan', 'task', 'walkthrough', 'diff'
    last_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    rule TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    approved_by_user BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trajectories (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    trajectory_data TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active' -- 'active', 'rate_limited', 'disabled'
);

INSERT OR IGNORE INTO agents (id, name, status) VALUES 
  ('claude', 'Claude Code', 'active'),
  ('openai', 'OpenAI CLI', 'active'),
  ('gemini', 'Gemini CLI', 'active'),
  ('antigravity', 'Antigravity', 'active'),
  ('codex', 'Codex', 'active');
