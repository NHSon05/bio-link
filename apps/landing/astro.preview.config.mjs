// @ts-check
import vercel from "@astrojs/vercel";
import { defineConfig } from "astro/config";
import config from "./astro.config.mjs";

export default defineConfig({
  ...config,
  adapter: vercel(),
  srcDir: "./src/preview",
  outDir: "./dist/preview",
  integrations: [
    {
      name: "bio-link-draft-preview",
      hooks: {
        "astro:config:setup": ({ injectRoute }) => {
          injectRoute({ pattern: "/preview", entrypoint: new URL("./src/pages/preview.astro", import.meta.url) });
        },
      },
    },
  ],
});
