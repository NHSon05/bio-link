import { z } from "zod";
import { UsernameSchema, claimUsername, readBody } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

const ClaimSchema = z.object({ username: UsernameSchema });

/** ME-2: đặt tên người dùng một lần; là đoạn đầu của mọi URL /{username}/{slug}. */
export function POST(request: Request) {
  return siteResponse(
    request,
    async ({ userId }) => claimUsername(userId, (await readBody(request, ClaimSchema)).username),
    201,
  );
}
