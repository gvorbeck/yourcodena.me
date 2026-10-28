# Working in this repo

What the app is and where things are: [README.md](README.md). Read the code you're changing and its callers before editing.

## Rules

- Make the smallest change that fully works. Reuse what's already here (`src/lib`, `src/rules`, `src/model`) before writing anything new. No abstractions, options, wrappers or "for later" code nobody asked for.
- Ask before adding a dependency.
- Delete code your change leaves unused. `npm run knip` fails on unused files, exports and dependencies.
- Bug fix: first write a test that fails, then fix the root cause in the shared code, not at each caller.
- New logic gets a test. Where it goes:
  - logic: `*.test.ts` next to the file;
  - `firestore.rules`: `test/firestore.rules.test.ts`;
  - anything a player clicks through: `e2e/`.
- A known limit gets a comment: `// shortcut: <the limit>, <when to upgrade>`.
- Comments say why, in one line. No comments that repeat the code.
- The coverage floor in `vite.config.ts` only goes up.
- Never commit, push or merge. The user does that.

## Done means

`npm run check` passes (lint, types, unused code, unit tests with coverage). If you touched `firestore.rules`, `src/lib`, `src/pages` or the Discord bot, `npm run test:rules` and `npm run test:e2e` pass too. Both need Java 21 on `PATH`.

## Things that trip people up

- `functions/` is a separate npm package with its own `node_modules` and `tsconfig.json`. The bot imports `src/rules` and `src/model` directly.
- Agent saves are diffs against what the tab last read (`known` in `src/lib/agents.ts`). Never write a whole agent document, or you'll overwrite changes from Discord or another device.
- E2E tests click a radio's or checkbox's `label.choice`; React Aria hides the input itself.
