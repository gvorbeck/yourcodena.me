import { createRequire } from 'node:module';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// firebase-admin is installed under functions/; load it from there so the Discord bot and these helpers share one app.
const admin = createRequire(new URL('../functions/package.json', import.meta.url));
const { getApps, initializeApp } = admin('firebase-admin/app');
const { getFirestore } = admin('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: 'demo-codename' }); // FIRESTORE_EMULATOR_HOST is set by `firebase emulators:exec`

/** The agent document as the server has it, read past every browser cache. */
export const agentDoc = (gameId: string, agentId: string) => getFirestore().doc(`games/${gameId}/agents/${agentId}`).get();
/** Waits until the server has `hp` for the agent: real players don't act within the second before a sheet saves. */
export const savedHp = (gameId: string, agentId: string, hp: number) =>
  expect.poll(async () => (await agentDoc(gameId, agentId)).get('live.hp')).toBe(hp);

// The Discord panel calls a real Cloud Function URL; keep tests offline apart from the local emulator.
const offline = (context: BrowserContext) => context.route('**/*.cloudfunctions.net/**', (r) => r.abort());
test.beforeEach(({ context }) => offline(context));

// react-aria hides the real input under its label, so click the label like a person would.
const choose = (page: Page, text: string | RegExp) => page.locator('label.choice', { hasText: text }).first().click();
const next = (page: Page) => page.getByRole('button', { name: 'Next >' }).click();
export const hp = (page: Page) => page.getByRole('group', { name: 'HP', exact: true }).locator('output');

/** A page in a new browser context: its own offline cache, so it only sees what reached the server. */
export async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  await offline(context);
  return context.newPage();
}

/** Creates a game and a Physician (13 HP) through every creation step but the last; ends on Final details, unnamed. */
export async function startAgent(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate game' }).click();
  await page.getByRole('button', { name: 'New agent' }).click();
  await page.waitForURL(/\/g\/[^/]+\/a\/[^/]+$/);
  const [, gameId, agentId] = new URL(page.url()).pathname.match(/^\/g\/([^/]+)\/a\/([^/]+)$/)!;

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
  return { gameId, agentId, gameUrl: `/g/${gameId}` };
}

/** Names the agent started by startAgent and opens its live sheet. */
export async function finishAgent(page: Page) {
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Ada Rourke');
  await page.getByRole('textbox', { name: 'Codename (optional)' }).fill('LAMP');
  await next(page);

  await expect(page.getByText('All steps complete')).toBeVisible();
  await page.getByRole('button', { name: 'Live Sheet' }).click();
  await expect(page.getByRole('heading', { name: /Live sheet \/\/ Ada Rourke/i })).toBeVisible();
}

/** A complete Physician (13 HP) in a new game, through every creation step; ends on the live sheet. */
export async function createAgent(page: Page) {
  const ids = await startAgent(page);
  await finishAgent(page);
  return { ...ids, agentUrl: page.url() };
}
