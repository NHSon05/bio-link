import { ProductDbSchema, SiteSchema, type Site } from "@bio-link/schema";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from "astro:env/server";
import productsJson from "../content/products.json";

const files = import.meta.glob("../content/sites/*.json", { eager: true, import: "default" });
let buildSnapshot: Promise<Site[]> | undefined;

function parseSite(raw: unknown, source: string): Site {
  const result = SiteSchema.safeParse(raw);
  if (!result.success) throw new Error(`${source}: config không hợp lệ\n${result.error.message}`);
  return result.data;
}

export async function loadPublishedSites(): Promise<Site[]> {
  if (!SUPABASE_URL && !SUPABASE_SECRET_KEY) {
    return Object.entries(files).map(([file, raw]) => parseSite(raw, file));
  }
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("Set both SUPABASE_URL and SUPABASE_SECRET_KEY for the landing app.");
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const sites: Site[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from("sites")
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
  return buildSnapshot ??= loadPublishedSites();
}

export const products = ProductDbSchema.parse(productsJson);
