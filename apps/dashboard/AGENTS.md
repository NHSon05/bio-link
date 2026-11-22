<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Dashboard UI components

1. Check `components.json` and `components/ui/` for the required shadcn/ui component. Reuse the installed component through `@/components/ui/<name>`, including its existing variants and composition API.
2. If the component is missing, run the dashboard's installed shadcn CLI from the monorepo root. Replace `<component>` with the official registry item name.

   ```sh
   pnpm --dir apps/dashboard exec shadcn add <component>
   ```

3. Import and use the generated component. Review the generated files and dependency changes after installation. Preserve existing customizations by leaving the overwrite option off.
4. Compose feature-specific UI from these primitives. Use native markup for structure, text, form submission, and hidden fields. Use shadcn components for visible controls and patterns such as buttons, inputs, labels, alerts, dialogs, and cards. Avoid hand-built substitutes and use the dashboard tokens in `styles/tokens.css` and `styles/theme.css`.
5. Keep `components/ui/` for shadcn registry components only. Put app-specific components built from them in `components/` (for example `panel`, `segmented`, `topbar`, `device-frame`, `Editor`).

Use the [shadcn CLI reference](https://ui.shadcn.com/docs/cli) to look up component commands.

## Auth changes

Follow the [auth workflow](../../AGENTS.md#dashboard-auth-workflow) for scope and test order. Use the UI rules above during the Green and Refactor steps for each auth phase.
