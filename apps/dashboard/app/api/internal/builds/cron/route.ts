import { buildCallback, startCronBuild } from "@/lib/builds";

export function POST(request: Request) {
  return buildCallback(request, startCronBuild);
}
