const express = require('express');
const { get, run, all } = require('../db/database');
const { requireAuth }   = require('../middleware/auth');
const { requireRole }   = require('../middleware/roles');
const { earnStamps }    = require('../services/loyalty');
const yoco              = require('../services/yoco');

const router = express.Router();
router.use(requireAuth);

/** GET /api/orders — admin paginated list */
router.get('/', requireRole('admin'), async (req, res) => {
  const limit  = parseInt(req.query.limit) || 20;
  const offset = ((parseInt(req.query.page) || 1) - 1) * limit;
  let sql = `SELECT o.*, c.first_name, c.last_name
             FROM orders o LEFT JOIN customers c ON o.customer_id = c.id`;
  const params = [];
  if (req.query.date) { sql += ' WHERE date(o.created_at) = ?'; params.push(req.query.date); }
  sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return res.json(await all(sql, params));
});

/** GET /api/orders/:id */
router.get('/:id', requireRole('admin', 'barista'), async (req, res) => {
  const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = await all(
    'SELECT oi.*, mi.name FROM order_items oi JOIN menu_items mi ON oi.menu_item_id = mi.id WHERE oi.order_id = ?',
    [req.params.id]
  );
  return res.json({ ...order, items });
});

/**
 * POST /api/orders
 * Body: { items:[{menuItemId,quantity,notes?}], paymentMethod, customerId?, isWalkIn?, yocoToken? }
 */
router.post('/', requireRole('admin', 'barista'), async (req, res) => {
  const { items, paymentMethod, customerId = null, isWalkIn = false, yocoToken } = req.body;

  if (!items?.length) return res.status(400).json({ error: 'Order must contain at least one item' });
  if (!paymentMethod)  return res.status(400).json({ error: 'paymentMethod is required' });

  try {
    // Validate and price items (sequential async)
    let subtotalCents = 0;
    const validatedItems = [];
    for (const { menuItemId, quantity, notes } of items) {
      const menuItem = await get('SELECT * FROM menu_items WHERE id = ? AND available = 1', [menuItemId]);
      if (!menuItem) return res.status(400).json({ error: `Menu item ${menuItemId} not found or unavailable` });
      subtotalCents += menuItem.price_cents * quantity;
      validatedItems.push({ menuItemId, quantity, priceCents: menuItem.price_cents, notes });
    }

    // Yoco card payment
    if (paymentMethod === 'card' || paymentMethod === 'mixed') {
      try {
        const charge = await yoco.charge({ amountCents: subtotalCents, token: yocoToken ?? 'stub' });
        void charge.id; // logged internally by yoco service
      } catch (yocoErr) {
        return res.status(402).json({ error: `Card payment failed: ${yocoErr.message}` });
      }
    }

    const discountCents = paymentMethod === 'free_coffee' ? subtotalCents : 0;
    const totalCents    = Math.max(0, subtotalCents - discountCents);

    // Insert order
    const orderResult = await run(
      `INSERT INTO orders
         (customer_id, barista_id, subtotal_cents, discount_cents, total_cents, payment_method, is_walk_in)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customerId ?? null, req.user.id, subtotalCents, discountCents, totalCents, paymentMethod, isWalkIn ? 1 : 0]
    );
    const orderId = orderResult.lastInsertRowid;

    // Insert order items
    for (const { menuItemId, quantity, priceCents, notes } of validatedItems) {
      await run(
        'INSERT INTO order_items (order_id, menu_item_id, quantity, price_cents, notes) VALUES (?, ?, ?, ?, ?)',
        [orderId, menuItemId, quantity, priceCents, notes ?? null]
      );
    }

    // Loyalty stamps
    let loyaltyResult = null;
    if (customerId && !isWalkIn && paymentMethod !== 'free_coffee') {
      loyaltyResult = await earnStamps({
        customerId,
        orderId,
        itemCount: validatedItems.reduce((s, i) => s + i.quantity, 0),
        totalCents,
      });
    }

    return res.status(201).json({ orderId, subtotalCents, discountCents, totalCents, loyalty: loyaltyResult });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
