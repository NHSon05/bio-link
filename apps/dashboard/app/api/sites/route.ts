import { listSites } from "@/lib/store";
import { siteResponse } from "@/lib/supabase";

export function GET(request: Request) {
  return siteResponse(request, ({ db }) => listSites(db));
}
