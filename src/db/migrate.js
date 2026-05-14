/**
 * migrate.js — Safe Phase 6 migration for existing Favo Cafe database.
 *
 * Idempotent: safe to run multiple times.
 * - All new tables use CREATE TABLE IF NOT EXISTS.
 * - All ALTER TABLE ADD COLUMN statements are wrapped in try/catch.
 *   node:sqlite throws if the column already exists; we treat that as a no-op.
 * - The orders table is rebuilt to extend its status CHECK constraint.
 *
 * Run with: npm run migrate
 *           node src/db/migrate.js
 */

require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, 'favo.db');

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at: ${dbPath}`);
  console.error('Run "npm run seed" first to create and populate the database.');
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = OFF'); // Disable FK checks during structural changes

console.log(`Migrating: ${dbPath}\n`);

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Adds a column to a table. No-ops silently if the column already exists.
 * @param {string} table
 * @param {string} column
 * @param {string} definition - e.g. "TEXT DEFAULT NULL"
 */
const addColumn = (table, column, definition) => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`  + ${table}.${column}`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) throw err;
    // Column exists — silent no-op
  }
};

// ── Step 1: New tables ────────────────────────────────────────────────────────
console.log('Step 1: Creating new tables…');

db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    NOT NULL,
    address            TEXT,
    phone              TEXT,
    opening_hours_json TEXT,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS modifier_groups (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT    NOT NULL,
    selection_type TEXT    NOT NULL,
    required       INTEGER NOT NULL DEFAULT 0,
    display_order  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS modifiers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id          INTEGER NOT NULL REFERENCES modifier_groups(id),
    name              TEXT    NOT NULL,
    price_delta_cents INTEGER NOT NULL DEFAULT 0,
    is_default        INTEGER NOT NULL DEFAULT 0,
    display_order     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
    menu_item_id      INTEGER NOT NULL REFERENCES menu_items(id),
    modifier_group_id INTEGER NOT NULL REFERENCES modifier_groups(id),
    PRIMARY KEY (menu_item_id, modifier_group_id)
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    notes        TEXT
  );

  CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id         INTEGER NOT NULL REFERENCES recipes(id),
    inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
    quantity          REAL    NOT NULL,
    unit              TEXT    NOT NULL,
    modifier_id       INTEGER REFERENCES modifiers(id),
    is_substitute     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS customer_credit_transactions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id        INTEGER NOT NULL REFERENCES customers(id),
    amount_cents       INTEGER NOT NULL,
    reason             TEXT    NOT NULL,
    reference_order_id INTEGER REFERENCES orders(id),
    admin_user_id      INTEGER REFERENCES users(id),
    notes              TEXT,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    location_id  INTEGER NOT NULL REFERENCES locations(id),
    clock_in_at  TEXT    NOT NULL,
    clock_out_at TEXT,
    notes        TEXT
  );

  CREATE TABLE IF NOT EXISTS order_item_modifiers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    order_item_id     INTEGER NOT NULL REFERENCES order_items(id),
    modifier_id       INTEGER NOT NULL REFERENCES modifiers(id),
    price_delta_cents INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id         INTEGER REFERENCES customers(id),
    channel             TEXT    NOT NULL,
    template            TEXT    NOT NULL,
    reference_type      TEXT,
    reference_id        INTEGER,
    status              TEXT    NOT NULL,
    provider_message_id TEXT,
    error               TEXT,
    sent_at             TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_shifts_user            ON shifts(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_customer ON notifications(customer_id);
  CREATE INDEX IF NOT EXISTS idx_recipe_menu            ON recipes(menu_item_id);
`);

console.log('  ✓ New tables created\n');

// ── Step 2: Rebuild orders table to extend status CHECK ───────────────────────
// SQLite does not support ALTER TABLE … MODIFY CONSTRAINT.
// We rename → recreate → copy → drop → index.
console.log('Step 2: Extending orders.status CHECK constraint…');

const ordersCols = db.prepare('PRAGMA table_info(orders)').all().map(r => r.name);

