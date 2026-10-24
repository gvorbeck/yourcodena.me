# YOURCODENA.ME

**Agent Intake.** Live at [yourcodena.me](https://yourcodena.me/).

A Delta Green character creator. It walks you through the Agent's Handbook one step at a time, then hands you a sheet you can actually play from. Your Handler gets a shared game with every Agent and a roll log in one place. No accounts. Nobody wants another password. Nobody wants anything anymore.

## What it does

- **Step-by-step creation.** Statistics and derived attributes, profession and skills, bonds, final details, review. Five steps. Same order as the book. Don't skip ahead. You'll want to.
- **Shared games.** Make a game, get an ID like `kestrel-lantern-7f3k`, pass the link around. Everyone with it can add Agents and see the roll log. That's the security model. It's an unlisted link, not a secret. Act accordingly.
- **Live sheet.** HP, WP, SAN, Breaking Point, bonds, exhaustion, adaptation to violence and helplessness, stat loss, disorders, skill checks that grow after the session. All the slow erosion, tracked so you don't have to.
- **Roll log.** Percentile tests with penalties, logged per game, append-only. Fumbles stay on the record. Like everything else.
- **Standalone sheets.** A whole sheet can live in the URL hash (`/#sheet=...`). No server involved. Bookmark it. Lose it. Your call.
- **Plain-text and print output.** A 30-column ASCII sheet for pasting wherever, plus a print stylesheet for people who still trust paper.
- **Recent games.** The landing page remembers the last five games this browser opened. It's the only thing here that remembers anything fondly.

## Routes

| Path | What lives there |
| --- | --- |
| `/` | Landing. Open a game by ID or generate a new one. |
| `/#sheet=...` | Standalone sheet, stored entirely in the hash. |
| `/g/:gameId` | The game: Agents and the roll log. |
| `/g/:gameId/a/:agentId` | One Agent's editor and live sheet. |

Anything else bounces you back to `/`. Probably for the best.

## Stack

React 19, TypeScript, Vite, React Router, React Aria Components, Zod, Firebase (Firestore + Hosting, optional App Check). Vitest for tests. ESLint with jsx-a11y because accessibility is not optional, even down here.

## Running it

Node 22. Same as CI. Don't argue with CI.

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in the Firebase values from your own project. `VITE_APPCHECK_SITE_KEY` is optional; set it and App Check turns on with reCAPTCHA Enterprise. Enable it in the Firebase console and enforce it for Firestore, or don't, and find out why you should have.

```bash
npm run dev
```

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server. |
| `npm run build` | Typecheck, then build to `dist/`. |
| `npm run preview` | Serve the build locally. |
| `npm test` | Vitest, once. |
| `npm run lint` | ESLint over `src/`. |

## Layout

```
src/
  pages/    Home, Game, Agent, Shared. Each one lazy-loaded. Nobody downloads more than they have to.
  steps/    The five creation steps.
  rules/    Dice, test outcomes, and rules data: stats, professions, skills, codenames.
  model/    Character and live-sheet schemas (Zod), roll actions, ASCII sheet output.
  lib/      Firestore access, game IDs, autosave, diffing, stale-build recovery, copy-to-clipboard.
  ui/       Window chrome, menu bar, skip link, the legal line.
  styles/   Tokens, app styles, print styles.
firestore.rules   The only thing standing between you and chaos.
```

## Data

Firestore. No auth. A game is gated by its ID and nothing else.

```
games/{gameId}                    { createdAt, schemaVersion }                          immutable
games/{gameId}/agents/{agentId}   { name, codename, profession, character, live,        create/update only
                                    createdAt, updatedAt }
games/{gameId}/rolls/{rollId}     { agentId, agentName, label, chance, penalty,         append-only
                                    roll, outcome, createdAt }
```

What the rules enforce:

- Nobody lists games. Nobody deletes anything. Cleanup is an admin job.
- Every write is shape-checked: allowed keys only, bounded strings, numbers in range. You can't stuff a roll log with a 147.
- Rules can't count documents, so agents and rolls per game are uncapped. That's what App Check is for.
- **Adding a field means adding it to that document's `hasOnly` list.** Forget, and writes start failing. Quietly. Then loudly.

Saves send only the fields that changed since this tab last read or wrote, so two devices editing different parts of one Agent don't trample each other. Same field, last write wins. Nothing is fair.

## Deploying

Push to `main`. [The workflow](.github/workflows/deploy.yml) lints, tests, builds, deploys Firestore rules, then deploys Hosting to the `codename-dg` project.

Rules ship before the build on purpose. Old tabs keep running the old build for a while, so the rules have to accept writes from both. Adding a field: allow it in one release, depend on it in the next. Removing one: stop writing it first, stop allowing it later. Two releases. Every time. Yes, really.

If an open tab asks for a chunk the new deploy deleted, the app reloads once to pick up the new build. Only once. If the deploy itself is broken, you get the error instead of a reload loop. Small mercies.

Secrets the workflow wants: the `VITE_FIREBASE_*` values, `VITE_APPCHECK_SITE_KEY`, and `FIREBASE_SERVICE_ACCOUNT_CODENAME_DG`. The service account needs **Firebase Rules Admin** for the rules step. The `firebase-tools` version and the hosting action are pinned by hand. Dependabot handles the rest of the Actions. Somebody has to.

## Legal

Published by arrangement with the Delta Green Partnership. The intellectual property known as Delta Green is a trademark and copyright owned by the Delta Green Partnership, who has licensed its use here. The contents of this document are © [J. Garrett Vorbeck](https://iamgarrett.com), excepting those elements that are components of the Delta Green intellectual property.

You didn't see any of this.
