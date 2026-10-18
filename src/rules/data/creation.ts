// Agent's Handbook character-creation tables. `?` = free personal choice; "A|B" = either/or; `*` = player names the type.
export const STATS = ['STR', 'DEX', 'CON', 'INT', 'POW', 'CHA'] as const;
export type Stat = (typeof STATS)[number];
export const STAT_NAMES: Record<Stat, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', POW: 'Power', CHA: 'Charisma',
};

export const POINT_BUY_TOTAL = 72; // p. 14
export const STAT_SETS: { id: string; name: string; values: number[] }[] = [
  { id: 'well-rounded', name: 'Well-rounded', values: [13, 13, 12, 12, 11, 11] },
  { id: 'focused', name: 'Focused', values: [15, 14, 12, 11, 10, 10] },
  { id: 'highly-focused', name: 'Highly focused', values: [17, 14, 12, 10, 10, 9] },
];

// p. 19 — shown for scores below 9 or above 12. Bands: 3–4, 5–8, 13–16, 17–18.
export const FEATURES: Record<Stat, [string, string, string, string]> = {
  STR: ['Feeble', 'Weak', 'Muscular', 'Huge'],
  DEX: ['Barely mobile', 'Clumsy', 'Nimble', 'Acrobatic'],
  CON: ['Bedridden', 'Sickly', 'Perfect health', 'Indefatigable'],
  INT: ['Imbecilic', 'Slow', 'Perceptive', 'Brilliant'],
  POW: ['Spineless', 'Nervous', 'Strong-willed', 'Indomitable'],
  CHA: ['Unbearable', 'Awkward', 'Charming', 'Magnetic'],
};

export const SAMPLE_BONDS = [
  'Spouse or ex-spouse', 'Son or daughter', 'Parent or grandparent', 'Best friend', 'Coworker or partner',
  'Therapist', 'Spouse and children', 'Parents', 'Siblings', 'Colleagues in an intense job',
  'Church or support group', 'Survivors of shared trauma',
];

