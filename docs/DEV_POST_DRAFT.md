# DEV Post Draft — copy into a new DEV post and fill the [PLACEHOLDERS]

> Use the official submission template on the challenge page as the base — it
> auto-adds the tags. The tags must be: #devchallenge #weekendchallenge #hf26challenge
> **Before publishing:** fill in [DEPLOYED_URL] and [VIDEO_URL], add a cover
> image, and embed the screenshots listed in the Screenshots section below.

---

# My friend wouldn't stop asking, so I built him a vault: SecureNote

## What I built and who it's for

My friend had one requirement that sounds reasonable and is actually
impossible: *"I want to share my notes with exactly the people I choose — and
I want no screenshots."* Two of those promises are keepable. One isn't.
**SecureNote** is what I built instead of lying to him — end-to-end encrypted
note and file sharing where every read is watermarked, logged, and revocable.

And he wanted three guarantees:

1. Only people he personally grants access can ever open a note.
2. He knows every single time someone reads one — who, when, from where.
3. If trust ends, access ends, instantly.

His notes, by the way, aren't text — they're PDFs, scanned documents, photos
of lecture boards. So SecureNote treats **files as first-class citizens**: you
upload a PDF (up to 10 MB), and it's encrypted — filename, type and contents —
in your browser before upload, then decrypted only inside the reader's browser,
where it renders inline *under a watermark that carries the reader's name*.

That last one became the most interesting part of the build, because it's the
one promise **no website on earth can keep** — and this post is partly about
what I built instead of a lie.

**Demo:** [DEPLOYED_URL]  ·  **Video walkthrough:** [VIDEO_URL]
*(the demo video is narrated with an ElevenLabs voice — which is exactly the
kind of use ElevenLabs suggests for demos: narration for the demo, never
touching note content)*

## The code

