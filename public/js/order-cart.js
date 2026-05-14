/**
 * order-cart.js — Online ordering cart
 *
 * Flow:
 *   1. Fetch menu from /api/menu → render category tabs + item grid
 *   2. Tap item → open modifier modal (Size, Milk, Extra Shot, Syrup)
 *   3. Confirm → add line item to cart state → re-render cart
 *   4. Checkout → show confirmation panel (Yoco payment deferred to Phase 9b)
 */

(() => {
  // ── Constants ──────────────────────────────────────────────────────────────
  const CATEGORY_EMOJIS = {
    espresso: '☕', filter: '🫗', cold: '🧊', tea: '🍵', food: '🥐', retail: '🫘',
  };
  const CATEGORY_ORDER = ['espresso', 'filter', 'cold', 'tea', 'food', 'retail'];

  // Modifier groups (mirrors data/modifier-groups.json)
  // Loaded from the API in a full implementation; hardcoded here for MVP.
  const MODIFIER_GROUPS = [
    {
      id: 1, name: 'Size', selectionType: 'single', required: true,
      modifiers: [
        { id: 1, name: 'Small',  priceDelta: 0 },
        { id: 2, name: 'Medium', priceDelta: 500 },
        { id: 3, name: 'Large',  priceDelta: 1000 },
      ],
    },
    {
      id: 2, name: 'Milk', selectionType: 'single', required: true,
      modifiers: [
        { id: 4, name: 'Full Cream', priceDelta: 0 },
        { id: 5, name: 'Skim',       priceDelta: 0 },
        { id: 6, name: 'Oat',        priceDelta: 500 },
        { id: 7, name: 'Almond',     priceDelta: 500 },
        { id: 8, name: 'Soy',        priceDelta: 500 },
      ],
    },
    {
      id: 3, name: 'Extra Shot', selectionType: 'multiple', required: false,
      modifiers: [{ id: 9, name: 'Extra Shot', priceDelta: 800 }],
    },
    {
      id: 4, name: 'Syrup', selectionType: 'multiple', required: false,
      modifiers: [
        { id: 10, name: 'Vanilla',  priceDelta: 500 },
        { id: 11, name: 'Caramel',  priceDelta: 500 },
        { id: 12, name: 'Hazelnut', priceDelta: 500 },
      ],
    },
  ];

  // Drink categories that get modifiers
  const MODIFIER_CATEGORIES = new Set(['espresso', 'filter', 'cold', 'tea']);

  // ── State ─────────────────────────────────────────────────────────────────
  /** @type {Array<{id:number, name:string, category:string, description:string, price_cents:number, available:boolean}>} */
  let menuItems = [];
  let activeCategory = '';

  /** @type {Array<{lineId:string, itemId:number, name:string, baseCents:number, modifiers:Array, totalCents:number}>} */
  let cart = [];

  // Modifier modal state
  let modalItem = null;
  /** @type {Map<number, Set<number>>} groupId → set of selected modifier IDs */
  let modalSelections = new Map();

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const tabsEl       = document.getElementById('order-tabs');
  const gridEl       = document.getElementById('order-grid');
  const cartItemsEl  = document.getElementById('cart-items');
  const cartCountEl  = document.getElementById('cart-count');
  const cartSubEl    = document.getElementById('cart-subtotal');
  const cartTotalEl  = document.getElementById('cart-total');
  const checkoutBtn  = document.getElementById('checkout-btn');
  const pickupSel    = document.getElementById('pickup-time');

  const modOverlay   = document.getElementById('mod-overlay');
  const modTitle     = document.getElementById('mod-title');
  const modGroups    = document.getElementById('mod-groups');
  const modAddBtn    = document.getElementById('mod-add-btn');
  const modClose     = document.getElementById('mod-close');

  const confirmEl    = document.getElementById('order-confirm');

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** @param {number} cents @returns {string} */
  const fmt = (cents) => 'R ' + (cents / 100).toFixed(2);

  /** Generate a unique line ID */
  const uid = () => Math.random().toString(36).slice(2, 8);

  // ── Pickup time options ───────────────────────────────────────────────────

  /** JS getDay() → cafe-hours.json day key */
  const DOW_KEYS  = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /** @param {string} hhmm @returns {number} total minutes since midnight */
  const hhmm2min = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
  };

  /** @param {number} totalMin @returns {string} "H:MM" */
  const min2hhmm = (totalMin) => {
    const h  = Math.floor(totalMin / 60);
    const mm = String(totalMin % 60).padStart(2, '0');
    return `${h}:${mm}`;
  };

  /**
   * Fetch /api/hours then populate the pickup-time <select>.
   * Uses the weekly schedule and orderAhead config from cafe-hours.json.
   */
  const buildPickupOptions = async () => {
    if (!pickupSel) return;
    pickupSel.innerHTML = '';

    let weekly    = null;
    let leadMin   = 10;
    let cutoffMin = 5;
    let slotMin   = 5;

    try {
      const res  = await fetch('/api/hours');
      const data = await res.json();
      weekly    = data.weekly ?? null;
      leadMin   = data.orderAhead?.leadMinutes   ?? 10;
      cutoffMin = data.orderAhead?.cutoffMinutes ?? 5;
      slotMin   = data.orderAhead?.slotMinutes   ?? 5;
    } catch {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Could not load hours — please call us';
      pickupSel.appendChild(opt);
      return;
    }

    if (!weekly) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Hours unavailable';
      pickupSel.appendChild(opt);
      return;
    }

    const now       = new Date();
    const todayDow  = now.getDay();
    const minutesNow = now.getHours() * 60 + now.getMinutes();

    // ── Today's slots ──────────────────────────────────────────────────
    const todayWin = weekly[DOW_KEYS[todayDow]];
    if (todayWin) {
      const openMin  = hhmm2min(todayWin.open);
      const closeMin = hhmm2min(todayWin.close);
      const startMin = Math.ceil((minutesNow + leadMin) / slotMin) * slotMin;
      const endMin   = closeMin - cutoffMin;

      if (startMin <= endMin && minutesNow < closeMin) {
        for (let m = startMin; m <= endMin; m += slotMin) {
          const opt = document.createElement('option');
          opt.value = `today-${m}`;
          opt.textContent = `Today at ${min2hhmm(m)}`;
          pickupSel.appendChild(opt);
        }
      }
    }

    // ── Next open day slots (scan the coming 6 days) ───────────────────
    for (let i = 1; i <= 6; i++) {
      const dow = (todayDow + i) % 7;
      const win = weekly[DOW_KEYS[dow]];
      if (!win) continue;

      const openMin  = hhmm2min(win.open);
      const closeMin = hhmm2min(win.close);
      const endMin   = closeMin - cutoffMin;
      const label    = i === 1 ? 'Tomorrow' : DOW_SHORT[dow];

      for (let m = openMin; m <= endMin; m += slotMin) {
        const opt = document.createElement('option');
        opt.value = `${DOW_KEYS[dow]}-${m}`;
        opt.textContent = `${label} at ${min2hhmm(m)}`;
        pickupSel.appendChild(opt);
      }
      break; // only populate the very next open day
    }

    if (!pickupSel.options.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No pickup slots available right now';
      pickupSel.appendChild(opt);
    }
  };

  // ── Menu fetch + render ───────────────────────────────────────────────────

  const fetchMenu = async () => {
    try {
      const res  = await fetch('/api/menu');
      const data = await res.json();
      menuItems  = (data.items ?? data).filter(i => i.available);

      const categories = [...new Set(menuItems.map(i => i.category))]
        .sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));

      activeCategory = categories[0] ?? '';
      renderTabs(categories);
      renderGrid();
    } catch {
      if (gridEl) gridEl.innerHTML = '<li class="order-empty">Could not load menu. Please try again.</li>';
    }
  };

  /**
   * @param {string[]} categories
   */
  const renderTabs = (categories) => {
    if (!tabsEl) return;
    tabsEl.innerHTML = '';
    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `order-tab${cat === activeCategory ? ' order-tab--active' : ''}`;
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(cat === activeCategory));
      btn.setAttribute('aria-controls', 'order-grid');
      btn.dataset.category = cat;
      btn.textContent = `${CATEGORY_EMOJIS[cat] ?? ''} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
      btn.addEventListener('click', () => {
        activeCategory = cat;
        tabsEl.querySelectorAll('.order-tab').forEach(t => {
          t.classList.toggle('order-tab--active', t.dataset.category === cat);
          t.setAttribute('aria-selected', String(t.dataset.category === cat));
        });
        renderGrid();
      });
      tabsEl.appendChild(btn);
    });
  };

  const renderGrid = () => {
    if (!gridEl) return;
    const filtered = menuItems.filter(i => i.category === activeCategory);

    if (!filtered.length) {
      gridEl.innerHTML = '<li class="order-empty">Nothing in this category right now.</li>';
      return;
    }

    gridEl.innerHTML = '';
    filtered.forEach(item => {
      const li = document.createElement('li');
      li.className = 'order-item';
      li.setAttribute('role', 'listitem');
      const emoji = CATEGORY_EMOJIS[item.category] ?? '☕';
      li.innerHTML = `
        <div class="order-item__thumb" aria-hidden="true">${emoji}</div>
        <div class="order-item__body">
          <p class="order-item__name">${escHtml(item.name)}</p>
          ${item.description ? `<p class="order-item__desc">${escHtml(item.description)}</p>` : ''}
          <p class="order-item__price">${fmt(item.price_cents)}</p>
        </div>
      `;
      li.setAttribute('tabindex', '0');
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', `Add ${item.name} — ${fmt(item.price_cents)}`);
      li.addEventListener('click', () => openModModal(item));
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openModModal(item); });
      gridEl.appendChild(li);
    });
  };

  const escHtml = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // ── Modifier modal ────────────────────────────────────────────────────────

  /** @param {object} item */
  const openModModal = (item) => {
    modalItem = item;
    modalSelections = new Map();

    const needsMods = MODIFIER_CATEGORIES.has(item.category);

    if (!needsMods) {
      // No modifiers — add directly
      addToCart(item, []);
      return;
    }

    // Set defaults
    MODIFIER_GROUPS.forEach(group => {
      const defaultMod = group.modifiers.find(m => m.id === 4 /* Full Cream */) ??
                         (group.required ? group.modifiers[0] : null);
      if (defaultMod) {
        modalSelections.set(group.id, new Set([defaultMod.id]));
      } else {
        modalSelections.set(group.id, new Set());
      }
    });

    if (modTitle) modTitle.textContent = item.name;
    renderModGroups(item);

    if (modOverlay) modOverlay.hidden = false;
    modAddBtn?.focus();
  };

  /** @param {object} item */
  const renderModGroups = (item) => {
    if (!modGroups) return;
    modGroups.innerHTML = '';

    MODIFIER_GROUPS.forEach(group => {
      const section = document.createElement('div');
      section.className = 'order-modal__section';

      const title = document.createElement('p');
      title.className = 'order-modal__section-title';
      title.textContent = group.required ? `${group.name} *` : group.name;
      section.appendChild(title);

      const opts = document.createElement('div');
      opts.className = 'order-modal__options';
      opts.setAttribute('role', 'group');
      opts.setAttribute('aria-label', group.name);

      group.modifiers.forEach(mod => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `order-mod-btn${modalSelections.get(group.id)?.has(mod.id) ? ' order-mod-btn--selected' : ''}`;
        btn.dataset.groupId = group.id;
        btn.dataset.modId   = mod.id;
        btn.dataset.delta   = mod.priceDelta;
        btn.textContent = mod.priceDelta > 0
          ? `${mod.name} (+${fmt(mod.priceDelta)})`
          : mod.name;

        btn.addEventListener('click', () => {
          const sel = modalSelections.get(group.id) ?? new Set();
          if (group.selectionType === 'single') {
            sel.clear();
            sel.add(mod.id);
          } else {
            if (sel.has(mod.id)) sel.delete(mod.id);
            else sel.add(mod.id);
          }
          modalSelections.set(group.id, sel);
          renderModGroups(item);
        });

        opts.appendChild(btn);
      });

      section.appendChild(opts);
      modGroups.appendChild(section);
    });

    updateModAddBtn(item);
  };

  /** @param {object} item */
  const updateModAddBtn = (item) => {
    if (!modAddBtn) return;
    const delta = calcModDelta();
    modAddBtn.textContent = `Add to order — ${fmt(item.price_cents + delta)}`;
  };

  const calcModDelta = () => {
    let delta = 0;
    modalSelections.forEach((ids) => {
      ids.forEach(modId => {
        MODIFIER_GROUPS.forEach(g => {
          const mod = g.modifiers.find(m => m.id === modId);
          if (mod) delta += mod.priceDelta;
        });
      });
    });
    return delta;
  };

  const closeModModal = () => {
    if (modOverlay) modOverlay.hidden = true;
    modalItem = null;
  };

  modClose?.addEventListener('click', closeModModal);
  modOverlay?.addEventListener('click', (e) => { if (e.target === modOverlay) closeModModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModModal(); });

  modAddBtn?.addEventListener('click', () => {
    if (!modalItem) return;

    // Validate required groups
    for (const group of MODIFIER_GROUPS) {
      if (group.required && !(modalSelections.get(group.id)?.size > 0)) {
        alert(`Please select a ${group.name}.`);
        return;
      }
    }

    // Collect selected modifiers
    const selectedMods = [];
    modalSelections.forEach((ids, groupId) => {
      const group = MODIFIER_GROUPS.find(g => g.id === groupId);
      ids.forEach(modId => {
        const mod = group?.modifiers.find(m => m.id === modId);
        if (mod) selectedMods.push({ ...mod, groupName: group.name });
      });
    });

    addToCart(modalItem, selectedMods);
    closeModModal();
  });

  // ── Cart ──────────────────────────────────────────────────────────────────

  /**
   * @param {object} item
   * @param {Array} mods - selected modifier objects
   */
  const addToCart = (item, mods) => {
    const delta    = mods.reduce((sum, m) => sum + (m.priceDelta ?? 0), 0);
    const total    = item.price_cents + delta;
    const existing = cart.find(l =>
      l.itemId === item.id &&
      JSON.stringify(l.modifiers.map(m => m.id).sort()) === JSON.stringify(mods.map(m => m.id).sort())
    );

    if (existing) {
      existing.quantity = (existing.quantity ?? 1) + 1;
    } else {
      cart.push({
        lineId:     uid(),
        itemId:     item.id,
        name:       item.name,
        baseCents:  item.price_cents,
        modifiers:  mods,
        totalCents: total,
        quantity:   1,
      });
    }

    renderCart();
  };

  /** @param {string} lineId */
  const removeFromCart = (lineId) => {
    const idx = cart.findIndex(l => l.lineId === lineId);
    if (idx === -1) return;
    if (cart[idx].quantity > 1) cart[idx].quantity--;
    else cart.splice(idx, 1);
    renderCart();
  };

  const renderCart = () => {
    if (!cartItemsEl) return;

    const totalItems = cart.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal   = cart.reduce((sum, l) => sum + l.totalCents * l.quantity, 0);

    if (cartCountEl) cartCountEl.textContent = totalItems > 0 ? `${totalItems} item${totalItems > 1 ? 's' : ''}` : 'Nothing added yet';
    if (cartSubEl)   cartSubEl.textContent   = fmt(subtotal);
    if (cartTotalEl) cartTotalEl.textContent = fmt(subtotal);

    if (!cart.length) {
      cartItemsEl.innerHTML = `
        <div class="order-cart__empty">
          <span class="order-cart__empty-icon" aria-hidden="true">🛒</span>
          <p>Tap any item to add it to your order.</p>
        </div>
      `;
      if (checkoutBtn) { checkoutBtn.disabled = true; checkoutBtn.textContent = 'Add items to continue'; }
      return;
    }

    cartItemsEl.innerHTML = '';
    cart.forEach(line => {
      const div = document.createElement('div');
      div.className = 'order-line';

      const modLabel = line.modifiers
        .map(m => m.name)
        .join(', ');

      div.innerHTML = `
        <div class="order-line__info">
          <p class="order-line__name">${escHtml(line.name)}</p>
          ${modLabel ? `<p class="order-line__mods">${escHtml(modLabel)}</p>` : ''}
          <div class="order-line__qty">
            <button class="order-line__qty-btn" type="button" aria-label="Remove one ${line.name}" data-line="${line.lineId}">−</button>
            <span class="order-line__qty-num">${line.quantity}</span>
            <button class="order-line__qty-btn" type="button" aria-label="Add another ${line.name}" data-line="${line.lineId}" data-action="add">+</button>
          </div>
        </div>
        <span class="order-line__price">${fmt(line.totalCents * line.quantity)}</span>
      `;

      div.querySelector('[data-action="add"]')?.addEventListener('click', () => {
        const existing = cart.find(l => l.lineId === line.lineId);
        if (existing) { existing.quantity++; renderCart(); }
      });
      div.querySelector(`[data-line="${line.lineId}"]:not([data-action])`)?.addEventListener('click', () => removeFromCart(line.lineId));

      cartItemsEl.appendChild(div);
    });

    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = `Place order — ${fmt(subtotal)}`;
    }
  };

  // ── Checkout ──────────────────────────────────────────────────────────────
  checkoutBtn?.addEventListener('click', () => {
    if (!cart.length) return;

    const pickup = pickupSel?.value ?? '';
    const pickupLabel = pickupSel?.options[pickupSel?.selectedIndex]?.text ?? 'your selected time';

    // For MVP: show confirmation without payment.
    // Full Yoco Online payment flow will be wired here in Phase 9b.
    const confirmBody = document.getElementById('confirm-body');
    if (confirmBody) {
      confirmBody.textContent = `We'll have your order ready for pickup ${pickupLabel.toLowerCase()}.`;
    }

    if (confirmEl) confirmEl.classList.remove('order-confirm--hidden');

    // Clear cart after confirmation
    cart = [];
    renderCart();
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  buildPickupOptions();
  fetchMenu();
})();
