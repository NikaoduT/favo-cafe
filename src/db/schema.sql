-- Favo Cafe — SQLite Schema (v3 — Phase 1 overhaul)
-- All monetary values stored in cents (integer).
-- Roles: admin | barista | customer
-- Loyalty: simple stamp card — 9 stamps → 10th drink free. No tiers, no points.

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ── Locations ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL,
  address             TEXT,
  phone               TEXT,
  opening_hours_json  TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Users (staff accounts) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  first_name    TEXT    NOT NULL,
  last_name     TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK(role IN ('admin','barista','customer')),
  active        INTEGER NOT NULL DEFAULT 1,
  location_id   INTEGER REFERENCES locations(id) DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Customers (loyalty members) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name        TEXT    NOT NULL,
  last_name         TEXT    NOT NULL,
  email             TEXT    UNIQUE,
  phone             TEXT,
  password_hash     TEXT,
  stamp_count       INTEGER NOT NULL DEFAULT 0,   -- current card progress (0–9)
  total_spent_cents INTEGER NOT NULL DEFAULT 0,   -- lifetime spend for reporting
  joined_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  notes             TEXT,
  marketing_opt_in  INTEGER NOT NULL DEFAULT 0,
  whatsapp_opt_in   INTEGER NOT NULL DEFAULT 1
);

-- ── Menu Items ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  available   INTEGER NOT NULL DEFAULT 1,
  image_url   TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Modifier system ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modifier_groups (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  selection_type TEXT    NOT NULL,   -- 'single' | 'multiple'
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

-- ── Inventory Items ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
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
);

-- ── Recipes ───────────────────────────────────────────────────────────────────
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

-- ── Shifts ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  location_id  INTEGER NOT NULL REFERENCES locations(id),
  clock_in_at  TEXT    NOT NULL,
  clock_out_at TEXT,
  notes        TEXT
);

-- ── Orders ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
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
  channel          TEXT    NOT NULL DEFAULT 'in_store',  -- 'in_store' | 'online'
  pickup_at        TEXT,
  collected_at     TEXT,
  location_id      INTEGER REFERENCES locations(id) DEFAULT 1,
  shift_id         INTEGER REFERENCES shifts(id),
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Order Items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id),
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  quantity     INTEGER NOT NULL DEFAULT 1,
  price_cents  INTEGER NOT NULL,
  notes        TEXT
);

-- ── Order Modifier line items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id     INTEGER NOT NULL REFERENCES order_items(id),
  modifier_id       INTEGER NOT NULL REFERENCES modifiers(id),
  price_delta_cents INTEGER NOT NULL
);

-- ── Loyalty Events (stamp audit trail) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  order_id      INTEGER REFERENCES orders(id),
  event_type    TEXT    NOT NULL
                  CHECK(event_type IN ('earn','redeem','manual_adjust')),
  stamps_delta  INTEGER NOT NULL DEFAULT 1,   -- stamps added (+) or removed (-)
  stamp_count   INTEGER NOT NULL DEFAULT 0,   -- snapshot after this event
  note          TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_email   ON customers(email);
CREATE INDEX IF NOT EXISTS idx_orders_customer   ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_customer  ON loyalty_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_shifts_user       ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_menu       ON recipes(menu_item_id);
