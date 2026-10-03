# Deploying SecureNote (free tier, ~15 minutes)

Two free services: **MongoDB Atlas** (database) and **Render** (hosting).

## 1. MongoDB Atlas (free M0)

1. Create an account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) → build a **free M0** cluster.
2. **Database Access** → add a user (username + password, "Read and write to any database").
3. **Network Access** → add IP `0.0.0.0/0` (allow from anywhere — Render's IPs are dynamic).
4. **Cluster → Connect → Drivers** → copy the URI (`mongodb+srv://user:pass@...`).

## 2. Render (free web service)

### Option A — Blueprint (uses render.yaml in this repo)
1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → pick the repo → Render reads `render.yaml`.
3. When prompted, paste your `MONGODB_URI` (the only secret it asks for).

### Option B — Manual web service
1. Render → **New → Web Service** → connect the repo.
2. Runtime **Node**, Build `npm ci && npm run build`, Start `npm start`.
3. Environment variables:
   - `MONGODB_URI` = your Atlas URI
   - `JWT_SECRET` = long random string (Render can generate one)
   - `NEXT_PUBLIC_ENABLE_AI` = `true` (submission) or `false` (friend instance)
   - `NODE_VERSION` = `22`
4. Create → first deploy takes a few minutes.

## 3. Verify

- `https://<your-app>.onrender.com/api/health` → `{"ok":true,"db":"up"}`
- Sign up, create a note, share it with a second account, open as the second
  account, check the owner's audit log.

## Notes on the free tier

- Render free instances **spin down after ~15 min idle**; the first request
  afterwards takes ~50 s (cold start). Warm the app before recording a demo.
- Atlas M0 is fine here: the app stores only ciphertext, metadata and audit
  rows — a few KB per note.
- Two instances (submission + friend build) can share one Atlas cluster:
  use the same `MONGODB_URI` and different app services. Keep `JWT_SECRET`
  the same if accounts should work across both.
