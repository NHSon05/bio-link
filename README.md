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

Start the dashboard with `pnpm dev:dashboard` and the internal Astro preview with `pnpm --filter landing exec astro dev --background`. Open [localhost:3000](http://localhost:3000). Signed-out visitors are redirected to `/login`; sign in with the account created in Studio. The session is stored in an HTTP cookie that `proxy.ts` refreshes on each request, and **Đăng xuất** clears it. Use **Lưu nháp** to save a draft and **Xuất bản** to publish it.

## Design system

Each app has its own design system, built on the same brand palette (Sora, #282828, #F7F7F7, olive #CBD77E, hazel #E6CA9A):

- **Dashboard — shadcn/ui.** Tokens for color, text, font, and border live in `apps/dashboard/styles/tokens.css` and map to Tailwind classes in `apps/dashboard/styles/theme.css`. Reuse components from `apps/dashboard/components/ui`. Use the [dashboard component rules](apps/dashboard/AGENTS.md#dashboard-ui-components) to add a missing component. Dark mode follows the OS. Set `.dark` or `.light` on `<html>` to override it.
- **Landing — custom CSS, no Tailwind or React.** Every page uses `apps/landing/src/styles/page.css` and its `--lb-*` variables, scoped under `.lb-root`. The internal slug hub (`/`) adds `src/styles/hub.css` on top.

## Code style

Run `pnpm lint` to lint both apps with ESLint and `pnpm format` to format the repo with Prettier (`pnpm format:check` in CI). In VS Code, install the recommended Prettier and ESLint extensions; `.vscode/settings.json` formats on save and applies ESLint fixes.

## Dashboard API

To call the API directly, sign in with a Supabase Auth user, for example with `supabase.auth.signInWithPassword()`, and send the session's access token as `Authorization: Bearer <access-token>`. Requests without that header fall back to the dashboard's session cookie; cookie-authenticated writes must come from the dashboard's own origin.

| Method and path                   | Behavior                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/sites`                  | List sites available to the signed-in user.                                            |
| `GET /api/sites/{slug}`           | Read the current draft.                                                                |
| `PATCH /api/sites/{slug}`         | Save a complete site JSON as a draft.                                                  |
| `POST /api/sites/{slug}`          | Publish the current draft with an optional JSON body containing `note`.                |
| `PUT /api/sites/{slug}`           | Save and publish a complete site JSON in one request.                                  |
| `GET /api/sites/{slug}/versions`  | List up to 100 versions. Pass `?before=<id>` for older results.                        |
| `POST /api/sites/{slug}/versions` | Publish a previous snapshot as a new version. Send `versionId` and an optional `note`. |

Publish and rollback write the live snapshot and version history in one transaction. Run `pnpm build:landing` after publishing to regenerate HTML and ranking JSON. The server-side `/preview` route is for internal use. With both Supabase variables unset, Astro can also build the checked-in fixtures.

## Hosted Supabase

Create a project in Supabase, then run `supabase login`, `supabase link --project-ref <ref>`, and `supabase db push --remote` with CLI v3. The migration starts with an empty database. Add live sites in Studio or explicitly include the sample fixtures with `--include-seed`. Configure the dashboard runtime and Astro build environment with the hosted project URL and keys, and turn off public sign-ups in the hosted Auth settings for an internal dashboard. Set `NEXT_PUBLIC_LANDING_URL` and `DASHBOARD_ORIGIN` to the preview server and dashboard origins.

### Google sign-in

The login page supports both email/password and Google. The dashboard accepts the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` variables supplied by the Supabase Connect dialog, as well as the names in `apps/dashboard/.env.example`. Set `DASHBOARD_URL` to the dashboard origin. It defaults to `http://localhost:3000`.

1. In **Supabase → Authentication → Sign In / Providers → Google**, copy the callback URL. It looks like `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients), create a **Web application** OAuth client. Add the dashboard origin under **Authorized JavaScript origins** and the Supabase callback URL under **Authorized redirect URIs**. For an OAuth app in testing, add the Google accounts that will sign in as test users.
3. Return to the Google provider settings in Supabase. Enable the provider, enter the Google client ID and client secret, and save.
4. In **Supabase → Authentication → URL Configuration**, set **Site URL** to the dashboard origin. Add the dashboard callback to **Redirect URLs**, for example `http://localhost:3000/auth/callback` for local development or `https://dashboard.example.com/auth/callback` for deployment.

When Supabase sign-ups are disabled, Google sign-in is limited to existing users. Create and confirm the matching email in **Authentication → Users** first. Assign editor, viewer, or admin access in the database the same way you would for a password user. [Supabase’s Google sign-in guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [identity linking documentation](https://supabase.com/docs/guides/auth/auth-identity-linking) describe the provider and account settings.
