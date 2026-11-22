# Bio Link

Link-in-bio pages for many Facebook, TikTok, and Instagram pages. Linktree links to our own static page per social page (`/{slug}`). Marketing edits pages in a Next.js dashboard backed by Supabase; Astro builds published configs into static HTML and ranking JSON, and a small Closure-compiled runtime reorders blocks from that JSON.

| Path                 | Contents                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/dashboard`     | Next.js 16 editor, auth, `/api/sites`                                                                                                                               |
| `apps/landing`       | Astro pages `/{slug}`, `/{slug}.json`, internal `/preview`                                                                                                          |
| `packages/schema`    | Zod schema for site JSON, shared by both apps                                                                                                                       |
| `packages/templates` | `classic`, `video-first`, `shop-grid` manifests                                                                                                                     |
| `packages/runtime`   | Vanilla JS → Closure Compiler → `apps/landing/public/runtime.js`                                                                                                    |
| `supabase`           | Config, migrations, `seed.sql` (four sample sites)                                                                                                                  |
| `docs`               | [Status](docs/project_summary.md), [architecture](docs/ARCHITECTURE.md), [plan](docs/plan.md), [API contract](docs/API_CONTRACT.md), [auth](docs/auth/AUTH_PLAN.md) |

## Commands

| Command                                   | What it does                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm install`                            | Install dependencies                                                           |
| `pnpm dev:dashboard` / `pnpm dev:landing` | Dev servers on localhost:3000 / localhost:4321                                 |
| `pnpm build`                              | Runtime, landing, and dashboard builds (or `build:landing`, `build:dashboard`) |
| `pnpm lint` / `pnpm format:check`         | ESLint and Prettier (`lint:fix`, `format` to fix)                              |
| `pnpm test:auth`                          | Dashboard auth suite (Docker)                                                  |

Without Supabase variables, the landing app builds the fixtures in `apps/landing/src/content/`.

## Environment

Copy each app's `.env.example` to `.env.local`; never commit other `.env*` files.

| Variable                                    | App       | Notes                                              |
| ------------------------------------------- | --------- | -------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`       | both      | Secret key in server/build only, never client code |
| `SUPABASE_PUBLISHABLE_KEY`                  | dashboard | Session key                                        |
| `DASHBOARD_URL`                             | dashboard | Origin for auth callbacks (default `:3000`)        |
| `NEXT_PUBLIC_LANDING_URL`                   | dashboard | Preview server origin                              |
| `DASHBOARD_ORIGIN`                          | landing   | Origin allowed to post drafts to `/preview`        |
| `PUBLIC_BEACON_URL`, `PUBLIC_SUBSCRIBE_URL` | landing   | Optional tracking and subscribe endpoints          |

## Local Supabase

Requires the Supabase CLI and Docker. From `bio-link/`:

```sh
docker network inspect bio-link-local >/dev/null 2>&1 || \
  docker network create -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 bio-link-local
