// Core player flows, run against the Firestore emulator (see playwright.config.ts).
// Checks that need "did it reach the server?" use a second browser context: it has its own offline cache, so it can only see saved data.
import { expect, test, type Browser, type Page } from '@playwright/test';

// The Discord panel calls a real Cloud Function URL; keep tests offline apart from the local emulator.
test.beforeEach(async ({ context }) => {
  await context.route('**/*.cloudfunctions.net/**', (r) => r.abort());
});

// react-aria hides the real input under its label, so click the label like a person would.
const choose = (page: Page, text: string | RegExp) => page.locator('label.choice', { hasText: text }).first().click();
const next = (page: Page) => page.getByRole('button', { name: 'Next >' }).click();
const hp = (page: Page) => page.getByRole('group', { name: 'HP', exact: true }).locator('output');

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  await context.route('**/*.cloudfunctions.net/**', (r) => r.abort());
  return context.newPage();
}

/** Creates a game and a complete Physician through every creation step; ends on the live sheet. Returns the game and agent URLs. */
async function createAgent(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate game' }).click();
  await page.getByRole('button', { name: 'New agent' }).click();
  const gameUrl = page.url().replace(/\/a\/.*$/, '');

  await choose(page, 'Assignable set');
  await page.getByRole('button', { name: /Well-rounded/ }).click();
  await next(page);

  await choose(page, /^Physician/);
  await choose(page, 'Forensics');
  await choose(page, 'Surgery');
  await page.locator('#pkg').selectOption({ label: 'Nurse, Paramedic, or Pre-Med' });
  await next(page);

  for (const [i, b] of ['Sister', 'Old partner', 'Therapist'].entries()) await page.getByLabel(`Bond ${i + 1} — score 11`).fill(b);
  await next(page);

  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Ada Rourke');
  await page.getByRole('textbox', { name: 'Codename (optional)' }).fill('LAMP');
  await next(page);

  await expect(page.getByText('All steps complete')).toBeVisible();
  await page.getByRole('button', { name: 'Live Sheet' }).click();
  await expect(page.getByRole('heading', { name: /Live sheet \/\/ Ada Rourke/i })).toBeVisible();
  return { gameUrl, agentUrl: page.url() };
}

test('a new agent goes through creation and shows on the game page', async ({ page }) => {
  const { gameUrl } = await createAgent(page);
  await expect(hp(page)).toHaveText('13 / 13');

  await page.getByRole('link', { name: '< Game' }).click();
  await expect(page).toHaveURL(gameUrl);
  const row = page.getByRole('listitem').filter({ hasText: 'LAMP' });
  await expect(row).toContainText('Physician');
  await expect(row).toContainText('HP 13 · WP 11 · SAN 55');
});

test('live sheet changes are saved to the server', async ({ page, browser }) => {
  const { agentUrl } = await createAgent(page);
  await page.getByRole('button', { name: 'Decrease HP' }).click();
  await page.getByRole('button', { name: 'Decrease HP' }).click();
  await expect(hp(page)).toHaveText('11 / 13');

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
  const { agentUrl } = await createAgent(page);
  const other = await freshPage(browser);
  await other.goto(agentUrl);
  await expect(hp(other)).toHaveText('13 / 13');

  await page.getByRole('button', { name: 'Decrease HP' }).click();
  await expect(hp(other)).toHaveText('12 / 13');
});
