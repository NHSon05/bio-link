# Dashboard authentication TDD checklist

Follow the repository's [auth workflow](../../AGENTS.md#dashboard-auth-workflow), read the [implementation plan](AUTH_PLAN.md), and use the IDs in the [behavior contract](AUTH_CONTRACT.md) to name the behaviors each test covers.

For each phase, run the new test and confirm it fails for the expected reason. Make the smallest change that passes it, then refactor with all earlier tests still green. Capture tests for existing behavior as a passing baseline. Complete each phase's exit check before moving to a dependent phase.

During Green and Refactor, follow the [dashboard component rules](../../apps/dashboard/AGENTS.md#dashboard-ui-components). Check for the shadcn component locally first and use the CLI to add any missing registry component before importing it.

After each phase, record the verification command and result under its exit check. Mark a checkbox complete when its work has been verified. If a check is blocked, note what is missing under that phase so another agent can resume from the right point.

## Phase 0 — Test harness and existing behavior

- [x] **Baseline.** Add Playwright browser and HTTP tests that can run against an isolated local dashboard and Supabase stack with Mailpit. Use unique accounts per run and clean up the test records created by the run.
- [x] **Baseline.** Capture the existing password login, page protection, session persistence, and sign-out behavior under `LOGIN-1`, `LOGIN-2`, and `SESSION-1`. Document how to run a single test and the full auth suite.

**Exit check.** The baseline passes from a fresh test environment. The automated tests use local or simulated services.

**Verification.** `DOCKER_CONTEXT=orbstack PLAYWRIGHT_CHANNEL=chrome pnpm test:auth` built the dashboard and passed all six tests against a fresh local Supabase project.

## Phase 1 — Password login and sign-out

- [x] **Red.** Cover rejected credentials, valid local return paths, rejected external destinations, session refresh, and access after sign-out under `LOGIN-1`, `LOGIN-2`, and `SESSION-1`.
- [x] **Green.** Fix any missing behavior in the current login action, redirect handling, or session refresh. Preserve the existing password login and Google entry points.
- [x] **Refactor.** Reuse the session client and existing form components.

**Exit check.** Valid login persists across reloads, errors are visible, and sign-out blocks the next protected request.

**Verification.** `DOCKER_CONTEXT=orbstack PLAYWRIGHT_CHANNEL=chrome pnpm test:auth --grep 'unverified user'` failed before the fix because the login form showed the generic credential error. After handling the confirmation error and using the shadcn Alert, the full suite passed. The refresh test observed a rotated session cookie on reload. The sign-out test verified the next dashboard visit redirected to login and the sites API returned `401`.

## Phase 2 — Public authentication routes

- [x] **Red.** Test that guests can follow the registration and recovery links from `/login` and reach email confirmation and the Google callback without a redirect loop. Test that the dashboard still requires a session. Cover `SESSION-1`.
- [x] **Green.** Add the login links and the auth routes needed by later phases. Adjust the route guard for the specific public entry points.
- [x] **Refactor.** Consolidate route checks and keep callbacks separate from protected site APIs.

**Exit check.** Public auth entry points are reachable and unauthenticated site requests are still rejected.

**Verification.** `DOCKER_CONTEXT=orbstack PLAYWRIGHT_CHANNEL=chrome pnpm test:auth --grep 'SESSION-1 public authentication routes'` found three expected failures before the changes. The registration and recovery links were missing, and email confirmation redirected guests to login. The Google callback and access checks already passed. The full `pnpm test:auth` run with the same environment built the dashboard and passed all 11 tests. `pnpm lint` and `pnpm format:check` passed. The new pages provide entry points for the later registration, recovery, and verification phases.

## Phase 3 — Registration form and confirmation email

- [x] **Red.** Test invalid email, password mismatch, unmet password rules, successful registration with email delivery, and generic handling of duplicate addresses. Cover `SIGNUP-1`.
- [x] **Green.** Add the signup form and server-side validation. Enable signup with confirmation in the local test Auth settings and send the confirmation through Supabase.
- [x] **Refactor.** Reuse form validation where compatible with login and recovery.

**Exit check.** A valid signup shows the check-your-email state and produces a Mailpit message. Invalid forms do not submit to Supabase.

**Verification.** `DOCKER_CONTEXT=orbstack PLAYWRIGHT_CHANNEL=chrome pnpm test:auth --grep SIGNUP-1` failed all five initial tests on the placeholder page and passed them after implementation. The full `pnpm test:auth` run with the same environment built the dashboard and passed all 17 tests after the refactor. The signup tests confirmed Mailpit delivery, identical public responses for new and duplicate addresses, and zero Supabase signup requests for invalid forms. `pnpm lint` and `pnpm format:check` passed.

## Phase 4 — Confirm email and resend

- [x] **Red.** Fetch a real signup link as a preview, then complete verification in the browser. Cover unverified password login, malformed and wrong-purpose tokens, expired or used links, and resending a confirmation. Cover `LOGIN-1`, `SIGNUP-1`, `EMAIL-1`, and `EMAIL-2`.
- [x] **Green.** Configure the signup email template, render the confirmation action, and verify the token hash only when the user submits it. Establish the session and add the resend flow.
- [x] **Refactor.** Share generic email response states with the upcoming recovery request form.

**Exit check.** A link preview leaves the link usable. Verification creates a session and the same link cannot be used twice.

**Verification.** `DOCKER_CONTEXT=orbstack PLAYWRIGHT_CHANNEL=chrome pnpm test:auth email-confirm.spec.ts` failed all five initial tests while the email pointed directly to Supabase and the dashboard confirmation and resend controls were absent. The focused tests passed after implementation. The full `pnpm test:auth` run with the same environment built the dashboard and passed all 23 tests. It confirmed that a Mailpit link preview leaves the account unverified, submitting the link creates a session, replay fails in a signed-out browser, and resend delivers a fresh link with the same public response and cookie behavior for pending, confirmed, and unknown addresses. `pnpm lint` and `pnpm format:check` passed.

## Phase 5 — Request a recovery email

- [ ] **Red.** Test invalid email and identical public confirmation for existing and unknown addresses. Check that the test mailbox receives the recovery email for an existing account. Cover `RESET-1`.
- [ ] **Green.** Add `/forgot-password` and the server action that requests a Supabase recovery email. Configure the recovery template and check its dashboard origin.
- [ ] **Refactor.** Reuse generic email confirmation and validation from the signup flow.

**Exit check.** A user can request a recovery email without the form revealing whether an account exists.

## Phase 6 — Verify recovery links

- [ ] **Red.** Follow a Mailpit recovery link. Cover previewing the link without consuming it, successful verification, and invalid, expired, used, or wrong-purpose links. Test that a normal sign-in provides no recovery authorization. Cover `EMAIL-1`, `EMAIL-2`, and `RESET-3`.
- [ ] **Green.** Extend email verification for the recovery purpose. Bind the recovery authorization to the verified user and session and redirect to a guarded `/reset-password` page.
- [ ] **Refactor.** Reuse the email confirmation route while keeping the accepted purposes and their destinations explicit.

**Exit check.** Valid recovery links reach the guarded reset page. Direct navigation and invalid links offer a fresh recovery request. The password form and update action follow in Phase 7.

## Phase 7 — Set and verify the new password

- [ ] **Red.** Test rejected mismatched passwords, expired or mismatched recovery authorization, and a successful reset. After success, verify sign-out, rejection of the old password, and login with the new one. Cover `RESET-2` and `RESET-3`.
- [ ] **Green.** Add the reset form and update action. Recheck the recovery authorization on submission, update the password through Supabase, and clear the current recovery and browser session state.
- [ ] **Refactor.** Share password validation with registration and keep recovery authorization checks on the server.

**Exit check.** Only a session with valid recovery authorization can reset the password through the dashboard. Successful reset returns the user to login.

## Phase 8 — Google OAuth initiation

- [x] **Baseline and red.** Use a simulated provider to assert the Google request includes a PKCE challenge and sends Supabase the exact configured dashboard callback. Cover an unavailable provider and a rejected external return path under `GOOGLE-1` and `GOOGLE-2`.
- [x] **Green.** Fix missing behavior in the existing Google sign-in action, including returning the browser to a recoverable login state if initiation fails.
- [x] **Refactor.** Use the shared dashboard origin and safe return-path code.

**Exit check.** The authorize redirect carries PKCE and the correct callback. An initiation failure presents a retry path.

**Verification.** `DOCKER_CONTEXT=orbstack PLAYWRIGHT_CHANNEL=chrome pnpm test:auth --grep 'GOOGLE-[12]'` confirmed the existing S256 challenge and exact callback. The unavailable-provider case failed before the fix because the browser stayed on the Supabase error. The final full suite passed, including the retry and external return-path checks.

## Phase 9 — Google callback and session

- [x] **Baseline and red.** Verify a successful code exchange uses the original verifier and sets a session cookie. Cover cancellation, missing or invalid codes, a replayed code, and a missing verifier. Cover `GOOGLE-1` and `GOOGLE-2`.
- [x] **Green.** Fix any callback gaps. Redirect successful sign-ins to the validated destination and unsuccessful attempts to login with a retry message.
- [x] **Refactor.** Share session and redirect handling with email and password login where it is the same.

**Exit check.** Simulated Google sign-in creates a working dashboard session. Failed or cancelled exchanges do not establish a session. Phases 8–9 can run alongside Phases 3–7 once Phase 2 is complete.

**Verification.** The Google baseline failed the original-verifier check when the SDK's shared verifier cookie was removed. The final full suite used real local Supabase PKCE exchanges with a simulated provider. It verified that the original verifier sets a session cookie and opens the protected API, and that cancelled, missing, invalid, duplicate, and replayed codes and missing verifiers return to a retryable login without a session. Each browser tracks its latest pending Google attempt. Overlapping attempts can require a fresh retry.

## Phase 10 — Role isolation

- [x] **Red.** Use browser and API tests for `ACCESS-1` through `ACCESS-6`. Cover awaiting access for both registration and Google, read-only viewer access, editor access to assigned sites, admin access, and rejected cross-origin cookie writes.
- [x] **Green.** Show the awaiting-access state and close any permission gaps using the existing role records and Supabase policies.
- [x] **Refactor.** Share role fixtures across auth methods. Keep coverage of server responses as well as what the UI displays.

**Exit check.** New users receive no site access, and changing the sign-in method does not change role permissions.

**Verification.** `DOCKER_CONTEXT=orbstack PLAYWRIGHT_CHANNEL=chrome pnpm test:auth --grep 'GOOGLE-[12]|ACCESS-[1-6]'` exposed the missing awaiting-access heading and a cookie write accepted from a different scheme on the same host. The final `DOCKER_CONTEXT=orbstack PLAYWRIGHT_CHANNEL=chrome pnpm test:auth` built the dashboard and passed all 40 tests. It verified empty access for new accounts, stable viewer permissions across password and Google sign-in, editor save, publish, and restore, admin access, exact-origin cookie writes on both local hostnames, and valid Bearer writes. `pnpm lint` and `pnpm format:check` passed.

## Phase 11 — Hosted smoke tests and release checks

- [ ] Apply the required schema to the hosted verification project and configure the Site URL, exact callbacks, signup confirmation, email templates, and SMTP. Enable Google with the credentials for the correct hosted project.
- [ ] Use a real mailbox and Google test account to verify signup and resend, login and sign-out, password recovery, and Google sign-in. Check the resulting session, target origin, and unassigned-user state.
- [ ] Run the full auth suite, `pnpm lint`, `pnpm format:check`, and `pnpm build:dashboard`. Document setup and test commands in the README. Record any hosted checks still awaiting environment access.

**Release check.** The automated suite and hosted smoke tests pass. Email delivery and Google sign-in have both been verified in the target environment.