if (!ordersCols.includes('channel')) {
  db.exec('BEGIN');
  try {
    db.exec('ALTER TABLE orders RENAME TO orders_v1');

    db.exec(`
      CREATE TABLE orders (
        id                         INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id                INTEGER REFERENCES customers(id),
        barista_id                 INTEGER REFERENCES users(id),
        subtotal_cents             INTEGER NOT NULL DEFAULT 0,
        discount_cents             INTEGER NOT NULL DEFAULT 0,
        total_cents                INTEGER NOT NULL DEFAULT 0,
        payment_method             TEXT    NOT NULL
                                     CHECK(payment_method IN ('cash','card','loyalty_points','mixed')),
        status                     TEXT    NOT NULL DEFAULT 'completed'
                                     CHECK(status IN (
                                       'pending','completed','voided',
                                       'pending_payment','paid','preparing',
                                       'ready','collected','cancelled','refunded'
                                     )),
        created_at                 TEXT    NOT NULL DEFAULT (datetime('now')),
        location_id                INTEGER REFERENCES locations(id) DEFAULT 1,
        channel                    TEXT    NOT NULL DEFAULT 'in_store',
        pickup_at                  TEXT,
        ready_at                   TEXT,
        collected_at               TEXT,
        payment_provider           TEXT,
        payment_reference          TEXT,
        shift_id                   INTEGER REFERENCES shifts(id),
        store_credit_applied_cents INTEGER NOT NULL DEFAULT 0,
        vat_cents                  INTEGER NOT NULL DEFAULT 0,
        vat_rate                   REAL    NOT NULL DEFAULT 0
      )
    `);

    db.exec(`
      INSERT INTO orders (
        id, customer_id, barista_id, subtotal_cents, discount_cents,
        total_cents, payment_method, status, created_at
      )
      SELECT
        id, customer_id, barista_id, subtotal_cents, discount_cents,
        total_cents, payment_method, status, created_at
      FROM orders_v1
    `);

    db.exec('DROP TABLE orders_v1');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);
    `);

    db.exec('COMMIT');
    console.log('  ✓ orders table rebuilt\n');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
} else {
  console.log('  — orders already migrated, skipping\n');
}

// ── Step 3: Add columns to existing tables ────────────────────────────────────
console.log('Step 3: Adding columns to existing tables…');

// customers
addColumn('customers', 'birthday',           'TEXT');
addColumn('customers', 'preferences_json',   'TEXT');
addColumn('customers', 'store_credit_cents', 'INTEGER NOT NULL DEFAULT 0');
addColumn('customers', 'marketing_opt_in',   'INTEGER NOT NULL DEFAULT 0');
addColumn('customers', 'whatsapp_opt_in',    'INTEGER NOT NULL DEFAULT 1');

// menu_items
addColumn('menu_items', 'prep_seconds',   'INTEGER NOT NULL DEFAULT 90');
addColumn('menu_items', 'allergens_json', 'TEXT');
addColumn('menu_items', 'dietary_json',   'TEXT');
addColumn('menu_items', 'caffeine_level', 'TEXT');
addColumn('menu_items', 'origin',         'TEXT');
addColumn('menu_items', 'tasting_notes',  'TEXT');

// inventory_items
addColumn('inventory_items', 'location_id', 'INTEGER DEFAULT 1');

// users
addColumn('users', 'location_id', 'INTEGER DEFAULT 1');
addColumn('users', 'pin_hash',    'TEXT');

// loyalty_events
addColumn('loyalty_events', 'stamp_count', 'INTEGER NOT NULL DEFAULT 0');

console.log('  ✓ Column additions complete\n');

// ── Step 4: Seed default location ─────────────────────────────────────────────
console.log('Step 4: Seeding default location…');

const { n: locCount } = db.prepare('SELECT COUNT(*) AS n FROM locations').get();

if (locCount === 0) {
  db.prepare(`
    INSERT INTO locations (name, address, phone, opening_hours_json)
    VALUES (?, ?, ?, ?)
  `).run(
    'Favo Main',
    '1 Main Road, Cape Town, 8001',
    '+27 21 000 0000',
    JSON.stringify({
      mon: { open: '07:00', close: '17:00', cutoff_min: 30 },
      tue: { open: '07:00', close: '17:00', cutoff_min: 30 },
      wed: { open: '07:00', close: '17:00', cutoff_min: 30 },
      thu: { open: '07:00', close: '17:00', cutoff_min: 30 },
      fri: { open: '07:00', close: '17:00', cutoff_min: 30 },
      sat: { open: '08:00', close: '14:00', cutoff_min: 30 },
      sun: { open: null,    close: null,    cutoff_min: 0  }
    })
  );
  console.log('  ✓ Default location inserted (id = 1)\n');
} else {
  console.log(`  — ${locCount} location(s) already exist, skipping\n`);
}

// ── Done ──────────────────────────────────────────────────────────────────────
db.exec('PRAGMA foreign_keys = ON');
db.close();

console.log('Migration complete ✓');
