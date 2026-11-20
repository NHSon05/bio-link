"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Editor from "./Editor";

type Props = { url: string; publishableKey: string; landingUrl: string };

export default function DashboardSession({ url, publishableKey, landingUrl }: Props) {
  const [supabase] = useState(() => createClient(url, publishableKey, {
    auth: { detectSessionInUrl: false },
  }));
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, current) => {
      setSession(current);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const siteRequest = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Phiên đăng nhập đã hết hạn.");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
    const response = await fetch(path, { ...init, headers });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Không thể truy cập dữ liệu.");
    return body;
  }, [supabase]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error) setError("Không đăng nhập được. Kiểm tra email và mật khẩu.");
    } catch {
      setError("Không kết nối được tới Supabase.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) setError("Không đăng xuất được. Vui lòng thử lại.");
    else setError("");
  }

  if (session === undefined) return <main className="p-8 text-sm">Đang tải…</main>;
  if (session) {
    return (
      <>
        {error && <p role="alert" className="p-3 text-sm text-red-600">{error}</p>}
        <Editor key={session.user.id} landingUrl={landingUrl} siteRequest={siteRequest} onSignOut={signOut} />
      </>
    );
  }

  return (
    <main className="mx-auto w-full max-w-sm px-6 py-16">
      <h1 className="mb-5 text-2xl font-semibold">Đăng nhập bio-link</h1>
      <form onSubmit={signIn} className="flex flex-col gap-4">
        <label className="text-sm">
          Email
          <input className="mt-1 w-full rounded-lg border border-current/20 px-3 py-2" name="email" type="email" autoComplete="username" required />
        </label>
        <label className="text-sm">
          Mật khẩu
          <input className="mt-1 w-full rounded-lg border border-current/20 px-3 py-2" name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black" disabled={busy}>
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}
