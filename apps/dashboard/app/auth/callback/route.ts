import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  createSessionClient,
  dashboardOrigin,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_NEXT_COOKIE,
  googleLoginError,
  safeNext,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const store = await cookies();
  const next = safeNext(store.get(GOOGLE_NEXT_COOKIE)?.value);
  store.set(GOOGLE_NEXT_COOKIE, "", { path: GOOGLE_CALLBACK_PATH, maxAge: 0 });

  let destination = googleLoginError(next);
  if (code && !request.nextUrl.searchParams.has("error")) {
    try {
      const supabase = await createSessionClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.session) destination = next;
    } catch (error) {
      console.error("Could not complete Google sign-in", error);
    }
  }

  const response = NextResponse.redirect(new URL(destination, dashboardOrigin()));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
