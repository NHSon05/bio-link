# Smart Link-in-Bio — feature plan

This plan breaks the system design in [plan.html](plan.html) into features and tasks. Each feature lists its goal, dependencies, current status, and tasks. The HTTP behavior for every API task is defined in the [API contract](API_CONTRACT.md); task rows cite the contract IDs they deliver.

Auth has its own plan, contract, and checklist under [docs/auth](auth/AUTH_PLAN.md). This file only tracks its status.

## How to use this plan

- Work one feature at a time, in dependency order. Inside a feature, follow the task order unless a task says it can run in parallel.
- For each API task, write the test from the contract first (red), implement it (green), then refactor. Name tests after the contract IDs.
- Mark a task `[x]` only after it is verified. Record the verification command and its result under the feature's **Verification** line.
- If the behavior needs to change, update the [API contract](API_CONTRACT.md) first, then the task.
- Schema changes go in `packages/schema` first. Database changes go in new files in `supabase/migrations/`.

## Feature map

| ID  | Feature                                        | Goal in plan.html | Depends on | Status              |
| --- | ---------------------------------------------- | ----------------- | ---------- | ------------------- |
| F0  | Monorepo, schema, templates, runtime           | §5, §6, §7        | —          | Done                |
| F1  | Dashboard auth                                 | §9                | F0         | In progress         |
| F2  | Site editor: draft, publish, versions, preview | §7, §9            | F0, F1     | Done                |
| F3  | Site and access management (admin)             | §9                | F1, F2     | Done (builds in F5) |
| F4  | Media uploads                                  | §7                | F1         | Thumbnails left     |
| F5  | Build and deploy pipeline                      | §3, §9            | F2         | In progress         |
| F6  | Products, collections, affiliate links         | §12               | F1, F5     | Per-site CRUD       |
| F7  | Click tracking and analytics                   | §8                | F5         | Daily totals        |
| F8  | Subscribe endpoint                             | §12               | F5         | Client only         |
| F9  | Viral ranking automation (n8n)                 | §2 goal 5, §4     | F5, F7     | Ranking only        |
| F10 | Quality: smoke tests, Closure checks, devices  | §6, §9            | F5         | Not started         |

Recommended order: F1 → F2 → F3 and F4 in parallel → F5 → F6, F7, F8 in parallel → F9 → F10. Start F10's harness early and grow it with each feature.

---

## F0 — Monorepo, schema, templates, runtime

**Goal.** One shared data model renders the same page in production and in the dashboard preview.

**Status.** Done. `packages/schema` validates site JSON, `packages/templates` holds `classic`, `video-first`, and `shop-grid`, `packages/runtime` compiles with Closure ADVANCED, and the landing app builds `/{slug}` and `/{slug}.json` from Supabase or the fixtures.

- [x] F0-1 pnpm monorepo with `apps/dashboard`, `apps/landing`, `packages/schema`, `packages/templates`, `packages/runtime` (`packages/ui` was later removed; shadcn lives in `apps/dashboard/components/ui`).
- [x] F0-2 Zod schema for site, theme, layout, regions, blocks, products.
- [x] F0-3 Three templates with `template.json` manifests.
- [x] F0-4 Block components and `BlockRenderer`.
- [x] F0-5 Static build per slug and ranking JSON `/{slug}.json` (`PUB-2`).
- [x] F0-6 Runtime: click tracking, video slider, shop tabs, subscribe form, client-side re-ranking.
- [ ] F0-7 Generate `sitemap.xml` from the published slugs (`PUB-3`).

**Verification.** —

## F1 — Dashboard auth

**Goal.** Marketing staff sign in with a password or Google. New accounts get no site access until an admin assigns a role.

**Status.** Phases 0–1 are done. Follow [AUTH_TASK.md](auth/AUTH_TASK.md) for the remaining phases (registration, email confirmation, password recovery, Google, permissions, hosted verification).

- [ ] F1-1 Complete every phase in [AUTH_TASK.md](auth/AUTH_TASK.md).

## F2 — Site editor: draft, publish, versions, preview

**Goal.** An editor changes a site in a draft, checks it in the live preview, publishes it, and can roll back.

