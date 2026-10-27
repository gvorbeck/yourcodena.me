import { SAN_KINDS, SAN_KIND_LABEL } from '../../src/model/live';

// The /dg command as registered with Discord (npm run discord:register). Option types: 1 subcommand, 3 string, 4 integer.
const ROLL = { type: 1, name: 'roll', description: 'Roll a test for your Agent, or any dice', options: [
  { type: 3, name: 'test', description: 'Stat, Luck, SAN, skill, or dice like 2D6+1', required: true, autocomplete: true },
  { type: 4, name: 'modifier', description: '-20 for a penalty, 20 for a bonus (tests only)', min_value: -100, max_value: 100 },
] };
const DAMAGE = { type: 1, name: 'damage', description: 'Your Agent gets hurt: roll or enter the damage and it comes off your HP', options: [
  { type: 3, name: 'dice', description: '1D10, 2D6+1, or a number like 7 (damage taken)', required: true, max_length: 20 },
] };

/** Short forms: `/dg r t: m:` is `/dg roll test: modifier:`, `/dg d d:` is `/dg damage dice:`. */
const SHORT = [
  { of: ROLL, name: 'r', options: { test: 't', modifier: 'm' } as Record<string, string> },
  { of: DAMAGE, name: 'd', options: { dice: 'd' } as Record<string, string> },
];
const shortCommand = ({ of, name, options }: (typeof SHORT)[number]) => ({
  ...of, name, description: `Short for /dg ${of.name}`,
  options: of.options.map((o) => ({ ...o, name: options[o.name] ?? o.name, description: `${o.name[0].toUpperCase()}${o.name.slice(1)}: ${o.description}` })),
});
/** Short command name → the full command and its option names, for bot.ts to expand what Discord sends. */
export const ALIASES: Record<string, { name: string; options: Record<string, string> }> = Object.fromEntries(SHORT.map((s) =>
  [s.name, { name: s.of.name, options: Object.fromEntries(Object.entries(s.options).map(([long, short]) => [short, long])) }]));

export const DG = {
  name: 'dg',
  description: 'Play your yourcodena.me Agent',
  contexts: [0], // server channels only
  options: [
    ROLL, shortCommand(SHORT[0]),
    DAMAGE, shortCommand(SHORT[1]),
    { type: 1, name: 'san', description: 'Your Agent loses SAN: SAN test and loss, with the sheet\'s rules', options: [
      { type: 3, name: 'loss', description: 'Success/failure like 0/1D6 (makes the SAN test), or 1D6 to just lose it', required: true, max_length: 20 },
      { type: 3, name: 'kind', description: 'What caused it (adaptation tracks violence and helplessness)', required: true,
        choices: SAN_KINDS.map((k) => ({ name: SAN_KIND_LABEL[k], value: k })) },
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
