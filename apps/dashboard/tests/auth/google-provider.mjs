import { createServer, request } from "node:http";

const provider = new URL(process.env.AUTH_TEST_GOOGLE_URL);
const upstream = new URL(process.env.AUTH_TEST_SUPABASE_URL);
let available = true;

createServer((req, res) => {
  const url = new URL(req.url, provider);
  if (url.pathname === "/health" || url.pathname === "/google/consent") {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("Simulated Google provider");
    return;
  }
  if (url.pathname === "/google/availability" && req.method === "POST") {
    available = url.searchParams.get("enabled") === "true";
    res.writeHead(204).end();
    return;
  }
  if (available && url.pathname === "/auth/v1/authorize" && url.searchParams.get("provider") === "google") {
    const consent = new URL(`/google/consent${url.search}`, provider);
    res.writeHead(302, { Location: consent.href }).end();
    return;
  }

  const forward = request(
    upstream,
    {
      path: url.pathname + url.search,
      method: req.method,
      headers: { ...req.headers, host: upstream.host },
    },
    (reply) => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    },
  );
  forward.on("error", () => res.writeHead(502).end());
  req.pipe(forward);
}).listen(Number(provider.port), provider.hostname);
