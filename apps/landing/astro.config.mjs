// @ts-check
import { defineConfig, envField } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// Plan mục 7: production 100% static (S3 + CloudFront).
// Chỉ route /preview bật SSR (prerender = false) để dashboard xem bản nháp,
// adapter Node dùng cho server preview nội bộ, không deploy lên CDN.
export default defineConfig({
  output: "static",
  adapter: node({ mode: "standalone" }),
  server: { port: 4321 },
  build: { format: "directory" },
  // React renders the @bio-link/ui components to static HTML at build time.
  // Add a client:* directive only where a component needs to be interactive.
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    ssr: { noExternal: ["@bio-link/ui"] },
  },
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_SECRET_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
