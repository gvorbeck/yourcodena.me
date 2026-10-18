# Code review: findings and fix checklist

Reviewed 2026-10-18 on branch `firebase` (commit `b63ff9e`). Rules were checked against the Delta Green Agent's Handbook text. `tsc --noEmit` was clean and all 44 tests passed at review time. The app was not run in a browser, so accessibility findings come from reading code and CSS plus measured contrast ratios.

Tick a box when the fix is merged. Line numbers refer to the reviewed commit and will drift.

## Priority summary

| # | Item | Why it comes first |
|---|------|--------------------|
| R1 | Veteran adaptation not applied to live sheet | Wrong behaviour at the table |
| R2 | Breaking Point too low for 3 of 4 veterans | Disorder triggers 5 SAN early |
| R3 | Extra-victim SAN loss uncapped | Overstates SAN loss |
| A1 | Results and save failures not announced | Silent data-loss warning |
| B1 | `index.html` cached for 1 hour | Broken page after deploy |
| B2 | Firestore rules not deployed by CI | Rules can drift from repo |

## Verified correct (no action)

Checked against the Handbook and matching: derived attributes (p. 18); crit/fumble rules (p. 44); WP 0 and 1–2 effects (p. 47); adaptation counting and reset (pp. 73–74); projecting and repressing (pp. 74–75); permanent-injury die (p. 55); healing and recuperation (p. 55); stat sets and the 72-point total (pp. 14, 19); distinguishing features (p. 19); bonus-skill rules and all 28 packages (pp. 20, 27–28); base ratings (p. 29); 15 of the 20 core and additional professions (pp. 20–26); the five agency kits read (HRT, Raiders, DEVGRU, Combat Camera, MSPF).

---

## 1. Rules accuracy

### Bugs

- [x] **R1. Damaged-veteran adaptation never reaches the live sheet**
  - **Where:** [src/model/live.ts:29](src/model/live.ts) (`freshLive`), `adapt: { v: 0, h: 0 }`.
  - **Rule:** Extreme Violence and Captivity or Imprisonment say the Agent is "adapted to violence" / "adapted to helplessness" (p. 38). Adapted Agents always succeed at SAN rolls of that type (p. 73).
  - **Problem:** The ASCII sheet and Review step tick the "adapted" box from `c.veteran`, but the live sheet starts the counters at 0. `adapted()` in [LiveSheet.tsx:150](src/LiveSheet.tsx) therefore returns false and SAN tests are still rolled.
  - **Fix:** In `freshLive`, set `adapt: { v: c.veteran === 'violence' ? 3 : 0, h: c.veteran === 'captivity' ? 3 : 0 }`. Better, add `adapts?: 'v' | 'h'` to `VeteranDef` in [creation.ts](src/rules/data/creation.ts) and use it in `freshLive`, the ASCII sheet ([sheet.ts:80-81](src/model/sheet.ts)) and [ReviewStep.tsx:54](src/steps/ReviewStep.tsx) so the three places stop duplicating `'violence'`/`'captivity'`.
  - **Test:** `freshLive` for each veteran gives the expected `adapt`; `loseSan` with `kind: 'violence'` on an Extreme Violence Agent reports an automatic pass path (check `adapted()` is true).
  - **Existing data:** `untouched()` compares against `freshLive`, so unplayed sheets rebuild themselves. Played sheets saved before the fix keep 0; decide whether to leave them.

- [x] **R2. Breaking Point too low for Violence, Captivity and Hard Experience**
  - **Where:** [src/rules/index.ts:64-73](src/rules/index.ts) (`derived`): `bp: san - pow` where `san` already has the veteran's −5 applied.
  - **Rule:** BP is starting SAN minus POW (pp. 18–19). The p. 38 worked example (Hard Experience): SAN drops 60→55, and Daryl's BP is still 60 − 12 = 48 (p. 68 example). Only Things Man Was Not Meant to Know says "reset BP to new SAN minus POW".
  - **Observed:** With POW 12 and CHA 12: none → BP 48; violence → 43 (book: 48); hard → 43 (book: 48); captivity → 46; unnatural → 36 (correct).
  - **Fix:** Compute `bp` from the pre-veteran SAN for violence, hard and captivity: `bp = baseSan - POW` (that is `POW * 5 - POW`). Keep the current behaviour for `unnatural`.
  - **Done:** Captivity uses `60 − 9 = 51` (pre-veteran SAN minus current POW), consistent with how `loseSan` resets BP from current POW. Change if a ruling says otherwise.
  - **Open question (Captivity):** POW also drops by 3, so BP could be `60 − 12` (48) or `60 − 9` (51). The book doesn't say. Pick one, and note the ruling in a comment.
  - **Tests to change:** [live.test.ts](src/model/live.test.ts) "review fixes" asserts captivity BP 46 and `freshLive(...).bp`; [rules.test.ts:91-94](src/rules/rules.test.ts) only checks `san` for violence. Update and add BP assertions.

