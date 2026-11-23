import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const dashboardUrl = "http://127.0.0.1:55300";
const landingUrl = "http://127.0.0.1:55326";
const googleUrl = process.env.AUTH_TEST_GOOGLE_URL;
const channel = process.env.PLAYWRIGHT_CHANNEL;
const dispatchStub = join(__dirname, "tests/auth/build-dispatch-stub.mjs");

if (!process.env.AUTH_TEST_SUPABASE_URL || !googleUrl) {
  throw new Error("Run pnpm test:auth to start the isolated Supabase stack.");
}

export default defineConfig({
  testDir: "./tests/auth",
  outputDir: process.env.WORKSPACE_DATA_SOURCE === "mock" ? "./test-results/mock" : "./test-results/live",
  workers: 1,
  use: { baseURL: dashboardUrl, ...(channel && { channel }) },
  webServer: [
    {
      command:
        'pnpm --filter @bio-link/runtime build && SUPABASE_URL= SUPABASE_SECRET_KEY= pnpm --filter landing exec astro build --outDir "$AUTH_TEST_LANDING_DIST" && node "$AUTH_TEST_LANDING_DIST/server/entry.mjs"',
      env: { PORT: "55326", HOST: "127.0.0.1", DASHBOARD_ORIGIN: dashboardUrl },
      url: landingUrl + "/favicon.svg",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    { command: "node tests/auth/google-provider.mjs", url: `${googleUrl}/health`, reuseExistingServer: false },
    {
      command: "pnpm build && pnpm start --hostname 127.0.0.1 --port 55300",
      env: {
        WORKSPACE_DATA_SOURCE: process.env.WORKSPACE_DATA_SOURCE ?? "live",
        DASHBOARD_URL: dashboardUrl,
        SUPABASE_URL: googleUrl,
        NEXT_PUBLIC_LANDING_URL: landingUrl,
        BUILD_REPO: "bio-link-test/dispatch-stub",
        BUILD_HOOK_TOKEN: "test-only",
        BUILD_CALLBACK_TOKEN: "callback-test-only",
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import="${dispatchStub}"`.trim(),
      },
      url: `${dashboardUrl}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
