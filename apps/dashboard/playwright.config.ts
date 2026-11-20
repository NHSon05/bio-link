import { defineConfig } from "@playwright/test";

const dashboardUrl = "http://127.0.0.1:55300";
const channel = process.env.PLAYWRIGHT_CHANNEL;

if (!process.env.AUTH_TEST_SUPABASE_URL) {
  throw new Error("Run pnpm test:auth to start the isolated Supabase stack.");
}

export default defineConfig({
  testDir: "./tests/auth",
  workers: 1,
  use: { baseURL: dashboardUrl, ...(channel && { channel }) },
  webServer: {
    command: "pnpm build && pnpm start --hostname 127.0.0.1 --port 55300",
    env: { DASHBOARD_URL: dashboardUrl },
    url: `${dashboardUrl}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
