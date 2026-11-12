// Core player flows, run against the Firestore emulator (see playwright.config.ts).
// Checks that need "did it reach the server?" use a second browser context: it has its own offline cache, so it can only see saved data.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { agentDoc, createAgent, freshPage, hp, savedHp } from './helpers';
import { newCharacter } from '../src/model/character';
import { encodeSheet, freshLive } from '../src/model/live';

test('a new agent goes through creation and shows on the game page', async ({ page }) => {
  const { gameUrl } = await createAgent(page);
  await expect(hp(page)).toHaveText('13 / 13');
  await page.getByRole('button', { name: /PERSONNEL FILE/ }).click(); // starts collapsed
  await expect(page.getByRole('region', { name: 'PERSONNEL FILE' })).toContainText('Codename: LAMP');
  await expect(page.getByRole('group', { name: 'Unnatural' })).toHaveAccessibleDescription(/maximum SAN is 99 minus it/); // counter notes reach screen readers

  await page.getByRole('link', { name: '< Game' }).click();
  await expect(page).toHaveURL(new RegExp(`${gameUrl}$`));
  const row = page.getByRole('listitem').filter({ hasText: 'Ada Rourke' });
  await expect(row).toContainText('Physician');
  await expect(row).toContainText('HP 13 · WP 11 · SAN 55');
  await expect(page.getByRole('region', { name: 'INITIATIVE' }).getByRole('listitem').filter({ hasText: 'LAMP' })).toContainText(/DEX \d\d/);
  await expect(page.getByRole('region', { name: 'TOP SKILLS' }).getByRole('listitem').filter({ hasText: 'Medicine' })).toContainText('LAMP');
  await expect(page.getByRole('region', { name: 'SANITY' })).toContainText('SAN 55 / BP 44');
});

test('live sheet changes are saved to the server', async ({ page, browser }) => {
  const { gameId, agentId, agentUrl } = await createAgent(page);
  await savedHp(gameId, agentId, 13);
  await page.getByRole('button', { name: 'Decrease HP' }).click();
  await page.getByRole('button', { name: 'Decrease HP' }).click();
  await expect(hp(page)).toHaveText('11 / 13');
  await savedHp(gameId, agentId, 11);

  const other = await freshPage(browser);
  await other.goto(agentUrl);
  await expect(hp(other)).toHaveText('11 / 13');
});

test('a roll on the live sheet appears in the game roll log', async ({ page, browser }) => {
  const { gameUrl } = await createAgent(page);
  await page.getByRole('button', { name: /^Medicine/ }).first().click();

  const other = await freshPage(browser);
  await other.goto(gameUrl);
  const entry = other.getByRole('region', { name: 'ROLL LOG' }).getByRole('row').filter({ hasText: 'Medicine' });
  await expect(entry).toContainText('LAMP');
  await expect(entry).toContainText(/critical success|success|failure|fumble/i);
});

test('an open sheet picks up changes saved from another device', async ({ page, browser }) => {
  const { gameId, agentId, agentUrl } = await createAgent(page);
  await savedHp(gameId, agentId, 13);
  const other = await freshPage(browser);
  await other.goto(agentUrl);
  await expect(hp(other)).toHaveText('13 / 13');

  await page.getByRole('button', { name: 'Decrease HP' }).click();
  await expect(hp(other)).toHaveText('12 / 13');
});

