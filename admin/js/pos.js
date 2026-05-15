/**
 * pos.js — Point of Sale module for Favo Cafe & Roastery
 * Handles menu display, modifier selection, cart management,
 * customer lookup, stamp-based loyalty, and order submission.
 *
 * Auth: adminAuth.requireAuth(['admin','barista']) is called first.
 * All API calls use adminAuth.apiFetch() for Bearer token injection.
 */

(() => {

  // ── Auth guard (must be first) ─────────────────────────────────────────────
  if (!adminAuth.requireAuth(['admin', 'barista'])) return;

  // ── State ──────────────────────────────────────────────────────────────────

  /** @type {Array<object>} All available menu items from /api/menu */
  let menuItems = [];

  /** @type {Array<object>} All modifier groups from /api/menu/modifiers */
  let modifierGroups = [];

  /** @type {Array<{item:object, quantity:number, mods:Array, priceDelta:number}>} */
  let cart = [];

  /** @type {object|null} Currently selected customer */
  let selectedCustomer = null;

  /** @type {object|null} Stamp info for the selected customer */
  let customerStamps = null;

  /** @type {boolean} Walk-in mode (no customer, no stamps) */
  let isWalkIn = false;

  /** @type {string} Selected payment method */
  let selectedPayment = 'cash';

  /** @type {string} Active category filter */
  let activeCategory = 'all';

  /** @type {object|null} Item awaiting modifier selection */
  let pendingItem = null;

  /** @type {Map<number,number>} groupId → selected modifierId (single-select) */
  let pendingSelections = new Map();

  /** @type {Set<number>} Active toggle modifier IDs */
  let pendingToggles = new Map();

  // ── DOM refs ───────────────────────────────────────────────────────────────

  const menuGrid           = document.getElementById('pos-menu-grid');
  const tabsContainer      = document.getElementById('pos-tabs');
  const cartItemsEl        = document.getElementById('pos-cart-items');
  const cartCountEl        = document.getElementById('pos-cart-count');
  const subtotalEl         = document.getElementById('pos-subtotal');
  const totalEl            = document.getElementById('pos-total');
  const discountRow        = document.getElementById('pos-discount-row');
  const discountEl         = document.getElementById('pos-discount');
  const chargeBtn          = document.getElementById('pos-charge-btn');
  const walkInToggle       = document.getElementById('pos-walkin-toggle');
  const customerSection    = document.getElementById('pos-customer-section');
  const customerSearch     = document.getElementById('pos-customer-search');
  const customerDropdown   = document.getElementById('pos-customer-dropdown');
  const customerSearchWrap = document.getElementById('pos-customer-search-wrap');
  const customerSelected   = document.getElementById('pos-customer-selected');
  const stampBadge         = document.getElementById('pos-stamp-badge');
  const freeBadge          = document.getElementById('pos-free-badge');
  const newCustomerBtn     = document.getElementById('pos-new-customer-btn');
  const modifierOverlay    = document.getElementById('pos-modifier-overlay');
  const modifierBody       = document.getElementById('pos-modifier-body');
  const modifierTitle      = document.getElementById('pos-modifier-title');
  const modifierAddBtn     = document.getElementById('pos-modifier-add');
  const receiptOverlay     = document.getElementById('pos-receipt-overlay');
  const newCustomerModal   = document.getElementById('pos-new-customer-modal');
  const newCustomerForm    = document.getElementById('pos-new-customer-form');
  const newCustomerError   = document.getElementById('pos-new-customer-error');

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Format cents as ZAR string.
   * @param {number} cents
   * @returns {string}
   */
  const formatRand = (cents) => 'R ' + (cents / 100).toFixed(2);

  /**
   * Convert snake_case to Title Case.
   * @param {string} str
   * @returns {string}
   */
  const titleCase = (str) =>
    str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // ── Load modifiers ─────────────────────────────────────────────────────────

  /**
   * Fetch modifier groups from the API.
   */
  const loadModifiers = async () => {
    try {
      const res = await adminAuth.apiFetch('/api/menu/modifiers');
      if (res && res.ok) {
        const data = await res.json();
        modifierGroups = Array.isArray(data) ? data : [];
      }
    } catch (_) {
      modifierGroups = [];
    }
  };

  /**
   * Return modifier groups for a menu item.
   * All Favo menu items are drinks — every item uses all modifier groups.
   * (Category column was removed in schema v3.)
   * @returns {Array}
   */
  const getGroupsForCategory = () => modifierGroups;

  // ── Load menu ──────────────────────────────────────────────────────────────

  /**
   * Fetch all available menu items from /api/menu and render them.
   */
  const loadMenu = async () => {
    if (menuGrid) menuGrid.innerHTML = '<p class="admin-empty">Loading menu…</p>';

    try {
      const res = await adminAuth.apiFetch('/api/menu');

      if (!res || !res.ok) {
        const status = res?.status ?? 0;
        const body   = res ? await res.json().catch(() => ({})) : {};
        menuGrid.innerHTML = `
          <p class="admin-empty">
            Could not load menu (${status || 'network error'}).
            ${body.error ? `<br><small>${body.error}</small>` : ''}
            <br><br>
            <button class="pos-retry-btn" type="button">Retry</button>
          </p>`;
        menuGrid.querySelector('.pos-retry-btn')?.addEventListener('click', loadMenu);
        return;
      }

      const data = await res.json();
      menuItems = Array.isArray(data) ? data.filter(i => i.available) : [];

      if (!menuItems.length) {
        menuGrid.innerHTML = '<p class="admin-empty">No menu items available.</p>';
        return;
      }

      buildTabs();
      renderMenu();
    } catch (err) {
      menuGrid.innerHTML = `
        <p class="admin-empty">
          Could not load menu.<br><small>${err.message}</small><br><br>
          <button class="pos-retry-btn" type="button">Retry</button>
        </p>`;
      menuGrid.querySelector('.pos-retry-btn')?.addEventListener('click', loadMenu);
    }
  };

  // ── Category tabs ──────────────────────────────────────────────────────────

  /**
   * Build category filter tabs from loaded menu items.
   */
  const buildTabs = () => {
    const categories = ['all', ...new Set(menuItems.map(i => i.category).filter(Boolean))];
    tabsContainer.innerHTML = categories.map(cat => `
      <button
        class="pos-menu__tab${cat === activeCategory ? ' pos-menu__tab--active' : ''}"
        data-category="${cat}"
        type="button"
      >${cat === 'all' ? 'All' : titleCase(cat)}</button>
    `).join('');

    tabsContainer.querySelectorAll('.pos-menu__tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.category;
        tabsContainer.querySelectorAll('.pos-menu__tab').forEach(b =>
          b.classList.toggle('pos-menu__tab--active', b === btn));
        renderMenu();
      });
    });
  };

  // ── Render menu grid ───────────────────────────────────────────────────────

  /**
   * Render filtered menu item buttons in the grid.
   */
  const renderMenu = () => {
    const filtered = menuItems.filter(i =>
      i.available && (activeCategory === 'all' || i.category === activeCategory)
    );

    if (!filtered.length) {
      menuGrid.innerHTML = '<p class="admin-empty">No items in this category.</p>';
      return;
    }

    menuGrid.innerHTML = filtered.map(item => {
      const inCart       = cart.some(c => c.item.id === item.id);
      const hasModifiers = getGroupsForCategory().length > 0;
      return `
        <article
          class="pos-item${inCart ? ' pos-item--in-cart' : ''}"
          data-id="${item.id}"
          role="button"
          tabindex="0"
          aria-label="${hasModifiers ? 'Customise and add' : 'Add'} ${item.name} to order"
        >
          <span class="pos-item__name">${item.name}</span>
          <span class="pos-item__price">${formatRand(item.price_cents)}</span>
          ${hasModifiers ? '<span class="pos-item__custom-hint">Tap to customise</span>' : ''}
        </article>`;
    }).join('');

    menuGrid.querySelectorAll('.pos-item').forEach(card => {
      const handler = () => {
        const item = menuItems.find(i => i.id === parseInt(card.dataset.id));
        if (item) openModifierSheet(item);
      };
      card.addEventListener('click', handler);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    });
  };

  // ── Modifier sheet ─────────────────────────────────────────────────────────

  /**
   * Open the modifier panel for an item.
   * If the item has no applicable modifiers, add it directly.
   * @param {object} item
   */
  const openModifierSheet = (item) => {
    const groups = getGroupsForCategory();

    if (!groups.length) {
      commitAddToCart(item, []);
      return;
    }

    pendingItem       = item;
    pendingSelections = new Map();
    pendingToggles    = new Set();

    // Pre-select defaults for single-select groups
    groups.forEach(group => {
      if (group.selectionType === 'single') {
        const def = group.modifiers.find(m => m.isDefault) || group.modifiers[0];
        if (def) pendingSelections.set(group.id, def.id);
      }
    });

    modifierTitle.textContent = item.name;
    renderModifierSheet(groups);
    modifierOverlay.classList.add('pos-modifier-overlay--open');
    modifierAddBtn.focus();
  };

  /**
   * Render modifier groups inside the bottom sheet.
   * @param {Array} groups
   */
  const renderModifierSheet = (groups) => {
    modifierBody.innerHTML = groups.map(group => {
      if (group.selectionType === 'multiple') {
        return `
          <div class="pos-mod-group" data-group-id="${group.id}">
            <span class="pos-mod-group__label">${group.name}</span>
            <div class="pos-mod-group__options">
              ${group.modifiers.map(mod => {
                const qty = pendingToggles.get(mod.id) ?? 0;
                return `
                <div class="pos-mod-counter" data-group="${group.id}" data-mod="${mod.id}" data-delta="${mod.priceDeltaCents}">
                  <span class="pos-mod-counter__name">${mod.name}${mod.priceDeltaCents > 0 ? ` (+${formatRand(mod.priceDeltaCents)} each)` : ''}</span>
                  <div class="pos-mod-counter__controls">
                    <button class="pos-mod-counter__btn pos-mod-counter__btn--minus" data-mod="${mod.id}" type="button" ${qty === 0 ? 'disabled' : ''}>−</button>
                    <span class="pos-mod-counter__qty">${qty}</span>
                    <button class="pos-mod-counter__btn pos-mod-counter__btn--plus" data-mod="${mod.id}" type="button">+</button>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
      }

      return `
        <div class="pos-mod-group" data-group-id="${group.id}">
          <span class="pos-mod-group__label">${group.name}</span>
          <div class="pos-mod-group__options">
            ${group.modifiers.map(mod => `
              <button
                class="pos-mod-option${pendingSelections.get(group.id) === mod.id ? ' pos-mod-option--selected' : ''}"
                data-group="${group.id}"
                data-mod="${mod.id}"
                data-delta="${mod.priceDeltaCents}"
                data-type="single"
                type="button"
              >
                ${mod.name}
                <span class="pos-mod-option__delta">${
                  mod.priceDeltaCents > 0
                    ? `+${formatRand(mod.priceDeltaCents)}`
                    : mod.priceDeltaCents < 0
                      ? `−${formatRand(Math.abs(mod.priceDeltaCents))}`
                      : 'Included'
                }</span>
              </button>
            `).join('')}
          </div>
        </div>`;
    }).join('');

    // Bind single-select clicks
    modifierBody.querySelectorAll('[data-type="single"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const groupId = parseInt(btn.dataset.group);
        const modId   = parseInt(btn.dataset.mod);
        pendingSelections.set(groupId, modId);
        modifierBody.querySelectorAll(`[data-group="${groupId}"][data-type="single"]`).forEach(b =>
          b.classList.toggle('pos-mod-option--selected', parseInt(b.dataset.mod) === modId));
        updateModifierAddLabel();
      });
    });

    // Bind counter +/- clicks (multiple modifiers like Extra Shot)
    modifierBody.querySelectorAll('.pos-mod-counter__btn--plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const modId   = parseInt(btn.dataset.mod);
        const current = pendingToggles.get(modId) ?? 0;
        pendingToggles.set(modId, current + 1);
        const counter = btn.closest('.pos-mod-counter');
        counter.querySelector('.pos-mod-counter__qty').textContent = current + 1;
        counter.querySelector('.pos-mod-counter__btn--minus').disabled = false;
        updateModifierAddLabel();
      });
    });

    modifierBody.querySelectorAll('.pos-mod-counter__btn--minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const modId   = parseInt(btn.dataset.mod);
        const current = pendingToggles.get(modId) ?? 0;
        if (current <= 0) return;
        const next = current - 1;
        if (next === 0) pendingToggles.delete(modId); else pendingToggles.set(modId, next);
        const counter = btn.closest('.pos-mod-counter');
        counter.querySelector('.pos-mod-counter__qty').textContent = next;
        btn.disabled = next === 0;
        updateModifierAddLabel();
      });
    });

    updateModifierAddLabel();
  };

  /**
   * Calculate extra price from pending modifier selections.
   * @returns {number} extra cents
   */
  const calcModifierDelta = () => {
    let delta = 0;
    modifierGroups.forEach(group => {
      if (group.selectionType === 'single') {
        const selId = pendingSelections.get(group.id);
        const mod   = group.modifiers.find(m => m.id === selId);
        if (mod) delta += mod.priceDeltaCents;
      } else {
        group.modifiers.forEach(mod => {
          const qty = pendingToggles.get(mod.id) ?? 0;
          if (qty > 0) delta += mod.priceDeltaCents * qty;
        });
      }
    });
    return delta;
  };

  /**
   * Update the "Add to Order" button label with the current calculated price.
   */
  const updateModifierAddLabel = () => {
    if (!pendingItem) return;
    const total = pendingItem.price_cents + calcModifierDelta();
    modifierAddBtn.textContent = `Add to Order — ${formatRand(total)}`;
  };

  /**
   * Close the modifier sheet without adding to cart.
   */
  const closeModifierSheet = () => {
    modifierOverlay.classList.remove('pos-modifier-overlay--open');
    pendingItem = null;
  };

  modifierOverlay?.addEventListener('click', e => {
    if (e.target === modifierOverlay) closeModifierSheet();
  });

  document.getElementById('pos-modifier-close')?.addEventListener('click', closeModifierSheet);

  modifierAddBtn?.addEventListener('click', () => {
    if (!pendingItem) return;

    const selectedMods = [];
    modifierGroups.forEach(group => {
      if (group.selectionType === 'single') {
        const selId = pendingSelections.get(group.id);
        if (selId) {
          const mod = group.modifiers.find(m => m.id === selId);
          if (mod) selectedMods.push({ groupId: group.id, modId: mod.id, name: mod.name, delta: mod.priceDeltaCents, type: 'single' });
        }
      } else {
        group.modifiers.forEach(mod => {
          const qty = pendingToggles.get(mod.id) ?? 0;
          for (let i = 0; i < qty; i++) {
            selectedMods.push({ groupId: group.id, modId: mod.id, name: mod.name, delta: mod.priceDeltaCents, type: 'toggle' });
          }
        });
      }
    });

    commitAddToCart(pendingItem, selectedMods);
    closeModifierSheet();
  });

  // ── Cart ───────────────────────────────────────────────────────────────────

  /**
   * Add an item with chosen modifiers to the cart, or increment quantity if identical.
   * @param {object} item
   * @param {Array}  mods
   */
  const commitAddToCart = (item, mods = []) => {
    const delta  = mods.reduce((sum, m) => sum + m.delta, 0);
    const modKey = mods.map(m => m.modId).sort().join('-');
    const existing = cart.find(c =>
      c.item.id === item.id && c.mods.map(m => m.modId).sort().join('-') === modKey
    );

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({ item, quantity: 1, mods, priceDelta: delta });
    }

    renderCart();
    renderMenu();
  };

  /**
   * Update quantity of a cart line by delta (+1 or -1). Removes at 0.
   * @param {number} idx
   * @param {number} delta
   */
  const updateCartQty = (idx, delta) => {
    if (idx < 0 || idx >= cart.length) return;
    cart[idx].quantity += delta;
    if (cart[idx].quantity <= 0) cart.splice(idx, 1);
    renderCart();
    renderMenu();
  };

  /**
   * Clear the entire cart.
   */
  const clearCart = () => {
    cart = [];
    renderCart();
    renderMenu();
  };

  /**
   * Render the cart item list and update totals.
   */
  const renderCart = () => {
    const itemCount = cart.reduce((sum, c) => sum + c.quantity, 0);
    cartCountEl.textContent = itemCount === 0 ? 'Empty order' : `${itemCount} item${itemCount !== 1 ? 's' : ''}`;

    if (!cart.length) {
      cartItemsEl.innerHTML = `
        <div class="pos-cart__empty">
          <svg class="pos-cart__empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <p>Add items from the menu</p>
        </div>`;
      updateTotals();
      return;
    }

    cartItemsEl.innerHTML = cart.map(({ item, quantity, mods, priceDelta }, idx) => {
      const linePrice  = (item.price_cents + priceDelta) * quantity;

      // Milk selection (single-select)
      const milkMod = mods.find(m => m.type === 'single');
      const milkLabel = milkMod && milkMod.name !== 'Full Cream' ? milkMod.name : '';

      // Extras — group duplicates into "Extra Shot ×2"
      const extraCounts = {};
      mods.filter(m => m.type === 'toggle').forEach(m => {
        extraCounts[m.name] = (extraCounts[m.name] || 0) + 1;
      });
      const extraLabel = Object.entries(extraCounts)
        .map(([name, count]) => count > 1 ? `${name} ×${count}` : name)
        .join(', ');

      const modSummary = [milkLabel, extraLabel].filter(Boolean).join(' · ');

      return `
        <div class="pos-cart-item">
          <div class="pos-cart-item__info">
            <span class="pos-cart-item__name">${item.name}${quantity > 1 ? ` ×${quantity}` : ''}</span>
            ${modSummary ? `<span class="pos-cart-item__mods">${modSummary}</span>` : ''}
          </div>
          <div class="pos-cart-item__qty">
            <button class="pos-cart-item__qty-btn" data-idx="${idx}" data-delta="-1" type="button" aria-label="Remove one">−</button>
            <span class="pos-cart-item__qty-num">${quantity}</span>
            <button class="pos-cart-item__qty-btn" data-idx="${idx}" data-delta="1" type="button" aria-label="Add one more">+</button>
          </div>
          <span class="pos-cart-item__price">${formatRand(linePrice)}</span>
          <button class="pos-cart-item__remove" data-idx="${idx}" type="button" aria-label="Remove item" title="Remove from order">✕</button>
        </div>`;
    }).join('');

    cartItemsEl.querySelectorAll('.pos-cart-item__qty-btn').forEach(btn => {
      btn.addEventListener('click', () =>
        updateCartQty(parseInt(btn.dataset.idx), parseInt(btn.dataset.delta)));
    });

    // × remove button — removes item entirely
    cartItemsEl.querySelectorAll('.pos-cart-item__remove').forEach(btn => {
      btn.addEventListener('click', () => {
        cart.splice(parseInt(btn.dataset.idx), 1);
        renderCart();
        renderMenu();
      });
    });

    updateTotals();
  };

  /**
   * Recalculate subtotal, apply free-coffee discount, and refresh UI.
   */
  const updateTotals = () => {
    const subtotal = cart.reduce((sum, { item, quantity, priceDelta }) =>
      sum + (item.price_cents + priceDelta) * quantity, 0);

    const isFreePayment = selectedPayment === 'free_coffee';
    const discount      = isFreePayment ? subtotal : 0;
    const total         = Math.max(0, subtotal - discount);

    subtotalEl.textContent = formatRand(subtotal);
    totalEl.textContent    = formatRand(total);

    if (discount > 0) {
      discountRow.style.display = 'flex';
      discountEl.textContent    = `−${formatRand(discount)}`;
    } else {
      discountRow.style.display = 'none';
    }

    chargeBtn.disabled    = cart.length === 0;
    chargeBtn.textContent = cart.length === 0 ? 'Add items to charge' : `Charge ${formatRand(total)}`;
  };

  // ── Walk-in toggle ─────────────────────────────────────────────────────────

  walkInToggle?.addEventListener('change', () => {
    isWalkIn = walkInToggle.checked;
    customerSection.style.display = isWalkIn ? 'none' : 'flex';

    if (isWalkIn) {
      // Clear any selected customer
      clearCustomer(false);
      // Remove free coffee option if selected
      if (selectedPayment === 'free_coffee') {
        selectedPayment = 'cash';
        document.querySelectorAll('.pos-payment__option').forEach(b =>
          b.classList.toggle('pos-payment__option--selected', b.dataset.method === 'cash'));
      }
    }

    updatePaymentOptions();
    updateTotals();
  });

  // ── Customer lookup ────────────────────────────────────────────────────────

  let searchDebounce = null;

  customerSearch?.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = customerSearch.value.trim();
    if (q.length < 2) {
      customerDropdown.classList.remove('pos-customer__dropdown--open');
      customerDropdown.innerHTML = '';
      return;
    }
    searchDebounce = setTimeout(() => searchCustomers(q), 300);
  });

  customerSearch?.addEventListener('blur', () => {
    setTimeout(() => {
      customerDropdown.classList.remove('pos-customer__dropdown--open');
    }, 200);
  });

  /**
   * Search customers by name or phone via the API.
   * @param {string} query
   */
  const searchCustomers = async (query) => {
    try {
      const res = await adminAuth.apiFetch(`/api/customers?search=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const customers = await res.json();

      if (!customers.length) {
        customerDropdown.innerHTML = '<div class="pos-customer__option pos-customer__option--no-results">No customers found</div>';
      } else {
        customerDropdown.innerHTML = customers.slice(0, 6).map(c => `
          <div class="pos-customer__option" data-id="${c.id}">
            <span>${c.first_name} ${c.last_name}</span>
            <span class="pos-customer__option-phone">${c.phone ?? ''}</span>
          </div>
        `).join('');

        customerDropdown.querySelectorAll('.pos-customer__option[data-id]').forEach(opt => {
          opt.addEventListener('click', () =>
            selectCustomer(customers.find(c => c.id === parseInt(opt.dataset.id))));
        });
      }

      customerDropdown.classList.add('pos-customer__dropdown--open');
    } catch (_) { /* ignore */ }
  };

  /**
   * Set the selected customer and fetch their stamp count.
   * @param {object} customer
   */
  const selectCustomer = async (customer) => {
    selectedCustomer = customer;
    customerDropdown.classList.remove('pos-customer__dropdown--open');
    customerSearchWrap.style.display = 'none';
    customerSelected.style.display  = 'flex';

    customerSelected.querySelector('.pos-customer__selected-name').textContent =
      `${customer.first_name} ${customer.last_name}`;
    customerSelected.querySelector('.pos-customer__selected-stamps').textContent =
      'Loading stamps…';

    // Fetch stamp info
    try {
      const res = await adminAuth.apiFetch(`/api/loyalty/${customer.id}`);
      if (res.ok) {
        const data = await res.json();
        customerStamps = data;
        const stamps      = data.stamp_count ?? data.summary?.stampCount ?? 0;
        const hasReward   = data.summary?.hasReward ?? false;
        const stampsToFree = data.summary?.stampsToFree ?? (9 - stamps);

        customerSelected.querySelector('.pos-customer__selected-stamps').textContent =
          `${stamps} / 9 stamps`;

        if (stampBadge) {
          stampBadge.textContent = `${stamps} stamp${stamps !== 1 ? 's' : ''}`;
          stampBadge.style.display = 'inline-block';
        }

        if (freeBadge) {
          freeBadge.style.display = hasReward ? 'block' : 'none';
        }

        updatePaymentOptions();
      }
    } catch (_) {
      customerSelected.querySelector('.pos-customer__selected-stamps').textContent = 'Could not load stamps';
    }

    updateTotals();
  };

  /**
   * Clear the selected customer.
   * @param {boolean} [resetSearch=true]
   */
  const clearCustomer = (resetSearch = true) => {
    selectedCustomer  = null;
    customerStamps    = null;

    customerSelected.style.display  = 'none';
    customerSearchWrap.style.display = 'block';

    if (resetSearch) {
      customerSearch.value = '';
      customerDropdown.innerHTML = '';
      customerDropdown.classList.remove('pos-customer__dropdown--open');
    }

    if (stampBadge) stampBadge.style.display = 'none';
    if (freeBadge)  freeBadge.style.display  = 'none';

    // Deselect free coffee if it was active
    if (selectedPayment === 'free_coffee') {
      selectedPayment = 'cash';
      document.querySelectorAll('.pos-payment__option').forEach(b =>
        b.classList.toggle('pos-payment__option--selected', b.dataset.method === 'cash'));
    }

    updatePaymentOptions();
    updateTotals();
  };

  document.getElementById('pos-customer-clear')?.addEventListener('click', () => clearCustomer());

  // ── New customer modal ─────────────────────────────────────────────────────

  newCustomerBtn?.addEventListener('click', () => {
    newCustomerModal.classList.add('pos-modal-overlay--open');
    newCustomerError.textContent = '';
    newCustomerForm?.reset();
  });

  document.getElementById('pos-new-customer-cancel')?.addEventListener('click', () => {
    newCustomerModal.classList.remove('pos-modal-overlay--open');
  });

  newCustomerModal?.addEventListener('click', e => {
    if (e.target === newCustomerModal) newCustomerModal.classList.remove('pos-modal-overlay--open');
  });

  newCustomerForm?.addEventListener('submit', async e => {
    e.preventDefault();
    newCustomerError.textContent = '';

    const fd = new FormData(newCustomerForm);
    const payload = {
      first_name: fd.get('first_name')?.trim(),
      last_name:  fd.get('last_name')?.trim(),
      email:      fd.get('email')?.trim() || null,
      phone:      fd.get('phone')?.trim() || null,
      password_hash: null
    };

    const submitBtn = newCustomerForm.querySelector('[type="submit"]');
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Saving…';

    try {
      const res = await adminAuth.apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        newCustomerError.textContent = data.error || 'Could not create customer.';
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Add Customer';
        return;
      }

      newCustomerModal.classList.remove('pos-modal-overlay--open');
      await selectCustomer(data);
    } catch (err) {
      newCustomerError.textContent = 'Network error — please try again.';
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Add Customer';
    }
  });

  // ── Payment options ────────────────────────────────────────────────────────

  /**
   * Update payment option buttons — enable/disable Free Coffee based on stamps.
   */
  const updatePaymentOptions = () => {
    const hasReward    = customerStamps?.summary?.hasReward ?? false;
    const freeCoffeeBtn = document.querySelector('.pos-payment__option[data-method="free_coffee"]');
    if (freeCoffeeBtn) {
      freeCoffeeBtn.disabled = !hasReward || isWalkIn;
      freeCoffeeBtn.title    = !hasReward ? 'Customer needs 9 stamps first' : '';
    }
  };

  document.querySelectorAll('.pos-payment__option').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      selectedPayment = btn.dataset.method;
      document.querySelectorAll('.pos-payment__option').forEach(b =>
        b.classList.toggle('pos-payment__option--selected', b === btn));
      updateTotals();
    });
  });

  // ── Submit order ───────────────────────────────────────────────────────────

  /**
   * POST the order to /api/orders, then show the receipt on success.
   */
  const submitOrder = async () => {
    if (!cart.length) return;

    chargeBtn.disabled    = true;
    chargeBtn.textContent = 'Processing…';

    const payload = {
      items: cart.map(({ item, quantity, mods }) => ({
        menuItemId:  item.id,
        quantity,
        modifierIds: mods.map(m => m.modId),
        notes:       ''
      })),
      paymentMethod: selectedPayment,
      customerId:    (!isWalkIn && selectedCustomer) ? selectedCustomer.id : null,
      isWalkIn
    };

    try {
      const res = await adminAuth.apiFetch('/api/orders', {
        method: 'POST',
        body:   JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showInlineError(err.error || 'Order failed. Please try again.');
        chargeBtn.disabled    = false;
        updateTotals();
        return;
      }

      const result = await res.json();
      showReceipt(result);

    } catch (err) {
      showInlineError('Network error — please try again.');
      chargeBtn.disabled = false;
      updateTotals();
    }
  };

  /**
   * Show an inline error message near the charge button.
   * @param {string} message
   */
  const showInlineError = (message) => {
    let errEl = document.getElementById('pos-submit-error');
    if (!errEl) {
      errEl = document.createElement('p');
      errEl.id = 'pos-submit-error';
      errEl.className = 'pos-submit-error';
      chargeBtn.insertAdjacentElement('beforebegin', errEl);
    }
    errEl.textContent = message;
    setTimeout(() => { errEl.textContent = ''; }, 5000);
  };

  // Wire submit button now that submitOrder is defined
  chargeBtn?.addEventListener('click', submitOrder);

  // ── Receipt ────────────────────────────────────────────────────────────────

  /**
   * Show the order receipt modal and refresh stamp info if customer was set.
   * @param {object} result  API response from POST /api/orders
   */
  const showReceipt = async (result) => {
    const subtotal = cart.reduce((sum, { item, quantity, priceDelta }) =>
      sum + (item.price_cents + priceDelta) * quantity, 0);

    const itemRows = cart.map(({ item, quantity, mods, priceDelta }) => {
      const linePrice  = (item.price_cents + priceDelta) * quantity;
      const modSummary = mods.map(m => m.name).filter(Boolean).join(', ');
      return `
        <div class="pos-receipt__row">
          <span>${item.name}${modSummary ? ` <small>(${modSummary})</small>` : ''} × ${quantity}</span>
          <span>${formatRand(linePrice)}</span>
        </div>`;
    }).join('');

    // Fetch updated stamp count if customer was set
    let stampHtml = '';
    if (!isWalkIn && selectedCustomer) {
      try {
        const sRes = await adminAuth.apiFetch(`/api/loyalty/${selectedCustomer.id}`);
        if (sRes.ok) {
          const sData    = await sRes.json();
          const stamps   = sData.stamp_count ?? sData.summary?.stampCount ?? 0;
          const hasReward = sData.summary?.hasReward ?? false;
          stampHtml = `
            <div class="pos-receipt__loyalty">
              ${selectedCustomer.first_name} now has ${stamps} / 9 stamps
              ${hasReward ? ' — Free coffee ready!' : ''}
            </div>`;
          // Update in-session state
          customerStamps = sData;
          customerSelected.querySelector('.pos-customer__selected-stamps').textContent =
            `${stamps} / 9 stamps`;
          if (stampBadge) stampBadge.textContent = `${stamps} stamp${stamps !== 1 ? 's' : ''}`;
          if (freeBadge)  freeBadge.style.display  = hasReward ? 'block' : 'none';
          updatePaymentOptions();
        }
      } catch (_) { /* ignore stamp refresh errors */ }
    }

    document.getElementById('pos-receipt-body').innerHTML = `
      <div class="pos-receipt__check">✓</div>
      <h2 class="pos-receipt__title">Order Complete</h2>
      ${result.orderId ? `<p class="pos-receipt__order-id">Order #${result.orderId}</p>` : ''}
      <hr class="pos-receipt__divider">
      ${itemRows}
      <hr class="pos-receipt__divider">
      ${result.discountCents > 0
        ? `<div class="pos-receipt__row"><span>Subtotal</span><span>${formatRand(subtotal)}</span></div>
           <div class="pos-receipt__row"><span>Discount</span><span style="color:var(--status-completed)">−${formatRand(result.discountCents)}</span></div>`
        : ''}
      <div class="pos-receipt__row pos-receipt__row--total">
        <span>Total</span><span>${formatRand(result.totalCents ?? subtotal)}</span>
      </div>
      <div class="pos-receipt__row">
        <span>Payment</span><span>${titleCase(selectedPayment.replace('_', ' '))}</span>
      </div>
      ${stampHtml}
    `;

    receiptOverlay.classList.add('pos-receipt-overlay--open');
  };

  /**
   * Reset the POS to a clean state after an order is complete.
   */
  const resetOrder = () => {
    cart           = [];
    selectedPayment = 'cash';

    document.querySelectorAll('.pos-payment__option').forEach(b =>
      b.classList.toggle('pos-payment__option--selected', b.dataset.method === 'cash'));

    // Reset walk-in toggle
    if (walkInToggle) {
      walkInToggle.checked = false;
      isWalkIn = false;
      customerSection.style.display = 'flex';
    }

    // Keep customer selected between orders (barista convenience)
    renderCart();
    renderMenu();
    updatePaymentOptions();
  };

  document.getElementById('pos-receipt-close')?.addEventListener('click', () => {
    receiptOverlay.classList.remove('pos-receipt-overlay--open');
    resetOrder();
  });

  // ── Topbar + logout ────────────────────────────────────────────────────────

  adminAuth.renderTopbar();
  document.getElementById('logout-btn')?.addEventListener('click', () => adminAuth.logout());

  // ── Init ───────────────────────────────────────────────────────────────────

  // Set default payment selection
  document.querySelector('.pos-payment__option[data-method="cash"]')
    ?.classList.add('pos-payment__option--selected');

  updatePaymentOptions();

  Promise.all([loadModifiers(), loadMenu()]).then(() => renderCart());

})();
