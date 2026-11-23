import { sitePath, type SiteParams } from "@/lib/store";
import { latestBuild } from "@/lib/builds";
import { siteResponse } from "@/lib/supabase";

type Context = { params: Promise<SiteParams> };

export function GET(request: Request, { params }: Context) {
  return siteResponse(request, async ({ db }) => latestBuild(db, sitePath(await params)));
}
