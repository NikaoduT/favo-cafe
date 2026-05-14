/**
 * dashboard.js — Admin dashboard module
 * Shows today's key metrics and recent orders.
 */

// ── Auth Guard ───────────────────────────────────────────────────────────────
adminAuth.requireAuth(['admin']);

// ── Topbar ───────────────────────────────────────────────────────────────────
adminAuth.renderTopbar();
document.getElementById('logout-btn').addEventListener('click', () => adminAuth.logout());

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Escape a string for safe HTML insertion.
 * @param {string} str
 * @returns {string}
 */
const esc = (str) => String(str ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Format an ISO date string to a short time string.
 * @param {string} iso
 * @returns {string}
 */
const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

// ── Stat rendering helpers ────────────────────────────────────────────────────

/**
 * Set a stat card value. Falls back to '—' on null/undefined.
 * @param {string} id
 * @param {string|number} value
 */
const setStat = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '—';
};

// ── Dashboard loader ──────────────────────────────────────────────────────────

/**
 * Load all dashboard stats and recent orders.
 * @returns {Promise<void>}
 */
const loadStats = async () => {
  const today = new Date().toISOString().split('T')[0];

  // Customers
  try {
    const res = await adminAuth.apiFetch('/api/customers');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const customers = await res.json();
    setStat('stat-customers-value', customers.length);
  } catch {
    setStat('stat-customers-value', '—');
  }

  // Inventory low stock
  try {
    const res = await adminAuth.apiFetch('/api/inventory');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const inv = await res.json();
    const lowCount = inv.lowStockCount ?? (Array.isArray(inv)
      ? inv.filter(i => i.quantity <= i.reorder_level).length
      : '—');
    setStat('stat-lowstock-value', lowCount);
    if (lowCount > 0) {
      document.getElementById('stat-lowstock')?.classList.add('stat-card--warning');
    }
  } catch {
    setStat('stat-lowstock-value', '—');
  }

  // Orders today
  let orders = [];
  try {
    const res = await adminAuth.apiFetch(`/api/orders?date=${today}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    orders = await res.json();

    setStat('stat-orders-value', orders.length);

    const totalCents = orders.reduce((sum, o) => sum + (o.total_cents || 0), 0);
    setStat('stat-sales-value', 'R ' + (totalCents / 100).toFixed(2));
  } catch {
    setStat('stat-orders-value', '—');
    setStat('stat-sales-value', '—');
  }

  // Recent orders table
  const container = document.getElementById('recent-orders');
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = '<p class="admin-empty">No orders yet today.</p>';
    return;
  }

  const rows = orders.slice(0, 10).map(o => `
    <tr class="admin-table__row">
      <td class="admin-table__cell">#${esc(String(o.id))}</td>
      <td class="admin-table__cell">${o.first_name ? esc(o.first_name + ' ' + o.last_name) : 'Walk-in'}</td>
      <td class="admin-table__cell">R ${((o.total_cents || 0) / 100).toFixed(2)}</td>
      <td class="admin-table__cell">${esc(o.payment_method || '—')}</td>
      <td class="admin-table__cell">${o.created_at ? formatTime(o.created_at) : '—'}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="admin-table" aria-label="Recent orders">
      <thead class="admin-table__head">
        <tr>
          <th class="admin-table__heading" scope="col">Order</th>
          <th class="admin-table__heading" scope="col">Customer</th>
          <th class="admin-table__heading" scope="col">Total</th>
          <th class="admin-table__heading" scope="col">Payment</th>
          <th class="admin-table__heading" scope="col">Time</th>
        </tr>
      </thead>
      <tbody class="admin-table__body">${rows}</tbody>
    </table>
  `;
};

// ── Init ──────────────────────────────────────────────────────────────────────
loadStats();
