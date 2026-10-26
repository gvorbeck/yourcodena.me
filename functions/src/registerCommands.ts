// Registers /dg with Discord. Run: npm --prefix functions run discord:register
// Asks for the Application ID and bot token at the prompt, so the token never lands in shell history, a file or Firebase.
import { createInterface } from 'node:readline/promises';
import { DG } from './commands.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const appId = (await rl.question('Application ID: ')).trim();
const token = (await rl.question('Bot token: ')).trim();
rl.close();
if (!/^\d{15,25}$/.test(appId) || !token) { console.error('Need the numeric Application ID and the bot token.'); process.exit(1); }

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: 'PUT', // replaces the app's whole command list with just /dg
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([DG]),
});
if (!res.ok) { console.error(`Discord answered ${res.status}: ${await res.text()}`); process.exit(1); }
console.log('Registered /dg.');
console.log(`Add the app to your server: https://discord.com/oauth2/authorize?client_id=${appId}&scope=applications.commands`);
