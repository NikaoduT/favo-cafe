/**
 * portal.js — Customer-facing loyalty portal.
 *
 * Auth: requires localStorage 'favo_customer_token'.
 *       Missing/expired (401) → redirect to /login.html.
 *
 * Sections: stamp card, your usual, order ahead, account settings.
 */

(() => {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────
  const TOKEN_KEY   = 'favo_customer_token';
  const CUSTOMER_KEY = 'favo_customer';
  const USUAL_KEY   = 'favo_usual';
  const STAMPS_REQUIRED = 9;
  const EXTRA_SHOT_CENTS = 1000;

  // ── Token helpers ────────────────────────────────────────────────
  /**
   * @returns {string|null}
   */
  const getToken = () => localStorage.getItem(TOKEN_KEY);

  /**
   * Clear auth data and redirect to login.
   */
  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
    window.location.href = '/login.html';
  };

  /**
   * Decode the JWT payload to extract customerId without storing it separately.
   * @returns {string|null}
   */
  const getCustomerId = () => {
    const token = getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.id ?? payload.customerId ?? payload.sub ?? null;
    } catch {
      return null;
    }
  };

  /**
   * Authenticated fetch wrapper.
   * @param {string} url
   * @param {RequestInit} [opts]
   * @returns {Promise<Response>}
   */
  const apiFetch = (url, opts = {}) => {
    const token = getToken();
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers ?? {}),
      },
    });
  };

  // ── Format helpers ────────────────────────────────────────────────
  /**
   * Format cents to rand string.
   * @param {number} cents
   * @returns {string}
   */
  const fmtRand = (cents) => `R${((cents ?? 0) / 100).toFixed(2)}`;

  // ── Menu cache ────────────────────────────────────────────────────
  /** @type {Array<{id: number, name: string, description: string, price_cents: number, available: boolean}>} */
  let menuItems = [];

  /**
   * Fetch menu once and cache.
   * @returns {Promise<Array>}
   */
  const fetchMenu = async () => {
    if (menuItems.length) return menuItems;
    try {
      const res = await fetch('/api/menu');
      if (res.ok) {
        menuItems = await res.json();
      }
    } catch {
      menuItems = [];
    }
    return menuItems;
  };

  // ── Section 1: Stamp card ─────────────────────────────────────────

  const stampCircles = document.getElementById('stamp-circles');
  const stampProgress = document.getElementById('stamp-progress');
  const rewardBanner = document.getElementById('reward-banner');

  /**
   * Render the 9 stamp circles and progress text.
   * @param {number} stampCount
   * @param {boolean} hasReward
   */
  const renderStamps = (stampCount, hasReward) => {
    if (!stampCircles) return;
    stampCircles.innerHTML = '';

    for (let i = 0; i < STAMPS_REQUIRED; i += 1) {
      const circle = document.createElement('span');
      const filled = i < stampCount;
      circle.className = `stamp-card__circle${filled ? ' stamp-card__circle--filled' : ''}`;
      circle.setAttribute('aria-label', filled ? `Stamp ${i + 1} earned` : `Stamp ${i + 1} empty`);
      circle.setAttribute('role', 'img');
      stampCircles.appendChild(circle);
    }

    if (stampProgress) {
      if (hasReward) {
        stampProgress.textContent = `${STAMPS_REQUIRED} of ${STAMPS_REQUIRED} — Free coffee ready!`;
      } else {
        const remaining = STAMPS_REQUIRED - stampCount;
        stampProgress.textContent = `${stampCount} of ${STAMPS_REQUIRED} — ${remaining} more until your free coffee`;
      }
    }

    if (rewardBanner) {
      if (hasReward) {
        rewardBanner.hidden = false;
      } else {
        rewardBanner.hidden = true;
      }
    }
  };

  // ── Section 2: Your usual ─────────────────────────────────────────

  const usualDrinkSelect = document.getElementById('usual-drink');
  const usualExtrashotCheck = document.getElementById('usual-extrashot');
  const usualSaveBtn = document.getElementById('usual-save-btn');
  const usualConfirm = document.getElementById('usual-confirm');

  /**
   * Populate a drink <select> from the menu array.
   * @param {HTMLSelectElement} select
   * @param {Array} items
   */
  const populateDrinkSelect = (select, items) => {
    if (!select) return;
    select.innerHTML = '';
    items.filter(item => item.available).forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.name} — ${fmtRand(item.price_cents)}`;
      opt.dataset.priceCents = item.price_cents;
      select.appendChild(opt);
    });
  };

  /**
   * Get current milk radio value from a form.
   * @param {string} radioName
   * @returns {string}
   */
  const getMilkValue = (radioName) => {
    const checked = document.querySelector(`input[name="${radioName}"]:checked`);
    return checked ? checked.value : 'Full Cream';
  };

  /**
   * Set milk radio by value.
   * @param {string} radioName
   * @param {string} value
   */
  const setMilkValue = (radioName, value) => {
    const radios = document.querySelectorAll(`input[name="${radioName}"]`);
    radios.forEach(r => {
      r.checked = r.value === value;
    });
  };

  /**
   * Load saved usual from localStorage and pre-fill the form.
   */
  const loadSavedUsual = () => {
    const raw = localStorage.getItem(USUAL_KEY);
    if (!raw) return;
    try {
      const usual = JSON.parse(raw);
      if (usualDrinkSelect && usual.menuItemId) {
        usualDrinkSelect.value = usual.menuItemId;
      }
      if (usual.modifiers) {
        const milk = usual.modifiers.find(m => ['Full Cream', 'Oat Milk', 'Almond Milk'].includes(m));
        if (milk) setMilkValue('usual-milk', milk);
        if (usualExtrashotCheck) {
          usualExtrashotCheck.checked = usual.modifiers.includes('Extra Shot');
        }
      }
    } catch {
      // corrupted storage — ignore
    }
  };

  /**
   * Initialise the "Your usual" section.
   */
  const initUsual = async () => {
    const items = await fetchMenu();
    populateDrinkSelect(usualDrinkSelect, items);
    loadSavedUsual();

    usualSaveBtn?.addEventListener('click', () => {
      const menuItemId = usualDrinkSelect?.value;
      if (!menuItemId) return;

      const modifiers = [getMilkValue('usual-milk')];
      if (usualExtrashotCheck?.checked) modifiers.push('Extra Shot');

      localStorage.setItem(USUAL_KEY, JSON.stringify({ menuItemId, modifiers }));

      if (usualConfirm) {
        usualConfirm.hidden = false;
        setTimeout(() => { usualConfirm.hidden = true; }, 2000);
      }
    });
  };

  // ── Section 3: Order ahead ────────────────────────────────────────

  const orderDrinkSelect = document.getElementById('order-drink');
  const orderExtrashotCheck = document.getElementById('order-extrashot');
  const orderPriceEl = document.getElementById('order-price');
  const orderForm = document.getElementById('order-ahead-form');
  const orderErrorEl = document.getElementById('order-error');
  const orderConfirmationEl = document.getElementById('order-confirmation');
  const orderSummaryEl = document.getElementById('order-summary');

  /**
   * Update the live price display.
   */
  const updateOrderPrice = () => {
    if (!orderDrinkSelect || !orderPriceEl) return;
    const selectedOpt = orderDrinkSelect.options[orderDrinkSelect.selectedIndex];
    const baseCents = parseInt(selectedOpt?.dataset?.priceCents ?? '0', 10);
    const extraShot = orderExtrashotCheck?.checked ? EXTRA_SHOT_CENTS : 0;
    const total = baseCents + extraShot;
    orderPriceEl.textContent = fmtRand(total);
  };

  /**
   * Pre-fill order form from saved usual.
   */
  const prefillOrderFromUsual = () => {
    const raw = localStorage.getItem(USUAL_KEY);
    if (!raw) return;
    try {
      const usual = JSON.parse(raw);
      if (orderDrinkSelect && usual.menuItemId) {
        orderDrinkSelect.value = usual.menuItemId;
      }
      if (usual.modifiers) {
        const milk = usual.modifiers.find(m => ['Full Cream', 'Oat Milk', 'Almond Milk'].includes(m));
        if (milk) setMilkValue('order-milk', milk);
        if (orderExtrashotCheck) {
          orderExtrashotCheck.checked = usual.modifiers.includes('Extra Shot');
        }
      }
    } catch {
      // ignore
    }
  };

  /**
   * Initialise the "Order ahead" section.
   */
  const initOrderAhead = async () => {
    const items = await fetchMenu();
    populateDrinkSelect(orderDrinkSelect, items);
    prefillOrderFromUsual();
    updateOrderPrice();

    orderDrinkSelect?.addEventListener('change', updateOrderPrice);
    orderExtrashotCheck?.addEventListener('change', updateOrderPrice);

    orderForm?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const menuItemId = parseInt(orderDrinkSelect?.value ?? '0', 10);
      if (!menuItemId) {
        showOrderError('Please select a drink.');
        return;
      }

      const modifiers = [getMilkValue('order-milk')];
      if (orderExtrashotCheck?.checked) modifiers.push('Extra Shot');

      const notesInput = document.getElementById('order-notes');
      const notes = notesInput?.value?.trim() ?? '';

      const customerId = getCustomerId();

      const submitBtn = document.getElementById('order-submit-btn');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            items: [{ menuItemId, quantity: 1, modifiers, notes }],
            paymentMethod: 'cash',
            customerId,
            isWalkIn: false,
          }),
        });

        if (res.status === 401) { signOut(); return; }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showOrderError(data.message ?? 'Something went wrong. Please try again.');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        // Success
        const data = await res.json().catch(() => ({}));
        const selectedOpt = orderDrinkSelect.options[orderDrinkSelect.selectedIndex];
        const drinkName = selectedOpt?.textContent?.split(' — ')[0] ?? 'Your drink';
        const modSummary = modifiers.join(', ');

        if (orderSummaryEl) {
          orderSummaryEl.textContent = `${drinkName} — ${modSummary}${notes ? ` — "${notes}"` : ''}`;
        }

        if (orderForm) orderForm.hidden = true;
        if (orderConfirmationEl) orderConfirmationEl.hidden = false;
        if (orderErrorEl) orderErrorEl.hidden = true;

      } catch {
        showOrderError('Network error. Please check your connection and try again.');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  };

  /**
   * Show an order error message.
   * @param {string} msg
   */
  const showOrderError = (msg) => {
    if (!orderErrorEl) return;
    orderErrorEl.textContent = msg;
    orderErrorEl.hidden = false;
  };

  // ── Section 4: Account settings ───────────────────────────────────

  /**
   * Wire up a collapsible account settings group.
   * @param {HTMLButtonElement} toggleBtn
   * @param {HTMLFormElement} form
   */
  const initCollapsible = (toggleBtn, form) => {
    if (!toggleBtn || !form) return;
    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      form.hidden = expanded;
    });
  };

  /**
   * Show a settings form message.
   * @param {HTMLElement} msgEl
   * @param {string} text
   * @param {boolean} isError
   */
  const showSettingsMsg = (msgEl, text, isError = false) => {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.hidden = false;
    msgEl.className = `account-settings__msg${isError ? ' account-settings__msg--error' : ' account-settings__msg--success'}`;
  };

  /**
   * Initialise account settings forms.
   */
  const initAccountSettings = () => {
    // Collapsible toggles
    document.querySelectorAll('.account-settings__toggle').forEach(btn => {
      const formId = btn.getAttribute('aria-controls');
      const form = document.getElementById(formId);
      initCollapsible(btn, form);
    });

    // Change email
    const emailForm = document.getElementById('email-form');
    const emailMsg = document.getElementById('email-msg');
    emailForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newEmail = document.getElementById('new-email')?.value?.trim();
      if (!newEmail) { showSettingsMsg(emailMsg, 'Please enter a valid email.', true); return; }

      try {
        const res = await apiFetch('/api/customer-portal/me', {
          method: 'PUT',
          body: JSON.stringify({ email: newEmail }),
        });
        if (res.status === 401) { signOut(); return; }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          showSettingsMsg(emailMsg, d.message ?? 'Could not update email.', true);
          return;
        }
        const emailDisplay = document.getElementById('account-email-display');
        if (emailDisplay) emailDisplay.textContent = newEmail;
        showSettingsMsg(emailMsg, 'Email updated.');
        emailForm.hidden = true;
        const toggleBtn = emailForm.previousElementSibling?.querySelector('.account-settings__toggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      } catch {
        showSettingsMsg(emailMsg, 'Network error. Please try again.', true);
      }
    });

    // Change phone
    const phoneForm = document.getElementById('phone-form');
    const phoneMsg = document.getElementById('phone-msg');
    phoneForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPhone = document.getElementById('new-phone')?.value?.trim();
      if (!newPhone) { showSettingsMsg(phoneMsg, 'Please enter a phone number.', true); return; }

      try {
        const res = await apiFetch('/api/customer-portal/me', {
          method: 'PUT',
          body: JSON.stringify({ phone: newPhone }),
        });
        if (res.status === 401) { signOut(); return; }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          showSettingsMsg(phoneMsg, d.message ?? 'Could not update phone.', true);
          return;
        }
        const phoneDisplay = document.getElementById('account-phone-display');
        if (phoneDisplay) phoneDisplay.textContent = newPhone;
        showSettingsMsg(phoneMsg, 'Phone updated.');
        phoneForm.hidden = true;
        const toggleBtn = phoneForm.previousElementSibling?.querySelector('.account-settings__toggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      } catch {
        showSettingsMsg(phoneMsg, 'Network error. Please try again.', true);
      }
    });

    // Change PIN
    const pinForm = document.getElementById('pin-form');
    const pinMsg = document.getElementById('pin-msg');
    pinForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPin = document.getElementById('current-pin')?.value;
      const newPin = document.getElementById('new-pin')?.value;
      const confirmPin = document.getElementById('confirm-pin')?.value;

      if (!currentPin) { showSettingsMsg(pinMsg, 'Please enter your current PIN.', true); return; }
      if (!newPin || newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
        showSettingsMsg(pinMsg, 'New PIN must be exactly 6 digits.', true);
        return;
      }
      if (newPin !== confirmPin) { showSettingsMsg(pinMsg, 'PINs do not match.', true); return; }

      try {
        const res = await apiFetch('/api/customer-portal/me', {
          method: 'PUT',
          body: JSON.stringify({ currentPassword: currentPin, newPin }),
        });
        if (res.status === 401) { signOut(); return; }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          showSettingsMsg(pinMsg, d.message ?? 'Could not update PIN.', true);
          return;
        }
        showSettingsMsg(pinMsg, 'PIN updated.');
        pinForm.reset();
        pinForm.hidden = true;
        const toggleBtn = pinForm.previousElementSibling?.querySelector('.account-settings__toggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      } catch {
        showSettingsMsg(pinMsg, 'Network error. Please try again.', true);
      }
    });
  };

  // ── Auth gate + boot ──────────────────────────────────────────────

  /**
   * Main entry point.
   */
  const init = async () => {
    // Auth check
    const token = getToken();
    if (!token) {
      window.location.href = '/login.html';
      return;
    }

    // Fetch profile
    let me;
    try {
      const res = await apiFetch('/api/customer-portal/me');
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(CUSTOMER_KEY);
        window.location.href = '/login.html';
        return;
      }
      if (!res.ok) return;
      me = await res.json();
    } catch {
      return;
    }

    // Render stamp card
    const stampCount = me.stamp_count ?? 0;
    const hasReward = me.hasReward ?? stampCount >= STAMPS_REQUIRED;
    renderStamps(stampCount, hasReward);

    // Populate account display fields
    const emailDisplay = document.getElementById('account-email-display');
    const phoneDisplay = document.getElementById('account-phone-display');
    if (emailDisplay) emailDisplay.textContent = me.email ?? '';
    if (phoneDisplay) phoneDisplay.textContent = me.phone ?? 'Not set';

    // Populate new-email placeholder
    const newEmailInput = document.getElementById('new-email');
    if (newEmailInput && me.email) newEmailInput.placeholder = me.email;

    // Initialise sections
    await initUsual();
    await initOrderAhead();
    initAccountSettings();
  };

  // ── Sign out ──────────────────────────────────────────────────────
  document.getElementById('signout-btn')?.addEventListener('click', signOut);

  // ── Boot ─────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
