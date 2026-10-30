/**
 * Media Identification Engine for CineFuel
 * 
 * Provides end-to-end media discovery, filename & folder parsing, media-type classification,
 * provider search (TMDB + TVMaze/IMDb), exact season/episode resolution, disambiguation,
 * database persistence, and review/retry workflows.
 */

import { parseReleaseDetails, extractFilenameFromUrl, cleanReleaseTitle } from './releaseParser.ts';
import { getSeasonEpisodes, searchMulti, getTitleDetails } from './tmdb.ts';
import { resolveSeasonEpisodes } from './episodeTitleResolver.ts';

export interface ParsedMediaCandidate {
  rawInput: string;
  sourcePath?: string;
  url?: string;
  mediaType: 'movie' | 'tv';
  isEpisode: boolean;
  isPack: boolean;
  isSpecial: boolean;
  isMultiEpisode: boolean;
  seriesTitle?: string;
  movieTitle?: string;
  normalizedQuery: string;
  year?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeNumberEnd?: number;
  embeddedEpisodeTitle?: string;
  resolution?: string;
  codec?: string;
  dynamicRange?: string;
  audioLanguage?: string;
  container?: string;
  fileSize?: string;
  folderContext?: {
    seriesFolder?: string;
    seasonFolder?: string;
    isSpecialsFolder: boolean;
  };
}

export interface MediaIdentificationAlternative {
  tmdbId: number;
  title: string;
  year?: number;
  mediaType: 'movie' | 'tv';
  posterPath?: string | null;
  overview?: string;
}

export interface MediaIdentificationResult {
  id: string;
  rawInput: string;
  sourcePath?: string;
  url?: string;
  parsed: ParsedMediaCandidate;
  status: 'matched' | 'unmatched' | 'ambiguous';
  confidence: 'verified' | 'high' | 'medium' | 'low' | 'none';
  reason?: string;
  mediaType: 'movie' | 'tv';

  // Media entity metadata
  tmdbId?: number;
  title: string;
  originalTitle?: string;
  year?: number;
  releaseDate?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string;
  voteAverage?: number;

  // Episode metadata (when mediaType === 'tv' and isEpisode is true)
  episodeDetails?: {
    seasonNumber: number;
    episodeNumber: number;
    episodeNumberEnd?: number;
    episodeTitle: string;
    officialEpisodeTitle?: string;
    episodeOverview?: string;
    stillPath?: string | null;
    isSpecial: boolean;
    isMultiEpisode: boolean;
  };

  alternatives?: MediaIdentificationAlternative[];
  userCorrected?: boolean;
  manualTitleVerified?: boolean;
  timestamp: string;
}

export interface IdentificationOptions {
  url?: string;
  sourcePath?: string;
  forcedType?: 'movie' | 'tv';
  forcedTmdbId?: number | string;
  forcedYear?: number;
  forcedTitle?: string;
}

export function getTmdbApiKey(): string {
  let key = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || '';
  if (!key && typeof process !== 'undefined' && typeof (process as any).loadEnvFile === 'function') {
    try {
      (process as any).loadEnvFile('.env.local');
      key = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || '';
    } catch {}
    if (!key) {
      try {
        (process as any).loadEnvFile('.env');
        key = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || '';
      } catch {}
    }
  }
  return key.trim();
}
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

/**
 * Strips technical tokens, audio specs, codecs, and release groups from a title candidate
 */
