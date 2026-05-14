/**
 * crm.js — Customer Relationship Management module
 * Handles customer listing, search, profile view with stamp history, and add/edit CRUD.
 */

// ── Auth Guard ───────────────────────────────────────────────────────────────
adminAuth.requireAuth(['admin']);

// ── Topbar ───────────────────────────────────────────────────────────────────
adminAuth.renderTopbar();
document.getElementById('logout-btn').addEventListener('click', () => adminAuth.logout());

// ── State ────────────────────────────────────────────────────────────────────

/** @type {Array<object>} Currently rendered customer list */
let currentCustomers = [];

/** @type {number|null} Debounce timer ID for search input */
let searchDebounceTimer = null;

// ── DOM Refs ──────────────────────────────────────────────────────────────────

const tableContainer  = document.getElementById('crm-table-container');
const searchInput     = document.getElementById('crm-search');
const addBtn          = document.getElementById('crm-add-btn');

const profileOverlay  = document.getElementById('crm-profile-overlay');
const profileBackdrop = document.getElementById('crm-profile-backdrop');
const profileClose    = document.getElementById('crm-profile-close');
const profileName     = document.getElementById('crm-profile-name');
const profileBody     = document.getElementById('crm-profile-body');

const formOverlay     = document.getElementById('crm-form-overlay');
const formBackdrop    = document.getElementById('crm-form-backdrop');
const formClose       = document.getElementById('crm-form-close');
const formCancel      = document.getElementById('crm-form-cancel');
const formTitle       = document.getElementById('crm-form-title');
const customerForm    = document.getElementById('crm-customer-form');
const formCustomerId  = document.getElementById('crm-form-customer-id');
const fieldFirstName  = document.getElementById('crm-field-first-name');
const fieldLastName   = document.getElementById('crm-field-last-name');
const fieldEmail      = document.getElementById('crm-field-email');
const fieldPhone      = document.getElementById('crm-field-phone');
const errorFirstName  = document.getElementById('crm-error-first-name');
const errorLastName   = document.getElementById('crm-error-last-name');
const errorEmail      = document.getElementById('crm-error-email');
const errorPhone      = document.getElementById('crm-error-phone');
const apiError        = document.getElementById('crm-form-api-error');
const submitBtn       = document.getElementById('crm-form-submit');

// ── Security: HTML Escape ─────────────────────────────────────────────────────

/**
 * Escape a string for safe insertion into HTML.
 * @param {string} str
 * @returns {string}
 */
const escapeHtml = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ── Formatters ────────────────────────────────────────────────────────────────

/**
 * Format an ISO date string to a locale date.
 * @param {string} iso
 * @returns {string}
 */
const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Return initials from a first and last name.
 * @param {string} first
 * @param {string} last
 * @returns {string}
 */
const getInitials = (first, last) =>
  `${(first || '').charAt(0).toUpperCase()}${(last || '').charAt(0).toUpperCase()}`;

/**
 * Build the stamp count display string.
 * @param {number} count
 * @returns {string}
 */
const formatStamps = (count) => `${Number(count) || 0} / 9`;

/**
 * Return a "Free coffee ready" badge HTML if stamp_count is 9 or above.
 * @param {number} stampCount
 * @returns {string}
 */
const freeCoffeeBadge = (stampCount) => {
  if (stampCount >= 9) {
    return ' <span class="crm-free-badge">Free coffee ready</span>';
  }
  return '';
};

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Load and render the summary stat cards.
 * @returns {Promise<void>}
 */
const loadStats = async () => {
  try {
    const res = await adminAuth.apiFetch('/api/customers');
    const all = await res.json();
    const readyCount = all.filter(c => (c.stamp_count || 0) >= 9).length;

    document.getElementById('stat-total-value').textContent   = all.length;
    document.getElementById('stat-members-value').textContent = all.length;
    document.getElementById('stat-elite-value').textContent   = readyCount;
  } catch (_) {
    document.getElementById('stat-total-value').textContent   = '—';
    document.getElementById('stat-members-value').textContent = '—';
    document.getElementById('stat-elite-value').textContent   = '—';
  }
};

// ── Customer Table ────────────────────────────────────────────────────────────

/**
 * Fetch customers from the API and render the table.
 * @param {string} [search='']
 * @returns {Promise<void>}
 */
const loadCustomers = async (search = '') => {
  tableContainer.innerHTML = '<p class="admin-empty">Loading customers…</p>';

  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());

  const query = params.toString();
  const url   = `/api/customers${query ? `?${query}` : ''}`;

  try {
    const res = await adminAuth.apiFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const customers = await res.json();
    currentCustomers = customers;
    renderTable(customers);
  } catch (_) {
    tableContainer.innerHTML = '<p class="admin-empty admin-empty--error">Could not load customers. Please try again.</p>';
  }
};

