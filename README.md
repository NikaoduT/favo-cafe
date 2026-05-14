# Favo Cafe & Roastery

Full-stack platform for Favo Cafe — POS, CRM, Inventory Management, and Loyalty Program.

**Stack:** Node.js · Express · SQLite (better-sqlite3) · Vanilla HTML/CSS/JS · JWT auth

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org) | 18 LTS or higher | Tick **"Add to PATH"** during install |
| npm | Bundled with Node.js | — |
| Git | Any recent version | Optional but recommended |

> **Windows note:** `better-sqlite3` ships pre-built Windows binaries for Node 18–22 (x64).
> `npm install` should complete without a compiler. If you see a `node-gyp` or `MSBuild` error,
> install the build tools — see [Troubleshooting](#troubleshooting) below.

---

## Quick Start (Windows)

### Option A — Batch file (double-click)

```
setup.bat
```

### Option B — PowerShell

```powershell
# If scripts are blocked, run this once in an admin PowerShell:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Then from the project folder:
.\setup.ps1
```

### Option C — Manual steps

```cmd
:: 1. Copy environment file
copy .env.example .env

:: 2. Install dependencies
npm install --prefer-binary

:: 3. Seed the database
npm run seed

:: 4. Start the server
npm run dev
```

---

## Running the Server

```cmd
npm start          :: Production (no auto-reload)
npm run dev        :: Development (nodemon auto-reload)
```

Open in your browser:

| URL | Description |
|---|---|
| `http://localhost:3000` | Public website |
| `http://localhost:3000/menu` | Menu page |
| `http://localhost:3000/admin/login.html` | Admin panel |

---

## Default Credentials

> **Change these before deploying.**

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@favocafe.co.za` | `FavoAdmin2024!` |
| Manager | `manager@favocafe.co.za` | `FavoAdmin2024!` |
| Barista | `barista@favocafe.co.za` | `barista123` |
| Roaster | `roaster@favocafe.co.za` | `roaster123` |

---

## Environment Variables

Copy `.env.example` to `.env` and update the values:

```env
PORT=3000
JWT_SECRET=replace_with_a_long_random_secret_string
JWT_EXPIRES_IN=8h
DB_PATH=./src/db/favo.db
NODE_ENV=development
ADMIN_DEFAULT_EMAIL=admin@favocafe.co.za
ADMIN_DEFAULT_PASSWORD=replace_before_deploy
```

Generate a strong `JWT_SECRET` with:

```cmd
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Project Structure

```
favo-cafe/
├── server.js              ← Express entry point
├── package.json
├── .env                   ← Local secrets (not committed)
├── .env.example           ← Safe template
├── setup.bat              ← Windows batch setup
├── setup.ps1              ← Windows PowerShell setup
│
├── src/
│   ├── routes/            ← API handlers (auth, menu, inventory, crm, pos, loyalty)
│   ├── middleware/        ← JWT auth + RBAC
│   ├── db/                ← SQLite connection, schema, seed
│   └── utils/             ← Logger, helpers
│
├── public/                ← Public website (no auth)
├── admin/                 ← Admin system (JWT-protected)
└── data/                  ← menu.json, products.json
```

---

## npm Scripts

| Script | Command | Description |
|---|---|---|
| `npm start` | `node server.js` | Start production server |
| `npm run dev` | `nodemon server.js` | Start with auto-reload |
| `npm run seed` | `node src/db/seed.js` | Reset and seed the database |
| `npm run setup` | — | Copy `.env.example` → `.env` |
| `npm run install:windows` | `npm install --prefer-binary` | Install using pre-built binaries |

---

## Troubleshooting

### `node-gyp` / `MSBuild` error during `npm install`

`better-sqlite3` needs a C++ compiler when no pre-built binary matches your Node version.

**Fix — install build tools (run as Administrator):**

```powershell
npm install --global windows-build-tools
```

Or install **"Desktop development with C++"** from
[Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools),
then retry `npm install`.

---

### Port 3000 already in use

Find and kill the process occupying the port:

```cmd
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

Or change the port in `.env`:

```env
PORT=3001
```

---

### PowerShell script blocked (`cannot be loaded because running scripts is disabled`)

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

### `nodemon` not recognised

```cmd
npm install --save-dev nodemon
```

Or run directly:

```cmd
npx nodemon server.js
```

---

## Git & Line Endings

This repo ships with a `.gitattributes` file that normalises all text files to **LF** on commit
and checkout. No extra configuration needed on Windows — Git will handle it automatically.

---

## Coding Standards

See [CLAUDE.md](CLAUDE.md) for full conventions: BEM CSS, semantic HTML, JSON data format,
role-based access, and commit message rules.
