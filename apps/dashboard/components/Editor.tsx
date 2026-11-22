"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, KeyRound, Undo2 } from "lucide-react";
import type { Site } from "@bio-link/schema";
import { useWorkspaceApi, type SiteSummary } from "@/lib/workspace-api";
import { Panel, StatusPill } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Design } from "@/components/workspace/design";
import { HomeOverview, MetricCards } from "@/components/workspace/home";
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
  const view = sections.find((s) => s.id === params.get("tab"))?.id ?? "home";
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [states, setStates] = useState<Record<string, SiteState>>({});
  const [notices, setNotices] = useState<Record<string, Notice | undefined>>({});
  const [listError, setListError] = useState("");
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
  }, [api]);
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
  const heading = {
    home: "Tổng quan",
    bio: "Link in bio",
    slug: "Thiết kế theo slug",
    website: "Website",
    products: "Sản phẩm affiliate",
  }[view];
  if (api.sample && view === "website" && params.get("display") === "page" && draft) {
    return <SitePreview key={slug} site={draft} landingUrl={landingUrl} published fullPage />;
  }
  return (
    <WorkspaceShell
      email={email}
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
      ) : sites?.length === 0 ? (
        <div className="grid gap-5">
          <h1 className="workspace-title">{heading}</h1>
          {view === "home" && <MetricCards views={null} clicks={null} count={0} />}
          <Panel>
            <div className="flex max-w-xl flex-col items-start gap-3 py-4">
              <span className="rounded-full bg-olive p-3 text-ink">
                <KeyRound size={22} />
              </span>
              <h2 className="text-2xl font-semibold">Đang chờ cấp quyền truy cập</h2>
              <p className="text-muted-foreground">
                Tài khoản của bạn chưa được giao trang nào. Liên hệ quản trị viên để được cấp quyền truy cập.
              </p>
            </div>
          </Panel>
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
