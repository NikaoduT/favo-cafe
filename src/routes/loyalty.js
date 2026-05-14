const express = require('express');
const { get, run, all } = require('../db/database');
const { requireAuth }   = require('../middleware/auth');
const { requireRole }   = require('../middleware/roles');
const { earnStamps, redeemFreeStamp, getStampSummary } = require('../services/loyalty');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/loyalty/:customerId
 * Returns stamp count and recent events for a customer.
 * Access: admin, barista (own counter lookup), customer (own record)
 */
router.get('/:customerId', requireRole('admin', 'barista'), async (req, res) => {
  const customer = await get(
    'SELECT id, first_name, last_name, email, phone, stamp_count FROM customers WHERE id = ?',
    [req.params.customerId]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const events = await all(
    `SELECT event_type, stamps_delta, stamp_count, note, created_at
     FROM loyalty_events
     WHERE customer_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    [req.params.customerId]
  );

  const summary = getStampSummary(Number(req.params.customerId));

  return res.json({ ...customer, summary, events });
});

/**
 * POST /api/loyalty/earn
 * Award stamps for a completed order.
 * Body: { customerId, orderId, itemCount, totalCents }
 */
router.post('/earn', requireRole('admin', 'barista'), async (req, res) => {
  const { customerId, orderId, itemCount, totalCents } = req.body;

  if (!customerId || !itemCount || !totalCents) {
    return res.status(400).json({ error: 'customerId, itemCount, and totalCents are required' });
  }

  const customer = await get('SELECT id FROM customers WHERE id = ?', [customerId]);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const result = await earnStamps({ customerId, orderId: orderId ?? null, itemCount, totalCents });
  return res.json(result);
});

/**
 * POST /api/loyalty/redeem
 * Barista redeems a free drink for a customer.
 * Body: { customerId, orderId, orderItems: [{ price_cents }] }
 */
router.post('/redeem', requireRole('admin', 'barista'), async (req, res) => {
  const { customerId, orderId, orderItems } = req.body;

  if (!customerId || !Array.isArray(orderItems) || !orderItems.length) {
    return res.status(400).json({ error: 'customerId and orderItems are required' });
  }

  const customer = await get('SELECT id, stamp_count FROM customers WHERE id = ?', [customerId]);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const result = await redeemFreeStamp({ customerId, orderId: orderId ?? null, orderItems });
  return res.json(result);
});

/**
 * PUT /api/loyalty/:customerId/adjust
 * Admin manually adjusts a customer's stamp count.
 * Body: { stampCount: number, note: string }
 */
router.put('/:customerId/adjust', requireRole('admin'), async (req, res) => {
  const { stampCount, note } = req.body;

  if (typeof stampCount !== 'number' || stampCount < 0 || stampCount > 9) {
    return res.status(400).json({ error: 'stampCount must be a number between 0 and 9' });
  }

  const customer = await get('SELECT id, stamp_count FROM customers WHERE id = ?', [req.params.customerId]);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const delta = stampCount - customer.stamp_count;

  await run('UPDATE customers SET stamp_count = ? WHERE id = ?', [stampCount, req.params.customerId]);
  await run(
    `INSERT INTO loyalty_events (customer_id, event_type, stamps_delta, stamp_count, note)
     VALUES (?, 'manual_adjust', ?, ?, ?)`,
    [req.params.customerId, delta, stampCount, note ?? 'Manual admin adjustment']
  );

  return res.json({ stampCount, note });
});

module.exports = router;
