# DEV Post Draft — copy into a new DEV post and fill the [PLACEHOLDERS]

> Use the official submission template on the challenge page as the base — it
> auto-adds the tags. The tags must be: #devchallenge #weekendchallenge #hf26challenge
> Fill in [DEPLOYED_URL] and [VIDEO_URL] before publishing.

---

# My friend wouldn't stop asking, so I built him a vault: SecureNote

## What I built and who it's for

**SecureNote** is end-to-end encrypted note sharing, and I built it for one
specific person: my friend, who has spent weeks explaining — at increasing
volume — that he needs to hand his notes to *exactly* the people he chooses,
and nobody else, without losing control of where they end up.

He didn't want "a notes app." He wanted three promises:

1. Only people he personally grants access can ever open a note.
2. He knows every single time someone reads one — who, when, from where.
3. If trust ends, access ends, instantly.

And one wish he stated like a fact: *"and no screenshots."*

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

## Try it

Deployed instance: [DEPLOYED_URL] — sign up with two email addresses, write a
note as account A, share it to account B with a view limit, open it as B, then
watch A's audit log. Then press PrintScreen as B and watch it show up there.

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
