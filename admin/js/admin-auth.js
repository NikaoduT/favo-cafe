/**
 * admin-auth.js — Token management and session handling for admin pages.
 * Include on every admin/staff page. Redirects to /login.html if no valid token.
 */

const adminAuth = (() => {

  const TOKEN_KEY = 'favo_admin_token';
  const USER_KEY  = 'favo_admin_user';

  /** Store token and user payload after login. */
  const saveSession = (token, user) => {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  };

  /** Retrieve stored token. */
  const getToken = () => sessionStorage.getItem(TOKEN_KEY);

  /** Retrieve stored user object. */
  const getUser = () => {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  };

  /** Clear session and redirect to login. */
  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    window.location.href = '/login.html';
  };

  /**
   * Guard: call at the top of every protected admin page.
   * Redirects to /login.html if not authenticated or wrong role.
   * @param {string[]} allowedRoles — if empty, any authenticated user passes.
   * @returns {boolean}
   */
  const requireAuth = (allowedRoles = []) => {
    const token = getToken();
    const user  = getUser();

    if (!token || !user) {
      window.location.href = '/login.html';
      return false;
    }

    if (allowedRoles.length && !allowedRoles.includes(user.role)) {
      // Barista lands on POS, admin on dashboard — redirect to their home
      window.location.href = user.role === 'barista'
        ? '/admin/pos.html'
        : '/admin/dashboard.html';
      return false;
    }

    return true;
  };

  /**
   * Make an authenticated API request using the stored token.
   * Automatically logs out and redirects on 401.
   * @param {string} url
   * @param {RequestInit} options
   * @returns {Promise<Response>}
   */
  const apiFetch = async (url, options = {}) => {
    const token = getToken();
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (res.status === 401) logout();
    return res;
  };

  /**
   * Render the topbar user chip with name and role badge.
   * @param {string} [elementId='topbar-user']
   */
  const renderTopbar = (elementId = 'topbar-user') => {
    const user = getUser();
    const el   = document.getElementById(elementId);
    if (!user || !el) return;

    const roleLabel = user.role === 'admin' ? 'Admin' : 'Barista';
    el.innerHTML = `
      <span class="admin-topbar__user-name">${user.firstName ?? ''} ${user.lastName ?? ''}</span>
      <span class="admin-role-badge admin-role-badge--${user.role}">${roleLabel}</span>
    `;
  };

  return { saveSession, login: null, logout, getToken, getUser, requireAuth, apiFetch, renderTopbar };

})();
