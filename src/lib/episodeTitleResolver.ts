import { getSeasonEpisodes } from './tmdb.ts';

export interface ResolvedEpisodeItem {
  episode_number: number;
  name: string;
  overview?: string;
  still_path?: string | null;
  source: 'imdb' | 'tvmaze' | 'tmdb';
  isVerified: boolean;
}

export interface ResolvedSeasonEpisodesResult {
  season_number: number;
  imdbId?: string;
  tmdbId?: number;
  showTitle?: string;
  source: 'imdb' | 'tvmaze' | 'tmdb' | 'none';
  episodes: ResolvedEpisodeItem[];
}

const REQUEST_TIMEOUT_MS = 5500;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const seasonEpisodesCache = new Map<
  string,
  { timestamp: number; data: ResolvedSeasonEpisodesResult }
>();
const imdbIdCache = new Map<
  string,
  { timestamp: number; imdbId?: string; matchedTitle?: string; year?: number }
>();

/**
 * Checks if a string is a generic placeholder like "Episode 1", "Episode #1.2", "Ep 01", "E01", "TBA", "TBD".
 */
export function isGenericEpisodeTitle(title?: string | null): boolean {
  if (!title || typeof title !== 'string') return true;
  const trimmed = title.trim();
  if (!trimmed) return true;

  if (/^(?:episode|ep|e|chapter|part)?\s*#?\s*\d+(?:\.\d+)?$/i.test(trimmed)) {
    // Note: "Chapter One: The Vanishing..." has a colon and subtitle so it won't match this regex.
    // Pure "Episode 1", "Episode 01", "Ep 1", "E01", "#1.1" will match and be treated as generic.
    return true;
  }
  if (/^episode\s*#?\s*\d+\s*[:.-]?\s*episode\s*\d+$/i.test(trimmed)) {
    return true;
  }
  if (/^(?:tba|tbd|n\/a|unknown|untitled|none|null|undefined)$/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Detects if a string looks like a raw release filename or technical release token rather than an episode title.
 * Never treat release filenames as official episode titles.
 */
export function isRawReleaseFilenameOrToken(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Contains file extensions, scene dots, or technical release tags
  if (
    /\.(?:mkv|mp4|avi|zip|rar|7z)\b/i.test(trimmed) ||
    /\b(?:2160p|1080p|720p|480p|4k|uhd|fhd|web-?dl|webrip|bluray|remux|hevc|x265|x264|h\.?265|h\.?264|ddp\s*5\.1|aac|atmos|dv|hdr10\+|hdr10|hdr|sdr|hubcloud|gdflix|katdrive|4khdhub|vegamovies|bollyflix|hdhub4u)\b/i.test(
      trimmed
    ) ||
    /\bS\d{1,2}[._\s-]*E\d{1,3}\b/i.test(trimmed) ||
    /^Name\s*:/i.test(trimmed) ||
    /\b(?:dual\s*audio|multi\s*audio|hindi\s+english|esub|mSubs)\b/i.test(trimmed) ||
    (trimmed.includes('.') && trimmed.split('.').length >= 4)
  ) {
    return true;
  }

  return false;
}

/**
 * Returns true only when the candidate string is a genuine, non-generic, non-filename episode title.
 */
export function isVerifiedEpisodeTitleString(title?: string | null): boolean {
  if (!title || typeof title !== 'string') return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (isGenericEpisodeTitle(trimmed)) return false;
  if (isRawReleaseFilenameOrToken(trimmed)) return false;
  return true;
}

/**
 * Cleans a series query string for IMDb / TVMaze lookup.
 */
export function cleanSeriesQueryTitle(rawTitle?: string | null): string {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/^Name\s*:\s*/i, '')
    .replace(/\bS\d{1,2}(?:E\d{1,3})?.*$/i, '')
    .replace(/\bSeason\s*\d+.*$/i, '')
    .replace(/\(\d{4}\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(
      /\b(?:2160p|1080p|720p|480p|4k|uhd|web-?dl|webrip|bluray|remux|hdr|dv|dovi|hevc|x264|x265|h\.?264|h\.?265|hubcloud|gdflix).*$/i,
      ''
    )
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtmlTags(html?: string | null): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Resolves a series IMDb ID (tt...) using the existing IMDb suggestion API.
 */
export async function resolveSeriesImdbId(params: {
  imdbId?: string;
  tmdbId?: string | number;
  query?: string;
  year?: number | string;
}): Promise<{ imdbId?: string; matchedTitle?: string; year?: number }> {
  if (params.imdbId && /^tt\d{5,}$/i.test(params.imdbId.trim())) {
    return { imdbId: params.imdbId.trim().toLowerCase() };
  }

  // Check if tmdbId itself was passed as a tt... string
  if (typeof params.tmdbId === 'string' && /^tt\d{5,}$/i.test(params.tmdbId.trim())) {
    return { imdbId: params.tmdbId.trim().toLowerCase() };
  }

  const cleanQuery = cleanSeriesQueryTitle(params.query);
  if (!cleanQuery) {
    return {};
  }

  const cacheKey = `${cleanQuery.toLowerCase()}_${params.year || ''}`;
  const cached = imdbIdCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      imdbId: cached.imdbId,
      matchedTitle: cached.matchedTitle,
      year: cached.year,
    };
  }

  const firstChar = cleanQuery
    .replace(/[^a-zA-Z0-9]/g, '')
    .charAt(0)
    .toLowerCase() || 'a';

  try {
    const url = `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(
      cleanQuery
    )}.json`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      interface ImdbSuggestionItem {
        id?: string;
        l?: string;
        y?: number;
        q?: string;
        qid?: string;
      }
      const list: ImdbSuggestionItem[] = Array.isArray(data?.d) ? data.d : [];
      const tvCandidates = list.filter(
        (item) =>
          item?.id &&
          /^tt\d+$/i.test(item.id) &&
          (item.qid === 'tvSeries' ||
            item.qid === 'tvMiniSeries' ||
            item.q === 'TV series' ||
            item.q === 'TV mini-series')
      );

      const candidates = tvCandidates.length > 0
        ? tvCandidates
        : list.filter((item) => item?.id && /^tt\d+$/i.test(item.id));

      if (candidates.length > 0) {
        const normTarget = cleanQuery.toLowerCase();
        const targetYear = params.year ? Number(String(params.year).slice(0, 4)) : undefined;

        const exactMatch =
          candidates.find((c) => {
            const label = String(c.l || '').toLowerCase();
            const yearMatch = !targetYear || !c.y || Math.abs(Number(c.y) - targetYear) <= 1;
            return label === normTarget && yearMatch;
          }) ||
          candidates.find((c) => String(c.l || '').toLowerCase() === normTarget) ||
          candidates[0];

        const resolved = {
          imdbId: String(exactMatch.id).toLowerCase(),
          matchedTitle: exactMatch.l,
          year: exactMatch.y,
        };
        imdbIdCache.set(cacheKey, { timestamp: Date.now(), ...resolved });
        return resolved;
      }
    }
  } catch {
    // Ignore network timeout and allow fallback
  }

  return {};
}

/**
 * Fetches season episodes via IMDb Cinemeta catalog (indexed by series IMDb ID tt...).
 */
async function fetchImdbCinemetaSeasonEpisodes(
  imdbId: string,
  seasonNumber: number
): Promise<Map<number, ResolvedEpisodeItem>> {
  const map = new Map<number, ResolvedEpisodeItem>();
  if (!imdbId || !/^tt\d+$/i.test(imdbId)) return map;

  try {
    const res = await fetch(
      `https://v3-cinemeta.strem.io/meta/series/${encodeURIComponent(imdbId)}.json`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    if (!res.ok) return map;

    const data = await res.json().catch(() => null);
    interface CinemetaVideoItem {
      season?: number | string;
      episode?: number | string;
      number?: number | string;
      name?: string;
      title?: string;
      overview?: string;
      description?: string;
      thumbnail?: string | null;
    }
    const videos: CinemetaVideoItem[] = Array.isArray(data?.meta?.videos) ? data.meta.videos : [];

    for (const v of videos) {
      const sNum = Number(v.season);
      const epNum = Number(v.episode ?? v.number);
      if (sNum !== seasonNumber || isNaN(epNum) || epNum < 1) continue;

      const rawTitle = String(v.name || v.title || '').trim();
      if (isVerifiedEpisodeTitleString(rawTitle)) {
        map.set(epNum, {
          episode_number: epNum,
          name: rawTitle,
          overview: String(v.overview || v.description || '').trim() || undefined,
          still_path: v.thumbnail || null,
          source: 'imdb',
          isVerified: true,
        });
      }
    }
  } catch {
    // Fallback gracefully
  }

  return map;
}

interface TvMazeEpisodeItem {
  season?: number | string;
  number?: number | string;
  name?: string;
  summary?: string;
  image?: { original?: string; medium?: string } | null;
}

/**
 * Fetches season episodes from TVMaze using either the series IMDb ID (tt...) or series title query.
 */
async function fetchTvMazeSeasonEpisodes(params: {
  imdbId?: string;
  query?: string;
  seasonNumber: number;
}): Promise<{ showTitle?: string; episodesMap: Map<number, ResolvedEpisodeItem> }> {
  const episodesMap = new Map<number, ResolvedEpisodeItem>();
  let showId: number | undefined;
  let showTitle: string | undefined;
  let embeddedEpisodes: TvMazeEpisodeItem[] | undefined;

  // 1. Lookup by IMDb ID first (most accurate)
  if (params.imdbId && /^tt\d+$/i.test(params.imdbId)) {
    try {
      const lookupRes = await fetch(
        `https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(params.imdbId)}`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );
      if (lookupRes.ok) {
        const showData = await lookupRes.json().catch(() => null);
        if (showData?.id) {
          showId = Number(showData.id);
          showTitle = showData.name;
        }
      }
    } catch {
      // Continue to query fallback
    }
  }

  // 2. Fallback to singlesearch by query with embedded episodes
  if (!showId && params.query) {
    const cleanQ = cleanSeriesQueryTitle(params.query);
    if (cleanQ) {
      try {
        const searchRes = await fetch(
          `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(cleanQ)}&embed=episodes`,
          {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }
        );
        if (searchRes.ok) {
          const showData = await searchRes.json().catch(() => null);
          if (showData?.id) {
            showId = Number(showData.id);
            showTitle = showData.name;
            if (Array.isArray(showData._embedded?.episodes)) {
              embeddedEpisodes = showData._embedded.episodes;
            }
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  if (!showId) {
    return { showTitle, episodesMap };
  }

  // 3. Fetch episodes list if not already embedded
  let episodesList: TvMazeEpisodeItem[] = embeddedEpisodes || [];
  if (episodesList.length === 0) {
    try {
      const epRes = await fetch(`https://api.tvmaze.com/shows/${showId}/episodes`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (epRes.ok) {
        const data = await epRes.json().catch(() => null);
        if (Array.isArray(data)) {
          episodesList = data;
        }
      }
    } catch {
      // Ignore
    }
  }

  for (const ep of episodesList) {
    const sNum = Number(ep.season);
    const epNum = Number(ep.number);
    if (sNum !== params.seasonNumber || isNaN(epNum) || epNum < 1) continue;

    const rawName = String(ep.name || '').trim();
    if (isVerifiedEpisodeTitleString(rawName)) {
      episodesMap.set(epNum, {
        episode_number: epNum,
        name: rawName,
        overview: stripHtmlTags(ep.summary) || undefined,
        still_path: ep.image?.original || ep.image?.medium || null,
        source: 'tvmaze',
        isVerified: true,
      });
    }
  }

  return { showTitle, episodesMap };
}

/**
 * Multi-source official episode title resolver:
 * 1. Resolves series IMDb ID (tt...) via IMDb suggestion endpoint or passed imdbId.
 * 2. Queries IMDb (Cinemeta) and TVMaze by IMDb ID in parallel.
 * 3. Falls back to TMDB Season API.
 * 4. Filters out generic ("Episode 1") and release-filename strings so only verified official titles are returned.
 */
export async function resolveSeasonEpisodes(params: {
  tmdbId?: string | number;
  imdbId?: string;
  query?: string;
  season: number;
  year?: number | string;
}): Promise<ResolvedSeasonEpisodesResult> {
  const season = params.season !== undefined && !isNaN(Number(params.season)) ? Math.max(0, Number(params.season)) : 1;
  const cleanQ = cleanSeriesQueryTitle(params.query);
  const cacheKey = `${params.tmdbId || ''}_${params.imdbId || ''}_${cleanQ.toLowerCase()}_S${season}`;

  const cached = seasonEpisodesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Step 1: Resolve series IMDb ID using the existing IMDb suggestion lookup
  const imdbResolution = await resolveSeriesImdbId({
    imdbId: params.imdbId,
    tmdbId: params.tmdbId,
    query: cleanQ || params.query,
    year: params.year,
  });
  const resolvedImdbId = imdbResolution.imdbId;

  // Step 2: Query IMDb Cinemeta + TVMaze (by IMDb ID & query) + TMDB in parallel
  const numericTmdbId =
    params.tmdbId && /^\d+$/.test(String(params.tmdbId).trim())
      ? Number(params.tmdbId)
      : undefined;

  const [imdbMap, tvMazeRes, tmdbData] = await Promise.all([
    resolvedImdbId
      ? fetchImdbCinemetaSeasonEpisodes(resolvedImdbId, season)
      : Promise.resolve(new Map<number, ResolvedEpisodeItem>()),
    fetchTvMazeSeasonEpisodes({
      imdbId: resolvedImdbId,
      query: cleanQ || imdbResolution.matchedTitle || params.query,
      seasonNumber: season,
    }),
    numericTmdbId ? getSeasonEpisodes(numericTmdbId, season) : Promise.resolve(null),
  ]);

  const tmdbMap = new Map<number, ResolvedEpisodeItem>();
  if (tmdbData && Array.isArray(tmdbData.episodes)) {
    for (const ep of tmdbData.episodes) {
      const epNum = Number(ep.episode_number);
      const rawName = String(ep.name || '').trim();
      if (!isNaN(epNum) && epNum >= 1 && isVerifiedEpisodeTitleString(rawName)) {
        tmdbMap.set(epNum, {
          episode_number: epNum,
          name: rawName,
          overview: ep.overview || undefined,
          still_path: ep.still_path || null,
          source: 'tmdb',
          isVerified: true,
        });
      }
    }
  }
  // Merge episode numbers across all sources:
  // Priority per episode: IMDb (if verified non-generic) -> TVMaze (via IMDb ID) -> TMDB
  const allEpNums = new Set<number>([
    ...imdbMap.keys(),
    ...tvMazeRes.episodesMap.keys(),
    ...tmdbMap.keys(),
  ]);

  const mergedEpisodes: ResolvedEpisodeItem[] = Array.from(allEpNums)
    .sort((a, b) => a - b)
    .map((epNum) => {
      const fromImdb = imdbMap.get(epNum);
      const fromTvMaze = tvMazeRes.episodesMap.get(epNum);
      const fromTmdb = tmdbMap.get(epNum);

      const primary = fromImdb || fromTvMaze || fromTmdb!;
      return {
        episode_number: epNum,
        name: primary.name,
        overview:
          primary.overview ||
          fromTvMaze?.overview ||
          fromTmdb?.overview ||
          fromImdb?.overview,
        still_path:
          primary.still_path ||
          fromTmdb?.still_path ||
          fromTvMaze?.still_path ||
          fromImdb?.still_path ||
          null,
        source: primary.source,
        isVerified: true,
      };
    });

  let primarySource: ResolvedSeasonEpisodesResult['source'] = 'none';
  if (imdbMap.size > 0) primarySource = 'imdb';
  else if (tvMazeRes.episodesMap.size > 0) primarySource = 'tvmaze';
  else if (tmdbMap.size > 0) primarySource = 'tmdb';

  const result: ResolvedSeasonEpisodesResult = {
    season_number: season,
    imdbId: resolvedImdbId,
    tmdbId: numericTmdbId,
    showTitle: imdbResolution.matchedTitle || tvMazeRes.showTitle || cleanQ || undefined,
    source: primarySource,
    episodes: mergedEpisodes,
  };

  if (mergedEpisodes.length > 0) {
    seasonEpisodesCache.set(cacheKey, { timestamp: Date.now(), data: result });
  }

  return result;
}
