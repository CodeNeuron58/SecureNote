"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import {
  decryptString,
  decryptBytes,
  encryptString,
  encryptBytes,
  unwrapKey,
  wrapKeyFor,
} from "@/lib/crypto";
import type { GrantItem, NoteFull, ViewEvent } from "@/lib/types";
import { deleteNoteChunks } from "@/lib/ai/store";
import { Watermark } from "@/components/Watermark";
import {
  Eye,
  CameraSlash,
  Trash,
  X,
  LockKey,
  FileText,
} from "@phosphor-icons/react/ssr";

const MAX_PLAINTEXT_BYTES = 10 * 1024 * 1024; // 10 MB

type Phase = "loading" | "ready" | "denied" | "error";
type Tab = "content" | "sharing" | "audit";

const EXPIRY_MS: Record<string, number> = {
  "1h": 3600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

const DENY_COPY: Record<string, { title: string; body: string }> = {
  "no-access": {
    title: "Access revoked or never granted",
    body: "The owner of this note has not granted your account access, or has revoked it.",
  },
  expired: {
    title: "This share has expired",
    body: "The owner set an expiry date on this note and it has passed. Ask them to share it again if you still need it.",
  },
  limit: {
    title: "View limit reached",
    body: "The owner limited how many times this note can be opened, and that limit is used up.",
  },
};

export function NoteWorkspace({ id }: { id: string }) {
  const { user, keys, status } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [role, setRole] = useState<"owner" | "viewer" | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const keyRef = useRef<CryptoKey | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"text" | "file">("text");
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    mime: string;
    size: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [meta, setMeta] = useState<{
    updatedAt: string;
    viewsLeft: number | null;
    viewNumber?: number;
  } | null>(null);

  const [tab, setTab] = useState<Tab>("content");
  const [grants, setGrants] = useState<GrantItem[]>([]);
  const [grantsError, setGrantsError] = useState(false);
  const [views, setViews] = useState<ViewEvent[]>([]);
  const [shareEmail, setShareEmail] = useState("");
  const [shareExpiry, setShareExpiry] = useState("");
  const [shareMax, setShareMax] = useState("");
  const [shareBusy, setShareBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const savedSnapshot = useRef<{ title: string; body: string }>({
    title: "",
    body: "",
  });
  const [dirty, setDirty] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closePreviewRef = useRef<(() => void) | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }

  const load = useCallback(async () => {
    if (!keys) return;
    setPhase("loading");
    try {
      const r = await api<{
        role: "owner" | "viewer";
        note: NoteFull;
        viewsLeft?: number | null;
        viewNumber?: number;
      }>(`/api/notes/${id}`);
      const wrap = r.note.role === "owner" ? r.note.selfWrap : r.note.wrap;
      if (!wrap) throw new Error("Missing key material");
      const ck = await unwrapKey(wrap, keys.privJwk);
      keyRef.current = ck;
      const decTitle = await decryptString(ck, r.note.titleEnc);
      const decBody = await decryptString(ck, r.note.bodyEnc);
      setTitle(decTitle);
      setBody(decBody);
      savedSnapshot.current = { title: decTitle, body: decBody };
      setDirty(false);
      setKind(r.note.kind === "file" ? "file" : "text");
      if (r.note.kind === "file" && r.note.file) {
        let name = "(file)";
        let mime = "";
        try {
          name = await decryptString(ck, r.note.file.nameEnc);
        } catch {
          // keep placeholder
        }
        try {
          mime = await decryptString(ck, r.note.file.mimeEnc);
        } catch {
          // older note without mime
        }
        setFileInfo({ name, mime, size: r.note.file.size });
      } else {
        setFileInfo(null);
      }
      setRole(r.note.role);
      setMeta({
        updatedAt: r.note.updatedAt,
        viewsLeft: r.viewsLeft ?? null,
        viewNumber: r.note.viewNumber,
      });
      setPhase("ready");
    } catch (e) {
      if (e instanceof ApiError && e.reason) {
        setDenyReason(e.reason);
        setPhase("denied");
      } else {
        setErrMsg(e instanceof Error ? e.message : "Could not open note");
        setPhase("error");
      }
    }
  }, [id, keys]);

  useEffect(() => {
    if (status === "ready" && keys) load();
  }, [status, keys, load]);

  /* ---- unsaved-change guard (text notes) ---- */
  useEffect(() => {
    if (kind !== "text") return;
    setDirty(
      title !== savedSnapshot.current.title || body !== savedSnapshot.current.body
    );
  }, [title, body, kind]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  /* ---- viewer tabs revalidate their grant on focus, without metering ---- */
  const revalidateViewer = useCallback(async () => {
    try {
      await api<{ ok: boolean }>(`/api/notes/${id}/access`);
    } catch (e) {
      if (e instanceof ApiError && e.reason) {
        setTitle("");
        setBody("");
        closePreviewRef.current?.();
        setDenyReason(e.reason);
        setPhase("denied");
      }
    }
  }, [id]);

  useEffect(() => {
    if (phase !== "ready" || role !== "viewer") return;
    const onFocus = () => revalidateViewer();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [phase, role, revalidateViewer]);

  /* ---- anti-leak stack (viewer mode) ---- */
  useEffect(() => {
    if (phase !== "ready" || role !== "viewer") return;
    const prevent = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        navigator.clipboard
          ?.writeText("SecureNote: screenshots of this note are not permitted.")
          .catch(() => {});
        api(`/api/notes/${id}/event`, {
          method: "POST",
          body: JSON.stringify({ kind: "screenshot" }),
        }).catch(() => {});
        showToast("Screenshot attempt recorded in the owner's audit log");
      }
    };
    const hide = () => setHidden(true);
    const onVis = () => {
      if (document.hidden) setHidden(true);
    };
    document.addEventListener("selectstart", prevent);
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    document.addEventListener("keyup", onKey);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("selectstart", prevent);
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("copy", prevent);
      document.removeEventListener("cut", prevent);
      document.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [phase, role, id]);

  /* ---- owner: save (text notes) ---- */
  async function save() {
    const ck = keyRef.current;
    if (!ck || role !== "owner" || kind !== "text") return;
    setSaving(true);
    try {
      const titleEnc = await encryptString(ck, title);
      const bodyEnc = await encryptString(ck, body);
      await api(`/api/notes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ titleEnc, bodyEnc }),
      });
      setSavedAt(new Date());
      savedSnapshot.current = { title, body };
      setDirty(false);
      setMeta((m) => (m ? { ...m, updatedAt: new Date().toISOString() } : m));
      window.dispatchEvent(new CustomEvent("sn-ai-dirty"));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ---- owner: sharing ---- */
  const loadGrants = useCallback(async () => {
    setGrantsError(false);
    try {
      const r = await api<{ grants: GrantItem[] }>(`/api/notes/${id}/share`);
      setGrants(r.grants);
    } catch {
      setGrantsError(true);
    }
  }, [id]);

  useEffect(() => {
    if (tab === "sharing" && role === "owner") loadGrants();
  }, [tab, role, loadGrants]);

  async function share(e: FormEvent) {
    e.preventDefault();
    const ck = keyRef.current;
    if (!ck || !shareEmail.trim()) return;
    setShareBusy(true);
    try {
      const u = await api<{ id: string; pubJwk: JsonWebKey }>(
        `/api/users/lookup?email=${encodeURIComponent(shareEmail.trim())}`
      );
      const wrap = await wrapKeyFor(ck, u.pubJwk);
      const expiresAt = shareExpiry
        ? new Date(Date.now() + EXPIRY_MS[shareExpiry]).toISOString()
        : null;
      const maxViews = shareMax ? Number(shareMax) : null;
      await api(`/api/notes/${id}/share`, {
        method: "POST",
        body: JSON.stringify({ viewerEmail: shareEmail.trim(), wrap, maxViews, expiresAt }),
      });
      showToast(`Shared with ${shareEmail.trim()}`);
      setShareEmail("");
      setShareExpiry("");
      setShareMax("");
      await loadGrants();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not share");
    } finally {
      setShareBusy(false);
    }
  }

  async function revoke(grantId: string) {
    try {
      await api(`/api/notes/${id}/share?grantId=${grantId}`, { method: "DELETE" });
      await loadGrants();
      showToast("Access revoked: their key no longer opens this note");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not revoke");
    }
  }

  /* ---- encrypted file operations ---- */
  async function uploadCiphertext(f: File) {
    const ck = keyRef.current;
    if (!ck || role !== "owner") return;
    if (f.size > MAX_PLAINTEXT_BYTES) {
      showToast("File too large. The limit is 10 MB");
      return;
    }
    setUploading(true);
    try {
      const ct = await encryptBytes(ck, await f.arrayBuffer());
      const res = await fetch(`/api/notes/${id}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: ct,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Upload failed");
      }
      setFileInfo((fi) => (fi ? { ...fi, size: ct.byteLength } : fi));
      setMeta((m) => (m ? { ...m, updatedAt: new Date().toISOString() } : m));
      showToast("File encrypted and stored");
      window.dispatchEvent(new CustomEvent("sn-ai-dirty"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onReplaceFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) uploadCiphertext(f);
  }

  async function openFile(download: boolean) {
    const ck = keyRef.current;
    if (!ck || !fileInfo) return;
    setFileBusy(true);
    try {
      const res = await fetch(`/api/notes/${id}/file`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Could not fetch file");
      }
      const pt = await decryptBytes(ck, await res.arrayBuffer());
      const blob = new Blob([pt], {
        type: fileInfo.mime || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      // Only images and PDFs render inline. Anything else (including HTML,
      // which could run scripts) is forced to the download path.
      const previewable =
        fileInfo.mime === "application/pdf" ||
        fileInfo.mime.startsWith("image/");
      if (download || !previewable) {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileInfo.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not open file");
    } finally {
      setFileBusy(false);
    }
  }

  function closePreview() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }
  closePreviewRef.current = closePreview;

  /* ---- owner: audit ---- */
  useEffect(() => {
    if (tab === "audit" && role === "owner") {
      api<{ views: ViewEvent[] }>(`/api/notes/${id}/views`)
        .then((r) => setViews(r.views))
        .catch(() => {});
    }
  }, [tab, role, id]);

  async function del() {
    if (!confirm("Delete this note and all of its shares, permanently?")) return;
    try {
      await api(`/api/notes/${id}`, { method: "DELETE" });
      deleteNoteChunks(id).catch(() => {});
      router.push("/notes");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete");
    }
  }

  if (status === "anon") {
    return (
      <Main>
        <Card title="Sign in to open this note">
          <p className="text-sm text-slate-400">
            This note is end-to-end encrypted and shared with a specific
            account. Sign in with the account it was shared to.
          </p>
          <Link
            href={`/login?next=/notes/${id}`}
            className="mt-5 inline-block rounded-xl bg-emerald-500 px-6 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Sign in
          </Link>
        </Card>
      </Main>
    );
  }

  if (status === "locked") {
    return (
      <Main>
        <Card title="Your keys are locked">
          <p className="text-sm text-slate-400">
            Sign in again to unlock the keys that open this note.
          </p>
          <Link
            href={`/login?next=/notes/${id}`}
            className="mt-5 inline-block rounded-xl bg-emerald-500 px-6 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Unlock
          </Link>
        </Card>
      </Main>
    );
  }

  if (phase === "loading") {
    return (
      <Main>
        <div className="mx-auto max-w-3xl">
          <div className="sn-skeleton mb-6 h-4 w-24" />
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6">
            <div className="sn-skeleton h-6 w-2/3" />
            <div className="mt-6 space-y-3">
              <div className="sn-skeleton h-3 w-full" />
              <div className="sn-skeleton h-3 w-11/12" />
              <div className="sn-skeleton h-3 w-4/5" />
              <div className="sn-skeleton h-3 w-3/5" />
            </div>
            <div className="mt-8 flex justify-end">
              <div className="sn-skeleton h-10 w-24" />
            </div>
          </div>
        </div>
      </Main>
    );
  }

  if (phase === "denied") {
    const c = DENY_COPY[denyReason] ?? DENY_COPY["no-access"];
    return (
      <Main>
        <Card title={c.title}>
          <p className="text-sm text-slate-400">{c.body}</p>
          <Link href="/notes" className="mt-5 inline-block text-sm text-emerald-400 hover:underline">
            ← Back to my notes
          </Link>
        </Card>
      </Main>
    );
  }

  if (phase === "error") {
    return (
      <Main>
        <Card title="Could not open this note">
          <p className="text-sm text-slate-400">{errMsg}</p>
          <button
            onClick={load}
            className="mt-5 rounded-xl border border-slate-700 px-5 py-2 text-sm text-slate-200 transition hover:border-slate-500"
          >
            Try again
          </button>
        </Card>
      </Main>
    );
  }

  const watermarkLines =
    role === "viewer" && user
      ? [
          user.email,
          meta?.viewNumber ? `View #${meta.viewNumber}` : "",
          new Date().toLocaleString(),
          "SecureNote",
        ]
      : [];

  return (
    <Main>
      {role === "viewer" && <Watermark lines={watermarkLines} />}

      {/* viewer: content hidden while the tab is unfocused */}
      {role === "viewer" && hidden && (
        <button
          onClick={() => setHidden(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0e13]/95 backdrop-blur-xl"
        >
          <Eye size={32} className="mb-4 text-slate-500" />
          <p className="text-lg font-medium text-slate-300">Content hidden</p>
          <p className="mt-1 text-sm text-slate-500">
            The page was left or unfocused. Click to resume reading.
          </p>
        </button>
      )}

      <div className="mx-auto max-w-3xl">
        <Link
          href="/notes"
          onClick={(e) => {
            if (dirty && !confirm("You have unsaved changes. Leave anyway?")) {
              e.preventDefault();
            }
          }}
          className="mb-6 inline-block text-sm text-slate-500 transition hover:text-slate-300"
        >
          ← My notes
        </Link>

        {role === "viewer" && (
          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200/90">
            <span className="flex items-center gap-2">
              <CameraSlash size={16} />
              This view is watermarked to <strong>{user?.email}</strong> and logged.
            </span>
            {meta?.viewNumber != null && (
              <span className="text-amber-200/60">View #{meta.viewNumber}</span>
            )}
            {meta?.viewsLeft != null && (
              <span className="text-amber-200/60">
                {meta.viewsLeft} {meta.viewsLeft === 1 ? "view" : "views"} left
              </span>
            )}
          </div>
        )}

        {role === "owner" && (
          <div className="mb-6 flex gap-1 rounded-xl border border-slate-800 bg-slate-900/40 p-1 text-sm">
            {(
              [
                ["content", "Content"],
                ["sharing", "Sharing"],
                ["audit", "Audit log"],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg px-4 py-2 font-medium transition ${
                  tab === t
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {role === "owner" && tab === "content" && kind === "text" && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
              className="w-full bg-transparent text-xl font-semibold text-slate-100 outline-none placeholder:text-slate-600"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Start typing. Everything here is encrypted before it leaves this page…"
              rows={16}
              className="sn-scroll mt-4 w-full resize-y bg-transparent text-[15px] leading-relaxed text-slate-200 outline-none placeholder:text-slate-600"
            />
            <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4">
              <p className="text-xs text-slate-500">
                {dirty
                  ? "Unsaved changes: click Save to encrypt them"
                  : savedAt
                    ? `Encrypted and saved at ${savedAt.toLocaleTimeString()}`
                    : "Encrypted locally with AES-256-GCM before upload"}
              </p>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {saving ? "Encrypting…" : "Save"}
              </button>
            </div>
          </div>
        )}

        {kind === "file" && (role === "owner" || role === "viewer") && tab === "content" && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                  <FileText size={20} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-100">
                    {fileInfo?.name ?? "Encrypted file"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {fileInfo
                      ? `${fmtSize(fileInfo.size)}, AES-256-GCM. Decrypted only in this browser.`
                      : ""}
                  </p>
                </div>
              </div>
              {role === "owner" && (
                <input
                  ref={replaceInputRef}
                  type="file"
                  className="hidden"
                  onChange={onReplaceFile}
                />
              )}
              {role === "owner" && (
                <button
                  onClick={() => replaceInputRef.current?.click()}
                  disabled={uploading}
                  className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 disabled:opacity-50"
                >
                  {uploading ? "Encrypting…" : "Replace file"}
                </button>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => openFile(false)}
                disabled={fileBusy}
                className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {fileBusy ? "Decrypting…" : "Open file"}
              </button>
              <button
                onClick={() => openFile(true)}
                disabled={fileBusy}
                className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
              >
                Download
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {role === "viewer"
                ? "Decrypts in your browser: the server only ever handles sealed ciphertext. Opening it is recorded in the owner's audit log."
                : "Uploaded as ciphertext; even the database cannot read it. Replacing it keeps all existing shares working."}
            </p>
          </div>
        )}

        {role === "owner" && tab === "sharing" && (
          <div className="space-y-6">
            <form
              onSubmit={share}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6"
            >
              <h3 className="font-semibold">Share with a person</h3>
              <p className="mt-1 text-sm text-slate-400">
                The note key is wrapped for their public key in your browser, so
                the server
                only ever handles it sealed.
              </p>
              <div className="mt-4 space-y-3">
                <input
                  type="email"
                  required
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="friend@example.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={shareExpiry}
                    onChange={(e) => setShareExpiry(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="">Expires: never</option>
                    <option value="1h">Expires: in 1 hour</option>
                    <option value="24h">Expires: in 24 hours</option>
                    <option value="7d">Expires: in 7 days</option>
                    <option value="30d">Expires: in 30 days</option>
                  </select>
                  <select
                    value={shareMax}
                    onChange={(e) => setShareMax(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="">Views: unlimited</option>
                    <option value="1">Limit: 1 view</option>
                    <option value="3">Limit: 3 views</option>
                    <option value="5">Limit: 5 views</option>
                    <option value="10">Limit: 10 views</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={shareBusy}
                className="mt-4 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {shareBusy ? "Wrapping key…" : "Share"}
              </button>
            </form>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h3 className="mb-4 font-semibold">Who has access</h3>
              {grantsError ? (
                <div className="text-sm text-slate-400">
                  Couldn&apos;t load the access list.{" "}
                  <button
                    onClick={loadGrants}
                    className="text-emerald-400 hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                grants.length === 0 && (
                  <p className="text-sm text-slate-500">
                    Not shared with anyone yet.
                  </p>
                )
              )}
              <ul className="space-y-3">
                {grants.map((g) => (
                  <li
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-200">{g.viewerEmail}</p>
                      <p className="text-xs text-slate-500">
                        {g.views} view{g.views === 1 ? "" : "s"}
                        {g.maxViews != null ? ` of ${g.maxViews}` : ""}
                        {g.expiresAt
                          ? ` · ${expiresLabel(g.expiresAt)}`
                          : " · no expiry"}
                      </p>
                    </div>
                    {g.revoked ? (
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
                        revoked
                      </span>
                    ) : (
                      <button
                        onClick={() => revoke(g.id)}
                        className="rounded-lg border border-red-900/60 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-950/50"
                      >
                        Revoke access
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {role === "owner" && tab === "audit" && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h3 className="font-semibold">Every read, on the record</h3>
            <p className="mt-1 text-sm text-slate-400">
              Opens and screenshot attempts by people you shared with. Your own reads are
              never logged.
            </p>
            {views.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No recorded activity yet. Share the note: every open by a viewer
                will appear here, with time, IP and device.
              </p>
            ) : (
              <div className="sn-scroll mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-slate-500">
                      <th className="pb-2 pr-4">When</th>
                      <th className="pb-2 pr-4">Who</th>
                      <th className="pb-2 pr-4">Event</th>
                      <th className="pb-2 pr-4">View #</th>
                      <th className="pb-2 pr-4">IP</th>
                      <th className="pb-2">Device</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {views.map((v, i) => (
                      <tr key={i} className="text-slate-300">
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          {new Date(v.at).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4">{v.viewerEmail}</td>
                        <td className="py-2.5 pr-4">
                          {v.kind === "screenshot" ? (
                            <span className="flex items-center gap-1.5 text-amber-300">
                              <CameraSlash size={14} /> screenshot attempt
                            </span>
                          ) : v.kind === "file" ? (
                            <span className="flex items-center gap-1.5 text-sky-300">
                              <LockKey size={14} /> fetched file
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <Eye size={14} className="text-slate-500" /> opened
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-slate-600">{v.n ?? "n/a"}</td>
                        <td className="py-2.5 pr-4 font-mono text-xs">{v.ip}</td>
                        <td className="max-w-[220px] truncate py-2.5 text-xs text-slate-500">
                          {v.ua}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* viewer read view */}
        {role === "viewer" && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
            {kind === "text" ? (
              <div className="noselect mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-200">
                {body}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                This share is an encrypted file. Use the buttons above to open it.
              </p>
            )}
            <p className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-500">
              Decrypted locally in your browser · copy, selection and print are disabled ·
              your identity is stamped on this view
            </p>
          </div>
        )}

        {/* owner: danger zone */}
        {role === "owner" && (
          <button
            onClick={del}
            className="mt-6 flex items-center gap-2 text-sm text-slate-500 transition hover:text-red-400"
          >
            <Trash size={16} /> Delete this note
          </button>
        )}
      </div>

      {/* decrypted file preview (under the watermark layer) */}
      {previewUrl && fileInfo && (
        <div className="fixed inset-0 z-30 flex flex-col bg-black/85 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-slate-800 bg-[#0a0e13] px-5 py-3">
            <p className="truncate text-sm font-medium text-slate-200">{fileInfo.name}</p>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-slate-500 sm:inline">
                watermarked to {user?.email}
              </span>
              <button
                onClick={closePreview}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="noselect flex flex-1 items-start justify-center overflow-auto p-4">
            {fileInfo.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={fileInfo.name}
                className="max-h-full max-w-full rounded-lg"
              />
            ) : (
              <iframe
                src={previewUrl}
                title={fileInfo.name}
                className="h-full w-full rounded-lg border border-slate-800 bg-white"
              />
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm text-slate-200 shadow-2xl">
          {toast}
          <button onClick={() => setToast("")} className="text-slate-500 hover:text-slate-300">
            <X size={14} />
          </button>
        </div>
      )}
    </Main>
  );
}

function Main({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function expiresLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const mins = ms / 60_000;
  if (mins < 60) return `expires in ${Math.max(1, Math.round(mins))}m`;
  const hrs = mins / 60;
  if (hrs < 48) return `expires in ${Math.round(hrs)}h`;
  return `expires in ${Math.round(hrs / 24)}d`;
}
