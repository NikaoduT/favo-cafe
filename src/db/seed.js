/**
 * seed.js — Populates the database with real Favo Cafe data.
 * Run with: npm run seed
 * WARNING: Clears and repopulates all seeded tables.
 *
 * ╔═══════════════════════════════════════════════════════╗
 * ║  STAFF LOGIN CREDENTIALS — keep this file out of git ║
 * ║                                                       ║
 * ║  matthew@hofmi.net   PIN: 000001  (admin)            ║
 * ║  louis@hofmi.net     PIN: 000002  (barista)          ║
 * ║  nkuleko@hofmi.net   PIN: 000003  (barista)          ║
 * ║  thandeka@hofmi.net  PIN: 000004  (barista)          ║
 * ║                                                       ║
 * ║  Change all PINs after first login.                  ║
 * ╚═══════════════════════════════════════════════════════╝
 */

require('dotenv').config();
const bcrypt       = require('bcryptjs');
const { getDb }    = require('./database');
const menuData     = require('../../data/menu.json');
const modifierData = require('../../data/modifier-groups.json');
const locationData = require('../../data/locations.json');

const SALT_ROUNDS = 10;

async function seed() {
  const db = getDb();
  console.log('Seeding Favo Cafe database…\n');

  // ── Clear in dependency order ──────────────────────────────────────────────
  db.exec(`
    DELETE FROM recipe_ingredients;
    DELETE FROM recipes;
    DELETE FROM menu_item_modifier_groups;
    DELETE FROM modifiers;
    DELETE FROM modifier_groups;
    DELETE FROM loyalty_events;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM inventory_items;
    DELETE FROM menu_items;
    DELETE FROM customers;
    DELETE FROM shifts;
    DELETE FROM users;
    DELETE FROM locations;
  `);

  // ── Location ───────────────────────────────────────────────────────────────
  const loc = locationData.locations[0];
  db.prepare(`
    INSERT INTO locations (id, name, address, phone, opening_hours_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(loc.id, loc.name, loc.address, loc.phone, JSON.stringify(loc.openingHours));
  console.log(`  ✓ Location: ${loc.name}`);

  // ── Users ──────────────────────────────────────────────────────────────────
  const [matthewHash, louisHash, nkulekoHash, thandekaHash] = await Promise.all([
    bcrypt.hash('000001', SALT_ROUNDS),
    bcrypt.hash('000002', SALT_ROUNDS),
    bcrypt.hash('000003', SALT_ROUNDS),
    bcrypt.hash('000004', SALT_ROUNDS),
  ]);

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, first_name, last_name, role, location_id)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const users = [
    ['matthew@hofmi.net',  matthewHash,  'Matthew', '',                    'admin'  ],
    ['louis@hofmi.net',    louisHash,    'Louis',   'van der Westhuizen',  'barista'],
    ['nkuleko@hofmi.net',  nkulekoHash,  'Nkuleko', 'Ncgobo',              'barista'],
    ['thandeka@hofmi.net', thandekaHash, 'Thandeka','Mathibela',           'barista'],
  ];
  users.forEach(u => insertUser.run(...u));
  console.log(`  ✓ ${users.length} users seeded`);

  // ── Menu items ─────────────────────────────────────────────────────────────
  const insertMenu = db.prepare(`
    INSERT INTO menu_items (name, description, price_cents, available)
    VALUES (?, ?, ?, ?)
  `);
  menuData.menu.forEach(item => {
    insertMenu.run(item.name, item.description ?? null, item.price_cents, item.available ? 1 : 0);
  });
  console.log(`  ✓ ${menuData.menu.length} menu items seeded`);

  // ── Inventory items ────────────────────────────────────────────────────────
  const insertInv = db.prepare(`
    INSERT INTO inventory_items (name, category, unit, quantity, reorder_level, supplier, location_id)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const inventoryItems = [
    ['Full Cream Milk',      'milk',             'litre',  20, 5, 'Local supplier'],
    ['Oat Milk',             'milk',             'litre',  10, 3, 'Local supplier'],
    ['Almond Milk',          'milk',             'litre',   8, 2, 'Local supplier'],
    ['Espresso Beans',       'food_ingredient',  'kg',      5, 1, 'Local supplier'],
    ['Hot Chocolate Powder', 'food_ingredient',  'kg',      3, 1, 'Local supplier'],
    ['Chai Concentrate',     'food_ingredient',  'bottle',  4, 1, 'Local supplier'],
    ['8oz Takeaway Cups',    'packaging',        'sleeve', 10, 3, 'Local supplier'],
  ];
  inventoryItems.forEach(row => insertInv.run(...row));
  console.log(`  ✓ ${inventoryItems.length} inventory items seeded`);

  // ── Modifier groups + modifiers ────────────────────────────────────────────
  const insertGroup = db.prepare(`
    INSERT INTO modifier_groups (id, name, selection_type, required, display_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertModifier = db.prepare(`
    INSERT INTO modifiers (id, group_id, name, price_delta_cents, is_default, display_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let totalModifiers = 0;
  modifierData.modifierGroups.forEach(group => {
    insertGroup.run(group.id, group.name, group.selectionType, group.required ? 1 : 0, group.displayOrder);
    group.modifiers.forEach(mod => {
      insertModifier.run(mod.id, group.id, mod.name, mod.priceDeltaCents, mod.isDefault ? 1 : 0, mod.displayOrder);
      totalModifiers++;
    });
  });
  console.log(`  ✓ ${modifierData.modifierGroups.length} modifier groups, ${totalModifiers} modifiers seeded`);

  // ── Link all drinks to modifier groups ────────────────────────────────────
  const insertLink = db.prepare(`
    INSERT OR IGNORE INTO menu_item_modifier_groups (menu_item_id, modifier_group_id)
    VALUES (?, ?)
  `);

  const milkGroupId  = 1;
  const extrasGroupId = 2;

  const allDrinks = db.prepare('SELECT id, name FROM menu_items').all();

  allDrinks.forEach(item => {
    // Americano has no milk
    if (item.name !== 'Americano') {
      insertLink.run(item.id, milkGroupId);
    }
    insertLink.run(item.id, extrasGroupId);
  });
  console.log(`  ✓ Modifiers linked to ${allDrinks.length} drink items`);

  // ── Sample customers ───────────────────────────────────────────────────────
  const insertCustomer = db.prepare(`
    INSERT INTO customers (first_name, last_name, email, phone, stamp_count, joined_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const customers = [
    ['Thabo',   'Molefe',      'thabo.molefe@gmail.com',   '072 811 2233', 7, '2025-01-14'],
    ['Priya',   'Naidoo',      'priya.naidoo@gmail.com',   '083 444 5566', 3, '2025-02-20'],
    ['Sifiso',  'Dlamini',     'sifiso.d@outlook.com',     '064 777 1234', 1, '2025-04-03'],
    ['Lerato',  'Sithole',     'lerato.sithole@gmail.com', '071 234 8899', 5, '2024-11-08'],
    ['Ruan',    'Botha',       'ruan.botha@icloud.com',    '082 933 4411', 0, '2025-05-01'],
    ['Nomvula', 'Khumalo',     'nomvula.k@gmail.com',      '079 555 2277', 8, '2025-01-30'],
    ['Kyle',    'van Niekerk', 'kyle.vn@gmail.com',        '083 100 6655', 2, '2025-04-22'],
    ['Aisha',   'Patel',       'aisha.patel@gmail.com',    '073 888 3344', 4, '2024-10-05'],
  ];
  customers.forEach(c => insertCustomer.run(...c));
  console.log(`  ✓ ${customers.length} sample customers seeded`);

  // ── Sample orders ──────────────────────────────────────────────────────────
  const getMenuItem = db.prepare('SELECT id, price_cents FROM menu_items WHERE name = ?');
  const americano  = getMenuItem.get('Americano');
  const cappuccino = getMenuItem.get('Cappuccino');
  const hotChoc    = getMenuItem.get('Hot Chocolate');
  const mocha      = getMenuItem.get('Mocha');
  const chai       = getMenuItem.get('Chai Latte');

  const louis    = db.prepare("SELECT id FROM users WHERE email = 'louis@hofmi.net'").get();
  const nkuleko  = db.prepare("SELECT id FROM users WHERE email = 'nkuleko@hofmi.net'").get();
  const thandeka = db.prepare("SELECT id FROM users WHERE email = 'thandeka@hofmi.net'").get();
  const cust     = db.prepare('SELECT id FROM customers ORDER BY id').all();

  const insertOrder = db.prepare(`
    INSERT INTO orders
      (customer_id, barista_id, subtotal_cents, discount_cents, total_cents,
       payment_method, is_walk_in, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id, menu_item_id, quantity, price_cents)
    VALUES (?, ?, ?, ?)
  `);

  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const sampleOrders = [
    { customerId: cust[0]?.id, baristaId: louis?.id,    items: [[americano, 1], [cappuccino, 1]], payment: 'cash', walkIn: 0, ts: `${today} 08:52:00`     },
    { customerId: null,        baristaId: nkuleko?.id,  items: [[hotChoc,   2]],                  payment: 'cash', walkIn: 1, ts: `${today} 09:01:00`     },
    { customerId: cust[3]?.id, baristaId: thandeka?.id, items: [[mocha,     1], [chai, 1]],       payment: 'card', walkIn: 0, ts: `${today} 09:08:00`     },
    { customerId: cust[5]?.id, baristaId: louis?.id,    items: [[cappuccino, 1]],                 payment: 'cash', walkIn: 0, ts: `${today} 09:15:00`     },
    { customerId: cust[1]?.id, baristaId: nkuleko?.id,  items: [[americano, 1]],                  payment: 'cash', walkIn: 0, ts: `${yesterday} 08:55:00` },
    { customerId: null,        baristaId: thandeka?.id, items: [[hotChoc,   1], [mocha, 1]],      payment: 'card', walkIn: 1, ts: `${yesterday} 09:10:00` },
  ];

  let orderCount = 0;
  sampleOrders.forEach(({ customerId, baristaId, items, payment, walkIn, ts }) => {
    if (!baristaId) return;
    const subtotal = items.reduce((sum, [item, qty]) => sum + (item?.price_cents ?? 0) * qty, 0);
    const { lastInsertRowid: orderId } = insertOrder.run(
      customerId ?? null, baristaId, subtotal, 0, subtotal, payment, walkIn, ts
    );
    items.forEach(([item, qty]) => {
      if (item) insertOrderItem.run(orderId, item.id, qty, item.price_cents);
    });
    orderCount++;
  });
  console.log(`  ✓ ${orderCount} sample orders seeded`);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log('\n✅ Seed complete');
  console.log('\n  ── Staff logins ──────────────────────────────────────');
  console.log('  matthew@hofmi.net   PIN: 000001  (admin)');
  console.log('  louis@hofmi.net     PIN: 000002  (barista)');
  console.log('  nkuleko@hofmi.net   PIN: 000003  (barista)');
  console.log('  thandeka@hofmi.net  PIN: 000004  (barista)');
  console.log('\n  ⚠  Change all PINs after first login.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
