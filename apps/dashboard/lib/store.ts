import "server-only";
import { SiteSchema, type Site } from "@bio-link/schema";
import { templateIds } from "@bio-link/templates";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { queueLandingBuild } from "./builds";
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
        canEdit: !!admin || members.some((member) => member.role === "owner" || member.role === "editor"),
        // Đổi slug, xóa và quản lý thành viên.
        canManage: !!admin || members.some((member) => member.role === "owner"),
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

  const db = siteWriter();
  const { data, error } = await db.rpc("save_site", {
    target_slug: slug,
    actor_id: userId,
    site_config: options.config ?? null,
    publish: options.publish,
    publish_note: options.note ?? null,
    restore_version: options.restoreVersion ?? null,
  });
  const saved = SiteSchema.parse(rpcResult(data, error));
  if (options.publish) await queueLandingBuild(db, userId, options.restoreVersion ? "restore" : "publish", [slug]);
  return saved;
}

/** Map the PT4xx codes raised by our RPCs to API errors. */
export function rpcResult<T>(data: T, error: { code?: string; message: string } | null): T {
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

/** Owner, editor or admin; otherwise 404 (unassigned) or 403 (viewer). */
export async function requireEditor(db: SupabaseClient, slug: string) {
  const [admin, { data: site, error }] = await Promise.all([
    isAdmin(db),
    db.from("sites").select("site_members(role)").eq("slug", slug).maybeSingle(),
  ]);
  if (error) throw error;
  if (!site) throw new SiteApiError(404, "Không tìm thấy slug");
  if (!admin && !site.site_members.some((member) => member.role === "owner" || member.role === "editor")) {
    throw new SiteApiError(403, "Không có quyền chỉnh sửa slug");
  }
}

export type SiteParams = { namespace: string; slug: string };
/** Ghép hai đoạn URL /api/sites/{namespace}/{slug} thành khóa trang "username/slug". */
export const sitePath = ({ namespace, slug }: SiteParams) => `${namespace}/${slug}`;

/** Phần tên trang trong /{username}/{slug}. */
export const SlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "slug chỉ gồm a-z, 0-9, -");

/** Đường dẫn đầy đủ "username/slug" — khóa của trang trong API và build. */
export const SitePathSchema = SiteSchema.shape.slug;

// Giữ khớp với claim_username trong migration 20261125000000_user_namespaces.sql.
const RESERVED_USERNAMES = [
  "admin",
  "api",
  "preview",
  "sitemap",
  "assets",
  "img",
  "static",
  "www",
  "app",
  "dashboard",
  "runtime",
  "favicon",
];
export const UsernameSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,31}$/, "Tên người dùng gồm 2–32 ký tự a-z, 0-9, -, không bắt đầu bằng -")
  .refine((name) => !RESERVED_USERNAMES.includes(name), "Tên người dùng này dành cho hệ thống");

export async function usernameOf(userId: string): Promise<string | null> {
  const { data, error } = await siteWriter().from("profiles").select("username").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.username ?? null;
}

export async function claimUsername(actorId: string, username: string) {
  const { data, error } = await siteWriter().rpc("claim_username", { actor_id: actorId, new_username: username });
  return { username: rpcResult(data, error) as string };
}

export const CreateSiteSchema = z.object({
  slug: SlugSchema,
  /** Mặc định là tên người dùng của người tạo; chỉ admin được chọn không gian khác (kể cả `admin`). */
  namespace: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,31}$/, "Không gian không hợp lệ")
    .optional(),
  template: z.enum(templateIds as [string, ...string[]]),
  title: z.string().trim().max(120).optional(),
  platform: z.string().trim().max(40).optional(),
});

export async function createSite(actorId: string, input: z.infer<typeof CreateSiteSchema>): Promise<Site> {
  const namespace = input.namespace ?? (await usernameOf(actorId));
  if (!namespace) throw new SiteApiError(409, "Chọn tên người dùng trước khi tạo trang");
  const config = SiteSchema.parse({
    slug: `${namespace}/${input.slug}`,
    template: input.template,
    profile: { title: input.title || input.slug },
    ...(input.platform && { source: { platform: input.platform, pageId: "" } }),
  });
  const { data, error } = await siteWriter().rpc("create_site", { actor_id: actorId, site_config: config });
  return SiteSchema.parse(rpcResult(data, error));
}

/** `newName` là phần tên trang; trang giữ nguyên không gian tên người dùng. */
export async function renameSite(actorId: string, slug: string, newName: string) {
  const newSlug = `${slug.split("/")[0]}/${newName}`;
  if (newSlug === slug) throw new SiteApiError(422, "Slug mới phải khác slug hiện tại");
  const db = siteWriter();
  const { error } = await db.rpc("rename_site", { actor_id: actorId, target_slug: slug, new_slug: newSlug });
  rpcResult(null, error);
  await queueLandingBuild(db, actorId, "rename", [slug, newSlug]);
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
  const slugs = [slug, ...(site?.slug_redirects.map((redirect) => redirect.from_slug) ?? [])];
  await Promise.all([queueLandingBuild(db, actorId, "delete", slugs), removeMedia(slugs)]);
}

export const RoleSchema = z.enum(["editor", "viewer"]);
export type Member = { userId: string; email: string; role: z.infer<typeof RoleSchema> | "owner" };

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

  // auth.users không qua PostgREST; một trang có ít người xuất bản nên tra từng id.
  const auth = siteWriter().auth.admin;
  const emails = new Map(
    await Promise.all(
      [...new Set(data.map((v) => v.published_by).filter((id): id is string => !!id))].map(
        async (id) => [id, (await auth.getUserById(id)).data.user?.email ?? null] as const,
      ),
    ),
  );
  return data.map((v) => ({ ...v, published_by_email: (v.published_by && emails.get(v.published_by)) ?? null }));
}
