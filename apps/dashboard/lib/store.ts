import "server-only";
import { SiteSchema, type Site } from "@bio-link/schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SiteApiError, siteWriter } from "./supabase";

export async function readBody<T>(request: Request, schema: z.ZodType<T>, allowEmpty = false): Promise<T> {
  let raw: unknown;
  try {
    const body = await request.text();
    raw = allowEmpty && body === "" ? {} : JSON.parse(body);
  } catch {
    throw new SiteApiError(422, "JSON không hợp lệ");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new SiteApiError(422, message);
  }
  return result.data;
}

export async function listSites(db: SupabaseClient) {
  const { data: admin, error: adminError } = await db.from("site_admins").select("user_id").maybeSingle();
  if (adminError) throw adminError;

  const sites = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from("sites")
      .select("slug, title:draft_config->profile->>title, template:draft_config->>template, platform:draft_config->source->>platform, updatedAt:updated_at, site_members(role)")
      .order("slug")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    sites.push(...data.map(({ site_members: members, ...site }) => ({
      ...site,
      template: site.template ?? "classic",
      canEdit: !!admin || members.some((member) => member.role === "editor"),
    })));
    if (data.length < pageSize) return sites;
  }
}

export async function readSite(db: SupabaseClient, slug: string): Promise<Site> {
  const { data, error } = await db.from("sites").select("draft_config").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) throw new SiteApiError(404, "Không tìm thấy slug");
  return SiteSchema.parse(data.draft_config);
}

export async function saveSite(
  slug: string,
  userId: string,
  options: { config?: Site; publish: boolean; note?: string; restoreVersion?: number },
): Promise<Site> {
  if (options.config && options.config.slug !== slug) {
    throw new SiteApiError(422, "Slug trong JSON phải trùng với URL");
  }

  const { data, error } = await siteWriter().rpc("save_site", {
    target_slug: slug,
    actor_id: userId,
    site_config: options.config ?? null,
    publish: options.publish,
    publish_note: options.note ?? null,
    restore_version: options.restoreVersion ?? null,
  });
  if (error?.code === "PT403") throw new SiteApiError(403, error.message);
  if (error?.code === "PT404") throw new SiteApiError(404, error.message);
  if (error) throw error;
  return SiteSchema.parse(data);
}

export const PublishSchema = z.object({ note: z.string().trim().max(500).optional() });

export async function listVersions(db: SupabaseClient, slug: string, before: number | undefined) {
  const { data: site, error: siteError } = await db.from("sites").select("id").eq("slug", slug).maybeSingle();
  if (siteError) throw siteError;
  if (!site) throw new SiteApiError(404, "Không tìm thấy slug");

  const query = db.from("site_versions")
    .select("id, published_by, published_at, note, restored_from")
    .eq("site_id", site.id)
    .order("id", { ascending: false })
    .limit(100);
  if (before !== undefined) query.lt("id", before);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
