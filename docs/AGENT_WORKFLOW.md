# Agent workflow

How the main Claude Code session (the orchestrator) delegates work to the subagents in `.claude/agents/`. The short version lives in [CLAUDE.md](../CLAUDE.md#agent-orchestration); this file holds the details agents read on demand.

## Agents and code ownership

Each path has exactly one owner. An agent that needs a change outside its paths asks the orchestrator, who routes it to the owner.

| Agent                | Owns (may edit)                                                                                                                                                                                             | Never edits                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `planner`            | `docs/**/*.md` (including `docs/plan.md`) (after approval)                                                                                                                                                  | Application code, config, migrations        |
| `frontend-developer` | Dashboard pages, layouts, `components/**`, `styles/**`, `lib/siteRequest.ts`; landing `components`, `layouts`, `styles`, `*.astro` markup; `packages/templates`; `packages/runtime`                         | `app/api/**`, `packages/schema`, SQL, tests |
| `backend-developer`  | `apps/dashboard/app/api/**`, `app/auth/**` handlers, server actions, `proxy.ts`, `lib/**` (except `siteRequest.ts`); `packages/schema`; landing `src/lib/data.ts`, `*.json.ts`, `/preview` request handling | SQL, UI, tests, contract docs               |
| `database-engineer`  | `supabase/migrations/**` (new files), `supabase/seed.sql`, `supabase/config.toml`                                                                                                                           | Applied migrations, hosted databases        |
| `qa-tester`          | `apps/dashboard/tests/**`, Playwright config, new test configs, `test:*` scripts                                                                                                                            | Application code                            |
| `browser-tester`     | Nothing in the repo (scratch scripts and screenshots outside it)                                                                                                                                            | Any project file                            |
| `code-reviewer`      | Nothing (read-only)                                                                                                                                                                                         | Any file                                    |
| `devops-engineer`    | Root `package.json` scripts, `pnpm-workspace.yaml`, `.github/workflows/**`, deploy scripts, `.env.example` files, `astro.config.mjs`, `next.config.ts`, `.gitignore`, README setup sections                 | Production systems without approval         |

Shared files: a change to `packages/schema` affects both apps, so `backend-developer` makes it before either app builds on it. `pnpm-lock.yaml` changes only as a side effect of an approved dependency change by the owning agent.

## Delegation matrix

| Task type                                 | Lead                                        | Then                                                                 | Plan first?                      |
| ----------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- | -------------------------------- |
| New or changed API endpoint (contract ID) | `backend-developer`                         | `qa-tester` → `code-reviewer`                                        | Yes                              |
| New table, column, policy, or RPC         | `database-engineer`                         | `backend-developer` → `qa-tester`                                    | Yes                              |
| Dashboard screen, form, or editor change  | `frontend-developer`                        | `browser-tester` → `code-reviewer`                                   | If multi-file                    |
| Landing block, template, or theme         | `frontend-developer`                        | `browser-tester` → `code-reviewer`                                   | If new block type (schema first) |
| Runtime (Closure) change                  | `frontend-developer`                        | `qa-tester` (compiled build) → `browser-tester`                      | No                               |
| Auth phase from `docs/auth/AUTH_TASK.md`  | `qa-tester` (red)                           | `backend-developer` / `frontend-developer` (green) → `code-reviewer` | Phase is the plan                |
| Env var, build script, CI, deploy, cache  | `devops-engineer`                           | `code-reviewer`                                                      | If it touches deploys            |
| Bug report                                | `browser-tester` or `qa-tester` (reproduce) | owner of the failing code → `qa-tester`                              | No                               |
| Contract or schema question, scope change | `planner`                                   | orchestrator decides                                                 | —                                |
| Pre-commit check                          | `code-reviewer`                             | —                                                                    | —                                |

Small single-file fixes the orchestrator can do directly; delegation is for work that benefits from a focused context.

## Orchestrator rules

1. **Plan before multi-agent work.** Send the request to `planner`, review its steps, and resolve any "decisions needed" with the user.
2. **Parallel only when safe.** Run read-only agents (`planner`, `code-reviewer`, `browser-tester`) in parallel freely. Run editing agents in parallel only when the plan shows disjoint file lists and no dependency between them.
3. **Respect order.** Database → backend → frontend → tests → browser → review. Schema changes in `packages/schema` come before code that uses them.
4. **Contract and schema changes are explicit.** Any change to `docs/API_CONTRACT.md`, `docs/auth/*`, or `supabase/migrations/` is surfaced to the user with its reason before it is made.
5. **Done means verified.** A task is complete only when the owning agent reported a command and its real result, `qa-tester` ran the relevant tests, and `code-reviewer` approved. Record the verification line in `docs/plan.md` and update `docs/project_summary.md` as described in its last section.
6. **Safety.** No secrets in prompts, outputs, or commits. No deploys, hosted database changes, or real build hooks without explicit user approval. Commits and pushes only when the user asks.

## Handoffs

Every agent ends with the output block defined in its file. The orchestrator passes the relevant parts to the next agent; it does not forward whole transcripts.

A handoff prompt to the next agent contains:

```
Task: <docs/plan.md IDs> — <goal>
Contract: <IDs> (Implemented | Proposed)
Your files: <paths you may edit>
Inputs from previous step: <files changed, RPC signatures, env vars, UI states to test>
Done when: <acceptance criteria from the plan>
Report with: your output block
```

Handoff rules:

- **Failures go back to the owner,** not to whoever found them. `qa-tester` and `browser-tester` name the likely owner.
- **Discrepancies stop the line.** If code and contract disagree, the agent reports it and the orchestrator decides (often via `planner`) before more code is written.
- **Blocked is a valid result.** If Docker, credentials, or a dependency is missing, the agent reports `blocked` with what is needed; it never reports a pass.
- **Review findings** go to the owning agent with the `file:line` and scenario. The reviewer re-checks only the changed lines.

## Sample end-to-end workflow: F3-5 site members (`MEM-1`…`MEM-3`)

1. **Orchestrator → `planner`:** "Plan docs/plan.md F3-5." The planner confirms `MEM-1`…`MEM-3` are Proposed, notes F1 must allow looking users up by email, and returns steps:
   1. `database-engineer` — RPCs `list_site_members`, `set_site_member`, `remove_site_member` with admin check and `PT403`/`PT404` — `supabase/migrations/<ts>_site_members_admin.sql`
   2. `qa-tester` — failing HTTP tests for `MEM-1`…`MEM-3` (admin `200`, editor/viewer `403`, unknown slug `404`, invalid role `422`, cross-origin cookie write `403`) — `apps/dashboard/tests/…`
   3. `backend-developer` — `app/api/sites/[slug]/members/route.ts`, `[userId]/route.ts`, `lib/store.ts` — depends on 1
   4. `frontend-developer` — members dialog in `components/`, `ME-1` gating — depends on 3
   5. `browser-tester` — dialog states at mobile and desktop
   6. `code-reviewer` — full diff
2. **Orchestrator → user:** shows the new migration as a decision. User approves.
3. **`database-engineer`** writes the migration, runs `supabase db reset`, reports the RPC signatures.
4. **`qa-tester`** (can run alongside step 3, disjoint files) writes the tests and confirms they fail with `404` (route missing).
5. **`backend-developer`** implements the routes against the RPCs, runs lint and `build:dashboard`, and hands the test cases back.
6. **`qa-tester`** runs the suite: all `MEM-*` tests pass; reports the counts.
7. **`frontend-developer`** builds the dialog with shadcn `dialog`, `select`, `input`; reports UI states.
8. **`browser-tester`** checks the dialog as admin and as editor; reports a console warning on close. Orchestrator routes it to `frontend-developer`, who fixes it.
9. **`code-reviewer`** reviews the whole diff: approves with one non-blocking note.
10. **Orchestrator** marks F3-5 done in `docs/plan.md` with the verification lines, updates `docs/project_summary.md` (F3 row, `MEM-*` API status, Database, change log), and tells the user what changed. Commits only if asked.
