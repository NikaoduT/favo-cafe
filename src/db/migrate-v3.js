/**
 * migrate-v3.js — Schema overhaul for Phase 1 update.
 *
 * Changes:
 *  - customers: add stamp_count, drop loyalty_tier/points/store_credit_cents/birthday/preferences_json
 *  - users: rebuild to update role CHECK (remove super_admin/roaster, add customer)
 *  - orders: rebuild to fix payment_method CHECK + add is_walk_in, strip unused columns
 *  - loyalty_events: rebuild to update event_type CHECK + swap points columns for stamps_delta
 *  - menu_items: drop category and other unused columns
 *  - inventory_items: update category CHECK to remove green_bean/roasted_bean
 *  - Drop tables: roast_batches, customer_credit_transactions, notifications
 *
 * Run with: node src/db/migrate-v3.js
 * Idempotent: safe to run more than once.
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
  console.error('Run "npm run seed" first.');
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = OFF');

console.log(`Migrating (v3): ${dbPath}\n`);

// ── Helper: add column silently if missing ────────────────────────────────────
const hasColumn = (table, col) =>
  db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === col);

const addColumn = (table, col, def) => {
  if (!hasColumn(table, col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    console.log(`  + ${table}.${col}`);
  }
};

const dropColumn = (table, col) => {
  if (hasColumn(table, col)) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${col}`);
    console.log(`  - ${table}.${col}`);
  }
};

const hasTable = (name) =>
  !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name);

// ── Step 1: customers ─────────────────────────────────────────────────────────
console.log('Step 1: customers table…');

addColumn('customers', 'stamp_count', 'INTEGER NOT NULL DEFAULT 0');

// Copy points → stamp_count if stamp_count is still 0 and points exists
if (hasColumn('customers', 'points')) {
  db.exec('UPDATE customers SET stamp_count = points WHERE stamp_count = 0 AND points > 0');
  console.log('  ✓ points values copied to stamp_count');
}

dropColumn('customers', 'loyalty_tier');
dropColumn('customers', 'points');
dropColumn('customers', 'store_credit_cents');
dropColumn('customers', 'birthday');
dropColumn('customers', 'preferences_json');

console.log('  ✓ customers done\n');

// ── Step 2: users — rebuild to fix role CHECK ─────────────────────────────────
console.log('Step 2: users table — rebuilding role CHECK…');

const userCols = db.prepare('PRAGMA table_info(users)').all().map(r => r.name);

if (!userCols.includes('_v3_migrated')) {
  db.exec('BEGIN');
  try {
    db.exec('ALTER TABLE users RENAME TO users_old');

    db.exec(`
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        email         TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        first_name    TEXT    NOT NULL,
        last_name     TEXT    NOT NULL,
        role          TEXT    NOT NULL CHECK(role IN ('admin','barista','customer')),
        active        INTEGER NOT NULL DEFAULT 1,
        location_id   INTEGER REFERENCES locations(id) DEFAULT 1,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Map super_admin → admin, roaster → admin (safest default)
    db.exec(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, role, active, location_id, created_at)
      SELECT
        id, email, password_hash, first_name, last_name,
        CASE
          WHEN role IN ('super_admin','roaster') THEN 'admin'
          ELSE role
        END,
        active,
        COALESCE(location_id, 1),
        created_at
      FROM users_old
    `);

    db.exec('DROP TABLE users_old');
    db.exec('COMMIT');
    console.log('  ✓ users rebuilt\n');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
} else {
  console.log('  — users already at v3, skipping\n');
}

// ── Step 3: orders — rebuild to fix CHECK + add is_walk_in ───────────────────
console.log('Step 3: orders table — rebuilding…');

const orderCols = db.prepare('PRAGMA table_info(orders)').all().map(r => r.name);

if (!orderCols.includes('is_walk_in')) {
  db.exec('BEGIN');
  try {
    db.exec('ALTER TABLE orders RENAME TO orders_old');

    db.exec(`
      CREATE TABLE orders (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id      INTEGER REFERENCES customers(id),
        barista_id       INTEGER REFERENCES users(id),
        subtotal_cents   INTEGER NOT NULL DEFAULT 0,
        discount_cents   INTEGER NOT NULL DEFAULT 0,
        total_cents      INTEGER NOT NULL DEFAULT 0,
        payment_method   TEXT    NOT NULL
                           CHECK(payment_method IN ('cash','card','mixed','free_coffee')),
        status           TEXT    NOT NULL DEFAULT 'completed'
                           CHECK(status IN ('pending','completed','voided','cancelled')),
        is_walk_in       INTEGER NOT NULL DEFAULT 0,
        channel          TEXT    NOT NULL DEFAULT 'in_store',
        pickup_at        TEXT,
        collected_at     TEXT,
        location_id      INTEGER REFERENCES locations(id) DEFAULT 1,
        shift_id         INTEGER REFERENCES shifts(id),
        created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      INSERT INTO orders
        (id, customer_id, barista_id, subtotal_cents, discount_cents,
         total_cents, payment_method, status, channel, pickup_at,
         collected_at, location_id, shift_id, created_at)
      SELECT
        id, customer_id, barista_id, subtotal_cents, discount_cents,
        total_cents,
        CASE payment_method
          WHEN 'loyalty_points' THEN 'cash'
          ELSE payment_method
        END,
        CASE status
          WHEN 'pending_payment' THEN 'pending'
          WHEN 'paid'            THEN 'completed'
          WHEN 'preparing'       THEN 'completed'
          WHEN 'ready'           THEN 'completed'
          WHEN 'collected'       THEN 'completed'
          WHEN 'refunded'        THEN 'voided'
          ELSE status
        END,
        COALESCE(channel, 'in_store'),
        pickup_at,
        collected_at,
        COALESCE(location_id, 1),
        shift_id,
        created_at
      FROM orders_old
    `);

    db.exec('DROP TABLE orders_old');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);
    `);

    db.exec('COMMIT');
    console.log('  ✓ orders rebuilt\n');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
} else {
  console.log('  — orders already has is_walk_in, skipping\n');
}

// ── Step 4: loyalty_events — rebuild to fix event_type CHECK ─────────────────
console.log('Step 4: loyalty_events table — rebuilding…');

const loyaltyColNames = db.prepare('PRAGMA table_info(loyalty_events)').all().map(r => r.name);

if (!loyaltyColNames.includes('stamps_delta')) {
  db.exec('BEGIN');
  try {
    db.exec('ALTER TABLE loyalty_events RENAME TO loyalty_events_old');

    db.exec(`
      CREATE TABLE loyalty_events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id  INTEGER NOT NULL REFERENCES customers(id),
        order_id     INTEGER REFERENCES orders(id),
        event_type   TEXT    NOT NULL
                       CHECK(event_type IN ('earn','redeem','manual_adjust')),
        stamps_delta INTEGER NOT NULL DEFAULT 1,
        stamp_count  INTEGER NOT NULL DEFAULT 0,
        note         TEXT,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      INSERT INTO loyalty_events
        (id, customer_id, order_id, event_type, stamps_delta, stamp_count, note, created_at)
      SELECT
        id, customer_id, order_id,
        CASE event_type
          WHEN 'stamp_redeem_available' THEN 'redeem'
          WHEN 'birthday_redeem'        THEN 'redeem'
          WHEN 'tier_upgrade'           THEN 'manual_adjust'
          WHEN 'earn'                   THEN 'earn'
          WHEN 'redeem'                 THEN 'redeem'
          ELSE 'manual_adjust'
        END,
        COALESCE(ABS(points_delta), 1),
        COALESCE(stamp_count, 0),
        note,
        created_at
      FROM loyalty_events_old
    `);

    db.exec('DROP TABLE loyalty_events_old');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_events(customer_id);
    `);

    db.exec('COMMIT');
    console.log('  ✓ loyalty_events rebuilt\n');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
} else {
  console.log('  — loyalty_events already has stamps_delta, skipping\n');
}

// ── Step 5: menu_items — drop unused columns ──────────────────────────────────
console.log('Step 5: menu_items — dropping unused columns…');

['category','prep_seconds','allergens_json','dietary_json','caffeine_level','origin','tasting_notes']
  .forEach(col => dropColumn('menu_items', col));

console.log('  ✓ menu_items done\n');

// ── Step 6: inventory_items — rebuild to fix category CHECK ──────────────────
console.log('Step 6: inventory_items — rebuilding category CHECK…');

const invCols = db.prepare('PRAGMA table_info(inventory_items)').all().map(r => r.name);
// Check if category CHECK needs updating by looking for green_bean entries
const greenBeanExists = db.prepare(
  "SELECT COUNT(*) AS n FROM inventory_items WHERE category = 'green_bean'"
).get().n;

if (greenBeanExists > 0 || !invCols.includes('_v3')) {
  db.exec('BEGIN');
  try {
    db.exec('ALTER TABLE inventory_items RENAME TO inventory_items_old');

    db.exec(`
      CREATE TABLE inventory_items (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        name                TEXT    NOT NULL,
        category            TEXT    NOT NULL
                              CHECK(category IN ('milk','syrup','food_ingredient','packaging','equipment','other')),
        unit                TEXT    NOT NULL,
        quantity            REAL    NOT NULL DEFAULT 0,
        reorder_level       REAL    NOT NULL DEFAULT 0,
        cost_per_unit_cents INTEGER          DEFAULT 0,
        supplier            TEXT,
        location_id         INTEGER REFERENCES locations(id) DEFAULT 1,
        updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      INSERT INTO inventory_items
        (id, name, category, unit, quantity, reorder_level, cost_per_unit_cents, supplier, location_id, updated_at)
      SELECT
        id, name,
        CASE category
          WHEN 'green_bean'   THEN 'other'
          WHEN 'roasted_bean' THEN 'other'
          ELSE category
        END,
        unit, quantity, reorder_level,
        COALESCE(cost_per_unit_cents, 0),
        supplier,
        COALESCE(location_id, 1),
        updated_at
      FROM inventory_items_old
    `);

    db.exec('DROP TABLE inventory_items_old');
    db.exec('COMMIT');
    console.log('  ✓ inventory_items rebuilt\n');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
} else {
  console.log('  — inventory_items category CHECK already clean, skipping\n');
}

// ── Step 7: drop obsolete tables ─────────────────────────────────────────────
console.log('Step 7: dropping obsolete tables…');

['roast_batches','customer_credit_transactions','notifications'].forEach(t => {
  if (hasTable(t)) {
    db.exec(`DROP TABLE ${t}`);
    console.log(`  - ${t} dropped`);
  }
});

console.log('  ✓ done\n');

// ── Step 8: rebuild FK-dependent tables to restore correct references ─────────
// SQLite auto-updates REFERENCES clauses when a table is renamed, so any table
// rebuilt via RENAME → CREATE → INSERT → DROP must have its dependents rebuilt
// afterwards to point back at the new (correctly named) table.
console.log('Step 8: rebuilding FK-dependent tables…');

const rebuildTable = (name, createSql, copySql) => {
  db.exec('BEGIN');
  try {
    db.exec(`ALTER TABLE ${name} RENAME TO ${name}_dep_old`);
    db.exec(createSql);
    db.exec(copySql);
    db.exec(`DROP TABLE ${name}_dep_old`);
    db.exec('COMMIT');
    console.log(`  ✓ ${name} rebuilt`);
  } catch (err) {
    db.exec('ROLLBACK');
    // Already clean — skip
    console.log(`  — ${name} skipped (${err.message.split('\n')[0]})`);
  }
};

rebuildTable(
  'recipe_ingredients',
  `CREATE TABLE recipe_ingredients (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id         INTEGER NOT NULL REFERENCES recipes(id),
    inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
    quantity          REAL    NOT NULL,
    unit              TEXT    NOT NULL,
    modifier_id       INTEGER REFERENCES modifiers(id),
    is_substitute     INTEGER NOT NULL DEFAULT 0
  )`,
  'INSERT INTO recipe_ingredients SELECT * FROM recipe_ingredients_dep_old'
);

rebuildTable(
  'order_items',
  `CREATE TABLE order_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL REFERENCES orders(id),
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    quantity     INTEGER NOT NULL DEFAULT 1,
    price_cents  INTEGER NOT NULL,
    notes        TEXT
  )`,
  'INSERT INTO order_items SELECT * FROM order_items_dep_old'
);

rebuildTable(
  'order_item_modifiers',
  `CREATE TABLE order_item_modifiers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    order_item_id     INTEGER NOT NULL REFERENCES order_items(id),
    modifier_id       INTEGER NOT NULL REFERENCES modifiers(id),
    price_delta_cents INTEGER NOT NULL
  )`,
  'INSERT INTO order_item_modifiers SELECT * FROM order_item_modifiers_dep_old'
);

rebuildTable(
  'shifts',
  `CREATE TABLE shifts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    location_id  INTEGER NOT NULL REFERENCES locations(id),
    clock_in_at  TEXT    NOT NULL,
    clock_out_at TEXT,
    notes        TEXT
  )`,
  'INSERT INTO shifts SELECT * FROM shifts_dep_old'
);

console.log('  ✓ done\n');

// ── Finish ────────────────────────────────────────────────────────────────────
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.exec('PRAGMA foreign_keys = ON');
db.close();

console.log('✅ Migration v3 complete');
