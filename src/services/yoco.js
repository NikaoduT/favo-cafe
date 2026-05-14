/**
 * yoco.js — Yoco payment gateway service
 *
 * STATUS: STUB — activate by adding YOCO_SECRET_KEY to .env
 *
 * Yoco docs: https://developer.yoco.com/online/resources/integration-libraries
 * Merchant dashboard: https://portal.yoco.com
 *
 * Integration steps when ready:
 *   1. Create a Yoco account at portal.yoco.com
 *   2. Get your secret key from Settings → Developers
 *   3. Add YOCO_SECRET_KEY=sk_live_... to .env (or sk_test_... for testing)
 *   4. The charge() function below will go live automatically
 */

const YOCO_API_BASE  = 'https://payments.yoco.com/api';
const YOCO_KEY       = process.env.YOCO_SECRET_KEY ?? null;
const YOCO_ENABLED   = Boolean(YOCO_KEY);

if (!YOCO_ENABLED) {
  console.log('[Yoco] No YOCO_SECRET_KEY found — card payments will be simulated.');
}

/**
 * Charge a card using a Yoco payment token.
 *
 * In production, the barista's device calls the Yoco SDK (web/inline) which
 * returns a short-lived `token` string. That token is passed here from
 * POST /api/orders when paymentMethod === 'card'.
 *
 * @param {{ amountCents: number, token: string, currency?: string }} opts
 * @returns {Promise<{ id: string, status: 'successful'|'failed', amountCents: number }>}
 */
const charge = async ({ amountCents, token, currency = 'ZAR' }) => {
  if (!YOCO_ENABLED) {
    // Simulated success for development / no-key environment
    console.log(`[Yoco STUB] Simulating card charge: ${currency} ${(amountCents / 100).toFixed(2)}`);
    return {
      id:          `sim_${Date.now()}`,
      status:      'successful',
      amountCents,
    };
  }

  const res = await fetch(`${YOCO_API_BASE}/charges`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${YOCO_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      token,
      amountInCents: amountCents,
      currency,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.displayMessage ?? err.message ?? `Yoco charge failed (${res.status})`);
  }

  const data = await res.json();
  return {
    id:          data.id,
    status:      data.status,
    amountCents: data.amountInCents,
  };
};

/**
 * Refund a Yoco charge.
 *
 * @param {{ chargeId: string, amountCents?: number }} opts
 * @returns {Promise<{ id: string, status: string }>}
 */
const refund = async ({ chargeId, amountCents }) => {
  if (!YOCO_ENABLED) {
    console.log(`[Yoco STUB] Simulating refund for charge ${chargeId}`);
    return { id: `refund_sim_${Date.now()}`, status: 'successful' };
  }

  const body = amountCents ? { amountInCents: amountCents } : {};
  const res = await fetch(`${YOCO_API_BASE}/charges/${chargeId}/refund`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${YOCO_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.displayMessage ?? `Yoco refund failed (${res.status})`);
  }

  const data = await res.json();
  return { id: data.id, status: data.status };
};

module.exports = { charge, refund, YOCO_ENABLED };
