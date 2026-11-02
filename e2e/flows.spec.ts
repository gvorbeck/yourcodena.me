// Core player flows, run against the Firestore emulator (see playwright.config.ts).
// Checks that need "did it reach the server?" use a second browser context: it has its own offline cache, so it can only see saved data.
import { expect, test } from '@playwright/test';
import { agentDoc, createAgent, freshPage, hp, savedHp } from './helpers';

test('a new agent goes through creation and shows on the game page', async ({ page }) => {
  const { gameUrl } = await createAgent(page);
  await expect(hp(page)).toHaveText('13 / 13');

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
