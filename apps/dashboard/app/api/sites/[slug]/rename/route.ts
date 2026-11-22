import { z } from "zod";
import { SlugSchema, readBody, renameSite } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

type Context = { params: Promise<{ slug: string }> };
const RenameSchema = z.object({ newSlug: SlugSchema });

export function POST(request: Request, { params }: Context) {
  return siteResponse(request, async ({ userId }) => {
    const { newSlug } = await readBody(request, RenameSchema);
    return renameSite(userId, (await params).slug, newSlug);
  });
}
