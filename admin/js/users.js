/**
 * users.js — Staff user management (admin only)
 * Handles listing, adding, editing, and resetting PINs for staff accounts.
 */

// ── Auth guard — admin only ──────────────────────────────────────────────────
adminAuth.requireAuth(['admin']);

// ── Topbar ───────────────────────────────────────────────────────────────────
const currentUser = adminAuth.getUser();
if (currentUser) {
  adminAuth.renderTopbar();
}
document.getElementById('logout-btn')?.addEventListener('click', () => adminAuth.logout());

// ── State ────────────────────────────────────────────────────────────────────
/** @type {Array<object>} */
let allUsers = [];
let searchQuery = '';
let pendingId = null;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const tableContainer = document.getElementById('users-table-container');
const searchInput    = document.getElementById('users-search');
const addBtn         = document.getElementById('users-add-btn');

const overlay      = document.getElementById('users-modal-overlay');
const modalTitle   = document.getElementById('users-modal-title');
const modalClose   = document.getElementById('users-modal-close');
const modalCancel  = document.getElementById('users-modal-cancel');
const modalSave    = document.getElementById('users-modal-save');
const form         = document.getElementById('users-form');
const formId       = document.getElementById('users-form-id');
const fieldFirst   = document.getElementById('users-field-first');
const fieldLast    = document.getElementById('users-field-last');
const fieldEmail   = document.getElementById('users-field-email');
const fieldRole    = document.getElementById('users-field-role');
const fieldPass    = document.getElementById('users-field-password');
const formError    = document.getElementById('users-form-error');
const passHint     = document.getElementById('password-hint');
const passRequired = document.getElementById('password-required');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * @param {string} str
 * @returns {string}
 */
const esc = (str) => String(str ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param {string} role
 * @returns {string}
 */
const roleBadge = (role) =>
  `<span class="users-role-badge users-role-badge--${esc(role)}">${esc(role.replace('_', ' '))}</span>`;

// ── Load & render ─────────────────────────────────────────────────────────────

/**
 * Fetch all users from the API and re-render the page.
 * @returns {Promise<void>}
 */
const loadUsers = async () => {
  if (tableContainer) tableContainer.innerHTML = '<p class="admin-empty">Loading staff…</p>';
  try {
    const res  = await adminAuth.apiFetch('/api/users');
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    allUsers   = Array.isArray(data) ? data : (data.users ?? []);
    updateStats();
    renderTable();
  } catch {
    if (tableContainer) tableContainer.innerHTML = '<p class="admin-empty">Could not load staff. Please try again.</p>';
  }
};

/** Update the four stat cards. */
const updateStats = () => {
  const active   = allUsers.filter(u => u.active);
  const baristas = allUsers.filter(u => u.role === 'barista');
  const admins   = allUsers.filter(u => u.role === 'admin');
  document.getElementById('stat-total-value')?.textContent   !== undefined && (document.getElementById('stat-total-value').textContent   = allUsers.length);
  document.getElementById('stat-active-value')?.textContent  !== undefined && (document.getElementById('stat-active-value').textContent  = active.length);
  document.getElementById('stat-barista-value')?.textContent !== undefined && (document.getElementById('stat-barista-value').textContent = baristas.length);
  document.getElementById('stat-admin-value')?.textContent   !== undefined && (document.getElementById('stat-admin-value').textContent   = admins.length);
};

/** Filter by search query and re-render the table. */
const renderTable = () => {
  if (!tableContainer) return;
  const q = searchQuery.toLowerCase().trim();
  const filtered = q
    ? allUsers.filter(u =>
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      )
    : allUsers;

  if (!filtered.length) {
    tableContainer.innerHTML = q
      ? `<p class="admin-empty">No staff match &ldquo;${esc(q)}&rdquo;.</p>`
      : '<p class="admin-empty">No staff members yet. Add your first team member above.</p>';
    return;
  }

  const rows = filtered.map(u => {
    const statusDot = `<span class="users-status-dot users-status-dot--${u.active ? 'active' : 'inactive'}" title="${u.active ? 'Active' : 'Inactive'}" aria-label="${u.active ? 'Active' : 'Inactive'}"></span>`;
    const toggleLabel = u.active ? 'Deactivate' : 'Activate';
    const isSelf = currentUser && currentUser.id === u.id;

    return `
      <tr class="admin-table__row">
        <td class="admin-table__cell">${statusDot}</td>
        <td class="admin-table__cell">${esc(u.first_name)} ${esc(u.last_name)}</td>
        <td class="admin-table__cell">${esc(u.email)}</td>
        <td class="admin-table__cell">${roleBadge(u.role)}</td>
        <td class="admin-table__cell">
          <div class="users-actions">
            <button class="users-btn users-btn--edit" type="button" data-id="${u.id}" data-action="edit" aria-label="Edit ${esc(u.first_name)}">
              Edit
            </button>
            ${!isSelf ? `
            <button class="users-btn users-btn--toggle" type="button" data-id="${u.id}" data-action="toggle" aria-label="${toggleLabel} ${esc(u.first_name)}">
              ${toggleLabel}
            </button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tableContainer.innerHTML = `
    <table class="admin-table" aria-label="Staff members">
      <thead class="admin-table__head">
        <tr>
          <th class="admin-table__heading" scope="col">Status</th>
          <th class="admin-table__heading" scope="col">Name</th>
          <th class="admin-table__heading" scope="col">Email</th>
          <th class="admin-table__heading" scope="col">Role</th>
          <th class="admin-table__heading" scope="col">Actions</th>
        </tr>
      </thead>
      <tbody class="admin-table__body">${rows}</tbody>
    </table>
  `;

  tableContainer.querySelectorAll('[data-action]').forEach(btn => {
    const id = parseInt(btn.dataset.id, 10);
    btn.addEventListener('click', () => {
      const user = allUsers.find(u => u.id === id);
      if (!user) return;
      if (btn.dataset.action === 'edit')   openEdit(user);
      if (btn.dataset.action === 'toggle') toggleActive(user);
    });
  });
};

// ── Search ────────────────────────────────────────────────────────────────────
searchInput?.addEventListener('input', () => {
  searchQuery = searchInput.value;
  renderTable();
});

// ── Modal ─────────────────────────────────────────────────────────────────────

const resetForm = () => {
  form?.reset();
  if (formId)    formId.value   = '';
  if (formError) { formError.textContent = ''; formError.style.display = 'none'; }
};

const openAdd = () => {
  resetForm();
  if (modalTitle)   modalTitle.textContent   = 'Add Staff Member';
  if (modalSave)    modalSave.textContent     = 'Create Account';
  if (passHint)     passHint.style.display    = 'none';
  if (passRequired) passRequired.style.display = 'inline';
  if (fieldPass)    fieldPass.required        = true;
  if (overlay)      overlay.hidden            = false;
  fieldFirst?.focus();
};

/**
 * @param {object} user
 */
const openEdit = (user) => {
  resetForm();
  if (modalTitle)   modalTitle.textContent    = 'Edit Staff Member';
  if (modalSave)    modalSave.textContent      = 'Save Changes';
  if (passHint)     passHint.style.display     = 'block';
  if (passRequired) passRequired.style.display = 'none';
  if (fieldPass)    fieldPass.required         = false;

  if (formId)     formId.value     = user.id;
  if (fieldFirst) fieldFirst.value = user.first_name;
  if (fieldLast)  fieldLast.value  = user.last_name;
  if (fieldEmail) fieldEmail.value = user.email;
  if (fieldRole)  fieldRole.value  = user.role;

  if (overlay) overlay.hidden = false;
  fieldFirst?.focus();
};

const closeModal = () => {
  if (overlay) overlay.hidden = true;
  resetForm();
};

addBtn?.addEventListener('click', openAdd);
modalClose?.addEventListener('click', closeModal);
modalCancel?.addEventListener('click', closeModal);
overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay?.hidden) closeModal(); });

