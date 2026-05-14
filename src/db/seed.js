/**
 * seed.js — Populates the Turso database with real Favo Cafe data.
 * Run with: node src/db/seed.js
 *
 * Logins:
 *   matthew@hofmi.net   PIN: 000001  (admin)
 *   louis@hofmi.net     PIN: 000002  (barista)
 *   nkuleko@hofmi.net   PIN: 000003  (barista)
 *   thandeka@hofmi.net  PIN: 000004  (barista)
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { get, run, all, exec, initSchema } = require('./database');
const menuData     = require('../../data/menu.json');
const modifierData = require('../../data/modifier-groups.json');
const locationData = require('../../data/locations.json');

const SALT_ROUNDS = 10;

async function seed() {
  console.log('Seeding Favo Cafe database…\n');

  // Drop all tables and recreate fresh from schema
  const dropOrder = [
    'recipe_ingredients','recipes','menu_item_modifier_groups',
    'order_item_modifiers','modifiers','modifier_groups',
    'loyalty_events','order_items','orders','inventory_items',
    'menu_items','customers','shifts','users','locations'
  ];
  for (const t of dropOrder) {
    await run(`DROP TABLE IF EXISTS ${t}`);
  }
  console.log('  ✓ Old tables dropped');

  // Recreate schema
  await initSchema();
  console.log('  ✓ Schema created');

  // ── Location ─────────────────────────────────────────────────────────────
  const loc = locationData.locations[0];
  await run(
    'INSERT INTO locations (id, name, address, phone, opening_hours_json) VALUES (?, ?, ?, ?, ?)',
    [loc.id, loc.name, loc.address, loc.phone, JSON.stringify(loc.openingHours)]
  );
  console.log(`  ✓ Location: ${loc.name}`);

  // ── Users ─────────────────────────────────────────────────────────────────
  const [h1, h2, h3, h4] = await Promise.all([
    bcrypt.hash('000001', SALT_ROUNDS),
    bcrypt.hash('000002', SALT_ROUNDS),
    bcrypt.hash('000003', SALT_ROUNDS),
    bcrypt.hash('000004', SALT_ROUNDS),
  ]);

  const users = [
    ['matthew@hofmi.net',  h1, 'Matthew', '',                   'admin'  ],
    ['louis@hofmi.net',    h2, 'Louis',   'van der Westhuizen', 'barista'],
    ['nkuleko@hofmi.net',  h3, 'Nkuleko', 'Ncgobo',             'barista'],
    ['thandeka@hofmi.net', h4, 'Thandeka','Mathibela',          'barista'],
  ];
  for (const [email, hash, first, last, role] of users) {
    await run(
      'INSERT INTO users (email, password_hash, first_name, last_name, role, location_id) VALUES (?, ?, ?, ?, ?, 1)',
      [email, hash, first, last, role]
    );
  }
  console.log(`  ✓ ${users.length} users seeded`);

  // ── Menu items ────────────────────────────────────────────────────────────
  for (const item of menuData.menu) {
    await run(
      'INSERT INTO menu_items (name, description, price_cents, available) VALUES (?, ?, ?, ?)',
      [item.name, item.description ?? null, item.price_cents, item.available ? 1 : 0]
    );
  }
  console.log(`  ✓ ${menuData.menu.length} menu items seeded`);

  // ── Inventory items ───────────────────────────────────────────────────────
  const inventory = [
    ['Full Cream Milk',      'milk',            'litre',  20, 5, 'Local supplier'],
    ['Oat Milk',             'milk',            'litre',  10, 3, 'Local supplier'],
    ['Almond Milk',          'milk',            'litre',   8, 2, 'Local supplier'],
    ['Espresso Beans',       'food_ingredient', 'kg',      5, 1, 'Local supplier'],
    ['Hot Chocolate Powder', 'food_ingredient', 'kg',      3, 1, 'Local supplier'],
    ['Chai Concentrate',     'food_ingredient', 'bottle',  4, 1, 'Local supplier'],
    ['8oz Takeaway Cups',    'packaging',       'sleeve', 10, 3, 'Local supplier'],
  ];
  for (const [name, cat, unit, qty, reorder, supplier] of inventory) {
    await run(
      'INSERT INTO inventory_items (name, category, unit, quantity, reorder_level, supplier, location_id) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [name, cat, unit, qty, reorder, supplier]
    );
  }
  console.log(`  ✓ ${inventory.length} inventory items seeded`);

  // ── Modifier groups ───────────────────────────────────────────────────────
  let totalMods = 0;
  for (const group of modifierData.modifierGroups) {
    await run(
      'INSERT INTO modifier_groups (id, name, selection_type, required, display_order) VALUES (?, ?, ?, ?, ?)',
      [group.id, group.name, group.selectionType, group.required ? 1 : 0, group.displayOrder]
    );
    for (const mod of group.modifiers) {
      await run(
        'INSERT INTO modifiers (id, group_id, name, price_delta_cents, is_default, display_order) VALUES (?, ?, ?, ?, ?, ?)',
        [mod.id, group.id, mod.name, mod.priceDeltaCents, mod.isDefault ? 1 : 0, mod.displayOrder]
      );
      totalMods++;
    }
  }
  console.log(`  ✓ ${modifierData.modifierGroups.length} modifier groups, ${totalMods} modifiers`);

  // ── Link modifiers to drinks ──────────────────────────────────────────────
  const drinks = await all('SELECT id, name FROM menu_items');
  for (const item of drinks) {
    if (item.name !== 'Americano') {
      await run(
        'INSERT OR IGNORE INTO menu_item_modifier_groups (menu_item_id, modifier_group_id) VALUES (?, 1)',
        [item.id]
      );
    }
    await run(
      'INSERT OR IGNORE INTO menu_item_modifier_groups (menu_item_id, modifier_group_id) VALUES (?, 2)',
      [item.id]
    );
  }
  console.log(`  ✓ Modifiers linked to ${drinks.length} drinks`);

  // ── Sample customers ──────────────────────────────────────────────────────
  const customers = [
    ['Thabo',   'Molefe',      'thabo.molefe@gmail.com',   '072 811 2233', 7],
    ['Priya',   'Naidoo',      'priya.naidoo@gmail.com',   '083 444 5566', 3],
    ['Sifiso',  'Dlamini',     'sifiso.d@outlook.com',     '064 777 1234', 1],
    ['Lerato',  'Sithole',     'lerato.sithole@gmail.com', '071 234 8899', 5],
    ['Nomvula', 'Khumalo',     'nomvula.k@gmail.com',      '079 555 2277', 8],
    ['Aisha',   'Patel',       'aisha.patel@gmail.com',    '073 888 3344', 4],
  ];
  for (const [first, last, email, phone, stamps] of customers) {
    await run(
      'INSERT INTO customers (first_name, last_name, email, phone, stamp_count) VALUES (?, ?, ?, ?, ?)',
      [first, last, email, phone, stamps]
    );
  }
  console.log(`  ✓ ${customers.length} sample customers seeded`);

  console.log('\n✅ Seed complete');
  console.log('\n  ── Staff logins ──────────────────────────────────');
  console.log('  matthew@hofmi.net   PIN: 000001  (admin)');
  console.log('  louis@hofmi.net     PIN: 000002  (barista)');
  console.log('  nkuleko@hofmi.net   PIN: 000003  (barista)');
  console.log('  thandeka@hofmi.net  PIN: 000004  (barista)');
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
