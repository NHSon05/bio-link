import { z } from "zod";
import { RoleSchema, listMembers, readBody, setMember } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

type Context = { params: Promise<{ slug: string }> };
const MemberSchema = z.object({ email: z.email().trim(), role: RoleSchema });

export function GET(request: Request, { params }: Context) {
  return siteResponse(request, async ({ userId }) => listMembers(userId, (await params).slug));
}

export function PUT(request: Request, { params }: Context) {
  return siteResponse(request, async ({ userId }) => {
    const { email, role } = await readBody(request, MemberSchema);
    return setMember(userId, (await params).slug, email, role);
  });
}
