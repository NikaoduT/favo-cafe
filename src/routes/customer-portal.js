/**
 * customer-portal.js — Public customer portal API
 *
 * Unauthenticated routes (no admin JWT required).
 * Customers log in with email + 6-digit PIN. They receive a customer JWT
 * that grants access to their own profile and orders only.
 *
 * Routes:
 *   POST /api/customer-portal/signup   — create account, return token
 *   POST /api/customer-portal/login    — email + PIN, return token
 *   GET  /api/customer-portal/me       — profile + stamps (requires customer token)
 *   PUT  /api/customer-portal/me       — update email, phone, or PIN
 *   GET  /api/customer-portal/orders   — last 20 orders (requires customer token)
 */

const express = require('express');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { get, run, all } = require('../db/database');
const logger  = require('../utils/logger');

const SALT_ROUNDS        = 10;
const CUSTOMER_TOKEN_EXPIRY = '30d';

const router = express.Router();

// ── Token helpers ─────────────────────────────────────────────────────────────

/**
 * Sign a customer JWT.
 * @param {object} customer - DB row
 * @returns {string}
 */
const signCustomerToken = (customer) =>
  jwt.sign(
    { id: customer.id, role: 'customer', type: 'customer' },
    process.env.JWT_SECRET,
    { expiresIn: CUSTOMER_TOKEN_EXPIRY }
  );

/**
 * Middleware: verify a customer token and attach customerId to req.
 */
const requireCustomerAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Customer authentication required' });
  }
  try {
    const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (payload.type !== 'customer') {
      return res.status(403).json({ error: 'Invalid token type' });
    }
    req.customerId = payload.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ── Sanitise helper ───────────────────────────────────────────────────────────

/**
 * Strip internal fields from a customer row before sending to client.
 * @param {object} customer
 * @returns {object}
 */
const sanitise = ({ password_hash, ...safe }) => safe;

// ── POST /api/customer-portal/signup ─────────────────────────────────────────

router.post('/signup', async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body;

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'firstName and lastName are required' });
  }
  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }
  if (!password || !/^\d{6}$/.test(password)) {
    return res.status(400).json({ error: 'password must be exactly 6 digits' });
  }

  // Duplicate email check
  const existing = await get('SELECT id FROM customers WHERE email = ?', [email.toLowerCase().trim()]);
  if (existing) {
    return res.status(409).json({
      error: 'An account with that email already exists. Try signing in instead.',
    });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await run(
    `INSERT INTO customers (first_name, last_name, email, phone, password_hash, marketing_opt_in, whatsapp_opt_in)
     VALUES (?, ?, ?, ?, ?, 0, 1)`,
    [
      firstName.trim(),
      lastName.trim(),
      email.toLowerCase().trim(),
      phone ? phone.trim() : null,
      passwordHash,
    ]
  );

  const customer = await get('SELECT * FROM customers WHERE id = ?', [result.lastInsertRowid]);
  const token    = signCustomerToken(customer);

  logger.info(`[customer-portal] New customer ${customer.id} (${email})`);
  return res.status(201).json({ token, customer: sanitise(customer) });
});

// ── POST /api/customer-portal/login ──────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }
  if (!password) {
    return res.status(400).json({ error: 'password (PIN) is required' });
  }

  const customer = await get(
    'SELECT * FROM customers WHERE email = ?',
    [email.toLowerCase().trim()]
  );

  if (!customer) {
    return res.status(401).json({ error: 'Invalid email or PIN' });
  }

  if (!customer.password_hash) {
    return res.status(401).json({ error: 'This account does not have a PIN set. Please contact staff.' });
  }

  const valid = await bcrypt.compare(password, customer.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or PIN' });
  }

  const token = signCustomerToken(customer);
  logger.info(`[customer-portal] Customer ${customer.id} logged in`);
  return res.json({ token, customer: sanitise(customer) });
});

// ── GET /api/customer-portal/me ───────────────────────────────────────────────

router.get('/me', requireCustomerAuth, async (req, res) => {
  const customer = await get(
    `SELECT id, first_name, last_name, email, phone, stamp_count,
            total_spent_cents, joined_at, marketing_opt_in, whatsapp_opt_in
     FROM customers WHERE id = ?`,
    [req.customerId]
  );
  if (!customer) return res.status(404).json({ error: 'Account not found' });

  const STAMPS_REQUIRED = 9;
  const stampsToFree    = Math.max(0, STAMPS_REQUIRED - customer.stamp_count);

  return res.json({
    ...customer,
    stampsRequired: STAMPS_REQUIRED,
    stampsToFree,
    hasReward: customer.stamp_count >= STAMPS_REQUIRED,
  });
});

// ── PUT /api/customer-portal/me ───────────────────────────────────────────────

router.put('/me', requireCustomerAuth, async (req, res) => {
  const customer = await get('SELECT * FROM customers WHERE id = ?', [req.customerId]);
  if (!customer) return res.status(404).json({ error: 'Account not found' });

  const { email, phone, currentPassword, newPin } = req.body;

  // PIN change requires current PIN verification
  let passwordHash = customer.password_hash;
  if (newPin !== undefined) {
    if (!/^\d{6}$/.test(newPin)) {
      return res.status(400).json({ error: 'New PIN must be exactly 6 digits' });
    }
    if (!currentPassword) {
      return res.status(400).json({ error: 'currentPassword is required to set a new PIN' });
    }
    const valid = await bcrypt.compare(currentPassword, customer.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current PIN is incorrect' });
    }
    passwordHash = await bcrypt.hash(newPin, SALT_ROUNDS);
  }

  // Email uniqueness check
  if (email && email !== customer.email) {
    const clash = await get('SELECT id FROM customers WHERE email = ? AND id != ?', [email.toLowerCase().trim(), req.customerId]);
    if (clash) return res.status(409).json({ error: 'That email is already in use' });
  }

  await run(
    `UPDATE customers SET email = ?, phone = ?, password_hash = ? WHERE id = ?`,
    [
      email ? email.toLowerCase().trim() : customer.email,
      phone ?? customer.phone,
      passwordHash,
      req.customerId,
    ]
  );

  return res.json(sanitise(await get('SELECT * FROM customers WHERE id = ?', [req.customerId])));
});

// ── GET /api/customer-portal/orders ──────────────────────────────────────────

router.get('/orders', requireCustomerAuth, async (req, res) => {
  const orders = await all(
    `SELECT
       o.id, o.total_cents, o.subtotal_cents, o.discount_cents,
       o.payment_method, o.status, o.created_at,
       json_group_array(
         json_object('name', mi.name, 'qty', oi.quantity, 'priceCents', oi.price_cents)
       ) AS items_json
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN menu_items mi  ON mi.id = oi.menu_item_id
     WHERE o.customer_id = ?
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT 20`,
    [req.customerId]
  );

  return res.json(orders.map(order => ({
    ...order,
    items: (() => { try { return JSON.parse(order.items_json); } catch { return []; } })(),
    items_json: undefined,
  })));
});

module.exports = router;
