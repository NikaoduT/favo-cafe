const express = require('express');
const { all, get, run } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const router = express.Router();

// All inventory routes require authentication
router.use(requireAuth);

/**
 * GET /api/inventory
 * Returns all inventory items, sorted by category then name.
 */
router.get('/', requireRole('admin', 'super_admin', 'roaster', 'barista'), async (req, res) => {
  const items = await all('SELECT * FROM inventory_items ORDER BY category, name');
  const lowStock = items.filter(i => i.quantity <= i.reorder_level);
  return res.json({ items, lowStockCount: lowStock.length });
});

/**
 * GET /api/inventory/low-stock
 * Returns items at or below reorder level.
 */
router.get('/low-stock', requireRole('admin', 'super_admin', 'roaster'), async (req, res) => {
  const items = await all('SELECT * FROM inventory_items WHERE quantity <= reorder_level ORDER BY quantity ASC');
  return res.json(items);
});

/**
 * GET /api/inventory/:id
 */
router.get('/:id', requireRole('admin', 'super_admin', 'roaster'), async (req, res) => {
  const item = await get('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  return res.json(item);
});

/**
 * POST /api/inventory
 * Body: { name, category, unit, quantity, reorder_level, supplier }
 */
router.post('/', requireRole('admin', 'super_admin'), async (req, res) => {
  const { name, category, unit, quantity, reorder_level, supplier, cost_per_unit_cents } = req.body;
  if (!name || !category || !unit) {
    return res.status(400).json({ error: 'name, category, and unit are required' });
  }
  const result = await run(
    'INSERT INTO inventory_items (name, category, unit, quantity, reorder_level, supplier, cost_per_unit_cents) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, category, unit, quantity || 0, reorder_level || 0, supplier || null, cost_per_unit_cents || 0]
  );
  const item = await get('SELECT * FROM inventory_items WHERE id = ?', [result.lastInsertRowid]);
  return res.status(201).json(item);
});

/**
 * PUT /api/inventory/:id
 * Partial update — only updates provided fields.
 */
router.put('/:id', requireRole('admin', 'super_admin', 'roaster'), async (req, res) => {
  const { name, category, unit, quantity, reorder_level, supplier, cost_per_unit_cents } = req.body;
  const existing = await get('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Item not found' });

  await run(
    `UPDATE inventory_items SET
      name = ?, category = ?, unit = ?, quantity = ?,
      reorder_level = ?, supplier = ?, cost_per_unit_cents = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
    [
      name ?? existing.name,
      category ?? existing.category,
      unit ?? existing.unit,
      quantity ?? existing.quantity,
      reorder_level ?? existing.reorder_level,
      supplier ?? existing.supplier,
      cost_per_unit_cents ?? existing.cost_per_unit_cents,
      req.params.id
    ]
  );

  return res.json(get('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]));
});

/**
 * DELETE /api/inventory/:id
 */
router.delete('/:id', requireRole('admin', 'super_admin'), async (req, res) => {
  const existing = await get('SELECT id FROM inventory_items WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  await run('DELETE FROM inventory_items WHERE id = ?', [req.params.id]);
  return res.json({ message: 'Item deleted' });
});

module.exports = router;
