// Local check that roll messages look right in Discord. Not deployed as a Function.
// Run: npm --prefix functions run webhook:test, then paste the webhook URL when asked.
// The URL is read from the prompt, so it never lands in shell history, a file or an env var.
import { createInterface } from 'node:readline/promises';
import { formatRoll, isWebhookUrl, postWebhook, webhookName } from './discord.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const url = (await rl.question('Discord webhook URL: ')).trim();
rl.close();
if (!isWebhookUrl(url)) { console.error('That is not a Discord webhook URL.'); process.exit(1); }

const name = await webhookName(url);
if (name === null) { console.error('Discord does not know that webhook. Was it deleted?'); process.exit(1); }
console.log(`Webhook "${name}" found. Posting 3 sample rolls…`);

const samples = [
  { agentName: 'Agent Smith', label: 'Firearms', chance: 45, penalty: 0, roll: 23, outcome: 'success' },
  { agentName: 'Agent Smith', label: 'SAN', chance: 52, penalty: 20, roll: 88, outcome: 'fumble' },
  { agentName: '@everyone **no ping, no bold**', label: 'Luck', chance: 50, penalty: 0, roll: 1, outcome: 'critical success' },
];
for (const r of samples) {
  const status = await postWebhook(url, formatRoll(r));
  console.log(status === 204 ? `sent: ${formatRoll(r)}` : `Discord answered ${status}`);
}
