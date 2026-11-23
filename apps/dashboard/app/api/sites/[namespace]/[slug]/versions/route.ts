import { z } from "zod";
import { PublishSchema, listVersions, readBody, saveSite, sitePath, type SiteParams } from "@/lib/store";
import { SiteApiError, siteResponse } from "@/lib/supabase";

type Context = { params: Promise<SiteParams> };

const VersionId = z.number().int().positive();
const RestoreSchema = PublishSchema.extend({ versionId: VersionId });

export function GET(request: Request, { params }: Context) {
  return siteResponse(request, async ({ db }) => {
    const cursor = new URL(request.url).searchParams.get("before");
    const before = VersionId.optional().safeParse(cursor === null ? undefined : Number(cursor));
    if (!before.success) throw new SiteApiError(422, "Mã phiên bản không hợp lệ");
    return listVersions(db, sitePath(await params), before.data);
  });
}

export function POST(request: Request, { params }: Context) {
  return siteResponse(request, async ({ userId }) => {
    const slug = sitePath(await params);
    const { versionId, note } = await readBody(request, RestoreSchema);
    return saveSite(slug, userId, { publish: true, note, restoreVersion: versionId });
  });
}
