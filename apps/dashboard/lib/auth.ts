import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export function supabaseEnv() {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Missing Supabase URL or publishable key");
  return env;
}

/** Supabase client bound to the session cookies of the current request. */
export async function createSessionClient() {
  const store = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/** Returns the signed-in user, or redirects to /login. */
export async function requireUser() {
  // Supabase reads the clock while loading the session, so render at request time.
  await connection();
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return data.user;
}

/** Only allow redirects to paths on this site. */
export function safeNext(value: FormDataEntryValue | string | null | undefined) {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\n\r\t]/.test(next)) return "/";

  const base = "https://dashboard.invalid";
  const url = new URL(next, base);
  if (url.origin !== base || url.pathname.startsWith("//")) return "/";
  return url.pathname + url.search + url.hash;
}

export const GOOGLE_CALLBACK_PATH = "/auth/callback";
export const GOOGLE_NEXT_COOKIE = "bio-link-google-next";

export function dashboardOrigin() {
  return new URL(process.env.DASHBOARD_URL || "http://localhost:3000").origin;
}

export function googleLoginError(next: string) {
  const query = new URLSearchParams({ error: "google" });
  if (next !== "/") query.set("next", next);
  return `/login?${query}`;
}
