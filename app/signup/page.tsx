"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { ShieldCheck } from "@phosphor-icons/react/ssr";

export default function SignupPage() {
  const { signup, status } = useAuth();
  const router = useRouter();
  const [next, setNext] = useState("/notes");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("next");
    if (p && p.startsWith("/") && !p.startsWith("//")) setNext(p);
  }, []);

  useEffect(() => {
    if (status === "ready") router.replace(next);
  }, [status, router, next]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await signup(name, email, password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
          <ShieldCheck size={24} weight="duotone" className="text-emerald-400" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-slate-400">
          An encryption keypair is generated in your browser the moment you sign up.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-slate-800/80 bg-slate-900/40 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div>
          <label className="mb-1.5 block text-sm text-slate-300" htmlFor="name">Name</label>
          <input
            id="name" type="text" required value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
            placeholder="Your name"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-slate-300" htmlFor="email">Email</label>
          <input
            id="email" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-slate-300" htmlFor="password">Password (min 8 chars)</label>
          <input
            id="password" type="password" required minLength={8} value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Your password derives the key that protects your private key. If you lose it, your notes
            cannot be recovered. By anyone.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        <button
          type="submit" disabled={busy}
          className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy ? "Generating keys…" : "Create account"}
        </button>

        <p className="text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-400 hover:underline">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
