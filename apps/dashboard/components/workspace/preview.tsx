"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Monitor, Smartphone } from "lucide-react";
import type { Site } from "@bio-link/schema";
import { BrowserFrame, PhoneFrame } from "@/components/device-frame";
import { useWorkspaceApi } from "@/lib/workspace-api";
import { Button } from "@/components/ui/button";

export function DevicePicker({ desktop, onChange }: { desktop: boolean; onChange: (value: boolean) => void }) {
  return (
    <div
      role="group"
      aria-label="Thiết bị xem trước"
      className="flex w-fit shrink-0 gap-1 rounded-full bg-card p-1 shadow-soft"
    >
      {[
        { value: false, label: "Điện thoại", Icon: Smartphone },
        { value: true, label: "Máy tính", Icon: Monitor },
      ].map(({ value, label, Icon }) => (
        <Button
          key={label}
          variant={desktop === value ? "default" : "ghost"}
          size="sm"
          aria-label={label}
          aria-pressed={desktop === value}
          onClick={() => onChange(value)}
        >
          <Icon />
          {label}
        </Button>
      ))}
    </div>
  );
}

function PreviewDevice({
  desktop,
  address,
  compact = false,
  children,
}: {
  desktop: boolean;
  address: string;
  compact?: boolean;
  children: ReactNode;
}) {
  if (desktop)
    return (
      <BrowserFrame viewport={{ width: 1440, height: 900 }} url={address}>
        {children}
      </BrowserFrame>
    );
  return compact ? (
    <div className="mx-auto h-[494px] w-[243px]">
      <PhoneFrame className="max-w-none origin-top-left scale-[.76]">{children}</PhoneFrame>
    </div>
  ) : (
    <PhoneFrame className="mx-auto">{children}</PhoneFrame>
  );
}

export function PreviewScreen({
  site,
  slug,
  landingUrl,
  published = false,
  desktop,
  compact = false,
  title = "Bản xem trước trang bio",
}: {
  site?: Site;
  slug: string;
  landingUrl: string;
  published?: boolean;
  desktop?: boolean;
  compact?: boolean;
  title?: string;
}) {
  const api = useWorkspaceApi();
  const name = useId();
  const submitted = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const config = !site || published ? await api.read(slug, published, ctl.signal) : site;
        if (ctl.signal.aborted) return;
        // Điều hướng iframe bằng form POST để tài liệu có origin của landing, tài nguyên con tải same-origin (astro dev chặn cross-site).
        const form = document.createElement("form");
        form.method = "POST";
        form.action = new URL("/preview", landingUrl).href;
        form.target = name;
        form.hidden = true;
        const field = document.createElement("input");
        field.type = "hidden";
        field.name = "site";
        field.value = JSON.stringify(config);
        form.append(field);
        document.body.append(form);
        submitted.current = true;
        form.submit();
        form.remove();
        setError("");
      } catch {
        if (!ctl.signal.aborted) setError("Không tải được bản xem trước.");
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [api, site, slug, published, landingUrl, name]);
  const content = (
    <>
      {error ? (
        <p role="status" className="m-7 rounded-md bg-card p-4 text-sm text-foreground">
          {error}
        </p>
      ) : (
        !loaded && (
          <p className="p-9 text-sm text-ink" role="status">
            Đang tải bản xem trước…
          </p>
        )
      )}
      <iframe
        name={name}
        title={title}
        sandbox="allow-scripts allow-same-origin"
        onLoad={() => submitted.current && setLoaded(true)}
        className={loaded && !error ? "block size-full border-0" : "hidden"}
      />
    </>
  );
  if (desktop === undefined) return content;
  return (
    <PreviewDevice desktop={desktop} address={new URL(landingUrl).host + "/" + slug} compact={compact}>
      {content}
    </PreviewDevice>
  );
}

export function SitePreview({
  site,
  landingUrl,
  published = false,
  fullPage = false,
}: {
  site: Site;
  landingUrl: string;
  published?: boolean;
  fullPage?: boolean;
}) {
  const [desktop, setDesktop] = useState(false);
  const content = (
    <PreviewScreen
      site={site}
      slug={site.slug}
      landingUrl={landingUrl}
      published={published}
      desktop={fullPage ? undefined : desktop}
      title={published ? "Website đã xuất bản" : "Bản xem trước trang bio"}
    />
  );
  if (fullPage) return <main className="h-dvh w-full">{content}</main>;
  return (
    <section aria-label="Xem trước trang bio" className="grid min-w-0 justify-items-center gap-4">
      <DevicePicker desktop={desktop} onChange={setDesktop} />
      <div className="w-full">{content}</div>
    </section>
  );
}
