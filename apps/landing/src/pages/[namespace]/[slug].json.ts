/**
 * /{username}/{slug}.json — thứ tự "hot" cho runtime (plan mục 3, phương án C).
 * Chỉ chứa id block đã xếp theo từng vùng; runtime sắp lại DOM có sẵn, không render lại.
 * CDN đặt TTL ngắn (~5 phút) cho file này; n8n cập nhật score rồi build lại.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { REGIONS, regionBlocks, templateOf, type Site } from "@bio-link/schema";
import { templates } from "@bio-link/templates";
import { loadBuildSites } from "../../lib/data";

export const getStaticPaths: GetStaticPaths = async () =>
  (await loadBuildSites()).map((site) => {
    const [namespace, slug] = site.slug.split("/");
    return { params: { namespace, slug }, props: { site } };
  });

export const GET: APIRoute = ({ props }) => {
  const site = props.site as Site;
  const tpl = templateOf(site, templates);
  const order = Object.fromEntries(REGIONS.map((r) => [r, regionBlocks(site, tpl, r).map((b) => b.id)]));
  return new Response(JSON.stringify({ slug: site.slug, updatedAt: site.updatedAt ?? null, order }), {
    headers: { "content-type": "application/json" },
  });
};
