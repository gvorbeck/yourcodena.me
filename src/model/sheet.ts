import { STATS } from '../rules/data/creation';
import { bondCount, derived, disorderOf, featureOf, professionOf, skillsOf, veteranOf } from '../rules';
import type { Character } from './character';

export const MAX_COL = 30;

/** Greedy word wrap to MAX_COL; words longer than a line are split. Leading spaces are kept on continuation lines. */
function wrap(line: string): string[] {
  if (line.length <= MAX_COL) return [line];
  const indent = /^\s*/.exec(line)![0];
  const out: string[] = [];
  let cur = '';
  for (let w of line.trim().split(/\s+/)) {
    const room = MAX_COL - indent.length;
    while (w.length > room) { // flush, then split the long word
      if (cur) { out.push(indent + cur); cur = ''; }
      out.push(indent + w.slice(0, room));
      w = w.slice(room);
    }
    if (cur && cur.length + 1 + w.length > room) { out.push(indent + cur); cur = w; }
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(indent + cur);
  return out;
}

const short = (key: string) =>
  key
    .replace('Computer Science', 'Comp Sci')
    .replace('Military Science', 'Military Sci')
    .replace(/^Science\(/, 'Sci(')
    .replace(/^Foreign Language\(/, 'Lang(')
    .replace(/^(\w+)\(/, '$1 (');

/** Plain-text character sheet, hard-wrapped at MAX_COL columns, for pasting into chat or notes. */
export function asciiSheet(c: Character): string {
  const det = c.details, d = derived(c), p = professionOf(c), v = veteranOf(c);
  const pad = (n: number) => String(n).padStart(2, '0');
  const field = (label: string, val: string) => (val.trim() ? [`${label}: ${val.trim()}`] : []);
  const section = (title: string, ...body: string[]) => (body.length ? ['', title, '---', ...body] : []);
  const prose = (title: string, val: string) => (val.trim() ? section(title, val.trim()) : []);

  const lines = [
    ...field('Name', det.name),
    ...field('Codename', det.codename),
    ...field('Profession', [p?.name, det.rank].filter(Boolean).join(', ')),
    ...field('Employer', det.employer),
    ...field('Age', det.age),
    ...field('Sex', det.sex),
    ...field('Nationality', det.nationality),
    ...(v ? [`Veteran: ${v.name}`] : []),
    ...field('Disorder', disorderOf(c)),

    ...section('STATS      SCORE   x5', ...STATS.map((s) => {
      const f = featureOf(s, c.stats[s]);
      return [`${s}: ${pad(c.stats[s])}`.padEnd(13) + `${c.stats[s] * 5}%`.padStart(4)].concat(f ? [`  (${f})`] : []);
    }).flat()),

    ...section('DERIVED ATTRIBUTES',
      'Hit Points (HP):', `MAX: ${pad(d.hp)}   CURRENT: ${pad(d.hp)}`, '',
      'Willpower (WP):', `MAX: ${pad(d.wp)}   CURRENT: ${pad(d.wp)}`, '',
      'Sanity (SAN):', `MAX: ${pad(d.maxSan)}   CURRENT: ${pad(d.san)}`, '',
      'Breaking Point (BP):', `MAX: ${pad(d.bp)}`),

    ...section('BONDS', ...c.bonds.slice(0, bondCount(c)).filter((b) => b.name.trim()).map((b, i) => `${i + 1}. ${b.name.trim()}: ${d.bondScore}${b.note ? ` (${b.note})` : ''}`)),
    ...section('MOTIVATIONS', ...c.motivations.filter((m) => m.trim()).map((m) => `- ${m.trim()}`)),

    ...prose('PHYS DESC', det.appearance),
    ...prose('PERSONALITY', det.personality),
    ...prose('EDUCATION & HISTORY', det.education),
    ...prose('ADMIRES', det.admires),
    ...prose('DISLIKES', det.dislikes),
    ...prose('DELTA GREEN TRUSTS', det.trust),
    ...prose('HELPS DELTA GREEN', det.helps),

    ...section('SKILLS', '(When you attempt to use a skill & fail, check it. After the session, add 1D4 to each checked skill.)',
      ...skillsOf(c).filter((s) => s.total > 0).map((s) => `${short(s.key).padEnd(20)}${String(s.total).padStart(2)}${s.adjust ? ' *' : ''}`)),

    ...section('INCIDENTS OF SAN LOSS',
      `Violence:  [ ] [ ] [ ] Adapted${v?.adapts === 'v' ? ' [x]' : ' [ ]'}`.replace(' Adapted [', '\n           Adapted ['),
      `Helpless:  [ ] [ ] [ ] Adapted${v?.adapts === 'h' ? ' [x]' : ' [ ]'}`.replace(' Adapted [', '\n           Adapted [')),
  ];
  return lines.flatMap((l) => l.split('\n').flatMap(wrap)).join('\n') + '\n';
}
