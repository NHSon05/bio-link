import { SiteSchema } from "@bio-link/schema";
import { z } from "zod";
import { PublishSchema, deleteSite, readBody, readSite, saveSite } from "@/lib/store";
import { SiteApiError, siteResponse } from "@/lib/supabase";

type Context = { params: Promise<{ slug: string }> };

export function GET(request: Request, { params }: Context) {
  return siteResponse(request, async ({ db }) =>
    readSite(db, (await params).slug, new URL(request.url).searchParams.get("revision") === "published"),
  );
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

const DeleteSchema = z.object({ confirm: z.string() });

export function DELETE(request: Request, { params }: Context) {
  return siteResponse(
    request,
    async ({ userId }) => {
      const { slug } = await params;
      const { confirm } = await readBody(request, DeleteSchema);
      if (confirm !== slug) throw new SiteApiError(422, "confirm: Nhập đúng slug để xác nhận xóa");
      await deleteSite(userId, slug);
    },
    204,
  );
}
