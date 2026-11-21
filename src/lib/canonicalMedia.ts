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
  'tt2661044': {
    canonicalId: 48866,
    mediaType: 'tv',
    title: 'The 100',
    posterPath: '/wHIMMLFsk32wIzDmawWkYVbxFCS.jpg',
    backdropPath: '/8ZerYKvIaNUJZvAHXYTQu4qTwFw.jpg',
    releaseDate: '2014-03-19',
    voteAverage: 7.9,
  },
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
  // The Altruists (2026 TV Series): TMDB 308007
  '308007': {
    canonicalId: 308007,
    mediaType: 'tv',
    title: 'The Altruists',
    posterPath: '/foTyGlJ1jJh8QID5KwjsMytsJTV.jpg',
    backdropPath: '/m8JTMj7jDMJFZAPP1ASmSi4gMWi.jpg',
    releaseDate: '2026-11-19',
    voteAverage: 8.0,
  },
  'the-altruists': {
    canonicalId: 308007,
    mediaType: 'tv',
    title: 'The Altruists',
    posterPath: '/foTyGlJ1jJh8QID5KwjsMytsJTV.jpg',
    backdropPath: '/m8JTMj7jDMJFZAPP1ASmSi4gMWi.jpg',
    releaseDate: '2026-11-19',
    voteAverage: 8.0,
  },
  'the altruists': {
    canonicalId: 308007,
    mediaType: 'tv',
    title: 'The Altruists',
    posterPath: '/foTyGlJ1jJh8QID5KwjsMytsJTV.jpg',
    backdropPath: '/m8JTMj7jDMJFZAPP1ASmSi4gMWi.jpg',
    releaseDate: '2026-11-19',
    voteAverage: 8.0,
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
  'tt5095076': {
    canonicalId: 938150,
    mediaType: 'movie',
    title: 'Wardriver',
    posterPath: '/rBZA12Hf4yZZgud6iPuFU49L7zk.jpg',
    backdropPath: '/rBZA12Hf4yZZgud6iPuFU49L7zk.jpg',
    releaseDate: '2025-01-01',
    voteAverage: 7.5,
  },
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
  'tt31495504': {
    canonicalId: 1252037,
    mediaType: 'movie',
    title: 'The Tank',
    posterPath: '/65Jr1JAgWlu9em8zHhAfrNJJQBt.jpg',
    backdropPath: '/65Jr1JAgWlu9em8zHhAfrNJJQBt.jpg',
    releaseDate: '2023-04-21',
    voteAverage: 6.8,
  },
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
  // Panchayat (TV Series): TMDB TV 101352
  '101352': {
    canonicalId: 101352,
    mediaType: 'tv',
    title: 'Panchayat',
    posterPath: '/8ivTX5q2otqXvH815BcOhxVkTPW.jpg',
    backdropPath: '/iZ8EtGAqKWZdRJPzWfFseNfVxjh.jpg',
    releaseDate: '2020-04-03',
    voteAverage: 8.8,
  },
  // Oppenheimer (2023): IMDb tt15398776 / 15398776 <-> TMDB Movie 872585
  '872585': {
    canonicalId: 872585,
    mediaType: 'movie',
    title: 'Oppenheimer',
    posterPath: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    backdropPath: '/neeNHeXjMF5fXoCJRsOmkNGC7q.jpg',
    releaseDate: '2023-07-21',
    voteAverage: 8.1,
  },
  '15398776': {
    canonicalId: 872585,
    mediaType: 'movie',
    title: 'Oppenheimer',
    posterPath: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    backdropPath: '/neeNHeXjMF5fXoCJRsOmkNGC7q.jpg',
    releaseDate: '2023-07-21',
    voteAverage: 8.1,
  },
  'tt15398776': {
    canonicalId: 872585,
    mediaType: 'movie',
    title: 'Oppenheimer',
    posterPath: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    backdropPath: '/neeNHeXjMF5fXoCJRsOmkNGC7q.jpg',
    releaseDate: '2023-07-21',
    voteAverage: 8.1,
  },
  // Interstellar (2014): IMDb tt0816692 / 816692 <-> TMDB Movie 157336
  '157336': {
    canonicalId: 157336,
    mediaType: 'movie',
    title: 'Interstellar',
    posterPath: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdropPath: '/rAiYTsqBkRefbitUDBhApLbhQnl.jpg',
    releaseDate: '2014-11-05',
    voteAverage: 8.4,
  },
  '816692': {
    canonicalId: 157336,
    mediaType: 'movie',
    title: 'Interstellar',
    posterPath: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdropPath: '/rAiYTsqBkRefbitUDBhApLbhQnl.jpg',
    releaseDate: '2014-11-05',
    voteAverage: 8.4,
  },
  '0816692': {
    canonicalId: 157336,
    mediaType: 'movie',
    title: 'Interstellar',
    posterPath: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdropPath: '/rAiYTsqBkRefbitUDBhApLbhQnl.jpg',
    releaseDate: '2014-11-05',
    voteAverage: 8.4,
  },
  'tt816692': {
    canonicalId: 157336,
    mediaType: 'movie',
    title: 'Interstellar',
    posterPath: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdropPath: '/rAiYTsqBkRefbitUDBhApLbhQnl.jpg',
    releaseDate: '2014-11-05',
    voteAverage: 8.4,
  },
  'tt0816692': {
    canonicalId: 157336,
    mediaType: 'movie',
    title: 'Interstellar',
    posterPath: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdropPath: '/rAiYTsqBkRefbitUDBhApLbhQnl.jpg',
    releaseDate: '2014-11-05',
    voteAverage: 8.4,
  },
  // The Karate Kid Anthology (1984 - 2010)
  '1885': {
    canonicalId: 1885,
    mediaType: 'movie',
    title: 'The Karate Kid',
    posterPath: '/1mp4ViklKvA0WXXsNvNx0RBuiit.jpg',
    backdropPath: '/j1xaeJZOEOiVBD1rk3dg4YaAk23.jpg',
    releaseDate: '1984-06-22',
    voteAverage: 7.2,
  },
  'tt0087538': {
    canonicalId: 1885,
    mediaType: 'movie',
    title: 'The Karate Kid',
    posterPath: '/1mp4ViklKvA0WXXsNvNx0RBuiit.jpg',
    backdropPath: '/j1xaeJZOEOiVBD1rk3dg4YaAk23.jpg',
    releaseDate: '1984-06-22',
    voteAverage: 7.2,
  },
  '8856': {
    canonicalId: 8856,
    mediaType: 'movie',
    title: 'The Karate Kid Part II',
    posterPath: '/k0OwgRR6PNu7h3SiqpCbRdZWNaG.jpg',
    backdropPath: '/7rfcRXbFD0xr8NteNq1hwXUd4Af.jpg',
    releaseDate: '1986-06-18',
    voteAverage: 6.3,
  },
  'tt0091326': {
    canonicalId: 8856,
    mediaType: 'movie',
    title: 'The Karate Kid Part II',
    posterPath: '/k0OwgRR6PNu7h3SiqpCbRdZWNaG.jpg',
    backdropPath: '/7rfcRXbFD0xr8NteNq1hwXUd4Af.jpg',
    releaseDate: '1986-06-18',
    voteAverage: 6.3,
  },
  '10495': {
    canonicalId: 10495,
    mediaType: 'movie',
    title: 'The Karate Kid Part III',
    posterPath: '/lVZ3r0iDwGejlCvFEvXGzhQB9ds.jpg',
    backdropPath: '/c12c7Rpq4kakQiaZIQgp5aTaDFB.jpg',
    releaseDate: '1989-06-16',
    voteAverage: 5.6,
  },
  'tt0097647': {
    canonicalId: 10495,
    mediaType: 'movie',
    title: 'The Karate Kid Part III',
    posterPath: '/lVZ3r0iDwGejlCvFEvXGzhQB9ds.jpg',
    backdropPath: '/c12c7Rpq4kakQiaZIQgp5aTaDFB.jpg',
    releaseDate: '1989-06-16',
    voteAverage: 5.6,
  },
  '11231': {
    canonicalId: 11231,
    mediaType: 'movie',
    title: 'The Next Karate Kid',
    posterPath: '/wI3gCi9w1cuUJCiwhviAy46we9Q.jpg',
    backdropPath: '/kgqgbPB2snzVlkMkQjYAvmF1hkc.jpg',
    releaseDate: '1994-07-18',
    voteAverage: 5.1,
  },
  'tt0110657': {
    canonicalId: 11231,
    mediaType: 'movie',
    title: 'The Next Karate Kid',
    posterPath: '/wI3gCi9w1cuUJCiwhviAy46we9Q.jpg',
    backdropPath: '/kgqgbPB2snzVlkMkQjYAvmF1hkc.jpg',
    releaseDate: '1994-07-18',
    voteAverage: 5.1,
  },
  '38575': {
    canonicalId: 38575,
    mediaType: 'movie',
    title: 'The Karate Kid',
    posterPath: '/b1RBy3l297N0c7PHjlz35cClWju.jpg',
    backdropPath: '/v8DepuF6gizphLzIyNZeQiB0hij.jpg',
    releaseDate: '2010-06-10',
    voteAverage: 6.5,
  },
  'tt1155076': {
    canonicalId: 38575,
    mediaType: 'movie',
    title: 'The Karate Kid',
    posterPath: '/b1RBy3l297N0c7PHjlz35cClWju.jpg',
    backdropPath: '/v8DepuF6gizphLzIyNZeQiB0hij.jpg',
    releaseDate: '2010-06-10',
    voteAverage: 6.5,
  },
  // =========================================================================
  // Wrong Turn Franchise (7 Films)
  // =========================================================================
  '9902': {
    canonicalId: 9902,
    mediaType: 'movie',
    title: 'Wrong Turn',
    posterPath: '/12G5V0dTmljnv7RFMT144dJ2chh.jpg',
    backdropPath: '/6FYkeJOKKEdrUVg9g5sSye802RH.jpg',
    releaseDate: '2003-05-30',
    voteAverage: 6.4,
  },
  'tt0295700': {
    canonicalId: 9902,
    mediaType: 'movie',
    title: 'Wrong Turn',
    posterPath: '/12G5V0dTmljnv7RFMT144dJ2chh.jpg',
    backdropPath: '/6FYkeJOKKEdrUVg9g5sSye802RH.jpg',
    releaseDate: '2003-05-30',
    voteAverage: 6.4,
  },
  'wrong turn 2003': {
    canonicalId: 9902,
    mediaType: 'movie',
    title: 'Wrong Turn',
    posterPath: '/12G5V0dTmljnv7RFMT144dJ2chh.jpg',
    backdropPath: '/6FYkeJOKKEdrUVg9g5sSye802RH.jpg',
    releaseDate: '2003-05-30',
    voteAverage: 6.4,
  },
  '13186': {
    canonicalId: 13186,
    mediaType: 'movie',
    title: 'Wrong Turn 2: Dead End',
    posterPath: '/iQ37ygxcpJNZp1XdHMantumylmw.jpg',
    backdropPath: '/o2SeAw8ARPB1D8oudCRJcxW3w60.jpg',
    releaseDate: '2007-08-25',
    voteAverage: 6.2,
  },
  'tt0804555': {
    canonicalId: 13186,
    mediaType: 'movie',
    title: 'Wrong Turn 2: Dead End',
    posterPath: '/iQ37ygxcpJNZp1XdHMantumylmw.jpg',
    backdropPath: '/o2SeAw8ARPB1D8oudCRJcxW3w60.jpg',
    releaseDate: '2007-08-25',
    voteAverage: 6.2,
  },
  'wrong turn 2': {
    canonicalId: 13186,
    mediaType: 'movie',
    title: 'Wrong Turn 2: Dead End',
    posterPath: '/iQ37ygxcpJNZp1XdHMantumylmw.jpg',
    backdropPath: '/o2SeAw8ARPB1D8oudCRJcxW3w60.jpg',
    releaseDate: '2007-08-25',
    voteAverage: 6.2,
  },
  'wrong turn 2 dead end': {
    canonicalId: 13186,
    mediaType: 'movie',
    title: 'Wrong Turn 2: Dead End',
    posterPath: '/iQ37ygxcpJNZp1XdHMantumylmw.jpg',
    backdropPath: '/o2SeAw8ARPB1D8oudCRJcxW3w60.jpg',
    releaseDate: '2007-08-25',
    voteAverage: 6.2,
  },
  '23823': {
    canonicalId: 23823,
    mediaType: 'movie',
    title: 'Wrong Turn 3: Left for Dead',
    posterPath: '/84s4LMWuGbm4xPWW5PSbHyQhh33.jpg',
    backdropPath: '/8568C7FeSsjmqLGuObSB0oB6kOU.jpg',
    releaseDate: '2009-10-08',
    voteAverage: 5.7,
  },
  'tt1261945': {
    canonicalId: 23823,
    mediaType: 'movie',
    title: 'Wrong Turn 3: Left for Dead',
    posterPath: '/84s4LMWuGbm4xPWW5PSbHyQhh33.jpg',
    backdropPath: '/8568C7FeSsjmqLGuObSB0oB6kOU.jpg',
    releaseDate: '2009-10-08',
    voteAverage: 5.7,
  },
  'wrong turn 3': {
    canonicalId: 23823,
    mediaType: 'movie',
    title: 'Wrong Turn 3: Left for Dead',
    posterPath: '/84s4LMWuGbm4xPWW5PSbHyQhh33.jpg',
    backdropPath: '/8568C7FeSsjmqLGuObSB0oB6kOU.jpg',
    releaseDate: '2009-10-08',
    voteAverage: 5.7,
  },
  'wrong turn 3 left for dead': {
    canonicalId: 23823,
    mediaType: 'movie',
    title: 'Wrong Turn 3: Left for Dead',
    posterPath: '/84s4LMWuGbm4xPWW5PSbHyQhh33.jpg',
    backdropPath: '/8568C7FeSsjmqLGuObSB0oB6kOU.jpg',
    releaseDate: '2009-10-08',
    voteAverage: 5.7,
  },
  '71672': {
    canonicalId: 71672,
    mediaType: 'movie',
    title: 'Wrong Turn 4: Bloody Beginnings',
    posterPath: '/l1vD4GY7tlT420KJ3xWTzyQ2Aa9.jpg',
    backdropPath: '/8xyJcJnYbupkPPMvwTEJaUwjxDI.jpg',
    releaseDate: '2011-10-17',
    voteAverage: 5.7,
  },
  'tt1865567': {
    canonicalId: 71672,
    mediaType: 'movie',
    title: 'Wrong Turn 4: Bloody Beginnings',
    posterPath: '/l1vD4GY7tlT420KJ3xWTzyQ2Aa9.jpg',
    backdropPath: '/8xyJcJnYbupkPPMvwTEJaUwjxDI.jpg',
    releaseDate: '2011-10-17',
    voteAverage: 5.7,
  },
  'wrong turn 4': {
    canonicalId: 71672,
    mediaType: 'movie',
    title: 'Wrong Turn 4: Bloody Beginnings',
    posterPath: '/l1vD4GY7tlT420KJ3xWTzyQ2Aa9.jpg',
    backdropPath: '/8xyJcJnYbupkPPMvwTEJaUwjxDI.jpg',
    releaseDate: '2011-10-17',
    voteAverage: 5.7,
  },
  'wrong turn 4 bloody beginnings': {
    canonicalId: 71672,
    mediaType: 'movie',
    title: 'Wrong Turn 4: Bloody Beginnings',
    posterPath: '/l1vD4GY7tlT420KJ3xWTzyQ2Aa9.jpg',
    backdropPath: '/8xyJcJnYbupkPPMvwTEJaUwjxDI.jpg',
    releaseDate: '2011-10-17',
    voteAverage: 5.7,
  },
  '125509': {
    canonicalId: 125509,
    mediaType: 'movie',
    title: 'Wrong Turn 5: Bloodlines',
    posterPath: '/8fABep8FSRpeo8Ea4j3rfnoVgkg.jpg',
    backdropPath: '/6PTWsiDugvnI44QwmP2f2Yq2fhN.jpg',
    releaseDate: '2012-10-18',
    voteAverage: 5.5,
  },
  'tt2375779': {
    canonicalId: 125509,
    mediaType: 'movie',
    title: 'Wrong Turn 5: Bloodlines',
    posterPath: '/8fABep8FSRpeo8Ea4j3rfnoVgkg.jpg',
    backdropPath: '/6PTWsiDugvnI44QwmP2f2Yq2fhN.jpg',
    releaseDate: '2012-10-18',
    voteAverage: 5.5,
  },
  'wrong turn 5': {
    canonicalId: 125509,
    mediaType: 'movie',
    title: 'Wrong Turn 5: Bloodlines',
    posterPath: '/8fABep8FSRpeo8Ea4j3rfnoVgkg.jpg',
    backdropPath: '/6PTWsiDugvnI44QwmP2f2Yq2fhN.jpg',
    releaseDate: '2012-10-18',
    voteAverage: 5.5,
  },
  'wrong turn 5 bloodlines': {
    canonicalId: 125509,
    mediaType: 'movie',
    title: 'Wrong Turn 5: Bloodlines',
    posterPath: '/8fABep8FSRpeo8Ea4j3rfnoVgkg.jpg',
    backdropPath: '/6PTWsiDugvnI44QwmP2f2Yq2fhN.jpg',
    releaseDate: '2012-10-18',
    voteAverage: 5.5,
  },
  '259072': {
    canonicalId: 259072,
    mediaType: 'movie',
    title: 'Wrong Turn 6: Last Resort',
    posterPath: '/cV1biK7jlHVXlQ7ErYe5MUSBGcx.jpg',
    backdropPath: '/iS3cMqqWQBehsm0b9Zb5ND4m2pf.jpg',
    releaseDate: '2014-08-22',
    voteAverage: 5.4,
  },
  'tt3601444': {
    canonicalId: 259072,
    mediaType: 'movie',
    title: 'Wrong Turn 6: Last Resort',
    posterPath: '/cV1biK7jlHVXlQ7ErYe5MUSBGcx.jpg',
    backdropPath: '/iS3cMqqWQBehsm0b9Zb5ND4m2pf.jpg',
    releaseDate: '2014-08-22',
    voteAverage: 5.4,
  },
  'wrong turn 6': {
    canonicalId: 259072,
    mediaType: 'movie',
    title: 'Wrong Turn 6: Last Resort',
    posterPath: '/cV1biK7jlHVXlQ7ErYe5MUSBGcx.jpg',
    backdropPath: '/iS3cMqqWQBehsm0b9Zb5ND4m2pf.jpg',
    releaseDate: '2014-08-22',
    voteAverage: 5.4,
  },
  'wrong turn 6 last resort': {
    canonicalId: 259072,
    mediaType: 'movie',
    title: 'Wrong Turn 6: Last Resort',
    posterPath: '/cV1biK7jlHVXlQ7ErYe5MUSBGcx.jpg',
    backdropPath: '/iS3cMqqWQBehsm0b9Zb5ND4m2pf.jpg',
    releaseDate: '2014-08-22',
    voteAverage: 5.4,
  },
  '630586': {
    canonicalId: 630586,
    mediaType: 'movie',
    title: 'Wrong Turn',
    posterPath: '/4U1SBHmwHkNA0eHZ2n1CuiC1K1g.jpg',
    backdropPath: '/8p8VIkTyeL9udfYJJHewWdhRLEO.jpg',
    releaseDate: '2021-01-26',
    voteAverage: 6.0,
  },
  'tt9110170': {
    canonicalId: 630586,
    mediaType: 'movie',
    title: 'Wrong Turn',
    posterPath: '/4U1SBHmwHkNA0eHZ2n1CuiC1K1g.jpg',
    backdropPath: '/8p8VIkTyeL9udfYJJHewWdhRLEO.jpg',
    releaseDate: '2021-01-26',
    voteAverage: 6.0,
  },
  'wrong turn 2021': {
    canonicalId: 630586,
    mediaType: 'movie',
    title: 'Wrong Turn',
    posterPath: '/4U1SBHmwHkNA0eHZ2n1CuiC1K1g.jpg',
    backdropPath: '/8p8VIkTyeL9udfYJJHewWdhRLEO.jpg',
    releaseDate: '2021-01-26',
    voteAverage: 6.0,
  },
  'wrong turn the foundation': {
    canonicalId: 630586,
    mediaType: 'movie',
    title: 'Wrong Turn',
    posterPath: '/4U1SBHmwHkNA0eHZ2n1CuiC1K1g.jpg',
    backdropPath: '/8p8VIkTyeL9udfYJJHewWdhRLEO.jpg',
    releaseDate: '2021-01-26',
    voteAverage: 6.0,
  },
};

