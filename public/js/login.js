/**
 * login.js — Unified Sign In + Create Account page.
 *
 * Sign In:
 *   - All users (staff + customers) identify by email + 6-digit PIN.
 *   - Tries /api/auth/login (staff) first; if 401 tries /api/customer-portal/login.
 *   - Redirects: admin → /admin/dashboard.html | barista → /admin/pos.html | customer → /portal.html
 *
 * Create Account:
 *   - Customers only. Calls /api/customer-portal/signup.
 *   - 6-digit numeric PIN required.
 *   - On success: saves customer token + redirects to /portal.html.
 *
 * Token storage:
 *   - Staff:    sessionStorage  favo_admin_token + favo_admin_user
 *   - Customer: localStorage    favo_customer_token + favo_customer
 */

(() => {
  const ADMIN_TOKEN_KEY    = 'favo_admin_token';
  const ADMIN_USER_KEY     = 'favo_admin_user';
  const CUSTOMER_TOKEN_KEY = 'favo_customer_token';
  const CUSTOMER_KEY       = 'favo_customer';

  // ── Element refs ──────────────────────────────────────────────
  const tabSignin    = document.getElementById('tab-signin');
  const tabRegister  = document.getElementById('tab-register');
  const panelSignin  = document.getElementById('panel-signin');
  const panelReg     = document.getElementById('panel-register');

  const signinForm   = document.getElementById('signin-form');
  const signinError  = document.getElementById('signin-error');
  const signinBtn    = document.getElementById('signin-submit');
  const signinLabel  = document.getElementById('signin-label');

  const regForm      = document.getElementById('register-form');
  const regError     = document.getElementById('register-error');
  const regBtn       = document.getElementById('register-submit');
  const regLabel     = document.getElementById('register-label');

  // ── Tab switching ─────────────────────────────────────────────
  const switchTab = (active) => {
    const isSignin = active === 'signin';

    tabSignin.classList.toggle('auth-form__tab--active',   isSignin);
    tabRegister.classList.toggle('auth-form__tab--active', !isSignin);
    tabSignin.setAttribute('aria-selected',   isSignin ? 'true' : 'false');
    tabRegister.setAttribute('aria-selected', isSignin ? 'false' : 'true');

    panelSignin.classList.toggle('auth-form__panel--hidden', !isSignin);
    panelReg.classList.toggle('auth-form__panel--hidden',     isSignin);
  };

  tabSignin?.addEventListener('click',   () => switchTab('signin'));
  tabRegister?.addEventListener('click', () => switchTab('register'));

  // ── PIN show/hide toggles ─────────────────────────────────────
  document.querySelectorAll('[data-toggle-pin]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePin);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.setAttribute('aria-label', isHidden ? 'Hide PIN' : 'Show PIN');
    });
  });

  // ── Helpers ───────────────────────────────────────────────────
  /**
   * Show an error in the given element.
   * @param {HTMLElement} el
   * @param {string} msg
   */
  const showError = (el, msg) => {
    el.textContent = msg;
    el.classList.add('auth-form__error--visible');
  };

  const hideError = (el) => {
    el.textContent = '';
    el.classList.remove('auth-form__error--visible');
  };

  const setLoading = (btn, labelEl, text, loading) => {
    btn.disabled = loading;
    labelEl.textContent = loading ? text : labelEl.dataset.default || labelEl.textContent;
  };

  /**
   * Validate a 6-digit numeric PIN.
   * @param {string} pin
   * @returns {boolean}
   */
  const validPin = (pin) => /^\d{6}$/.test(pin);

  /**
   * Determine redirect URL based on user role.
   * @param {object} user
   * @returns {string}
   */
  const staffRedirect = (user) => {
    if (user.role === 'barista') return '/admin/pos.html';
    return '/admin/dashboard.html'; // admin
  };

  // ── Sign In ───────────────────────────────────────────────────
  signinForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(signinError);

    const email = signinForm.email.value.trim().toLowerCase();
    const pin   = signinForm.pin.value.trim();

    if (!email) { showError(signinError, 'Please enter your email address.'); return; }
    if (!validPin(pin)) { showError(signinError, 'Your PIN must be exactly 6 digits.'); return; }

    signinBtn.disabled = true;
    signinLabel.textContent = 'Signing in…';

    try {
      // ── Try staff login first ──────────────────────────────
      const staffRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pin }),
      });

      if (staffRes.ok) {
        const { token, user } = await staffRes.json();
        sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
        sessionStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
        window.location.href = staffRedirect(user);
        return;
      }

      // ── Try customer login ─────────────────────────────────
      const custRes = await fetch('/api/customer-portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pin }),
      });

      if (custRes.ok) {
        const { token, customer } = await custRes.json();
        localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
        localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
        window.location.href = '/portal.html';
        return;
      }

      // Both failed — show error from staff response (more generic)
      const errData = await staffRes.json().catch(() => ({}));
      showError(signinError, errData.error || 'Incorrect email or PIN. Please try again.');

    } catch {
      showError(signinError, 'Network error — please check your connection and try again.');
    } finally {
      signinBtn.disabled = false;
      signinLabel.textContent = 'Sign in';
    }
  });

  // ── Create Account ────────────────────────────────────────────
  regForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(regError);

    const firstName  = regForm.firstName.value.trim();
    const lastName   = regForm.lastName.value.trim();
    const email      = regForm.email.value.trim().toLowerCase();
    const phone      = regForm.phone.value.trim();
    const pin        = regForm.pin.value.trim();
    const pinConfirm = regForm.pinConfirm.value.trim();

    // Client-side validation
    if (!firstName || !lastName) { showError(regError, 'Please enter your first and last name.'); return; }
    if (!email)                  { showError(regError, 'Please enter your email address.'); return; }
    if (!validPin(pin))          { showError(regError, 'Your PIN must be exactly 6 digits (numbers only).'); return; }
    if (pin !== pinConfirm)      { showError(regError, 'PINs do not match. Please try again.'); return; }

    regBtn.disabled = true;
    regLabel.textContent = 'Creating account…';

    try {
      const res = await fetch('/api/customer-portal/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, phone: phone || null, password: pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        showError(regError, data.error || 'Could not create account. Please try again.');
        return;
      }

      localStorage.setItem(CUSTOMER_TOKEN_KEY, data.token);
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify(data.customer));
      window.location.href = '/portal.html';

    } catch {
      showError(regError, 'Network error — please check your connection and try again.');
    } finally {
      regBtn.disabled = false;
      regLabel.textContent = 'Create account';
    }
  });

  // ── Allow switching to register tab via URL hash ──────────────
  if (window.location.hash === '#register') {
    switchTab('register');
  }

})();
