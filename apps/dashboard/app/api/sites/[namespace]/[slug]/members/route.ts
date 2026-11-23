import { z } from "zod";
import { RoleSchema, listMembers, readBody, setMember, sitePath, type SiteParams } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

type Context = { params: Promise<SiteParams> };
const MemberSchema = z.object({ email: z.email().trim(), role: RoleSchema });

export function GET(request: Request, { params }: Context) {
  return siteResponse(request, async ({ userId }) => listMembers(userId, sitePath(await params)));
}

export function PUT(request: Request, { params }: Context) {
  return siteResponse(request, async ({ userId }) => {
    const { email, role } = await readBody(request, MemberSchema);
    return setMember(userId, sitePath(await params), email, role);
  });
}
