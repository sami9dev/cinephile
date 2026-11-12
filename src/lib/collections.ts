/**
 * Movie & TV Franchise Collections & Release Year Presets
 * Enables rich filtering for popular cinematic franchises (MCU, DCEU, X-Men, etc.)
 * and release year decades across Cinephile.
 */

export interface CollectionItem {
  id: string;
  name: string;
  shortName: string;
  badge: string;
  description: string;
  keywords: string[];
}

export const COLLECTIONS_DATA: CollectionItem[] = [
  {
    id: 'mcu',
    name: 'Marvel Cinematic Universe (MCU)',
    shortName: 'MCU',
    badge: '🛡️',
    description: 'Iron Man, Avengers, Captain America, Thor, Spider-Man and the complete Marvel multiverse.',
    keywords: [
      'iron man',
      'avengers',
      'captain america',
      'thor',
      'black panther',
      'guardians of the galaxy',
      'doctor strange',
      'ant-man',
      'captain marvel',
      'black widow',
      'eternals',
      'shang-chi',
      'deadpool & wolverine',
      'spider-man: homecoming',
      'spider-man: far from home',
      'spider-man: no way home',
      'hulk',
      'loki',
      'wandavision',
      'falcon and the winter soldier',
      'hawkeye',
      'moon knight',
      'she-hulk',
      'secret invasion',
      'what if',
    ],
  },
  {
    id: 'dceu',
    name: 'DC Universe & Batman (DCEU)',
    shortName: 'DCEU',
    badge: '🦇',
    description: 'The Dark Knight trilogy, Batman, Superman, Justice League, Wonder Woman and DC legends.',
    keywords: [
      'batman',
      'dark knight',
      'superman',
      'man of steel',
      'justice league',
      'wonder woman',
      'aquaman',
      'flash',
      'shazam',
      'suicide squad',
      'black adam',
      'joker',
      'peacemaker',
      'birds of prey',
      'blue beetle',
    ],
  },
  {
    id: 'x-men',
    name: 'X-Men Saga',
    shortName: 'X-Men',
    badge: '🧬',
    description: 'The complete mutant saga including Wolverine, Logan, Deadpool, First Class and Days of Future Past.',
    keywords: [
      'x-men',
      'wolverine',
      'logan',
      'deadpool',
      'new mutants',
      'dark phoenix',
      'first class',
      'days of future past',
      'apocalypse',
    ],
  },
  {
    id: 'hunger-games',
    name: 'The Hunger Games',
    shortName: 'Hunger Games',
    badge: '🏹',
    description: 'Katniss Everdeen, Catching Fire, Mockingjay, and The Ballad of Songbirds & Snakes.',
    keywords: [
      'hunger games',
      'catching fire',
      'mockingjay',
      'songbirds',
    ],
  },
  {
    id: 'pirates',
    name: 'Pirates of the Caribbean',
    shortName: 'Pirates',
    badge: '🏴‍☠️',
    description: 'Captain Jack Sparrow across all 5 legendary adventures on the high seas.',
    keywords: [
      'pirates of the caribbean',
      'black pearl',
      "dead man's chest",
      "at world's end",
      'on stranger tides',
      'dead men tell no tales',
    ],
  },
  {
    id: 'harry-potter',
    name: 'Harry Potter & Wizarding World',
    shortName: 'Harry Potter',
    badge: '⚡',
    description: 'The complete 8-film Hogwarts journey and Fantastic Beasts prequel adventures.',
    keywords: [
      'harry potter',
      'fantastic beasts',
      "philosopher's stone",
      'chamber of secrets',
      'prisoner of azkaban',
      'goblet of fire',
      'order of the phoenix',
      'half-blood prince',
      'deathly hallows',
    ],
  },
  {
    id: 'lotr',
    name: 'The Lord of the Rings & Hobbit',
    shortName: 'LOTR',
    badge: '💍',
    description: 'Middle-earth masterpieces directed by Peter Jackson plus The Hobbit trilogy.',
    keywords: [
      'lord of the rings',
      'the hobbit',
      'fellowship of the ring',
      'two towers',
      'return of the king',
      'unexpected journey',
      'desolation of smaug',
      'battle of the five armies',
      'rings of power',
    ],
  },
  {
    id: 'transformers',
    name: 'Transformers Saga',
    shortName: 'Transformers',
    badge: '🤖',
    description: 'Autobots and Decepticons action from Michael Bay epics to Transformers One.',
    keywords: [
      'transformers',
      'bumblebee',
      'rise of the beasts',
    ],
  },
  {
    id: 'fast-furious',
    name: 'Fast & Furious Saga',
    shortName: 'Fast & Furious',
    badge: '🏎️',
    description: 'High-octane street racing, heist action, and family adventures across the world.',
    keywords: [
      'fast & furious',
      'fast and the furious',
      'fast and furious',
      '2 fast 2 furious',
      'tokyo drift',
      'fast five',
      'furious 7',
      'hobbs & shaw',
    ],
  },
  {
    id: 'mission-impossible',
    name: 'Mission: Impossible',
    shortName: 'M:I',
    badge: '🕶️',
    description: 'Ethan Hunt and the IMF team tackling impossible globetrotting missions.',
    keywords: [
      'mission: impossible',
      'mission impossible',
      'ghost protocol',
      'rogue nation',
      'fallout',
      'dead reckoning',
      'final reckoning',
    ],
  },
  {
    id: 'terminator',
    name: 'The Terminator Saga',
    shortName: 'Terminator',
    badge: '🦾',
    description: 'The Terminator, Judgment Day, Rise of the Machines, Salvation, Genisys, and Dark Fate.',
    keywords: [
      'terminator',
      'judgment day',
      'rise of the machines',
      'dark fate',
      'genisys',
      'sarah connor',
    ],
  },
  {
    id: 'final-destination',
    name: 'Final Destination Collection',
    shortName: 'Final Destination',
    badge: '💀',
    description: 'Death cannot be cheated: the complete Final Destination supernatural horror series.',
    keywords: [
      'final destination',
      'the final destination',
      'bloodlines',
    ],
  },
  {
    id: 'spider-man',
    name: 'Spider-Man Universe',
    shortName: 'Spider-Man',
    badge: '🕷️',
    description: 'Tobey Maguire, Andrew Garfield, Tom Holland, and Spider-Verse animated epics.',
    keywords: [
      'spider-man',
      'spiderman',
      'spider-verse',
      'amazing spider-man',
      'no way home',
      'far from home',
      'homecoming',
    ],
  },
];

