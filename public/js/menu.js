/**
 * menu.js — Favo Cafe
 * Fetches menu items from /api/menu and renders:
 *   - Full menu page:  flat grid, no category filters (#menu-grid)
 *   - Homepage featured picks: Americano, Mocha, Chai Latte (#featured-grid)
 * Prices are always loaded from the API — never hardcoded.
 */

'use strict';

/** Names of the three items featured on the homepage. */
const FEATURED_NAMES = ['Americano', 'Mocha', 'Chai Latte'];

/**
 * Format price in cents to "R20" / "R25" display string.
 * @param {number} cents
 * @returns {string}
 */
const formatPrice = (cents) => {
  const rands = Math.round(cents) / 100;
  return `R${rands % 1 === 0 ? rands : rands.toFixed(2)}`;
};

/**
 * Fetch all available menu items from the public API.
 * @returns {Promise<Array>}
 */
const fetchMenu = async () => {
  const res = await fetch('/api/menu');
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
};

/**
 * Build a <li> menu card element.
 * @param {object}  item
 * @param {boolean} featured
 * @returns {HTMLLIElement}
 */
const createMenuCard = (item, featured = false) => {
  const li = document.createElement('li');
  li.className = [
    'menu-card',
    featured       ? 'menu-card--featured'    : '',
    !item.available ? 'menu-card--unavailable' : '',
  ].filter(Boolean).join(' ');

  li.innerHTML = `
    <h3 class="menu-card__name">${item.name}</h3>
    <p  class="menu-card__description">${item.description ?? ''}</p>
    <footer class="menu-card__footer">
      <span class="menu-card__price">${formatPrice(item.price_cents)}</span>
    </footer>
  `;

  return li;
};

/* ── Full Menu Page (/menu.html) ────────────────────────────────────────────── */

const initFullMenuPage = async () => {
  const grid = document.getElementById('menu-grid');
  if (!grid) return;

  try {
    const items = await fetchMenu();
    grid.innerHTML = '';
    items.forEach(item => grid.appendChild(createMenuCard(item)));
  } catch (err) {
    grid.innerHTML = `
      <li class="menu-grid__error">
        <p>Could not load the menu right now. Please try refreshing the page.</p>
      </li>`;
    console.error('[menu.js] fetchMenu failed:', err);
  }
};

/* ── Homepage Featured Picks (/index.html) ───────────────────────────────────── */

const initFeaturedMenu = async () => {
  const grid = document.getElementById('featured-grid');
  if (!grid) return;

  try {
    const items = await fetchMenu();

    // Use the confirmed featured items; fall back to first three available
    const featured = FEATURED_NAMES
      .map(name => items.find(i => i.name === name))
      .filter(Boolean);

    const toRender = featured.length > 0 ? featured : items.slice(0, 3);

    grid.innerHTML = '';
    toRender.forEach(item => grid.appendChild(createMenuCard(item, true)));
  } catch (err) {
    grid.innerHTML = `
      <li class="featured-menu__loading">
        <p>Menu unavailable — visit us in store.</p>
      </li>`;
    console.error('[menu.js] fetchFeatured failed:', err);
  }
};

/* ── Init ────────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initFullMenuPage();
  initFeaturedMenu();
});
