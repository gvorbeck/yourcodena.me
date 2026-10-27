import { describe, expect, it } from 'vitest';
import { formatEntry, formatRoll, isWebhookUrl, plain, postWebhook } from './discord.js';

const roll = { agentName: 'Agent Smith', label: 'Firearms', chance: 45, penalty: 0, roll: 23, outcome: 'success' };

describe('formatRoll', () => {
  it('matches the game page roll log', () => {
    expect(formatRoll(roll)).toBe('**Agent Smith** · Firearms 45% → 23 · Success');
    expect(formatRoll({ ...roll, penalty: 20, roll: 5, outcome: 'critical success' })).toBe('**Agent Smith** · Firearms 45% (−20) → 05 · **CRITICAL SUCCESS**');
  });
  it('defuses Markdown and masked links in player-typed names', () => {
    expect(formatRoll({ ...roll, agentName: '**[click](https://evil.example)**', label: 'a\n# b' }))
      .toBe('**\\*\\*\\[click\\]\\(https://evil.example\\)\\*\\*** · a \\# b 45% → 23 · Success');
  });
  it('names unnamed agents', () => {
    expect(formatRoll({ ...roll, agentName: '  ' })).toMatch(/^\*\*Unnamed agent\*\*/);
  });
});

describe('plain', () => {
  it('stops Discord drawing mention pills', () => {
    expect(plain('@everyone <@123>')).toBe('@​everyone <@​123\\>');
  });
  it('caps length before escaping', () => expect(plain('x'.repeat(500))).toHaveLength(100));
});

describe('isWebhookUrl', () => {
  const id = '1'.repeat(19), token = 'A'.repeat(68);
  it('accepts Discord webhooks', () => {
    expect(isWebhookUrl(`https://discord.com/api/webhooks/${id}/${token}`)).toBe(true);
    expect(isWebhookUrl(`https://ptb.discord.com/api/webhooks/${id}/${token}`)).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isWebhookUrl(`http://discord.com/api/webhooks/${id}/${token}`)).toBe(false);
    expect(isWebhookUrl(`https://discord.com.evil.example/api/webhooks/${id}/${token}`)).toBe(false);
    expect(isWebhookUrl(`https://discord.com/api/webhooks/${id}/${token}?x=1`)).toBe(false);
    expect(isWebhookUrl('')).toBe(false);
  });
});

describe('postWebhook', () => {
  it('blocks every ping', async () => {
    let sent: { allowed_mentions?: unknown } = {};
    const fake = (async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response(null, { status: 204 }); }) as typeof fetch;
    expect(await postWebhook('https://discord.com/api/webhooks/1/x', '@everyone', fake)).toBe(204);
    expect(sent.allowed_mentions).toEqual({ parse: [] });
  });
});

describe('verifyDiscord', () => {
  it('accepts only bodies signed with the app key', async () => {
    const { generateKeyPairSync, sign } = await import('node:crypto');
    const { verifyDiscord } = await import('./discord.js');
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const hex = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(12).toString('hex');
    const body = Buffer.from('{"type":1}'), ts = '1700000000';
    const sig = sign(null, Buffer.concat([Buffer.from(ts), body]), privateKey).toString('hex');
    const now = 1700000000_000;
    expect(verifyDiscord(hex, sig, ts, body, now)).toBe(true);
    expect(verifyDiscord(hex, sig, ts, Buffer.from('{"type":2}'), now)).toBe(false);
    expect(verifyDiscord(hex, sig, '1700000001', body, now)).toBe(false);
    expect(verifyDiscord(hex, 'zz', ts, body, now)).toBe(false);
    expect(verifyDiscord(hex, sig, ts, body, now + 6 * 60_000)).toBe(false); // replayed later
    expect(verifyDiscord(hex, sig, ts, body, now - 6 * 60_000)).toBe(false);
  });
});

describe('formatEntry', () => {
  const base = { agentName: 'Drew Rook', chance: 0, penalty: 0, outcome: '' };
  it('formats plain dice', () => {
    expect(formatEntry({ ...base, kind: 'dice', label: '2D6+1', dice: [4, 4], mod: 1, roll: 9 })).toBe('**Drew Rook** · 2D6+1 (4+4+1) → **9**');
    expect(formatEntry({ ...base, kind: 'dice', label: '1D10', dice: [7], mod: 0, roll: 7 })).toBe('**Drew Rook** · 1D10 → **7**');
  });
  it('formats HP and SAN lost, with what the rules say', () => {
    const loss = { ...base, kind: 'loss' as const, dice: [] as number[], mod: 0 };
    expect(formatEntry({ ...loss, stat: 'HP', label: '1D10', dice: [3], roll: 3, from: 11, to: 8, notes: [] }))
      .toBe('**Drew Rook** loses **3** HP · 1D10 · HP 11 → 8');
    expect(formatEntry({ ...loss, stat: 'HP', label: '7', roll: 7, from: 11, to: 4, notes: ['Stunned (p. 55)'] }))
      .toBe('**Drew Rook** loses **7** HP · HP 11 → 4 · Stunned (p. 55)');
    expect(formatEntry({ ...loss, stat: 'SAN', label: '0/1D6', roll: 4, from: 50, to: 46, cause: 'violence', notes: ['Failed the SAN test (rolled 63 against 50%).'] }))
      .toBe('**Drew Rook** loses **4** SAN (violence) · 0/1D6 · SAN 50 → 46 · Failed the SAN test (rolled 63 against 50%).');
  });
  it('still reads damage entries logged before the shared shape', () => {
    expect(formatEntry({ ...base, kind: 'damage', label: '2D6', dice: [6, 5], mod: 0, roll: 11, hpFrom: 11, hpTo: 0 }))
      .toBe('**Drew Rook** loses **11** HP · 2D6 (6+5) · HP 11 → 0 · Dead (p. 55)');
  });
  it('leaves d% tests to formatRoll', () => {
    expect(formatEntry({ agentName: 'Drew Rook', label: 'd%', chance: 45, penalty: 0, roll: 23, outcome: 'success' })).toMatch(/^\*\*Drew Rook\*\* · d% 45% → 23/);
  });
});
