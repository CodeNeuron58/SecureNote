"use client";

import {
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
  encryptString,
  unwrapKey,
  wrapKeyFor,
} from "@/lib/crypto";
import type { GrantItem, NoteFull, ViewEvent } from "@/lib/types";
import { Watermark } from "@/components/Watermark";
import { EyeIcon, CameraOffIcon, TrashIcon, XIcon } from "@/components/icons";

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
  const [meta, setMeta] = useState<{
    updatedAt: string;
    viewsLeft: number | null;
    viewNumber?: number;
  } | null>(null);

  const [tab, setTab] = useState<Tab>("content");
  const [grants, setGrants] = useState<GrantItem[]>([]);
  const [views, setViews] = useState<ViewEvent[]>([]);
  const [shareEmail, setShareEmail] = useState("");
  const [shareExpiry, setShareExpiry] = useState("");
  const [shareMax, setShareMax] = useState("");
  const [shareBusy, setShareBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [hidden, setHidden] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setTitle(await decryptString(ck, r.note.titleEnc));
      setBody(await decryptString(ck, r.note.bodyEnc));
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

  /* ---- owner: save ---- */
  async function save() {
    const ck = keyRef.current;
    if (!ck || role !== "owner") return;
    setSaving(true);
    try {
      const titleEnc = await encryptString(ck, title);
      const bodyEnc = await encryptString(ck, body);
      await api(`/api/notes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ titleEnc, bodyEnc }),
      });
      setSavedAt(new Date());
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
    try {
      const r = await api<{ grants: GrantItem[] }>(`/api/notes/${id}/share`);
      setGrants(r.grants);
    } catch {
      // non-fatal
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

  async function revoke(viewerId: string) {
    try {
      await api(`/api/notes/${id}/share?viewerId=${viewerId}`, { method: "DELETE" });
      await loadGrants();
      showToast("Access revoked — their key no longer opens this note");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not revoke");
    }
  }

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
      router.push("/notes");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete");
    }
  }

  if (status === "locked") {
    return (
      <Main>
        <Card title="Your keys are locked">
          <p className="text-sm text-slate-400">
            Sign in again to unlock the keys that open this note.
          </p>
          <Link
            href="/login"
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
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-400" />
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
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0f14]/95 backdrop-blur-xl"
        >
          <EyeIcon className="mb-4 h-8 w-8 text-slate-500" />
          <p className="text-lg font-medium text-slate-300">Content hidden</p>
          <p className="mt-1 text-sm text-slate-500">
            The page was left or unfocused — click to resume reading.
          </p>
        </button>
      )}

      <div className="mx-auto max-w-3xl">
        <Link
          href="/notes"
          className="mb-6 inline-block text-sm text-slate-500 transition hover:text-slate-300"
        >
          ← My notes
        </Link>

        {role === "viewer" && (
          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200/90">
            <span className="flex items-center gap-2">
              <CameraOffIcon className="h-4 w-4" />
              This view is watermarked to <strong>{user?.email}</strong> and logged.
            </span>
            {meta?.viewNumber != null && (
              <span className="text-amber-200/60">View #{meta.viewNumber}</span>
            )}
            {meta?.viewsLeft != null && (
              <span className="text-amber-200/60">{meta.viewsLeft} view(s) left</span>
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

        {role === "owner" && tab === "content" && (
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
                {savedAt
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

        {role === "owner" && tab === "sharing" && (
          <div className="space-y-6">
            <form
              onSubmit={share}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6"
            >
              <h3 className="font-semibold">Share with a person</h3>
              <p className="mt-1 text-sm text-slate-400">
                The note key is wrapped for their public key in your browser — the server
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
              {grants.length === 0 && (
                <p className="text-sm text-slate-500">Not shared with anyone yet.</p>
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
                          ? ` · expires ${new Date(g.expiresAt).toLocaleString()}`
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
              <p className="mt-4 text-sm text-slate-500">No recorded activity yet.</p>
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
                              <CameraOffIcon className="h-3.5 w-3.5" /> screenshot attempt
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <EyeIcon className="h-3.5 w-3.5 text-slate-500" /> opened
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">{v.n ?? "—"}</td>
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
            <div className="noselect mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-200">
              {body}
            </div>
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
            <TrashIcon className="h-4 w-4" /> Delete this note
          </button>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm text-slate-200 shadow-2xl">
          {toast}
          <button onClick={() => setToast("")} className="text-slate-500 hover:text-slate-300">
            <XIcon className="h-3.5 w-3.5" />
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
