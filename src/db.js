const Database = require('better-sqlite3');
const fs = require('fs-extra');
const path = require('path');

const DB_PATH = path.join(__dirname, '../mesh_brain.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);

function init() {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    console.log('✅ Agentic Mesh Brain Initialized.');
}

module.exports = { db, init };
