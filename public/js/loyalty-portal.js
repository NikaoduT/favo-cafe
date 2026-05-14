/**
 * loyalty-portal.js — Customer-facing loyalty portal
 *
 * Uses /api/customer-portal/* — public routes that issue customer JWTs.
 * No admin token required.
 *
 * Flows:
 *   Sign-up  → POST /api/customer-portal/signup → store token → dashboard
 *   Login    → POST /api/customer-portal/login  → store token → dashboard
 *   Dashboard → GET /api/customer-portal/me + /orders
 *   Update   → PUT /api/customer-portal/me
 *   Sign out → clear storage → show auth panel
 */

(() => {
  // ── Constants ────────────────────────────────────────────────────────────────
  const STAMPS_REQUIRED = 9;
  const TOKEN_KEY       = 'favo_customer_token';
  const BASE            = '/api/customer-portal';

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const authEl      = document.getElementById('loyalty-auth');
  const dashEl      = document.getElementById('loyalty-dashboard');
  const tabSignup   = document.getElementById('tab-signup');
  const tabLogin    = document.getElementById('tab-login');
  const panelSignup = document.getElementById('panel-signup');
  const panelLogin  = document.getElementById('panel-login');

  const signupForm  = document.getElementById('signup-form');
  const signupBtn   = document.getElementById('signup-btn');
  const signupError = document.getElementById('signup-error');

  const loginForm   = document.getElementById('login-form');
  const loginBtn    = document.getElementById('login-btn');
  const loginError  = document.getElementById('login-error');

  const dashName     = document.getElementById('dashboard-name');
  const dashTier     = document.getElementById('dashboard-tier');
  const stampGrid    = document.getElementById('stamp-grid');
  const stampText    = document.getElementById('stamp-progress-text');
  const rewardBanner = document.getElementById('reward-banner');
  const historyList  = document.getElementById('history-list');
  const signoutBtn   = document.getElementById('signout-btn');

  // ── Token helpers ─────────────────────────────────────────────────────────────

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const saveToken = (t) => localStorage.setItem(TOKEN_KEY, t);
  const clearToken = () => localStorage.removeItem(TOKEN_KEY);

  /**
   * Authenticated fetch against /api/customer-portal/*.
   * @param {string} path - relative to BASE, e.g. '/me'
   * @param {RequestInit} [opts]
   */
  const portalFetch = async (path, opts = {}) => {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    };
    return fetch(`${BASE}${path}`, { ...opts, headers });
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /** @param {number} cents @returns {string} */
  const fmt = (cents) => 'R ' + ((cents ?? 0) / 100).toFixed(2);

  /** @param {HTMLElement} el @param {string} msg */
  const showErr = (el, msg) => { if (el) { el.textContent = msg; el.style.display = 'block'; } };
  const hideErr = (el)      => { if (el) { el.textContent = ''; el.style.display  = 'none';  } };

  // ── Tab switching ─────────────────────────────────────────────────────────────

  const activateTab = (active, activePanel, inactive, inactivePanel) => {
    active.classList.add('loyalty-auth__tab--active');
    active.setAttribute('aria-selected', 'true');
    inactive.classList.remove('loyalty-auth__tab--active');
    inactive.setAttribute('aria-selected', 'false');
    activePanel.classList.remove('loyalty-auth__panel--hidden');
    inactivePanel.classList.add('loyalty-auth__panel--hidden');
  };

  tabSignup?.addEventListener('click', () => activateTab(tabSignup, panelSignup, tabLogin, panelLogin));
  tabLogin?.addEventListener('click',  () => activateTab(tabLogin,  panelLogin,  tabSignup, panelSignup));

  // ── Stamp card ────────────────────────────────────────────────────────────────

  /** @param {number} stamps */
  const renderStamps = (stamps) => {
    if (!stampGrid) return;
    stampGrid.innerHTML = '';
    for (let i = 0; i < STAMPS_REQUIRED; i++) {
      const el = document.createElement('div');
      el.className = `loyalty-stamp ${i < stamps ? 'loyalty-stamp--earned' : 'loyalty-stamp--empty'}`;
      el.setAttribute('aria-label', i < stamps ? `Stamp ${i + 1} earned` : `Stamp ${i + 1} empty`);
      el.textContent = i < stamps ? '☕' : '';
      stampGrid.appendChild(el);
    }
    if (stampText) {
      const left = STAMPS_REQUIRED - (stamps % STAMPS_REQUIRED);
      stampText.innerHTML = stamps > 0 && stamps % STAMPS_REQUIRED === 0
        ? `<strong>Free drink unlocked!</strong> Show this to the barista to redeem.`
        : `<strong>${stamps % STAMPS_REQUIRED}/${STAMPS_REQUIRED}</strong> stamps — ${left} more to your free coffee.`;
    }
  };

  // ── Visit history ─────────────────────────────────────────────────────────────

  /** @param {Array} orders */
  const renderHistory = (orders) => {
    if (!historyList) return;
    historyList.innerHTML = '';

    if (!orders?.length) {
      const li = document.createElement('li');
      li.className = 'loyalty-history__empty';
      li.textContent = 'No visits yet — your order history will appear here after your first purchase.';
      historyList.appendChild(li);
      return;
    }

    orders.slice(0, 20).forEach(order => {
      const li = document.createElement('li');
      li.className = 'loyalty-history__item';

      const date = new Date(order.created_at);
      const dateStr = date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

      const items = order.items?.length
        ? order.items.map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')
        : order.payment_method?.replace('_', ' ') ?? 'Visit';

      li.innerHTML = `
        <div>
          <p class="loyalty-history__date">${dateStr}</p>
          <p class="loyalty-history__items-list">${items}</p>
        </div>
        <span class="loyalty-history__amount">${fmt(order.total_cents)}</span>
      `;
      historyList.appendChild(li);
    });
  };

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  /**
   * Populate the dashboard from /me and /orders responses.
   * @param {object} me
   * @param {Array}  orders
   */
  const showDashboard = (me, orders = []) => {
    if (authEl) authEl.hidden = true;
    if (dashEl) dashEl.classList.add('loyalty-dashboard--visible');

    if (dashName) dashName.textContent = `${me.first_name} ${me.last_name}`;
    if (dashTier) dashTier.textContent = (me.loyalty_tier || 'bronze');

    const stamps = me.stamps ?? me.points ?? 0;
    renderStamps(stamps);

    // Reward banner: show when stamps just completed a card (mod == 0 and > 0 visits)
    const hasReward = stamps > 0 && stamps % STAMPS_REQUIRED === 0;
    if (rewardBanner) rewardBanner.classList.toggle('loyalty-reward--visible', hasReward || me.birthdayRewardActive);

    renderHistory(orders);
  };

  // ── Load dashboard ────────────────────────────────────────────────────────────

  const loadDashboard = async () => {
    try {
      const [meRes, ordersRes] = await Promise.all([
        portalFetch('/me'),
        portalFetch('/orders'),
      ]);

      if (meRes.status === 401) { signOut(); return; }
      if (!meRes.ok)            { return; }

      const me     = await meRes.json();
      const orders = ordersRes.ok ? await ordersRes.json() : [];

      showDashboard(me, orders);
    } catch {
      // Network issue — stay on auth panel
    }
  };

  // ── Restore session ───────────────────────────────────────────────────────────

  const tryRestoreSession = async () => {
    if (!getToken()) return;
    await loadDashboard();
  };

  // ── Sign-up ───────────────────────────────────────────────────────────────────

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErr(signupError);

    const firstName     = document.getElementById('signup-first')?.value.trim();
    const lastName      = document.getElementById('signup-last')?.value.trim();
    const phone         = document.getElementById('signup-phone')?.value.trim();
    const email         = document.getElementById('signup-email')?.value.trim() || null;
    const password      = document.getElementById('signup-password')?.value;
    const birthdayRaw   = document.getElementById('signup-birthday')?.value;
    const defaultMilk   = document.getElementById('signup-milk')?.value || null;
    const defaultSize   = document.getElementById('signup-size')?.value || null;
    const marketingOptIn = document.getElementById('signup-marketing')?.checked ? 1 : 0;

    if (!firstName || !lastName || !phone) {
      showErr(signupError, 'First name, last name, and phone are required.');
      return;
    }
    if (!password || password.length < 6) {
      showErr(signupError, 'Password must be at least 6 characters.');
      return;
    }

    signupBtn.disabled = true;
    signupBtn.textContent = 'Creating account…';

    try {
      const res  = await portalFetch('/signup', {
        method: 'POST',
        body: JSON.stringify({ firstName, lastName, phone, email, password, birthday: birthdayRaw || null, defaultMilk, defaultSize, marketingOptIn }),
      });
      const data = await res.json();

      if (!res.ok) {
        showErr(signupError, data.error ?? 'Could not create account. Please try again.');
        return;
      }

      saveToken(data.token);
      await loadDashboard();
      signupForm.reset();

    } catch {
      showErr(signupError, 'Network error — please check your connection.');
    } finally {
      signupBtn.disabled = false;
      signupBtn.textContent = 'Create my account';
    }
  });

  // ── Login ─────────────────────────────────────────────────────────────────────

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErr(loginError);

    const phone    = document.getElementById('login-phone')?.value.trim();
    const password = document.getElementById('login-password')?.value;

    if (!phone) {
      showErr(loginError, 'Please enter your phone number.');
      return;
    }
    if (!password) {
      showErr(loginError, 'Please enter your password.');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Looking up…';

    try {
      const res  = await portalFetch('/login', { method: 'POST', body: JSON.stringify({ phone, password }) });
      const data = await res.json();

      if (res.status === 404) {
        showErr(loginError, 'No account found. Check your number or sign up above.');
        return;
      }
      if (!res.ok) {
        showErr(loginError, data.error ?? 'Could not log in. Please try again.');
        return;
      }

      saveToken(data.token);
      await loadDashboard();
      loginForm.reset();

    } catch {
      showErr(loginError, 'Network error — please check your connection.');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Find my account';
    }
  });

  // ── Sign out ──────────────────────────────────────────────────────────────────

  const signOut = () => {
    clearToken();
    if (authEl) authEl.hidden = false;
    if (dashEl) dashEl.classList.remove('loyalty-dashboard--visible');
    signupForm?.reset();
    loginForm?.reset();
    activateTab(tabSignup, panelSignup, tabLogin, panelLogin);
  };

  signoutBtn?.addEventListener('click', signOut);

  // ── Init ──────────────────────────────────────────────────────────────────────
  tryRestoreSession();
})();
