/**
 * yoco-webhook.js — Handles Yoco payment webhook events.
 *
 * Yoco POSTs events to this endpoint when payment status changes.
 * Configure the webhook URL in the Yoco merchant portal:
 *   https://portal.yoco.com → Settings → Developers → Webhooks
 *   URL: https://yourdomain.com/api/yoco/webhook
 *
 * Supported events:
 *   payment.succeeded  — card payment completed successfully
 *   payment.failed     — card payment declined or failed
 *   refund.succeeded   — refund processed
 */

const express = require('express');
const { run, get } = require('../db/database');
const { logger } = require('../utils/logger');

const router = express.Router();

// Yoco signs webhooks with a shared secret — verify to prevent spoofing
const WEBHOOK_SECRET = process.env.YOCO_WEBHOOK_SECRET ?? null;

/**
 * POST /api/yoco/webhook
 * Receives Yoco webhook events (raw body for signature verification).
 */
router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  // ── Signature verification (activate when YOCO_WEBHOOK_SECRET is set) ────
  if (WEBHOOK_SECRET) {
    const signature = req.headers['x-yoco-signature'];
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }

    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');

    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { type, payload } = event;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Yoco Webhook] ${type}`, JSON.stringify(payload, null, 2));
  }

  switch (type) {
    case 'payment.succeeded': {
      // Update any order that holds this charge ID
      const chargeId = payload?.id;
      if (chargeId) {
        run(
          `UPDATE orders SET yoco_charge_id = ?, payment_status = 'paid' WHERE yoco_charge_id = ?`,
          [chargeId, chargeId]
        );
      }
      break;
    }

    case 'payment.failed': {
      const chargeId = payload?.id;
      if (chargeId) {
        run(
          `UPDATE orders SET payment_status = 'failed' WHERE yoco_charge_id = ?`,
          [chargeId]
        );
      }
      break;
    }

    case 'refund.succeeded': {
      const refundChargeId = payload?.chargeId;
      if (refundChargeId) {
        run(
          `UPDATE orders SET payment_status = 'refunded' WHERE yoco_charge_id = ?`,
          [refundChargeId]
        );
      }
      break;
    }

    default:
      // Unknown event — acknowledge and ignore
      console.log(`[Yoco Webhook] Unhandled event type: ${type}`);
  }

  // Always respond 200 quickly so Yoco doesn't retry
  return res.json({ received: true });
});

module.exports = router;
