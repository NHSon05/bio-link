import { CreateSiteSchema, createSite, listSites, readBody } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

export function GET(request: Request) {
  return siteResponse(request, ({ db }) => listSites(db));
}

export function POST(request: Request) {
  return siteResponse(
    request,
    async ({ userId }) => createSite(userId, await readBody(request, CreateSiteSchema)),
    201,
  );
}
