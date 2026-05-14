const express = require('express');
const { all, get } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const router = express.Router();

/**
 * GET /api/menu
 * Public — returns all available menu items.
 */
router.get('/', async (req, res) => {
  const items = await all('SELECT * FROM menu_items WHERE available = 1 ORDER BY name');
  return res.json(items);
});

/**
 * GET /api/menu/all
 * Admin — returns all items including unavailable ones.
 */
router.get('/all', requireAuth, requireRole('admin', 'barista'), async (req, res) => {
  const items = await all('SELECT * FROM menu_items ORDER BY name');
  return res.json(items);
});

/**
 * GET /api/menu/modifiers
 * Admin / Barista — returns all modifier groups with their modifiers for the POS.
 */
router.get('/modifiers', requireAuth, requireRole('admin', 'barista'), async (req, res) => {
  const groups = await all('SELECT * FROM modifier_groups ORDER BY display_order');
  const mods   = await all('SELECT * FROM modifiers ORDER BY group_id, display_order');

  const result = groups.map(g => ({
    id:            g.id,
    name:          g.name,
    selectionType: g.selection_type,
    required:      Boolean(g.required),
    displayOrder:  g.display_order,
    modifiers:     mods
      .filter(m => m.group_id === g.id)
      .map(m => ({
        id:              m.id,
        name:            m.name,
        priceDeltaCents: m.price_delta_cents,
        isDefault:       Boolean(m.is_default),
        displayOrder:    m.display_order,
      })),
  }));

  return res.json(result);
});

/**
 * GET /api/menu/:id
 * Public — single menu item.
 */
router.get('/:id', async (req, res) => {
  const item = await get('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });
  return res.json(item);
});

module.exports = router;
