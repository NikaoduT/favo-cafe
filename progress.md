# progress.md — Favo Cafe & Roastery

> Track every task here. Update status after each work session.
> Status: ⬜ Not started | 🔄 In progress | ✅ Done | ❌ Blocked

---

## Phase 1 — Foundation
| Task | Status | Notes |
|---|---|---|
| Create CLAUDE.md | ✅ Done | |
| Create architecture.md | ✅ Done | |
| Create progress.md | ✅ Done | |
| Create .env.example | ✅ Done | |
| Create .gitignore | ✅ Done | |
| Create package.json | ✅ Done | node:sqlite (built-in), bcryptjs, JWT, Express |

---

## Phase 2 — Database
| Task | Status | Notes |
|---|---|---|
| schema.sql | ✅ Done | 20 tables — all Phase 6 columns in base definitions |
| migrate.js | ✅ Done | Safe idempotent migration — `npm run migrate` |
| seed.js | ✅ Done | 1 location, 4 users, 22 menu items, 10 inventory items, 3 customers, 4 modifier groups, 12 modifiers, 19 recipes, 60 ingredients |
| database.js | ✅ Done | node:sqlite helpers |
| menu.json | ✅ Done | 22 items |
| locations.json | ✅ Done | Favo Main seed row |
| modifier-groups.json | ✅ Done | Size / Milk / Extra Shot / Syrup |
| recipes.json | ✅ Done | 19 recipes with base + milk-substitute ingredients |

---

## Phase 3 — Auth + API
| Task | Status | Notes |
|---|---|---|
| server.js | ✅ Done | All 7 route modules mounted |
| src/routes/auth.js | ✅ Done | Login, logout, /me |
| src/routes/menu.js | ✅ Done | Public + admin endpoints |
| src/routes/inventory.js | ✅ Done | Full CRUD, role guards |
| src/routes/crm.js | ✅ Done | Customer CRUD, search, tier filter |
| src/routes/loyalty.js | ✅ Done | Earn, redeem, tier logic |
| src/routes/pos.js | ✅ Done | Order creation + inventory deduction + stamp earn |
| src/routes/users.js | ✅ Done | Staff CRUD — super_admin only |
| src/middleware/auth.js | ✅ Done | JWT verify |
| src/middleware/roles.js | ✅ Done | RBAC |
| src/utils/logger.js | ✅ Done | |
| src/utils/helpers.js | ✅ Done | formatCurrency, toCents, loyalty helpers |
| src/services/inventory.js | ✅ Done | deductRecipeFor + deductOrderInventory, modifier substitution |
| src/services/loyalty.js | ✅ Done | earnStamps, redeemFreeDrink, checkBirthdayReward, lookupByPhone |

---

## Phase 4 — Admin Login
| Task | Status | Notes |
|---|---|---|
| admin/login.html | ✅ Done | |
| public/css/tokens.css | ✅ Done | |
| admin/css/admin-tokens.css | ✅ Done | |
| admin/css/admin-login.css | ✅ Done | |
| admin/js/admin-auth.js | ✅ Done | Token management, apiFetch, requireAuth |

---

## Phase 5 — Public Website
| Task | Status | Notes |
|---|---|---|
| public/css/main.css | ✅ Done | |
| public/css/components/navbar.css | ✅ Done | |
| public/css/components/hero.css | ✅ Done | |
| public/css/components/menu-card.css | ✅ Done | |
| public/css/components/footer.css | ✅ Done | |
| public/css/components/page-hero.css | ✅ Done | Shared inner-page banner |
| public/js/main.js | ✅ Done | |
| public/js/menu.js | ✅ Done | |
| public/js/loyalty-portal.js | ✅ Done | Sign-up, phone login, stamp card, visit history |
| public/js/order-cart.js | ✅ Done | Menu browse, modifiers, cart, pickup time, order confirmation |
| public/index.html | ✅ Done | |
| public/menu.html | ✅ Done | |
| public/about.html | ✅ Done | Story, roastery process, values, team |
| public/contact.html | ✅ Done | Contact form, hours table, address |
| public/events.html | ✅ Done | Cuppings, latte art, home brew, private booking inquiry |
| public/loyalty.html | ✅ Done | Sign-up/login tabs, stamp card widget, visit history |
| public/order.html | ✅ Done | Menu grid + modifiers + cart + pickup time |

---

## Phase 6–10 — Admin Modules
| Task | Status | Notes |
|---|---|---|
| admin/css/admin-layout.css | ✅ Done | Shared sidebar, topbar, panel, table, stat-card |
| admin/css/inventory.css | ✅ Done | |
| admin/css/crm.css | ✅ Done | |
| admin/css/loyalty.css | ✅ Done | |
| admin/css/pos.css | ✅ Done | |
| admin/dashboard.html | ✅ Done | Today's sales, orders, customers, low-stock; recent orders table |
| admin/inventory.html | ✅ Done | Stock table, add/edit modal, delete confirm, low-stock badges |
| admin/crm.html | ✅ Done | Customer table, search, tier filter, profile slide-over, add/edit modal |
| admin/loyalty.html | ✅ Done | Member list, tier filter, manual earn/redeem, member detail modal |
| admin/pos.html | ✅ Done | Menu grid + category tabs, cart, customer lookup, payment, receipt |
| admin/users.html | ✅ Done | Staff list, add/edit modal, activate/deactivate — super_admin only |
| admin/js/admin-auth.js | ✅ Done | |
| admin/js/inventory.js | ✅ Done | |
| admin/js/crm.js | ✅ Done | |
| admin/js/loyalty.js | ✅ Done | |
| admin/js/pos.js | ✅ Done | |
| admin/js/users.js | ✅ Done | |

---

## Phase 11 — Deployment
| Task | Status | Notes |
|---|---|---|
| Production .env setup | ⬜ Not started | |
| Choose hosting platform | ⬜ Not started | Railway / Render / VPS |
| Domain name | ⬜ Not started | |
| SSL certificate | ⬜ Not started | |
| Admin credentials set | ⬜ Not started | |

---

## Known Gaps & Next Priorities

| # | Gap | Priority |
|---|---|---|
| 1 | Yoco Online payment not integrated — order.html shows confirmation without actual payment | Medium |
| 2 | WhatsApp / Resend notification service not built | Medium |
| 3 | `npm run seed` / `npm run migrate` need Windows terminal (not Linux sandbox) due to path | Low |
| 4 | admin/users.html sidebar link not yet added to users.html itself (self-referential) | Low |

---

## Last Updated
2026-05-07 — All pages complete.
Public site: 7 pages (index, menu, about, contact, events, loyalty, order) + Events link in all navs.
Admin: 7 pages (login, dashboard, inventory, crm, loyalty, pos, users) + Staff Users in all sidebars.
Backend: 7 routes (auth, menu, inventory, crm, pos, loyalty, users) + services (inventory, loyalty).
To run: double-click fix-and-run.bat in the favo-cafe folder.
