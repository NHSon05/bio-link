import { removeMember, sitePath, type SiteParams } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

type Context = { params: Promise<SiteParams & { userId: string }> };

export function DELETE(request: Request, { params }: Context) {
  return siteResponse(
    request,
    async ({ userId: actorId }) => {
      const { userId, ...site } = await params;
      const slug = sitePath(site);
      await removeMember(actorId, slug, userId);
    },
    204,
  );
}
