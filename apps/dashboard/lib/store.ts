import "server-only";
import { SiteSchema, type Site } from "@bio-link/schema";
import { templateIds } from "@bio-link/templates";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { removeMedia } from "./media";
import { SiteApiError, siteWriter } from "./supabase";

export async function readBody<T>(request: Request, schema: z.ZodType<T>, allowEmpty = false): Promise<T> {
  let raw: unknown;
  try {
    const body = await request.text();
    raw = allowEmpty && body === "" ? {} : JSON.parse(body);
  } catch {
    throw new SiteApiError(400, "JSON không hợp lệ");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new SiteApiError(422, message);
  }
  return result.data;
}

export async function listSites(db: SupabaseClient) {
  const admin = await isAdmin(db);

  const sites = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from("sites")
      .select(
        "slug, publishedSlug:published_config->>slug, title:draft_config->profile->>title, template:draft_config->>template, platform:draft_config->source->>platform, updatedAt:updated_at, site_members(role)",
      )
      .order("slug")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    sites.push(
      ...data.map(({ site_members: members, ...site }) => ({
        ...site,
        template: site.template ?? "classic",
        canEdit: !!admin || members.some((member) => member.role === "editor"),
      })),
    );
    if (data.length < pageSize) return sites;
  }
}

export async function readSite(db: SupabaseClient, slug: string, published = false): Promise<Site> {
  const { data, error } = await db
    .from("sites")
    .select(published ? "config:published_config" : "config:draft_config")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data?.config) throw new SiteApiError(404, "Không tìm thấy phiên bản của trang");
  return SiteSchema.parse(data.config);
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
  return SiteSchema.parse(rpcResult(data, error));
}

/** Map the PT4xx codes raised by our RPCs to API errors. */
function rpcResult<T>(data: T, error: { code?: string; message: string } | null): T {
  if (error?.code === "23505") throw new SiteApiError(409, "Slug đã được dùng"); // concurrent create_site
  const status = Number(/^PT(4\d\d)$/.exec(error?.code ?? "")?.[1]);
  if (status) throw new SiteApiError(status, error!.message);
  if (error) throw error;
  return data;
}

export async function isAdmin(db: SupabaseClient) {
  const { data, error } = await db.from("site_admins").select("user_id").maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Editor of the site or admin; otherwise 404 (unassigned) or 403 (viewer). */
export async function requireEditor(db: SupabaseClient, slug: string) {
  const [admin, { data: site, error }] = await Promise.all([
    isAdmin(db),
    db.from("sites").select("site_members(role)").eq("slug", slug).maybeSingle(),
  ]);
  if (error) throw error;
  if (!site) throw new SiteApiError(404, "Không tìm thấy slug");
  if (!admin && !site.site_members.some((member) => member.role === "editor")) {
    throw new SiteApiError(403, "Không có quyền chỉnh sửa slug");
  }
}

const RESERVED_SLUGS = ["preview", "api", "sitemap", "assets", "_astro"];
export const SlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "slug chỉ gồm a-z, 0-9, -")
  .refine((slug) => !RESERVED_SLUGS.includes(slug), "Slug này dành cho hệ thống");

export const CreateSiteSchema = z.object({
  slug: SlugSchema,
  template: z.enum(templateIds as [string, ...string[]]),
  title: z.string().trim().max(120).optional(),
  platform: z.string().trim().max(40).optional(),
});

export async function createSite(actorId: string, input: z.infer<typeof CreateSiteSchema>): Promise<Site> {
  const config = SiteSchema.parse({
    slug: input.slug,
    template: input.template,
    profile: { title: input.title || input.slug },
    ...(input.platform && { source: { platform: input.platform, pageId: "" } }),
  });
  const { data, error } = await siteWriter().rpc("create_site", { actor_id: actorId, site_config: config });
  return SiteSchema.parse(rpcResult(data, error));
}

export async function renameSite(actorId: string, slug: string, newSlug: string) {
  if (newSlug === slug) throw new SiteApiError(422, "Slug mới phải khác slug hiện tại");
  const { error } = await siteWriter().rpc("rename_site", { actor_id: actorId, target_slug: slug, new_slug: newSlug });
  rpcResult(null, error);
  return { slug: newSlug, redirectFrom: slug };
}

export async function deleteSite(actorId: string, slug: string) {
  const db = siteWriter();
  // Ảnh nằm theo slug lúc tải lên, nên gồm cả slug cũ trước khi đổi tên; đọc trước vì xóa trang xóa luôn chuyển hướng.
  const { data: site, error } = await db
    .from("sites")
    .select("slug_redirects(from_slug)")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  rpcResult(null, (await db.rpc("delete_site", { actor_id: actorId, target_slug: slug })).error);
  await removeMedia([slug, ...(site?.slug_redirects.map((redirect) => redirect.from_slug) ?? [])]);
}

export const RoleSchema = z.enum(["editor", "viewer"]);
export type Member = { userId: string; email: string; role: z.infer<typeof RoleSchema> };

export async function listMembers(actorId: string, slug: string): Promise<Member[]> {
  const { data, error } = await siteWriter().rpc("list_site_members", { actor_id: actorId, target_slug: slug });
  return rpcResult(data, error);
}

export async function setMember(actorId: string, slug: string, email: string, role: Member["role"]): Promise<Member> {
  const { data, error } = await siteWriter().rpc("set_site_member", {
    actor_id: actorId,
    target_slug: slug,
    member_email: email,
    member_role: role,
  });
  return rpcResult(data, error);
}

export async function removeMember(actorId: string, slug: string, userId: string) {
  const { error } = await siteWriter().rpc("remove_site_member", {
    actor_id: actorId,
    target_slug: slug,
    member_id: userId,
  });
  rpcResult(null, error);
}

export const PublishSchema = z.object({ note: z.string().trim().max(500).optional() });

export async function listVersions(db: SupabaseClient, slug: string, before: number | undefined) {
  const { data: site, error: siteError } = await db.from("sites").select("id").eq("slug", slug).maybeSingle();
  if (siteError) throw siteError;
  if (!site) throw new SiteApiError(404, "Không tìm thấy slug");

  const query = db
    .from("site_versions")
    .select("id, published_by, published_at, note, restored_from")
    .eq("site_id", site.id)
    .order("id", { ascending: false })
    .limit(100);
  if (before !== undefined) query.lt("id", before);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
