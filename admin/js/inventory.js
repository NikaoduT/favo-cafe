/**
 * inventory.js — Inventory management module
 * Handles fetching, displaying, searching, adding, editing and deleting stock items.
 */

// ── Auth guard ──────────────────────────────────────────────────────────────

adminAuth.requireAuth(['admin', 'super_admin', 'barista']);

// ── Topbar user display ─────────────────────────────────────────────────────

const user = adminAuth.getUser();
if (user) {
  adminAuth.renderTopbar();
}

// ── Logout ──────────────────────────────────────────────────────────────────

document.getElementById('logout-btn')?.addEventListener('click', () => adminAuth.logout());

// ── Module state ────────────────────────────────────────────────────────────

/** @type {Array<{id:number, name:string, category:string, unit:string, quantity:number, reorder_level:number, supplier:string}>} */
let allItems = [];

/** @type {string} */
let searchQuery = '';

/** @type {number|null} */
let pendingDeleteId = null;

// ── DOM refs ────────────────────────────────────────────────────────────────

const tableContainer   = document.getElementById('inv-table-container');
const statTotalEl      = document.getElementById('stat-total-value');
const statLowStockEl   = document.getElementById('stat-low-stock-value');
const statLowStockCard = document.getElementById('stat-low-stock');
const searchInput      = document.getElementById('inv-search');
const addBtn           = document.getElementById('inv-add-btn');

const modalOverlay  = document.getElementById('inv-modal-overlay');
const modalTitle    = document.getElementById('inv-modal-title');
const modalClose    = document.getElementById('inv-modal-close');
const modalCancel   = document.getElementById('inv-modal-cancel');
const modalSave     = document.getElementById('inv-modal-save');
const itemForm      = document.getElementById('inv-item-form');
const itemIdInput   = document.getElementById('inv-item-id');
const fieldName     = document.getElementById('inv-field-name');
const fieldCategory = document.getElementById('inv-field-category');
const fieldUnit     = document.getElementById('inv-field-unit');
const fieldQty      = document.getElementById('inv-field-quantity');
const fieldReorder  = document.getElementById('inv-field-reorder');
const fieldSupplier = document.getElementById('inv-field-supplier');
const formError     = document.getElementById('inv-form-error');