**Status.** The API and editor exist (`app/api/sites`, `components/Editor.tsx`, `save_site` RPC). Contract tests and the build trigger are missing.

- [x] F2-1 List sites the user can access (`SITE-1`).
- [x] F2-2 Read a draft (`SITE-2`).
- [x] F2-3 Save a draft with schema validation (`SITE-3`).
- [x] F2-4 Publish the draft with an optional note (`SITE-4`).
- [x] F2-5 Version history with cursor paging (`VER-1`).
- [x] F2-6 Restore a version as a new published version (`VER-2`).
- [x] F2-7 Astro `/preview` renders a draft with production templates (`PREV-1`).
- [x] F2-8 Add HTTP tests for `SITE-1`…`SITE-5` and `VER-1`…`VER-2`, including the role matrix in the contract's [common rules](API_CONTRACT.md#common-rules).
- [x] F2-9 Add `GET /api/me` so the editor can hide actions the user cannot perform (`ME-1`).
- [x] F2-10 Return `published_by` as an email or display name in the version list (`VER-1`). Adds `published_by_email`.
- [x] F2-11 Decide whether to keep `PUT /api/sites/{slug}` (`SITE-5`). Kept: the editor publishes with it, atomically.

**Verification.** `pnpm test:auth` (2026-11-22, isolated local Supabase) → 56 passed, 1 skipped (mock-only spec); `tests/auth/site-api.spec.ts` covers the contract IDs above.

## F3 — Site and access management (admin)

**Goal.** Admins create, rename, and delete sites and assign editors and viewers per site without editing the database.

**Depends on.** F1 (accounts exist), F2 (site API).

- [x] F3-1 Migration: `slug_redirects (from_slug primary key, site_id, created_at)` and a `create_site`, `rename_site`, `delete_site` RPC that checks `site_admins`.
- [x] F3-2 Create a site from a template (`ADMIN-1`). Seed `draft_config` with the template's default regions and an empty block list.
- [x] F3-3 Rename a slug and keep a redirect from the old slug (`ADMIN-2`). The landing build emits a redirect page or CDN rule for each row in `slug_redirects` (`PUB-4`). Done as a static redirect page; a CloudFront 301 belongs to F5.
- [x] F3-4 Delete a site (`ADMIN-3`). Require the slug in the request body as confirmation.
- [x] F3-5 List, assign, change, and remove members (`MEM-1`…`MEM-3`). Look users up by email.
- [x] F3-6 Dashboard screens: site list actions for admins, a members dialog, a rename dialog with a warning about the Linktree banner URL. Built as panels on an admin-only "Quản trị" tab.
- [x] F3-7 HTTP tests for every ID above, including non-admin `403` and the cases in the contract.
- [x] F3-8 Self-service sites (AD-12): any signed-in user creates up to 3 sites from a template and owns them (edit, publish, rename, delete, members). A user with no sites gets the create form. Migration `20261124000000_site_owners.sql`, not applied to hosted yet. `OWN-1` tests.

**Verification.** `pnpm test:auth` (2026-11-22, isolated local Supabase) → 56 passed, 1 skipped (mock-only spec); `tests/auth/site-api.spec.ts` covers the contract IDs above.

## F4 — Media uploads

**Goal.** Marketing uploads avatars and thumbnails from the editor instead of pasting URLs.

**Depends on.** F1.

- [x] F4-1 Create a public Supabase Storage bucket `media` with a size limit and an image MIME allow-list. Writes happen only through the dashboard with the secret key.
- [x] F4-2 Upload endpoint (`MEDIA-1`): validate type and size, store under `sites/{slug}/{uuid}.{ext}`, return the public URL.
- [x] F4-3 Convert uploads to WebP on the server, or record this as a follow-up if it adds too much weight.
- [ ] F4-4 Editor: an upload control on the image fields (avatar, thumbnail, cover) using shadcn primitives. Avatar and cover are done (`components/workspace/image-field.tsx`); block thumbnails have no editor field yet.
- [x] F4-5 HTTP tests for `MEDIA-1`.

