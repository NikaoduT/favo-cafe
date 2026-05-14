require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRoutes          = require('./src/routes/auth');
const inventoryRoutes     = require('./src/routes/inventory');
const crmRoutes           = require('./src/routes/crm');
const posRoutes           = require('./src/routes/pos');
const loyaltyRoutes       = require('./src/routes/loyalty');
const menuRoutes          = require('./src/routes/menu');
const usersRoutes         = require('./src/routes/users');
const customerPortalRoutes = require('./src/routes/customer-portal');
const yocoWebhookRoutes   = require('./src/routes/yoco-webhook');
const hoursRoutes         = require('./src/routes/hours');

const { requestLogger } = require('./src/utils/logger');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',            authRoutes);
app.use('/api/menu',            menuRoutes);
app.use('/api/inventory',       inventoryRoutes);
app.use('/api/customers',       crmRoutes);
app.use('/api/orders',          posRoutes);
app.use('/api/loyalty',         loyaltyRoutes);
app.use('/api/users',           usersRoutes);
app.use('/api/customer-portal', customerPortalRoutes);
app.use('/api/yoco',            yocoWebhookRoutes);
app.use('/api/hours',           hoursRoutes);

// ── Admin SPA fallback ───────────────────────────────────────────────────────
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start only when run directly (not when required by Netlify function) ────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Favo Cafe server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