const deleteOverlay  = document.getElementById('inv-delete-overlay');
const deleteClose    = document.getElementById('inv-delete-close');
const deleteCancel   = document.getElementById('inv-delete-cancel');
const deleteConfirm  = document.getElementById('inv-delete-confirm');
const deleteNameEl   = document.getElementById('inv-delete-name');

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
const escHtml = (str) => String(str ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * Show an error message inside the item form.
 * @param {string} message
 */
const showFormError = (message) => {
  formError.textContent = message;
  formError.hidden = false;
};

/** Hide the item form error message. */
const clearFormError = () => {
  formError.textContent = '';
  formError.hidden = true;
};

// ── Data loading ─────────────────────────────────────────────────────────────

/**
 * Fetch all inventory items from the API and render the page.
 * @returns {Promise<void>}
 */
const loadInventory = async () => {
  tableContainer.innerHTML = '<p class="admin-empty">Loading inventory…</p>';

  try {
    const res = await adminAuth.apiFetch('/api/inventory');

    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const data = await res.json();
    allItems = data.items ?? [];

    updateStats(allItems, data.lowStockCount ?? 0);
    renderTable(allItems);
  } catch (err) {
    tableContainer.innerHTML = '<p class="admin-empty">Could not load inventory. Please try again.</p>';
  }
};

/**
 * Update the two stat cards at the top of the page.
 * @param {Array} items
 * @param {number} lowStockCount
 */
const updateStats = (items, lowStockCount) => {
  statTotalEl.textContent = items.length;
  statLowStockEl.textContent = lowStockCount;

  if (lowStockCount > 0) {
    statLowStockCard.classList.add('stat-card--alert', 'stat-card--warning');
  } else {
    statLowStockCard.classList.remove('stat-card--alert', 'stat-card--warning');
  }
};

// ── Table rendering ──────────────────────────────────────────────────────────

/**
 * Filter items by the current search query and render the table.
 * @param {Array} items - Full list of inventory items.
 */
const renderTable = (items) => {
  const q = searchQuery.toLowerCase().trim();

  const filtered = q
    ? items.filter(item =>
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.supplier ?? '').toLowerCase().includes(q)
      )
    : items;

  if (!filtered.length) {
    tableContainer.innerHTML = q
      ? `<p class="admin-empty">No items match &ldquo;${escHtml(q)}&rdquo;.</p>`
      : '<p class="admin-empty">No inventory items yet. Add your first item above.</p>';
    return;
  }

  const rows = filtered.map(item => {
    const isLow = Number(item.quantity) <= Number(item.reorder_level);
    const badgeClass = isLow ? 'inv-badge--low-stock' : 'inv-badge--in-stock';
    const badgeLabel = isLow ? 'Low Stock' : 'In Stock';
    const qtyClass   = isLow ? 'inv-qty inv-qty--low' : 'inv-qty';

    return `
      <tr class="admin-table__row">
        <td class="admin-table__cell">${escHtml(item.name)}</td>
        <td class="admin-table__cell">${escHtml(item.category)}</td>
        <td class="admin-table__cell">${escHtml(item.unit)}</td>
        <td class="admin-table__cell">
          <span class="${qtyClass}">${item.quantity}</span>
        </td>
        <td class="admin-table__cell">${item.reorder_level}</td>
        <td class="admin-table__cell">${escHtml(item.supplier ?? '—')}</td>
        <td class="admin-table__cell">
          <span class="inv-badge ${badgeClass}">
            <span class="inv-badge__dot" aria-hidden="true"></span>
            ${badgeLabel}
          </span>
        </td>
        <td class="admin-table__cell">
          <div class="inv-actions">
            <button
              class="inv-btn inv-btn--edit"
              type="button"
              data-id="${item.id}"
              data-action="edit"
              aria-label="Edit ${escHtml(item.name)}"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button
              class="inv-btn inv-btn--delete"
              type="button"
              data-id="${item.id}"
              data-action="delete"
              aria-label="Delete ${escHtml(item.name)}"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tableContainer.innerHTML = `
    <table class="admin-table" aria-label="Inventory items">
      <thead class="admin-table__head">
        <tr>
          <th class="admin-table__heading" scope="col">Name</th>
          <th class="admin-table__heading" scope="col">Category</th>
          <th class="admin-table__heading" scope="col">Unit</th>
          <th class="admin-table__heading" scope="col">Qty</th>
          <th class="admin-table__heading" scope="col">Reorder Level</th>
          <th class="admin-table__heading" scope="col">Supplier</th>
          <th class="admin-table__heading" scope="col">Status</th>
          <th class="admin-table__heading" scope="col">Actions</th>
        </tr>
      </thead>
      <tbody class="admin-table__body" id="inv-tbody">
        ${rows}
      </tbody>
    </table>
  `;

  // Attach action button listeners
  tableContainer.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id, 10);
      if (btn.dataset.action === 'edit') {
        const item = allItems.find(i => i.id === id);
        if (item) openEditModal(item);
      } else if (btn.dataset.action === 'delete') {
        const item = allItems.find(i => i.id === id);
        if (item) openDeleteModal(item);
      }
    });
  });
};

// ── Search ───────────────────────────────────────────────────────────────────

searchInput?.addEventListener('input', () => {
  searchQuery = searchInput.value;
  renderTable(allItems);
});

// ── Add / Edit modal ─────────────────────────────────────────────────────────

/** Reset and clear all form fields. */
const resetForm = () => {
  itemForm.reset();
  itemIdInput.value = '';
  clearFormError();
};

/**
 * Open the item modal in "Add" mode.
 */
const openAddModal = () => {
  resetForm();
  modalTitle.textContent = 'Add Item';
  modalSave.textContent = 'Save Item';
  modalOverlay.hidden = false;
  fieldName.focus();
};

/**
 * Open the item modal pre-filled for editing.
 * @param {{id:number, name:string, category:string, unit:string, quantity:number, reorder_level:number, supplier:string}} item
 */
const openEditModal = (item) => {
  resetForm();
  modalTitle.textContent = 'Edit Item';
  modalSave.textContent = 'Save Changes';

  itemIdInput.value      = item.id;
  fieldName.value        = item.name;
  fieldCategory.value    = item.category;
  fieldUnit.value        = item.unit;
  fieldQty.value         = item.quantity;
  fieldReorder.value     = item.reorder_level;
  fieldSupplier.value    = item.supplier ?? '';

  modalOverlay.hidden = false;
  fieldName.focus();
};

/** Close the add/edit modal. */
const closeModal = () => {
  modalOverlay.hidden = true;
  resetForm();
};

addBtn?.addEventListener('click', openAddModal);
modalClose?.addEventListener('click', closeModal);
modalCancel?.addEventListener('click', closeModal);

modalOverlay?.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Keyboard: close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!modalOverlay.hidden) closeModal();
    if (!deleteOverlay.hidden) closeDeleteModal();
  }
});

// ── Save item ─────────────────────────────────────────────────────────────────

itemForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFormError();

  const id   = itemIdInput.value ? parseInt(itemIdInput.value, 10) : null;
  const body = {
    name:          fieldName.value.trim(),
    category:      fieldCategory.value.trim(),
    unit:          fieldUnit.value.trim(),
    quantity:      parseFloat(fieldQty.value),
    reorder_level: parseFloat(fieldReorder.value),
    supplier:      fieldSupplier.value.trim() || null,
  };

  if (!body.name || !body.category || !body.unit) {
    showFormError('Name, category, and unit are required.');
    return;
  }

  if (isNaN(body.quantity) || body.quantity < 0) {
    showFormError('Quantity must be a non-negative number.');
    return;
  }

  if (isNaN(body.reorder_level) || body.reorder_level < 0) {
    showFormError('Reorder level must be a non-negative number.');
    return;
  }

  await saveItem(body, id);
});

/**
 * POST a new item or PUT an update to an existing one.
 * @param {object} formData - The item fields.
 * @param {number|null} id  - Item ID when editing, null when adding.
 * @returns {Promise<void>}
 */
const saveItem = async (formData, id) => {
  modalSave.disabled = true;
  modalSave.textContent = 'Saving…';

  const isEdit = id !== null;
  const url    = isEdit ? `/api/inventory/${id}` : '/api/inventory';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await adminAuth.apiFetch(url, {
      method,
      body: JSON.stringify(formData),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showFormError(err.error ?? 'Could not save item. Please try again.');
      return;
    }

    closeModal();
    await loadInventory();

  } catch (err) {
    showFormError('Network error — please check your connection.');
  } finally {
    modalSave.disabled = false;
    modalSave.textContent = id !== null ? 'Save Changes' : 'Save Item';
  }
};

// ── Delete modal ──────────────────────────────────────────────────────────────

/**
 * Open the delete confirmation modal for an item.
 * @param {{id:number, name:string}} item
 */
const openDeleteModal = (item) => {
  pendingDeleteId = item.id;
  deleteNameEl.textContent = item.name;
  deleteOverlay.hidden = false;
  deleteConfirm.focus();
};

/** Close the delete confirmation modal. */
const closeDeleteModal = () => {
  pendingDeleteId = null;
  deleteOverlay.hidden = true;
};

deleteClose?.addEventListener('click', closeDeleteModal);
deleteCancel?.addEventListener('click', closeDeleteModal);

deleteOverlay?.addEventListener('click', (e) => {
  if (e.target === deleteOverlay) closeDeleteModal();
});

deleteConfirm?.addEventListener('click', async () => {
  if (pendingDeleteId === null) return;
  await deleteItem(pendingDeleteId);
});

/**
 * Send a DELETE request for the given item ID.
 * @param {number} id
 * @returns {Promise<void>}
 */
const deleteItem = async (id) => {
  deleteConfirm.disabled = true;
  deleteConfirm.textContent = 'Deleting…';

  try {
    const res = await adminAuth.apiFetch(`/api/inventory/${id}`, { method: 'DELETE' });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? 'Could not delete item.');
      return;
    }

    closeDeleteModal();
    await loadInventory();

  } catch (err) {
    alert('Network error — please check your connection.');
  } finally {
    deleteConfirm.disabled = false;
    deleteConfirm.textContent = 'Delete';
  }
};

// ── Init ──────────────────────────────────────────────────────────────────────

loadInventory();