/**
 * Render the customer table from an array of customer objects.
 * @param {Array<object>} customers
 */
const renderTable = (customers) => {
  if (!customers.length) {
    tableContainer.innerHTML = '<p class="admin-empty">No customers found.</p>';
    return;
  }

  const rows = customers.map(c => {
    const stampCount = c.stamp_count || 0;
    return `
      <tr class="admin-table__row" data-customer-id="${c.id}">
        <td class="admin-table__cell">
          <p class="crm-customer-name">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</p>
          <p class="crm-customer-id">#${c.id}</p>
        </td>
        <td class="admin-table__cell">${escapeHtml(c.email || '—')}</td>
        <td class="admin-table__cell">${escapeHtml(c.phone || '—')}</td>
        <td class="admin-table__cell">
          ${formatStamps(stampCount)}${freeCoffeeBadge(stampCount)}
        </td>
        <td class="admin-table__cell">${c.joined_at ? formatDate(c.joined_at) : '—'}</td>
        <td class="admin-table__cell">
          <div class="crm-actions">
            <button
              class="crm-actions__btn crm-actions__btn--view"
              type="button"
              data-action="view"
              data-id="${c.id}"
              aria-label="View profile for ${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}"
            >View</button>
            <button
              class="crm-actions__btn crm-actions__btn--edit"
              type="button"
              data-action="edit"
              data-id="${c.id}"
              aria-label="Edit ${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}"
            >Edit</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tableContainer.innerHTML = `
    <div class="crm-table-wrap">
      <table class="admin-table" aria-label="Customer list">
        <thead class="admin-table__head">
          <tr>
            <th class="admin-table__heading" scope="col">Name</th>
            <th class="admin-table__heading" scope="col">Email</th>
            <th class="admin-table__heading" scope="col">Phone</th>
            <th class="admin-table__heading" scope="col">Stamps</th>
            <th class="admin-table__heading" scope="col">Joined</th>
            <th class="admin-table__heading" scope="col">Actions</th>
          </tr>
        </thead>
        <tbody class="admin-table__body">${rows}</tbody>
      </table>
    </div>
  `;

  // Delegate action button events
  tableContainer.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === 'view') {
        openProfileModal(id);
      } else if (btn.dataset.action === 'edit') {
        const customer = currentCustomers.find(c => c.id === id);
        if (customer) openEditModal(customer);
      }
    });
  });
};

// ── Profile Modal ─────────────────────────────────────────────────────────────

/**
 * Open the profile slide-over for a specific customer.
 * @param {number} customerId
 * @returns {Promise<void>}
 */
const openProfileModal = async (customerId) => {
  profileName.textContent = 'Loading…';
  profileBody.innerHTML   = '<p class="admin-empty">Loading profile…</p>';
  openOverlay(profileOverlay);

  try {
    const res     = await adminAuth.apiFetch(`/api/customers/${customerId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const profile = await res.json();

    profileName.textContent = `${escapeHtml(profile.first_name)} ${escapeHtml(profile.last_name)}`;
    profileBody.innerHTML   = renderProfileBody(profile);

    // Stamp adjustment form submit inside panel
    const stampForm = profileBody.querySelector('#crm-stamp-form');
    if (stampForm) {
      stampForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = stampForm.querySelector('#crm-stamp-input');
        const val   = parseInt(input?.value, 10);
        if (isNaN(val) || val < 0 || val > 9) {
          const errEl = stampForm.querySelector('#crm-stamp-error');
          if (errEl) errEl.textContent = 'Enter a value between 0 and 9.';
          return;
        }
        await adjustStamps(customerId, val, stampForm);
      });
    }
  } catch (_) {
    profileBody.innerHTML = '<p class="admin-empty admin-empty--error">Could not load profile.</p>';
  }
};

/**
 * Adjust a customer's stamp count via the API.
 * @param {number} customerId
 * @param {number} stampCount
 * @param {HTMLFormElement} form
 * @returns {Promise<void>}
 */
