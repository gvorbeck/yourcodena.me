import { Win } from './ui/Win';
import { Panel } from './ui/Panel';

/** A box of the screen: rows of ['Term: effect', value]. Paraphrased with page numbers, not copied, so the Handler goes to the book for detail. */
interface Box { title: string; page: string; rows: [string, string?][] }

const BOXES: Box[] = [
  { title: 'TESTS', page: 'pp. 42–45', rows: [
    ['No roll, skill: hobbyist, minor, major, graduate, master', '20/30/40/60/80%'],
    ['No roll, stat: anyone, most, average, gifted, prodigy', '3/5/9/13/17'],
    ['Unusual circumstances', '±20%'],
    ['Rare circumstances', '±40%'],
    ['Critical: 01, or a success on matching dice', '×2'],
    ['Fumble: 00, or a failure on matching dice'],
    ['Luck: pure chance', '50%'],
  ] },
  { title: 'OPPOSED & PURSUIT', page: 'p. 45', rows: [
    ['No roll: higher rating wins'],
    ['Both succeed: a critical wins, else the higher roll'],
    ['Both fail: nobody, or the lower roll (Handler picks)'],
    ['Pursuit: wins needed; wins cancel out', '1 / 2 / 3'],
    ['Pursuit, both fail: lower roll wins'],
    ['Pursuit critical: counts as two wins'],
  ] },
  { title: 'COMBAT TURN', page: 'pp. 50–54', rows: [
    ['Order: highest DEX first; ties together or Handler decides'],
    ['Aim: no roll; lost if hurt first', '+20% next'],
    ['Called shot: half / mostly covered', '−20% / −40%'],
    ['Disarm or pin: Unarmed Combat, hands free, in reach'],
    ['Pinned: only Escape (STR×5 or Unarmed, opposed)'],
    ['Melee vs. pinned target', '+20%'],
    ['Wait: act before anyone\'s next DEX turn'],
    ['Move: jog / run / sprint', '10 / 20 / 30 m'],
    ['Move with another action', '3 m'],
    ['Running or sprinting: DEX×5 or fall prone'],
  ] },
  { title: 'DEFENSE', page: 'pp. 53–54', rows: [
    ['Dodge or fight back: is the action; opposes all melee that turn'],
    ['Timing: may react early, not after acting'],
    ['None if: pinned, surprised, or can\'t see the attacker'],
    ['Dodge: vs. gunfire only reaches nearby cover; no damage'],
    ['Fight back: add an attack, called shot, disarm or pin'],
    ['Melee, disarm or pin: also defends until the next action'],
  ] },
  { title: 'TEST MODIFIERS', page: 'p. 53', rows: [
    ['Cap: bonuses +40% at most; penalties unlimited'],
    ['Always: 01 hits, 00 misses'],
    ['Point-blank (3 m) or laser sight', '+20%'],
    ['Target still, or pinned in melee', '+20%'],
    ['Aiming for a full turn', '+20%'],
    ['Explosive at a Kill Radius', '+20%'],
    ['Range: past base / past 2×', '−20% / −40%'],
    ['Visibility: smoke or darkness / almost none', '−20% / −40%'],
    ['Cover: half or small / mostly or tiny', '−20% / −40%'],
    ['Target: prone or running / car speed', '−20% / −40%'],
    ['Attacker: pepper spray, stun gun, exhausted', '−20%'],
    ['Attacker: tear gas, stun grenade', '−40%'],
  ] },
  { title: 'DAMAGE', page: 'pp. 55–60', rows: [
    ['Bare hands', '1D4−1'],
    ['Knife or hatchet', '1D4'],
    ['Combat knife or nightstick', '1D6'],
    ['Bat or machete', '1D8'],
    ['Small pistol / pistol', '1D8 / 1D10'],
    ['Carbine or big pistol', '1D12'],
    ['Rifle', '1D12+2'],
    ['Shotgun, close range', '2D8'],
    ['Auto-fire burst or spray', '10% Leth.'],
    ['Grenade', '15% Leth.'],
  ] },
  { title: 'WOUNDS & ARMOR', page: 'pp. 55–60', rows: [
    ['Stunned: half current HP in one hit; CON×5 each turn'],
    ['Unconscious: 2 HP or fewer; CON×5 or permanent injury'],
    ['Dead: 0 HP; HP never go below 0'],
    ['Armor and cover: subtract the rating from damage'],
    ['Body armor: no help vs. a Lethality hit'],
    ['Cover: Lethality fails; its dice still hit'],
    ['Ratings: vest, wall, thick wall', '3 / 5 / 10'],
  ] },
  { title: 'LETHALITY', page: 'pp. 57–60', rows: [
    ['Hit: d% at or under the rating; a human drops to 0 HP'],
    ['Miss: add the two dice as d10s (0 = 10)', '2–20 HP'],
    ['Critical: double the rating, and the damage on a miss'],
    ['Lethality rolls: never crit or fumble'],
    ['Kill Radius: one roll per target inside'],
    ['Suppressed: next action is cover or prone', 'or 1 SAN'],
    ['Rolling damage instead', '1D6 per 3%'],
  ] },
  { title: 'HEALING', page: 'pp. 55–56', rows: [
    ['First aid: once per injury; fumble hurts 1D4', '+1D4 HP'],
    ['Resuscitation: First Aid within CON minutes', '+1D4 HP'],
    ['Hospital: Surgery or Medicine weekly', '+1D4 HP'],
    ['Rest: CON×5 daily; crit 1D4, fumble −1', '+1 HP'],
    ['Other criticals: double'],
    ['After hospital: physical tests cost 1D4 HP until healed'],
    ['Lost stat points: return', '1 a day'],
  ] },
  { title: 'HAZARDS', page: 'pp. 60–62', rows: [
    ['Fire, candle', '1 a turn'],
    ['Fire, brand / campfire', '1D6 / 2D6'],
    ['Fire, bonfire or steam', '10% Leth.'],
    ['Catching fire: DEX×5 or half damage each turn'],
    ['Fall 1–3 m', '1D6'],
    ['Fall 1–3 m, uncontrolled', '2D6'],
    ['Fall past 3 m: Lethality per meter', '1%'],
    ['After a fall: CON×5 or stunned'],
    ['Poison: failed Lethality, CON×5 halves; crit 1 HP'],
    ['Disease: CON×5 each interval; pass halves and ends it; crit 0'],
    ['Poison or disease: a fumble doubles; hospital gives', '+20%'],
    ['Diseased: regain no HP'],
    ['Antidote: before onset, no harm; after, half'],
  ] },
  { title: 'SAN LOSS', page: 'pp. 66–68', rows: [
    ['Success: loss when failure is 1D6 or less', '0'],
    ['Success: loss when failure is 1D8 or 1D10', '1'],
    ['Critical: least loss; fumble: most'],
    ['In combat: one roll per kind of trauma per fight'],
    ['Ambushed; finding a corpse', '0/1'],
    ['Stabbed or shot; killing in self-defense', '0/1D4'],
    ['A Bond reduced to 0; a friend\'s remains', '0/1D4'],
    ['A Bond harmed or given a disorder', '1/1D4'],
    ['Down to 2 HP; killing in cold blood', '0/1D6'],
    ['A corpse walks; a violent supernatural effect', '0/1D6'],
    ['Learning a Bond was killed', '1/1D6'],
    ['Torture, suffered or inflicted', '0/1D8'],
    ['Seeing a Bond gruesomely killed', '1/1D8'],
    ['Violent supernatural assault', '1/1D8+'],
    ['Several victims: +1 each past the first, to the die\'s max'],
  ] },
  { title: 'INSANITY', page: 'pp. 68–75', rows: [
    ['Temporary insanity: 5+ SAN in one roll'],
    ['Flee: run for CON turns, then exhausted'],
    ['Struggle: fight the nearest threat until stopped'],
    ['Submit: catatonic; recalling it takes INT×5'],
    ['Talk down: Psychotherapy, in calm surroundings'],
    ['Breaking Point: new disorder', 'SAN − POW'],
    ['Adapted to violence: 3 losses in a row', '−1D6 CHA, Bonds'],
    ['Adapted to helplessness: 3 losses in a row', '−1D6 POW'],
    ['Reset: insanity or Breaking Point clears that count'],
    ['Unnatural: no adapting; 0 SAN is permanent'],
    ['Destroying it: regain its smallest SAN loss'],
  ] },
  { title: 'WILLPOWER', page: 'pp. 47, 74–75', rows: [
    ['1–2 WP: breakdown, all actions', '−20%'],
    ['0 WP: Handler controls the Agent; every test fails'],
    ['Full night\'s sleep, once a day', '+1D6 WP'],
    ['Playing up a motivation', '+1 WP'],
    ['First sleep after insanity or a new disorder: SAN test or no WP for 24 h'],
    ['Sedatives: +20% to that test; next day', '−20%'],
    ['Exhausted: lose 1D6 WP; tests', '−10/−20%'],
    ['Stimulants: hide the penalty, no sleep', '1D6 h'],
    ['Hard drugs: hide the penalty, no sleep', '2D6 h'],
    ['Project onto a Bond: −1D4 WP and Bond, −1D4 SAN loss'],
    ['Repress insanity: −1D4 WP and Bond, then SAN test'],
  ] },
  { title: 'EXPENSES', page: 'pp. 84, 89', rows: [
    ['Incidental: just pay'],
    ['Standard: INT×5 or Accounting', 'fail: Bond −1'],
    ['Unusual: always costs', 'Bond −1'],
    ['Major: INT×5 or Accounting', 'pass: each −1'],
    ['Major, failed: one Bond −1D4', 'rest −1'],
    ['Extreme: unaffordable; doing it anyway', 'each −1D4'],
    ['Wealthy: one category lower, +20% to the test'],
    ['Who pays: only Bonds outside Delta Green'],
  ] },
  { title: 'HOME', page: 'pp. 78–80', rows: [
    ['Back to Nature: SAN test, Bond −1', '+1D4 SAN'],
    ['Fulfill Responsibilities: SAN test', 'Bond +1D6'],
    ['Go to Therapy: Luck or Psychotherapy, Bond −1', 'truth +1D6'],
    ['Therapy, lying about the case', '+1D4 SAN'],
    ['Therapy, unnatural story doubted', '−20%'],
    ['Therapy critical: cures a disorder'],
    ['Improve: test two; each gain costs Bond −1', '+3D6% / +1'],
    ['New Bond: CHA×5, another Bond −1', 'half CHA'],
    ['Personal Motivation: SAN test, Bond −1', '+1 SAN'],
    ['Special Training: Bond −1'],
    ['Stay On the Case: secret clue roll, Bond −1', '1D6−3 SAN'],
    ['Study the Unnatural: raises Unnatural', 'Bond −1D4'],
    ['Cap: SAN never rises above POW×5 this way'],
  ] },
];

/** 'Term: effect' shows the term as a heading; rows without a colon stay plain. */
function rule(text: string) {
  const at = text.indexOf(': ');
  return at < 0 ? text : <><span className="term">{text.slice(0, at)}</span> {text.slice(at + 2)}</>;
}

// Built once: the game page re-renders on every roll, and the same element lets React skip this whole subtree.
const SCREEN = (
  <Win title="GM SCREEN" className="bare" collapsible>
    <div className="masonry">
      {BOXES.map((b) => <Panel key={b.title} sub title={b.title} page={b.page} rows={b.rows.map(([left, right]) => ({ key: left, left: rule(left), right }))} />)}
    </div>
  </Win>
);

/** Game page section, collapsed until its title is clicked: quick rules for the Handler, from the Agent's Handbook. */
export default function GmScreen() { return SCREEN; }
