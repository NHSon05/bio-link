# Project summary

A snapshot of where Bio Link stands. Update it at the end of every finished task (see [Keeping this file current](#keeping-this-file-current)). The architecture is defined in [ARCHITECTURE.md](ARCHITECTURE.md), the work breakdown in [plan.md](plan.md), and API behavior in [API_CONTRACT.md](API_CONTRACT.md).

**Last updated:** 2026-11-22 · **Branch:** `main` · **Latest commit:** `400fe9b`

## What it is

A link-in-bio system for many Facebook, TikTok, and Instagram pages. Linktree stays as the trusted entry point and links to our own static landing page per page (`/{slug}`). Marketing edits each page in a dashboard; viral content moves up automatically.

## Stack

| Part            | Technology                                                                      |
| --------------- | ------------------------------------------------------------------------------- |
| Dashboard       | Next.js 16 (App Router), React, shadcn/ui, Tailwind, Zod 4, `@supabase/ssr`     |
| Landing         | Astro (static output) + `@astrojs/node` for the internal `/preview` route       |
| Client runtime  | Vanilla JS compiled by Closure Compiler ADVANCED                                |
| Shared packages | `@bio-link/schema` (Zod), `@bio-link/templates` (manifests), `packages/runtime` |
| Data and auth   | Supabase (Postgres with RLS, Auth with password and Google)                     |
| Tests           | Playwright (dashboard auth suite with an isolated Supabase stack and Mailpit)   |
| Tooling         | pnpm workspace, ESLint, Prettier; Claude Code subagents in `.claude/agents/`    |
| Planned hosting | S3 + CloudFront for landing; dashboard host to be decided; n8n for automation   |

## Project structure

Generated folders (`node_modules`, `.next`, `dist`, `.astro`) and local `.env` files are omitted.

```text
bio-link/
├── AGENTS.md                      # Shared agent guide: architecture, commands, conventions
├── CLAUDE.md                      # Imports AGENTS.md + subagent orchestration rules
├── README.md                      # Setup, Supabase, auth, dashboard API
├── package.json                   # Root scripts: dev, build, lint, format, test:auth
├── pnpm-workspace.yaml            # Workspaces: apps/*, packages/*
├── .prettierrc.json               # Prettier (width 120, Astro + Tailwind plugins)
├── .claude/                       # Claude Code config (git-ignored)
│   ├── settings.json              # Allowed commands, denied .env reads
│   ├── agents/                    # 8 project subagents + mcp-manager
│   ├── commands/                  # Slash commands
│   └── skills/                    # Skill toolkit
├── apps/
│   ├── dashboard/                 # Next.js 16 editor (localhost:3000)
│   │   ├── AGENTS.md              # Next.js 16 notes + shadcn/ui rules
│   │   ├── proxy.ts               # Session refresh, redirect guests to /login
│   │   ├── app/
│   │   │   ├── page.tsx           # Site list + editor
│   │   │   ├── login/             # Password + Google sign-in
│   │   │   ├── register/          # Signup (auth phase 3)
│   │   │   ├── forgot-password/   # Recovery request (auth phase 5)
│   │   │   ├── auth/
│   │   │   │   ├── callback/      # Google OAuth code exchange
│   │   │   │   └── confirm/       # Email token verification
│   │   │   └── api/sites/         # SITE-1…5, VER-1…2
│   │   │       ├── route.ts
│   │   │       └── [slug]/
│   │   │           ├── route.ts
│   │   │           └── versions/route.ts
│   │   ├── components/
│   │   │   ├── Editor.tsx         # Draft editing, preview iframe, publish, history
│   │   │   ├── AuthCard.tsx       # Shared auth screen layout
│   │   │   ├── panel.tsx · segmented.tsx · topbar.tsx · device-frame.tsx
│   │   │   └── ui/                # shadcn/ui registry components only
│   │   ├── lib/
│   │   │   ├── auth.ts            # Supabase env, session client, callback path
│   │   │   ├── authForm.ts        # Auth form validation
│   │   │   ├── supabase.ts        # siteResponse, SiteApiError, origin check
│   │   │   ├── store.ts           # Site/version queries, save_site RPC
│   │   │   └── siteRequest.ts     # Client fetch wrapper
│   │   ├── styles/                # tokens.css, theme.css
│   │   ├── tests/auth/            # Playwright auth suite + run.mjs (isolated Supabase)
│   │   └── playwright.config.ts
│   └── landing/                   # Astro public pages (localhost:4321)
│       ├── astro.config.mjs       # Static output + Node adapter for /preview
│       └── src/
│           ├── pages/
│           │   ├── [slug].astro   # Public page per slug (PUB-1)
│           │   ├── [slug].json.ts # Ranking order (PUB-2)
│           │   ├── preview.astro  # Internal draft preview (PREV-1)
│           │   └── index.astro    # Dev hub listing slugs
│           ├── layouts/SitePage.astro
│           ├── components/
│           │   ├── BlockRenderer.astro   # Picks a block component by type
│           │   ├── ProfileHeader.astro · Section.astro · Dock.astro · ProductTile.astro
│           │   ├── Button · Chip · PhoneFrame · Topbar · BrandMark · Round · Icon · TLink
│           │   ├── blocks/        # Banner, Card, Carousel, Events, HeroVideo, LinkButton,
│           │   │                  # Products, Release, Shop, Subscribe, VideoSlider
│           │   └── hub/SiteHub.astro
│           ├── lib/               # data.ts (Supabase or fixtures), icons.ts
│           ├── content/           # Fixtures: sites/*.json (4)
│           └── styles/            # page.css (.lb-*), hub.css
├── packages/
│   ├── schema/                    # @bio-link/schema — Zod site/block/template schema, sortBlocks
│   ├── templates/                 # @bio-link/templates — classic, video-first, shop-grid
│   └── runtime/                   # Vanilla JS → Closure ADVANCED → landing/public/runtime.js
│       ├── build.mjs
│       └── src/                   # runtime.js, externs.js
├── supabase/
│   ├── config.toml
│   ├── migrations/                # 20261120030000_site_backend.sql
│   └── seed.sql                   # Four sample sites
└── docs/
    ├── plan.html                  # Original system design (Vietnamese)
    ├── plan.md                    # Features F0–F10 and tasks
    ├── API_CONTRACT.md            # Endpoint contract by ID
    ├── ARCHITECTURE.md            # Components, flows, decisions AD-1…AD-10
    ├── AGENT_WORKFLOW.md          # Agent ownership, delegation, handoffs
    ├── project_summary.md         # This file
    └── auth/                      # AUTH_PLAN, AUTH_CONTRACT, AUTH_TASK
```

## Feature status

| ID  | Feature                                   | Status        | Notes                                                                                                                                                             |
| --- | ----------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F0  | Monorepo, schema, templates, runtime      | Done          | `sitemap.xml` (F0-7) still open                                                                                                                                   |
| F1  | Dashboard auth                            | In progress   | Auth phases 0–3 done (login, public routes, registration); phase 4 (email confirmation) started — `email-confirm.spec.ts` added, `/auth/confirm` is a placeholder |
| F2  | Editor: draft, publish, versions, preview | Done          | Contract tests, `ME-1`, publisher emails in history; `SITE-5` kept for atomic publish                                                                             |
| F3  | Site and access management                | Done          | Admin tab: create, rename (with redirect page), delete, members. Build side effects wait for F5                                                                   |
| F4  | Media uploads                             | Mostly done   | Upload → WebP in the `media` bucket; avatar and cover fields. Block thumbnails have no field yet                                                                  |
| F5  | Build and deploy pipeline                 | Mostly done   | Publish → GitHub Actions → S3/CloudFront works; editor shows CDN status and "Build lại". Hourly cron not yet firing (F5-7); 100-slug timing (F5-8) open           |
| F6  | Products and affiliate links              | Per-site CRUD | Site drafts and published configs hold the catalog. Legacy shop blocks use `packages/templates/products.json`.                                                    |
| F7  | Click tracking and analytics              | Daily totals  | The public runtime records views and tracked clicks. Home shows daily totals and click rate for the selected site.                                                |
| F8  | Subscribe endpoint                        | Client only   | Form posts to `PUBLIC_SUBSCRIBE_URL` when set                                                                                                                     |
| F9  | Viral ranking automation                  | Ranking only  | `sortBlocks` and client reordering work; no score ingestion                                                                                                       |
| F10 | Quality and device testing                | Not started   |                                                                                                                                                                   |

## API status

| Contract IDs                                                                                    | Status                                                |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `SITE-1`…`SITE-5`, `VER-1`, `VER-2`, `ME-1`, `ADMIN-1`…`ADMIN-3`, `MEM-1`…`MEM-3`, `MEDIA-1`    | Implemented, covered by `tests/auth/site-api.spec.ts` |
| `PREV-1`, `PUB-4` (static redirect page)                                                        | Implemented                                           |
| `PUB-1`, `PUB-2`                                                                                | Built by Astro; CDN headers Planned                   |
| All other IDs (`BUILD`, `PUB-3`, `PUB-4` CDN 301, `PROD`, `COLL`, `EVT`, `ANA`, `SUB`, `SCORE`) | Proposed                                              |

## Database

Three migrations: `20261120030000_site_backend.sql` (`sites`, `site_admins`, `site_members`, `site_versions`, `save_site`), `20261120110000_site_traffic.sql` (daily traffic), and `20261122000000_site_admin.sql` (`slug_redirects`, admin and member RPCs, the `media` storage bucket). Storage is enabled in `config.toml`. `seed.sql` loads four sample sites.

## Tests and checks

| Check              | Command             | Last known result                                                                           |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------------- |
| Auth and API suite | `pnpm test:auth`    | 2026-11-22: 56 passed, 1 skipped (mock-only spec; passes with `WORKSPACE_DATA_SOURCE=mock`) |
| Lint               | `pnpm lint`         | 2026-11-22: clean                                                                           |
| Format             | `pnpm format:check` | Docs pass                                                                                   |
| Build              | `pnpm build`        | Not recorded                                                                                |

## Next steps

1. Finish F1 auth phases 4–11 (`docs/auth/AUTH_TASK.md`).
2. F4-4 block thumbnails.
3. Apply `20261122000000_site_admin.sql` to the hosted project and enable Storage there (needs approval).
4. F5: build hook, CI job, S3/CloudFront deploy — needs AWS access and a dashboard host decision.

## Open questions

- Dashboard hosting target (needed for F5).
- One slug per social page, or several for A/B tests?
- Viral score source: platform APIs, our clicks, or both?
- Affiliate account ownership and the 20-products-per-collection limit.
- Double opt-in and the destination for subscriber emails.
- Should `.claude/agents/` be tracked in git? `.gitignore` currently excludes all of `.claude/`.

## Change log

Newest first. One line per finished task: date, task IDs, what changed, how it was verified.

- 2026-11-23 — F3-9 (AD-13): per-user namespaces. Public URLs and API paths are `/{username}/{slug}`; new `ME-2` claims a one-time username; landing routes are `[...slug].astro` and `[namespace]/[slug].json.ts`; old sites and fixtures move to `admin/…` with redirects. Migration `20261125000000_user_namespaces.sql` (local only). Verified with full `pnpm test:auth` (61 passed, 1 skipped), `tsc`, `pnpm lint`, `pnpm format:check`, landing and dashboard builds.
- 2026-11-23 — F5-5 (and F5-3, F5-6 ticked from live runs): `GET /api/sites/{slug}/builds/latest` (adds `publishedUpdatedAt`) and `POST /api/builds` for admins and owners; CDN badge with "Build lại" in the editor footer. F5-7: cron moved to `23 * * * *` to re-register the schedule. Verified with full `pnpm test:auth` (60 passed, 1 skipped), `tsc`, `pnpm lint`.
- 2026-11-23 — F3-8 (AD-12): self-service sites. Any signed-in user creates up to 3 sites and is their `owner` (edit, publish, rename, delete, members); new users see a create form instead of "waiting for access"; the admin tab is now "Quản lý trang". Migration `20261124000000_site_owners.sql` (local only). Verified with full `pnpm test:auth` (59 passed, 1 skipped), `tsc`, `pnpm lint`.
- 2026-11-23 — F5-3, F5-6, F5-7 (workflow written, CI run pending): `.github/workflows/landing.yml` claims the build, builds, syncs to S3, invalidates CloudFront, and reports back. `actionlint` passed. Manual deployment returned HTTP 200 for `/`, `/beat-artist`, `/beat-artist/`, `/beat-artist.json`, and `/runtime.js`. The bucket, distribution, and slug rewrite are ready. Remaining CI setup is in README.
- 2026-11-23 — F5-1, F5-4: `builds` migration; `POST /api/internal/builds/{id}` and `/cron` for the build job, bearer `BUILD_CALLBACK_TOKEN` only, starting a build absorbs older queued ones. Verified with `pnpm test:auth site-api` (16 passed), `tsc`, `pnpm lint`.
- 2026-11-23 — Applied the `builds` migration to hosted Supabase and verified `latest_site_build` returned HTTP 200. Configured the GitHub repository for the AWS Free plan deploy credentials and verified the workflow with `actionlint`. The first CI run still needs a public dashboard with the callback routes.
- 2026-11-23 — F2-10, F2-11: `VER-1` items include `published_by_email`; `SITE-5` (`PUT`) kept and no longer deprecated because the editor publishes with it atomically. Verified with `pnpm test:auth site-api` (14 passed), `tsc`, `pnpm lint`.
- 2026-11-22 — F2-8, F2-9, F3-1…F3-7, F4-1…F4-3, F4-5 (F4-4 partly): `GET /api/me`, admin site and member APIs with `slug_redirects`, static redirect pages in the landing build, `media` uploads converted to WebP, admin tab and avatar/cover upload in the editor; malformed JSON now returns `400` per contract. Verified with `pnpm test:auth` (56 passed, 1 skipped), mock spec, `pnpm lint`, and code-reviewer approval.

- 2026-11-20 — Docs: compacted README (about half the length; details now link to docs). Verified with `pnpm format:check`.
- 2026-11-20 — Docs: README and this summary updated for auth phase 3 (registration done, local sign-ups still off, four auth specs, `pnpm dev:landing`). Verified with `pnpm format:check`.
- 2026-11-20 — Docs: README gains overview, repository table, docs index, quick start, env vars, status, and Claude Code section. Verified with `pnpm format:check`.
- 2026-11-20 — Docs: added a project structure tree to this summary.
- 2026-11-20 — Docs: added `ARCHITECTURE.md` and this summary; removed stale `packages/ui` references from the plan and agent docs. Verified with `pnpm format:check` on `docs/`.
- 2026-11-20 — Tooling: eight Claude Code subagents, `docs/AGENT_WORKFLOW.md`, orchestration section in `CLAUDE.md`.
- 2026-11-20 — Docs: `plan.md` feature breakdown and `API_CONTRACT.md`.

## Keeping this file current

When a task is finished and verified, the orchestrator (or the agent that finished it) updates this file in the same change:

1. Update **Project structure** when folders or key files are added, moved, or removed.
1. Update the feature row in **Feature status** and, for API work, the **API status** row.
1. Update **Database** when a migration was added, and **Tests and checks** with the command and its real result.
1. Add one line to the top of **Change log**.
1. Update **Last updated** and **Latest commit** (after committing, if a commit was made).
1. Remove answered items from **Open questions** and refresh **Next steps**.

Keep it a summary: link to `plan.md`, the contract, or the code instead of copying details. If the architecture changed, update [ARCHITECTURE.md](ARCHITECTURE.md) too.
