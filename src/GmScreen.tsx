import { Win } from './ui/Win';
import { Panel } from './ui/Panel';

/** A box of the screen: rows of [rule, value]. Paraphrased with page numbers, not copied, so the Handler goes to the book for detail. */
interface Box { title: string; page: string; rows: [string, string?][] }

const BOXES: Box[] = [
  { title: 'COMBAT TURN', page: 'pp. 50–54', rows: [
    ['Order: highest DEX first; ties act together or the Handler decides'],
    ['Aim: no roll, bonus lost if hurt first', '+20% next turn'],
    ['Called shot: half covered / mostly covered', '−20% / −40%'],
    ['Disarm or pin: Unarmed Combat, both hands free, in reach'],
    ['Melee attack against a pinned target', '+20%'],
    ['Pinned: can only Escape (STR×5 or Unarmed Combat, opposed)'],
    ['Dodge or fight back: uses the action; opposes all melee that turn'],
    ['Dodge vs. gunfire only reaches nearby cover'],
    ['A melee attack, disarm or pin also defends until the next action'],
    ['Wait: act before anyone else\'s next DEX turn'],
  ] },
  { title: 'TEST MODIFIERS', page: 'p. 54', rows: [
    ['Range: past base (to 2×) / past 2× (to 5×)', '−20% / −40%'],
    ['Visibility: smoke / darkness', '−20% / −40%'],
    ['Target half covered or small / mostly covered or tiny', '−20% / −40%'],
    ['Target prone or running / at car speed', '−20% / −40%'],
    ['Pepper spray, stun gun, exhausted / tear gas, stun grenade', '−20% / −40%'],
    ['Explosive aimed at a Kill Radius (p. 57)', '+20%'],
  ] },
  { title: 'LETHALITY', page: 'pp. 57–60', rows: [
    ['Roll d% at or under the rating: a human drops to 0 HP'],
    ['Missed: add the two dice as d10s (0 = 10)', '2–20 HP'],
    ['Critical attack: double the rating, and the damage if it misses'],
    ['Lethality rolls never crit or fumble'],
    ['Kill Radius: one Lethality roll per target inside'],
    ['Body armor stops a missed roll\'s damage, never a hit'],
    ['Inside a Kill Radius: next action is cover or prone', 'or 1 SAN'],
    ['Rolling damage instead', '1D6 per 3%'],
  ] },
  { title: 'SAN LOSS', page: 'pp. 66–68', rows: [
    ['Failure 1D6 or less: success usually costs', '0'],
    ['Failure 1D8 or 1D10: success usually costs', '1'],
    ['Critical: least possible loss; fumble: most'],
    ['In combat: one roll per kind of trauma per fight'],
    ['Ambushed; finding a corpse', '0/1'],
    ['Stabbed or shot; killing in self-defense', '0/1D4'],
    ['Down to 2 HP; killing an enemy in cold blood', '0/1D6'],
    ['Torture, suffered or inflicted', '0/1D8'],
    ['Learning a Bond was killed', '1/1D6'],
    ['A violent supernatural assault', '1/1D8+'],
    ['Killing several: +1 per victim past the first, up to the die\'s max'],
  ] },
  { title: 'INSANITY', page: 'pp. 68–75', rows: [
    ['5+ SAN in one roll: temporary insanity'],
    ['Flee: run for CON turns, then exhausted'],
    ['Struggle: fight the nearest threat until stopped'],
    ['Submit: catatonic; recalling it takes INT×5'],
    ['Calm surroundings: Psychotherapy can talk them down'],
    ['SAN at Breaking Point: new disorder', 'BP = SAN − POW'],
    ['3 violence losses in a row: adapted', '−1D6 CHA & Bonds'],
    ['3 helplessness losses in a row: adapted', '−1D6 POW'],
    ['Temporary insanity or Breaking Point resets that count'],
    ['No adapting to the Unnatural; 0 SAN is permanent insanity'],
    ['Destroying the unnatural restores its smallest SAN loss'],
  ] },
  { title: 'EXPENSES', page: 'pp. 84, 89', rows: [
    ['Incidental: just pay'],
    ['Standard: INT×5 or Accounting', 'fail: a Bond −1'],
    ['Unusual: always costs', 'a Bond −1'],
    ['Major: INT×5 or Accounting', 'pass: each Bond −1'],
    ['Major, failed', 'one Bond −1D4, rest −1'],
    ['Extreme: can\'t afford it; doing it anyway', 'each Bond −1D4'],
    ['Wealthy: one category lower, +20% to the test'],
    ['Only Bonds outside Delta Green pay'],
  ] },
  { title: 'HOME', page: 'pp. 78–80', rows: [
    ['Back to Nature: SAN test, a Bond −1', '+1D4 SAN'],
    ['Fulfill Responsibilities: SAN test', 'a Bond +1D6'],
    ['Go to Therapy: Luck or Psychotherapy, a Bond −1', 'truth +1D6 / lie +1D4'],
    ['Therapist doubts an unnatural story: the roll is at', '−20%'],
    ['Therapy critical cures a disorder'],
    ['Improve Skills or Stats: test two; each gain costs a Bond −1', '+3D6% or +1'],
    ['Establish a New Bond: CHA×5, another Bond −1', 'half CHA'],
    ['Personal Motivation: SAN test, a Bond −1', '+1 SAN'],
    ['Special Training: a Bond −1'],
    ['Stay On the Case: secret roll for a clue, a Bond −1', '1D6−3 SAN'],
    ['Study the Unnatural: raises Unnatural', 'a Bond −1D4'],
    ['SAN never rises above POW×5 this way'],
  ] },
  { title: 'HEALING', page: 'pp. 55–56', rows: [
    ['First aid: once per injury; fumble hurts 1D4', '+1D4 HP'],
    ['Resuscitation: First Aid within CON minutes of death', '+1D4 HP'],
    ['Hospital: Surgery or Medicine once a week', '+1D4 HP'],
    ['Rest: CON×5 once a day; crit 1D4, fumble −1', '+1 HP'],
    ['Other criticals double; after hospital, physical tests cost 1D4 HP until healed'],
    ['Temporary stat loss returns', '1 a day'],
  ] },
];

// Built once: the game page re-renders on every roll, and the same element lets React skip this whole subtree.
const SCREEN = (
  <Win title="GM SCREEN" className="bare" collapsible>
    <div className="masonry">
      {BOXES.map((b) => <Panel key={b.title} sub title={b.title} page={b.page} rows={b.rows.map(([left, right]) => ({ key: left, left, right }))} />)}
    </div>
  </Win>
);

/** Game page section, collapsed until its title is clicked: quick rules for the Handler, from the Agent's Handbook. */
export default function GmScreen() { return SCREEN; }
