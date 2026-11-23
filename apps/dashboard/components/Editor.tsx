"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Undo2 } from "lucide-react";
import type { Site } from "@bio-link/schema";
import { useWorkspaceApi, type SiteSummary } from "@/lib/workspace-api";
import { Panel, StatusPill } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { AdminPanel, CreateSite } from "@/components/workspace/admin";
import { BuildStatus } from "@/components/workspace/build-status";
import { Design } from "@/components/workspace/design";
import { HomeOverview } from "@/components/workspace/home";
import { sections, WorkspaceShell, workspaceUrl } from "@/components/workspace/navigation";
import { SitePreview } from "@/components/workspace/preview";
import { ProductManager, type UpdateDraft } from "@/components/workspace/products";
import { Profile } from "@/components/workspace/profile";
import { SocialLinks } from "@/components/workspace/social-links";

type SiteState = { saved: Site; draft: Site };
type Notice = { kind: "saving" | "saved" | "error"; msg: string };

export default function Editor({ email, landingUrl }: { email: string; landingUrl: string }) {
  const api = useWorkspaceApi();
  const params = useSearchParams();
  // Ai đăng nhập cũng tạo được trang; dữ liệu mẫu thì không. Server vẫn kiểm tra quyền ở mọi API.
  const manage = !api.sample;
  const view = sections.find((s) => s.id === params.get("tab") && (s.id !== "admin" || manage))?.id ?? "home";
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [states, setStates] = useState<Record<string, SiteState>>({});
  const [notices, setNotices] = useState<Record<string, Notice | undefined>>({});
  const [listError, setListError] = useState("");
  const [listVersion, setListVersion] = useState(0);
  // Tăng sau mỗi lần xuất bản để huy hiệu CDN hỏi lại trạng thái build.
  const [published, setPublished] = useState(0);
  const [siteError, setSiteError] = useState<{ slug: string; message: string } | null>(null);
  const current = sites?.find((s) => s.slug === params.get("slug")) ?? sites?.[0];
  const slug = current?.slug ?? "";
  const state = Object.hasOwn(states, slug) ? states[slug] : undefined;
  const loaded = !!state;
  const notice = Object.hasOwn(notices, slug) ? notices[slug] : undefined;
  const saving = notice?.kind === "saving";
  const locked = !current?.canEdit || saving;
  const draft = state?.draft;
  const dirty = !!state && JSON.stringify(state.saved) !== JSON.stringify(draft);

  useEffect(() => {
    const ctl = new AbortController();
    api
      .list(ctl.signal)
      .then(setSites)
      .catch((e: Error) => {
        if (!ctl.signal.aborted) setListError(e.message);
      });
    return () => ctl.abort();
  }, [api, listVersion]);
  useEffect(() => {
    if (!slug || loaded) return;
    const ctl = new AbortController();
    api
      .read(slug, false, ctl.signal)
      .then((s) => {
        if (!ctl.signal.aborted) {
          setSiteError(null);
          setStates((prev) => ({ ...prev, [slug]: { draft: s, saved: s } }));
        }
      })
      .catch((e: Error) => {
        if (!ctl.signal.aborted) setSiteError({ slug, message: e.message });
      });
    return () => ctl.abort();
  }, [api, slug, loaded]);

  const update: UpdateDraft = (fn) => {
    if (locked || !state) return;
    setStates((prev) => {
      const next = structuredClone(prev[slug].draft);
      fn(next);
      return { ...prev, [slug]: { ...prev[slug], draft: next } };
    });
    setNotices((prev) => ({ ...prev, [slug]: undefined }));
  };
  async function save(publish: boolean) {
    if (!draft || locked) return;
    setNotices((prev) => ({ ...prev, [slug]: { kind: "saving", msg: "Đang lưu…" } }));
    try {
      const saved = await api.save(draft, publish);
      if (publish) setPublished((n) => n + 1);
      setStates((prev) => ({ ...prev, [slug]: { saved, draft: saved } }));
      setSites(
        (prev) =>
          prev?.map((s) =>
            s.slug === slug
              ? {
                  ...s,
                  title: saved.profile.title,
                  template: saved.template,
                  publishedSlug: publish ? slug : s.publishedSlug,
                }
              : s,
          ) ?? null,
      );
      setNotices((prev) => ({
        ...prev,
        [slug]: {
          kind: "saved",
          msg:
            publish && api.sample
              ? "Đã xuất bản trang mẫu trong trình duyệt này."
              : publish
                ? "Đã xuất bản. Trang công khai sẽ cập nhật sau lần build landing tiếp theo."
                : "Đã lưu bản nháp.",
        },
      }));
    } catch (e) {
      setNotices((prev) => ({ ...prev, [slug]: { kind: "error", msg: (e as Error).message } }));
    }
  }

  const error = listError || (siteError?.slug === slug && siteError.message);
  /** Sau khi tạo, đổi slug hoặc xóa: mở `next` ở `tab` và tải lại danh sách. */
  function changed(tab: "admin" | "bio", next?: string, previous?: string) {
    // Slug có thể được dùng lại (xóa rồi tạo, đổi tên qua lại): chỉ bỏ bản nháp đã tải của slug bị ảnh hưởng.
    const drop = <T,>(prev: Record<string, T>) => {
      const rest = { ...prev };
      for (const key of [next, previous]) if (key) delete rest[key];
      return rest;
    };
    setStates(drop);
    setNotices(drop);
    window.history.pushState(null, "", workspaceUrl(tab, next));
    setListVersion((v) => v + 1);
  }
  const heading = {
    home: "Tổng quan",
    bio: "Link in bio",
    slug: "Thiết kế theo slug",
    website: "Website",
    products: "Sản phẩm affiliate",
    admin: "Quản lý trang",
  }[view];
  if (api.sample && view === "website" && params.get("display") === "page" && draft) {
    return <SitePreview key={slug} site={draft} landingUrl={landingUrl} published fullPage />;
  }
  return (
    <WorkspaceShell
      email={email}
      showAdmin={manage}
      sites={sites ?? []}
      slug={slug}
      view={view}
      saving={saving}
      chooseSite={(value) => {
        if (saving) return false;
        window.history.pushState(null, "", workspaceUrl(view, value));
        return true;
      }}
    >
      {error ? (
        <p role="alert">{error}</p>
      ) : view === "admin" && sites ? (
        <AdminPanel site={current} dirty={dirty} changed={(next, previous) => changed("admin", next, previous)} />
      ) : sites?.length === 0 ? (
        <div className="grid max-w-3xl gap-5">
          <h1 className="workspace-title">Tạo trang đầu tiên</h1>
          {manage ? (
            <CreateSite changed={(next) => changed("bio", next)} />
          ) : (
            <p className="text-muted-foreground">Chưa có trang nào.</p>
          )}
        </div>
      ) : !draft ? (
        <p role="status">Đang tải trang…</p>
      ) : view === "home" ? (
        <HomeOverview key={slug} site={draft} sites={sites ?? []} landingUrl={landingUrl} />
      ) : (
        <div key={slug} className="grid gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="workspace-title">{heading}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {draft.profile.title} · /{slug}
              </p>
            </div>
            {view === "website" && current?.publishedSlug && (
              <Button asChild>
                <a
                  href={
                    api.sample
                      ? workspaceUrl("website", slug) + "&display=page"
                      : new URL("/" + slug + "/", landingUrl).href
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {api.sample ? "Mở trang mẫu" : "Mở trang công khai"}
                  <ArrowUpRight />
                </a>
              </Button>
            )}
          </div>
          {view === "website" ? (
            current?.publishedSlug ? (
              <SitePreview key={"published-" + slug} site={state.saved} landingUrl={landingUrl} published />
            ) : (
              <Panel title="Trang chưa được xuất bản" hint="Xuất bản bản nháp để xem website tại đây." />
            )
          ) : (
            <>
              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(310px,1fr)]">
                {view !== "products" && (
                  <fieldset disabled={locked} className="grid min-w-0 gap-4" aria-label="Nội dung trang">
                    {view === "bio" && (
                      <>
                        <SocialLinks site={draft} update={update} locked={locked} />
                        <Profile draft={draft} update={update} />
                      </>
                    )}
                    {view === "slug" && <Design draft={draft} update={update} locked={locked} />}
                  </fieldset>
                )}
                {view === "products" && (
                  <ProductManager site={draft} update={update} locked={locked} landingUrl={landingUrl} />
                )}
                <div className="min-w-0 xl:sticky xl:top-20">
                  <SitePreview site={draft} landingUrl={landingUrl} />
                </div>
              </div>
              <footer className="sticky bottom-0 z-[5] flex flex-wrap items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 shadow-soft backdrop-blur-sm">
                {current?.publishedSlug && (
                  <BuildStatus slug={slug} canManage={!!current.canManage} published={published} />
                )}
                {current?.canEdit ? (
                  <>
                    <StatusPill dirty={dirty}>{dirty ? "Có thay đổi chưa lưu" : "Đã lưu"}</StatusPill>
                    <div className="ml-auto flex flex-wrap gap-1.5">
                      {dirty && (
                        <Button
                          variant="ghost"
                          title="Bỏ thay đổi"
                          aria-label="Bỏ thay đổi"
                          size="icon"
                          disabled={saving}
                          onClick={() => {
                            setStates((prev) => ({ ...prev, [slug]: { ...state, draft: state.saved } }));
                            setNotices((prev) => ({ ...prev, [slug]: undefined }));
                          }}
                        >
                          <Undo2 />
                        </Button>
                      )}
                      <Button variant="outline" disabled={!dirty || saving} onClick={() => save(false)}>
                        Lưu nháp
                      </Button>
                      <Button disabled={saving} onClick={() => save(true)}>
                        Xuất bản
                      </Button>
                    </div>
                    {notice && (
                      <p
                        role={notice.kind === "error" ? "alert" : "status"}
                        className={
                          "w-full text-xs " + (notice.kind === "error" ? "text-destructive" : "text-muted-foreground")
                        }
                      >
                        {notice.msg}
                      </p>
                    )}
                  </>
                ) : (
                  <StatusPill>Chỉ xem</StatusPill>
                )}
              </footer>
            </>
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}
