// @ts-check
import { defineConfig, envField } from "astro/config";
import node from "@astrojs/node";

// Plan mục 7: production 100% static (S3 + CloudFront).
// Chỉ route /preview bật SSR (prerender = false) để dashboard xem bản nháp,
// adapter Node dùng cho server preview nội bộ, không deploy lên CDN.
export default defineConfig({
  output: "static",
  adapter: node({ mode: "standalone" }),
  server: { port: 4321 },
  build: { format: "directory" },
  // Dashboard gửi form POST cross-site tới /preview; preview.astro tự kiểm tra Origin nên tắt kiểm tra mặc định của Astro.
  security: { checkOrigin: false },
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_SECRET_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
