import Link from "next/link";
import { ShieldIcon, EyeIcon, CpuIcon, LockIcon } from "@/components/icons";

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(600px 300px at 50% -100px, rgba(16,185,129,0.25), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-20 text-center sm:pt-28">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-300">
            <ShieldIcon className="h-3.5 w-3.5" />
            Built for Hacktoberfest 2026 · DEV Weekend Challenge
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Share notes like <span className="text-emerald-400">secrets.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
            SecureNote is end-to-end encrypted note sharing, built for one real person:
            a friend who needed to hand sensitive notes to exactly the people he chooses —
            with a watermark on every page and a record of every read.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Start writing — free
            </Link>
            <a
              href="#security"
              className="rounded-xl border border-slate-700 px-6 py-3 font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Read the security model
            </a>
          </div>
          <p className="mt-6 text-sm text-slate-500">
            End-to-end encrypted · Per-viewer watermarks · AI that never leaves the browser
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          Built for exactly one situation
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
          &ldquo;I need to give my notes to specific people — and only them — without losing
          control of where they end up.&rdquo;
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {[
            {
              icon: <LockIcon className="h-5 w-5" />,
              title: "Write, encrypted on sight",
              text: "Every note is AES-GCM encrypted in your browser before it touches the network. The server stores ciphertext it cannot read.",
            },
            {
              icon: <EyeIcon className="h-5 w-5" />,
              title: "Share with a person, not a link",
              text: "Choose someone by their account, set an expiry and a view limit. Revoke in one click — instantly, even after they've read it.",
            },
            {
              icon: <CpuIcon className="h-5 w-5" />,
              title: "Know every time it's opened",
              text: "Each view is watermarked with the reader's identity and written to an audit log only you can see. Leaks carry their name.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                {c.icon}
              </div>
              <h3 className="font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security model */}
      <section id="security" className="border-y border-slate-800/70 bg-slate-950/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            The security model, honestly
          </h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-6">
              <h3 className="font-semibold text-emerald-300">What SecureNote does</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li className="flex gap-2"><span className="text-emerald-400">✓</span> Zero-knowledge server: ciphertext + metadata only, keys derived from your password</li>
                <li className="flex gap-2"><span className="text-emerald-400">✓</span> Per-person grants with expiry dates and view-count limits</li>
                <li className="flex gap-2"><span className="text-emerald-400">✓</span> Per-viewer watermarks — every page shows who is reading it</li>
                <li className="flex gap-2"><span className="text-emerald-400">✓</span> Full audit trail: who opened what, when, from where</li>
                <li className="flex gap-2"><span className="text-emerald-400">✓</span> Deterrence stack: copy/select/print blocked, screen dims when the tab loses focus, PrintScreen is intercepted where the browser allows</li>
                <li className="flex gap-2"><span className="text-emerald-400">✓</span> Search and chat over your notes with Gemma, running entirely in your browser via WebGPU</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-6">
              <h3 className="font-semibold text-amber-300">What no website can do (including this one)</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li className="flex gap-2"><span className="text-amber-400">✗</span> Physically block a phone camera pointed at the screen</li>
                <li className="flex gap-2"><span className="text-amber-400">✗</span> Stop OS-level screenshots in every browser</li>
                <li className="flex gap-2"><span className="text-amber-400">✗</span> Prevent a reader from retyping what they see</li>
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                That is why SecureNote&rsquo;s design goal is{" "}
                <strong className="text-slate-200">leak-resistant and leak-traceable</strong>, not
                &ldquo;screenshot-proof&rdquo;. Anyone who leaks a note leaks a page that names
                them, at a recorded time, from a recorded address. Honest deterrence beats a
                promise that was never keepable.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stack */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          Open source, on purpose
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
          Private notes deserve AI that doesn&rsquo;t phone home. The model runs on your
          hardware, the ciphertext lives in your database, and every piece is open weight or
          open source.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
          {[
            "Gemma 3 (open weight, in-browser)",
            "transformers.js + WebGPU",
            "WebCrypto E2E",
            "MongoDB Atlas (ciphertext only)",
            "Next.js",
            "Hosted on Render",
          ].map((t) => (
            <span key={t} className="rounded-full border border-slate-700 bg-slate-900/60 px-4 py-1.5 text-slate-300">
              {t}
            </span>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link
            href="/signup"
            className="rounded-xl bg-emerald-500 px-8 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Create your account
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-800/70 py-8 text-center text-sm text-slate-500">
        SecureNote · built in the open for Hacktoberfest 2026
      </footer>
    </main>
  );
}