// ── Save ──────────────────────────────────────────────────────────────────────
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (formError) { formError.style.display = 'none'; }

  const id        = formId?.value ? parseInt(formId.value, 10) : null;
  const firstName = fieldFirst?.value.trim() ?? '';
  const lastName  = fieldLast?.value.trim()  ?? '';
  const email     = fieldEmail?.value.trim() ?? '';
  const role      = fieldRole?.value         ?? '';
  const password  = fieldPass?.value         ?? '';

  if (!firstName || !lastName || !email || !role) {
    showFormError('All fields except password are required.');
    return;
  }
  if (!id && !password) {
    showFormError('PIN is required for new accounts.');
    return;
  }
  if (password && !/^\d{6}$/.test(password)) {
    showFormError('PIN must be exactly 6 digits (numbers only).');
    return;
  }

  const body = { first_name: firstName, last_name: lastName, email, role };
  if (password) body.pin = password;

  if (modalSave) { modalSave.disabled = true; modalSave.textContent = 'Saving…'; }

  try {
    const url    = id ? `/api/users/${id}` : '/api/users';
    const method = id ? 'PUT' : 'POST';
    const res    = await adminAuth.apiFetch(url, { method, body: JSON.stringify(body) });
    const data   = await res.json().catch(() => ({}));

    if (!res.ok) {
      showFormError(data.error ?? 'Could not save. Please try again.');
      return;
    }

    closeModal();
    await loadUsers();
  } catch {
    showFormError('Network error — please check your connection.');
  } finally {
    if (modalSave) { modalSave.disabled = false; modalSave.textContent = id ? 'Save Changes' : 'Create Account'; }
  }
});

/**
 * @param {string} msg
 */
const showFormError = (msg) => {
  if (!formError) return;
  formError.textContent   = msg;
  formError.style.display = 'block';
};

// ── Toggle active ─────────────────────────────────────────────────────────────
/**
 * @param {object} user
 * @returns {Promise<void>}
 */
const toggleActive = async (user) => {
  try {
    const res = await adminAuth.apiFetch(`/api/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: user.active ? 0 : 1 }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? 'Could not update status.');
      return;
    }
    await loadUsers();
  } catch {
    alert('Network error — please check your connection.');
  }
};

// ── Init ──────────────────────────────────────────────────────────────────────
loadUsers();
