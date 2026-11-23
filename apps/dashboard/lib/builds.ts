import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { z } from "zod";
import { readBody, rpcResult } from "./store";
import { SiteApiError, siteWriter } from "./supabase";

type BuildReason = "publish" | "restore" | "rename" | "delete";
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
