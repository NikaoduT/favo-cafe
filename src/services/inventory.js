/**
 * services/inventory.js — Recipe-based inventory deduction
 *
 * Called inside the POS order transaction after order_items are inserted.
 * Looks up the recipe for each menu item, resolves modifier substitutions,
 * and deducts the resulting quantities from inventory_items.
 *
 * Design notes:
 * - All DB calls receive the live `db` instance so they participate in the
 *   caller's transaction (no nested transactions).
 * - Quantities in recipe_ingredients are stored in the base unit per the
 *   inventory item's `unit` column (kg, litre, unit).
 * - A missing recipe is a soft failure — we log it but do not abort the order.
 *   This prevents a mis-configured recipe from blocking every sale.
 * - A quantity going negative is also soft — we deduct to 0 and flag it so
 *   a low-stock alert fires on the next inventory fetch.
 */

const { getDb } = require('../db/database');
const logger    = require('../utils/logger');

// ── Queries ───────────────────────────────────────────────────────────────────

const SQL_RECIPE = `
  SELECT r.id AS recipe_id
  FROM   recipes r
  WHERE  r.menu_item_id = ?
  LIMIT  1
`;

const SQL_INGREDIENTS = `
  SELECT
    ri.inventory_item_id,
    ri.quantity,
    ri.unit,
    ri.modifier_id,
    ri.is_substitute
  FROM recipe_ingredients ri
  WHERE ri.recipe_id = ?
`;

const SQL_GET_ITEM = `
  SELECT id, name, quantity, unit, reorder_level
  FROM   inventory_items
  WHERE  id = ?
`;

const SQL_DEDUCT = `
  UPDATE inventory_items
  SET    quantity   = MAX(0, quantity - ?),
         updated_at = datetime('now')
  WHERE  id = ?
`;

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Deduct inventory for one order item based on its recipe.
 * Must be called inside an existing database transaction.
 *
 * @param {object} params
 * @param {number}   params.menuItemId   - The menu_items.id being sold
 * @param {number}   params.quantity     - How many of this item were ordered (default 1)
 * @param {number[]} params.modifierIds  - Active modifier IDs selected by the customer
 * @returns {{ deducted: Array, warnings: string[] }}
 */
const deductRecipeFor = ({ menuItemId, quantity = 1, modifierIds = [] }) => {
  const db = getDb();

  /** @type {{ deducted: Array<{itemId:number, name:string, qty:number, unit:string}>, warnings: string[] }} */
  const result = { deducted: [], warnings: [] };

  // 1. Look up recipe
  const recipe = db.prepare(SQL_RECIPE).get(menuItemId);
  if (!recipe) {
    result.warnings.push(`No recipe found for menu item ${menuItemId} — inventory not deducted`);
    logger.warn(`[inventory] No recipe for menu_item_id=${menuItemId}`);
    return result;
  }

  // 2. Load all ingredients for this recipe
  const ingredients = db.prepare(SQL_INGREDIENTS).all(recipe.recipe_id);
  if (!ingredients.length) {
    result.warnings.push(`Recipe ${recipe.recipe_id} has no ingredients — inventory not deducted`);
    return result;
  }

  // 3. Resolve base vs. substitute ingredients
  //    Logic:
  //    - Base ingredients (modifier_id IS NULL, is_substitute = 0) are always included …
  //    - … UNLESS a substitute ingredient exists whose modifier_id is in the active modifierIds.
  //    - Substitute ingredients (is_substitute = 1) are included only when their modifier fires.

  const modifierSet = new Set(modifierIds.map(Number));

  // Group substitutes by the inventory item they replace
  // Key: inventory_item_id of the BASE ingredient they substitute
  // We identify substitution pairs by matching base + substitute quantities for the same recipe.
  // Simpler approach: collect all active substitutes first, then skip base items they replace.

  /** @type {Map<number, object>} inventoryItemId → active substitute ingredient */
  const activeSubstitutes = new Map();

  for (const ing of ingredients) {
    if (ing.is_substitute && ing.modifier_id && modifierSet.has(ing.modifier_id)) {
      // This substitute fires — record it (keyed by its own inventoryItemId for now)
      activeSubstitutes.set(ing.inventory_item_id, ing);
    }
  }

  // Build the set of inventory item IDs that are being substituted OUT
  // We need to know which BASE item each substitute replaces.
  // Convention: a substitute replaces the base ingredient that covers the same
  // preparation role (milk). We detect this by looking at other base ingredients
  // in the same recipe that share the same unit (litre) and similar quantity.
  // Simpler: for each active substitute, find the base ingredient with the
  // closest matching quantity and unit in the same recipe.
  const substitutedBaseIds = new Set();
  for (const sub of activeSubstitutes.values()) {
    const matchingBase = ingredients.find(
      ing => !ing.is_substitute && ing.unit === sub.unit && Math.abs(ing.quantity - sub.quantity) < 0.01
    );
    if (matchingBase) substitutedBaseIds.add(matchingBase.inventory_item_id);
  }

  // 4. Build final deduction list
  /** @type {Map<number, number>} inventoryItemId → total quantity to deduct */
  const deductionMap = new Map();

  for (const ing of ingredients) {
    // Skip substitutes that aren't active
    if (ing.is_substitute && (!ing.modifier_id || !modifierSet.has(ing.modifier_id))) continue;
    // Skip base ingredients that have an active substitute
    if (!ing.is_substitute && substitutedBaseIds.has(ing.inventory_item_id)) continue;

    const existing = deductionMap.get(ing.inventory_item_id) ?? 0;
    deductionMap.set(ing.inventory_item_id, existing + ing.quantity * quantity);
  }

  // 5. Apply deductions
  for (const [itemId, qtyToDeduct] of deductionMap) {
    const invItem = db.prepare(SQL_GET_ITEM).get(itemId);
    if (!invItem) {
      result.warnings.push(`Inventory item ${itemId} not found — skipping deduction`);
      continue;
    }

    db.prepare(SQL_DEDUCT).run(qtyToDeduct, itemId);

    result.deducted.push({
      itemId,
      name:  invItem.name,
      qty:   qtyToDeduct,
      unit:  invItem.unit,
    });

    // Flag if this deduction hits the reorder threshold
    const remaining = Math.max(0, invItem.quantity - qtyToDeduct);
    if (remaining <= invItem.reorder_level) {
      result.warnings.push(
        `Low stock: ${invItem.name} at ${remaining.toFixed(3)} ${invItem.unit} (reorder level: ${invItem.reorder_level})`
      );
    }
  }

  return result;
};

/**
 * Deduct inventory for all items in an order.
 * Must be called inside an existing database transaction.
 *
 * @param {Array<{menuItemId: number, quantity: number, modifierIds: number[]}>} orderItems
 * @returns {{ deducted: Array, warnings: string[] }}
 */
const deductOrderInventory = (orderItems) => {
  const allDeducted = [];
  const allWarnings = [];

  for (const item of orderItems) {
    const { deducted, warnings } = deductRecipeFor(item);
    allDeducted.push(...deducted);
    allWarnings.push(...warnings);
  }

  if (allWarnings.length) {
    logger.warn('[inventory] Deduction warnings: ' + allWarnings.join(' | '));
  }

  return { deducted: allDeducted, warnings: allWarnings };
};

module.exports = { deductRecipeFor, deductOrderInventory };