supabase start --network-id bio-link-local
supabase status -o env   # API_URL, PUBLISHABLE_KEY, SECRET_KEY (older CLIs: ANON_KEY, SERVICE_ROLE_KEY)
```

This applies the migration and seeds four sites. In Studio ([localhost:54323](http://localhost:54323)), create and confirm a user under **Authentication → Users**, then grant access in the SQL Editor:

```sql
insert into public.site_admins (user_id) values ('<user-uuid>');           -- admin: all sites
insert into public.site_members (site_id, user_id, role)                   -- or editor/viewer per slug
select id, '<user-uuid>', 'editor' from public.sites where slug = 'fanpage-abc';
```

Sign-ups are off locally (`enable_signup = false`) until email confirmation ships, so create accounts in Studio. New accounts have no site access until assigned. Run `pnpm dev:dashboard` and `pnpm dev:landing`, sign in at [localhost:3000](http://localhost:3000), then use **Lưu nháp** to save and **Xuất bản** to publish. Run `pnpm build:landing` to regenerate pages after publishing.

## Auth tests

```sh
pnpm --filter dashboard exec playwright install chromium
pnpm test:auth                   # add --grep SIGNUP-1 for one behavior
```

The runner starts a temporary Supabase stack (sign-ups, email confirmation, Mailpit) and a dashboard build on port 55300, then cleans up. Set `PLAYWRIGHT_CHANNEL=chrome` or `DOCKER_CONTEXT=orbstack` if needed. Test names use the IDs in [AUTH_CONTRACT.md](docs/auth/AUTH_CONTRACT.md); progress is in [AUTH_TASK.md](docs/auth/AUTH_TASK.md).

## API

Endpoints, permissions, and status codes are defined in [docs/API_CONTRACT.md](docs/API_CONTRACT.md). Implemented today: `GET /api/me`, `GET|POST /api/sites`, `GET|PATCH|POST|PUT|DELETE /api/sites/{slug}`, `GET|POST /api/sites/{slug}/versions`, `POST /api/sites/{slug}/rename`, `GET|PUT /api/sites/{slug}/members`, `DELETE /api/sites/{slug}/members/{userId}`, `POST /api/sites/{slug}/media`. Media uploads need Supabase Storage (enabled in `supabase/config.toml`); the `media` bucket is created by migration. Authenticate with the dashboard session cookie (same-origin writes only) or `Authorization: Bearer <supabase-access-token>`.

## Design system

- **Dashboard:** shadcn/ui in `apps/dashboard/components/ui`, tokens in `styles/tokens.css` and `theme.css`. Follow the [component rules](apps/dashboard/AGENTS.md#dashboard-ui-components).
- **Landing:** plain CSS in `src/styles/page.css` (`--lb-*` under `.lb-root`), no Tailwind or React.

## Hosted Supabase

Run `supabase login`, `supabase link --project-ref <ref>`, and `supabase db push --remote` (add `--include-seed` for sample sites). Set the hosted URL and keys for the dashboard and the Astro build, and disable public sign-ups for an internal dashboard.

**Google sign-in:** create a Google **Web application** OAuth client with the dashboard origin and the Supabase callback (`https://<ref>.supabase.co/auth/v1/callback`), enter its ID and secret in **Supabase → Sign In / Providers → Google**, and under **URL Configuration** set the Site URL to the dashboard origin and allow `<dashboard>/auth/callback`. With sign-ups disabled, Google works only for existing users. See [Supabase's Google guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

## Claude Code

`CLAUDE.md` adds orchestration rules for the subagents in `.claude/agents/`; see [docs/AGENT_WORKFLOW.md](docs/AGENT_WORKFLOW.md). After each verified task, update `docs/plan.md` and `docs/project_summary.md`. `.claude/` is git-ignored.

## Signed-in workspace

Home shows traffic for the selected slug over 7 or 30 days (Vietnam time). Views count public page loads and clicks count tracked links. The click rate is clicks divided by views. The landing build sends anonymous daily counts to `/api/traffic` on `DASHBOARD_ORIGIN`. Set `NEXT_PUBLIC_LANDING_URL` to the landing origin and apply the `20261120110000_site_traffic.sql` migration to enable reporting.

Use **Link in bio** for the profile and social links, **Slug** for templates and layout, and **Sản phẩm affiliate** for the site's product catalog. Save a draft to keep edits, then publish and rebuild landing to update the static website. Draft previews use the Astro preview server. Website shows the published configuration and links to the public page.

The signed-in dashboard starts with a mock workspace containing the four demo slugs. Sample traffic, product collections, draft saves and publications use the mock API. Changes persist in the current browser for the signed-in account. Run the dashboard and Astro preview server together to see the mobile and desktop layouts. **Mở trang mẫu** opens the locally published snapshot.

Run `WORKSPACE_DATA_SOURCE=mock pnpm test:auth mock-workspace.spec.ts` to check the sample workspace. The default `pnpm test:auth` suite exercises the live API against a temporary local database.

When the live API has assigned sites and traffic data, set `WORKSPACE_DATA_SOURCE=live` in the dashboard environment and restart the dashboard. The live workspace uses the existing site APIs and access rules. To retire the mock in source, remove `apps/dashboard/mocks/` and the mock branch and import in `apps/dashboard/app/page.tsx`.
