import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineString, projectID } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { overBudget, type BudgetAlert } from './budget.js';
import { handle, privately, type Interaction } from './bot.js';
import { gamePath, secretPath } from '../../src/lib/paths';
import { isGameId } from '../../src/lib/gameId';
import { formatEntry, isWebhookUrl, postWebhook, verifyDiscord, webhookName, type Roll } from './discord.js';

// Cost caps for every Function in this project (docs/discord-plan.md, phase 0).
// us-central1 because Firestore triggers must sit with the database, which is in nam5.
setGlobalOptions({ region: 'us-central1', maxInstances: 5, timeoutSeconds: 10, memory: '256MiB' });

initializeApp();
const db = getFirestore();

/**
 * Kill switch: the $5 budget publishes to `budget-alerts`. Once actual cost reaches the budget,
 * unlink the billing account, which stops everything that costs money (and takes the site down).
 * To bring the site back, see "If the site was shut off for going over budget" in the README.
 */
export const budgetKillSwitch = onMessagePublished<BudgetAlert>({ topic: 'budget-alerts', region: 'us-east1', maxInstances: 1 }, async (event) => {
  const alert = event.data.message.json;
  if (!overBudget(alert)) return;

  // Loaded here, not at the top, so other Functions' cold starts don't pay for it (the bot has 3 seconds to answer).
  const { CloudBillingClient } = await import('@google-cloud/billing');
  const billing = new CloudBillingClient();
  const name = `projects/${projectID.value()}`;
  const [info] = await billing.getProjectBillingInfo({ name });
  if (!info.billingEnabled) return; // already off; Google keeps sending alerts for the rest of the month

  await billing.updateProjectBillingInfo({ name, projectBillingInfo: { billingAccountName: '' } });
  logger.warn('Budget reached: billing disabled', { cost: alert.costAmount, budget: alert.budgetAmount });
});

/** gameSecrets/{gameId}: { webhookUrl, webhookName, updatedAt }. Rules deny all browser access; only Functions read it. */
const secretRef = (gameId: string) => db.doc(secretPath(gameId));

/**
 * The game page's Discord panel. `url` omitted: report status. `url: ''`: disconnect.
 * Otherwise check the URL with Discord, post a hello, and save it. The URL is never sent back.
 * shortcut: anyone with the game link can change the webhook until phase 2b adds a Handler role.
 */
export const discordWebhook = onCall<{ gameId?: unknown; url?: unknown }>(async (req) => {
  const { gameId, url } = req.data ?? {};
  if (typeof gameId !== 'string' || !isGameId(gameId)) throw new HttpsError('invalid-argument', 'Bad game ID.');
  if (!(await db.doc(gamePath(gameId)).get()).exists) throw new HttpsError('not-found', 'No such game.');

  if (url === undefined) {
    const s = (await secretRef(gameId).get()).data();
    return { connected: Boolean(s?.webhookUrl), name: s?.webhookName ?? '' };
  }
  if (url === '') {
    await secretRef(gameId).delete();
    return { connected: false, name: '' };
  }
  if (typeof url !== 'string' || !isWebhookUrl(url.trim())) throw new HttpsError('invalid-argument', "That isn't a Discord webhook URL.");

  const hook = url.trim();
  const name = await webhookName(hook);
  if (name === null) throw new HttpsError('failed-precondition', "Discord doesn't recognise that webhook. Was it deleted?");
  const status = await postWebhook(hook, `Connected to YOURCODENA.ME game \`${gameId}\`. Rolls from this game will post here.`);
  if (status !== 204) throw new HttpsError('unavailable', `Discord refused the test message (${status}). Try again in a minute.`);

  await secretRef(gameId).set({ webhookUrl: hook, webhookName: name, updatedAt: Date.now() });
  return { connected: true, name };
});

/**
 * Posts to a game's dice channel through its webhook, if connected. Never retries: the bot already gave the player
 * a private copy, and the roll log keeps every entry. A webhook deleted in Discord is forgotten.
 */
async function toDiceChannel(gameId: string, content: string) {
  const ref = secretRef(gameId);
  const url = (await ref.get()).get('webhookUrl') as string | undefined;
  if (!url) return;
  const status = await postWebhook(url, content);
  if (status === 404) await ref.update({ webhookUrl: FieldValue.delete() });
  else if (status !== 204) logger.warn('Discord did not take a post', { gameId, status });
}

/** Posts each new roll-log entry (d% tests, plain dice, damage taken) to the game's Discord channel. */
export const rollToDiscord = onDocumentCreated('games/{gameId}/rolls/{rollId}', async (event) => {
  const roll = event.data?.data() as (Roll & { answered?: boolean }) | undefined;
  if (!roll || roll.answered) return; // /dg rolls with no webhook: the bot already answered in its channel
  await toDiceChannel(event.params.gameId, formatEntry(roll));
});

const discordPublicKey = defineString('DISCORD_PUBLIC_KEY', { description: 'Discord app public key (Developer Portal → General Information → Public Key)' });

/** Discord's Interactions Endpoint for /dg (functions/src/bot.ts). Only requests signed with the app's key get through. */
export const discordBot = onRequest({ invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  if (!verifyDiscord(discordPublicKey.value(), req.get('X-Signature-Ed25519') ?? '', req.get('X-Signature-Timestamp') ?? '', req.rawBody)) {
    res.status(401).send('Bad signature');
    return;
  }
  try {
    res.json(await handle(req.body as Interaction));
  } catch (e) {
    logger.error('discordBot failed', e);
    res.json(privately('Something went wrong. Try again.'));
  }
});
