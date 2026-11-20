import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

/** The linkbio logo: a chain-link icon on a soft olive and hazel gradient. */
const BRAND_GRADIENT =
  "radial-gradient(circle at 25% 20%, #E6CA9A 0, transparent 60%), radial-gradient(circle at 80% 85%, #B9CB5C 0, transparent 55%), #DCE5AE";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      data-slot="brand-mark"
      style={{ background: BRAND_GRADIENT }}
      className={cn("grid size-[34px] flex-none place-items-center rounded-[11px] text-ink", className)}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="size-[18px]"
        aria-hidden
      >
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </svg>
    </span>
  );
}

type TopbarProps = Omit<ComponentProps<"header">, "children"> & {
  items: NavItem[];
  /** href of the highlighted nav item. */
  current?: string;
  /** Brand link target. */
  home?: string;
  /** Link component, e.g. next/link. Plain <a> by default, so it also renders in Astro. */
  linkAs?: ElementType;
  /** Extra content after the nav, such as the account email and a logout button. */
  children?: ReactNode;
};

/** Sticky top bar with the brand and a pill-shaped nav. */
export function Topbar({ items, current, home = "/", linkAs: A = "a", className, children, ...props }: TopbarProps) {
  return (
    <header
      data-slot="topbar"
      className={cn(
        "sticky top-0 z-10 flex items-center gap-3.5 bg-background/90 px-4 py-2.5 backdrop-blur-md md:px-6 md:py-3",
        className,
      )}
      {...props}
    >
      <A
        href={home}
        className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-foreground no-underline"
      >
        <BrandMark />
        linkbio
      </A>
      <nav className="ml-auto flex flex-wrap gap-1 rounded-full bg-card p-1 shadow-soft">
        {items.map((item) => {
          const active = item.href === current;
          return (
            <A
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-md no-underline md:px-4 md:py-[7px]",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </A>
          );
        })}
      </nav>
      {children}
    </header>
  );
}
