export interface CanonicalMediaInfo {
  canonicalId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string;
  backdropPath?: string;
  releaseDate?: string;
  voteAverage?: number;
}

export const CANONICAL_MEDIA_MAP: Record<string, CanonicalMediaInfo> = {
  // The 100: IMDb numeric 2661044 <-> TMDB TV 48866
  '2661044': {
    canonicalId: 48866,
    mediaType: 'tv',
    title: 'The 100',
    posterPath: '/wHIMMLFsk32wIzDmawWkYVbxFCS.jpg',
    backdropPath: '/8ZerYKvIaNUJZvAHXYTQu4qTwFw.jpg',
    releaseDate: '2014-03-19',
    voteAverage: 7.9,
  },
  '48866': {
    canonicalId: 48866,
    mediaType: 'tv',
    title: 'The 100',
    posterPath: '/wHIMMLFsk32wIzDmawWkYVbxFCS.jpg',
    backdropPath: '/8ZerYKvIaNUJZvAHXYTQu4qTwFw.jpg',
    releaseDate: '2014-03-19',
    voteAverage: 7.9,
  },
  // The Trap (Korean drama series): TMDB TV 87108 / DB 283371
  '283371': {
    canonicalId: 283371,
    mediaType: 'tv',
    title: 'The Trap',
    posterPath: 'https://m.media-amazon.com/images/M/MV5BMjYwOTg1OTQtNmY4Yi00ZjdlLWFjYTgtOTFlM2Q1ZmNlYmI1XkEyXkFqcGc@._V1_.jpg',
    backdropPath: 'https://m.media-amazon.com/images/M/MV5BMjYwOTg1OTQtNmY4Yi00ZjdlLWFjYTgtOTFlM2Q1ZmNlYmI1XkEyXkFqcGc@._V1_.jpg',
    releaseDate: '2019-02-09',
    voteAverage: 7.8,
  },
  // The Rig (Amazon Prime original series): TMDB TV 112581
  '112581': {
    canonicalId: 112581,
    mediaType: 'tv',
    title: 'The Rig',
    posterPath: 'https://m.media-amazon.com/images/M/MV5BYTY4ODk5ZjctN2RlMy00YTUxLWIzNjktNTdiN2M4ODZlM2JmXkEyXkFqcGc@._V1_.jpg',
    backdropPath: 'https://m.media-amazon.com/images/M/MV5BYTY4ODk5ZjctN2RlMy00YTUxLWIzNjktNTdiN2M4ODZlM2JmXkEyXkFqcGc@._V1_.jpg',
    releaseDate: '2023-01-06',
    voteAverage: 7.8,
  },
  // The Ex-Wife (Paramount+ series): TMDB TV 211029 / DB 25397918
  '25397918': {
    canonicalId: 25397918,
    mediaType: 'tv',
    title: 'The Ex-Wife',
    posterPath: 'https://m.media-amazon.com/images/M/MV5BNTBhYTQ4YTMtZjg2NS00M2YzLWE2NjgtYTA0NzcxNjM3OTYwXkEyXkFqcGc@._V1_.jpg',
    backdropPath: 'https://m.media-amazon.com/images/M/MV5BNTBhYTQ4YTMtZjg2NS00M2YzLWE2NjgtYTA0NzcxNjM3OTYwXkEyXkFqcGc@._V1_.jpg',
    releaseDate: '2022-10-12',
    voteAverage: 8.4,
  },
  // Wonder Woman (2017 Feature Film): TMDB Movie 297762
  '297762': {
    canonicalId: 297762,
    mediaType: 'movie',
    title: 'Wonder Woman',
    posterPath: '/imekS7f1OuHyUP2LAiTEM0zBzUz.jpg',
    backdropPath: '/hA5oCgvgCxj5Vvgfmkg5qpW25fr.jpg',
    releaseDate: '2017-05-30',
    voteAverage: 7.2,
  },
  // Maamla Legal Hai: TMDB TV 246483
  '246483': {
    canonicalId: 246483,
    mediaType: 'tv',
    title: 'Maamla Legal Hai',
    posterPath: 'https://m.media-amazon.com/images/M/MV5BYWZhMjg2NTgtY2MyMC00ZGI5LWIzYTgtMDFiYjA3YzRhMzY1XkEyXkFqcGc@._V1_.jpg',
    backdropPath: 'https://m.media-amazon.com/images/M/MV5BYWZhMjg2NTgtY2MyMC00ZGI5LWIzYTgtMDFiYjA3YzRhMzY1XkEyXkFqcGc@._V1_.jpg',
    releaseDate: '2024-03-01',
    voteAverage: 7.8,
  },
  // Carrie (2026 Prime Video Series): TMDB 288673
  '288673': {
    canonicalId: 288673,
    mediaType: 'tv',
    title: 'Carrie',
    posterPath: 'https://upload.wikimedia.org/wikipedia/en/7/7c/Carrie_%28miniseries_poster%29.png',
    backdropPath: 'https://upload.wikimedia.org/wikipedia/en/7/7c/Carrie_%28miniseries_poster%29.png',
    releaseDate: '2026-10-07',
    voteAverage: 7.8,
  },
  // Wardriver: 5095076 -> 938150
  '5095076': {
    canonicalId: 938150,
    mediaType: 'movie',
    title: 'Wardriver',
    posterPath: '/rBZA12Hf4yZZgud6iPuFU49L7zk.jpg',
    backdropPath: '/rBZA12Hf4yZZgud6iPuFU49L7zk.jpg',
    releaseDate: '2025-01-01',
    voteAverage: 7.5,
  },
  '938150': {
    canonicalId: 938150,
    mediaType: 'movie',
    title: 'Wardriver',
    posterPath: '/rBZA12Hf4yZZgud6iPuFU49L7zk.jpg',
    backdropPath: '/rBZA12Hf4yZZgud6iPuFU49L7zk.jpg',
    releaseDate: '2025-01-01',
    voteAverage: 7.5,
  },
  // The Tank: 31495504 -> 1252037
  '31495504': {
    canonicalId: 1252037,
    mediaType: 'movie',
    title: 'The Tank',
    posterPath: '/65Jr1JAgWlu9em8zHhAfrNJJQBt.jpg',
    backdropPath: '/65Jr1JAgWlu9em8zHhAfrNJJQBt.jpg',
    releaseDate: '2023-04-21',
    voteAverage: 6.8,
  },
  '1252037': {
    canonicalId: 1252037,
    mediaType: 'movie',
    title: 'The Tank',
    posterPath: '/65Jr1JAgWlu9em8zHhAfrNJJQBt.jpg',
    backdropPath: '/65Jr1JAgWlu9em8zHhAfrNJJQBt.jpg',
    releaseDate: '2023-04-21',
    voteAverage: 6.8,
  },
};

export function resolveCanonicalMedia(id: string | number, _currentMediaType?: string): CanonicalMediaInfo | null {
  const strId = String(id).trim();
  const normalizedKey = strId.startsWith('tt') ? strId.replace(/^tt0*/, '') : strId;
  if (CANONICAL_MEDIA_MAP[normalizedKey]) {
    return CANONICAL_MEDIA_MAP[normalizedKey];
  }
  if (CANONICAL_MEDIA_MAP[strId]) {
    return CANONICAL_MEDIA_MAP[strId];
  }
  return null;
}
