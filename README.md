# YOURCODENA.ME

A character creator for Delta Green. It's running at [yourcodena.me](https://yourcodena.me/).

It follows the Agent's Handbook in order: statistics, profession and skills, bonds, details, then a review page where you get the finished sheet. After that you can keep playing from it. A Handler can make a game and everyone's Agents and rolls end up in the same place. There are no accounts.

## What's in it

- Character creation in five steps, same order as the book.
- Shared games. You get an ID like `kestrel-lantern-7f3k` and send the link to people. Anyone with the link can read and write the game. It's unlisted, not secret, so don't put anything in there you'd mind losing.
- A live sheet for play: HP, WP, SAN, Breaking Point, bonds, exhaustion, adaptation to violence and helplessness, temporary and permanent stat loss, disorders, and the skills you failed this session so they can improve afterward.
- A roll log per game. Percentile tests, penalties, outcome. You can't edit or delete rolls.
- Standalone sheets that live entirely in the URL hash (`/#sheet=...`). Nothing is stored on a server. If you lose the link you lose the Agent.
- A plain-text sheet, 30 columns wide, for pasting into chat. Also a print stylesheet.
- The home page remembers the last five games you opened in this browser.

## Routes

| Path | |
| --- | --- |
| `/` | Open a game by ID or make a new one |
| `/#sheet=...` | Standalone sheet stored in the hash |
| `/g/:gameId` | A game's Agents and roll log |
| `/g/:gameId/a/:agentId` | One Agent, editor and live sheet |

Anything else redirects to `/`.

## Stack

React 19, TypeScript, Vite, React Router, React Aria Components, Zod, Firebase (Firestore, Hosting, optional App Check). Tests are Vitest. Lint is ESLint with jsx-a11y.

## Running locally

Use Node 22, since that's what CI runs.

```bash
npm install
```

```bash
cp .env.example .env
```

Put your own Firebase project's values in `.env`. `VITE_APPCHECK_SITE_KEY` is optional. If you set it, App Check starts up with reCAPTCHA Enterprise, but it doesn't do much until you also enable it in the Firebase console and enforce it for Firestore.

```bash
npm run dev
```

Other scripts:

| | |
| --- | --- |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the build |
| `npm test` | Run the tests once |
| `npm run lint` | Lint `src/` |

## Where things are

```
src/
  pages/    Home, Game, Agent, Shared (each loaded separately)
  steps/    the five creation steps
  rules/    dice, test outcomes, and rules data (stats, professions, skills, codenames)
  model/    Zod schemas for the character and live sheet, roll actions, the text sheet
  lib/      Firestore, game IDs, autosave, diffing, stale build reload, clipboard
  ui/       window chrome, menu bar, skip link, legal text
  styles/   tokens, app, print
firestore.rules
functions/  Cloud Functions: the budget kill switch
docs/       plans in progress
```

## Data

Firestore, no auth. Knowing a game's ID is the only thing that gets you into it.

```
games/{gameId}                    { createdAt, schemaVersion }                      never changes
games/{gameId}/agents/{agentId}   { name, codename, profession, character, live,    create and update
                                    createdAt, updatedAt }
games/{gameId}/rolls/{rollId}     { agentId, agentName, label, chance, penalty,     create only
                                    roll, outcome, createdAt }
```

The rules don't let anyone list games or delete anything. Cleanup has to be done by hand with admin access. Every write is checked against an allowed set of keys, string lengths, and number ranges, so a roll can't come in as 147.

The rules can't count documents, so there's no cap on Agents or rolls per game. App Check is the only thing that helps with that.

If you add a field to a document you have to add it to that document's `hasOnly` list in `firestore.rules`. If you don't, the writes get rejected and you'll probably notice later than you'd like.

When an Agent saves, it only sends the fields that changed since that tab last read or wrote them. Two people editing different parts of one sheet won't overwrite each other. If they edit the same field, whoever saves last wins.

## Deploying

Pushing to `main` runs [the workflow](.github/workflows/deploy.yml): lint, test, build, deploy Firestore rules, deploy Functions (only when `src/rules`, `src/model` or `functions/` changed), deploy Hosting to `codename-dg`. A manual run of the workflow always deploys Functions.

Rules go out before the new build. Tabs that are already open keep running the old build for a while, so the rules have to accept writes from both versions at once. That means adding a field takes two releases (allow it, then use it) and removing one also takes two (stop writing it, then stop allowing it).

After a deploy, an old tab may ask for a file that no longer exists. When that happens the app reloads once. If it fails again within a few seconds it shows the error instead of reloading forever.

