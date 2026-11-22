import "server-only";
import { createClient, type AuthError, type SupabaseClient, type User } from "@supabase/supabase-js";
import { connection } from "next/server";
import { createSessionClient, supabaseEnv } from "./auth";

const auth = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };

export class SiteApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type SiteAccess = { db: SupabaseClient; userId: string };

export function siteWriter() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing SUPABASE_SECRET_KEY");
  return createClient(supabaseEnv().url, key, { auth });
}

export async function authorizeSiteRequest(request: Request): Promise<SiteAccess> {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return authorizeCookieSession(request);

  const { url, key } = supabaseEnv();
  const db = createClient(url, key, {
    auth,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  return checkUser(data.user, error, db);
}

/** Dashboard pages call the API with the session cookie set by /login. */
async function authorizeCookieSession(request: Request): Promise<SiteAccess> {
  if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) {
    throw new SiteApiError(403, "Yêu cầu không hợp lệ");
  }
  const db = await createSessionClient();
  const { data, error } = await db.auth.getUser();
  return checkUser(data.user, error, db);
}

function checkUser(user: User | null, error: AuthError | null, db: SupabaseClient): SiteAccess {
  if (
    error &&
    error.status !== 400 &&
    error.status !== 401 &&
    error.status !== 403 &&
    error.name !== "AuthSessionMissingError"
  ) {
    throw error;
  }
  if (error || !user) throw new SiteApiError(401, "Cần đăng nhập");
  return { db, userId: user.id };
}

/** Chỉ nhận yêu cầu ghi dùng cookie từ đúng origin của dashboard. */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const { protocol } = new URL(request.url);
    return origin === new URL(`${protocol}//${host}`).origin;
  } catch {
    return false;
  }
}

export async function siteResponse(request: Request, handle: (access: SiteAccess) => Promise<unknown>) {
  await connection();
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const access = await authorizeSiteRequest(request);
    return Response.json(await handle(access), { headers });
  } catch (error) {
    if (error instanceof SiteApiError) {
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    console.error("Site API failed", error);
    return Response.json({ error: "Không thể truy cập dữ liệu" }, { status: 500, headers });
  }
}
