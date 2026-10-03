"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { ShieldIcon } from "./icons";

export function NavBar() {
  const { status, user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#0a0f14]/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <ShieldIcon className="h-5 w-5 text-emerald-400" />
          <span>
            Secure<span className="text-emerald-400">Note</span>
          </span>
        </Link>

        {status === "ready" && user ? (
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/notes"
              className="rounded-lg px-3 py-1.5 text-slate-300 transition hover:bg-slate-800/70 hover:text-white"
            >
              My notes
            </Link>
            <span className="hidden text-slate-500 sm:inline">{user.email}</span>
            <button
              onClick={async () => {
                await logout();
                router.push("/");
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Log out
            </button>
          </div>
        ) : status !== "loading" ? (
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="px-3 py-1.5 text-slate-300 transition hover:text-white">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-emerald-500 px-3 py-1.5 font-medium text-slate-950 transition hover:bg-emerald-400"
            >
              Get started
            </Link>
          </div>
        ) : (
          <div className="h-8 w-24 animate-pulse rounded-lg bg-slate-800/60" />
        )}
      </div>
    </header>
  );
}