export interface PackageDef { id: string; name: string; skills: string[] }
// pp. 27–28
export const PACKAGES: PackageDef[] = [
  { id: 'artist', name: 'Artist, Actor, or Musician', skills: ['Alertness', 'Craft*', 'Disguise', 'Persuade', 'Art*', 'Art*', 'Art*', 'HUMINT'] },
  { id: 'athlete', name: 'Athlete', skills: ['Alertness', 'Athletics', 'Dodge', 'First Aid', 'HUMINT', 'Persuade', 'Swim', 'Unarmed Combat'] },
  { id: 'author', name: 'Author, Editor, or Journalist', skills: ['Anthropology', 'Art*', 'Bureaucracy', 'History', 'Law', 'Occult', 'Persuade', 'HUMINT'] },
  { id: 'black-bag', name: '"Black Bag" Training', skills: ['Alertness', 'Athletics', 'Craft(Electrician)', 'Craft(Locksmithing)', 'Criminology', 'Disguise', 'Search', 'Stealth'] },
  { id: 'blue-collar', name: 'Blue-Collar Worker', skills: ['Alertness', 'Craft*', 'Craft*', 'Drive', 'First Aid', 'Heavy Machinery', 'Navigate', 'Search'] },
  { id: 'bureaucrat', name: 'Bureaucrat', skills: ['Accounting', 'Bureaucracy', 'Computer Science', 'Criminology', 'HUMINT', 'Law', 'Persuade', '?'] },
  { id: 'clergy', name: 'Clergy', skills: ['Foreign Language*', 'Foreign Language*', 'Foreign Language*', 'History', 'HUMINT', 'Occult', 'Persuade', 'Psychotherapy'] },
  { id: 'combat-veteran', name: 'Combat Veteran', skills: ['Alertness', 'Dodge', 'Firearms', 'First Aid', 'Heavy Weapons', 'Melee Weapons', 'Stealth', 'Unarmed Combat'] },
  { id: 'hacker', name: 'Computer Enthusiast or Hacker', skills: ['Computer Science', 'Craft(Microelectronics)', 'Science(Mathematics)', 'SIGINT', '?', '?', '?', '?'] },
  { id: 'counselor', name: 'Counselor', skills: ['Bureaucracy', 'First Aid', 'Foreign Language*', 'HUMINT', 'Law', 'Persuade', 'Psychotherapy', 'Search'] },
  { id: 'criminalist', name: 'Criminalist', skills: ['Accounting', 'Bureaucracy', 'Computer Science', 'Criminology', 'Forensics', 'Law', 'Pharmacy', 'Search'] },
  { id: 'firefighter', name: 'Firefighter', skills: ['Alertness', 'Demolitions', 'Drive', 'First Aid', 'Forensics', 'Heavy Machinery', 'Navigate', 'Search'] },
  { id: 'gangster', name: 'Gangster or Deep Cover', skills: ['Alertness', 'Criminology', 'Dodge', 'Drive', 'Persuade', 'Stealth', '?', '?'] }, // last two: choose from Athletics, Foreign Language, Firearms, HUMINT, Melee Weapons, Pharmacy, Unarmed Combat
  { id: 'interrogator', name: 'Interrogator', skills: ['Criminology', 'Foreign Language*', 'Foreign Language*', 'HUMINT', 'Law', 'Persuade', 'Pharmacy', 'Search'] },
  { id: 'liberal-arts', name: 'Liberal Arts Degree', skills: ['Anthropology', 'Art*', 'Foreign Language*', 'History', 'Persuade', '?', '?', '?'] }, // Anthropology or Archeology
  { id: 'military-officer', name: 'Military Officer', skills: ['Bureaucracy', 'Firearms', 'History', 'Military Science*', 'Navigate', 'Persuade', 'Unarmed Combat', '?'] }, // last: Artillery, Heavy Machinery, Heavy Weapons, HUMINT, Pilot, or SIGINT
  { id: 'mba', name: 'MBA', skills: ['Accounting', 'Bureaucracy', 'HUMINT', 'Law', 'Persuade', '?', '?', '?'] },
  { id: 'nurse', name: 'Nurse, Paramedic, or Pre-Med', skills: ['Alertness', 'First Aid', 'Medicine', 'Persuade', 'Pharmacy', 'Psychotherapy', 'Science(Biology)', 'Search'] },
  { id: 'occult', name: 'Occult Investigator or Conspiracy Theorist', skills: ['Anthropology', 'Archeology', 'Computer Science', 'Criminology', 'History', 'Occult', 'Persuade', 'Search'] },
  { id: 'outdoorsman', name: 'Outdoorsman', skills: ['Alertness', 'Athletics', 'Firearms', 'Navigate', 'Ride', 'Search', 'Stealth', 'Survival'] },
  { id: 'photographer', name: 'Photographer', skills: ['Alertness', 'Art(Photography)', 'Computer Science', 'Persuade', 'Search', 'Stealth', '?', '?'] },
  { id: 'pilot', name: 'Pilot or Sailor', skills: ['Alertness', 'Craft(Mechanic)', 'First Aid', 'Foreign Language*', 'Navigate', 'Pilot*', 'Survival', 'Swim'] },
  { id: 'police', name: 'Police Officer', skills: ['Alertness', 'Criminology', 'Drive', 'Firearms', 'HUMINT', 'Law', 'Melee Weapons', 'Unarmed Combat'] },
  { id: 'grad-student', name: 'Science Grad Student', skills: ['Bureaucracy', 'Computer Science', 'Craft*', 'Foreign Language*', 'Science*', 'Science*', 'Science*', '?'] }, // last: Accounting, Forensics, Law, or Pharmacy
  { id: 'social-worker', name: 'Social Worker or Criminal Justice Degree', skills: ['Bureaucracy', 'Criminology', 'Forensics', 'Foreign Language*', 'HUMINT', 'Law', 'Persuade', 'Search'] },
  { id: 'soldier', name: 'Soldier or Marine', skills: ['Alertness', 'Artillery', 'Athletics', 'Drive', 'Firearms', 'Heavy Weapons', 'Military Science(Land)', 'Unarmed Combat'] },
  { id: 'translator', name: 'Translator', skills: ['Anthropology', 'Foreign Language*', 'Foreign Language*', 'Foreign Language*', 'History', 'HUMINT', 'Persuade', '?'] },
  { id: 'urban-explorer', name: 'Urban Explorer', skills: ['Alertness', 'Athletics', 'Craft*', 'Law', 'Navigate', 'Persuade', 'Search', 'Stealth'] },
];

// p. 38 — Damaged Veterans. Choose one or none.
export interface VeteranDef {
  id: string; name: string; page: string; effects: string[];
  san: number | 'POW'; pow?: number; cha?: number; bonds?: number; removeBond?: boolean;
  unnatural?: number; occult?: number; adapts?: 'v' | 'h'; extraSkills?: { count: number; amount: number; cap: number };
}
export const VETERANS: VeteranDef[] = [
  { id: 'violence', name: 'Extreme Violence', page: 'p. 38', san: 5, cha: 3, bonds: 3, occult: 10, adapts: 'v',
    effects: ['+10 Occult', 'SAN −5', 'CHA −3 and each Bond −3', 'Adapted to violence'] },
  { id: 'captivity', name: 'Captivity or Imprisonment', page: 'p. 38', san: 5, pow: 3, occult: 10, adapts: 'h',
    effects: ['+10 Occult', 'SAN −5', 'POW −3', 'Adapted to helplessness'] },
  { id: 'hard', name: 'Hard Experience', page: 'p. 38', san: 5, removeBond: true, occult: 10, extraSkills: { count: 5, amount: 10, cap: 90 },
    effects: ['+10 Occult', '+10 on five other skills (max 90%)', 'SAN −5', 'Remove one Bond'] },
  { id: 'unnatural', name: 'Things Man Was Not Meant to Know', page: 'p. 38', san: 'POW', unnatural: 10, occult: 20,
    effects: ['+10 Unnatural', '+20 Occult', 'SAN −POW', 'Gain a new disorder', 'BP reset to new SAN − POW'] },
];

// p. 72 — sample disorders from the Unnatural, offered after 'Things Man Was Not Meant to Know'.
export const UNNATURAL_DISORDERS = ['Amnesia', 'Depersonalization Disorder', 'Depression', 'Dissociative Identity Disorder', 'Fugues', 'Megalomania', 'Paranoia', 'Sleep Disorder'];