export function stripFilenameNoise(text: string): string {
  if (!text) return '';
  return text
    // Strip leading prefixes like "Name : ", "1. ", "[Download]"
    .replace(/^[\s\r\n]*(?:\[?\d{1,3}[\]).:-]\s*)?(?:(?:Name|Title|Movie|Series|Show|Film|File|Release)\s*[-:=]+\s*)+/gi, ' ')
    .replace(/(?:HubCloud|GDFlix|Gofile|Drive|Server|Link|URL)\s*[-:=]+\s*/gi, ' ')
    // Strip common scene release groups
    .replace(/\b(?:-XDMovies|-RARBG|-YTS|-PSA|\[TGx\]|\[eztv\]|-GalaxyRG|-MeGusta|-FLUX|-CMRG|-NTb)\b/gi, ' ')
    // Strip technical video specs
    .replace(/\b(?:2160p|1080p|720p|480p|4k|uhd|fhd|hd|sd)\b/gi, ' ')
    .replace(/\b(?:remux|bluray|blu-ray|bdrip|web-?dl|webrip|web|hdtv|dvdrip)\b/gi, ' ')
    .replace(/\b(?:hdr10\+|hdr10|hdr|hlg|dv|dovi|dolby\s*vision|10bit|8bit)\b/gi, ' ')
    .replace(/\b(?:hevc|x265|x264|h\.?265|h\.?264|av1|avc|vc-1)\b/gi, ' ')
    // Strip audio specs
    .replace(/\b(?:ddp\s*5\.1|ddp5\.1|dd5\.1|5\.1|7\.1|2\.0|atmos|truehd|dts-hd(?:\.ma)?|dts|aac2\.0|aac|ac3)\b/gi, ' ')
    .replace(/\b(?:dual\s*audio|multi\s*audio|hindi|english|tamil|telugu|korean|japanese|spanish|subs?|esubs?|msubs?)\b/gi, ' ')
    // Strip file containers
    .replace(/\.(?:mkv|mp4|avi|zip|rar|7z|tar|iso)\b/gi, ' ')
    // Punctuation and whitespace
    .replace(/[\(\)\[\]\{\}\-_.:|•+~#*@/\\=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses file path, folder context, filename, and release details into a structured candidate
 */
export function parseMediaCandidate(input: string, url?: string): ParsedMediaCandidate {
  const rawInput = (input || '').trim();
  const normalizedPath = rawInput.replace(/\\/g, '/');
  const pathSegments = normalizedPath.split('/').filter(Boolean);

  const filename = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : rawInput;
  const parentFolders = pathSegments.slice(0, -1);

  // Folder context detection
  let folderSeasonNumber: number | undefined = undefined;
  let seriesFolder: string | undefined = undefined;
  let isSpecialsFolder = false;

  for (let i = parentFolders.length - 1; i >= 0; i--) {
    const seg = parentFolders[i];
    if (/(?:specials|season\s*0\b)/i.test(seg)) {
      folderSeasonNumber = 0;
      isSpecialsFolder = true;
      if (i > 0) seriesFolder = parentFolders[i - 1];
      break;
    }
    const sMatch = seg.match(/\b(?:season|series)\s*0*(\d{1,3})\b/i) || seg.match(/\bS0*(\d{1,3})\b/i);
    if (sMatch) {
      folderSeasonNumber = parseInt(sMatch[1], 10);
      if (i > 0) seriesFolder = parentFolders[i - 1];
      break;
    }
  }

  // In season folder, check if file starts with episode number: "03 - The Pollywog.mkv", "03.mkv", "03 The Pollywog.mkv"
  if (folderSeasonNumber !== undefined) {
    const leadingEpMatch = filename.match(/^(?:(?:ep|episode)\s*)?0*([1-9]\d{0,2})\s*[-_. ]/i) ||
                           filename.match(/^(?:(?:ep|episode)\s*)?0*([1-9]\d{0,2})\.(?:mkv|mp4|avi|webm)/i);
    if (leadingEpMatch) {
      const candidateEp = parseInt(leadingEpMatch[1], 10);
      if (candidateEp < 300 && ![264, 265, 266].includes(candidateEp)) {
        folderSeasonNumber = folderSeasonNumber;
      }
    }
  }

  // Release details parsing with protected tokens
  const rel = parseReleaseDetails(rawInput, url);

  let seasonNumber = rel.seasonNumber;
  let episodeNumber = rel.episodeNumber;
  let episodeNumberEnd = rel.episodeNumberEnd;
  let isSpecial = rel.isSpecial || isSpecialsFolder || seasonNumber === 0;
  let isMultiEpisode = rel.isMultiEpisode || (episodeNumberEnd !== undefined && episodeNumber !== undefined && episodeNumberEnd > episodeNumber);

  // If filename had standalone episode and folder gave season, bind them
  if (episodeNumber !== undefined && seasonNumber === undefined && folderSeasonNumber !== undefined) {
    seasonNumber = folderSeasonNumber;
    if (folderSeasonNumber === 0) isSpecial = true;
  }

  // Episode classification priority: If episode markers or series folder context exist, classify as TV!
  const hasEpisodeMarker = episodeNumber !== undefined && episodeNumber > 0;
  const hasSeriesFolderContext = folderSeasonNumber !== undefined || isSpecialsFolder || (seriesFolder !== undefined && seriesFolder.length > 2);
  const isTvByEpisodeOrFolder = hasEpisodeMarker || hasSeriesFolderContext || rel.isEpisode;

  let mediaType: 'movie' | 'tv' = 'movie';
  let isEpisode = false;
  let isPack = false;

  if (isTvByEpisodeOrFolder) {
    mediaType = 'tv';
    isEpisode = hasEpisodeMarker || rel.isEpisode;
    if (!isEpisode && (rel.isPack || (folderSeasonNumber !== undefined && rel.container === 'ZIP'))) {
      isPack = true;
    }
  } else if (rel.isPack) {
    mediaType = 'tv';
    isPack = true;
  } else {
    mediaType = 'movie';
  }

  // In season folder, check if file starts with episode number: "03 - The Pollywog.mkv", "03.mkv", "03 The Pollywog.mkv"
  if (episodeNumber === undefined && folderSeasonNumber !== undefined) {
    const leadingEpMatch = filename.match(/^(?:(?:ep|episode)\s*)?0*([1-9]\d{0,2})\s*[-_. ]/i) ||
                           filename.match(/^(?:(?:ep|episode)\s*)?0*([1-9]\d{0,2})\.(?:mkv|mp4|avi|webm)/i);
    if (leadingEpMatch) {
      const candidateEp = parseInt(leadingEpMatch[1], 10);
      if (candidateEp < 300 && ![264, 265, 266].includes(candidateEp)) {
        episodeNumber = candidateEp;
        seasonNumber = folderSeasonNumber;
        isEpisode = true;
      }
    }
  }

  // Release year: parenthesized (19xx/20xx) or bracketed takes precedence over raw digits in title (e.g. "2012 (2009)")
  const parenYearMatch = filename.match(/[\(\[]\s*(19\d\d|20\d\d)\s*[\)\]]/) ||
                         (seriesFolder ? seriesFolder.match(/[\(\[]\s*(19\d\d|20\d\d)\s*[\)\]]/) : null);
  const rawYearMatch = filename.match(/\b(19\d\d|20\d\d)\b/) || (seriesFolder ? seriesFolder.match(/\b(19\d\d|20\d\d)\b/) : null);
  const yearMatch = parenYearMatch || rawYearMatch;
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  let seriesTitle: string | undefined = undefined;
  let movieTitle: string | undefined = undefined;
  let embeddedEpisodeTitle: string | undefined = undefined;

  if (mediaType === 'tv') {
    // 1. Determine Series Title
    if (seriesFolder && seriesFolder.length >= 2 && !/^(?:season|episodes|tv|media|video|download)\b/i.test(seriesFolder)) {
      seriesTitle = stripFilenameNoise(seriesFolder.replace(/\b(19\d\d|20\d\d)\b/g, ''));
    }

    // If no series folder or filename has series prefix, extract from filename before episode marker
    const sMarkerMatch = filename.match(/^(.*?)(?:[\s._\-[\]()]s0*\d{1,3}|[\s._\-[\]()]season[\s._-]?\d{1,3}|[\s._\-[\]()]e0*\d{1,4}|[\s._\-[\]()](?:ep|episode)[\s._-]?\d{1,4}|[\s._\-[\]()]0*\d{1,2}x0*\d{1,3})/i);
    if (sMarkerMatch && sMarkerMatch[1].trim().length >= 2) {
      const candidate = stripFilenameNoise(sMarkerMatch[1].replace(/\b(19\d\d|20\d\d)\b/g, ''));
      if (candidate.length >= 2) {
        seriesTitle = candidate;
      }
    }

    if (!seriesTitle) {
      seriesTitle = stripFilenameNoise(filename.replace(/\b(19\d\d|20\d\d)\b/g, ''));
    }

    // 2. Extract embedded episode title if present (e.g. "S01E02 - The Weirdo [1080p]")
    const afterMarkerMatch = filename.match(/(?:S0*\d{1,3}[\s._-]*(?:EP|E|Episode)[\s._-]?0*\d{1,4}|0*\d{1,2}x0*\d{1,3}|Season\s*0*\d{1,3}\s*Episode\s*0*\d{1,4})[\s._-]+(.*)/i);
    if (afterMarkerMatch && afterMarkerMatch[1]) {
      const rawAfter = afterMarkerMatch[1];
      // Stop before technical tokens
      const tokenStopMatch = rawAfter.match(/^(.*?)(?:\.(?:mkv|mp4|avi)|[\s._\-[\]()](?:2160p|1080p|720p|480p|4k|web-?dl|bluray|hevc|x264|x265|ddp|hindi|english|amzn|nf|dsnp))/i);
      const epCandidate = tokenStopMatch ? tokenStopMatch[1] : rawAfter;
      const cleanEp = epCandidate.replace(/[\(\)\[\]\{\}\-_.:|•+]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanEp.length >= 2 && !/^(?:mkv|mp4|part\s*\d+|cd\s*\d+)$/i.test(cleanEp)) {
        embeddedEpisodeTitle = cleanEp;
      }
    }
  } else {
    // Movie title extraction: everything before year or technical tokens
    if (year) {
      const beforeYearMatch = filename.match(new RegExp(`^(.*?)(?:[\\s._\\-[\\]()]|\\b)${year}\\b`));
      if (beforeYearMatch && beforeYearMatch[1].trim().length >= 2) {
        movieTitle = stripFilenameNoise(beforeYearMatch[1]);
      } else {
        movieTitle = stripFilenameNoise(filename.replace(new RegExp(`\\b${year}\\b`, 'g'), ''));
      }
    } else {
      movieTitle = stripFilenameNoise(filename);
    }
  }

  const normalizedQuery = (mediaType === 'tv' ? seriesTitle : movieTitle) || stripFilenameNoise(filename);

  return {
    rawInput,
    sourcePath: normalizedPath !== filename ? normalizedPath : undefined,
    url,
    mediaType,
    isEpisode,
    isPack,
    isSpecial,
    isMultiEpisode,
    seriesTitle,
    movieTitle,
    normalizedQuery,
    year,
    seasonNumber,
    episodeNumber,
    episodeNumberEnd,
    embeddedEpisodeTitle,
    resolution: rel.resolutionLabel,
    codec: rel.codec,
    dynamicRange: rel.dynamicRangeLabel,
    audioLanguage: rel.audioLanguage,
    container: rel.container,
    fileSize: rel.fileSize,
    folderContext: parentFolders.length > 0 ? {
      seriesFolder,
      seasonFolder: folderSeasonNumber !== undefined ? `Season ${folderSeasonNumber}` : undefined,
      isSpecialsFolder,
    } : undefined,
  };
}

/**
 * Searches TMDB for TV series or movies with strict disambiguation and ranking
 */
async function searchTmdbProvider(
  query: string,
  mediaType: 'movie' | 'tv',
  year?: number
): Promise<{ matched: any | null; alternatives: MediaIdentificationAlternative[]; isAmbiguous: boolean }> {
  if (!query || query.length < 2) {
    return { matched: null, alternatives: [], isAmbiguous: false };
  }

  let results: any[] = [];
  const apiKey = getTmdbApiKey();
  if (apiKey) {
    const endpoint = mediaType === 'tv' ? '/search/tv' : '/search/movie';
    const url = `${TMDB_BASE_URL}${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.results) && data.results.length > 0) {
          results = data.results;
        }
      }
    } catch {}
  }

  // If live search returned no results or was unreachable, fallback to project's searchMulti
  if (results.length === 0) {
    try {
      const fallback = await searchMulti(query);
      if (Array.isArray(fallback?.results) && fallback.results.length > 0) {
        results = (fallback.results as any[]).filter(
          (item: any) => !item.media_type || item.media_type === mediaType
        );
      }
    } catch {}
  }

  if (results.length === 0) {
    return { matched: null, alternatives: [], isAmbiguous: false };
  }

  const normQ = query.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Score and rank candidates
  const scored = results.map((item) => {
    const itemTitle = (item.title || item.name || '').trim();
    const normTitle = itemTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const releaseDate = item.release_date || item.first_air_date || '';
    const itemYear = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : undefined;

    let score = 0;
    if (normTitle === normQ) score += 50;
    else if (normTitle.startsWith(normQ) || normQ.startsWith(normTitle)) score += 30;
    else score += 10;

    if (year && itemYear) {
      if (itemYear === year) score += 40;
      else if (Math.abs(itemYear - year) <= 1) score += 20;
      else score -= 15;
    }

    // Popularity weighting for tiebreakers
    score += Math.min(10, Math.log10(Math.max(1, item.vote_count || 1)) * 2);

    return { item, score, itemYear, itemTitle };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const secondBest = scored.length > 1 ? scored[1] : null;

  // Check if ambiguous (e.g. top 2 items have identical or nearly identical scores, differing years, and no year was provided)
  const isAmbiguous = Boolean(
    secondBest &&
    !year &&
    secondBest.score >= best.score - 5 &&
    best.itemTitle.toLowerCase() === secondBest.itemTitle.toLowerCase() &&
    best.itemYear !== secondBest.itemYear
  );

  const alternatives: MediaIdentificationAlternative[] = scored.slice(0, 5).map((s) => ({
    tmdbId: s.item.id,
    title: s.item.title || s.item.name || '',
    year: s.itemYear,
    mediaType,
    posterPath: s.item.poster_path,
    overview: s.item.overview,
  }));

  if (isAmbiguous) {
    return { matched: null, alternatives, isAmbiguous: true };
  }

  return { matched: best.item, alternatives, isAmbiguous: false };
}

/**
 * End-to-end media identification function
 */
export async function identifyMediaItem(
  input: string,
  options?: IdentificationOptions
): Promise<MediaIdentificationResult> {
  const parsed = parseMediaCandidate(input, options?.url);
  const effectiveType = options?.forcedType || parsed.mediaType;
  const effectiveQuery = options?.forcedTitle || parsed.normalizedQuery;
  const effectiveYear = options?.forcedYear || parsed.year;

  const resultId = `mid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // 1. If explicit TMDB ID is provided (e.g. from user correction)
  if (options?.forcedTmdbId) {
    const numId = Number(options.forcedTmdbId);
    if (!isNaN(numId) && numId > 0) {
      try {
        const detailData = await getTitleDetails(effectiveType, numId);
        if (detailData) {
          const title = detailData.title || detailData.name || effectiveQuery;
          const releaseDate = detailData.release_date || detailData.first_air_date || '';
          const year = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : effectiveYear;

          let episodeDetails: MediaIdentificationResult['episodeDetails'] = undefined;

          if (effectiveType === 'tv' && (parsed.isEpisode || parsed.seasonNumber !== undefined)) {
            const sNum = parsed.seasonNumber !== undefined ? parsed.seasonNumber : 1;
            const epNum = parsed.episodeNumber !== undefined ? parsed.episodeNumber : 1;

            const seasonData = await getSeasonEpisodes(numId, sNum);
            const ep = seasonData?.episodes?.find((e) => e.episode_number === epNum);

            episodeDetails = {
              seasonNumber: sNum,
              episodeNumber: epNum,
              episodeNumberEnd: parsed.episodeNumberEnd,
              episodeTitle: ep?.name || parsed.embeddedEpisodeTitle || `Episode ${epNum}`,
              officialEpisodeTitle: ep?.name,
              episodeOverview: ep?.overview,
              stillPath: ep?.still_path,
              isSpecial: sNum === 0,
              isMultiEpisode: parsed.isMultiEpisode,
            };
          }

          return {
            id: resultId,
            rawInput: input,
            sourcePath: options?.sourcePath || parsed.sourcePath,
            url: options?.url,
            parsed,
            status: 'matched',
            confidence: 'verified',
            mediaType: effectiveType,
            tmdbId: numId,
            title,
            originalTitle: detailData.original_title || detailData.original_name,
            year,
            releaseDate,
            posterPath: detailData.poster_path,
            backdropPath: detailData.backdrop_path,
            overview: detailData.overview,
            voteAverage: detailData.vote_average,
            episodeDetails,
            userCorrected: true,
            manualTitleVerified: true,
            timestamp: new Date().toISOString(),
          };
        }
      } catch {}
    }
  }

  // 2. Query TMDB Search
  const { matched, alternatives, isAmbiguous } = await searchTmdbProvider(
    effectiveQuery,
    effectiveType,
    effectiveYear
  );

  if (isAmbiguous) {
    return {
      id: resultId,
      rawInput: input,
      sourcePath: options?.sourcePath || parsed.sourcePath,
      url: options?.url,
      parsed,
      status: 'ambiguous',
      confidence: 'medium',
      reason: `Ambiguous match: multiple ${effectiveType === 'tv' ? 'TV shows' : 'movies'} found with title "${effectiveQuery}". Specify the release year to resolve.`,
      mediaType: effectiveType,
      title: effectiveQuery,
      year: effectiveYear,
      alternatives,
      timestamp: new Date().toISOString(),
    };
  }

  if (!matched) {
    return {
      id: resultId,
      rawInput: input,
      sourcePath: options?.sourcePath || parsed.sourcePath,
      url: options?.url,
      parsed,
      status: 'unmatched',
      confidence: 'none',
      reason: `No matching ${effectiveType === 'tv' ? 'TV series' : 'feature film'} found on TMDB for query "${effectiveQuery}"${effectiveYear ? ` (${effectiveYear})` : ''}.`,
      mediaType: effectiveType,
      title: effectiveQuery,
      year: effectiveYear,
      alternatives: [],
      timestamp: new Date().toISOString(),
    };
  }

  const officialTitle = matched.title || matched.name || effectiveQuery;
  const releaseDate = matched.release_date || matched.first_air_date || '';
  const resolvedYear = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : effectiveYear;
  const tmdbId = matched.id;

  // 3. For TV Episodes, look up exact season and episode metadata from provider
  let episodeDetails: MediaIdentificationResult['episodeDetails'] = undefined;

  if (effectiveType === 'tv' && parsed.isEpisode) {
    const sNum = parsed.seasonNumber !== undefined ? parsed.seasonNumber : 1;
    const epNum = parsed.episodeNumber !== undefined ? parsed.episodeNumber : 1;

    // Fetch exact season episodes from TMDB
    const seasonData = await getSeasonEpisodes(tmdbId, sNum);
    const targetEpisode = seasonData?.episodes?.find((e) => e.episode_number === epNum);

    if (targetEpisode) {
      episodeDetails = {
        seasonNumber: sNum,
        episodeNumber: epNum,
        episodeNumberEnd: parsed.episodeNumberEnd,
        episodeTitle: targetEpisode.name || parsed.embeddedEpisodeTitle || `Episode ${epNum}`,
        officialEpisodeTitle: targetEpisode.name,
        episodeOverview: targetEpisode.overview,
        stillPath: targetEpisode.still_path,
        isSpecial: sNum === 0,
        isMultiEpisode: parsed.isMultiEpisode,
      };
    } else {
      // Check multi-source fallback (TVMaze / Cinemeta) for episode title
      const multiSource = await resolveSeasonEpisodes({
        tmdbId,
        query: officialTitle,
        season: sNum,
        year: resolvedYear,
      }).catch(() => null);

      const fallbackEp = multiSource?.episodes?.find((e) => e.episode_number === epNum);

      if (fallbackEp && fallbackEp.name) {
        episodeDetails = {
          seasonNumber: sNum,
          episodeNumber: epNum,
          episodeNumberEnd: parsed.episodeNumberEnd,
          episodeTitle: fallbackEp.name,
          officialEpisodeTitle: fallbackEp.name,
          episodeOverview: fallbackEp.overview,
          stillPath: fallbackEp.still_path,
          isSpecial: sNum === 0,
          isMultiEpisode: parsed.isMultiEpisode,
        };
      } else {
        // Episode number not found in season
        return {
          id: resultId,
          rawInput: input,
          sourcePath: options?.sourcePath || parsed.sourcePath,
          url: options?.url,
          parsed,
          status: 'unmatched',
          confidence: 'low',
          reason: `Series "${officialTitle}" found, but Episode S${sNum}E${epNum} does not exist in TMDB season data.`,
          mediaType: 'tv',
          tmdbId,
          title: officialTitle,
          year: resolvedYear,
          releaseDate,
          posterPath: matched.poster_path,
          backdropPath: matched.backdrop_path,
          overview: matched.overview,
          voteAverage: matched.vote_average,
          timestamp: new Date().toISOString(),
        };
      }
    }
  }

  return {
    id: resultId,
    rawInput: input,
    sourcePath: options?.sourcePath || parsed.sourcePath,
    url: options?.url,
    parsed,
    status: 'matched',
    confidence: 'verified',
    mediaType: effectiveType,
    tmdbId,
    title: officialTitle,
    originalTitle: matched.original_title || matched.original_name,
    year: resolvedYear,
    releaseDate,
    posterPath: matched.poster_path,
    backdropPath: matched.backdrop_path,
    overview: matched.overview,
    voteAverage: matched.vote_average,
    episodeDetails,
    alternatives,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Persists an identified media item into database layers (Supabase + Redis),
 * strictly preserving existing user corrections and distinct namespaces.
 */
export async function saveIdentifiedMediaRecord(
  item: MediaIdentificationResult,
  customUrl?: string
): Promise<{ success: boolean; linkId?: string; error?: string }> {
  if (item.status !== 'matched' || !item.tmdbId) {
    return { success: false, error: 'Cannot save an unmatched or ambiguous media item without user resolution.' };
  }

  const finalUrl = customUrl || item.url || item.parsed.url;
  if (!finalUrl) {
    return { success: false, error: 'Destination URL is required to persist link.' };
  }

  const movieId = String(item.tmdbId);
  const { getLinksFromDatabase, saveLinkToDatabase } = await import('./redisDb.ts');

  // Check if link already exists with user corrections
  const existingRes = await getLinksFromDatabase(movieId);
  const existingLinks: any[] = Array.isArray(existingRes.links) ? existingRes.links : [];
  const existingMatch = existingLinks.find((l) => l.url === finalUrl);

  if (existingMatch && existingMatch.manualTitleVerified && !item.userCorrected) {
    // Preserve user corrections!
    return {
      success: true,
      linkId: existingMatch.id,
    };
  }

  const linkId = existingMatch?.id || `mid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const linkPayload: any = {
    id: linkId,
    movieId,
    movieTitle: item.title,
    title: item.parsed.rawInput,
    url: finalUrl,
    mediaType: item.mediaType,
    releaseDate: item.releaseDate,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    overview: item.overview,
    voteAverage: item.voteAverage,
    quality: item.parsed.resolution || '1080p WEB-DL',
    codec: item.parsed.codec,
    audioLanguage: item.parsed.audioLanguage || 'English',
    size: item.parsed.fileSize,
    linkType: item.mediaType === 'tv' ? (item.parsed.isPack ? 'zip_pack' : 'single_episode') : 'general',
    category: item.mediaType === 'tv' ? (item.parsed.isPack ? 'ZipPack' : 'SingleEpisode') : 'Streaming',
    seasonNumber: item.episodeDetails?.seasonNumber ?? item.parsed.seasonNumber,
    episodeNumber: item.episodeDetails?.episodeNumber ?? item.parsed.episodeNumber,
    episodeTitle: item.episodeDetails?.episodeTitle,
    manualTitleVerified: Boolean(item.userCorrected),
    matchingDecision: 'media_identifier_verified',
    matchingConfidence: item.confidence,
  };

  try {
    await saveLinkToDatabase(movieId, linkPayload);
    return { success: true, linkId };
  } catch (err: any) {
    return { success: false, error: err.message || 'Database write failed' };
  }
}