**Verification.** `pnpm test:auth` (2026-11-22, isolated local Supabase) → 56 passed, 1 skipped (mock-only spec); `tests/auth/site-api.spec.ts` covers the contract IDs above.

## F5 — Build and deploy pipeline

**Goal.** Publishing a site updates the CDN within minutes, with no backend in the request path for visitors.

**Depends on.** F2. Needs AWS access (S3, CloudFront) and a CI runner.

- [x] F5-1 Migration `20261123000000_builds.sql` adds the `builds` queue and its RPCs. Applied to hosted Supabase and verified with `latest_site_build` returning HTTP 200.
- [x] F5-2 After a successful publish, restore, rename, or delete, queue a build and call the build hook (`BUILD-1`). A failed hook call leaves the build `queued` and preserves the successful site response.
- [ ] F5-3 Build job: run `pnpm build:landing`, sync `dist/client/` to S3, and invalidate CloudFront. `.github/workflows/landing.yml` uses repository secrets for the deploy IAM user on the AWS Free plan. The existing bucket, distribution, and slug routing passed manual checks. The first CI run still needs the workflow on GitHub and the public dashboard callbacks. See [landing deploy setup](../README.md#landing-deploy).
- [x] F5-4 Build job reports progress to the dashboard (`BUILD-2`), plus `POST /api/internal/builds/cron` for the scheduled full build.
- [ ] F5-5 Build status endpoint and a status badge in the editor (`BUILD-3`, `BUILD-4`).
- [ ] F5-6 Cache headers: long TTL for HTML and assets with invalidation, about 5 minutes for `/{slug}.json` (`PUB-1`, `PUB-2`). Set by the workflow's two `s3 sync` passes; not run yet.
- [ ] F5-7 Scheduled rebuild (cron) as the fallback when no webhook fires (`BUILD-1` with `reason: "cron"`). Hourly schedule in the workflow; not run yet.
- [ ] F5-8 Measure a full build for 100 slugs. Build only changed slugs (compare `updatedAt`) if a full build is too slow.

**Verification.** `DOCKER_CONTEXT=orbstack PLAYWRIGHT_CHANNEL=chrome pnpm test:auth` built the dashboard and passed 57 tests with one mock-only test skipped. The `BUILD-1` test initially failed because no job was queued. It now verifies publish, full-config publish, restore, rename, and delete, including coalescing without a duplicate dispatch and preserving a queued job on a simulated GitHub `503`. `pnpm lint`, `pnpm format:check`, and `actionlint` passed. The first CI run remains pending.

## F6 — Products, collections, affiliate links

**Goal.** Marketing pastes a product link, gets its name, image, and price, and groups products into collections used by `shop` blocks.

**Depends on.** F1, F5 (products are embedded into pages at build time). The workspace stores its catalog in the site config. Older shop blocks resolve their collections from `packages/templates/products.json`.

- [ ] F6-1 Migration: `products` and `collections` tables matching `ProductSchema` and `ProductDbSchema`. Move the fixture into `seed.sql`.
- [ ] F6-2 Metadata lookup (`PROD-1`): read JSON-LD, then Open Graph, then `<title>`. Block private and loopback addresses, cap response size and time.
- [ ] F6-3 Affiliate URL generation per network (`PROD-1`). Start with UTM tagging; add network APIs once the affiliate accounts are confirmed.
- [ ] F6-4 Product CRUD (`PROD-2`…`PROD-5`).
- [ ] F6-5 Collection CRUD with a 20-item limit (`COLL-1`…`COLL-4`).
- [ ] F6-6 Landing build reads products and collections from Supabase instead of the fixture.
- [ ] F6-7 Changing a product or collection queues a build for every site whose `shop` block uses it (`BUILD-1` with `reason: "products"`).
- [ ] F6-8 Dashboard Products page: paste link, edit fallback form, collections editor.
- [ ] F6-9 HTTP tests for every ID above.

**Verification.** —

## F7 — Click tracking and analytics

**Goal.** Know which page and which block gets traffic, and feed clicks back into ranking.

**Depends on.** F5 (the endpoint URL is baked into the build as `PUBLIC_BEACON_URL`). The runtime already sends click beacons and GA4 events.

- [ ] F7-1 Migration: `events (id, slug, type, block_id, position, url, ts, received_at)` with an index on `(slug, received_at)`, plus a daily rollup table or view.
- [ ] F7-2 Public event endpoint (`EVT-1`): accept `text/plain` JSON from `sendBeacon`, validate, rate-limit, store.
- [ ] F7-3 Runtime: send one `view` event per page load (`EVT-1`). Keep the Closure externs in sync.
- [ ] F7-4 Analytics read endpoint (`ANA-1`): views, clicks, and CTR per block for a date range.
- [x] F7-5 Dashboard analytics panel per site. Home displays daily views, clicks, and click rate over 7 or 30 days.
- [ ] F7-6 Add the GA4 measurement ID and UTM parameters to the build config and document them in the README.
- [ ] F7-7 HTTP tests for `EVT-1` and `ANA-1`.

**Verification.** —

## F8 — Subscribe endpoint

**Goal.** Visitors leave an email on a static page, tagged with the slug.

**Depends on.** F5 (`PUBLIC_SUBSCRIBE_URL`). The `subscribe` block and runtime form already exist.

- [ ] F8-1 Migration: `subscribers (id, slug, email, created_at, confirmed_at)` with a unique `(slug, lower(email))`.
- [ ] F8-2 Public subscribe endpoint (`SUB-1`): honeypot field, rate limit per IP, CORS for the landing origin, generic response for duplicates.
- [ ] F8-3 Runtime: send the honeypot field (`SUB-1`).
- [ ] F8-4 Subscriber list and CSV export for the site's editors and admins (`SUB-2`).
- [ ] F8-5 Decide on double opt-in and the consent text (open question in plan.html §12).
- [ ] F8-6 HTTP tests for `SUB-1` and `SUB-2`.

**Verification.** —

## F9 — Viral ranking automation (n8n)

**Goal.** A post that starts gaining views moves up automatically, without manual edits.

**Depends on.** F5 (rebuild), F7 (click data). Client-side ranking by `pinned → score → publishedAt` already works.

- [ ] F9-1 Migration: `block_scores (site_id, block_id, score, published_at, updated_at)`. Scores live outside `draft_config` so automation does not create versions or overwrite drafts.
- [ ] F9-2 Score ingestion endpoint for n8n (`SCORE-1`).
- [ ] F9-3 Landing build merges `block_scores` into each site before ranking, so `/{slug}.json` reflects the latest scores.
- [ ] F9-4 n8n workflow: pull post stats on a schedule, compute view growth rate, call `SCORE-1`.
- [ ] F9-5 Add click-through rate from F7 to the score formula. Document the formula next to the workflow.
- [ ] F9-6 Show the current score and its source next to each block in the editor (read from `SITE-2` extras or `SCORE-2`).
- [ ] F9-7 HTTP tests for `SCORE-1` and `SCORE-2`.

**Verification.** —

## F10 — Quality: smoke tests, Closure checks, devices

**Goal.** Catch broken pages before visitors do.

**Depends on.** F5.

- [ ] F10-1 Playwright smoke test per slug against the built `dist/client/`: page loads, no console errors, every block renders, links work.
- [ ] F10-2 Run the runtime tests against the compiled `runtime.js`, not the source.
- [ ] F10-3 Performance budget: client JS under 50 KB, check image formats and lazy loading.
- [ ] F10-4 Manual test on the Facebook, TikTok, and Instagram in-app browsers: video autoplay, external links, subscribe form.
- [ ] F10-5 Run lint, format check, builds, and all test suites in CI on every pull request.

**Verification.** —

## Open questions

Carry these from plan.html §10 and §12. Record the answer here and update the affected tasks.

- Does each slug map to exactly one social page, or can one page have several slugs for A/B tests?
- Where does the viral score come from: platform APIs, our click data, or both? (F9)
- Who holds the affiliate IDs for each network, and is 20 products per collection the right limit? (F6)
- Is a single banner linking out of Linktree allowed by its terms?
- Double opt-in for subscribers, and where the list ends up (DB, Google Sheet, email tool)? (F8)
