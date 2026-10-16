import { TitleDetails, PersonDetails } from '@/types';

export const POPULAR_GENRES = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 36, name: 'History' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Sci-Fi' },
  { id: 53, name: 'Thriller' },
];

export const MOCK_TITLES: Record<string, TitleDetails> = {
  'movie-872585': {
    id: 872585,
    title: 'Oppenheimer',
    overview: 'The story of J. Robert Oppenheimer\'s role in the development of the atomic bomb during World War II.',
    poster_path: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    backdrop_path: '/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
    release_date: '2023-07-21',
    vote_average: 8.1,
    vote_count: 9200,
    media_type: 'movie',
    runtime: 180,
    tagline: 'The world forever changes.',
    status: 'Released',
    imdb_rating: 8.9,
    imdb_votes: '780,000',
    genres: [{ id: 18, name: 'Drama' }, { id: 36, name: 'History' }, { id: 53, name: 'Thriller' }],
    external_ids: { imdb_id: 'tt15398776', tmdb_id: 872585 },
    credits: {
      cast: [
        { id: 2037, name: 'Cillian Murphy', character: 'J. Robert Oppenheimer', profile_path: null },
        { id: 505710, name: 'Emily Blunt', character: 'Katherine "Kitty" Oppenheimer', profile_path: null },
        { id: 1892, name: 'Matt Damon', character: 'Leslie Groves', profile_path: null },
        { id: 3223, name: 'Robert Downey Jr.', character: 'Lewis Strauss', profile_path: null },
        { id: 1373737, name: 'Florence Pugh', character: 'Jean Tatlock', profile_path: null },
      ],
      crew: [
        { id: 525, name: 'Christopher Nolan', job: 'Director', department: 'Directing', profile_path: null },
      ],
    },
    videos: {
      results: [
        { id: '1', key: 'uYPbbksJxIg', name: 'Official Trailer', site: 'YouTube', type: 'Trailer', official: true },
      ],
    },
    'watch/providers': {
      results: {
        IN: {
          link: 'https://www.themoviedb.org/movie/872585-oppenheimer/watch?locale=IN',
          flatrate: [
            { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/emthp39XA2zhcoYLhp9ow8056vB.jpg' },
            { provider_id: 220, provider_name: 'JioCinema', logo_path: '/pTnn5JwWr4p3.jpg' },
          ],
        },
      },
    },
  },
  'movie-693134': {
    id: 693134,
    title: 'Dune: Part Two',
    overview: 'Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family.',
    poster_path: '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    backdrop_path: '/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
    release_date: '2024-03-01',
    vote_average: 8.3,
    vote_count: 6500,
    media_type: 'movie',
    runtime: 166,
    tagline: 'Long live the fighters.',
    status: 'Released',
    imdb_rating: 8.6,
    imdb_votes: '520,000',
    genres: [{ id: 878, name: 'Sci-Fi' }, { id: 12, name: 'Adventure' }, { id: 18, name: 'Drama' }],
    external_ids: { imdb_id: 'tt15239678', tmdb_id: 693134 },
    credits: {
      cast: [
        { id: 1190668, name: 'Timothée Chalamet', character: 'Paul Atreides', profile_path: null },
        { id: 505710, name: 'Zendaya', character: 'Chani', profile_path: null },
        { id: 934, name: 'Rebecca Ferguson', character: 'Lady Jessica', profile_path: null },
        { id: 16828, name: 'Javier Bardem', character: 'Stilgar', profile_path: null },
      ],
      crew: [
        { id: 137427, name: 'Denis Villeneuve', job: 'Director', department: 'Directing', profile_path: null },
      ],
    },
    videos: {
      results: [
        { id: '1', key: 'Way9Dexny3w', name: 'Official Trailer 3', site: 'YouTube', type: 'Trailer', official: true },
      ],
    },
    'watch/providers': {
      results: {
        IN: {
          link: 'https://www.themoviedb.org/movie/693134-dune-part-two/watch?locale=IN',
          flatrate: [
            { provider_id: 220, provider_name: 'JioCinema', logo_path: '/pTnn5JwWr4p3.jpg' },
            { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/emthp39XA2zhcoYLhp9ow8056vB.jpg' },
          ],
        },
      },
    },
  },
  'movie-157336': {
    id: 157336,
    title: 'Interstellar',
    overview: 'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.',
    poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdrop_path: '/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
    release_date: '2014-11-05',
    vote_average: 8.4,
    vote_count: 34500,
    media_type: 'movie',
    runtime: 169,
    tagline: 'Mankind was born on Earth. It was never meant to die here.',
    status: 'Released',
    imdb_rating: 8.7,
    imdb_votes: '2,100,000',
    genres: [{ id: 12, name: 'Adventure' }, { id: 18, name: 'Drama' }, { id: 878, name: 'Sci-Fi' }],
    external_ids: { imdb_id: 'tt0816692', tmdb_id: 157336 },
    credits: {
      cast: [
        { id: 10297, name: 'Matthew McConaughey', character: 'Joseph Cooper', profile_path: null },
        { id: 1813, name: 'Anne Hathaway', character: 'Dr. Amelia Brand', profile_path: null },
        { id: 83002, name: 'Jessica Chastain', character: 'Murphy Cooper', profile_path: null },
        { id: 3895, name: 'Michael Caine', character: 'Professor John Brand', profile_path: null },
      ],
      crew: [
        { id: 525, name: 'Christopher Nolan', job: 'Director', department: 'Directing', profile_path: null },
      ],
    },
    videos: {
      results: [
        { id: '1', key: 'zSWdZVtXT7E', name: 'Main Trailer', site: 'YouTube', type: 'Trailer', official: true },
      ],
    },
    'watch/providers': {
      results: {
        IN: {
          link: 'https://www.themoviedb.org/movie/157336-interstellar/watch?locale=IN',
          flatrate: [
            { provider_id: 8, provider_name: 'Netflix', logo_path: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' },
            { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/emthp39XA2zhcoYLhp9ow8056vB.jpg' },
            { provider_id: 220, provider_name: 'JioCinema', logo_path: '/pTnn5JwWr4p3.jpg' },
          ],
        },
      },
    },
  },
  'movie-579974': {
    id: 579974,
    title: 'RRR',
    overview: 'A fictitious story about two legendary revolutionaries and their journey away from home before they began fighting for their country in the 1920s.',
    poster_path: '/nEufeZlyAOLqO2brrs0yeBEoo0R.jpg',
    backdrop_path: '/707thQazSnOw0990oc2skHw0.jpg',
    release_date: '2022-03-24',
    vote_average: 7.9,
    vote_count: 1600,
    media_type: 'movie',
    runtime: 182,
    tagline: 'Rise, Roar, Revolt',
    status: 'Released',
    imdb_rating: 7.8,
    imdb_votes: '180,000',
    genres: [{ id: 28, name: 'Action' }, { id: 18, name: 'Drama' }],
    external_ids: { imdb_id: 'tt8178634', tmdb_id: 579974 },
    credits: {
      cast: [
        { id: 1335436, name: 'N. T. Rama Rao Jr.', character: 'Komaram Bheem', profile_path: null },
        { id: 1335437, name: 'Ram Charan', character: 'Alluri Sitarama Raju', profile_path: null },
        { id: 11088, name: 'Alia Bhatt', character: 'Sita', profile_path: null },
        { id: 85034, name: 'Ajay Devgn', character: 'Venkata Rama Raju', profile_path: null },
      ],
      crew: [
        { id: 1042784, name: 'S. S. Rajamouli', job: 'Director', department: 'Directing', profile_path: null },
      ],
    },
    videos: {
      results: [
        { id: '1', key: 'NgBoAM7b44c', name: 'Official Trailer (Hindi)', site: 'YouTube', type: 'Trailer', official: true },
      ],
    },
    'watch/providers': {
      results: {
        IN: {
          flatrate: [
            { provider_id: 8, provider_name: 'Netflix (Hindi)', logo_path: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' },
            { provider_id: 122, provider_name: 'Disney+ Hotstar', logo_path: '/7rwgEsUBqf26m67nO8f9kky11.jpg' },
          ],
        },
      },
    },
  },
  'tv-1396': {
    id: 1396,
    name: 'Breaking Bad',
    title: 'Breaking Bad',
    overview: 'Walter White, a New Mexico chemistry teacher, is diagnosed with Stage III cancer and given a prognosis of two years left to live. He turns to a life of crime by producing and selling methamphetamine with a former student.',
    poster_path: '/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg',
    backdrop_path: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
    first_air_date: '2008-01-20',
    vote_average: 8.9,
    vote_count: 14200,
    media_type: 'tv',
    number_of_seasons: 5,
    number_of_episodes: 62,
    tagline: 'Change the equation.',
    status: 'Ended',
    imdb_rating: 9.5,
    imdb_votes: '2,200,000',
    genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
    external_ids: { imdb_id: 'tt0903747', tmdb_id: 1396 },
    credits: {
      cast: [
        { id: 17419, name: 'Bryan Cranston', character: 'Walter White', profile_path: null },
        { id: 84497, name: 'Aaron Paul', character: 'Jesse Pinkman', profile_path: null },
        { id: 134531, name: 'Anna Gunn', character: 'Skyler White', profile_path: null },
        { id: 14329, name: 'Giancarlo Esposito', character: 'Gus Fring', profile_path: null },
      ],
      crew: [
        { id: 66633, name: 'Vince Gilligan', job: 'Creator', department: 'Writing', profile_path: null },
      ],
    },
    videos: {
      results: [
        { id: '1', key: 'HhesaQXLuRY', name: 'Series Trailer', site: 'YouTube', type: 'Trailer', official: true },
      ],
    },
    'watch/providers': {
      results: {
        IN: {
          flatrate: [
            { provider_id: 8, provider_name: 'Netflix', logo_path: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' },
          ],
        },
      },
    },
  },
  'movie-155': {
    id: 155,
    title: 'The Dark Knight',
    overview: 'Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets.',
    poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    backdrop_path: '/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg',
    release_date: '2008-07-16',
    vote_average: 8.5,
    vote_count: 32000,
    media_type: 'movie',
    runtime: 152,
    tagline: 'Why So Serious?',
    status: 'Released',
    imdb_rating: 9.0,
    imdb_votes: '2,900,000',
    genres: [{ id: 18, name: 'Drama' }, { id: 28, name: 'Action' }, { id: 80, name: 'Crime' }, { id: 53, name: 'Thriller' }],
    external_ids: { imdb_id: 'tt0468569', tmdb_id: 155 },
    credits: {
      cast: [
        { id: 3894, name: 'Christian Bale', character: 'Bruce Wayne / Batman', profile_path: null },
        { id: 1810, name: 'Heath Ledger', character: 'Joker', profile_path: null },
        { id: 3895, name: 'Michael Caine', character: 'Alfred Pennyworth', profile_path: null },
        { id: 64, name: 'Gary Oldman', character: 'James Gordon', profile_path: null },
      ],
      crew: [
        { id: 525, name: 'Christopher Nolan', job: 'Director', department: 'Directing', profile_path: null },
      ],
    },
    videos: {
      results: [
        { id: '1', key: 'EXeTwQWrcwY', name: 'Official Trailer', site: 'YouTube', type: 'Trailer', official: true },
      ],
    },
    'watch/providers': {
      results: {
        IN: {
          flatrate: [
            { provider_id: 220, provider_name: 'JioCinema', logo_path: '/pTnn5JwWr4p3.jpg' },
            { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/emthp39XA2zhcoYLhp9ow8056vB.jpg' },
          ],
        },
      },
    },
  },
  'movie-27205': {
    id: 27205,
    title: 'Inception',
    overview: 'Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets is offered a chance to regain his old life as payment for a task considered to be impossible: "inception", the implantation of another person\'s idea into a target\'s subconscious.',
    poster_path: '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
    backdrop_path: '/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg',
    release_date: '2010-07-15',
    vote_average: 8.4,
    vote_count: 36000,
    media_type: 'movie',
    runtime: 148,
    tagline: 'Your mind is the scene of the crime.',
    status: 'Released',
    imdb_rating: 8.8,
    imdb_votes: '2,500,000',
    genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Sci-Fi' }, { id: 12, name: 'Adventure' }],
    external_ids: { imdb_id: 'tt1375666', tmdb_id: 27205 },
    credits: {
      cast: [
        { id: 6193, name: 'Leonardo DiCaprio', character: 'Dom Cobb', profile_path: null },
        { id: 24045, name: 'Joseph Gordon-Levitt', character: 'Arthur', profile_path: null },
        { id: 27578, name: 'Elliot Page', character: 'Ariadne', profile_path: null },
        { id: 2524, name: 'Tom Hardy', character: 'Eames', profile_path: null },
      ],
      crew: [
        { id: 525, name: 'Christopher Nolan', job: 'Director', department: 'Directing', profile_path: null },
      ],
    },
    videos: {
      results: [
        { id: '1', key: 'YoHD9XEInc0', name: 'Official Trailer', site: 'YouTube', type: 'Trailer', official: true },
      ],
    },
    'watch/providers': {
      results: {
        IN: {
          flatrate: [
            { provider_id: 8, provider_name: 'Netflix', logo_path: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' },
            { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/emthp39XA2zhcoYLhp9ow8056vB.jpg' },
            { provider_id: 220, provider_name: 'JioCinema', logo_path: '/pTnn5JwWr4p3.jpg' },
          ],
        },
      },
    },
  },
};

export const TRENDING_LIST: TitleDetails[] = Object.values(MOCK_TITLES);

export const TOP_RATED_LIST: TitleDetails[] = [
  MOCK_TITLES['movie-155'],
  MOCK_TITLES['tv-1396'],
  MOCK_TITLES['movie-157336'],
  MOCK_TITLES['movie-27205'],
  MOCK_TITLES['movie-693134'],
  MOCK_TITLES['movie-872585'],
  MOCK_TITLES['movie-579974'],
];

export const UPCOMING_LIST: TitleDetails[] = [
  MOCK_TITLES['movie-693134'],
  MOCK_TITLES['movie-872585'],
  MOCK_TITLES['movie-579974'],
];