- [x] **R3. Extra-victim SAN loss is not capped at the die maximum**
  - **Where:** UI hint at [LiveSheet.tsx:280-283](src/LiveSheet.tsx) tells players to write `1D6+2`; `rollExpr` in [index.ts:34-41](src/rules/index.ts) adds the flat bonus uncapped.
  - **Rule:** Footnote on p. 67: on a failed roll add 1 per victim beyond the first, "up to the maximum possible roll" (4 for 1D4, 6 for 1D6, …).
  - **Observed:** `1D6+5` can roll 11.
  - **Fix:** Option A (smallest): in `sanRoll`, for the failure expression, cap the result at the die's maximum when a `+N` is present. Option B (clearer): add a "Victims" number field and compute `min(dieMax, roll + victims - 1)`. Update the hint text either way.
  - **Test:** failure `1D6+5` never exceeds 6; success expression is unaffected.

### Smaller rules issues

- [x] **R4. Hard Experience allows duplicate skill picks**
  - **Where:** [index.ts:137](src/rules/index.ts) (`skillsOf` adds `amount` per entry) and [index.ts:199-203](src/rules/index.ts) (`validate`).
  - **Rule:** "+10% to any five skills" (p. 38). Duplicates would stack +20.
  - **Fix:** In `validate`, flag duplicate non-empty entries in `veteranSkills`. Optionally also include Occult's +10 when checking the 90% cap.

- [x] **R5. The 80% creation cap is a hard blocker**
  - **Where:** [index.ts:190](src/rules/index.ts); the Live Sheet button is disabled while any issue exists ([ReviewStep.tsx:20](src/steps/ReviewStep.tsx)).
  - **Rule:** "Unless the Handler says otherwise, you can't raise a skill higher than 80%" (p. 20).
  - **Fix:** Add a `severity: 'error' | 'warning'` to `Issue`; make this one a warning that does not disable Live Sheet. Show warnings differently in [Editor.tsx:87](src/Editor.tsx) and ReviewStep.

- [x] **R6. Sleep wipes the whole manual Penalty**
  - **Where:** [LiveSheet.tsx:144](src/LiveSheet.tsx), `penalty: 0`.
  - **Rule:** A full night's sleep cures exhaustion (p. 47). It does not cure other penalties (sickness, drugs, injuries) the user may have entered.
  - **Fix:** Track exhaustion separately from the manual penalty (e.g. `Live.exhausted: boolean` worth −20), or only subtract 20 on sleep. Needs a schema field with a default (see the "added after v1" note in [live.ts:17](src/model/live.ts)).

- [x] **R7. Wrong page citations on agency kits**
  - **Where:** `page` strings in [professions.ts:80-131](src/rules/data/professions.ts); shown to users in ProfessionStep.
  - **Known wrong:** FBI HRT says p. 109 (kit is p. 113); Raiders and DEVGRU/SEALs say p. 140 (p. 145); Combat Camera and MSPF say p. 136 (p. 138). The code appears to cite the agency intro page, not the kit.
  - **Done:** All 31 agency kits' skills and bond counts were checked against the book and match; 19 page numbers were corrected. Also confirmed the five core/additional professions not read before and the postings, except CDC "Public Health Preparedness / EOC" (not found in search; still unverified). FORECON (p. 138) and MIST (pp. 143–144) pages are inferred from page-break positions.
  - **Original fix note:** Re-check every `agency` entry (~29) against the book and correct the page. Also verify the kit contents and bond counts for the ~25 agency kits not read in this review, the five core/additional professions not read (intelligence analyst, case officer, lawyer, media specialist, soldier, all p. 23–26), and `POSTINGS` ([professions.ts:143-155](src/rules/data/professions.ts)).

### Missing features (rules gaps)

