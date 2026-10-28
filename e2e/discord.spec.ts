// The Discord bot's real command handler (functions/src/bot.ts), writing to the emulator while a sheet is open in the browser.
import { expect, test } from '@playwright/test';
import { agentDoc, createAgent, finishAgent, hp, savedHp, startAgent } from './helpers';
import { handle, type Interaction } from '../functions/src/bot';

let now = Date.now();
/** One `/dg <sub>` slash command from a player with Manage Channels. Each call is 3 s apart, past the bot's cooldown. */
const dg = (guild: string, sub: string, options: Record<string, string> = {}) => {
  now += 3000;
  const i: Interaction = {
    type: 2, guild_id: guild, channel_id: 'c1',
    member: { user: { id: `u-${guild}` }, permissions: String(1 << 4) },
    data: { name: 'dg', options: [{ name: sub, type: 1, options: Object.entries(options).map(([name, value]) => ({ name, type: 3, value })) }] },
  };
  return handle(i, now) as Promise<{ data?: { content?: string } }>;
};

test('damage from Discord lands on an open live sheet and in the roll log', async ({ page }) => {
  const { gameId, agentId, gameUrl } = await createAgent(page);
  await expect(hp(page)).toHaveText('13 / 13');
  // A player claims from Discord seconds after creating the agent, not milliseconds: wait until the finished sheet is saved.
  await savedHp(gameId, agentId, 13);
  const guild = `guild-${gameId}`; // one server per test, so tests can run in parallel

  expect((await dg(guild, 'link', { game: gameId })).data?.content).toContain('now plays game');
  expect((await dg(guild, 'claim', { agent: agentId })).data?.content).toContain('now plays');
  expect((await dg(guild, 'damage', { dice: '3' })).data?.content).toContain('HP 13 → 10'); // a plain number, so the damage is always 3

  await expect(hp(page)).toHaveText('10 / 13'); // no reload: the open sheet merges the bot's write
  await page.goto(gameUrl);
  await expect(page.getByRole('listitem').filter({ hasText: 'LAMP' })).toContainText('HP 10');
  await expect(page.getByRole('row').filter({ hasText: 'HP loss' })).toContainText('HP 13 → 10');
});

test('damage taken while the sheet is still being created is kept once it is finished', async ({ page }) => {
  const { gameId, agentId } = await startAgent(page);
  // The bot builds the sheet from the saved character, so wait for the Physician's stats to be saved.
  await expect.poll(async () => (await agentDoc(gameId, agentId)).get('character.professionId')).toBe('physician');
  const guild = `guild-${gameId}`;
  await dg(guild, 'link', { game: gameId });
  await dg(guild, 'claim', { agent: agentId });
  expect((await dg(guild, 'damage', { dice: '3' })).data?.content).toContain('HP 13 → 10');

  await finishAgent(page);
  await expect(hp(page)).toHaveText('10 / 13');
  await page.reload(); // what the server kept, not just what this tab shows
  await expect(hp(page)).toHaveText('10 / 13');
});
