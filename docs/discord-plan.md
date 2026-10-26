# Discord integration and game security plan

Started 2026-10-25. Review copy: https://claude.ai/artifact/FwJTywRmqfoWAoPeLmyG5a. This file is the source of truth. Tick boxes here as work lands.

Add server code (Firebase Cloud Functions), then build on it in order. Today the game ID is the only lock, and browsers can't keep secrets.

0. **Cost guardrails**, so you can't get a surprise bill
1. **Rolls post to Discord**
2. **Game passwords** (2a dropped, 2b optional)
3. **Admin login**
4. **Discord bot** with slash commands

**You** = console or Discord setup. **Me** = code.

## Rule: current users notice nothing

Every phase must leave today's experience unchanged. Nobody signs up, nobody types a password, and no existing link, game or sheet stops working.

- **Old and new app together:** CI deploys rules before the app (see README, Deploying), so rules must accept both versions. A rule that expects new app behavior waits 2 weeks after that app ships, because old tabs keep running old code until they hit a missing file.
- **Rules only add permissions** until that wait is over. They never take any away before then.
- **Test before deploying rules:** every rules change is run in the emulator against the current app's writes. Those writes must still pass.
- **Untouched:** open games, `/#sheet=` links, the recent-games list, offline play and the roll log.
- **CSP:** domains are only ever added.

End state: browsers only touch game data (`games`, `agents`, `rolls`, `members`), and only as the rules allow. Secrets and links (`gameSecrets`, `discordChannels`, `discordClaims`) can only be reached by Functions, which use the Admin SDK.

## Phase 0: Cost guardrails

- [x] **You:** switch Firebase to the Blaze plan. Functions need it.
- [x] **You:** set a $5/month budget with email alerts in Google Cloud Billing.
- [x] **Me:** kill switch (`functions/src/index.ts`, recovery steps in the README): when the budget is passed, a Function turns billing off. The site goes offline until you turn billing back on. Google's built-in spend caps were checked on 2026-10-25 and can't do this job: they cover one service per budget, from a list of 4 that doesn't include Firestore.
- [x] **You:** set `VITE_APPCHECK_SITE_KEY` and deploy. Leave enforcement **off**. (Live since 2026-10-18.)
- [ ] **You:** on or after 2026-11-01, check the App Check metrics in the console. Enforce only if unverified requests are near zero. Some privacy browsers block reCAPTCHA, and enforcing would lock those players out.
- [x] **Me:** cap every Function at 5 instances, a 10-second timeout and 256 MiB of memory.
- [x] **You:** turn on the Cloud Billing API (Cloud console → APIs & Services → Library → "Cloud Billing API" → Enable).
- [x] **You:** run `firebase deploy --only functions` (done 2026-10-25, region us-east1). This also creates the `budget-alerts` Pub/Sub topic.
- [x] **You:** in IAM (Cloud console → IAM & Admin → IAM), give `<project number>-compute@developer.gserviceaccount.com` the **Project Billing Manager** role.
- [x] **You:** edit the $5 budget → Manage notifications → Connect a Pub/Sub topic → `budget-alerts` → Save.

**Done when:** going over $5 shuts billing off and emails you. Wiring verified 2026-10-25: a test 50% alert and Google's own alerts (every ~20 min) reach the kill switch and are ignored. This is the one exception to "current users notice nothing": a site that's down beats a surprise bill.

Normal play stays in the free tier. Spam is the risk: App Check enforcement and the bot's per-user limit cover it. Skipped: extra debouncing (autosave already waits 0.6 s), and having users bring their own Firebase (too much setup for players).

## Phase 1: Rolls post to Discord

- [x] **Me:** add a `functions/` folder (TypeScript, Node 22). Done in phase 0.
- [x] **Me:** `discordWebhook` callable: checks the URL with Discord, posts a hello, saves it to `gameSecrets` (browsers denied in `firestore.rules`). Never returns the URL.
- [x] **Me:** `rollToDiscord` posts each new roll: `**Agent Smith** · Firearms 45% → 23 · Success`. @-pings blocked, Markdown in names defused.
- [x] **Me:** Discord panel on the game page: paste URL, connect, disconnect.
- [x] **Me:** tests for the message format, URL check and ping blocking. `gameSecrets` denial is a plain `if false` rule; no emulator test.
- [x] **Me:** `npm --prefix functions run webhook:test` posts sample rolls from your terminal.
- [x] **You:** `firebase deploy --only functions,firestore:rules`, then push the app.
- [x] **You:** delete the "Captain Hook" webhook (its URL was pasted in chat), make a new one, paste it into the game page panel.