- [x] **R8. Failed-skill checks and advancement** (p. 28: check a box on a failure; after the session add 1D4 to each checked skill). The ASCII sheet prints the instruction ([sheet.ts:76](src/model/sheet.ts)) but the live sheet cannot record checks. Proposal: `Live.checked: string[]`, a checkbox per skill row, an "End session" button that rolls 1D4 per checked skill and stores the bonus (needs a place to store advancement; skill totals currently derive only from `Character`).
- [x] **R9. Unnatural skill gains should lower max SAN** (99 − Unnatural, p. 15). `maxSan` comes only from creation ([index.ts:74](src/rules/index.ts)). Needs the same advancement storage as R8.
- [x] **R10. Breaking Point should prompt a motivation swap** (pp. 38, 69: a new disorder replaces a motivation). The note in [live.ts:124](src/model/live.ts) only says "gain a disorder". Proposal: track `disorders` and `motivations` in `Live`, or at least mention the swap in the note.

---

## 2. Accessibility

- [x] **A1. Dynamic results and save failures are not announced**
  - **Where:** alerts list [LiveSheet.tsx:219-224](src/LiveSheet.tsx); fumble panel [206-218](src/LiveSheet.tsx); pending SAN panel [285-294](src/LiveSheet.tsx); "Not saved" at [Editor.tsx:98](src/Editor.tsx), [LiveSheet.tsx:204](src/LiveSheet.tsx), and the Agent load/failure text.
  - **Problem:** None has a live region, so screen-reader users never hear "Lost 4 SAN", "Breaking Point reached", or that their work isn't being saved.
  - **Fix:** `role="status"` on the alerts container and pending panel; `role="alert"` on "Not saved". The container must exist before its content changes, so render an empty `role="status"` wrapper and fill it.

- [x] **A2. Step buttons lose their names on phones**
  - **Where:** [app.css:112](src/styles/app.css), `display: none` on `.n + span`.
  - **Problem:** `display:none` removes the text from the accessibility tree; non-current steps are announced as "2." only.
  - **Fix:** Replace with the `.sr-only` pattern (already defined at [app.css:26](src/styles/app.css)) so the text stays readable by assistive tech.

- [x] **A3. No landmarks, no `<h1>`, no skip link, no title on editor/live pages**
  - **Where:** [Editor.tsx](src/Editor.tsx) and [LiveSheet.tsx](src/LiveSheet.tsx) render `div.shell` with no `<main>`; `Page.tsx` has one. `Win` renders `<h2>` only ([Win.tsx:8](src/ui/Win.tsx)); no page has an `<h1>`. Only `Page` sets `document.title`.
  - **Fix:** Wrap content in `<main>`; render a visually hidden `<h1>` (e.g. agent name or page name); add a "Skip to content" link in the menubar; set `document.title` in Editor and LiveSheet (agent name). Consider `aria-labelledby` on `Win`'s `<section>` so each window is a named region.

- [x] **A4. `+`/`−` buttons have no accessible names**
  - **Where:** `Counter` [LiveSheet.tsx:14-16](src/LiveSheet.tsx), stat-loss buttons [263](src/LiveSheet.tsx); `Btn` [ui/index.tsx:37](src/ui/index.tsx) accepts no `aria-label`.
  - **Fix:** Add an optional `label` prop to `Btn` passed as `aria-label`; use "Decrease HP" / "Increase HP" and "Restore one lost STR" style names.

- [x] **A5. Disabled plain buttons look enabled**
  - **Where:** `<button className="btn">` in [Home.tsx:29,41](src/pages/Home.tsx) and [Game.tsx:42,68-69](src/pages/Game.tsx). Disabled styling targets only `.btn[data-disabled]` ([app.css:68](src/styles/app.css)), and `.btn { color: inherit }` removes the browser's grey. Hover/focus styles also apply only to `button[data-rac].btn`.
  - **Fix:** Replace these buttons with `Btn`, or add `.btn:disabled` and `.btn:focus-visible` rules. The first is preferred (one button component).
  - **Note:** Read from CSS, not confirmed in a browser.

