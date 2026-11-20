# Project summary

A snapshot of where Bio Link stands. Update it at the end of every finished task (see [Keeping this file current](#keeping-this-file-current)). The architecture is defined in [ARCHITECTURE.md](ARCHITECTURE.md), the work breakdown in [plan.md](plan.md), and API behavior in [API_CONTRACT.md](API_CONTRACT.md).

**Last updated:** 2026-11-20 · **Branch:** `main` · **Latest commit:** `400fe9b`

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
│           ├── content/           # Fixtures: sites/*.json (4), products.json
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

| ID  | Feature                                   | Status       | Notes                                                                                                                                                             |
| --- | ----------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F0  | Monorepo, schema, templates, runtime      | Done         | `sitemap.xml` (F0-7) still open                                                                                                                                   |
| F1  | Dashboard auth                            | In progress  | Auth phases 0–3 done (login, public routes, registration); phase 4 (email confirmation) started — `email-confirm.spec.ts` added, `/auth/confirm` is a placeholder |
| F2  | Editor: draft, publish, versions, preview | Mostly done  | Missing: contract tests, `ME-1`, author emails in history                                                                                                         |
| F3  | Site and access management                | Not started  |                                                                                                                                                                   |
| F4  | Media uploads                             | Not started  |                                                                                                                                                                   |
| F5  | Build and deploy pipeline                 | Not started  | Local builds work; no CI or AWS deploy                                                                                                                            |
| F6  | Products and affiliate links              | Fixture only | `apps/landing/src/content/products.json`                                                                                                                          |
| F7  | Click tracking and analytics              | Client only  | Runtime sends GA4 events and beacons when `PUBLIC_BEACON_URL` is set                                                                                              |
| F8  | Subscribe endpoint                        | Client only  | Form posts to `PUBLIC_SUBSCRIBE_URL` when set                                                                                                                     |
| F9  | Viral ranking automation                  | Ranking only | `sortBlocks` and client reordering work; no score ingestion                                                                                                       |
| F10 | Quality and device testing                | Not started  |                                                                                                                                                                   |

## API status

| Contract IDs                                                                                                    | Status                                         |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `SITE-1`…`SITE-5`, `VER-1`, `VER-2`, `PREV-1`                                                                   | Implemented, not yet covered by contract tests |
| `PUB-1`, `PUB-2`                                                                                                | Built by Astro; CDN headers Planned            |
| All other IDs (`ME`, `ADMIN`, `MEM`, `MEDIA`, `BUILD`, `PUB-3/4`, `PROD`, `COLL`, `EVT`, `ANA`, `SUB`, `SCORE`) | Proposed                                       |

## Database

One migration, `20261120030000_site_backend.sql`: `sites`, `site_admins`, `site_members`, `site_versions`, and the `save_site` RPC. `seed.sql` loads four sample sites.

## Tests and checks

| Check                            | Command             | Last known result                                                                           |
| -------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| Auth suite (20 tests in 4 specs) | `pnpm test:auth`    | 17 passing at the end of phase 3 (`docs/auth/AUTH_TASK.md`); phase 4 tests not yet recorded |
| Lint                             | `pnpm lint`         | Not recorded                                                                                |
| Format                           | `pnpm format:check` | Docs pass                                                                                   |
| Build                            | `pnpm build`        | Not recorded                                                                                |

## Next steps

1. Finish F1 auth phases 4–11 (`docs/auth/AUTH_TASK.md`).
2. F2-8: contract tests for the implemented site and version endpoints.
3. F3 and F4 in parallel (admin site management, media uploads).
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
