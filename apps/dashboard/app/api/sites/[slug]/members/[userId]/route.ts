import { removeMember } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

type Context = { params: Promise<{ slug: string; userId: string }> };

export function DELETE(request: Request, { params }: Context) {
  return siteResponse(
    request,
    async ({ userId: actorId }) => {
      const { slug, userId } = await params;
      await removeMember(actorId, slug, userId);
    },
    204,
  );
}
