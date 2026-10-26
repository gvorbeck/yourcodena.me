// The /dg command as registered with Discord (npm run discord:register). Option types: 1 subcommand, 3 string, 4 integer.
export const DG = {
  name: 'dg',
  description: 'Play your yourcodena.me Agent',
  contexts: [0], // server channels only
  options: [
    { type: 1, name: 'roll', description: 'Roll a test for your Agent', options: [
      { type: 3, name: 'test', description: 'Stat, Luck, SAN or skill', required: true, autocomplete: true },
      { type: 4, name: 'modifier', description: '-20 for a penalty, 20 for a bonus', min_value: -100, max_value: 100 },
    ] },
    { type: 1, name: 'sheet', description: "Your Agent's HP, WP, SAN and BP (only you see it)" },
    { type: 1, name: 'claim', description: 'Play an Agent from the linked game', options: [
      { type: 3, name: 'agent', description: 'Agent', required: true, autocomplete: true },
    ] },
    { type: 1, name: 'unclaim', description: "Release your Agent (or, with Manage Channels, anyone's)", options: [
      { type: 3, name: 'agent', description: 'Agent to release (leave empty for your own)', autocomplete: true },
    ] },
    { type: 1, name: 'link', description: 'Link this channel to a yourcodena.me game (needs Manage Channels)', options: [
      { type: 3, name: 'game', description: 'Game ID, as in yourcodena.me/g/<game ID>', required: true },
    ] },
    { type: 1, name: 'unlink', description: 'Unlink this channel from its game (needs Manage Channels)' },
  ],
};
