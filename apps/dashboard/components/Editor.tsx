"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { REGIONS, layoutOf, type Block, type RegionName, type Site } from "@bio-link/schema";
import { templates, templateIds } from "@bio-link/templates";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { BrowserFrame, PhoneFrame } from "@/components/ui/device-frame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, StatusPill } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Topbar } from "@/components/ui/topbar";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/actions";
import { siteRequest } from "@/lib/siteRequest";

type Summary = { slug: string; title: string; canEdit: boolean };
type Status = { kind: "idle" | "saving" | "saved" | "error"; msg?: string };
type Props = { landingUrl: string; email: string };
type Device = "mobile" | "desktop";

// Radix Select cannot use "" as an item value.
const NONE = "__none";
const FONTS = ["Sora", "Manrope", "Inter", "DM Sans", "Be Vietnam Pro"];
const DEVICES: { value: Device; label: string }[] = [
  { value: "mobile", label: "Mobile" },
  { value: "desktop", label: "Desktop" },
];

export default function Editor({ landingUrl, email }: Props) {
  const [list, setList] = useState<Summary[] | null>(null);
  const [slug, setSlug] = useState("");
  const [saved, setSaved] = useState<Site | null>(null);
  const [draft, setDraft] = useState<Site | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [srcDoc, setSrcDoc] = useState("");
  const [previewErr, setPreviewErr] = useState("");
  const [device, setDevice] = useState<Device>("mobile");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    siteRequest<Summary[]>("/api/sites", { signal: controller.signal })
      .then((s) => {
        setList(s);
        setSlug(s[0]?.slug ?? "");
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    siteRequest<Site>(`/api/sites/${slug}`, { signal: controller.signal })
      .then((s) => {
        setSaved(s);
        setDraft(structuredClone(s));
        setStatus({ kind: "idle" });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      });
    return () => controller.abort();
  }, [slug]);

  // Gửi bản nháp tới Astro sau khi người dùng ngừng chỉnh sửa 300ms.
  useEffect(() => {
    if (!draft || draft.slug !== slug) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${landingUrl}/preview`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
          signal: controller.signal,
        });
        const html = await r.text();
        if (controller.signal.aborted) return;
        if (!r.ok) {
          setPreviewErr(html.replace(/<[^>]+>/g, "").trim() || `Landing trả về lỗi ${r.status}.`);
          return;
        }
        setPreviewErr("");
        // <base> để ảnh, CSS, runtime.js trong srcdoc trỏ về server landing
        setSrcDoc(html.replace(/<head>/i, `<head><base href="${landingUrl}/">`));
      } catch {
        if (!controller.signal.aborted) setPreviewErr(`Không kết nối được landing (${landingUrl}).`);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [draft, landingUrl, slug]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);
  const tpl = draft ? (templates[draft.template] ?? templates.classic) : null;

  function update(fn: (d: Site) => void) {
    setDraft((d) => {
      if (!d) return d;
      const next = structuredClone(d);
      fn(next);
      return next;
    });
  }

  async function save(publish: boolean) {
    if (!draft) return;
    setStatus({ kind: "saving" });
    try {
      const site = await siteRequest<Site>(`/api/sites/${draft.slug}`, {
        method: publish ? "PUT" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      setSaved(site);
      setDraft(structuredClone(site));
      setList(
        (current) =>
          current?.map((entry) => (entry.slug === site.slug ? { ...entry, title: site.profile.title } : entry)) ?? null,
      );
      setStatus({
        kind: "saved",
        msg: publish ? "Đã xuất bản vào Supabase. Trang tĩnh sẽ cập nhật sau lần build tiếp theo." : "Đã lưu bản nháp.",
      });
    } catch (error) {
      setStatus({ kind: "error", msg: (error as Error).message });
    }
  }

  const saving = status.kind === "saving";
  const canEdit = list?.find((entry) => entry.slug === slug)?.canEdit ?? false;
  const locked = !canEdit || saving;

  const topbar = (
    <Topbar items={[{ href: "/", label: "Editor" }]} current="/" linkAs={Link} className="flex-wrap border-b">
      {!!list?.length && (
        <Select
          value={slug}
          disabled={saving}
          onValueChange={(value) => {
            setLoadError("");
            setSrcDoc("");
            setPreviewErr("");
            setSlug(value);
          }}
        >
          <SelectTrigger aria-label="Chọn slug" className="max-w-56 rounded-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {list.map((site) => (
              <SelectItem key={site.slug} value={site.slug}>
                {site.title} · /{site.slug}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <span className="hidden text-sm text-muted-foreground md:inline">{email}</span>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm" disabled={saving}>
          Đăng xuất
        </Button>
      </form>
    </Topbar>
  );

  if (!draft || !tpl || draft.slug !== slug || loadError) {
    return (
      <div className="flex min-h-screen flex-col">
        {topbar}
        <main className="p-8 text-sm">
          {loadError ? (
            <p role="alert" className="text-destructive">
              {loadError}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {list?.length === 0 ? "Bạn chưa được giao trang nào." : "Đang tải…"}
            </p>
          )}
        </main>
      </div>
    );
  }

  const layout = layoutOf(draft);
  const placed = new Set(REGIONS.flatMap((r) => layout[r].blocks));
  const unplaced = draft.blocks.filter((b) => !placed.has(b.id));
  const byId = new Map(draft.blocks.map((b) => [b.id, b]));
  const allows = (r: RegionName, b: Block) => !tpl.regions[r].allow || tpl.regions[r].allow!.includes(b.type);

  function setRegion(r: RegionName, ids: string[]) {
    update((d) => {
      const L = layoutOf(d);
      d.layout = { ...L, [r]: { ...L[r], blocks: ids } };
    });
  }
  function move(r: RegionName, i: number, dir: -1 | 1) {
    const ids = [...layout[r].blocks];
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setRegion(r, ids);
  }
  function moveTo(id: string, from: RegionName | null, to: RegionName | "") {
    update((d) => {
      const L = layoutOf(d);
      const next = { ...L };
      if (from) next[from] = { ...L[from], blocks: L[from].blocks.filter((x) => x !== id) };
      if (to) next[to] = { ...next[to], blocks: [...next[to].blocks, id] };
      d.layout = next;
    });
  }
  function toggle(id: string, key: "pinned" | "hidden") {
    update((d) => {
      const b = d.blocks.find((x) => x.id === id);
      if (b) b[key] = !b[key];
    });
  }

  const blockRow = (b: Block, region: RegionName | null, i: number, total: number) => (
    <li
      key={b.id}
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-2xl bg-card px-3 py-2 text-sm",
        b.hidden && "opacity-50",
      )}
    >
      <Badge className="bg-olive text-[10px] tracking-[0.08em] text-olive-foreground uppercase">{b.type}</Badge>
      <span className="min-w-0 flex-1 truncate">{b.title || b.text || b.id}</span>
      {region && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={i === 0}
            onClick={() => move(region, i, -1)}
            aria-label="Lên"
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={i === total - 1}
            onClick={() => move(region, i, 1)}
            aria-label="Xuống"
          >
            ↓
          </Button>
        </>
      )}
      <Button
        variant={b.pinned ? "olive" : "ghost"}
        size="icon-sm"
        onClick={() => toggle(b.id, "pinned")}
        aria-pressed={!!b.pinned}
        title="Ghim lên đầu vùng"
      >
        📌
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => toggle(b.id, "hidden")}
        aria-pressed={!!b.hidden}
        title="Ẩn/hiện"
      >
        {b.hidden ? "🙈" : "👁"}
      </Button>
      <Select
        value={region ?? NONE}
        disabled={locked}
        onValueChange={(value) => moveTo(b.id, region, value === NONE ? "" : (value as RegionName))}
      >
        <SelectTrigger size="sm" aria-label="Chuyển vùng" className="w-28 rounded-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— không dùng —</SelectItem>
          {REGIONS.map((r) => (
            <SelectItem key={r} value={r} disabled={!allows(r, b)}>
              {tpl.regions[r].label ?? r}
              {allows(r, b) ? "" : " (không cho phép)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </li>
  );

  return (
    <div className="flex min-h-screen flex-col">
      {topbar}
      <div className="grid flex-1 grid-cols-1 gap-6 px-4 pt-4 md:px-6 lg:grid-cols-[minmax(380px,560px)_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <fieldset className="contents" disabled={locked} aria-label="Nội dung trang">
            <Panel title="Template" hint={tpl.description}>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {templateIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={draft.template === id}
                    onClick={() =>
                      update((d) => {
                        d.template = id;
                      })
                    }
                    className={cn(
                      "border-thick flex flex-col gap-1 rounded-[22px] border-transparent bg-muted p-3 text-left text-sm font-semibold",
                      draft.template === id && "border-olive bg-accent",
                    )}
                  >
                    {templates[id].name}
                    <small className="text-2xs leading-snug font-normal text-muted-foreground">
                      {templates[id].desktop}
                    </small>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Theme" hint="Để trống = mặc định của template.">
              <div className="grid grid-cols-2 gap-3">
                {(["bg", "accent"] as const).map((k) => (
                  <div key={k} className="grid gap-1.5">
                    <Label htmlFor={`theme-${k}`}>{k === "bg" ? "Nền" : "Màu nhấn"}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`theme-${k}`}
                        type="color"
                        className="h-9 w-16 rounded-full p-1"
                        value={draft.theme[k] || tpl.themeDefaults[k] || "#000000"}
                        onChange={(e) =>
                          update((d) => {
                            d.theme[k] = e.target.value;
                          })
                        }
                      />
                      {draft.theme[k] && (
                        <Button
                          variant="link"
                          size="xs"
                          onClick={() =>
                            update((d) => {
                              delete d.theme[k];
                            })
                          }
                        >
                          Đặt lại
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="grid gap-1.5">
                  <Label>Font</Label>
                  <Select
                    value={draft.theme.font ?? NONE}
                    disabled={locked}
                    onValueChange={(value) =>
                      update((d) => {
                        if (value === NONE) delete d.theme.font;
                        else d.theme.font = value;
                      })
                    }
                  >
                    <SelectTrigger aria-label="Font" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Mặc định ({tpl.themeDefaults.font})</SelectItem>
                      {FONTS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="theme-radius">Bo góc (px)</Label>
                  <Input
                    id="theme-radius"
                    type="number"
                    min={0}
                    max={40}
                    value={draft.theme.radius ?? ""}
                    placeholder={String(tpl.themeDefaults.radius ?? 28)}
                    onChange={(e) =>
                      update((d) => {
                        if (e.target.value === "") delete d.theme.radius;
                        else d.theme.radius = Number(e.target.value);
                      })
                    }
                  />
                </div>
              </div>
            </Panel>

            <Panel title="Profile">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="profile-title">Tên</Label>
                  <Input
                    id="profile-title"
                    value={draft.profile.title}
                    onChange={(e) =>
                      update((d) => {
                        d.profile.title = e.target.value;
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="profile-subtitle">Subtitle</Label>
                  <Input
                    id="profile-subtitle"
                    value={draft.profile.subtitle ?? ""}
                    onChange={(e) =>
                      update((d) => {
                        d.profile.subtitle = e.target.value;
                      })
                    }
                  />
                </div>
                <div className="col-span-2 grid gap-1.5">
                  <Label htmlFor="profile-about">Giới thiệu (chỉ hiện trên desktop)</Label>
                  <Textarea
                    id="profile-about"
                    rows={2}
                    value={draft.profile.about ?? ""}
                    onChange={(e) =>
                      update((d) => {
                        d.profile.about = e.target.value;
                      })
                    }
                  />
                </div>
              </div>
            </Panel>

            <Panel title="Vùng & block" hint="Chỉ chuyển block vào vùng mà template cho phép. Ghim để cố định vị trí.">
              <div className="flex flex-col gap-3">
                {REGIONS.map((r) => {
                  const ids = layout[r].blocks;
                  const spec = tpl.regions[r];
                  return (
                    <section key={r} className="rounded-3xl bg-muted p-3">
                      <div className="mx-1 mb-2.5 flex flex-wrap items-center gap-2">
                        <h3 className="text-md font-semibold tracking-[-0.01em]">{spec.label ?? r}</h3>
                        <Badge variant="outline" className="bg-card">
                          {ids.length}
                          {spec.max ? ` / ${spec.max}` : ""}
                        </Badge>
                        <span className="text-2xs text-muted-foreground">
                          {(layout[r].rank ?? spec.rank ?? r === "main") ? "tự xếp theo viral" : "giữ thứ tự"}
                        </span>
                        {r === "main" && spec.variants && (
                          <Select
                            value={layout.main.variant ?? spec.defaultVariant ?? spec.variants[0]}
                            disabled={locked}
                            onValueChange={(value) =>
                              update((d) => {
                                const L = layoutOf(d);
                                d.layout = { ...L, main: { ...L.main, variant: value as never } };
                              })
                            }
                          >
                            <SelectTrigger
                              size="sm"
                              aria-label="Kiểu hiển thị"
                              className="ml-auto rounded-full bg-card text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {spec.variants.map((v) => (
                                <SelectItem key={v} value={v}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <ul className="flex flex-col gap-2">
                        {ids.map((id, i) => byId.get(id) && blockRow(byId.get(id)!, r, i, ids.length))}
                        {!ids.length && (
                          <li className="border-thick rounded-2xl border-dashed px-3 py-3.5 text-center text-xs text-muted-foreground">
                            Trống
                          </li>
                        )}
                      </ul>
                    </section>
                  );
                })}

                {unplaced.length > 0 && (
                  <section className="border-thick rounded-3xl border-dashed p-3">
                    <h3 className="text-md mx-1 mb-2.5 font-semibold">Block chưa dùng</h3>
                    <ul className="flex flex-col gap-2">
                      {unplaced.map((b, i) => blockRow(b, null, i, unplaced.length))}
                    </ul>
                  </section>
                )}
              </div>
            </Panel>
          </fieldset>

          <footer className="sticky bottom-0 -mx-4 mt-auto flex flex-wrap items-center gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur-md md:-mx-6 md:px-6 lg:mr-0">
            {canEdit ? (
              <>
                <StatusPill dirty={dirty}>{dirty ? "Có thay đổi chưa lưu" : "Đã lưu"}</StatusPill>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    disabled={!dirty || saving}
                    onClick={() => saved && setDraft(structuredClone(saved))}
                  >
                    ↺ Bỏ thay đổi
                  </Button>
                  <Button variant="outline" disabled={!dirty || saving} onClick={() => save(false)}>
                    Lưu nháp
                  </Button>
                  <Button disabled={saving} onClick={() => save(true)}>
                    Xuất bản
                  </Button>
                </div>
                {(saving || status.msg) && (
                  <span
                    role="status"
                    className={cn(
                      "w-full text-xs",
                      status.kind === "error" ? "whitespace-pre-wrap text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {saving ? "Đang lưu…" : status.msg}
                  </span>
                )}
              </>
            ) : (
              <StatusPill>Chỉ xem</StatusPill>
            )}
          </footer>
        </div>

        <aside className="flex min-w-0 flex-col items-center gap-3 pb-6 lg:sticky lg:top-18 lg:self-start">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Segmented aria-label="Thiết bị xem trước" options={DEVICES} value={device} onValueChange={setDevice} />
            <a
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`${landingUrl}/${draft.slug}/`}
              target="_blank"
              rel="noreferrer"
            >
              Mở trang công khai ↗
            </a>
          </div>
          {previewErr ? (
            <pre className="w-full max-w-xl rounded-2xl bg-destructive/10 p-4 text-xs whitespace-pre-wrap text-destructive">
              {previewErr}
            </pre>
          ) : device === "mobile" ? (
            <PhoneFrame>
              <iframe title="Preview" sandbox="allow-scripts" srcDoc={srcDoc} className="size-full border-0" />
            </PhoneFrame>
          ) : (
            <BrowserFrame url={`${landingUrl.replace(/^https?:\/\//, "")}/${draft.slug}`}>
              <iframe title="Preview" sandbox="allow-scripts" srcDoc={srcDoc} className="size-full border-0" />
            </BrowserFrame>
          )}
        </aside>
      </div>
    </div>
  );
}
