import { buildCallback, reportBuild } from "@/lib/builds";

type Context = { params: Promise<{ buildId: string }> };

export function POST(request: Request, { params }: Context) {
  return buildCallback(request, async () => reportBuild(request, (await params).buildId));
}
