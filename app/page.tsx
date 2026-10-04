import Link from "next/link";
import {
  ShieldIcon,
  EyeIcon,
  CpuIcon,
  LockIcon,
  CheckIcon,
  CrossIcon,
} from "@/components/icons";

const STEPS = [
  {
    title: "Write, encrypted on sight",
    text: "Every note and every file is AES-256-GCM encrypted inside your browser before it touches the network. The server stores ciphertext it cannot read — titles, contents, even filenames.",
  },
  {
    title: "Share with a person, not a link",
    text: "Pick a recipient by their account, set an expiry and a view limit. The note's key is wrapped for their public key alone. Revoke in one click — instantly, even after they've read it.",
  },
  {
    title: "Know every time it's opened",
    text: "Each view is watermarked with the reader's identity and written to an audit log only you can see: who, when, from where. A leak carries the leaker's name.",
  },
];

const STACK = [
  "Gemma 3 · open weight · in-browser",
  "transformers.js + WebGPU",
  "WebCrypto E2E",
  "MongoDB Atlas · ciphertext only",
  "Next.js 15",
  "Hosted on Render",
];

export default function Home() {
  return (
    <main className="min-h-[100dvh]">
      {/* Hero — split: content left, specimen right */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(700px 320px at 18% -80px, rgba(16,185,129,0.22), transparent)",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 pb-20 pt-16 sm:pt-24 md:grid-cols-12">
          <div className="md:col-span-7">
            <p className="sn-rise inline-flex items-center gap-2 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300">
              <ShieldIcon className="h-3.5 w-3.5" />
              Hacktoberfest 2026 · DEV Weekend Challenge
            </p>
            <h1
              className="sn-rise mt-5 text-4xl font-semibold leading-[1.04] tracking-tighter sm:text-6xl"
              style={{ ["--i" as string]: 1 }}
            >
              Share notes like{" "}
              <span className="text-emerald-400">secrets.</span>
            </h1>
            <p
              className="sn-rise mt-6 max-w-[60ch] text-lg leading-relaxed text-slate-400"
              style={{ ["--i" as string]: 2 }}
            >
              SecureNote is end-to-end encrypted note and file sharing, built for
              one real person: a friend who needed to hand sensitive documents to
              exactly the people he chooses — with a watermark on every page and
              a record of every read.
            </p>
            <div
              className="sn-rise mt-9 flex flex-wrap items-center gap-3"
              style={{ ["--i" as string]: 3 }}
            >
              <Link
                href="/signup"
                className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Start writing — free
              </Link>
              <a
                href="#security"
                className="rounded-xl border border-slate-700 px-6 py-3 font-medium text-slate-300 hover:border-slate-500 hover:text-white"
              >
                Read the security model
              </a>
            </div>
            <p
              className="sn-rise mt-8 font-mono text-xs tracking-wide text-slate-500"
              style={{ ["--i" as string]: 4 }}
            >
              E2E encrypted · per-viewer watermarks · AI that never leaves the
              browser
            </p>
          </div>

          {/* Specimen: what a reader actually sees */}
          <div className="md:col-span-5">
            <div
              className="sn-rise relative"
              style={{ ["--i" as string]: 3 }}
            >
              <div className="relative rotate-1 overflow-hidden rounded-3xl border border-slate-800 bg-[#0d1319] p-6 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.55)]">
                <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
                  <LockIcon className="h-3.5 w-3.5 text-emerald-400" />
                  lecture-05-quantum.pdf · 2.4 MB
                </div>
                <div className="mt-5 space-y-3">
                  <div className="h-2.5 w-11/12 rounded bg-slate-800/80" />
                  <div className="h-2.5 w-full rounded bg-slate-800/60" />
                  <div className="h-2.5 w-4/5 rounded bg-slate-800/60" />
                  <div className="h-2.5 w-3/5 rounded bg-slate-800/40" />
                </div>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex flex-wrap content-center gap-x-8 gap-y-7 rotate-[-16deg] opacity-[0.13]"
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <span
                      key={i}
                      className="whitespace-nowrap font-mono text-xs tracking-[0.18em] text-slate-100"
                    >
                      r.kapoor@uni.edu · 21:14
                    </span>
                  ))}
                </div>
                <div className="relative mt-7 flex items-center gap-2 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
                  <EyeIcon className="h-3.5 w-3.5" />
                  read by r.kapoor@uni.edu · logged 21:14 · Mumbai, IN
                </div>
              </div>
              <p className="mt-4 text-center font-mono text-[11px] tracking-wide text-slate-600">
                what your reader sees — their name, on every page
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Steps — editorial rows, no cards */}
      <section className="border-t border-slate-800/70">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-20 md:grid-cols-12">
          <div className="md:col-span-4">
            <h2 className="text-2xl font-semibold tracking-tight md:sticky md:top-24">
              Built for exactly one situation
            </h2>
            <p className="mt-4 max-w-[45ch] text-sm leading-relaxed text-slate-500">
              &ldquo;I need to give my notes to specific people — and only them
              — without losing control of where they end up.&rdquo;
            </p>
          </div>
          <div className="md:col-span-8">
            <div className="divide-y divide-slate-800/70 border-t border-slate-800/70">
              {STEPS.map((s, i) => (
                <div
                  key={s.title}
                  className="grid grid-cols-[3rem_1fr] gap-5 py-9"
                >
                  <span className="font-mono text-sm text-emerald-400">
                    0{i + 1}
                  </span>
                  <div>
                    <h3 className="font-medium text-slate-100">{s.title}</h3>
                    <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-slate-400">
                      {s.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Security model — the honest section */}
      <section id="security" className="border-t border-slate-800/70 bg-slate-950/40">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <h2 className="max-w-[24ch] text-2xl font-semibold tracking-tight sm:text-3xl">
            The security model, honestly
          </h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-emerald-900/50 bg-emerald-950/20 p-8">
              <h3 className="flex items-center gap-2 font-semibold text-emerald-300">
                <CheckIcon className="h-4 w-4" />
                What SecureNote does
              </h3>
              <ul className="mt-5 space-y-3.5 text-sm leading-relaxed text-slate-300">
                {[
                  "Zero-knowledge server: ciphertext and metadata only — keys are derived from your password and never uploaded",
                  "Per-person grants with expiry dates and view-count limits, enforced atomically",
                  "Per-viewer watermarks on every page — every leak shows who leaked it",
                  "A full audit trail: who opened what, when, from where — owners' own reads are never logged",
                  "Deterrence stack: copy, selection and print disabled; the page hides when the tab loses focus; PrintScreen is intercepted where the browser allows",
                  "Search and chat over your notes with Gemma 3, running entirely in your browser via WebGPU",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-amber-900/50 bg-amber-950/20 p-8">
              <h3 className="flex items-center gap-2 font-semibold text-amber-300">
                <CrossIcon className="h-4 w-4" />
                What no website can do — including this one
              </h3>
              <ul className="mt-5 space-y-3.5 text-sm leading-relaxed text-slate-300">
                {[
                  "Physically block a phone camera pointed at the screen",
                  "Stop OS-level screenshots in every browser",
                  "Prevent a reader from retyping what they see",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <CrossIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-6 border-t border-amber-900/30 pt-5 text-sm leading-relaxed text-slate-400">
                That is why SecureNote&rsquo;s design goal is{" "}
                <strong className="text-slate-200">
                  leak-resistant and leak-traceable
                </strong>
                , not &ldquo;screenshot-proof&rdquo;. Anyone who leaks a note
                leaks a page that names them, at a recorded time, from a
                recorded address. Honest deterrence beats a promise that was
                never keepable.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stack — split, chips right */}
      <section className="border-t border-slate-800/70">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-20 md:grid-cols-12">
          <div className="md:col-span-5">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Open source, on purpose
            </h2>
            <p className="mt-4 max-w-[55ch] text-sm leading-relaxed text-slate-400">
              Private notes deserve AI that doesn&rsquo;t phone home. The model
              runs on your hardware, the ciphertext lives in your database, and
              every piece is open weight or open source.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-block rounded-xl bg-emerald-500 px-8 py-3 font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Create your account
            </Link>
          </div>
          <div className="flex flex-wrap content-start gap-2.5 md:col-span-7">
            {STACK.map((t) => (
              <span
                key={t}
                className="rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 font-mono text-xs text-slate-300"
              >
                {t}
              </span>
            ))}
            <span className="flex items-center gap-2 px-1 pt-2 font-mono text-xs text-slate-600">
              <CpuIcon className="h-3.5 w-3.5" /> zero cloud inference
            </span>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/70 py-8 text-center font-mono text-xs text-slate-600">
        SecureNote · built in the open for Hacktoberfest 2026
      </footer>
    </main>
  );
}