export interface YearPresetItem {
  id: string;
  label: string;
  shortLabel: string;
  badge?: string;
  match: (year: number) => boolean;
}

export const YEAR_PRESETS: YearPresetItem[] = [
  { id: 'all', label: 'All Release Years', shortLabel: 'All Years', badge: '✨', match: () => true },
  { id: '2026', label: '2026 Releases', shortLabel: '2026', badge: '🔥', match: (y) => y === 2026 },
  { id: '2025', label: '2025 Releases', shortLabel: '2025', badge: '✨', match: (y) => y === 2025 },
  { id: '2024', label: '2024 Releases', shortLabel: '2024', badge: '🎬', match: (y) => y === 2024 },
  { id: '2023', label: '2023 Releases', shortLabel: '2023', badge: '🍿', match: (y) => y === 2023 },
  { id: '2022', label: '2022 Releases', shortLabel: '2022', badge: '⚡', match: (y) => y === 2022 },
  { id: '2021', label: '2021 Releases', shortLabel: '2021', badge: '🎥', match: (y) => y === 2021 },
  { id: '2020', label: '2020 Releases', shortLabel: '2020', badge: '📼', match: (y) => y === 2020 },
  { id: '2010s', label: '2010s Decade (2010–2019)', shortLabel: '2010s', badge: '🏆', match: (y) => y >= 2010 && y <= 2019 },
  { id: '2000s', label: '2000s Decade (2000–2009)', shortLabel: '2000s', badge: '💿', match: (y) => y >= 2000 && y <= 2009 },
  { id: 'classics', label: 'Classics (Pre-2000)', shortLabel: 'Classics', badge: '🎞️', match: (y) => y > 0 && y < 2000 },
];

/**
 * Checks whether a movie/show title matches a given collection ID.
 */
export function matchesCollection(title: string | undefined, collectionId: string | undefined): boolean {
  if (!collectionId || collectionId === 'all') return true;
  if (!title) return false;
  const col = COLLECTIONS_DATA.find((c) => c.id.toLowerCase() === collectionId.toLowerCase());
  if (!col) return false;
  const normalized = title.toLowerCase();
  return col.keywords.some((kw) => normalized.includes(kw));
}

/**
 * Checks whether a release date string (YYYY-MM-DD) matches a given year filter.
 */
export function matchesYear(releaseDate: string | undefined, yearFilter: string | undefined): boolean {
  if (!yearFilter || yearFilter === 'all') return true;
  if (!releaseDate) return false;
  const yearNum = parseInt(releaseDate.slice(0, 4), 10);
  if (isNaN(yearNum)) return false;
  const preset = YEAR_PRESETS.find((y) => y.id.toLowerCase() === yearFilter.toLowerCase());
  if (preset) return preset.match(yearNum);
  const parsedExact = parseInt(yearFilter, 10);
  if (!isNaN(parsedExact)) return yearNum === parsedExact;
  return false;
}