const adjustStamps = async (customerId, stampCount, form) => {
  const btn    = form.querySelector('button[type="submit"]');
  const errEl  = form.querySelector('#crm-stamp-error');
  const okEl   = form.querySelector('#crm-stamp-success');

  if (btn) btn.disabled = true;
  if (errEl) errEl.textContent  = '';
  if (okEl)  okEl.textContent   = '';

  try {
    const res = await adminAuth.apiFetch(`/api/customers/${customerId}`, {
      method: 'PUT',
      body: JSON.stringify({ stamp_count: stampCount }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (errEl) errEl.textContent = data.error || 'Could not update stamps.';
      return;
    }
    if (okEl) okEl.textContent = 'Stamp count updated.';
    await Promise.all([loadStats(), loadCustomers(searchInput.value)]);
  } catch (_) {
    if (errEl) errEl.textContent = 'Network error — please try again.';
  } finally {
    if (btn) btn.disabled = false;
  }
};

/**
 * Build the inner HTML for the profile panel.
 * @param {object} profile
 * @returns {string}
 */
const renderProfileBody = (profile) => {
  const initials   = getInitials(profile.first_name, profile.last_name);
  const stampCount = profile.stamp_count || 0;
  const history    = Array.isArray(profile.stampHistory) ? profile.stampHistory.slice(0, 10) : [];

  const historyItems = history.length
    ? history.map(ev => {
        const typeLabel = ev.event_type === 'earn'
          ? 'Stamp earned'
          : ev.event_type === 'redeem'
            ? 'Redeemed'
            : 'Manual adjustment';
        const delta = ev.stamps_delta != null
          ? (ev.stamps_delta > 0 ? `+${ev.stamps_delta}` : String(ev.stamps_delta))
          : '';
        return `
          <li class="crm-event">
            <div>
              <p class="crm-event__desc">${escapeHtml(typeLabel)}${delta ? ' (' + escapeHtml(delta) + ')' : ''}</p>
              <p class="crm-event__date">${ev.created_at ? formatDate(ev.created_at) : ''}</p>
            </div>
            <span class="crm-event__stamps">Stamps after: ${ev.stamp_count_after ?? '—'}</span>
          </li>
        `;
      }).join('')
    : '<li class="crm-event-list--empty">No stamp history yet.</li>';

  return `
    <section class="crm-profile-section" aria-label="Customer identity">
      <div class="crm-profile-identity">
        <div class="crm-profile-avatar" aria-hidden="true">${initials}</div>
        <div class="crm-profile-identity__info">
          <p class="crm-profile-identity__name">
            ${escapeHtml(profile.first_name)} ${escapeHtml(profile.last_name)}
          </p>
          <p class="crm-profile-identity__joined">
            Member since ${profile.joined_at ? formatDate(profile.joined_at) : '—'}
          </p>
        </div>
      </div>
    </section>

    <section class="crm-profile-section" aria-label="Contact details">
      <h3 class="crm-profile-section__title">Contact</h3>
      <div class="crm-profile-contacts">
        <div class="crm-profile-contact">
          <svg class="crm-profile-contact__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          ${escapeHtml(profile.email || '—')}
        </div>
        <div class="crm-profile-contact">
          <svg class="crm-profile-contact__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.37 2 2 0 0 1 3.58 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.27a16 16 0 0 0 6.29 6.29l1.13-1.14a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          ${escapeHtml(profile.phone || '—')}
        </div>
      </div>
    </section>

    <section class="crm-profile-section" aria-label="Loyalty stamps">
      <h3 class="crm-profile-section__title">Loyalty Stamps</h3>
      <p class="crm-profile-stamps">
        ${stampCount} / 9
        ${stampCount >= 9 ? '<span class="crm-free-badge">Free coffee ready</span>' : ''}
      </p>
      <form class="crm-stamp-form" id="crm-stamp-form" novalidate>
        <fieldset class="crm-stamp-form__fieldset">
          <legend class="crm-stamp-form__legend">Adjust stamp count</legend>
          <div class="crm-stamp-form__row">
            <label class="crm-stamp-form__label" for="crm-stamp-input">New stamp count (0–9)</label>
            <input
              class="crm-stamp-form__input"
              id="crm-stamp-input"
              type="number"
              min="0"
              max="9"
              step="1"
              value="${stampCount}"
              required
            >
            <button class="crm-stamp-form__btn" type="submit">Update</button>
          </div>
          <p class="crm-stamp-form__error" id="crm-stamp-error" role="alert"></p>
          <p class="crm-stamp-form__success" id="crm-stamp-success" role="status" aria-live="polite"></p>
        </fieldset>
      </form>
    </section>

    <section class="crm-profile-section" aria-label="Stamp history">
      <h3 class="crm-profile-section__title">Recent Stamp Activity</h3>
      <ul class="crm-event-list" aria-label="Stamp event history">
        ${historyItems}
      </ul>
    </section>
  `;
};

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

/**
 * Open the Add Customer modal with a blank form.
 */
const openAddModal = () => {
  formTitle.textContent = 'Add Customer';
  submitBtn.textContent = 'Save Customer';
  formCustomerId.value  = '';
  customerForm.reset();
  clearFormErrors();
  openOverlay(formOverlay);
  fieldFirstName.focus();
};

/**
 * Open the Edit Customer modal pre-filled with existing data.
 * @param {object} customer
 */
const openEditModal = (customer) => {
  formTitle.textContent = 'Edit Customer';
  submitBtn.textContent = 'Update Customer';
  formCustomerId.value  = customer.id;
  fieldFirstName.value  = customer.first_name || '';
  fieldLastName.value   = customer.last_name  || '';
  fieldEmail.value      = customer.email      || '';
  fieldPhone.value      = customer.phone      || '';
  clearFormErrors();
  openOverlay(formOverlay);
  fieldFirstName.focus();
};

/**
 * POST or PUT a customer to the API.
 * @param {object} formData
 * @param {number|null} id
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const saveCustomer = async (formData, id = null) => {
  const method = id ? 'PUT' : 'POST';
  const url    = id ? `/api/customers/${id}` : '/api/customers';

  try {
    const res  = await adminAuth.apiFetch(url, { method, body: JSON.stringify(formData) });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'An error occurred. Please try again.' };
    }
    return { success: true };
  } catch (_) {
    return { success: false, error: 'Network error — please check your connection.' };
  }
};

// ── Form Validation ───────────────────────────────────────────────────────────

/**
 * Validate the customer form fields.
 * @returns {boolean}
 */
const validateForm = () => {
  let valid = true;
  clearFormErrors();

  if (!fieldFirstName.value.trim()) {
    showFieldError(fieldFirstName, errorFirstName, 'First name is required.');
    valid = false;
  }
  if (!fieldLastName.value.trim()) {
    showFieldError(fieldLastName, errorLastName, 'Last name is required.');
    valid = false;
  }
  if (!fieldEmail.value.trim()) {
    showFieldError(fieldEmail, errorEmail, 'Email address is required.');
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fieldEmail.value.trim())) {
    showFieldError(fieldEmail, errorEmail, 'Please enter a valid email address.');
    valid = false;
  }

  return valid;
};

/**
 * Mark a field as invalid and display an error message.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} errorEl
 * @param {string} message
 */
const showFieldError = (input, errorEl, message) => {
  input.classList.add('crm-form__input--error');
  errorEl.textContent = message;
};

/**
 * Clear all field error states and messages.
 */
const clearFormErrors = () => {
  [fieldFirstName, fieldLastName, fieldEmail, fieldPhone].forEach(el => {
    el.classList.remove('crm-form__input--error');
  });
  [errorFirstName, errorLastName, errorEmail, errorPhone].forEach(el => {
    el.textContent = '';
  });
  apiError.textContent = '';
  apiError.classList.remove('crm-form__api-error--visible');
};

// ── Overlay Helpers ───────────────────────────────────────────────────────────

/**
 * Open an overlay panel.
 * @param {HTMLElement} overlay
 */
const openOverlay = (overlay) => {
  overlay.classList.add('crm-overlay--open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
};

/**
 * Close an overlay panel.
 * @param {HTMLElement} overlay
 */
const closeOverlay = (overlay) => {
  overlay.classList.remove('crm-overlay--open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
};

// ── Form Submit ───────────────────────────────────────────────────────────────

customerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Saving…';

  const id       = formCustomerId.value ? Number(formCustomerId.value) : null;
  const formData = {
    firstName: fieldFirstName.value.trim(),
    lastName:  fieldLastName.value.trim(),
    email:     fieldEmail.value.trim(),
    phone:     fieldPhone.value.trim(),
  };

  const result = await saveCustomer(formData, id);

  if (result.success) {
    closeOverlay(formOverlay);
    await Promise.all([loadStats(), loadCustomers(searchInput.value)]);
  } else {
    apiError.textContent = result.error;
    apiError.classList.add('crm-form__api-error--visible');
    submitBtn.disabled    = false;
    submitBtn.textContent = id ? 'Update Customer' : 'Save Customer';
  }
});

// ── Search ────────────────────────────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    loadCustomers(searchInput.value);
  }, 300);
});

// ── Event Wiring ──────────────────────────────────────────────────────────────

addBtn.addEventListener('click', openAddModal);

profileClose.addEventListener('click',    () => closeOverlay(profileOverlay));
profileBackdrop.addEventListener('click', () => closeOverlay(profileOverlay));

formClose.addEventListener('click',    () => closeOverlay(formOverlay));
formCancel.addEventListener('click',   () => closeOverlay(formOverlay));
formBackdrop.addEventListener('click', () => closeOverlay(formOverlay));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (formOverlay.classList.contains('crm-overlay--open'))    closeOverlay(formOverlay);
  if (profileOverlay.classList.contains('crm-overlay--open')) closeOverlay(profileOverlay);
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadStats();
loadCustomers();
