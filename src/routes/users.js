/**
 * users.js — Staff user management (admin only)
 *
 * GET    /api/users       — list all staff (baristas)
 * GET    /api/users/:id   — single staff member
 * POST   /api/users       — create a new barista account
 * PUT    /api/users/:id   — update name, email, active status, or reset PIN
 * DELETE /api/users/:id   — soft-delete (sets active = 0)
 *
 * PIN rules: exactly 6 numeric digits, stored as bcrypt hash.
 * Only admins can create or manage staff accounts.
 * Customers register themselves via /api/customer-portal/signup.
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const { all, get, run } = require('../db/database');
const { requireAuth }   = require('../middleware/auth');
const { requireRole }   = require('../middleware/roles');
const logger            = require('../utils/logger');

const router = express.Router();
const SALT_ROUNDS = 10;

router.use(requireAuth);
router.use(requireRole('admin'));

/**
 * Validate a 6-digit numeric PIN.
 * @param {string} pin
 * @returns {boolean}
 */
const validPin = (pin) => typeof pin === 'string' && /^\d{6}$/.test(pin);

/**
 * GET /api/users
 * Returns all active and inactive staff (baristas + admins). Password excluded.
 */
router.get('/', async (req, res) => {
  const users = await all(`
    SELECT id, email, first_name, last_name, role, active, location_id, created_at
    FROM   users
    WHERE  role IN ('admin','barista')
    ORDER  BY last_name, first_name
  `);
  return res.json(users);
});

/**
 * GET /api/users/:id
 */
router.get('/:id', async (req, res) => {
  const user = await get(
    `SELECT id, email, first_name, last_name, role, active, location_id, created_at
     FROM users WHERE id = ?`,
    [req.params.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
});

/**
 * POST /api/users
 * Create a new staff account (barista only — admins are seeded directly).
 * Body: { email, pin, first_name, last_name }
 */
router.post('/', async (req, res) => {
  const { email, pin, first_name, last_name } = req.body;

  if (!email || !pin || !first_name || !last_name) {
    return res.status(400).json({ error: 'email, pin, first_name, and last_name are required' });
  }
  if (!validPin(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 6 digits (numbers only)' });
  }

  const existing = await get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  if (existing) return res.status(409).json({ error: 'A user with that email already exists' });

  const passwordHash = await bcrypt.hash(pin, SALT_ROUNDS);

  const result = await run(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES (?, ?, ?, ?, 'barista')`,
    [email.toLowerCase().trim(), passwordHash, first_name.trim(), last_name.trim()]
  );

  const newUser = await get(
    `SELECT id, email, first_name, last_name, role, active, created_at
     FROM users WHERE id = ?`,
    [result.lastInsertRowid]
  );

  logger.info(`[users] Created barista ${newUser.id} (${email})`);
  return res.status(201).json(newUser);
});

/**
 * PUT /api/users/:id
 * Update name, email, active status. Optionally reset PIN.
 * Body (all optional): { first_name, last_name, email, active, pin }
 */
router.put('/:id', async (req, res) => {
  const existing = await get(
    `SELECT id, email, first_name, last_name, role, active FROM users WHERE id = ?`,
    [req.params.id]
  );
  if (!existing) return res.status(404).json({ error: 'User not found' });

  // Prevent admin from deactivating their own account
  if (Number(req.params.id) === req.user.id && req.body.active === 0) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  const { first_name, last_name, email, active, pin } = req.body;

  let passwordHash;
  if (pin !== undefined) {
    if (!validPin(pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 6 digits (numbers only)' });
    }
    passwordHash = await bcrypt.hash(pin, SALT_ROUNDS);
  }

  await run(
    `UPDATE users
     SET first_name    = ?,
         last_name     = ?,
         email         = ?,
         active        = ?,
         password_hash = COALESCE(?, password_hash)
     WHERE id = ?`,
    [
      first_name ?? existing.first_name,
      last_name  ?? existing.last_name,
      email      ? email.toLowerCase().trim() : existing.email,
      active     !== undefined ? Number(active) : existing.active,
      passwordHash ?? null,
      req.params.id,
    ]
  );

  const updated = await get(
    `SELECT id, email, first_name, last_name, role, active, created_at
     FROM users WHERE id = ?`,
    [req.params.id]
  );

  logger.info(`[users] Updated user ${req.params.id}${pin ? ' (PIN reset)' : ''}`);
  return res.json(updated);
});

/**
 * DELETE /api/users/:id
 * Soft-delete — sets active = 0.
 */
router.delete('/:id', async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  const existing = await get('SELECT id FROM users WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  await run('UPDATE users SET active = 0 WHERE id = ?', [req.params.id]);
  logger.info(`[users] Deactivated user ${req.params.id}`);
  return res.json({ message: 'User deactivated' });
});

module.exports = router;
