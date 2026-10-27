import { SAN_KINDS } from '../../src/model/live';

// The /dg command as registered with Discord (npm run discord:register). Option types: 1 subcommand, 3 string, 4 integer.
export const DG = {
  name: 'dg',
  description: 'Play your yourcodena.me Agent',
  contexts: [0], // server channels only
  options: [
    { type: 1, name: 'roll', description: 'Roll a test for your Agent, or any dice', options: [
      { type: 3, name: 'test', description: 'Stat, Luck, SAN, skill, or dice like 2D6+1', required: true, autocomplete: true },
      { type: 4, name: 'modifier', description: 'Tests only: -20 for a penalty, 20 for a bonus', min_value: -100, max_value: 100 },
    ] },
    { type: 1, name: 'r', description: 'Short for /dg roll', options: [
      { type: 3, name: 't', description: 'Test: stat, Luck, SAN, skill, or dice like 2D6+1', required: true, autocomplete: true },
      { type: 4, name: 'm', description: 'Modifier: -20 for a penalty, 20 for a bonus', min_value: -100, max_value: 100 },
    ] },
    { type: 1, name: 'damage', description: 'Your Agent gets hurt: roll or enter the damage and it comes off your HP', options: [
      { type: 3, name: 'dice', description: 'Damage taken: 1D10, 2D6+1, or a number like 7', required: true, max_length: 20 },
    ] },
    { type: 1, name: 'd', description: 'Short for /dg damage', options: [
      { type: 3, name: 'd', description: 'Damage taken: 1D10, 2D6+1, or a number like 7', required: true, max_length: 20 },
    ] },
    { type: 1, name: 'san', description: 'Your Agent loses SAN: SAN test and loss, with the sheet\'s rules', options: [
      { type: 3, name: 'loss', description: 'Success/failure like 0/1D6 (makes the SAN test), or 1D6 to just lose it', required: true, max_length: 20 },
      { type: 3, name: 'kind', description: 'What caused it (adaptation tracks violence and helplessness)', required: true,
        choices: SAN_KINDS.map((k) => ({ name: k[0].toUpperCase() + k.slice(1), value: k })) },
    ] },
    { type: 1, name: 'sheet', description: "Your Agent's HP, WP, SAN and BP (only you see it)" },
    { type: 1, name: 'claim', description: 'Play an Agent from the linked game', options: [
      { type: 3, name: 'agent', description: 'Agent', required: true, autocomplete: true },
    ] },
    { type: 1, name: 'unclaim', description: "Release your Agent (or, with Manage Channels, anyone's)", options: [
      { type: 3, name: 'agent', description: 'Agent to release (leave empty for your own)', autocomplete: true },
    ] },
    { type: 1, name: 'link', description: 'Link this server to a yourcodena.me game (needs Manage Channels)', options: [
      { type: 3, name: 'game', description: 'Game ID, as in yourcodena.me/g/<game ID>', required: true },
    ] },
    { type: 1, name: 'unlink', description: 'Unlink this server from its game (needs Manage Channels)' },
  ],
};
