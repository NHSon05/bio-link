# Bio Link — agent guide

Shared instructions for coding agents (Codex reads this file; `CLAUDE.md` imports it for Claude Code). App-specific rules live in `apps/*/AGENTS.md` — read them before editing that app. Setup, Supabase, auth, and the dashboard API are documented in `README.md`.

## Architecture

pnpm monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).

- `apps/dashboard` — Next.js 16 (App Router) editor. Saves drafts, publishes, and keeps version history in Supabase. API routes under `app/api/sites`; auth/session refresh in `proxy.ts`; Supabase access in `lib/`.
- `apps/landing` — Astro. Reads published site configs at build time and emits static HTML + ranking JSON to `dist/client/`. `src/pages/[slug].astro` renders public pages; `preview.astro` is the internal server-side preview used by the dashboard.
- `packages/schema` (`@bio-link/schema`) — Zod schema for site JSON (themes, regions, block types, layouts). Shared source of truth for both apps; change it first when adding a block type or field.
- `packages/templates` (`@bio-link/templates`) — template manifests (`<id>/template.json`), registered in `index.ts`.
- `packages/ui` (`@bio-link/ui`) — shadcn/ui components and theme for landing's internal pages only (badge, button, card, device-frame, topbar). Add components with `pnpm dlx shadcn@latest add <name>` from `packages/ui` or `apps/landing`; they land in `packages/ui/src/components`.
- `apps/dashboard` does not depend on `@bio-link/ui`. It is its own shadcn project: components live in `apps/dashboard/components/ui` (`shadcn add` run there writes to it), and its design tokens (color, text, font, border) live in `apps/dashboard/styles/tokens.css` and `theme.css`. Landing must not import them.
- `packages/runtime` — vanilla JS compiled with Closure Compiler (ADVANCED) into `apps/landing/public/runtime.js` (generated, git-ignored). Keep `src/externs.js` in sync with any external names the runtime uses.
- `supabase/` — config, migrations, and `seed.sql` (four sample sites). Add schema changes as new timestamped files in `supabase/migrations/`; never edit an applied migration.

## Commands

Run from the repo root:

- `pnpm install`
- `pnpm dev:dashboard` — dashboard on localhost:3000
- `pnpm --filter landing exec astro dev --background` — Astro preview (stop with `astro dev stop`)
- `pnpm build` — runtime + landing + dashboard; `pnpm build:landing` / `pnpm build:dashboard` individually
- `pnpm lint` / `pnpm lint:fix` — ESLint in both apps
- `pnpm format` / `pnpm format:check` — Prettier (print width 120, Astro + Tailwind plugins)
- `pnpm --filter @bio-link/ui typecheck`

There is no test suite yet. Verify changes with `pnpm lint`, `pnpm format:check`, and the relevant build.

## Conventions

- Public link pages use `page.css` without Tailwind; only internal Astro pages that import `src/styles/ui.css` use `@bio-link/ui` components. Pass data to UI components as props from a `.tsx` wrapper, and add `client:*` only for interactive ones.
- Code comments and UI copy are in Vietnamese; match the surrounding language.
- Never commit `.env*` files (only `.env.example`). Keep `SUPABASE_SECRET_KEY` in server/build environments only — never in `NEXT_PUBLIC_*` vars or client code.
- Astro can build from the checked-in fixtures in `apps/landing/src/content/` when Supabase variables are unset.