- [x] **A6. Contrast of `--dim` is below 4.5:1** (now `#5f5a4e` light, 5.15:1 on `--bg`; `#c27d27` dark, 5.18:1 on `--panel`. Check the look by eye.)
  - **Where:** [tokens.css:14](src/styles/tokens.css) and [26](src/styles/tokens.css).
  - **Measured:** light `--dim` on `--bg` 4.29:1 (on `--panel` 4.71:1); dark `--dim` on `--panel` 3.90:1 and on `--bg` 4.13:1. `--dim` is used for all helper text. Other tokens pass (fg 12.7 / 8.6, warn 6.4 / 6.2, ok 5.3 / 9.7).
  - **Fix:** Darken the light `--dim` and lighten the dark one until both exceed 4.5:1 on both backgrounds; re-measure.

- [x] **A7. Generated content is read aloud**
  - **Where:** `h2::before/after` and `h3::before/after` [app.css:9](src/styles/app.css); `.choice .mark::before` `[ ]`, `[X]`, `( )`, `(•)` [app.css:79-80](src/styles/app.css).
  - **Fix:** Use the alt-text form `content: '[ ]' / ''`, as already done for the menubar separator at [app.css:18](src/styles/app.css).

- [x] **A8. Professional-skill marker conveyed by `title` only**
  - **Where:** [ui/index.tsx:105](src/ui/index.tsx), `<span className="mark" title="Professional skill">▪</span>`.
  - **Fix:** Add `<span className="sr-only">professional skill</span>` and drop `aria-hidden` risk by hiding the glyph itself.

- [x] **A9. Weak focus indicators**
  - **Where:** `.steps button:hover/[data-focus-visible]` [app.css:47](src/styles/app.css) and `.choice[data-focus-visible]` [app.css:76](src/styles/app.css) use a 1px dashed outline; `.menubar a:focus-visible` is underline only.
  - **Fix:** 2px solid outline with offset, matching `.rollable:focus-visible` ([app.css:33](src/styles/app.css)).

- [x] **A10. Smaller semantics** — done: list role, `role="status"` for loading text, label association, redundant `aria-live`, caps limited to chrome and short labels (sentences and typed text keep their case), and `confirm()`/`alert()` replaced by an in-page `ConfirmDialog` and inline copy-failed messages.
  - `<ol class="steps" style="list-style:none">` loses list semantics in Safari/VoiceOver ([Editor.tsx:66](src/Editor.tsx)): add `role="list"`.
  - `aria-busy` on a `<p>` does nothing ([App.tsx:23](src/App.tsx), [Agent.tsx:26](src/pages/Agent.tsx), [Game.tsx:34](src/pages/Game.tsx)): use `role="status"`.
  - `<label>` without `htmlFor` plus a duplicate `aria-label`: [ui/index.tsx:78](src/ui/index.tsx) (`SkillPicker`) and [DetailsStep.tsx:55](src/steps/DetailsStep.tsx): use react-aria `Label`/`Group`.
  - `<output aria-live="polite">` in `Counter` ([LiveSheet.tsx:15](src/LiveSheet.tsx)): `output` is already a status role; the attribute is redundant.
  - `body { text-transform: uppercase }` ([app.css:3](src/styles/app.css)) hurts reading of prose. Limit uppercase to chrome (titles, buttons) and let help text and notes use normal case.
  - `confirm()`/`alert()` ([Editor.tsx:28,59](src/Editor.tsx), [LiveSheet.tsx:197-198](src/LiveSheet.tsx), [ReviewStep.tsx:19](src/steps/ReviewStep.tsx), [Game.tsx:31](src/pages/Game.tsx)) are blocking and unstyled; replace with an in-page dialog (react-aria `Modal`) or inline message.

Already good (keep): Alt-key shortcut avoiding bare letters, focus moved to the step heading, reduced-motion handling, the sr-only roll announcement, `aria-current="step"`.

---

## 3. Best practice and security

- [x] **B1. `index.html` cached for up to 1 hour**
  - **Done:** one `**` rule now sets `Cache-Control: no-cache` plus the security headers, and `/assets/**` (immutable) comes after it. Firebase's docs don't say which rule wins when two set the same header; community reports say the later one does. **After the next deploy, check with `curl -sI https://yourcodena.me/ | grep -i cache-control` and the same on a file in `/assets/`.**
  - **Where:** [firebase.json:6-26](firebase.json). Only `/assets/**` has a cache header.
  - **Problem:** Firebase's default for other files is `max-age=3600`. After a deploy the hashed assets are replaced, so a returning user with a cached `index.html` requests files that no longer exist.
  - **Fix:** Add a header rule for `**/*.html` (and the SPA rewrite target) with `Cache-Control: no-cache`.

