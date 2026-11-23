"use client";

import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { StatusPill } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { useWorkspaceApi, type Build } from "@/lib/workspace-api";

/** Trạng thái bản xuất bản trên CDN (BUILD-3); chủ sở hữu/admin build lại khi lỗi (BUILD-4). */
export function BuildStatus({ slug, canManage, published }: { slug: string; canManage: boolean; published: number }) {
  const api = useWorkspaceApi();
  const [build, setBuild] = useState<Build | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = !!build?.liveUpdatedAt && build.liveUpdatedAt === build.publishedUpdatedAt;
  const failed = build?.status === "failed";
  const pending = !!build && !live && !failed;

  useEffect(() => {
    const ctl = new AbortController();
    api
      .latestBuild(slug, ctl.signal)
      .then(setBuild)
      .catch(() => {});
    return () => ctl.abort();
  }, [api, slug, published, tick]);
  // shortcut: hỏi lại mỗi 5 giây khi chưa lên CDN; đổi sang realtime nếu nhiều người mở editor cùng lúc.
  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => setTick((t) => t + 1), 5000);
    return () => clearTimeout(id);
  }, [pending, build]);

  if (!build) return null;
  return (
    <span role="status" className="inline-flex flex-wrap items-center gap-1.5">
      <StatusPill dirty={!live} title={failed ? (build.error ?? undefined) : undefined}>
        {live ? "Đã lên CDN" : failed ? "Build lỗi" : "Đang cập nhật CDN…"}
      </StatusPill>
      {failed && canManage && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api.rebuild([slug]);
              setTick((t) => t + 1);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <RotateCw />
          Build lại
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