test('the game page advances every checked skill at the end of a session', async ({ page }) => {
  const { gameId, agentId, gameUrl } = await createAgent(page);
  await savedHp(gameId, agentId, 13);
  await (await agentDoc(gameId, agentId)).ref.update({ 'live.checked': ['Medicine', 'Unnatural'] }); // as if failed from Discord

  await page.goto(gameUrl);
  await page.getByRole('button', { name: 'End session: advance all checked skills' }).click();
  await page.getByRole('button', { name: 'Advance all', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Skills advanced' })).toContainText(/LAMP: Medicine \+[1-4]\./);

  await expect.poll(async () => (await agentDoc(gameId, agentId)).get('live.checked')).toEqual([]);
  const advance = (await agentDoc(gameId, agentId)).get('live.advance');
  expect(Object.keys(advance)).toEqual(['Medicine']); // Unnatural never advances (p. 29)
});

test('initiative and conditions show DEX as played: permanent injury and temporary loss', async ({ page }) => {
  const { gameId, agentId, gameUrl } = await createAgent(page);
  await savedHp(gameId, agentId, 13);
  const doc = await agentDoc(gameId, agentId);
  const dex: number = doc.get('character.stats.DEX');
  await doc.ref.update({ 'live.statMod': { DEX: -2 }, 'live.statLoss': { DEX: 1 }, 'live.exhausted': true }); // as if hurt from Discord

  await page.goto(gameUrl);
  const row = page.getByRole('region', { name: 'INITIATIVE' }).getByRole('listitem').filter({ hasText: 'LAMP' });
  await expect(row).toContainText(`DEX ${String(dex - 3).padStart(2, '0')}`);
  const conditions = page.getByRole('region', { name: 'CONDITIONS' }).getByRole('listitem').filter({ hasText: 'LAMP' });
  await expect(conditions).toContainText('DEX −1 (temporary)');
  await expect(conditions).toContainText('DEX −2 (permanent)');
  await expect(conditions).toContainText('−20% to tests');
  await expect(conditions).toContainText('Exhausted −20%');
});

test('the GM screen opens to the rules boxes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate game' }).click();
  const toggle = page.getByRole('button', { name: 'GM SCREEN' });
  await expect(toggle).toBeVisible(); // so the hidden check below sees the screen, not an empty page
  const lethality = page.getByRole('region', { name: 'LETHALITY' });
  await expect(lethality).toBeHidden();
  await toggle.click();
  await expect(lethality).toContainText('1D6 per 3%');
  await expect(lethality.locator('.term').first()).toHaveText('Hit'); // 'Hit: …' rows show the term as its own heading
});

test('the live sheet rolls plain dice', async ({ page }) => {
  await createAgent(page);
  await page.getByLabel('Dice', { exact: true }).fill('2d6 + 1');
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect(page.locator('output').filter({ hasText: /^#1 2D6\+1 \(\d\+\d\+1\) → \d+$/ })).toBeVisible(); // typed loosely, shown as the bot shows it
  await page.getByLabel('Dice', { exact: true }).fill('nope');
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect(page.getByText(/Write dice like 2D6\+1\./)).toBeVisible();
});

test('the Sanity box shows how far an agent is toward adapting', async ({ page }) => {
  const { gameId, agentId, gameUrl } = await createAgent(page);
  await savedHp(gameId, agentId, 13);
  await (await agentDoc(gameId, agentId)).ref.update({ 'live.adapt.v': 2 });
  await page.goto(gameUrl);
  const sanity = page.getByRole('region', { name: 'SANITY' }).getByRole('listitem').filter({ hasText: 'LAMP' });
  await expect(sanity).toContainText(/violence 2\/3/i);
});

test('the Handler boxes flag a downed agent and list bonds and disorders', async ({ page }) => {
  const { gameId, agentId, gameUrl } = await createAgent(page);
  await savedHp(gameId, agentId, 13);
  await (await agentDoc(gameId, agentId)).ref.update({ 'live.hp': 2, 'live.disorders': ['Insomnia'] }); // as if from Discord

  await page.goto(gameUrl);
  const health = page.getByRole('region', { name: 'HEALTH' }).getByRole('listitem').filter({ hasText: 'LAMP' });
  await expect(health).toContainText('HP 02/13');
  await expect(health).toContainText(/Unconscious, CON×5 test/i);
  const bonds = page.getByRole('region', { name: 'BONDS & DISORDERS' }).getByRole('listitem').filter({ hasText: 'LAMP' });
  await expect(bonds).toContainText(/Sister\s*11/i);
  await expect(bonds).toContainText(/Insomnia/i);
});

test('a Handler adjustment takes a typed skill like Foreign Language(Spanish)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate game' }).click();
  await page.getByRole('button', { name: 'New agent' }).click();
  await page.waitForURL(/\/a\//);
  await page.getByRole('button', { name: 'Next >' }).click();
  await page.getByLabel('Adjust skill', { exact: true }).selectOption('Foreign Language');
  await page.getByRole('combobox', { name: 'Adjust skill type' }).click();
  await page.keyboard.type('Spanish');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.row.adjust')).toContainText('Foreign Language(Spanish)');
});

test('a game this browser cannot reach is not reported as missing', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate game' }).click();
  await page.waitForURL(/\/g\/[^/]+$/);
  const blocked = await browser.newContext();
  await blocked.route(/127\.0\.0\.1:8080/, (r) => r.abort());
  const p = await blocked.newPage();
  await p.goto(page.url());
  await expect(p.getByText('Still trying to reach the game')).toBeVisible({ timeout: 15_000 }); // long after the cache has answered "no such document"
  await expect(p.getByRole('heading', { name: 'NO SUCH GAME' })).toHaveCount(0);
  await expect(p.getByText('Loading game…')).toBeVisible();
});

