import { SiteSchema, type Site } from "@bio-link/schema";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from "astro:env/server";

const files = import.meta.glob("../content/sites/*.json", { eager: true, import: "default" });
let buildSnapshot: Promise<Site[]> | undefined;

function parseSite(raw: unknown, source: string): Site {
  const result = SiteSchema.safeParse(raw);
  if (!result.success) throw new Error(`${source}: config không hợp lệ\n${result.error.message}`);
  return result.data;
}

function buildClient() {
  return createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

/** Slug cũ sau khi đổi tên (ADMIN-2) → slug hiện tại, chỉ với trang đã xuất bản (PUB-4). */
export async function loadRedirects(): Promise<{ from: string; to: string }[]> {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return [];
  // shortcut: đọc hết một lần, đủ cho vài trăm slug; phân trang khi số chuyển hướng vượt 1000.
  const { data, error } = await buildClient()
    .from("slug_redirects")
    .select("from_slug, sites!inner(slug)")
    .not("sites.published_config", "is", null);
  if (error) throw new Error(`Could not load slug redirects: ${error.message}`);
  return data.map((row) => ({ from: row.from_slug, to: (row.sites as unknown as { slug: string }).slug }));
}

export async function loadPublishedSites(): Promise<Site[]> {
  if (!SUPABASE_URL && !SUPABASE_SECRET_KEY) {
    return Object.entries(files).map(([file, raw]) => parseSite(raw, file));
  }
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("Set both SUPABASE_URL and SUPABASE_SECRET_KEY for the landing app.");
  }

  const db = buildClient();
  const sites: Site[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from("sites")
      .select("slug, published_config")
      .not("published_config", "is", null)
      .order("slug")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Could not load published sites: ${error.message}`);
    for (const row of data) sites.push(parseSite(row.published_config, row.slug));
    if (data.length < pageSize) return sites;
  }
}

/** Keep the HTML and ranking JSON on the same snapshot during a static build. */
export function loadBuildSites(): Promise<Site[]> {
  if (import.meta.env.DEV) return loadPublishedSites();
  return (buildSnapshot ??= loadPublishedSites());
}
