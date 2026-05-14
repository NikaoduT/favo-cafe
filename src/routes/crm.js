const express = require('express');
const { all, get, run } = require('../db/database');
const { requireAuth }   = require('../middleware/auth');
const { requireRole }   = require('../middleware/roles');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/customers
 * Admin only. Query: ?search=name_or_email_or_phone
 */
router.get('/', requireRole('admin'), async (req, res) => {
  let sql   = `SELECT id, first_name, last_name, email, phone, stamp_count, joined_at
               FROM customers`;
  const params = [];

  if (req.query.search) {
    sql += ` WHERE (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
    const term = `%${req.query.search}%`;
    params.push(term, term, term, term);
  }

  sql += ' ORDER BY last_name, first_name';
  return res.json(await all(sql, params));
});

/**
 * GET /api/customers/:id
 * Admin only.
 */
router.get('/:id', requireRole('admin'), async (req, res) => {
  const customer = await get(
    `SELECT id, first_name, last_name, email, phone, stamp_count,
            total_spent_cents, joined_at, notes
     FROM customers WHERE id = ?`,
    [req.params.id]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const recentOrders = await all(
    `SELECT id, total_cents, payment_method, is_walk_in, created_at
     FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10`,
    [req.params.id]
  );

  const stampHistory = await all(
    `SELECT event_type, stamps_delta, stamp_count, note, created_at
     FROM loyalty_events WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20`,
    [req.params.id]
  );

  return res.json({ ...customer, recentOrders, stampHistory });
});

/**
 * POST /api/customers
 * Barista can register a new customer at the counter.
 * Body: { first_name, last_name, email?, phone?, password_hash? }
 */
router.post('/', requireRole('admin', 'barista'), async (req, res) => {
  const { first_name, last_name, email, phone, password_hash, notes } = req.body;

  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'first_name and last_name are required' });
  }

  const result = await run(
    `INSERT INTO customers (first_name, last_name, email, phone, password_hash, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [first_name, last_name, email ?? null, phone ?? null, password_hash ?? null, notes ?? null]
  );

  return res.status(201).json(
    await get('SELECT id, first_name, last_name, email, phone, stamp_count FROM customers WHERE id = ?',
      [result.lastInsertRowid])
  );
});

/**
 * PUT /api/customers/:id
 * Admin only. Update customer details or manually set stamp_count.
 */
router.put('/:id', requireRole('admin'), async (req, res) => {
  const { first_name, last_name, email, phone, notes, stamp_count } = req.body;

  const existing = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });

  await run(
    `UPDATE customers
     SET first_name = ?, last_name = ?, email = ?, phone = ?, notes = ?, stamp_count = ?
     WHERE id = ?`,
    [
      first_name   ?? existing.first_name,
      last_name    ?? existing.last_name,
      email        ?? existing.email,
      phone        ?? existing.phone,
      notes        ?? existing.notes,
      stamp_count  !== undefined ? stamp_count : existing.stamp_count,
      req.params.id,
    ]
  );

  return res.json(
    await get('SELECT id, first_name, last_name, email, phone, stamp_count FROM customers WHERE id = ?',
      [req.params.id])
  );
});

module.exports = router;
