/**
 * main.js — Favo Cafe
 * Site-wide JavaScript: mobile nav toggle, active link highlighting,
 * Rewards button token check.
 * Loaded on every public page.
 */

'use strict';

/**
 * Initialise mobile navigation toggle.
 * Toggles .site-nav__links--open on the nav links panel.
 */
const initMobileNav = () => {
  const nav        = document.querySelector('.site-nav');
  const hamburger  = document.querySelector('.site-nav__hamburger');
  const linksPanel = document.getElementById('site-nav-links');

  if (!nav || !hamburger || !linksPanel) return;

  /**
   * @returns {void}
   */
  const open = () => {
    linksPanel.classList.add('site-nav__links--open');
    hamburger.setAttribute('aria-expanded', 'true');
  };

  /**
   * @returns {void}
   */
  const close = () => {
    linksPanel.classList.remove('site-nav__links--open');
    hamburger.setAttribute('aria-expanded', 'false');
  };

  hamburger.addEventListener('click', () => {
    const isOpen = linksPanel.classList.contains('site-nav__links--open');
    isOpen ? close() : open();
  });

  /* Close when a nav link is tapped on mobile */
  linksPanel.querySelectorAll('.site-nav__link').forEach(link => {
    link.addEventListener('click', close);
  });

  /* Close when clicking outside the nav */
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target)) close();
  });

  /* Close on Escape key */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
};

/**
 * Highlight the nav link that matches the current URL pathname.
 * @returns {void}
 */
const initActiveNavLink = () => {
  const currentPath = window.location.pathname;

  document.querySelectorAll('.site-nav__link').forEach(link => {
    const href = link.getAttribute('href');
    const isHome = currentPath === '/' && (href === '/' || href === '/index.html');
    const isMatch = href && href !== '/' && currentPath.startsWith(href);

    if (isHome || isMatch) {
      link.classList.add('site-nav__link--active');
    }
  });
};

/**
 * Update the Rewards button based on customer auth state.
 * If favo_customer_token is present in localStorage, redirect to /portal.html
 * and update the button label.
 * @returns {void}
 */
const initRewardsButton = () => {
  const token = localStorage.getItem('favo_customer_token');
  const rewardsBtn = document.querySelector('.site-nav__rewards');
  if (!rewardsBtn) return;

  if (token) {
    rewardsBtn.setAttribute('href', '/portal.html');
    rewardsBtn.textContent = 'My Rewards';
  }
};

/**
 * Format a price stored in cents to a ZAR display string.
 * Exported on window so other scripts can reuse it.
 * @param {number} cents
 * @returns {string}  e.g. "R 45"
 */
window.formatPrice = (cents) => `R ${Math.round(cents / 100)}`;

/* ── Init ───────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initActiveNavLink();
  initRewardsButton();
});
