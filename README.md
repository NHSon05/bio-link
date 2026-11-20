# Bio Link

The Next.js dashboard stores site drafts, published configurations, and version history in Supabase. Astro reads published configurations during its build and produces static HTML and ranking JSON under `apps/landing/dist/client/`.

## Local Supabase

Run these commands from `bio-link/` with pnpm, the Supabase CLI, and Docker running.

```sh
pnpm install
docker network inspect bio-link-local >/dev/null 2>&1 || \
  docker network create -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 bio-link-local
supabase start --network-id bio-link-local
supabase status -o env
```

The first start applies the SQL migration and seeds the four sample sites. Open Supabase Studio at [localhost:54323](http://localhost:54323). Copy each app's `.env.example` to `.env.local` and fill in the values from the CLI. Use `API_URL` for `SUPABASE_URL`, `PUBLISHABLE_KEY` for `SUPABASE_PUBLISHABLE_KEY`, and `SECRET_KEY` for `SUPABASE_SECRET_KEY`. Older CLI versions use `ANON_KEY` and `SERVICE_ROLE_KEY` for the two keys. Keep the secret key in server and build environments.

Create a user with an email and password under **Authentication → Users** in Studio. Confirm the user and copy their UUID. In the SQL Editor, grant the first administrator access.

```sql
insert into public.site_admins (user_id) values ('<user-uuid>');
```

Grant an editor or viewer access to a specific slug in the SQL Editor.

```sql
insert into public.site_members (site_id, user_id, role)
select id, '<user-uuid>', 'editor'
from public.sites
where slug = 'fanpage-abc';
```

Use `viewer` for read-only access. Admins can access every site. Manage users, site creation, and assignments in Studio. Public sign-ups are disabled by the local configuration.

Start the dashboard with `pnpm dev:dashboard` and the internal Astro preview with `pnpm --filter landing exec astro dev --background`. Open [localhost:3000](http://localhost:3000) and sign in with the account created in Studio. Use **Lưu nháp** to save a draft and **Xuất bản** to publish it.

## Dashboard API

To call the API directly, sign in with a Supabase Auth user, for example with `supabase.auth.signInWithPassword()`, and send the session's access token as `Authorization: Bearer <access-token>`.

| Method and path | Behavior |
| --- | --- |
| `GET /api/sites` | List sites available to the signed-in user. |
| `GET /api/sites/{slug}` | Read the current draft. |
| `PATCH /api/sites/{slug}` | Save a complete site JSON as a draft. |
| `POST /api/sites/{slug}` | Publish the current draft with an optional JSON body containing `note`. |
| `PUT /api/sites/{slug}` | Save and publish a complete site JSON in one request. |
| `GET /api/sites/{slug}/versions` | List up to 100 versions. Pass `?before=<id>` for older results. |
| `POST /api/sites/{slug}/versions` | Publish a previous snapshot as a new version. Send `versionId` and an optional `note`. |

Publish and rollback write the live snapshot and version history in one transaction. Run `pnpm build:landing` after publishing to regenerate HTML and ranking JSON. The server-side `/preview` route is for internal use. With both Supabase variables unset, Astro can also build the checked-in fixtures.

## Hosted Supabase

Create a project in Supabase, then run `supabase login`, `supabase link --project-ref <ref>`, and `supabase db push --remote` with CLI v3. The migration starts with an empty database. Add live sites in Studio or explicitly include the sample fixtures with `--include-seed`. Configure the dashboard runtime and Astro build environment with the hosted project URL and keys, and turn off public sign-ups in the hosted Auth settings for an internal dashboard. Set `NEXT_PUBLIC_LANDING_URL` and `DASHBOARD_ORIGIN` to the preview server and dashboard origins.
