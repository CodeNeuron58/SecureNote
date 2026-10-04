"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import {
  decryptString,
  encryptBytes,
  encryptString,
  generateContentKey,
  unwrapKey,
  wrapKeyFor,
} from "@/lib/crypto";
import type { NoteListItem } from "@/lib/types";
import { AI_ENABLED } from "@/lib/ai/flag";
import { AiPanel } from "@/components/AiPanel";
import { PlusIcon, TrashIcon, CpuIcon, EyeIcon, LockIcon } from "@/components/icons";

type Deco = NoteListItem & { title: string };

const MAX_PLAINTEXT_BYTES = 10 * 1024 * 1024; // 10 MB

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function NotesPage() {
  const { status, user, keys } = useAuth();
  const router = useRouter();
  const [notes, setNotes] = useState<Deco[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  const load = useCallback(async () => {
    if (!keys) return;
    try {
      const r = await api<{ notes: NoteListItem[] }>("/api/notes");
      const deco: Deco[] = [];
      for (const n of r.notes) {
        let title = "(unreadable)";
        try {
          const ck = await unwrapKey(n.wrap, keys.privJwk);
          title = await decryptString(ck, n.titleEnc);
        } catch {
          // keep placeholder
        }
        deco.push({ ...n, title });
      }
      setNotes(deco);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load notes");
    }
  }, [keys]);

  useEffect(() => {
    if (status === "ready" && keys) load();
  }, [status, keys, load]);

  async function newNote() {
    if (!keys) return;
    setCreating(true);
    try {
      const contentKey = await generateContentKey();
      const titleEnc = await encryptString(contentKey, "Untitled note");
      const bodyEnc = await encryptString(contentKey, "");
      const selfWrap = await wrapKeyFor(contentKey, keys.pubJwk);
      const r = await api<{ id: string }>("/api/notes", {
        method: "POST",
        body: JSON.stringify({ kind: "text", titleEnc, bodyEnc, selfWrap }),
      });
      router.push(`/notes/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create note");
      setCreating(false);
    }
  }

  async function uploadFile(file: File) {
    if (!keys) return;
    if (file.size > MAX_PLAINTEXT_BYTES) {
      setError("File too large — the limit is 10 MB");
      return;
    }
    setCreating(true);
    setError("");
    let noteId: string | null = null;
    try {
      const contentKey = await generateContentKey();
      const titleEnc = await encryptString(contentKey, file.name);
      const bodyEnc = await encryptString(contentKey, "");
      const nameEnc = await encryptString(contentKey, file.name);
      const mimeEnc = await encryptString(
        contentKey,
        file.type || "application/octet-stream"
      );
      const selfWrap = await wrapKeyFor(contentKey, keys.pubJwk);
      const r = await api<{ id: string }>("/api/notes", {
        method: "POST",
        body: JSON.stringify({
          kind: "file",
          titleEnc,
          bodyEnc,
          selfWrap,
          file: { nameEnc, mimeEnc, size: 0 },
        }),
      });
      noteId = r.id;
      const ct = await encryptBytes(contentKey, await file.arrayBuffer());
      const up = await fetch(`/api/notes/${r.id}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: ct,
      });
      if (!up.ok) {
        const b = await up.json().catch(() => ({}));
        throw new Error(b.error || "Upload failed");
      }
      router.push(`/notes/${r.id}`);
    } catch (e) {
      // don't leave a broken empty file note behind
      if (noteId) await api(`/api/notes/${noteId}`, { method: "DELETE" }).catch(() => {});
      setError(e instanceof Error ? e.message : "Upload failed");
      setCreating(false);
    }
  }

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) uploadFile(f);
  }

  async function del(id: string, title: string) {
    if (!confirm(`Delete "${title}" and all of its shares, permanently?`)) return;
    try {
      await api(`/api/notes/${id}`, { method: "DELETE" });
      setNotes((ns) => (ns ? ns.filter((n) => n.id !== id) : ns));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete note");
    }
  }

  if (status === "loading" || (status === "ready" && !notes && !error)) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-400" />
      </main>
    );
  }

  if (status === "locked") {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4">
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
            <LockIcon className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Your keys are locked</h1>
          <p className="mt-2 text-sm text-slate-400">
            Note keys live only in your browser session. Sign in again to unlock them —
            your notes are untouched.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-xl bg-emerald-500 px-6 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Unlock
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My notes</h1>
          <p className="mt-1 text-sm text-slate-400">
            Titles here are decrypted locally from ciphertext — the server never saw them.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {AI_ENABLED && (
            <button
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/30 px-4 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-900/40"
            >
              <CpuIcon className="h-4 w-4" />
              Ask your notes
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={creating}
            className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
          >
            <LockIcon className="h-4 w-4" />
            Upload file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={onPickFile}
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,image/*"
          />
          <button
            onClick={newNote}
            disabled={creating}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            {creating ? "Encrypting…" : "New note"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-6 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {notes && notes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center">
          <p className="text-slate-400">No notes yet. Create the first one — it never leaves your browser unencrypted.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(notes ?? []).map((n) => (
          <div
            key={n.id}
            className="group relative rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition hover:border-slate-600"
          >
            <Link href={`/notes/${n.id}`} className="block">
              <div className="mb-3 flex items-center gap-2 text-xs">
                {n.role === "owner" ? (
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-300">Owner</span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 font-medium text-sky-300">
                    <EyeIcon className="h-3 w-3" /> Shared with you
                  </span>
                )}
                {n.kind === "file" ? (
                  <span className="rounded-full bg-violet-500/10 px-2.5 py-1 font-medium text-violet-300">
                    File{n.file ? ` · ${fmtSize(n.file.size)}` : ""}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
                    Note
                  </span>
                )}
                {n.role === "viewer" && n.grant?.viewsLeft != null && (
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
                    {n.grant.viewsLeft} view{n.grant.viewsLeft === 1 ? "" : "s"} left
                  </span>
                )}
                {n.role === "viewer" && n.grant?.expiresAt && (
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
                    expires {new Date(n.grant.expiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <h2 className="truncate pr-8 font-medium text-slate-100">{n.title || "Untitled note"}</h2>
              <p className="mt-1 text-xs text-slate-500">
                updated {new Date(n.updatedAt).toLocaleString()}
              </p>
            </Link>
            {n.role === "owner" && (
              <button
                onClick={() => del(n.id, n.title)}
                title="Delete note"
                className="absolute right-4 top-4 rounded-lg p-2 text-slate-600 opacity-0 transition hover:bg-red-950/60 hover:text-red-400 group-hover:opacity-100"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {AI_ENABLED && <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />}
    </main>
  );
}
