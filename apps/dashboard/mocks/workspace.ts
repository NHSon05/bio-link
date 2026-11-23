import { SiteSchema, type Site } from "@bio-link/schema";
import type { WorkspaceApi } from "@/lib/workspace-api";
import { trafficDates } from "@/lib/traffic";
import shop from "../../landing/src/content/sites/fanpage-abc.json";
import artist from "../../landing/src/content/sites/beat-artist.json";
import food from "../../landing/src/content/sites/ig-food.json";
import beauty from "../../landing/src/content/sites/tiktok-beauty.json";

const fixtures = [shop, artist, beauty, food].map((site) => SiteSchema.parse(site));
const dailyViews = [148, 186, 174, 235, 210, 312, 274, 198, 226, 307, 249, 295, 362, 322];

export function mockWorkspaceApi(userId: string): WorkspaceApi {
  function key(slug: string) {
    return "linkbio:demo:v1:" + userId + ":" + slug;
  }
  function snapshot(slug: string): { draft: Site; published: Site } {
    const seed = fixtures.find((site) => site.slug === slug);
    if (!seed) throw new Error("Không tìm thấy trang mẫu.");
    const raw = localStorage.getItem(key(slug));
    if (!raw) return { draft: seed, published: seed };
    const entry = JSON.parse(raw);
    return { draft: SiteSchema.parse(entry.draft), published: SiteSchema.parse(entry.published) };
  }
  return {
    sample: true,
    async list(signal) {
      signal.throwIfAborted();
      return fixtures.map(({ slug }) => {
        const { draft } = snapshot(slug);
        return {
          slug,
          title: draft.profile.title,
          template: draft.template,
          platform: draft.source?.platform ?? null,
          canEdit: true,
          canManage: false,
          publishedSlug: slug,
        };
      });
    },
    async read(slug, published, signal) {
      signal.throwIfAborted();
      const record = snapshot(slug);
      return structuredClone(published ? record.published : record.draft);
    },
    async save(site, publish) {
      const previous = snapshot(site.slug);
      const draft = SiteSchema.parse({ ...site, updatedAt: new Date().toISOString() });
      localStorage.setItem(key(site.slug), JSON.stringify({ draft, published: publish ? draft : previous.published }));
      return draft;
    },
    async me(signal) {
      signal.throwIfAborted();
      return { userId, email: null, isAdmin: false };
    },
    upload: unavailable,
    createSite: unavailable,
    renameSite: unavailable,
    deleteSite: unavailable,
    members: unavailable,
    setMember: unavailable,
    removeMember: unavailable,
    async traffic(slug, signal) {
      signal.throwIfAborted();
      const index = fixtures.findIndex((site) => site.slug === slug);
      if (index === -1) throw new Error("Không tìm thấy trang mẫu.");
      return trafficDates(30).map((day) => {
        const offset = Math.floor(Date.parse(day) / 86400000) + index * 3;
        const views = Math.round(dailyViews[offset % dailyViews.length] * (1 + index / 3));
        return { day, views, clicks: Math.round(views * (0.13 + (offset % 5) * 0.025)) };
      });
    },
  };
}

// Dữ liệu mẫu chỉ sống trong localStorage: không có ảnh tải lên hay quản trị trang.
async function unavailable(): Promise<never> {
  throw new Error("Chức năng này cần dữ liệu thật (WORKSPACE_DATA_SOURCE=live).");
}
