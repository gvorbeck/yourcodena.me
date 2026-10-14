// Agent's Handbook p. 29 — skills and base ratings. Typed skills are written "Family(Type)".
export const BASE_RATINGS: Record<string, number> = {
  Accounting: 10, Alertness: 20, Anthropology: 0, Archeology: 0, Art: 0, Artillery: 0,
  Athletics: 30, Bureaucracy: 10, 'Computer Science': 0, Craft: 0, Criminology: 10,
  Demolitions: 0, Disguise: 10, Dodge: 30, Drive: 20, Firearms: 20, 'First Aid': 10,
  'Foreign Language': 0, Forensics: 0, 'Heavy Machinery': 10, 'Heavy Weapons': 0,
  History: 10, HUMINT: 10, Law: 0, Medicine: 0, 'Melee Weapons': 30, 'Military Science': 0,
  Navigate: 10, Occult: 10, Persuade: 20, Pharmacy: 0, Pilot: 0, Psychotherapy: 10,
  Ride: 10, Science: 0, Search: 20, SIGINT: 0, Stealth: 10, Surgery: 0, Survival: 10,
  Swim: 20, 'Unarmed Combat': 40, Unnatural: 0,
};

export const TYPED_SKILLS = ['Art', 'Craft', 'Foreign Language', 'Military Science', 'Pilot', 'Science'];

export const SKILL_FAMILIES = Object.keys(BASE_RATINGS);

/** Suggested types (p. 30–32); free text is always allowed. */
export const TYPE_SUGGESTIONS: Record<string, string[]> = {
  Art: ['Acting', 'Creative Writing', 'Dance', 'Forgery', 'Guitar', 'Journalism', 'Painting', 'Photography', 'Poetry', 'Scriptwriting', 'Sculpture', 'Singing', 'Videography', 'Violin'],
  Craft: ['Architect', 'Carpenter', 'Electrician', 'Gunsmith', 'Locksmithing', 'Mechanic', 'Microelectronics', 'Plumber'],
  'Military Science': ['Land', 'Air', 'Sea'],
  Pilot: ['Airplane', 'Helicopter', 'Small Boat'],
  Science: ['Biology', 'Botany', 'Chemistry', 'Environmental', 'Mathematics', 'Meteorology', 'Microbiology', 'Physics'],
};

export const MAX_SKILL = 99;
export const MAX_CREATION_SKILL = 80;
export const BONUS_POINTS = 20;
export const BONUS_PICKS = 8;

const KEY_RE = /^(.+?)\((.*)\)$/;
export const familyOf = (key: string) => KEY_RE.exec(key)?.[1] ?? key;
export const typeOf = (key: string) => KEY_RE.exec(key)?.[2] ?? '';
export const makeKey = (family: string, type?: string) => (type ? `${family}(${type})` : family);
export const baseRating = (key: string) => BASE_RATINGS[familyOf(key)] ?? 0;
