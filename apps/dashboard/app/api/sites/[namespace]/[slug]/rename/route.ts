import { z } from "zod";
import { SlugSchema, readBody, renameSite, sitePath, type SiteParams } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

type Context = { params: Promise<SiteParams> };
const RenameSchema = z.object({ newSlug: SlugSchema });

export function POST(request: Request, { params }: Context) {
  return siteResponse(request, async ({ userId }) => {
    const { newSlug } = await readBody(request, RenameSchema);
    return renameSite(userId, sitePath(await params), newSlug);
  });
}
