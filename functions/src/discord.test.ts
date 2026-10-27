import { describe, expect, it } from 'vitest';
import { formatRoll, isWebhookUrl, plain, postWebhook } from './discord.js';

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

describe('formatDamage', () => {
  it('shows dice, total and label', async () => {
    const { formatDamage } = await import('./discord.js');
    expect(formatDamage('Drew Rook', 'Glock 17', { kind: 'dice', expr: '1D10+1', dice: [7], mod: 1, total: 8, critical: false }))
      .toBe('**Drew Rook** · Glock 17 · 1D10+1 → **8** damage (7+1)');
    expect(formatDamage('Drew Rook', '', { kind: 'lethality', rating: 15, roll: 80, killed: false, dice: [8, 10], total: 18, critical: false }))
      .toBe('**Drew Rook** · Lethality 15% → 80 · **18** HP damage (8+10)');
    expect(formatDamage('Drew Rook', '', { kind: 'lethality', rating: 15, roll: 25, killed: true, dice: [2, 5], total: 0, critical: true }))
      .toBe('**Drew Rook** · Lethality 15% ×2 = 30% → 25 · **LETHAL**: a human target drops to 0 HP');
    expect(formatDamage('Handler', '', { kind: 'dice', expr: '3', dice: [], mod: 3, total: 6, critical: true }))
      .toBe('**Handler** · 3 → **6** damage (critical ×2)');
    expect(formatDamage('Drew Rook', 'Knife', { kind: 'dice', expr: '1D4-1', dice: [3], mod: -1, total: 4, critical: true }))
      .toBe('**Drew Rook** · Knife · 1D4-1 → **4** damage (3-1, critical ×2)');
    expect(formatDamage('Drew Rook', '', { kind: 'lethality', rating: 10, roll: 100, killed: false, dice: [10, 10], total: 20, critical: false }))
      .toBe('**Drew Rook** · Lethality 10% → 100 · **20** HP damage (10+10)');
  });
});
