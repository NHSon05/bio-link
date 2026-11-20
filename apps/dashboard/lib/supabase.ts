import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";

const auth = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };

export class SiteApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type SiteAccess = { db: SupabaseClient; userId: string };

function supabaseUrl() {
  if (!process.env.SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
  return process.env.SUPABASE_URL;
}

export function siteWriter() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing SUPABASE_SECRET_KEY");
  return createClient(supabaseUrl(), key, { auth });
}

export async function authorizeSiteRequest(request: Request): Promise<SiteAccess> {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw new SiteApiError(401, "Cần đăng nhập");

  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_PUBLISHABLE_KEY");

  const db = createClient(supabaseUrl(), key, {
    auth,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error && error.status !== 400 && error.status !== 401 && error.status !== 403) throw error;
  if (error || !data.user) throw new SiteApiError(401, "Phiên đăng nhập không hợp lệ");
  return { db, userId: data.user.id };
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