The full source is on GitHub: **[https://github.com/CodeNeuron58/SecureNote](https://github.com/CodeNeuron58/SecureNote)**

The README documents the whole security model, including the threat model and
what the app deliberately does *not* claim.

## How I built it

**The cryptography (no crypto libraries — just WebCrypto):**

- At signup, your browser generates an **ECDH P-256 keypair**. The private key
  is encrypted with a key derived from your password (PBKDF2-SHA-256, 310,000
  iterations) before it's ever uploaded.
- Every note gets a random content key; title and body are **AES-256-GCM
  encrypted in the browser**. The MongoDB database stores ciphertext and
  metadata — a full database dump reads like noise.
- When you share, your browser unwraps the content key and re-wraps it for the
  recipient's public key (ephemeral ECDH + HKDF). The server relays sealed
  blobs it cannot open. It's a zero-knowledge server by construction.
- Every open by a viewer is metered server-side (view limits, expiry) and
  written to an **audit log** before the ciphertext is released. Owners see
  who opened what, when, from which IP. Owners' own reads are never logged.

**The anti-leak stack — deterrence, honestly labeled:**

- Every page a reader opens is **watermarked with their email, the view number
  and a timestamp**, tiled across the content. If they screenshot it, they
  screenshot their own name.
- Copy, selection, right-click and print are disabled; the page blurs the
  moment the tab loses focus; pressing PrintScreen triggers a best-effort
  clipboard overwrite *and* is recorded in the owner's audit log.
- What I did **not** do is claim it's "screenshot-proof." It isn't. A phone
  camera beats any website. So the product goal is **leak-traceable, not
  leak-impossible** — and being straight about that in the app itself (there's
  an "honest security model" section on the landing page) felt like better
  engineering than a fake guarantee.

**The open-source AI — the part I'm proudest of:**

Here's the contradiction the whole project hangs on: my friend wants *private*
notes. Sending private notes to a cloud AI API defeats the entire point. So
the AI **runs in the viewer's browser tab**:

- **Semantic search** over his notes using MiniLM embeddings (transformers.js),
  with the vector store in IndexedDB — computed locally, cached locally.
- **"Chat with your notes"**: retrieved chunks are fed to **Gemma 3 1B IT**
  (open weight, `onnx-community/gemma-3-1b-it-ONNX`) running via WebGPU, with
  a WASM fallback. The model is downloaded once, cached, and then works with
  zero further network calls. Open the demo, watch the network tab: when you
  search or ask a question, **nothing leaves the browser**.

One deliberate scope decision: the AI indexes **your own notes only**. Notes
shared *to* you aren't indexed, because indexing would require fetching their
content outside the view-metering system — and inflating someone's view
counts to power a search index felt like breaking promise #2 for convenience.

## Why open innovation matters for what I built

- **It keeps data off servers nobody controls.** The notes are encrypted
  client-side, the AI runs on-device, and the model is an open-weight one I
  could audit, swap, or self-host. A closed model API would mean my friend's
  most private text leaves his machine for someone else's infrastructure —
  the exact thing he asked me to prevent.
- **It cost nothing to run.** Open-weight models + free tiers (Render, Atlas
  M0) mean the whole thing runs at $0. He can also clone the repo and run the
  entire stack on his own laptop, offline, forever.
- **It's swappable.** Because inference goes through transformers.js with
  pluggable ONNX models, he can trade up to a bigger open model, or point the
  app at a different one, without asking anyone's permission. That's the
  difference between using software and owning it.
- **The open approach worked better than a closed one here** — not despite the
  privacy requirement, but *because* of it. The closed option wasn't merely
  more expensive; it was architecturally wrong for the problem.

## Screenshots

<!-- Before publishing: take these 3 screenshots and embed them here (DEV image upload):
     1. The shared-note viewer: watermarked page with the viewer's identity visible
     2. The owner's audit log showing an "opened" row and an amber "screenshot attempt" row
     3. The AI panel answering a question with its source chips visible -->

## Try it

Deployed instance: [DEPLOYED_URL]

Don't want to sign up twice? Two demo accounts are live on the instance:

- **Owner:** [DEMO_OWNER_EMAIL] / password [DEMO_OWNER_PASSWORD]
- **Viewer:** [DEMO_VIEWER_EMAIL] / password [DEMO_VIEWER_PASSWORD]

A shared note is already sitting in the viewer's inbox: sign in as the viewer
and open it — your session's email is stamped across the page as a watermark.
Then sign in as the owner and check the audit log: every open, every file
fetch, even the viewer's PrintScreen presses, all on the record with IP and
device. Press PrintScreen as the viewer yourself and watch it land there.

## Prize categories I'm entering

- **Best Use of Gemma** — Gemma 3 1B (open weight) powers the in-browser
  "chat with your notes" and semantic search, running locally via WebGPU.
- **Best Use of Render** — the entire app (the front end where the local AI
  runs) is hosted on Render's free tier.
- **Best Use of MongoDB Atlas** — Atlas is the data layer for ciphertext,
  grants and audit events; deliberately storing only what the server is
  allowed to know.
- **Best Use of ElevenLabs** — the demo video narration is generated with
  ElevenLabs (narration only — note content never touches any cloud AI).

---

*Built for the Hacktoberfest 2026 DEV Weekend Challenge: Build for a Friend.*
*Thanks to my friend for the two weeks of relentless nagging — this app is
basically a transcript of it.*

---

<!-- ELEVENLABS NARRATION SCRIPT (for the demo video, not the post):

"Meet my friend. He takes notes, and he's paranoid — with good reason.
He needed to share them with specific people. Only those people. And he wanted
to know every time someone read one. So I built SecureNote. Notes are encrypted
in the browser with keys the server never sees. Sharing wraps the note's key
for each reader's public key — no links, just people. Every view is watermarked
with the reader's identity and written to an audit log. And the AI? It searches
and chats with his notes using Gemma 3 — running entirely in the browser. Open
the network tab: nothing leaves the device. One thing I won't pretend: no
website can block a phone camera. So instead, every leak is traceable — to a
name, a time, and an IP. SecureNote: share notes like secrets."

-->