- [x] **B2. CI never deploys Firestore rules**
  - **Done in the workflow:** `permissions:` set, `npm run lint` added, and a rules-deploy step added. **Manual:** grant the service account the "Firebase Rules Admin" role, and add the `VITE_APPCHECK_SITE_KEY` secret if you use App Check. The step was not run.
  - **Where:** [.github/workflows/deploy.yml:23-28](.github/workflows/deploy.yml) uses `action-hosting-deploy`, which deploys Hosting only.
  - **Fix:** Add a step running `firebase deploy --only firestore:rules --project codename-dg` with the service account, or document that rules are deployed by hand. Also set `permissions:` on the workflow (the hosting action needs `checks: write`; add `contents: read`).

- [x] **B3. Firestore rules are loose**
  - **Done:** shape and range checks on `character`, `live` and rolls (see the file). **Not tested:** no emulator was available. Run `firebase emulators:start --only firestore` or deploy to a test project and play a session before relying on it; a too-strict rule shows up as a silent "Not saved".
  - **Where:** [firestore.rules:27](firestore.rules) `character is map` (no size bound); [40-48](firestore.rules) roll fields only type-checked.
  - **Problems:** Anyone with the game ID can write oversized characters (document limit is 1 MiB) and forge roll-log entries (e.g. `roll: 9999`, any `outcome`). `live` is only checked for `notes`.
  - **Fix:** Bound `roll` 1–100, `chance` 0–100 (or −100…200 if penalties are stored), `penalty` ≥ 0, `outcome in [four values]`; require `character.version`, cap `character.keys().size()`; check `live.hp/wp/san/bp` are numbers 0–999. Add tests with the Firebase emulator if feasible.

- [x] **B4. Game IDs are guessable and unlimited**
  - **Done in code:** new game IDs have 6 random characters (~40 bits; old IDs still work); `firebase.ts` starts App Check when `VITE_APPCHECK_SITE_KEY` is set; the CSP allows reCAPTCHA. **Manual:** create a reCAPTCHA Enterprise key, register the app in App Check, set the env var and secret, then enforce App Check for Firestore. Not exercised end to end.
  - **Where:** [gameId.ts:12-15](src/lib/gameId.ts) (~30 bits) with `allow get: if true` ([firestore.rules:14](firestore.rules)); `createGame` is unrestricted.
  - **Fix:** Enable App Check (reCAPTCHA Enterprise) in the Firebase console and in [firebase.ts](src/lib/firebase.ts); lengthen IDs (e.g. three words plus 6 characters, ~45 bits) for new games while still accepting old ones.

- [x] **B5. Concurrent edits overwrite each other**
  - **Done:** `src/lib/diff.ts` finds the changed leaves and `agents.ts` writes only those with field paths, so two devices changing different fields no longer overwrite each other. The same field is still last-write-wins, and a second device doesn't see the other's change until it reloads. Not tried against a live Firestore.
  - **Where:** [agents.ts:21-22](src/lib/agents.ts) write the whole `character` / `live`; `loadAgent` is a one-shot read ([agents.ts:25](src/lib/agents.ts)).
  - **Problem:** Two devices on one agent (phone and laptop) clobber each other, last write wins.
  - **Fix:** Use field-path updates (e.g. `'live.hp'`) for live changes, or store an `updatedAt` and refuse to write when the stored value is newer than what was loaded, prompting a reload.

- [x] **B6. Live sheet goes stale after editing the character**
  - **Done:** `reconcile()` in `model/live.ts` clamps HP/WP/SAN and resizes Bonds whenever the character changes after play. Adaptation and disorders from a previous character are not reset by an import.
  - **Where:** [Agent.tsx:54-58](src/pages/Agent.tsx) only rebuilds the live sheet if it is `untouched`; `importJson` ([Editor.tsx:59](src/Editor.tsx)) replaces the character regardless.
  - **Problem:** After play, "Edit agent" then changing stats or importing another Agent leaves HP, SAN, Bonds and adaptation from the old build.
  - **Fix:** When the character changes after play, reconcile: clamp HP/WP/SAN to new maxima, resize `bonds` with `bondCount`, and confirm before importing over a played agent. Or warn that editing resets the live sheet.

