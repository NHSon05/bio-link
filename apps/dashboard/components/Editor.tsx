"use client";

import { useEffect, useMemo, useState } from "react";
import { REGIONS, layoutOf, type Block, type RegionName, type Site } from "@bio-link/schema";
import { templates, templateIds } from "@bio-link/templates";

type Summary = { slug: string; title: string; canEdit: boolean };
type Status = { kind: "idle" | "saving" | "saved" | "error"; msg?: string };
type Props = {
  landingUrl: string;
  siteRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  onSignOut: () => Promise<void>;
};

const input = "w-full rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-black/40 dark:focus:border-white/40";
const btn = "rounded-lg px-3 py-1.5 text-sm border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40";

export default function Editor({ landingUrl, siteRequest, onSignOut }: Props) {
  const [list, setList] = useState<Summary[] | null>(null);
  const [slug, setSlug] = useState("");
  const [saved, setSaved] = useState<Site | null>(null);
  const [draft, setDraft] = useState<Site | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [srcDoc, setSrcDoc] = useState("");
  const [previewErr, setPreviewErr] = useState("");
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    siteRequest<Summary[]>("/api/sites", { signal: controller.signal }).then((s) => {
      setList(s);
      setSlug(s[0]?.slug ?? "");
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setLoadError(error.message);
    });
    return () => controller.abort();
  }, [siteRequest]);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    siteRequest<Site>(`/api/sites/${slug}`, { signal: controller.signal }).then((s) => {
      setSaved(s);
      setDraft(structuredClone(s));
      setStatus({ kind: "idle" });
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setLoadError(error.message);
    });
    return () => controller.abort();
  }, [slug, siteRequest]);

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
        if (!r.ok) { setPreviewErr(html.replace(/<[^>]+>/g, "")); return; }
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
  const tpl = draft ? templates[draft.template] ?? templates.classic : null;

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
      setList((current) => current?.map((entry) => entry.slug === site.slug
        ? { ...entry, title: site.profile.title }
        : entry) ?? null);
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
  const accountHeader = (
    <header className="flex items-center gap-2">
      <h1 className="text-lg font-semibold">bio-link</h1>
      {!!list?.length && (
        <select className={`${input} ml-auto max-w-56`} value={slug} disabled={saving} onChange={(e) => {
          setLoadError("");
          setSrcDoc("");
          setPreviewErr("");
          setSlug(e.target.value);
        }} aria-label="Chọn slug">
          {list.map((site) => <option key={site.slug} value={site.slug}>{site.title} · /{site.slug}</option>)}
        </select>
      )}
      <button className={btn} disabled={saving} onClick={onSignOut}>Đăng xuất</button>
    </header>
  );

  if (!draft || !tpl || draft.slug !== slug || loadError) {
    return (
      <main className="flex flex-col gap-4 p-8 text-sm">
        {accountHeader}
        {loadError
          ? <p role="alert" className="text-red-600">{loadError}</p>
          : <p>{list?.length === 0 ? "Bạn chưa được giao trang nào." : "Đang tải…"}</p>}
      </main>
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
    <li key={b.id} className={`flex items-center gap-2 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm ${b.hidden ? "opacity-50" : ""}`}>
      <code className="rounded bg-black/5 dark:bg-white/10 px-1.5 text-xs">{b.type}</code>
      <span className="flex-1 truncate">{b.title || b.text || b.id}</span>
      {region && <>
        <button className={btn} disabled={i === 0} onClick={() => move(region, i, -1)} aria-label="Lên">↑</button>
        <button className={btn} disabled={i === total - 1} onClick={() => move(region, i, 1)} aria-label="Xuống">↓</button>
      </>}
      <button className={`${btn} ${b.pinned ? "bg-lime-200 dark:bg-lime-800" : ""}`} onClick={() => toggle(b.id, "pinned")} title="Ghim lên đầu vùng">📌</button>
      <button className={btn} onClick={() => toggle(b.id, "hidden")} title="Ẩn/hiện">{b.hidden ? "🙈" : "👁"}</button>
      <select className="rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-1 py-1 text-xs" value={region ?? ""} onChange={(e) => moveTo(b.id, region, e.target.value as RegionName | "")}>
        <option value="">— không dùng —</option>
        {REGIONS.map((r) => (
          <option key={r} value={r} disabled={!allows(r, b)}>{tpl.regions[r].label ?? r}{allows(r, b) ? "" : " (không cho phép)"}</option>
        ))}
      </select>
    </li>
  );

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(380px,520px)_1fr]">
      <aside className="flex flex-col gap-5 overflow-y-auto border-r border-black/10 dark:border-white/10 p-5 lg:h-screen">
        {accountHeader}

        <fieldset className="contents" disabled={!canEdit || saving} aria-label="Nội dung trang">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Template</h2>
          <div className="grid grid-cols-3 gap-2">
            {templateIds.map((id) => (
              <button key={id} onClick={() => update((d) => { d.template = id; })}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${draft.template === id ? "border-black dark:border-white" : "border-black/10 dark:border-white/15"}`}>
                <div className="font-medium">{templates[id].name}</div>
                <div className="text-xs opacity-60">{templates[id].desktop}</div>
              </button>
            ))}
          </div>
          <p className="text-xs opacity-60">{tpl.description}</p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <h2 className="col-span-2 text-sm font-semibold">Theme <span className="font-normal opacity-60">(để trống = mặc định của template)</span></h2>
          {(["bg", "accent"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="color" value={draft.theme[k] || tpl.themeDefaults[k] || "#000000"} onChange={(e) => update((d) => { d.theme[k] = e.target.value; })} />
              {k}
              {draft.theme[k] && <button className="text-xs underline opacity-60" onClick={() => update((d) => { delete d.theme[k]; })}>reset</button>}
            </label>
          ))}
          <label className="text-sm">Font
            <select className={input} value={draft.theme.font ?? ""} onChange={(e) => update((d) => { if (e.target.value) d.theme.font = e.target.value; else delete d.theme.font; })}>
              <option value="">Mặc định ({tpl.themeDefaults.font})</option>
              {["Sora", "Manrope", "Inter", "DM Sans", "Be Vietnam Pro"].map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="text-sm">Bo góc (px)
            <input className={input} type="number" min={0} max={40} value={draft.theme.radius ?? ""} placeholder={String(tpl.themeDefaults.radius ?? 28)}
              onChange={(e) => update((d) => { if (e.target.value === "") delete d.theme.radius; else d.theme.radius = Number(e.target.value); })} />
          </label>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Profile</h2>
          <input className={input} value={draft.profile.title} onChange={(e) => update((d) => { d.profile.title = e.target.value; })} placeholder="Tên" />
          <input className={input} value={draft.profile.subtitle ?? ""} onChange={(e) => update((d) => { d.profile.subtitle = e.target.value; })} placeholder="Subtitle" />
          <textarea className={input} rows={2} value={draft.profile.about ?? ""} onChange={(e) => update((d) => { d.profile.about = e.target.value; })} placeholder="Giới thiệu" />
        </section>

        {REGIONS.map((r) => {
          const ids = layout[r].blocks;
          const spec = tpl.regions[r];
          return (
            <section key={r} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{spec.label ?? r}</h2>
                <span className="text-xs opacity-60">{spec.max ? `tối đa ${spec.max} · ` : ""}{(layout[r].rank ?? spec.rank ?? r === "main") ? "tự xếp theo viral" : "giữ thứ tự"}</span>
                {r === "main" && spec.variants && (
                  <select className="ml-auto rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-2 py-1 text-xs" value={layout.main.variant ?? spec.defaultVariant ?? spec.variants[0]}
                    onChange={(e) => update((d) => { const L = layoutOf(d); d.layout = { ...L, main: { ...L.main, variant: e.target.value as never } }; })}>
                    {spec.variants.map((v) => <option key={v}>{v}</option>)}
                  </select>
                )}
              </div>
              <ul className="flex flex-col gap-1.5">
                {ids.map((id, i) => byId.get(id) && blockRow(byId.get(id)!, r, i, ids.length))}
                {!ids.length && <li className="rounded-lg border border-dashed border-black/15 dark:border-white/15 px-3 py-2 text-xs opacity-60">Trống</li>}
              </ul>
            </section>
          );
        })}

        {unplaced.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Block chưa dùng</h2>
            <ul className="flex flex-col gap-1.5">{unplaced.map((b, i) => blockRow(b, null, i, unplaced.length))}</ul>
          </section>
        )}

        </fieldset>
        <footer className="sticky bottom-0 -mx-5 mt-auto flex flex-wrap items-center gap-3 border-t border-black/10 dark:border-white/10 bg-background px-5 py-3">
          {canEdit ? (
            <>
              <button className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black" disabled={saving} onClick={() => save(true)}>Xuất bản</button>
              <button className={btn} disabled={!dirty || saving} onClick={() => save(false)}>Lưu nháp</button>
              <button className={btn} disabled={!dirty || saving} onClick={() => saved && setDraft(structuredClone(saved))}>Bỏ thay đổi</button>
              <span role="status" className={`w-full text-xs ${status.kind === "error" ? "text-red-600 whitespace-pre-wrap" : "opacity-60"}`}>
                {saving ? "Đang lưu…" : status.msg ?? (dirty ? "Có thay đổi chưa lưu" : "")}
              </span>
            </>
          ) : <span className="text-xs opacity-60">Chỉ xem</span>}
        </footer>
      </aside>

      <main className="flex flex-col items-center gap-3 bg-black/[.03] dark:bg-white/[.03] p-5 lg:h-screen">
        <div className="flex items-center gap-2 text-sm">
          <button className={`${btn} ${device === "mobile" ? "bg-black/10 dark:bg-white/15" : ""}`} onClick={() => setDevice("mobile")}>Mobile</button>
          <button className={`${btn} ${device === "desktop" ? "bg-black/10 dark:bg-white/15" : ""}`} onClick={() => setDevice("desktop")}>Desktop</button>
          <a className="underline opacity-70" href={`${landingUrl}/${draft.slug}/`} target="_blank" rel="noreferrer">Mở trang công khai ↗</a>
        </div>
        {previewErr
          ? <pre className="w-full max-w-xl whitespace-pre-wrap rounded-lg bg-red-50 p-4 text-xs text-red-700 dark:bg-red-950 dark:text-red-200">{previewErr}</pre>
          : <iframe title="Preview" sandbox="allow-scripts" srcDoc={srcDoc} className={`flex-1 rounded-2xl border border-black/10 dark:border-white/10 bg-white shadow-sm ${device === "mobile" ? "w-[390px] max-w-full" : "w-full"}`} />}
      </main>
    </div>
  );
}