export function resolveCanonicalMedia(id: string | number, _currentMediaType?: string): CanonicalMediaInfo | null {
  const strId = String(id || '').trim();
  if (!strId) return null;
  const lower = strId.toLowerCase();
  if (CANONICAL_MEDIA_MAP[strId]) return CANONICAL_MEDIA_MAP[strId];
  if (CANONICAL_MEDIA_MAP[lower]) return CANONICAL_MEDIA_MAP[lower];

  // Normalized lookup (strip special characters, punctuation, and excess spaces)
  const normalized = lower.replace(/[^a-z0-9]+/g, ' ').trim();
  if (CANONICAL_MEDIA_MAP[normalized]) return CANONICAL_MEDIA_MAP[normalized];

  return null;
}

/**
 * Returns all verified aliases for a given title identifier without inferring false relationships
 * between arbitrary TMDB numbers and IMDb IDs. Unmapped titles remain strictly scoped to their exact key.
 */
export function resolveAllVerifiedAliases(id: string | number): string[] {
  const strId = String(id || '').trim();
  if (!strId) return [];
  const results = new Set<string>();
  results.add(strId);

  const canon = resolveCanonicalMedia(strId);
  if (canon) {
    results.add(String(canon.canonicalId));
    // Collect all explicit keys in CANONICAL_MEDIA_MAP mapped to this canonical media entity
    for (const [key, info] of Object.entries(CANONICAL_MEDIA_MAP)) {
      if (info.canonicalId === canon.canonicalId) {
        results.add(key);
      }
    }
  }

  return Array.from(results);
}