/**
 * hours.js — Public endpoints for cafe opening hours and updates.
 *
 * Routes:
 *   GET /api/hours          — weekly schedule + order-ahead config (cafe-hours.json)
 *   GET /api/hours/status   — { open: boolean, today, nextOpenLabel } computed server-side
 *   GET /api/updates        — active promo/update cards for the customer portal
 *
 * All routes are public — no auth required.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HOURS_PATH  = path.join(DATA_DIR, 'cafe-hours.json');
const UPDATES_PATH = path.join(DATA_DIR, 'cafe-updates.json');

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday'
};

/**
 * Safely read a JSON file from /data. Returns null if missing.
 * @param {string} filePath
 */
const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
};

/**
 * Parse "HH:MM" to total minutes since midnight.
 * @param {string} hhmm
 * @returns {number}
 */
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

/**
 * Compute open/closed status for a given Date using a weekly schedule.
 * @param {object} hours - cafe-hours.json content
 * @param {Date} now
 */
const computeStatus = (hours, now) => {
  const weekly = hours?.weekly || {};
  const todayKey = DAY_KEYS[now.getDay()];
  const todayWindow = weekly[todayKey];
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  const isOpenNow = !!todayWindow
    && minutesNow >= toMinutes(todayWindow.open)
    && minutesNow < toMinutes(todayWindow.close);

  // Find next opening window within 7 days
  let nextOpen = null;
  for (let i = 0; i < 7; i += 1) {
    const idx = (now.getDay() + i) % 7;
    const key = DAY_KEYS[idx];
    const win = weekly[key];
    if (!win) continue;
    if (i === 0 && minutesNow >= toMinutes(win.open)) continue;
    nextOpen = {
      day: key,
      dayLabel: DAY_LABELS[key],
      open: win.open,
      close: win.close,
      isToday: i === 0,
      isTomorrow: i === 1
    };
    break;
  }

  return {
    open: isOpenNow,
    today: todayWindow ? { ...todayWindow, dayLabel: DAY_LABELS[todayKey] } : null,
    nextOpen
  };
};

router.get('/', (req, res) => {
  const hours = readJson(HOURS_PATH);
  if (!hours) return res.status(500).json({ error: 'Hours data unavailable' });
  return res.json(hours);
});

router.get('/status', (req, res) => {
  const hours = readJson(HOURS_PATH);
  if (!hours) return res.status(500).json({ error: 'Hours data unavailable' });
  return res.json(computeStatus(hours, new Date()));
});

module.exports = router;

// Updates endpoint exported as a small sub-router for /api/updates mounting
module.exports.updatesRouter = (() => {
  const r = express.Router();
  r.get('/', (req, res) => {
    const data = readJson(UPDATES_PATH);
    if (!data) return res.json({ updates: [] });
    const active = (data.updates || []).filter(u => u.active !== false);
    return res.json({ updates: active });
  });
  return r;
})();
