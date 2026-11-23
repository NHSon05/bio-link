import { isAdmin, usernameOf } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

export function GET(request: Request) {
  return siteResponse(request, async ({ db, userId, email }) => {
    const [admin, username] = await Promise.all([isAdmin(db), usernameOf(userId)]);
    return { userId, email, isAdmin: admin, username };
  });
}
