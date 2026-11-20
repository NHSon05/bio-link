import { z } from "zod";
import { PublishSchema, listVersions, readBody, saveSite } from "@/lib/store";
import { SiteApiError, siteResponse } from "@/lib/supabase";

type Context = { params: Promise<{ slug: string }> };

const VersionId = z.number().int().positive();
const RestoreSchema = PublishSchema.extend({ versionId: VersionId });

export function GET(request: Request, { params }: Context) {
  return siteResponse(request, async ({ db }) => {
    const cursor = new URL(request.url).searchParams.get("before");
    const before = VersionId.optional().safeParse(cursor === null ? undefined : Number(cursor));
    if (!before.success) throw new SiteApiError(422, "Mã phiên bản không hợp lệ");
    return listVersions(db, (await params).slug, before.data);
  });
}

export function POST(request: Request, { params }: Context) {
  return siteResponse(request, async ({ userId }) => {
    const { slug } = await params;
    const { versionId, note } = await readBody(request, RestoreSchema);
    return saveSite(slug, userId, { publish: true, note, restoreVersion: versionId });
  });
}
