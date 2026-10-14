// Agent's Handbook professions. Skill DSL: "Name[(Type)][*] N" — `*` means the player names the type;
// "A 50 | B 50" is an either/or slot. Pages are the section where the profession (or kit) is printed.
export type Group = 'core' | 'additional' | 'agency';

export interface ProfessionDef {
  id: string;
  name: string;
  group: Group;
  page: string;
  bonds: number;
  stats: string[]; // recommended (≥10)
  fixed: string[];
  choose?: { n: number; from: string[] };
  agency?: string;
  note?: string;
}

const p = (
  id: string, name: string, group: Group, page: string, bonds: number, stats: string[],
  fixed: string[], choose?: [number, string[]], agency?: string,
): ProfessionDef => ({ id, name, group, page, bonds, stats, fixed, choose: choose && { n: choose[0], from: choose[1] }, agency });

const MIL_LAND = 'Military Science(Land)';

export const PROFESSIONS: ProfessionDef[] = [
  // ---- Core professions, pp. 20–22
  p('anthropologist', 'Anthropologist or Historian', 'core', 'p. 20', 4, ['INT'],
    ['Anthropology 50 | Archeology 50', 'Bureaucracy 40', 'Foreign Language* 50', 'Foreign Language* 40', 'History 60', 'Occult 40', 'Persuade 40'],
    [2, ['Anthropology 40', 'Archeology 40', 'HUMINT 50', 'Navigate 50', 'Ride 50', 'Search 60', 'Survival 50']]),
  p('computer-scientist', 'Computer Scientist or Engineer', 'core', 'p. 21', 3, ['INT'],
    ['Computer Science 60', 'Craft(Electrician) 30', 'Craft(Mechanic) 30', 'Craft(Microelectronics) 40', 'Science(Mathematics) 40', 'SIGINT 40'],
    [4, ['Accounting 50', 'Bureaucracy 50', 'Craft* 40', 'Foreign Language* 40', 'Heavy Machinery 50', 'Law 40', 'Science* 40']]),
  p('federal-agent', 'Federal Agent', 'core', 'p. 21', 3, ['CON', 'POW', 'CHA'],
    ['Alertness 50', 'Bureaucracy 40', 'Criminology 50', 'Drive 50', 'Firearms 50', 'Forensics 30', 'HUMINT 60', 'Law 30', 'Persuade 50', 'Search 50', 'Unarmed Combat 60'],
    [1, ['Accounting 60', 'Computer Science 50', 'Foreign Language* 50', 'Heavy Weapons 50', 'Pharmacy 50']]),
  p('physician', 'Physician', 'core', 'p. 22', 3, ['INT', 'POW', 'DEX'],
    ['Bureaucracy 50', 'First Aid 60', 'Medicine 60', 'Persuade 40', 'Pharmacy 50', 'Science(Biology) 60', 'Search 40'],
    [2, ['Forensics 50', 'Psychotherapy 60', 'Science* 50', 'Surgery 50']]),
  p('scientist', 'Scientist', 'core', 'p. 22', 4, ['INT'],
    ['Bureaucracy 40', 'Computer Science 40', 'Science* 60', 'Science* 50', 'Science* 50'],
    [3, ['Accounting 50', 'Craft* 40', 'Foreign Language* 40', 'Forensics 40', 'Law 40', 'Pharmacy 40']]),
  p('special-operator', 'Special Operator', 'core', 'p. 22', 2, ['STR', 'CON', 'POW'],
    ['Alertness 60', 'Athletics 60', 'Demolitions 40', 'Firearms 60', 'Heavy Weapons 50', 'Melee Weapons 50', `${MIL_LAND} 60`, 'Navigate 50', 'Stealth 50', 'Survival 50', 'Swim 50', 'Unarmed Combat 60']),

  // ---- Additional professions, pp. 23–26
  p('criminal', 'Criminal', 'additional', 'p. 23', 4, ['STR', 'DEX'],
    ['Alertness 50', 'Athletics 50', 'Criminology 60', 'Dodge 40', 'Drive 50', 'Firearms 40', 'Law 20', 'Melee Weapons 40', 'Persuade 50', 'Stealth 50', 'Unarmed Combat 50'],
    [2, ['Craft(Locksmithing) 40', 'Demolitions 40', 'Disguise 50', 'Foreign Language* 40', 'Forensics 40', 'HUMINT 50', 'Navigate 50', 'Occult 50', 'Pharmacy 40']]),
  p('firefighter', 'Firefighter', 'additional', 'p. 23', 3, ['STR', 'DEX', 'CON'],
    ['Alertness 50', 'Athletics 60', 'Craft(Electrician) 40', 'Craft(Mechanic) 40', 'Demolitions 50', 'Drive 50', 'First Aid 50', 'Forensics 40', 'Heavy Machinery 50', 'Navigate 50', 'Search 40']),
  p('foreign-service-officer', 'Foreign Service Officer', 'additional', 'p. 23', 3, ['INT', 'CHA'],
    ['Accounting 40', 'Anthropology 40', 'Bureaucracy 60', 'Foreign Language* 50', 'Foreign Language* 50', 'Foreign Language* 40', 'History 40', 'HUMINT 50', 'Law 40', 'Persuade 50']),
  p('intelligence-analyst', 'Intelligence Analyst', 'additional', 'p. 23', 3, ['INT'],
    ['Anthropology 40', 'Bureaucracy 50', 'Computer Science 40', 'Criminology 40', 'Foreign Language* 50', 'Foreign Language* 50', 'Foreign Language* 40', 'History 40', 'HUMINT 50', 'SIGINT 40']),
  p('case-officer', 'Intelligence Case Officer', 'additional', 'p. 24', 2, ['INT', 'POW', 'CHA'],
    ['Alertness 50', 'Bureaucracy 40', 'Criminology 50', 'Disguise 50', 'Drive 40', 'Firearms 40', 'Foreign Language* 50', 'Foreign Language* 40', 'HUMINT 60', 'Persuade 60', 'SIGINT 40', 'Stealth 50', 'Unarmed Combat 50']),
  p('lawyer', 'Lawyer or Business Executive', 'additional', 'p. 24', 4, ['INT', 'CHA'],
    ['Accounting 50', 'Bureaucracy 50', 'HUMINT 40', 'Persuade 60'],
    [4, ['Computer Science 50', 'Criminology 60', 'Foreign Language* 50', 'Law 50', 'Pharmacy 50']]),
  p('media-specialist', 'Media Specialist', 'additional', 'p. 24', 4, ['INT', 'CHA'],
    ['Art* 60', 'History 40', 'HUMINT 40', 'Persuade 50'],
    [5, ['Anthropology 40', 'Archeology 40', 'Art* 40', 'Bureaucracy 50', 'Computer Science 40', 'Criminology 50', 'Foreign Language* 40', 'Law 40', 'Military Science* 40', 'Occult 50', 'Science* 40']]),
  p('nurse', 'Nurse or Paramedic', 'additional', 'p. 25', 4, ['INT', 'POW', 'CHA'],
    ['Alertness 40', 'Bureaucracy 40', 'First Aid 60', 'HUMINT 40', 'Medicine 40', 'Persuade 40', 'Pharmacy 40', 'Science(Biology) 40'],
    [2, ['Drive 60', 'Forensics 40', 'Navigate 50', 'Psychotherapy 50', 'Search 60']]),
  p('pilot', 'Pilot or Sailor', 'additional', 'p. 25', 3, ['DEX', 'INT'],
    ['Alertness 60', 'Bureaucracy 30', 'Craft(Electrician) 40', 'Craft(Mechanic) 40', 'Navigate 50', 'Pilot* 60', 'Science(Meteorology) 40', 'Swim 40'],
    [2, ['Foreign Language* 50', 'Pilot* 50', 'Heavy Weapons 50', 'Military Science* 50']]),
  p('police-officer', 'Police Officer', 'additional', 'p. 26', 3, ['STR', 'CON', 'POW'],
    ['Alertness 60', 'Bureaucracy 40', 'Criminology 40', 'Drive 50', 'Firearms 40', 'First Aid 30', 'HUMINT 50', 'Law 30', 'Melee Weapons 50', 'Navigate 40', 'Persuade 40', 'Search 40', 'Unarmed Combat 60'],
    [1, ['Forensics 50', 'Heavy Machinery 60', 'Heavy Weapons 50', 'Ride 60']]),
  p('program-manager', 'Program Manager', 'additional', 'p. 26', 4, ['INT', 'CHA'],
    ['Accounting 60', 'Bureaucracy 60', 'Computer Science 50', 'Criminology 30', 'Foreign Language* 50', 'History 40', 'Law 40', 'Persuade 50'],
    [1, ['Anthropology 30', 'Art* 30', 'Craft* 30', 'Science* 30']]),
  p('soldier', 'Soldier or Marine', 'additional', 'p. 26', 4, ['STR', 'CON'],
    ['Alertness 50', 'Athletics 50', 'Bureaucracy 30', 'Drive 40', 'Firearms 40', 'First Aid 40', `${MIL_LAND} 40`, 'Navigate 40', 'Persuade 30', 'Unarmed Combat 50'],
    [3, ['Artillery 40', 'Computer Science 40', 'Craft* 40', 'Demolitions 40', 'Foreign Language* 40', 'Heavy Machinery 50', 'Heavy Weapons 40', 'Search 60', 'SIGINT 40', 'Swim 60']]),

  // ---- Federal Agencies unit kits (bond counts as printed with each kit)
  p('fbi-hrt', 'FBI HRT / SWAT', 'agency', 'p. 109', 1, [],
    ['Alertness 60', 'Athletics 60', 'Demolitions 40', 'Dodge 50', 'Firearms 60', 'Forensics 30', 'Heavy Weapons 50', 'Melee Weapons 50', `${MIL_LAND} 60`, 'Navigate 50', 'Stealth 50', 'Survival 50', 'Swim 50', 'Unarmed Combat 60'], undefined, 'FBI'),
  p('dea-fast', 'DEA FAST', 'agency', 'p. 114', 2, [],
    ['Alertness 50', 'Bureaucracy 40', 'Criminology 50', 'Drive 40', 'Firearms 50', 'Foreign Language* 30', 'Forensics 30', 'Heavy Weapons 30', 'HUMINT 40', 'Law 30', `${MIL_LAND} 30`, 'Persuade 40', 'Pharmacy 30', 'Search 50', 'Survival 30', 'Unarmed Combat 60'], undefined, 'DEA'),
  p('ice-srt', 'ICE SRT', 'agency', 'p. 118', 2, [],
    ['Alertness 50', 'Bureaucracy 40', 'Criminology 50', 'Dodge 50', 'Drive 50', 'Firearms 50', 'Forensics 30', 'Heavy Weapons 50', 'HUMINT 60', 'Law 30', 'Persuade 50', 'Search 50', 'Stealth 40', 'Unarmed Combat 60'], undefined, 'ICE'),
  p('usms-sog', 'USMS SOG', 'agency', 'p. 122', 2, [],
    ['Alertness 50', 'Athletics 40', 'Bureaucracy 40', 'Criminology 50', 'Dodge 40', 'Drive 50', 'Firearms 50', 'Forensics 30', 'Heavy Weapons 50', 'HUMINT 60', 'Law 30', 'Persuade 50', 'Search 50', 'Stealth 40', 'Unarmed Combat 60'], undefined, 'USMS'),
  p('army-10th-mountain', 'Army 10th Mountain Division', 'agency', 'p. 130', 3, [],
    ['Alertness 50', 'Athletics 60', 'Bureaucracy 30', 'Drive 40', 'Firearms 40', 'First Aid 30', `${MIL_LAND} 40`, 'Navigate 50', 'Persuade 30', 'Survival 50', 'Unarmed Combat 50'],
    [3, ['Computer Science 40', 'Craft* 40', 'Demolitions 40', 'Foreign Language* 40', 'Heavy Machinery 50', 'Heavy Weapons 40', 'Search 60', 'SIGINT 40', 'Swim 60']], 'Army'),
  p('army-1st-cav', 'Army 1st Brigade, 1st Cavalry Division', 'agency', 'p. 130', 3, [],
    ['Alertness 50', 'Athletics 50', 'Bureaucracy 30', 'Drive 50', 'Firearms 40', 'First Aid 30', 'Heavy Machinery 40', 'Heavy Weapons 40', `${MIL_LAND} 40`, 'Navigate 50', 'Stealth 30', 'Survival 50', 'Unarmed Combat 50'],
    [1, ['Artillery 40', 'Computer Science 40', 'Craft* 40', 'Demolitions 40', 'Foreign Language* 40', 'SIGINT 40']], 'Army'),
  p('navy-eod', 'Navy EOD Group One', 'agency', 'p. 134', 2, [],
    ['Alertness 60', 'Athletics 40', 'Bureaucracy 30', 'Craft(Electrician) 40', 'Craft(Mechanic) 40', 'Demolitions 60', 'Military Science(Sea) 50', 'Navigate 50', 'Pilot* 40', 'Science(Meteorology) 40', 'Search 50', 'Swim 60'], undefined, 'Navy'),
  p('navy-corpsman', 'Navy Hospital Corpsman', 'agency', 'p. 134', 2, [],
    ['Alertness 50', 'Athletics 50', 'Bureaucracy 40', 'Firearms 40', 'First Aid 60', 'HUMINT 40', 'Medicine 40', 'Persuade 50', 'Pharmacy 40', 'Science(Biology) 40', 'Survival 50'],
    [2, ['Drive 60', 'Forensics 40', 'Navigate 50', 'Psychotherapy 50', 'Search 60']], 'Navy'),
  p('usmc-forecon', 'USMC FORECON', 'agency', 'p. 136', 1, [],
    ['Alertness 60', 'Athletics 60', 'Demolitions 40', 'Dodge 50', 'Firearms 60', 'Heavy Weapons 50', 'Melee Weapons 50', `${MIL_LAND} 60`, 'Navigate 60', 'Stealth 60', 'Survival 60', 'Swim 50', 'Unarmed Combat 60'], undefined, 'USMC'),
  p('usmc-combat-camera', 'USMC Combat Camera', 'agency', 'p. 136', 3, [],
    ['Art* 50', 'Athletics 60', 'Bureaucracy 50', 'Computer Science 30', 'Craft(Electronics) 30', 'Firearms 40', 'History 40', 'HUMINT 50', 'Melee Weapons 40', 'Persuade 50', 'Survival 40', 'Unarmed Combat 50'],
    [1, ['Art* 50', 'Foreign Language* 50', 'Military Science* 50']], 'USMC'),
  p('usmc-mspf', 'USMC Maritime Special Purpose Force', 'agency', 'p. 136', 2, [],
    ['Alertness 60', 'Athletics 60', 'Bureaucracy 30', 'Demolitions 40', 'Dodge 50', 'Drive 40', 'Firearms 60', 'First Aid 30', 'Foreign Language* 40', 'Heavy Machinery 50', 'Heavy Weapons 50', `${MIL_LAND} 40`, 'Navigate 40', 'Persuade 30', 'Swim 60', 'Unarmed Combat 50'], undefined, 'USMC'),
  p('usmc-sfr', 'USMC Security Force Regiment', 'agency', 'p. 136', 3, [],
    ['Alertness 60', 'Athletics 60', 'Bureaucracy 30', 'Drive 40', 'Firearms 60', 'First Aid 30', 'Heavy Weapons 40', `${MIL_LAND} 40`, 'Navigate 40', 'Persuade 30', 'Survival 30', 'Unarmed Combat 50'],
    [2, ['Demolitions 40', 'Foreign Language* 40', 'Heavy Machinery 50', 'Search 60', 'SIGINT 40', 'Swim 60']], 'USMC'),
  p('socom-af-24sow', 'SOCOM Air Force 24th SOW / 720th STG', 'agency', 'p. 140', 1, [],
    ['Alertness 60', 'Athletics 60', 'Demolitions 40', 'Firearms 60', 'Heavy Weapons 50', 'Melee Weapons 50', `${MIL_LAND} 60`, 'Navigate 50', 'Stealth 50', 'Survival 50', 'Swim 50', 'Unarmed Combat 60'],
    [1, ['First Aid 60', 'SIGINT 50']], 'SOCOM'),
  p('socom-1sfg', 'SOCOM Army 1st Special Forces Group', 'agency', 'p. 140', 1, [],
    ['Alertness 50', 'Athletics 60', 'Demolitions 40', 'Firearms 60', 'Foreign Language* 20', 'Heavy Weapons 50', 'HUMINT 40', 'Melee Weapons 50', `${MIL_LAND} 60`, 'Navigate 50', 'Persuade 40', 'Stealth 50', 'Survival 50', 'Swim 50', 'Unarmed Combat 60'], undefined, 'SOCOM'),
  p('socom-4th-mist', 'SOCOM Army 4th MIST', 'agency', 'p. 140', 3, [],
    ['Alertness 50', 'Athletics 50', 'Bureaucracy 30', 'Drive 40', 'Firearms 40', 'First Aid 30', 'Foreign Language* 40', 'HUMINT 50', `${MIL_LAND} 40`, 'Navigate 40', 'Persuade 50', 'SIGINT 40', 'Unarmed Combat 50'],
    [1, ['Art* 40', 'Computer Science 40', 'Craft* 40', 'Foreign Language* 40']], 'SOCOM'),
  p('socom-160th', 'SOCOM Army 160th SOAR(A)', 'agency', 'p. 140', 1, [],
    ['Alertness 60', 'Athletics 50', 'Bureaucracy 30', 'Craft(Electrician) 40', 'Craft(Mechanic) 40', 'Firearms 40', 'Heavy Weapons 50', 'Military Science(Air) 60', `${MIL_LAND} 20`, 'Navigate 60', 'Pilot(Helicopter) 60', 'Science(Meteorology) 50', 'Swim 50'], undefined, 'SOCOM'),
  p('socom-isa', 'SOCOM Army ISA', 'agency', 'p. 140', 1, [],
    ['Alertness 60', 'Athletics 60', 'Firearms 60', 'Heavy Weapons 50', 'HUMINT 50', 'Melee Weapons 50', `${MIL_LAND} 60`, 'Navigate 50', 'SIGINT 50', 'Stealth 50', 'Survival 50', 'Swim 50', 'Unarmed Combat 60'], undefined, 'SOCOM'),
  p('socom-raiders', 'SOCOM Marine Raider Regiment', 'agency', 'p. 140', 1, [],
    ['Alertness 50', 'Athletics 60', 'Demolitions 40', 'Firearms 60', 'Heavy Weapons 50', 'Melee Weapons 50', `${MIL_LAND} 60`, 'Navigate 50', 'Persuade 40', 'Pilot(Small Boat) 40', 'Stealth 50', 'Survival 50', 'Swim 50', 'Unarmed Combat 60'], undefined, 'SOCOM'),
  p('socom-devgru', 'SOCOM Navy DEVGRU / SEALs', 'agency', 'p. 140', 1, [],
    ['Alertness 50', 'Athletics 60', 'Demolitions 40', 'Firearms 60', 'Heavy Weapons 50', 'Melee Weapons 50', `${MIL_LAND} 60`, 'Navigate 50', 'Pilot(Small Boat) 40', 'Stealth 50', 'Survival 60', 'Swim 60', 'Unarmed Combat 60'], undefined, 'SOCOM'),
  p('cia-sog', 'CIA SAD / Special Operations Group', 'agency', 'p. 152', 1, [],
    ['Alertness 60', 'Athletics 50', 'Demolitions 40', 'Firearms 60', 'Foreign Language* 40', 'Heavy Weapons 50', 'HUMINT 30', 'Melee Weapons 50', `${MIL_LAND} 50`, 'Navigate 50', 'Persuade 40', 'Stealth 50', 'Survival 50', 'Swim 40', 'Unarmed Combat 60'], undefined, 'CIA'),
  p('cia-pag', 'CIA SAD / Political Action Group', 'agency', 'p. 152', 1, [],
    ['Accounting 40', 'Anthropology 40', 'Athletics 40', 'Bureaucracy 60', 'Disguise 40', 'Firearms 40', 'Foreign Language* 50', 'Foreign Language* 50', 'Foreign Language* 40', 'History 40', 'HUMINT 50', 'Law 40', 'Persuade 50', 'Stealth 50', 'Unarmed Combat 60'], undefined, 'CIA'),
  p('epa-oceft', 'EPA OCEFT (CID / NEIC)', 'agency', 'p. 163', 4, [],
    ['Alertness 50', 'Bureaucracy 40', 'Criminology 50', 'Drive 40', 'Firearms 40', 'Forensics 40', 'HUMINT 50', 'Law 30', 'Persuade 50', 'Science* 40', 'Search 50'], undefined, 'EPA'),
  p('epa-regional', 'EPA Regional Office Specialist', 'agency', 'p. 163', 4, [],
    ['Alertness 60', 'Bureaucracy 40', 'Forensics 40', 'Law 40', 'Science* 60', 'Science* 50', 'Science* 50', 'Search 60'], undefined, 'EPA'),
];

