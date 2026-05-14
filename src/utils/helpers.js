/**
 * Format an integer (cents) to a human-readable ZAR currency string.
 * @param {number} cents
 * @returns {string} e.g. "R20"
 */
const formatCurrency = (cents) => {
  const rands = Math.round(cents) / 100;
  return `R${rands % 1 === 0 ? rands : rands.toFixed(2)}`;
};

/**
 * Convert a decimal rand amount to integer cents.
 * @param {number} rands
 * @returns {number}
 */
const toCents = (rands) => Math.round(rands * 100);

/**
 * Capitalise the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
const capitalise = (str) => str.charAt(0).toUpperCase() + str.slice(1);

module.exports = { formatCurrency, toCents, capitalise };
