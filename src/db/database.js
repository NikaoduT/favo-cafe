/**
 * database.js — Turso (libsql) client wrapper.
 * Keeps the same get / all / run / transaction interface as the old SQLite version.
 * All functions are now async — callers must await them.
 *
 * Local dev: set TURSO_DATABASE_URL=file:./src/db/favo.db (uses local SQLite file via libsql)
 * Production: set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN from the Turso dashboard.
 */

const { createClient } = require('@libsql/client');
const path = require('path');
const fs   = require('fs');
require('dotenv').config();

let client;

const getClient = () => {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL || 'file:./src/db/favo.db';

  // For local file URLs ensure the directory exists
  if (url.startsWith('file:')) {
    const filePath = url.replace('file:', '');
    const dir = path.dirname(path.resolve(filePath));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  return client;
};

/**
 * Run a SELECT and return all rows.
 * @param {string} sql
 * @param {Array}  params
 * @returns {Promise<Array>}
 */
const normRow = (r) => { if (!r) return r; const o = {}; for (const [k,v] of Object.entries(r)) o[k] = typeof v === 'bigint' ? Number(v) : v; return o; };
const all = async (sql, params = []) => {
      return result.rows.map(normRow);
  

/**
 * Run a SELECT and return the first row (or null).
 * @param {string} sql
 * @param {Array}  params
 * @returns {Promise<object|null>}
 */
const get = async (sql, params = []) => {
  const result = await getClient().execute({ sql, args: params });
      return result.rows[0] ? normRow(result.rows[0]) : null;
};

/**
 * Run an INSERT / UPDATE / DELETE.
 * @param {string} sql
 * @param {Array}  params
 * @returns {Promise<{ lastInsertRowid: number|bigint, changes: number }>}
 */
const run = async (sql, params = []) => {
  const result = await getClient().execute({ sql, args: params });
  return {
        lastInsertRowid: result.lastInsertRowid !== undefined ? Number(result.lastInsertRowid) : undefined,
    changes:         result.rowsAffected,
  };
};

/**
 * Execute multiple statements as a batch (replaces db.exec for schema init).
 * @param {string} sql - semicolon-separated SQL statements
 */
const exec = async (sql) => {
  // Strip single-line comments before splitting so comment blocks
  // don't accidentally become the "start" of a statement chunk
  const stripped = sql.replace(/--[^\n]*/g, '');
  const statements = stripped
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !/^pragma/i.test(s));
  for (const stmt of statements) {
    await getClient().execute(stmt);
  }
};

/**
 * Run a set of statements as an atomic batch transaction.
 * @param {Function} fn - async function receiving no arguments; must return statements array OR just do awaits
 * @returns {Promise<any>}
 */
const transaction = async (fn) => {
  const tx = await getClient().transaction('write');
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
};

/**
 * Initialise the schema on a fresh database.
 * Called by seed.js and the startup check in server.js.
 */
const initSchema = async () => {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await exec(schema);
  console.log('Database schema initialised.');
};

// Legacy compat — some files call getDb() to get the raw client
const getDb = () => getClient();

module.exports = { getDb, getClient, all, get, run, exec, transaction, initSchema };
