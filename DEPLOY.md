# Favo Cafe & Roastery — Deployment Guide

## Platform: Render.com (recommended)

Render supports Node.js + persistent disk storage, which SQLite requires.
Free tier is fine to start; upgrade to Starter ($7/mo) for always-on + SLA disk.

---

## Step 1 — Push to GitHub

1. Create a new **private** repository on GitHub (e.g. `favo-cafe`)
2. In the `favo-cafe` folder, run:
   ```bash
   git init
   git add .
   git commit -m "[init] initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/favo-cafe.git
   git push -u origin main
   ```
3. Make sure `.env` is in `.gitignore` (it already is) — never push secrets.

---

## Step 2 — Create a Render Web Service

1. Go to **https://dashboard.render.com** → New → Web Service
2. Connect your GitHub account and select the `favo-cafe` repo
3. Render will auto-detect `render.yaml` — review and confirm

**Manual settings if not using render.yaml:**
| Field | Value |
|---|---|
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Node version | 22 |

---

## Step 3 — Add a Persistent Disk

SQLite stores everything in a single file. Render's ephemeral filesystem resets on each deploy — you need a persistent disk.

1. In your Render service → **Disks** → Add Disk
2. Name: `favo-db`
3. Mount path: `/data`
4. Size: 1 GB (free tier allows 1GB)

Then set the env var:
```
DB_PATH=/data/favo.db
```

---

## Step 4 — Set Environment Variables

In Render → your service → **Environment**:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `DB_PATH` | `/data/favo.db` |
| `JWT_SECRET` | Generate a strong random string (Render can auto-generate) |
| `JWT_EXPIRES_IN` | `8h` |
| `YOCO_SECRET_KEY` | From portal.yoco.com (leave blank for cash-only operation) |
| `YOCO_WEBHOOK_SECRET` | From Yoco webhook settings |

> **Generate a JWT secret:** run `openssl rand -hex 64` in your terminal.

---

## Step 5 — Seed the Production Database

After the first deploy, open the Render **Shell** tab and run:
```bash
npm run seed
```

This creates all tables and inserts the real menu, staff, and location data.

---

## Step 6 — Custom Domain (optional)

1. Buy a domain (e.g. `favocafe.co.za`) from a registrar like Domains.co.za
2. In Render → your service → **Custom Domains** → Add
3. Add a CNAME record at your registrar pointing to your Render URL
4. Render provisions SSL (Let's Encrypt) automatically — takes ~5 minutes

---

## Step 7 — Yoco Webhook (when ready)

Once you have a Yoco merchant account:
1. Go to portal.yoco.com → Settings → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/yoco/webhook`
3. Copy the webhook secret and add it to Render env vars as `YOCO_WEBHOOK_SECRET`

---

## Database Backup

Render's persistent disk is durable but not backed up by default on free tier.

**Manual backup** — run from Render Shell:
```bash
cp /data/favo.db /data/favo-backup-$(date +%Y%m%d).db
```

**Automated backup** — add a Render Cron Job:
- Command: `cp /data/favo.db /data/favo-backup-$(date +%Y%m%d).db`
- Schedule: `0 2 * * *` (2am daily)

---

## Uptime Monitoring (free)

1. Sign up at **https://uptimerobot.com**
2. Add monitor → HTTP(S) → your domain URL
3. Set alert email/SMS for downtime
4. Free tier checks every 5 minutes

---

## Staff Login After Deploy

Once live, share these with your team:
- **URL:** `https://yourdomain.com/admin/login.html`
- **Nikao (super_admin):** `nikao@hofmi.net`
- **Louis (barista):** `louis@hofmi.net`
- **Nkuleko (barista):** `nkuleko@hofmi.net`
- **Thandeka (barista):** `thandeka@hofmi.net`

> Passwords are in `src/db/seed.js` — change them in the Users admin panel after first login.

---

## Checklist Before Go-Live

- [ ] GitHub repo is private
- [ ] `.env` is NOT committed (check `.gitignore`)
- [ ] Persistent disk mounted at `/data`
- [ ] `DB_PATH=/data/favo.db` set in Render env
- [ ] `JWT_SECRET` is a strong random string (not the default)
- [ ] `npm run seed` run on production server
- [ ] Custom domain pointing to Render
- [ ] SSL certificate active (green padlock)
- [ ] Admin login tested in production
- [ ] POS tested end-to-end with a real order
- [ ] UptimeRobot monitor set up
