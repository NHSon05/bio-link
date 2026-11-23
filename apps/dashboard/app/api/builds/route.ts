import { z } from "zod";
import { requestBuild } from "@/lib/builds";
import { SitePathSchema, readBody } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

const RebuildSchema = z.object({ slugs: z.array(SitePathSchema).max(100).optional() });

export function POST(request: Request) {
  return siteResponse(
    request,
    async ({ db, userId }) => {
      const { slugs = [] } = await readBody(request, RebuildSchema, true);
      return requestBuild(db, userId, [...new Set(slugs)]);
    },
    202,
  );
}
