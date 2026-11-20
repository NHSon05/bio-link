import { SiteSchema } from "@bio-link/schema";
import { PublishSchema, readBody, readSite, saveSite } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

type Context = { params: Promise<{ slug: string }> };

export function GET(request: Request, { params }: Context) {
  return siteResponse(request, async ({ db }) => readSite(db, (await params).slug));
}

export function PATCH(request: Request, { params }: Context) {
  return siteResponse(request, async ({ userId }) => {
    const { slug } = await params;
    const config = await readBody(request, SiteSchema);
    return saveSite(slug, userId, { config, publish: false });
  });
}

export function POST(request: Request, { params }: Context) {
  return siteResponse(request, async ({ userId }) => {
    const { slug } = await params;
    const { note } = await readBody(request, PublishSchema, true);
    return saveSite(slug, userId, { note, publish: true });
  });
}

/** Keep the existing API for saving and immediately publishing a complete config. */
export function PUT(request: Request, { params }: Context) {
  return siteResponse(request, async ({ userId }) => {
    const { slug } = await params;
    const config = await readBody(request, SiteSchema);
    return saveSite(slug, userId, { config, publish: true });
  });
}
