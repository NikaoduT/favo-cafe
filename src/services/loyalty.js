/**
 * services/loyalty.js — Stamp-card loyalty logic (async / Turso)
 * 9 stamps → 10th coffee free. No points. No tiers.
 */

const { get, run, all } = require('../db/database');
const logger = require('../utils/logger');

const STAMPS_REQUIRED = 9;

// ── Earn stamps ───────────────────────────────────────────────────────────────

/**
 * @param {{ customerId, orderId, itemCount, totalCents }} params
 * @returns {Promise<{ stampsAdded, newStampCount, rewardUnlocked }>}
 */
const earnStamps = async ({ customerId, orderId, itemCount, totalCents }) => {
  const customer = await get(
    'SELECT id, stamp_count, total_spent_cents FROM customers WHERE id = ?',
    [customerId]
  );
  if (!customer) throw new Error(`Customer ${customerId} not found`);

  const current        = customer.stamp_count ?? 0;
  const raw            = current + itemCount;
  const rewardUnlocked = raw >= STAMPS_REQUIRED;
  const newStampCount  = rewardUnlocked ? raw % STAMPS_REQUIRED : raw;

  await run(
    `INSERT INTO loyalty_events (customer_id, order_id, event_type, stamps_delta, stamp_count)
     VALUES (?, ?, 'earn', ?, ?)`,
    [customerId, orderId ?? null, itemCount, newStampCount]
  );

  if (rewardUnlocked) {
    await run(
      `INSERT INTO loyalty_events (customer_id, order_id, event_type, stamps_delta, stamp_count, note)
       VALUES (?, ?, 'redeem', 0, 0, 'Free drink unlocked — counter reset')`,
      [customerId, orderId ?? null]
    );
  }

  await run(
    'UPDATE customers SET stamp_count = ?, total_spent_cents = ? WHERE id = ?',
    [newStampCount, (customer.total_spent_cents ?? 0) + totalCents, customerId]
  );

  logger.info(
    `[loyalty] Customer ${customerId}: +${itemCount} stamp(s) → ${newStampCount}/${STAMPS_REQUIRED}` +
    (rewardUnlocked ? ' — FREE DRINK UNLOCKED' : '')
  );

  return { stampsAdded: itemCount, newStampCount, rewardUnlocked };
};

// ── Redeem free drink ─────────────────────────────────────────────────────────

/**
 * @param {{ customerId, orderId, orderItems }} params
 * @returns {Promise<{ discountCents }>}
 */
const redeemFreeStamp = async ({ customerId, orderId, orderItems }) => {
  const lowestPrice  = orderItems.reduce((min, i) => Math.min(min, i.price_cents), Infinity);
  const discountCents = Number.isFinite(lowestPrice) ? lowestPrice : 0;

  await run('UPDATE customers SET stamp_count = 0 WHERE id = ?', [customerId]);
  await run(
    `INSERT INTO loyalty_events (customer_id, order_id, event_type, stamps_delta, stamp_count, note)
     VALUES (?, ?, 'redeem', 0, 0, 'Free drink redeemed by barista')`,
    [customerId, orderId ?? null]
  );

  logger.info(`[loyalty] Customer ${customerId}: free drink redeemed`);
  return { discountCents };
};

// ── Stamp summary ─────────────────────────────────────────────────────────────

/**
 * @param {number} customerId
 * @returns {Promise<{ stampCount, stampsRequired, stampsToFree, hasReward }|null>}
 */
const getStampSummary = async (customerId) => {
  const customer = await get('SELECT stamp_count FROM customers WHERE id = ?', [customerId]);
  if (!customer) return null;
  const stampCount  = customer.stamp_count ?? 0;
  return {
    stampCount,
    stampsRequired: STAMPS_REQUIRED,
    stampsToFree:   Math.max(0, STAMPS_REQUIRED - stampCount),
    hasReward:      stampCount >= STAMPS_REQUIRED,
  };
};

// ── Phone lookup ──────────────────────────────────────────────────────────────

/**
 * @param {string} phone
 * @returns {Promise<object|null>}
 */
const lookupByPhone = async (phone) => {
  const clean = phone.replace(/\D/g, '');
  if (clean.length >= 10) {
    return get(
      "SELECT * FROM customers WHERE replace(replace(phone,' ',''),'-','') LIKE ?",
      [`%${clean}%`]
    );
  }
  return get('SELECT * FROM customers WHERE phone LIKE ?', [`%${clean}`]);
};

module.exports = { earnStamps, redeemFreeStamp, getStampSummary, lookupByPhone, STAMPS_REQUIRED };
