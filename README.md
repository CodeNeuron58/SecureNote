<div align="center">

<img src="docs/banner.svg" alt="SecureNote" width="600"/>

# SecureNote

### Share notes like secrets.

End-to-end encrypted notes and files, shared with exactly the people you choose.
Every read is watermarked and logged, every grant is revocable, and the AI that searches
your notes runs entirely in your browser.

![License](https://img.shields.io/badge/license-MIT-green) ![Next.js](https://img.shields.io/badge/Next.js-15-black) ![AI](https://img.shields.io/badge/AI-Gemma_3_in_browser-emerald) ![Hosted on Render](https://img.shields.io/badge/hosted_on-Render-46E3B7) ![DB](https://img.shields.io/badge/db-MongoDB_Atlas-47A248)

**[Live demo](https://securenote-j8b0.onrender.com)** · built for Hacktoberfest 2026, the DEV "Build for a Friend" challenge

</div>

---

## Why

A friend needed to hand sensitive notes to specific people *and only those people*, without
losing control of where they end up. No links floating around, no silent reads, no "delete it
please" after the fact. This is that tool.

## What it does

- **Zero-knowledge server** — notes and files (PDFs, docs, images up to 10 MB) are AES-256-GCM
  encrypted in the browser; the database stores ciphertext it cannot read
- **Share with a person, not a link** — the note key is wrapped for each reader's public key,
  with expiry dates and view-count limits enforced atomically
- **Revocable instantly** — kill someone's access in one click; their open tabs lock on next focus
- **Per-viewer watermarks** — every page shows the reader's identity, so leaks carry a name
- **Read audit trail** — who opened what, when, from where; screenshot-key attempts included
- **Private AI** — semantic search and "chat with your notes" powered by Gemma 3 (open weight),
  running in the browser via WebGPU. Nothing is uploaded

## See it in action

Open the [live demo](https://securenote-j8b0.onrender.com) and sign up with two
accounts. Write a note as account A, share it to account B with a 2-view limit,
open it as B: your email is stamped across the page as a watermark. Then check
A's audit log: the open is on the record. Press PrintScreen as B and watch that
land there too.

<!-- TODO before publishing:
     1. embed screenshot: shared-note viewer with watermark visible
     2. embed screenshot: owner's audit log with "opened" + "screenshot attempt" rows
     3. add demo video link: [VIDEO_URL]
     4. optional: demo account credentials for judges
-->

## Honest security note

No website can block a phone camera pointed at a screen. SecureNote aims to be
**leak-resistant and leak-traceable**, not screenshot-proof: every page is watermarked to the
person reading it, at a recorded time, from a recorded address.

## The crypto, in one paragraph

At signup your browser generates an ECDH P-256 keypair; the private key is encrypted with a
key derived from your password (PBKDF2-SHA-256, 310k iterations) before upload. Notes get a
random content key, encrypted client-side. Sharing re-wraps that key for the recipient's
public key (ephemeral ECDH + HKDF), so the server only ever relays sealed blobs. The full
flow lives in [`lib/crypto.ts`](lib/crypto.ts).

## Run it

```bash
npm install
cp .env.example .env.local   # add MONGODB_URI + JWT_SECRET
npm run dev
```

## Deploy

Free tier works: MongoDB Atlas (M0) + Render. Blueprint included — see [DEPLOY.md](DEPLOY.md).
Deploy the friend-facing instance with `NEXT_PUBLIC_ENABLE_AI=false` for a no-AI build.

## License

MIT
