import { expect, it } from 'vitest';
import { newCharacter } from './character';
import { decodeSheet, encodeSheet, freshLive } from './live';

it('round-trips a sheet through the URL hash, including non-ASCII', () => {
  const c = newCharacter();
  c.details.name = 'Zoë 東京';
  const l = { ...freshLive(c), hp: 3, notes: 'héllo' };
  expect(decodeSheet(encodeSheet(c, l))).toEqual({ c, l });
  expect(decodeSheet('#sheet=garbage')).toBeNull();
});