test('a game ID nobody created says so online, and can be created from there', async ({ page }) => {
  await page.goto(`/g/never-made-${Date.now()}`);
  await expect(page.getByRole('heading', { name: 'NO SUCH GAME' })).toBeVisible();
  await page.getByRole('button', { name: /^Create game/ }).click();
  await expect(page.getByRole('heading', { name: /^GAME \/\// })).toBeVisible();
});

test('Luck is pure chance: the sheet\'s penalty does not touch it', async ({ page }) => {
  await createAgent(page);
  await page.getByRole('button', { name: 'Increase Penalty %' }).click();
  await page.getByRole('button', { name: 'Luck', exact: true }).click();
  await expect(page.locator('.rollbar .latest')).toContainText('Luck 50%:');
});

test('undo drops a half-resolved SAN loss but keeps the typed loss', async ({ page }) => {
  await createAgent(page);
  await page.getByLabel('SAN loss as success/failure, like 0/1D4').fill('0/1D6');
  await page.getByRole('button', { name: 'Roll SAN loss' }).click();
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Decrease HP' }).click();
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('SAN loss as success/failure, like 0/1D4')).toHaveValue('0/1D6');
});

test('a standalone sheet keeps its changes in the link', async ({ page }) => {
  const c = newCharacter();
  c.details.name = 'Solo';
  await page.goto('/' + encodeSheet(c, freshLive(c)));
  await expect(hp(page)).toHaveText('10 / 10');
  const before = page.url();
  await page.getByRole('button', { name: 'Decrease HP' }).click();
  await expect.poll(() => page.url()).not.toBe(before); // the link is the save file
  await page.reload();
  await expect(hp(page)).toHaveText('9 / 10');
});

test('a SAN loss waiting for a decision keeps its buttons out of the announced region', async ({ page }) => {
  await createAgent(page);
  await page.getByRole('button', { name: 'Roll SAN loss' }).click();
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeVisible();
  await expect(page.locator('[role=status]').getByRole('button')).toHaveCount(0);
});

test('a game backup downloads and its agents can be added back from the file', async ({ page }) => {
  await createAgent(page);
  await page.getByRole('link', { name: '< Game' }).click(); // in-app, so the sheet's autosave flushes first
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download game backup' }).click()]);
  const path = await download.path();
  expect(JSON.parse(readFileSync(path, 'utf8')).agents).toHaveLength(1);
  await page.getByLabel('Agent or backup file').setInputFiles(path);
  await expect(page.getByRole('status').filter({ hasText: 'Added 1 agent' })).toBeVisible();
  await expect(page.locator('ul.agents > li').filter({ hasText: 'LAMP' })).toHaveCount(2);
});

test('a standalone sheet link can be added to a game, live play and all', async ({ page }) => {
  const c = newCharacter();
  c.details.name = 'Solo';
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate game' }).click();
  await page.waitForURL(/\/g\/[^/]+$/);
  await page.getByLabel('Sheet link').fill(`https://yourcodena.me/${encodeSheet(c, { ...freshLive(c), hp: 7 })}`);
  await page.getByRole('button', { name: 'Add sheet' }).click();
  await expect(page.locator('ul.agents > li').filter({ hasText: 'Solo' })).toContainText('HP 7');
  await page.getByLabel('Sheet link').fill('https://example.com/nothing');
  await page.getByRole('button', { name: 'Add sheet' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'not a sheet link' })).toBeVisible();
});
