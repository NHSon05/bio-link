"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionClient,
  dashboardOrigin,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_NEXT_COOKIE,
  googleLoginError,
  safeNext,
} from "@/lib/auth";
import { readAuthCredentials } from "@/lib/authForm";

export type LoginState = { error?: string; email?: string; needsEmailConfirmation?: boolean };

export async function signIn(_: LoginState, form: FormData): Promise<LoginState> {
  const { email, password } = readAuthCredentials(form);
  if (!email || !password) return { error: "Nhập email và mật khẩu.", email };

  try {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const needsEmailConfirmation = error.code === "email_not_confirmed";
      return {
        error: needsEmailConfirmation
          ? "Xác nhận email trước khi đăng nhập."
          : "Không đăng nhập được. Kiểm tra email và mật khẩu.",
        email,
        needsEmailConfirmation,
      };
    }
  } catch (error) {
    console.error("Sign in failed", error);
    return { error: "Không kết nối được tới Supabase.", email };
  }

  redirect(safeNext(form.get("next")));
}

export async function signInWithGoogle(form: FormData) {
  const next = safeNext(form.get("next"));
  let destination = googleLoginError(next);
  try {
    const callback = new URL(GOOGLE_CALLBACK_PATH, dashboardOrigin());
    const supabase = await createSessionClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.href, skipBrowserRedirect: true },
    });
    if (!error && data.url) {
      const store = await cookies();
      store.set(GOOGLE_NEXT_COOKIE, next, {
        httpOnly: true,
        sameSite: "lax",
        secure: callback.protocol === "https:",
        path: GOOGLE_CALLBACK_PATH,
        maxAge: 600,
      });
      destination = data.url;
    }
  } catch (error) {
    console.error("Could not start Google sign-in", error);
  }
  redirect(destination);
}

export async function signOut() {
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) console.error("Sign out failed", error);
  redirect("/login");
}
