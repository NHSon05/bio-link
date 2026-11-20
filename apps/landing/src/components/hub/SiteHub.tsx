import { Badge } from "@bio-link/ui/components/badge";
import { buttonVariants } from "@bio-link/ui/components/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@bio-link/ui/components/card";
import { PhoneFrame } from "@bio-link/ui/components/device-frame";
import { Topbar } from "@bio-link/ui/components/topbar";

export type HubSite = { slug: string; title: string; template: string; platform?: string };

type Props = { sites: HubSite[]; dashboardUrl: string };

const SWATCHES = [
  { name: "Lunar Shadow", role: "Primary", hex: "#282828", className: "bg-[#282828] text-white" },
  { name: "Clean White", role: "BG 1", hex: "#FFFFFF", className: "bg-white text-[#282828] ring-1 ring-[#ECECE8]" },
  { name: "Gray Whisper", role: "BG 2", hex: "#F7F7F7", className: "bg-[#F1F1EE] text-[#282828]" },
  { name: "Gentle Olive", role: "Accent 1", hex: "#CBD77E", className: "bg-olive text-olive-foreground" },
  { name: "Winter Hazel", role: "Accent 2", hex: "#E6CA9A", className: "bg-hazel text-hazel-foreground" },
];

/**
 * Internal hub listing every slug with a live phone preview (demo/index.html).
 * Rendered to static HTML by Astro, so it ships no JavaScript.
 */
export default function SiteHub({ sites, dashboardUrl }: Props) {
  return (
    <>
      <Topbar
        current="/"
        items={[
          { href: "/", label: "Các slug" },
          { href: dashboardUrl, label: "Dashboard" },
        ]}
      />
      <main className="mx-auto max-w-[1280px] px-4 pt-3 pb-16 md:px-6 md:pt-5">
        <section className="grid items-end gap-4 px-2 pt-9 pb-7 md:grid-cols-[1.1fr_1fr] md:gap-10">
          <h1 className="text-[38px] leading-[1.05] font-semibold tracking-[-0.045em] md:text-[52px]">
            Mỗi social page,
            <br />
            một landing page riêng
          </h1>
          <div>
            <p className="text-base leading-[1.7] font-light text-muted-foreground">
              Nội dung và thứ tự riêng cho từng slug, xếp theo <b>pinned → viral score → mới nhất</b>. Mobile gọn nhẹ
              cho in-app browser; trên máy tính mỗi slug có layout riêng.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px]">
              {["Banner Linktree", "/{slug}", "{slug}.json", "GA4 click"].map((step, i) => (
                <span key={step} className="flex items-center gap-2">
                  {i > 0 && <span className="font-light text-muted-foreground">→</span>}
                  <span className="rounded-full bg-card px-3.5 py-1.5 shadow-soft">{step}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="Bảng màu" className="mb-9 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SWATCHES.map((swatch) => (
            <div
              key={swatch.hex}
              className={`flex min-h-[118px] flex-col justify-between rounded-3xl px-4.5 pt-4.5 pb-4 ${swatch.className}`}
            >
              <div>
                <b className="text-[15px] font-semibold tracking-[-0.02em]">{swatch.name}</b>
                <small className="mt-1 block text-[10px] tracking-[0.14em] uppercase opacity-80">{swatch.role}</small>
              </div>
              <span className="text-[11.5px]">{swatch.hex}</span>
            </div>
          ))}
        </section>

        <div className="mb-5 flex flex-wrap items-center gap-3.5">
          <h2 className="text-[22px] font-semibold tracking-[-0.03em]">Các slug</h2>
          <span className="ml-auto text-[13px] text-muted-foreground">
            {sites.length} trang · xem như trên điện thoại
          </span>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-5">
          {sites.map((site) => (
            <Card key={site.slug} className="items-center rounded-[36px] [--card-spacing:--spacing(5.5)]">
              <CardHeader className="w-full">
                <CardTitle className="text-[15px] font-semibold tracking-[-0.02em]">/{site.slug}</CardTitle>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{site.template}</Badge>
                  {site.platform && <Badge variant="outline">{site.platform}</Badge>}
                </div>
                <CardAction className="flex gap-2">
                  <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/${site.slug}.json`}>
                    JSON
                  </a>
                  <a className={buttonVariants({ size: "sm" })} href={`/${site.slug}/`}>
                    Mở trang ↗
                  </a>
                </CardAction>
              </CardHeader>
              <CardContent className="flex w-full justify-center">
                <PhoneFrame>
                  <iframe src={`/${site.slug}/`} title={site.title} loading="lazy" className="size-full border-0" />
                </PhoneFrame>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
