"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "./AuthProvider";
import { XIcon, SendIcon, CpuIcon } from "./icons";
import { chunkText, buildPrompt } from "@/lib/ai/rag";
import {
  getNoteVersion,
  saveNoteChunks,
  searchAll,
  type SearchHit,
} from "@/lib/ai/store";
import { embedTexts, askLlm } from "@/lib/ai/client";
import { decryptString, unwrapKey } from "@/lib/crypto";
import type { NoteFull, NoteListItem } from "@/lib/types";

type Phase = "idle" | "model" | "indexing" | "ready" | "error";

export function AiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { keys } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [mode, setMode] = useState<"search" | "ask">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);

  const embRef = useRef<Worker | null>(null);
  const llmRef = useRef<Worker | null>(null);
  const indexingRef = useRef(false);

  const getEmb = useCallback(() => {
    if (!embRef.current) {
      embRef.current = new Worker(
        new URL("../workers/embeddings.worker.ts", import.meta.url)
      );
    }
    return embRef.current;
  }, []);

  /* ---- index the user's own notes (titles only for shared notes) ---- */
  const indexAll = useCallback(async () => {
    if (!keys || indexingRef.current) return;
    indexingRef.current = true;
    setErrMsg("");
    setPct(0);
    try {
      const { notes } = await api<{ notes: NoteListItem[] }>("/api/notes");
      const owners = notes.filter((n) => n.role === "owner");
      let modelLoaded = false;
      for (const n of owners) {
        if ((await getNoteVersion(n.id)) === n.updatedAt) continue;
        const full = await api<{ note: NoteFull }>(`/api/notes/${n.id}`);
        const wrap = full.note.selfWrap;
        if (!wrap) continue;
        const ck = await unwrapKey(wrap, keys.privJwk);
        const noteTitle = await decryptString(ck, full.note.titleEnc);
        const noteBody = await decryptString(ck, full.note.bodyEnc);
        // File notes (PDFs etc.) are indexed by title only — extracting text
        // from binaries would require parsing them outside the E2E boundary.
        const chunks =
          full.note.kind === "file"
            ? chunkText(noteTitle)
            : chunkText(`${noteTitle}\n\n${noteBody}`);
        if (chunks.length === 0) {
          await saveNoteChunks(n.id, n.updatedAt, noteTitle, [], []);
          continue;
        }
        if (!modelLoaded) setPhase("model");
        const vectors = await embedTexts(getEmb(), chunks, (p) => {
          if (p >= 0) setPct(p);
        });
        modelLoaded = true;
        setPhase("indexing");
        await saveNoteChunks(n.id, n.updatedAt, noteTitle, chunks, vectors);
      }
      setPhase("ready");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Indexing failed");
      setPhase("error");
    } finally {
      indexingRef.current = false;
    }
  }, [keys, getEmb]);

  useEffect(() => {
    if (open && phase === "idle") indexAll();
  }, [open, phase, indexAll]);

  // reopening the panel clears a past error so indexing can retry
  useEffect(() => {
    if (!open && phase === "error") setPhase("idle");
  }, [open, phase]);

  useEffect(() => {
    const onDirty = () => {
      if (open) indexAll();
      else setPhase("idle");
    };
    window.addEventListener("sn-ai-dirty", onDirty);
    return () => window.removeEventListener("sn-ai-dirty", onDirty);
  }, [open, indexAll]);

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setSearching(true);
    setErrMsg("");
    setResults(null);
    try {
      const qv = (await embedTexts(getEmb(), [q.trim()]))[0];
      setResults(await searchAll(qv, 6));
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function doAsk(q: string) {
    if (!q.trim()) return;
    setAsking(true);
    setAnswer("");
    setSources([]);
    setErrMsg("");
    try {
      const qv = (await embedTexts(getEmb(), [q.trim()]))[0];
      const hits = await searchAll(qv, 5);
      if (!llmRef.current) {
        llmRef.current = new Worker(
          new URL("../workers/llm.worker.ts", import.meta.url)
        );
      }
      setPhase("model");
      const prompt = buildPrompt(
        q.trim(),
        hits.map((h) => ({ title: h.title, text: h.text }))
      );
      const text = await askLlm(
        llmRef.current,
        prompt,
        (t) => {
          setPhase("ready");
          setAnswer((a) => a + t);
        },
        (p) => {
          if (p >= 0) setPct(p);
        }
      );
      setAnswer(text || "(the model returned nothing)");
      setSources([...new Set(hits.map((h) => h.title))].slice(0, 4));
      setPhase("ready");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Generation failed");
      setPhase("ready");
    } finally {
      setAsking(false);
    }
  }

  const busy = phase === "model" || phase === "indexing";

  return (
    <div
      className={`fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col border-l border-slate-800 bg-[#0a0f14] shadow-2xl transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <CpuIcon className="h-4 w-4 text-emerald-400" />
            Ask your notes
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Gemma 3 runs in this tab — zero cloud, zero leaks
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-800 px-4 py-2 text-sm">
        {(["search", "ask"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-3 py-1.5 font-medium transition ${
              mode === m
                ? "bg-emerald-500/15 text-emerald-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {m === "search" ? "Semantic search" : "Chat with notes"}
          </button>
        ))}
      </div>

      <div className="sn-scroll flex-1 overflow-y-auto px-5 py-4">
        {(errMsg && !busy) && (
          <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {errMsg}
            {phase === "error" && (
              <button
                onClick={indexAll}
                className="ml-2 font-medium underline hover:no-underline"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {busy && (
          <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-sm text-slate-300">
              {phase === "model"
                ? "Downloading the local model (one time, then cached)…"
                : "Indexing your notes locally…"}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">{pct}%</p>
          </div>
        )}

        {mode === "search" ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
                placeholder="Search by meaning, not keywords…"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
              />
              <button
                onClick={() => doSearch(query)}
                disabled={searching}
                className="rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {searching ? "Searching…" : "Go"}
              </button>
            </div>

            {results && results.length === 0 && (
              <p className="text-sm text-slate-500">Nothing matched that meaning.</p>
            )}
            <ul className="space-y-3">
              {(results ?? []).map((r, i) => (
                <li key={i}>
                  <button
                    onClick={() => router.push(`/notes/${r.noteId}`)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-left transition hover:border-slate-600"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-slate-200">{r.title}</p>
                      <span className="shrink-0 text-xs text-emerald-400">
                        {(r.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-400">
                      {r.text}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !asking && doAsk(question)}
                placeholder="Ask anything across your notes…"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
              />
              <button
                onClick={() => doAsk(question)}
                disabled={asking}
                className="rounded-lg bg-emerald-500 px-4 text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </div>

            {asking && answer === "" && (
              <p className="text-sm text-slate-500">
                {phase === "model"
                  ? "Loading Gemma into memory…"
                  : "Thinking locally…"}
              </p>
            )}

            {answer && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                  {answer}
                </p>
                {sources.length > 0 && !asking && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                    {sources.map((s, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-400"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 px-5 py-3 text-xs leading-relaxed text-slate-500">
        Indexes <strong className="text-slate-400">your own notes</strong> only — notes
        shared with you aren&apos;t indexed, keeping their view counts honest. Embeddings
        and the model live in this browser; nothing is uploaded.
      </div>
    </div>
  );
}