export const GROUP_LABEL: Record<Group, string> = {
  core: 'Core professions',
  additional: 'Additional professions',
  agency: 'Federal agency unit kits',
};

/** Federal-agency postings that reuse a base profession (CIA p. 152, State p. 153–156, CDC p. 160). */
export interface Posting { agency: string; unit: string; page: string; professions: string[]; bonus: string[] }
export const POSTINGS: Posting[] = [
  { agency: 'CIA', unit: 'DO Clandestine Service', page: 'p. 152', professions: ['case-officer'], bonus: ['Bureaucracy', 'HUMINT', 'Persuade', 'SIGINT'] },
  { agency: 'CIA', unit: 'Directorate of Analysis', page: 'p. 152', professions: ['intelligence-analyst'], bonus: ['Anthropology', 'HUMINT', 'SIGINT', 'History'] },
  { agency: 'State', unit: 'Regional Bureau (WHA etc.)', page: 'p. 156', professions: ['foreign-service-officer'], bonus: ['Anthropology', 'Bureaucracy', 'Foreign Language*', 'History'] },
  { agency: 'State', unit: 'Diplomatic Security', page: 'p. 156', professions: ['federal-agent'], bonus: ['Bureaucracy', 'Foreign Language*', 'HUMINT', 'Persuade'] },
  { agency: 'State', unit: 'Diplomatic Courier Service', page: 'p. 156', professions: ['foreign-service-officer'], bonus: ['Bureaucracy', 'Foreign Language*', 'Law', 'Persuade'] },
  { agency: 'State', unit: 'INL', page: 'p. 156', professions: ['program-manager'], bonus: ['Accounting', 'Bureaucracy', 'Criminology', 'Law'] },
  { agency: 'State', unit: 'Intelligence and Research (INR)', page: 'p. 156', professions: ['foreign-service-officer', 'media-specialist', 'intelligence-analyst'], bonus: ['History', 'HUMINT', 'Persuade', 'SIGINT'] },
  { agency: 'CDC', unit: 'Public Health Preparedness / EOC', page: 'p. 160', professions: ['physician', 'program-manager', 'scientist'], bonus: ['Accounting', 'Bureaucracy', 'Persuade', 'Science*'] },
  { agency: 'CDC', unit: 'Global Rapid Response Team', page: 'p. 160', professions: ['media-specialist', 'physician', 'scientist'], bonus: ['Foreign Language*', 'Forensics', 'Science*', 'Survival'] },
  { agency: 'CDC', unit: 'PHS Commissioned Corps', page: 'p. 160', professions: ['nurse', 'physician', 'scientist'], bonus: ['First Aid', 'Pharmacy', 'Psychotherapy', 'Surgery'] },
  { agency: 'Army', unit: 'Medical Corps', page: 'p. 131', professions: ['physician'], bonus: ['Athletics', 'First Aid', 'Medicine', 'Surgery'] },
];