The workflow needs these secrets: the `VITE_FIREBASE_*` values, `VITE_APPCHECK_SITE_KEY`, and `FIREBASE_SERVICE_ACCOUNT_CODENAME_DG`. That service account needs the Firebase Rules Admin role or the rules step fails. For the Functions step it also needs Cloud Functions Developer, Service Account User and Cloud Datastore Index Admin. Index Admin lets the CLI look up the database's location for Firestore triggers without being able to read game data. It also has Service Usage Consumer. If a deploy fails with a permission error, the error names the missing permission. Add the matching role in Cloud console → IAM. The `firebase-tools` version and the hosting action are pinned and have to be bumped by hand. Dependabot does the other Actions.

Functions deploy before Hosting, so a new build never calls a Function that isn't live yet. The deploy runs `--non-interactive` without `--force`: a Function deleted from the code fails the deploy instead of being removed. Delete it by hand with `firebase functions:delete`. Deploying by hand with `firebase deploy --only functions` still works.

| Function | Region | Does |
| --- | --- | --- |
| `budgetKillSwitch` | us-east1 | Turns billing off at the $5 budget (next section) |
| `discordWebhook` | us-central1 | Game page Discord panel: connect, disconnect, status |
| `rollToDiscord` | us-central1 | Posts each new roll-log entry (d% tests, `/dg roll` dice, `/dg damage`) to the game's Discord webhook, unless the bot already answered in the channel |
| `discordBot` | us-central1 | Discord's Interactions Endpoint for `/dg` (link, claim, roll, sheet) |

Firestore triggers have to run in `us-central1`, because the database is in `nam5`. Three collections are Functions-only, and the rules deny browsers entirely:

- `gameSecrets/{gameId}`: the game's webhook URL.
- `discordGuilds/{guildId}`: which game a Discord server plays (`/dg link`).
- `discordChannels/{channelId}`: older per-channel links, still honoured and checked first.
- `discordClaims/{gameId}_{userId}`: which Agent a Discord user plays.

The Functions build bundles `src/rules` and `src/model` with esbuild, so `/dg roll` uses the live sheet's own math. The catch: the bot keeps the copy it was deployed with. The workflow redeploys Functions whenever `src/rules` or `src/model` change, so Discord keeps up with the site. Before that, it once showed stale chances after custom professions and Handler adjustments. `DISCORD_PUBLIC_KEY` is asked for on the first deploy and saved in `functions/.env.codename-dg`. It's a public key, so it's safe to commit. To register or update the `/dg` commands, run this and paste the Application ID and bot token when asked:

```bash
npm --prefix functions run discord:register
```

To see how roll messages look without the app, run this and paste a webhook URL when it asks:

```bash
npm --prefix functions run webhook:test
```

## If the site was shut off for going over budget

The project has a $5/month budget. When this month's actual cost reaches it, the `budgetKillSwitch` Function unlinks the billing account. Everything that costs money stops, and the site, the database or both stop working. You'll have budget emails at 50%, 90% and 100%.

Don't just turn billing back on. This month's cost is still over the budget, so the next budget alert (about every 30 minutes) shuts it off again. Do these in order:

1. **Find what cost money.** In the Google Cloud console, go to Billing → Reports. Set Group by to "SKU" and the time range to the current month. Usually it's Firestore reads or writes, or Cloud Functions.
2. **Find who did it.** In the Firebase console, check Firestore → Usage for the spike. Check Functions → Logs too, or run `firebase functions:log`. A single game ID or Agent showing up thousands of times is spam.
3. **Stop the cause before going back online.** Examples:
    - Enforce App Check (Firebase console → App Check → Firestore → Enforce).
    - Delete the spam game in the Firestore console.
    - Fix whatever rule or code let it through.
4. **Raise the budget for the rest of the month.** In Billing → Budgets & caps, edit "Firebase Project codename-dg". Set the amount above what's already been spent, for example spent + $5. Save it. Skip this step if it's the 1st of a new month, because the cost has reset.
5. **Turn billing back on.** In the Firebase console, open ⚙ → Usage and billing → Details & settings → Modify plan, and choose Blaze with the "Firebase Payment" billing account. Or, in the Cloud console, go to Billing → Account management for project `codename-dg`, then Link a billing account → "Firebase Payment".
6. **Check it works.** Open [yourcodena.me](https://yourcodena.me/), open a game and make a roll. If Functions aren't responding after 10 minutes, run `firebase deploy --only functions`.
7. **On the 1st of next month,** set the budget back to $5.

Don't leave billing off for long. Google may eventually delete resources in a project with no billing account.

## Legal

Published by arrangement with the Delta Green Partnership. The intellectual property known as Delta Green is a trademark and copyright owned by the Delta Green Partnership, who has licensed its use here. The contents of this document are © [J. Garrett Vorbeck](https://iamgarrett.com), excepting those elements that are components of the Delta Green intellectual property.
