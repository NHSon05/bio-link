import { uploadMedia } from "@/lib/media";
import { requireEditor, sitePath, type SiteParams } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

type Context = { params: Promise<SiteParams> };

export function POST(request: Request, { params }: Context) {
  return siteResponse(
    request,
    async ({ db }) => {
      const slug = sitePath(await params);
      await requireEditor(db, slug);
      return uploadMedia(request, slug);
    },
    201,
  );
}
