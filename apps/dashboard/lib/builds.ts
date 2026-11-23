import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { z } from "zod";
import { isAdmin, readBody, rpcResult } from "./store";
import { SiteApiError, siteWriter } from "./supabase";

type BuildReason = "publish" | "restore" | "rename" | "delete" | "manual";
const queuedBuild = z.object({ id: z.number().int().positive(), hook: z.boolean() });

/** Xếp build sau khi thay đổi trang đã lưu để lỗi CI không làm hỏng phản hồi của thao tác đó. */
export async function queueLandingBuild(db: SupabaseClient, actorId: string, reason: BuildReason, slugs: string[]) {
  let buildId: number;
  try {
    const { data, error } = await db.rpc("queue_build", {
      actor_id: actorId,
      build_reason: reason,
      build_slugs: slugs,
    });
    if (error) throw error;
    const build = queuedBuild.parse(data);
    if (!build.hook) return;
    buildId = build.id;
  } catch (error) {
    console.error("Không thể xếp lượt build landing.", { reason, slugs, error });
    return;
  }
  await dispatchBuild(buildId, reason, slugs);
}

/** Gọi GitHub repository_dispatch; lỗi chỉ ghi log, build vẫn `queued` để job sau hoặc cron nhận. */
async function dispatchBuild(buildId: number, reason: BuildReason, slugs: string[]) {
  const token = process.env.BUILD_HOOK_TOKEN?.trim();
  if (!token) return;
  const repo = process.env.BUILD_REPO?.trim();
  if (!repo || !/^[\w-]+\/[\w.-]+$/.test(repo) || repo.endsWith("/.") || repo.endsWith("/..")) {
    console.error("BUILD_REPO phải có dạng owner/repo.", { buildId });
    return;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      body: JSON.stringify({ event_type: "build-landing", client_payload: { buildId, reason, slugs } }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error("GitHub từ chối yêu cầu build landing.", { buildId, status: response.status });
    await response.body?.cancel();
  } catch (error) {
    console.error("Không thể gửi yêu cầu build landing tới GitHub.", {
      buildId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

/** BUILD-4: admin build bất kỳ; chủ sở hữu chỉ build lại trang của mình (không build toàn bộ). */
export async function requestBuild(db: SupabaseClient, actorId: string, slugs: string[]) {
  const [admin, { data: sites, error }] = await Promise.all([
    isAdmin(db),
    slugs.length ? db.from("sites").select("slug, site_members(role)").in("slug", slugs) : { data: [], error: null },
  ]);
  if (error) throw error;
  const found = new Map((sites ?? []).map((site) => [site.slug, site.site_members]));
  const unknown = slugs.filter((slug) => !found.has(slug));
  if (unknown.length) throw new SiteApiError(422, `Không tìm thấy slug: ${unknown.join(", ")}`);
  const owner = slugs.length > 0 && [...found.values()].every((members) => members.some((m) => m.role === "owner"));
  if (!admin && !owner) throw new SiteApiError(403, "Chỉ quản trị viên hoặc chủ sở hữu được build lại");

  const writer = siteWriter();
  const { data, error: queueError } = await writer.rpc("queue_build", {
    actor_id: actorId,
    build_reason: "manual",
    build_slugs: slugs,
  });
  const build = queuedBuild.parse(rpcResult(data, queueError));
  if (build.hook) await dispatchBuild(build.id, "manual", slugs);
  return { id: build.id, status: "queued" as const };
}

/** BUILD-3: build gần nhất của slug và bản đang trên CDN. Người gọi phải đọc được trang (RLS). */
export async function latestBuild(db: SupabaseClient, slug: string) {
  const { data: site, error } = await db
    .from("sites")
    .select("publishedUpdatedAt:published_config->>updatedAt")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!site) throw new SiteApiError(404, "Không tìm thấy slug");
  const { data, error: buildError } = await siteWriter().rpc("latest_site_build", { target_slug: slug });
  const build = rpcResult(data, buildError);
  if (!build) throw new SiteApiError(404, "Chưa có build nào");
  return { ...build, publishedUpdatedAt: site.publishedUpdatedAt ?? null };
}

const ReportSchema = z.object({
  status: z.enum(["running", "succeeded", "failed"]),
  error: z.string().max(2000).optional(),
});

const digest = (value: string) => createHash("sha256").update(value).digest();

/** BUILD-2: chỉ job build có BUILD_CALLBACK_TOKEN được gọi; cookie bị bỏ qua. */
export async function buildCallback(request: Request, handle: () => Promise<unknown>) {
  await connection();
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const expected = process.env.BUILD_CALLBACK_TOKEN?.trim();
    const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    // So sánh băm để thời gian không phụ thuộc độ dài hay nội dung token.
    if (!expected || !token || !timingSafeEqual(digest(token), digest(expected))) {
      throw new SiteApiError(401, "Sai token build");
    }
    return Response.json(await handle(), { headers });
  } catch (error) {
    if (error instanceof SiteApiError)
      return Response.json({ error: error.message }, { status: error.status, headers });
    console.error("Build callback failed", error);
    return Response.json({ error: "Không thể cập nhật build" }, { status: 500, headers });
  }
}

export async function reportBuild(request: Request, rawId: string) {
  const buildId = /^[1-9]\d{0,15}$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(buildId)) throw new SiteApiError(404, "Không tìm thấy build");
  const { status, error } = await readBody(request, ReportSchema);
  const db = siteWriter();
  const result =
    status === "running"
      ? await db.rpc("start_build", { build_id: buildId })
      : await db.rpc("finish_build", { build_id: buildId, build_status: status, build_error: error ?? null });
  return rpcResult(result.data, result.error);
}

export async function startCronBuild() {
  const { data, error } = await siteWriter().rpc("start_cron_build");
  return rpcResult(data, error);
}