- [x] **B7. Copy button timer bug**
  - **Where:** [ReviewStep.tsx:19](src/steps/ReviewStep.tsx): `setTimeout(() => setCopied(false), 1500)` runs even if the clipboard write fails and sits outside the `.then`.
  - **Fix:** Resolved by the `useCopy` hook in D2.

- [x] **B8. Repo and tooling hygiene**
  - **Done:** ESLint 9 with react-hooks and jsx-a11y (`npm run lint`, run in CI; ESLint 10 isn't supported by jsx-a11y yet), `tsbuildinfo` untracked and ignored (the file is removed from the git index but nothing is committed), mid-file import moved, schema and input length limits added, numeric stat-set sort, unused `data-theme` CSS removed, security headers added (with B1).
  - `tsconfig.tsbuildinfo` is tracked (empty). `git rm --cached` it and add it to [.gitignore](.gitignore).
  - Add ESLint with `react-hooks` and `jsx-a11y`; `exhaustive-deps` would flag [LiveSheet.tsx:68](src/LiveSheet.tsx) and [102](src/LiveSheet.tsx). Run it in CI before the build.
  - [character.ts:51](src/model/character.ts) imports mid-file; move to the top.
  - Add `maxLength`/`.max()` to zod strings and arrays in [character.ts](src/model/character.ts) so imported JSON can't exceed Firestore limits.
  - Stat-set comparison uses default `.sort()` (lexicographic) at [index.ts:172](src/rules/index.ts); use `(a, b) => a - b`.
  - [tokens.css:30](src/styles/tokens.css) has `data-theme` rules with no toggle in the UI: add a toggle or delete.
  - Missing security headers in [firebase.json](firebase.json): `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. The CSP allows `style-src 'unsafe-inline'` because of inline `style={{}}` (D6) plus react-aria positioning styles.

- [x] **B9. Test gaps**
  - **Done:** tests for the 4d6 range and dropped die, point-buy and stat-set validation, the ASCII sheet adapted boxes, `diffPaths` and `reconcile`. **Still open:** the live-sheet actions (`heal`, `sleep`, `recuperate`, `injuryTest`, `project`, `repress`) can't be unit-tested until D1 moves them out of `LiveSheet.tsx`.
  - [rules.test.ts:40](src/rules/rules.test.ts) only checks the 4d6 result is ≥ 3; also check ≤ 18 and that the lowest die is dropped (inject `rng`).
  - No tests for `validate` stat-set and point-buy branches, `heal`/`sleep`/`recuperate`/`injuryTest`/`project`/`repress` (closures in LiveSheet), or `asciiSheet` adapted boxes. Fixing D1 makes most of these unit-testable.

---

## 4. DRY and simplification

- [x] **D1. Move rules logic out of `LiveSheet.tsx`**
  - **Done:** the rules now live in `src/model/actions.ts` as pure functions (`strain`, `burnout`, `exhaust`, `heal`, `recuperate`, `sleep`, `planSanLoss`, `spendWillpower`, `project`, `repress`, `addDisorder`, and more), with 17 tests in `actions.test.ts`. `LiveSheet.tsx` just calls them.
  - **Where:** [LiveSheet.tsx:112-182](src/LiveSheet.tsx): `strain`, `burnout`, `exhaust`, `heal`, `recuperate`, `injuryTest`, `applyInjury`, `sleep`, `sanRoll`, `project`, `repress`.
  - **Why:** This is the app's most rules-dense code, mixed with UI in a 320-line component, and untested. `loseSan` and `loseStat` in `model/live.ts` already show the better pattern.
  - **Fix:** Export pure `(c, l, rng) => { live, notes }` functions from `model/live.ts`; leave the component to call them and show notes. Pass `rng` for tests.

- [x] **D2. Clipboard copy and "copied" state implemented three times**
  - **Where:** [LiveSheet.tsx:198](src/LiveSheet.tsx), [ReviewStep.tsx:19](src/steps/ReviewStep.tsx), [Game.tsx:31](src/pages/Game.tsx).
  - **Fix:** `useCopy(): [copied, copy(text)]` in `src/lib/`, with failure handled once.

- [x] **D3. Outcome success and class logic repeated four times**
  - **Done:** `isSuccess` and `outcomeClass` in `src/rules/outcome.ts` (a tiny module so the game page doesn't load all the rules), used by LiveSheet and Game. The game page's roll log now also underlines criticals and fumbles.
  - **Where:** `ok` in [LiveSheet.tsx:89](src/LiveSheet.tsx), `RollLine` [33-34](src/LiveSheet.tsx), [Game.tsx:86](src/pages/Game.tsx), and `includes('success')` string tests.
  - **Fix:** `isSuccess(outcome)` and `outcomeClass(outcome)` in `rules/`.

- [x] **D4. Menubar markup duplicated**
  - **Done:** `src/ui/MenuBar.tsx` (skip link plus menu bar) is used by `Editor` and `Page`.
  - **Where:** [Editor.tsx:48-62](src/Editor.tsx) and [Page.tsx:10-14](src/pages/Page.tsx).
  - **Fix:** One `MenuBar` component taking a `subtitle` and children.

- [x] **D5. Duplicated constants and patterns**
  - **Done:** `MAX_SKILL` and `TYPED_SKILLS` are used instead of literals, the veteran ids are replaced by `adapts` (R1), and the unused `ProfessionDef.note` and `VeteranDef.page` are removed. The `99` in max SAN stays; it is the SAN rule, not the skill cap.
  - Literal `99` at [index.ts:144](src/rules/index.ts) vs unused `MAX_SKILL` in [skills.ts:26](src/rules/data/skills.ts).
  - Typed-skill regex at [index.ts:188](src/rules/index.ts) vs `TYPED_SKILLS`.
  - `'violence'` / `'captivity'` ids repeated in [sheet.ts:80-81](src/model/sheet.ts) and [ReviewStep.tsx:54](src/steps/ReviewStep.tsx) (see R1).
  - Unused fields: `ProfessionDef.note`, `VeteranDef.page` appear unused; delete or use.

- [x] **D6. Inline `style={{}}`**
  - **Done:** all inline `style={{}}` are now classes in `app.css`. The CSP still needs `style-src 'unsafe-inline'` because react-aria positions its popovers with inline styles.
  - **Where:** [Editor.tsx:66,88](src/Editor.tsx), [ProfessionStep.tsx:15,59,92,103](src/steps/ProfessionStep.tsx), [DetailsStep.tsx:60](src/steps/DetailsStep.tsx), [BondsStep.tsx:27](src/steps/BondsStep.tsx), [LiveSheet.tsx:281](src/LiveSheet.tsx), [ui/index.tsx:63,79-80](src/ui/index.tsx).
  - **Fix:** Move to named classes in [app.css](src/styles/app.css). This is a step toward dropping `'unsafe-inline'` from the CSP.

- [x] **D7. Misc simplifications**
  - **Done:** `DerivedStep` became `DerivedTable` (no unused prop), `refreshSpent` now runs inside `setL` instead of an effect, and one shared `pick`/`randomInt` (in `rules/data/random.ts`) replaced the two copies. **Skipped on purpose:** replacing `l` + `latest` ref + `UndoStack` with a `useReducer`; it works and the change would be large for little gain.
  - `DerivedStep` ([steps/DerivedStep.tsx](src/steps/DerivedStep.tsx)) is not a step and takes an `up` prop it ignores; rename to `DerivedTable` and move to `ui/` or drop the prop.
  - `refreshSpent` runs in an effect on `l.hp` ([LiveSheet.tsx:102](src/LiveSheet.tsx)); derive it inside the same `setL` that changes HP instead.
  - `LiveSheet` keeps `l`, `latest` ref and an `UndoStack` in parallel ([LiveSheet.tsx:48-66](src/LiveSheet.tsx)); a `useReducer` holding `{ live, stack }` would remove the ref.
  - `DetailsStep.tsx` defines its own `pick`; [gameId.ts](src/lib/gameId.ts) has a different `pick`. Share one random-choice helper.

---

## 5. Added after the review

- [x] **S1. Tabs left open across a deploy fail with "Something went wrong"**
  - **Cause:** after a deploy the hashed files an old tab asks for are gone, so lazy page loads and the game page's on-demand imports fail.
  - **Fix:** `src/lib/staleBuild.ts` reloads the page once (not again within 10 seconds, so a truly broken deploy shows its error instead of looping). It is wired to Vite's `vite:preloadError` event in `main.tsx` and to the catch blocks that load code on demand in `Game.tsx` and `Home.tsx`. Unit tests cover the error matching and the loop guard.
  - **Not tested for real:** do it once by hand. Open the site, deploy again, then click "New agent" in the old tab; it should reload instead of showing an error.
