import { latestBuild } from "@/lib/builds";
import { siteResponse } from "@/lib/supabase";

type Context = { params: Promise<{ slug: string }> };

export function GET(request: Request, { params }: Context) {
  return siteResponse(request, async ({ db }) => latestBuild(db, (await params).slug));
}
