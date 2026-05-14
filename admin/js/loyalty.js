/**
 * loyalty.js — Loyalty Programme admin module
 * Handles member listing, stats, manual earn/redeem, and the member detail modal.
 *
 * Requires: admin-auth.js (adminAuth singleton)
 */

(() => {

  /* ─────────────────────────────────────────────────────────────────────
   * Constants
   * ───────────────────────────────────────────────────────────────────── */

  /** Tier point thresholds (mirrors helpers.js on the server). */
  const TIER_THRESHOLDS = {
    bronze:   { min: 0,    max: 499 },
    silver:   { min: 500,  max: 1499 },
    gold:     { min: 1500, max: 4999 },
    platinum: { min: 5000, max: Infinity },
  };

  /* ─────────────────────────────────────────────────────────────────────
   * Module state
   * ───────────────────────────────────────────────────────────────────── */

  /** @type {Array<object>} All customers loaded from the API */
  let allCustomers = [];

  /** @type {string} Active tier filter — 'all' | 'bronze' | 'silver' | 'gold' | 'platinum' */
  let activeTier = 'all';

  /** @type {object|null} Currently selected customer for manual adjustment */
  let selectedCustomer = null;

  /* ─────────────────────────────────────────────────────────────────────
   * Utility helpers
   * ───────────────────────────────────────────────────────────────────── */

  /**
   * Determine a customer's loyalty tier from their points balance.
   * @param {number} points
   * @returns {'bronze'|'silver'|'gold'|'platinum'}
   */
  const getTierLabel = (points) => {
    if (points >= TIER_THRESHOLDS.platinum.min) return 'platinum';
    if (points >= TIER_THRESHOLDS.gold.min)     return 'gold';
    if (points >= TIER_THRESHOLDS.silver.min)   return 'silver';
    return 'bronze';
  };

  /**
   * Format an integer cent value as a ZAR currency string.
   * @param {number} cents
   * @returns {string}
   */
  const formatRands = (cents) =>
    'R ' + (cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /**
   * Format a points integer with thousands separator.
   * @param {number} points
   * @returns {string}
   */
  const formatPoints = (points) =>
    points.toLocaleString('en-ZA');

  /**
   * Format an ISO date string to a short local date.
   * @param {string} iso
   * @returns {string}
   */
  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-ZA', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  /**
   * Build an HTML tier badge element string.
   * @param {string} tier
   * @returns {string}
   */
  const tierBadgeHTML = (tier) =>
    `<span class="loyalty-tier-badge loyalty-tier-badge--${tier}">${tier}</span>`;

  /**
   * Show a feedback message in a form feedback paragraph.
   * @param {HTMLElement} el
   * @param {string} message
   * @param {'success'|'error'} type
   */
  const showFeedback = (el, message, type) => {
    el.textContent = message;
    el.className = `loyalty-manual-panel__feedback loyalty-manual-panel__feedback--${type}`;
    if (type === 'success') {
      setTimeout(() => { el.textContent = ''; el.className = 'loyalty-manual-panel__feedback'; }, 4000);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────
   * Stats computation
   * ───────────────────────────────────────────────────────────────────── */

  /**
   * Compute summary stats from the full customer list and render them.
   * @param {Array<object>} customers
   */
  const computeStats = (customers) => {
    const totalMembers  = customers.length;
    const totalPoints   = customers.reduce((sum, c) => sum + (c.points || 0), 0);
    const goldPlusCount = customers.filter(c => {
      const tier = getTierLabel(c.points || 0);
      return tier === 'gold' || tier === 'platinum';
    }).length;
    const totalRedeemed = customers.reduce((sum, c) => sum + (c.total_redeemed || 0), 0);

    document.getElementById('stat-members-value').textContent   = formatPoints(totalMembers);
    document.getElementById('stat-points-value').textContent    = formatPoints(totalPoints);
    document.getElementById('stat-gold-plus-value').textContent = formatPoints(goldPlusCount);
    document.getElementById('stat-redeemed-value').textContent  = formatPoints(totalRedeemed);
  };

  /* ─────────────────────────────────────────────────────────────────────
   * Members table
   * ───────────────────────────────────────────────────────────────────── */

  /**
   * Render the members table, applying the active tier filter.
   * @param {Array<object>} customers
   */
  const renderMembersTable = (customers) => {
    const container = document.getElementById('loyalty-members-body');

    const filtered = activeTier === 'all'
      ? customers
      : customers.filter(c => getTierLabel(c.points || 0) === activeTier);

    if (!filtered.length) {
      container.innerHTML = `<p class="admin-empty">No ${activeTier === 'all' ? '' : activeTier + ' '}members found.</p>`;
      return;
    }

    const rows = filtered.map(c => {
      const tier        = getTierLabel(c.points || 0);
      const lastEvent   = c.last_event_at ? formatDate(c.last_event_at) : '—';
      const totalSpent  = formatRands(c.total_spent_cents || 0);
      const pointsBal   = formatPoints(c.points || 0);
      const fullName    = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';

      return `
        <tr class="admin-table__row">
          <td class="admin-table__cell">${fullName}</td>
          <td class="admin-table__cell">${tierBadgeHTML(tier)}</td>
          <td class="admin-table__cell">
            <span class="loyalty-points-value">${pointsBal}</span>
          </td>
          <td class="admin-table__cell">${totalSpent}</td>
          <td class="admin-table__cell">${lastEvent}</td>
          <td class="admin-table__cell">
            <button
              class="loyalty-members__view-btn"
              type="button"
              data-customer-id="${c.id}"
              aria-label="View loyalty details for ${fullName}"
            >View</button>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="admin-table" aria-label="Loyalty members">
        <thead class="admin-table__head">
          <tr>
            <th class="admin-table__heading" scope="col">Name</th>
            <th class="admin-table__heading" scope="col">Tier</th>
            <th class="admin-table__heading" scope="col">Points</th>
            <th class="admin-table__heading" scope="col">Total Spent</th>
            <th class="admin-table__heading" scope="col">Last Event</th>
            <th class="admin-table__heading" scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody class="admin-table__body">${rows}</tbody>
      </table>
    `;

    container.querySelectorAll('.loyalty-members__view-btn').forEach(btn => {
      btn.addEventListener('click', () => openMemberModal(Number(btn.dataset.customerId)));
    });
  };

  /**
   * Load all customers from the API, sort by points descending, render table and stats.
   */
  const loadMembers = async () => {
    const container = document.getElementById('loyalty-members-body');
    container.innerHTML = '<p class="admin-empty">Loading members…</p>';

    try {
      const res = await adminAuth.apiFetch('/api/customers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const customers = await res.json();
      allCustomers = customers.sort((a, b) => (b.points || 0) - (a.points || 0));

      computeStats(allCustomers);
      renderMembersTable(allCustomers);

    } catch {
      container.innerHTML = '<p class="admin-empty">Could not load members.</p>';
    }
  };

  /* ─────────────────────────────────────────────────────────────────────
   * Member detail modal
   * ───────────────────────────────────────────────────────────────────── */

  /**
   * Render the event history list inside the modal.
   * @param {Array<object>} events
   */
  const renderEventList = (events) => {
    const list = document.getElementById('modal-event-list');

    if (!events || !events.length) {
      list.innerHTML = '<li class="admin-empty">No events recorded.</li>';
      return;
    }

    const sorted = [...events].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    list.innerHTML = sorted.map(ev => {
      const isEarn    = ev.points_earned > 0;
      const points    = isEarn ? ev.points_earned : ev.points_redeemed;
      const amtClass  = isEarn ? 'loyalty-event-list__amount--earned' : 'loyalty-event-list__amount--redeemed';
      const amtPrefix = isEarn ? '+' : '−';
      const orderLine = ev.order_id ? `<span class="loyalty-event-list__order">Order #${ev.order_id}</span>` : '';

      return `
        <li class="loyalty-event-list__item">
          <div class="loyalty-event-list__detail">
            <time class="loyalty-event-list__date" datetime="${ev.created_at}">${formatDate(ev.created_at)}</time>
            ${orderLine}
          </div>
          <span class="loyalty-event-list__amount ${amtClass}" aria-label="${amtPrefix}${formatPoints(points)} points">
            ${amtPrefix}${formatPoints(points)} pts
          </span>
        </li>
      `;
    }).join('');
  };

  /**
   * Fetch loyalty details for a customer and open the detail modal.
   * @param {number} customerId
   */
  const openMemberModal = async (customerId) => {
    const overlay = document.getElementById('loyalty-modal-overlay');

    document.getElementById('modal-member-name').textContent = 'Loading…';
    document.getElementById('modal-member-meta').textContent = '';
    document.getElementById('modal-points').textContent = '—';
    document.getElementById('modal-spent').textContent = '—';
    document.getElementById('modal-tier-badge').innerHTML = '';
    document.getElementById('modal-event-list').innerHTML = '<li class="admin-empty">Loading events…</li>';

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';

    try {
      const res = await adminAuth.apiFetch(`/api/loyalty/${customerId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const tier = getTierLabel(data.points || 0);
      const fullName = `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Unknown';

      document.getElementById('modal-member-name').textContent = fullName;
      document.getElementById('modal-member-meta').textContent = data.email || '';
      document.getElementById('modal-points').textContent      = formatPoints(data.points || 0);
      document.getElementById('modal-spent').textContent       = formatRands(data.total_spent_cents || 0);
      document.getElementById('modal-tier-badge').innerHTML    = tierBadgeHTML(tier);

      renderEventList(data.events || []);

    } catch {
      document.getElementById('modal-member-name').textContent = 'Error loading member';
      document.getElementById('modal-event-list').innerHTML    = '<li class="admin-empty">Could not load data.</li>';
    }
  };

  /** Close the member detail modal. */
  const closeMemberModal = () => {
    document.getElementById('loyalty-modal-overlay').hidden = true;
    document.body.style.overflow = '';
  };

  /* ─────────────────────────────────────────────────────────────────────
   * Manual adjustment — customer search
   * ───────────────────────────────────────────────────────────────────── */

  /**
   * Filter the loaded customers list by a query string.
   * @param {string} query
   * @returns {Array<object>}
   */
  const filterCustomers = (query) => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return allCustomers.filter(c => {
      const name  = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
      const email = (c.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    }).slice(0, 8);
  };

  /**
   * Render the customer search results dropdown.
   * @param {Array<object>} customers
   */
  const renderSearchResults = (customers) => {
    const list   = document.getElementById('manual-customer-results');
    const input  = document.getElementById('manual-customer-search');

    if (!customers.length) {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      return;
    }

    list.innerHTML = customers.map(c => {
      const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
      const tier     = getTierLabel(c.points || 0);
      return `
        <li
          class="loyalty-search__result-item"
          role="option"
          data-customer-id="${c.id}"
          tabindex="-1"
        >
          <div class="loyalty-search__result-name">${fullName}</div>
          <div class="loyalty-search__result-meta">${formatPoints(c.points || 0)} pts · ${tier}</div>
        </li>
      `;
    }).join('');

    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');

    list.querySelectorAll('[role="option"]').forEach(item => {
      item.addEventListener('click', () => selectCustomer(Number(item.dataset.customerId)));
    });
  };

  /**
   * Set a customer as the selected target for manual adjustment.
   * @param {number} customerId
   */
  const selectCustomer = (customerId) => {
    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) return;

    selectedCustomer = customer;

    const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unknown';
    const tier     = getTierLabel(customer.points || 0);

    document.getElementById('manual-selected-name').textContent = fullName;
    document.getElementById('manual-selected-meta').textContent = `${formatPoints(customer.points || 0)} pts · ${tier}`;
    document.getElementById('manual-selected-customer').hidden  = false;
    document.getElementById('manual-customer-search').value     = '';
    document.getElementById('manual-customer-results').hidden   = true;
    document.getElementById('manual-customer-search').setAttribute('aria-expanded', 'false');

    document.getElementById('redeem-balance-hint').textContent =
      `Available balance: ${formatPoints(customer.points || 0)} pts`;

    updateSubmitStates();
  };

  /** Deselect the current customer. */
  const clearSelectedCustomer = () => {
    selectedCustomer = null;
    document.getElementById('manual-selected-customer').hidden = true;
    document.getElementById('manual-selected-name').textContent = '';
    document.getElementById('manual-selected-meta').textContent = '';
    document.getElementById('redeem-balance-hint').textContent = 'Available balance: —';
    document.getElementById('manual-customer-search').value = '';
    updateSubmitStates();
  };

  /**
   * Enable or disable the submit buttons based on whether a customer is selected.
   */
  const updateSubmitStates = () => {
    document.getElementById('earn-submit-btn').disabled   = !selectedCustomer;
    document.getElementById('redeem-submit-btn').disabled = !selectedCustomer;
  };

  /* ─────────────────────────────────────────────────────────────────────
   * Manual adjustment — earn
   * ───────────────────────────────────────────────────────────────────── */

  /**
   * POST to /api/loyalty/earn for a given customer and purchase amount.
   * @param {number} customerId
   * @param {number} totalCents - Purchase total in cents
   * @param {string|undefined} orderId - Optional order ID
   */
  const submitManualEarn = async (customerId, totalCents, orderId) => {
    const btn      = document.getElementById('earn-submit-btn');
    const feedback = document.getElementById('earn-feedback');

    btn.disabled = true;
    showFeedback(feedback, 'Processing…', 'success');

    try {
      const body = { customerId, totalCents };
      if (orderId) body.orderId = orderId;

      const res = await adminAuth.apiFetch('/api/loyalty/earn', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        showFeedback(feedback, data.error || 'Could not award points.', 'error');
        return;
      }

      const pointsAwarded = data.pointsEarned ?? Math.floor(totalCents / 100);
      showFeedback(feedback, `Awarded ${formatPoints(pointsAwarded)} points.`, 'success');

      document.getElementById('earn-amount-rands').value = '';
      document.getElementById('earn-order-id').value     = '';

      // Refresh the table to reflect updated points
      await loadMembers();
      if (selectedCustomer) {
        const updated = allCustomers.find(c => c.id === customerId);
        if (updated) selectCustomer(updated.id);
      }

    } catch {
      showFeedback(feedback, 'Network error. Please try again.', 'error');
    } finally {
      btn.disabled = !selectedCustomer;
    }
  };

  /* ─────────────────────────────────────────────────────────────────────
   * Manual adjustment — redeem
   * ───────────────────────────────────────────────────────────────────── */

  /**
   * POST to /api/loyalty/redeem for a given customer.
   * @param {number} customerId
   * @param {number} pointsToRedeem
   */
  const submitManualRedeem = async (customerId, pointsToRedeem) => {
    const btn      = document.getElementById('redeem-submit-btn');
    const feedback = document.getElementById('redeem-feedback');

    btn.disabled = true;
    showFeedback(feedback, 'Processing…', 'success');

    try {
      const res = await adminAuth.apiFetch('/api/loyalty/redeem', {
        method: 'POST',
        body: JSON.stringify({ customerId, pointsToRedeem }),
      });

      const data = await res.json();

      if (!res.ok) {
        showFeedback(feedback, data.error || 'Could not redeem points.', 'error');
        return;
      }

      showFeedback(feedback, `Redeemed ${formatPoints(pointsToRedeem)} points.`, 'success');
      document.getElementById('redeem-points').value = '';

      await loadMembers();
      if (selectedCustomer) {
        const updated = allCustomers.find(c => c.id === customerId);
        if (updated) selectCustomer(updated.id);
      }

    } catch {
      showFeedback(feedback, 'Network error. Please try again.', 'error');
    } finally {
      btn.disabled = !selectedCustomer;
    }
  };

  /* ─────────────────────────────────────────────────────────────────────
   * Tab switching (Earn / Redeem)
   * ───────────────────────────────────────────────────────────────────── */

  /**
   * Switch the active manual-adjustment tab.
   * @param {'earn'|'redeem'} tabName
   */
  const switchTab = (tabName) => {
    const tabs   = ['earn', 'redeem'];
    tabs.forEach(t => {
      const tab   = document.getElementById(`tab-${t}`);
      const panel = document.getElementById(`panel-${t}`);
      const isActive = t === tabName;
      tab.setAttribute('aria-selected', String(isActive));
      tab.classList.toggle('loyalty-manual-panel__tab--active', isActive);
      panel.hidden = !isActive;
    });
  };

  /* ─────────────────────────────────────────────────────────────────────
   * Tier filter
   * ───────────────────────────────────────────────────────────────────── */

  /**
   * Handle tier filter button clicks and re-render the table.
   * @param {string} tier
   */
  const setTierFilter = (tier) => {
    activeTier = tier;
    document.querySelectorAll('.loyalty-filter-btn').forEach(btn => {
      btn.classList.toggle('loyalty-filter-btn--active', btn.dataset.tier === tier);
    });
    renderMembersTable(allCustomers);
  };

  /* ─────────────────────────────────────────────────────────────────────
   * Topbar user display
   * ───────────────────────────────────────────────────────────────────── */

  /** Populate the topbar with the logged-in user's name and role badge. */
  const renderTopbarUser = () => adminAuth.renderTopbar();

  /* ─────────────────────────────────────────────────────────────────────
   * Event binding
   * ───────────────────────────────────────────────────────────────────── */

  /** Attach all DOM event listeners. */
  const bindEvents = () => {

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => adminAuth.logout());

    // Modal close
    document.getElementById('modal-close-btn').addEventListener('click', closeMemberModal);
    document.getElementById('loyalty-modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeMemberModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMemberModal();
    });

    // Tier filter buttons
    document.querySelectorAll('.loyalty-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => setTierFilter(btn.dataset.tier));
    });

    // Manual panel tab switching
    document.getElementById('tab-earn').addEventListener('click', () => switchTab('earn'));
    document.getElementById('tab-redeem').addEventListener('click', () => switchTab('redeem'));

    // Customer search — live filter
    const searchInput = document.getElementById('manual-customer-search');
    let searchDebounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        const results = filterCustomers(searchInput.value);
        renderSearchResults(results);
      }, 150);
    });

    searchInput.addEventListener('blur', (e) => {
      // Delay so click on result registers first
      setTimeout(() => {
        const list = document.getElementById('manual-customer-results');
        if (!list.contains(document.activeElement)) {
          list.hidden = true;
          searchInput.setAttribute('aria-expanded', 'false');
        }
      }, 200);
    });

    // Clear selected customer
    document.getElementById('manual-clear-customer').addEventListener('click', clearSelectedCustomer);

    // Earn form submit
    document.getElementById('panel-earn').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!selectedCustomer) return;

      const rands = parseFloat(document.getElementById('earn-amount-rands').value);
      if (isNaN(rands) || rands <= 0) {
        showFeedback(document.getElementById('earn-feedback'), 'Enter a valid purchase amount.', 'error');
        return;
      }

      const totalCents = Math.round(rands * 100);
      const orderId    = document.getElementById('earn-order-id').value.trim() || undefined;
      submitManualEarn(selectedCustomer.id, totalCents, orderId);
    });

    // Redeem form submit
    document.getElementById('panel-redeem').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!selectedCustomer) return;

      const points = parseInt(document.getElementById('redeem-points').value, 10);
      if (isNaN(points) || points <= 0) {
        showFeedback(document.getElementById('redeem-feedback'), 'Enter a valid points amount.', 'error');
        return;
      }

      if (points > (selectedCustomer.points || 0)) {
        showFeedback(document.getElementById('redeem-feedback'), 'Insufficient points balance.', 'error');
        return;
      }

      submitManualRedeem(selectedCustomer.id, points);
    });

  };

  /* ─────────────────────────────────────────────────────────────────────
   * Initialisation
   * ───────────────────────────────────────────────────────────────────── */

  /** Bootstrap the loyalty module. */
  const init = () => {
    adminAuth.requireAuth(['admin', 'super_admin']);

    renderTopbarUser();
    bindEvents();
    loadMembers();
  };

  init();

})();