**Done when:** a roll in the app shows up in Discord.

Until 2b, anyone with the game link can replace the webhook. They still can't read it.

## Phase 2a: Invisible sign-in and rate limits (dropped 2026-10-25)

A rules-based roll limit needs a per-browser counter kept in step with the server. Offline rolls sent at once on reconnect would trip it and be lost, which breaks the rule above. The kill switch caps the bill, and enforcing App Check blocks the scripts that would run it up. Nothing later depends on it: the bot has its own limit, and admin login uses Google sign-in.

## Phase 2b: Game passwords (optional)

Stops someone with a leaked link from reading or editing a game, lets the Handler remove people, and limits webhook changes to the Handler. Worth doing only if games go beyond friends.

- [ ] **Me:** passwords are opt-in per game. A game without one works exactly as today, and so does making a new game without a password.
- [ ] **Me:** `createGame` takes an optional password, stored hashed. Whoever creates the game is its Handler.
- [ ] **Me:** `joinGame` checks the password and adds you as a player. 10 wrong tries locks joining for 15 minutes.
- [ ] **Me:** the Handler can change the password or remove all players.
- [ ] **Me:** rules: only members can open a locked game.
- [ ] **Me:** password prompt in the app.

**Done when:** a locked game won't open without its password.

Existing games stay open. Whoever sets the first password on one becomes its Handler. Catch: on a new browser, or after clearing site data, you type the password again.

## Phase 3: Admin login

- [ ] **You:** turn on Google sign-in in Firebase Auth.
- [ ] **Me:** a script that marks your Google account as admin. You run it once.
- [ ] **Me:** rules: an admin can read, write and delete anything.
- [ ] **Me:** a hidden `/admin` page to open any game, reset its password, clear its webhook and delete spam.

**Done when:** you can open any game from `/admin`.

This replaces a master password. A master password would open everything if it leaked, and your Google account already has 2-step verification.

## Phase 4: Discord bot (`/dg`)

All commands sit under `/dg`, so they don't clash with Dice Maiden's `/roll`.

- [x] **Me:** `discordBot` Function receives every command. It rejects requests without Discord's signature, and allows each user one command every 2 seconds.
- [x] **Me:** commands:
    - `/dg link game`: link this channel to a game. Needs Discord's *Manage Channels* permission. There's no link code: one would protect nothing beyond the game link itself.
    - `/dg unlink`: same permission.
    - `/dg claim agent`: play an Agent; names autocomplete. A claimed Agent can only be taken by someone with *Manage Channels*.
    - `/dg unclaim [agent]`: release your own Agent, or (with *Manage Channels*) anyone's.
    - `/dg roll test [modifier]`: stats, Luck, SAN and skills autocomplete with current %. Same math as the live sheet (WP, exhaustion, penalty). Rolled on the server, saved to the roll log, and a failed skill is ticked for improvement.
    - `/dg sheet`: HP, WP, SAN and BP, shown only to you.
- [x] **Me:** the bot reuses `src/rules` and `src/model`, bundled into the Functions build.
- [x] **Me:** `npm --prefix functions run discord:register` registers the commands. It asks for the bot token, so the token never goes in the repo, chat or Firebase.
- [x] **Me:** bot rolls skip the phase 1 webhook, so nothing posts twice.
- [ ] **You:** create an app in the Discord Developer Portal. Copy its Application ID and Public Key, and reset/copy the bot token.
- [ ] **You:** deploy (it asks for the public key once), set the Interactions Endpoint URL in the portal, run the register script, and invite the app to the server.

**Done when:** `/dg roll` in Discord shows up in the app's roll log.

Known gaps:
- A cold start can miss Discord's 3-second deadline ("The application did not respond"). Retry. Keeping an instance warm would cost about as much as the whole budget.
- A skill ticked from Discord is lost if that Agent's sheet is open in a tab that then changes its own ticked skills before reloading.

## Decisions needed

- ~~**Over budget:**~~ decided 2026-10-25: automatic shutoff. It's the one allowed exception to the rule above.
- **Phase 2b:** build passwords now, or wait until someone needs them?
- **Handler clears browser data:** give a recovery code, or allow an optional Google login?
- **Locking an old open game:** does the first password win, or can only an admin lock it?
- ~~**`/claim`:**~~ decided 2026-10-25: anyone in a linked channel claims a free Agent; *Manage Channels* can take over or release any claim.
