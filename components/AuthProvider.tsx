"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  deriveKek,
  decryptWithKek,
  encryptWithKek,
  generateKeyPair,
  randomB64,
  restoreFromSession,
  lockWithSessionKey,
  clearSessionKeys,
  type EncBlob,
} from "@/lib/crypto";
import { api } from "@/lib/api";

export type SessionUser = { id: string; email: string; name: string };
type Keys = { privJwk: JsonWebKey; pubJwk: JsonWebKey };
type Status = "loading" | "anon" | "locked" | "ready";

type AuthCtx = {
  status: Status;
  user: SessionUser | null;
  keys: Keys | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  lock: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [keys, setKeys] = useState<Keys | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ user: SessionUser; pubJwk: JsonWebKey }>(
          "/api/auth/me"
        );
        setUser(r.user);
        const privJwk = await restoreFromSession();
        if (privJwk) {
          setKeys({ privJwk, pubJwk: r.pubJwk });
          setStatus("ready");
        } else {
          setStatus("locked");
        }
      } catch {
        setStatus("anon");
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{
      user: SessionUser;
      salt: string;
      pubJwk: JsonWebKey;
      encPriv: EncBlob;
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const kek = await deriveKek(password, r.salt);
    const privJwk = await decryptWithKek(r.encPriv, kek);
    setUser(r.user);
    setKeys({ privJwk, pubJwk: r.pubJwk });
    await lockWithSessionKey(privJwk);
    setStatus("ready");
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const salt = randomB64(16);
    const { pubJwk, privJwk } = await generateKeyPair();
    const kek = await deriveKek(password, salt);
    const encPriv = await encryptWithKek(privJwk, kek);
    const r = await api<{ user: SessionUser }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password, salt, pubJwk, encPriv }),
    });
    setUser(r.user);
    setKeys({ privJwk, pubJwk });
    await lockWithSessionKey(privJwk);
    setStatus("ready");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // clearing local state matters more than the server call
    }
    clearSessionKeys();
    setUser(null);
    setKeys(null);
    setStatus("anon");
  }, []);

  const lock = useCallback(() => {
    clearSessionKeys();
    setKeys(null);
    setStatus("locked");
  }, []);

  return (
    <Ctx.Provider value={{ status, user, keys, login, signup, logout, lock }}>
      {children}
    </Ctx.Provider>
  );
}
