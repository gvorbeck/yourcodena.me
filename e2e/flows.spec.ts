// Core player flows, run against the Firestore emulator (see playwright.config.ts).
// Checks that need "did it reach the server?" use a second browser context: it has its own offline cache, so it can only see saved data.
import { expect, test } from '@playwright/test';
import { createAgent, freshPage, hp, savedHp } from './helpers';

test('a new agent goes through creation and shows on the game page', async ({ page }) => {
  const { gameUrl } = await createAgent(page);
  await expect(hp(page)).toHaveText('13 / 13');

  await page.getByRole('link', { name: '< Game' }).click();
  await expect(page).toHaveURL(new RegExp(`${gameUrl}$`));
  const row = page.getByRole('listitem').filter({ hasText: 'LAMP' });
  await expect(row).toContainText('Physician');
  await expect(row).toContainText('HP 13 · WP 11 · SAN 55');
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
  const entry = other.getByRole('row').filter({ hasText: 'Medicine' });
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
