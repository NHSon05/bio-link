# Bio Link — agent guide

Shared instructions for coding agents (Codex reads this file; `CLAUDE.md` imports it for Claude Code). App-specific rules live in `apps/*/AGENTS.md` — read them before editing that app. Setup, Supabase, auth, and the dashboard API are documented in `README.md`.

## Architecture

pnpm monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).

- `apps/dashboard` — Next.js 16 (App Router) editor. Saves drafts, publishes, and keeps version history in Supabase. API routes under `app/api/sites`; auth/session refresh in `proxy.ts`; Supabase access in `lib/`.
- `apps/landing` — Astro. Reads published site configs at build time and emits static HTML + ranking JSON to `dist/client/`. `src/pages/[...slug].astro` renders public pages at `/{username}/{slug}` (plus redirect pages); `preview.astro` is the internal server-side preview used by the dashboard.
- `packages/schema` (`@bio-link/schema`) — Zod schema for site JSON (themes, regions, block types, layouts). Shared source of truth for both apps; change it first when adding a block type or field.
- `packages/templates` (`@bio-link/templates`) — template manifests (`<id>/template.json`), registered in `index.ts`.
- Design systems are per app. The dashboard follows the [shadcn/ui component rules](apps/dashboard/AGENTS.md#dashboard-ui-components) and uses tokens from `apps/dashboard/styles/tokens.css` and `theme.css`. Landing uses its own CSS in `src/styles/page.css` and `hub.css` with `--lb-*` variables under `.lb-root`.
- `packages/runtime` — vanilla JS compiled with Closure Compiler (ADVANCED) into `apps/landing/public/runtime.js` (generated, git-ignored). Keep `src/externs.js` in sync with any external names the runtime uses.
- `supabase/` — config, migrations, and `seed.sql` (four sample sites). Add schema changes as new timestamped files in `supabase/migrations/`; never edit an applied migration.

## Dashboard auth workflow

For changes to dashboard login, registration, email verification, password recovery, Google OAuth, sessions, or site access after login, read these files before editing code.

1. [AUTH_PLAN.md](docs/auth/AUTH_PLAN.md) defines the scope, approach, and dependencies.
2. [AUTH_CONTRACT.md](docs/auth/AUTH_CONTRACT.md) defines the observable behavior. Use its IDs to map changes to tests.
3. [AUTH_TASK.md](docs/auth/AUTH_TASK.md) defines the execution order, TDD steps, and exit checks. Start with the requested phase or the first incomplete phase whose dependencies are ready.

Follow red, green, and refactor for each behavior. Record the verification command and result in the checklist before marking a phase complete. Record blockers next to the affected check and continue any independent work in scope. If the requested behavior changes, update the relevant contract and checklist entries before implementing it. Apply the dashboard's [component rules](apps/dashboard/AGENTS.md#dashboard-ui-components) to every auth screen.

## Commands

Run from the repo root:

- `pnpm install`
- `pnpm dev:dashboard` — dashboard on localhost:3000
- `pnpm --filter landing exec astro dev --background` — Astro preview (stop with `astro dev stop`)
- `pnpm build` — runtime + landing + dashboard; `pnpm build:landing` / `pnpm build:dashboard` individually
- `pnpm lint` / `pnpm lint:fix` — ESLint in both apps
- `pnpm format` / `pnpm format:check` — Prettier (print width 120, Astro + Tailwind plugins)

Run `pnpm test:auth` for the dashboard auth browser and HTTP tests. Verify changes with `pnpm lint`, `pnpm format:check`, and the relevant build.

## Conventions

- Landing pages are `.astro` only and style with `page.css` classes (`.lb-*`); don't add Tailwind or framework components there. Reuse the shared Astro components in `apps/landing/src/components/` (`Button`, `Chip`, `PhoneFrame`, `Topbar`, `BrandMark`, `Round`, `Icon`, `TLink`) before writing new markup; their styles live in `page.css`, not in `<style>` blocks.
- Code comments and UI copy are in Vietnamese; match the surrounding language.
- Never commit `.env*` files (only `.env.example`). Keep `SUPABASE_SECRET_KEY` in server/build environments only — never in `NEXT_PUBLIC_*` vars or client code.
- Astro can build from the checked-in fixtures in `apps/landing/src/content/` when Supabase variables are unset.
