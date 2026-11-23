import { z } from "zod";
import { siteWriter } from "@/lib/supabase";

const event = z.object({
  // "username/slug" (AD-13); trang chuyển hướng không gửi sự kiện.
  slug: z
    .string()
    .max(160)
    .regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  kind: z.enum(["view", "click"]),
});

export async function POST(request: Request) {
  const landing = new URL(process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:4321");
  if (request.headers.get("origin") !== landing.origin) return new Response(null, { status: 403 });
  const input = event.safeParse(await request.json().catch(() => null));
  if (!input.success) return new Response(null, { status: 400 });
  const { error } = await siteWriter().rpc("record_site_traffic", {
    target_slug: input.data.slug,
    event_kind: input.data.kind,
  });
  return new Response(null, { status: error ? 503 : 204 });
}
