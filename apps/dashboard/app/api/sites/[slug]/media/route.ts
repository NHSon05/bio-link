import { uploadMedia } from "@/lib/media";
import { requireEditor } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

type Context = { params: Promise<{ slug: string }> };

export function POST(request: Request, { params }: Context) {
  return siteResponse(
    request,
    async ({ db }) => {
      const { slug } = await params;
      await requireEditor(db, slug);
      return uploadMedia(request, slug);
    },
    201,
  );
}
