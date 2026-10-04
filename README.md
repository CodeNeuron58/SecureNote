# SecureNote

![License](https://img.shields.io/badge/license-MIT-green) ![Next.js](https://img.shields.io/badge/Next.js-15-black) ![AI](https://img.shields.io/badge/AI-Gemma_3_in_browser-emerald) ![Hosted on Render](https://img.shields.io/badge/hosted_on-Render-46E3B7) ![DB](https://img.shields.io/badge/db-MongoDB_Atlas-47A248)

**Share notes like secrets.** End-to-end encrypted note sharing with per-viewer
watermarks, a full read-audit trail, and AI that runs entirely in your browser.

Built for **Hacktoberfest 2026 · DEV Weekend Challenge — "Build for a Friend"**.
The friend in question spent two weeks insisting he needed to hand his notes to
specific people *and only those people*, without losing control of where they
ended up. This is that tool.

> **One honest sentence up front:** no website can physically block a phone
> camera pointed at a monitor — anyone claiming otherwise is selling something.
> SecureNote's goal is to be **leak-resistant and leak-traceable**: every page a
> reader opens is watermarked with their identity, logged with a time and IP,
> and revocable the moment trust ends.

---

## What it does

| Capability | How |
|---|---|
| **Zero-knowledge server** | Notes are AES-256-GCM encrypted in the browser. The database stores only ciphertext and metadata. A full DB leak reveals nothing readable. |
| **Share with a person, not a link** | You pick a recipient by account email; the note key is wrapped for *their* public key (ECDH-ephemeral + HKDF) in your browser. |
| **Expiry + view limits** | Grants can expire (1h → 30d) and cap the number of opens. Enforced server-side. |
| **Instant revocation** | One click kills a grant — even after the recipient has read the note. |
| **Per-viewer watermark** | Every view renders the reader's email, view number and timestamp across the page. Leaks carry their name. |
| **Read audit trail** | Every open (and screenshot-key attempt) is recorded: who, when, IP, device. Owners see it all; owners' own reads are never logged. |
| **Encrypted file sharing** | Upload PDFs, DOCX, images or any file (≤10 MB). The file is AES-256-GCM encrypted in the browser — including its filename and MIME type — and decrypted only in the reader's browser. PDFs and images render inline, under the watermark. |
| **Anti-leak deterrence** | Copy/selection/right-click/print disabled, page content hides when the tab loses focus, PrintScreen is intercepted where the browser allows and logged as an event. |
| **Local AI over your notes** | Semantic search + "chat with your notes" powered by **Gemma 3** (open weight) running **in the browser tab** via transformers.js/WebGPU. Embeddings live in IndexedDB. Nothing is uploaded. |

## The cryptography, briefly

1. **Signup** — the browser generates an ECDH P-256 keypair. The private key is
   encrypted with a KEK derived from your password (PBKDF2-SHA-256, 310k
   iterations) before upload. The server stores: bcrypt hash, salt, public key,
   encrypted private key. It never sees the password.
2. **Write** — each note gets a random content key. Title and body are encrypted
   client-side; the content key is wrapped to your own public key (`selfWrap`).
3. **Share** — your browser unwraps the content key and wraps it for the
   recipient's public key. The server relays sealed blobs it cannot open.
4. **Read** — the recipient's browser unwraps with their private key. Every open
   increments a server-side counter and writes an audit row *before* the
   ciphertext is released.
5. **Revoke** — the grant is flagged revoked; the sealed key stops being served.

Threat model: protects note **content** against server compromise, database
leaks, and unauthorized readers. Does **not** protect against a determined
reader with a camera — that is what the watermark + audit trail are for.
Known limitation, stated honestly: for inline PDF previews the browser's own
PDF viewer is used, and its built-in save/print controls cannot be disabled by
any website — the per-viewer watermark is stamped above the preview and every
open/fetch is audit-logged, so leaks remain traceable.

## Stack

- **Next.js 15 + TypeScript + Tailwind** (App Router)
- **WebCrypto** for all cryptography (no crypto library dependencies)
- **MongoDB Atlas** — ciphertext + grants + audit events only
- **Gemma 3 1B IT** (open weight, `onnx-community/gemma-3-1b-it-ONNX`) +
  MiniLM embeddings via **transformers.js**, WebGPU with WASM fallback
- **Hosted on Render** (free tier)

## Run it locally

```bash
npm install
cp .env.example .env.local   # add your MONGODB_URI + JWT_SECRET
npm run dev                  # http://localhost:3000
```

## Deploy on Render

See [DEPLOY.md](DEPLOY.md) — Atlas (free M0) + Render free web service,
`render.yaml` blueprint included. Deploy the friend-facing instance with
`NEXT_PUBLIC_ENABLE_AI=false` for a no-AI build.

## API surface

| Route | Purpose |
|---|---|
| `POST /api/auth/signup` | create account (key material generated client-side) |
| `POST /api/auth/login` | session + salt/encrypted private key for unlock |
| `GET /api/notes` | list owned + granted notes (ciphertext) |
| `POST /api/notes` | create note (ciphertext + selfWrap) |
| `GET /api/notes/:id` | fetch + decrypt material; logs viewer opens, enforces limits |
| `PUT /api/notes/:id` | owner update (re-encrypted ciphertext) |
| `POST /api/notes/:id/share` | add/replace grant with wrapped key (preserves view counters) |
| `DELETE /api/notes/:id/share?grantId=` | revoke |
| `PUT /api/notes/:id/file` | upload/replace the encrypted file (raw ciphertext body) |
| `GET /api/notes/:id/file` | fetch encrypted file (audit-logged for viewers) |
| `GET /api/notes/:id/access` | viewer re-checks grant on focus, without metering |
| `GET /api/notes/:id/views` | owner-only audit log |
| `POST /api/notes/:id/event` | viewer-side deterrent events (screenshot key) |
| `GET /api/health` | liveness + db status |

## License

MIT — see [LICENSE](LICENSE).
