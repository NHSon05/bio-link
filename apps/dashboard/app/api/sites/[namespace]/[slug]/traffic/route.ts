import { sitePath, type SiteParams } from "@/lib/store";
import { siteResponse, SiteApiError } from "@/lib/supabase";
import { trafficDates, type TrafficDay } from "@/lib/traffic";

export function GET(request: Request, { params }: { params: Promise<SiteParams> }) {
  return siteResponse(request, async ({ db }) => {
    const slug = sitePath(await params);
    const dates = trafficDates(30);
    const { data, error } = await db
      .from("sites")
      .select("slug,site_traffic(day,views,clicks)")
      .eq("slug", slug)
      .gte("site_traffic.day", dates[0])
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new SiteApiError(404, "Không tìm thấy slug");
    const byDate = new Map(data.site_traffic.map((row: TrafficDay) => [row.day, row]));
    return dates.map((day) => byDate.get(day) ?? { day, views: 0, clicks: 0 });
  });
}
