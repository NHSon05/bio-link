# Dashboard authentication plan

Add email registration, email verification, and password recovery to the Next.js dashboard. Keep password login and Google sign-in on the existing Supabase session, then verify all four flows on the hosted project. A new account receives zero site assignments. Admins continue to assign access through the existing role workflow.

Start with the repository's [auth workflow](../../AGENTS.md#dashboard-auth-workflow). Use the [behavior contract](AUTH_CONTRACT.md) for expected outcomes and the [phased TDD checklist](AUTH_TASK.md) for implementation order and test coverage.

## Starting point

- `apps/dashboard/app/login` already provides email and password login and starts Google OAuth. `app/auth/callback/route.ts` exchanges the Google authorization code.
- `apps/dashboard/lib/auth.ts` and `proxy.ts` create and refresh Supabase cookie sessions. The site API already accepts a valid session cookie or Bearer token and checks site permissions.
- `supabase/config.toml` currently disables signup. The README also describes closed registration. Update both as part of shipping verified self-registration.
- Site access is stored in `site_admins` and `site_members`. Reuse those records and the existing policies for users from either login method.

## Implementation

Build auth screens with the dashboard's [shadcn/ui components](../../apps/dashboard/AGENTS.md#dashboard-ui-components). Reuse installed primitives across login, registration, and recovery. Install any missing primitive from the shadcn registry before using it in a screen.

| Work                | Approach                                                                                                                                                                                                                   | Dependency                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Test setup          | Run Playwright against the dashboard and an isolated local Supabase instance. Use Mailpit for real local signup and recovery emails. Simulate the Google provider in automated tests.                                      | Starts first.                                                      |
| Login and sessions  | Establish a passing baseline for password login, session refresh, and sign-out. Extend the route guard and login links for registration and recovery.                                                                      | Test setup.                                                        |
| Email registration  | Enable signup with email confirmation. Add signup and resend forms, then verify confirmation links on the server. A link GET shows an explicit continue action before verification so link previews leave the link usable. | Public auth routes.                                                |
| Password recovery   | Add the request form, then reuse email verification with a distinct recovery purpose and destination. Authorize the reset action using short-lived proof bound to the verified Supabase session.                           | Email confirmation flow.                                           |
| Google sign-in      | Keep the current server-side PKCE flow. Verify the session cookie, fixed callback origin, and retry handling.                                                                                                              | Test setup and session baseline. Can run alongside the email work. |
| Site permissions    | Verify access through the dashboard and API for unassigned users, viewers, editors, and admins.                                                                                                                            | Working session flows and local schema.                            |
| Hosted verification | Configure email delivery, Google credentials, and exact redirect URLs. Run a smoke test with a real mailbox and Google test account.                                                                                       | Automated auth suite and hosted project access.                    |

## Environment and rollout

- **Local automated tests.** Use a dedicated Supabase stack with the existing migrations and test fixtures. Generate unique email addresses per run and clean up the records the run creates. Test link expiry using controlled fixtures or a short expiry in the isolated test stack.
- **Hosted verification.** Use a hosted test or staging project where available. Set `DASHBOARD_URL` and the Supabase Site URL to the dashboard origin for that environment. Allow the exact dashboard callback paths. Register the Supabase Auth callback URL in Google Auth Platform and save the Google credentials in Supabase. Configure SMTP and the confirmation and recovery email templates. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) · [Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) · [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp)
- **Release.** Run the auth suite, lint, formatting checks, and dashboard build. Verify real email delivery and Google sign-in and check role isolation. Record the settings and run instructions in the README.

Use the [phase exit criteria](AUTH_TASK.md) to decide when to move on. A passing automated OAuth test verifies app behavior. The hosted smoke test verifies Google credentials, provider redirects, and email delivery.
