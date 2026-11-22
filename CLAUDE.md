@AGENTS.md

## Agent orchestration

The main session is the orchestrator. Specialist subagents live in `.claude/agents/`; ownership, the delegation matrix, handoff format, and a worked example are in [docs/AGENT_WORKFLOW.md](docs/AGENT_WORKFLOW.md).

| Agent                | Use for                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `planner`            | Breaking a `docs/plan.md` task into owned steps, contract IDs, risks |
| `database-engineer`  | New Supabase migrations, RLS, RPCs, seed                             |
| `backend-developer`  | API routes, auth, validation, `packages/schema`                      |
| `frontend-developer` | Dashboard UI, landing blocks and templates, Closure runtime          |
| `qa-tester`          | Playwright and contract tests named by contract ID                   |
| `browser-tester`     | Checking UI in a real browser: console, network, screenshots         |
| `code-reviewer`      | Read-only review of the diff before a task is called done            |
| `devops-engineer`    | Env vars, build scripts, CI, deploy, CDN, rollback                   |

- Plan multi-file work with `planner` first. Order: database → backend → frontend → tests → browser → review.
- Run editing agents in parallel only when their file lists don't overlap.
- Every API task cites its ID in [docs/API_CONTRACT.md](docs/API_CONTRACT.md). Changes to the contract or to `supabase/migrations/` need the user's approval first.
- A task is done only after real verification output and a `code-reviewer` approval. Record it in `docs/plan.md`, then update [docs/project_summary.md](docs/project_summary.md) (status rows and change log).
- Architecture is defined in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Record new decisions there as `AD-` entries.
- No deploys, hosted database changes, or real build hooks without explicit approval. Commit and push only when asked.
