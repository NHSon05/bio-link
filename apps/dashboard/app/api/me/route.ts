import { isAdmin } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

export function GET(request: Request) {
  return siteResponse(request, async ({ db, userId, email }) => ({ userId, email, isAdmin: await isAdmin(db) }));
}
