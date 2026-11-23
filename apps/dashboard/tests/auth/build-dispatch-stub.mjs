import { appendFileSync } from "node:fs";

const fetchUpstream = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url !== "https://api.github.com/repos/bio-link-test/dispatch-stub/dispatches") {
    return fetchUpstream(input, init);
  }
  const request = new Request(input, init);
  appendFileSync(
    process.env.AUTH_TEST_BUILD_DISPATCH_LOG,
    JSON.stringify({ method: request.method, body: await request.json() }) + "\n",
  );
  return new Response(null, { status: 503 });
};
