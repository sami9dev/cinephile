import { getEnv } from '@/lib/env';

export interface TraktEpisodeLookupParams {
  tmdbId?: string | number;
  imdbId?: string;
  query?: string;
  season: number;
  episode: number;
}

export interface TraktEpisodeResult {
  success: boolean;
  title?: string;
  season?: number;
  episode?: number;
  overview?: string;
  showTitle?: string;
  showYear?: number;
  traktId?: number;
  tmdbId?: number;
  imdbId?: string;
  error?: string;
  statusCode?: number;
}

export interface TraktSeasonResult {
  success: boolean;
  showTitle?: string;
  showYear?: number;
  season?: number;
  episodes?: Array<{
    episodeNumber: number;
    title: string;
    overview?: string;
    traktId?: number;
  }>;
  error?: string;
  statusCode?: number;
}

const TRAKT_BASE_URL = 'https://api.trakt.tv';

/**
 * Returns standard Trakt API v2 headers.
 * Does not expose the client ID to client-side bundles or logs.
 */
function getTraktHeaders(clientId: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
  };
}

/**
 * Helper to resolve a Trakt show object using TMDB ID, IMDb ID, or search query.
 */
async function resolveTraktShow(
  clientId: string,
  params: { tmdbId?: string | number; imdbId?: string; query?: string }
): Promise<{ show: any } | { error: string; statusCode: number }> {
  const headers = getTraktHeaders(clientId);

  // 1. Try TMDB ID lookup if provided
  if (params.tmdbId) {
    const tmdbIdClean = String(params.tmdbId).trim();
    if (tmdbIdClean && /^\d+$/.test(tmdbIdClean)) {
      try {
        const res = await fetch(`${TRAKT_BASE_URL}/search/tmdb/${tmdbIdClean}?type=show`, {
          headers,
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0 && list[0]?.show) {
            return { show: list[0].show };
          }
        } else if (res.status === 429) {
          return { error: 'Trakt rate limit exceeded. Please wait a moment before trying again.', statusCode: 429 };
        }
      } catch (e: any) {
        console.warn('Trakt TMDB search lookup error:', e?.message || e);
      }
    }
  }

  // 2. Try IMDb ID lookup if provided
  if (params.imdbId) {
    const imdbClean = String(params.imdbId).trim();
    if (imdbClean.startsWith('tt')) {
      try {
        const res = await fetch(`${TRAKT_BASE_URL}/search/imdb/${imdbClean}?type=show`, {
          headers,
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0 && list[0]?.show) {
            return { show: list[0].show };
          }
        } else if (res.status === 429) {
          return { error: 'Trakt rate limit exceeded. Please wait a moment before trying again.', statusCode: 429 };
        }
      } catch (e: any) {
        console.warn('Trakt IMDb search lookup error:', e?.message || e);
      }
    }
  }

  // 3. Fallback to text query lookup if provided
  if (params.query) {
    const cleanQuery = String(params.query).trim();
    if (cleanQuery) {
      try {
        const res = await fetch(`${TRAKT_BASE_URL}/search/show?query=${encodeURIComponent(cleanQuery)}`, {
          headers,
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0 && list[0]?.show) {
            return { show: list[0].show };
          }
        } else if (res.status === 429) {
          return { error: 'Trakt rate limit exceeded. Please wait a moment before trying again.', statusCode: 429 };
        }
      } catch (e: any) {
        console.warn('Trakt query search error:', e?.message || e);
      }
    }
  }

  return {
    error: 'Show could not be resolved on Trakt using the provided TMDB ID, IMDb ID, or search query.',
    statusCode: 404,
  };
}

/**
 * Retrieves a single TV episode title and metadata from Trakt API.
 */
export async function fetchTraktEpisodeTitle(
  params: TraktEpisodeLookupParams
): Promise<TraktEpisodeResult> {
  const clientId = getEnv('TRAKT_CLIENT_ID');
  if (!clientId) {
    return {
      success: false,
      error: 'TRAKT_CLIENT_ID is not configured in server environment variables. Please configure TRAKT_CLIENT_ID to enable Trakt episode title lookup.',
      statusCode: 503,
    };
  }

  const season = Math.max(0, Number(params.season) || 1);
  const episode = Math.max(1, Number(params.episode) || 1);

  // Resolve show
  const showResult = await resolveTraktShow(clientId, {
    tmdbId: params.tmdbId,
    imdbId: params.imdbId,
    query: params.query,
  });

  if ('error' in showResult) {
    return {
      success: false,
      error: showResult.error,
      statusCode: showResult.statusCode,
    };
  }

  const { show } = showResult;
  const showIdentifier = show.ids?.slug || show.ids?.trakt;
  if (!showIdentifier) {
    return {
      success: false,
      error: 'Trakt show identifier is unavailable.',
      statusCode: 404,
    };
  }

  // Fetch episode details
  try {
    const res = await fetch(
      `${TRAKT_BASE_URL}/shows/${showIdentifier}/seasons/${season}/episodes/${episode}?extended=full`,
      {
        headers: getTraktHeaders(clientId),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (res.status === 404) {
      return {
        success: false,
        error: `Episode S${season}E${episode} not found on Trakt for show "${show.title}".`,
        statusCode: 404,
      };
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After') || '30 seconds';
      return {
        success: false,
        error: `Trakt API rate limit reached. Please retry in ${retryAfter}.`,
        statusCode: 429,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        error: 'Trakt API authorization failed: Invalid or expired TRAKT_CLIENT_ID.',
        statusCode: 401,
      };
    }

    if (!res.ok) {
      return {
        success: false,
        error: `Trakt API returned status ${res.status}: ${res.statusText}`,
        statusCode: res.status,
      };
    }

    const data = await res.json();
    return {
      success: true,
      title: data.title || '',
      season: data.season ?? season,
      episode: data.number ?? episode,
      overview: data.overview || '',
      showTitle: show.title || '',
      showYear: show.year,
      traktId: data.ids?.trakt,
      tmdbId: data.ids?.tmdb,
      imdbId: data.ids?.imdb,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error reaching Trakt API: ${err?.message || err}`,
      statusCode: 500,
    };
  }
}

/**
 * Retrieves all TV episode titles for an entire season from Trakt API.
 */
export async function fetchTraktSeasonEpisodes(params: {
  tmdbId?: string | number;
  imdbId?: string;
  query?: string;
  season: number;
}): Promise<TraktSeasonResult> {
  const clientId = getEnv('TRAKT_CLIENT_ID');
  if (!clientId) {
    return {
      success: false,
      error: 'TRAKT_CLIENT_ID is not configured in server environment variables.',
      statusCode: 503,
    };
  }

  const season = Math.max(0, Number(params.season) || 1);

  const showResult = await resolveTraktShow(clientId, {
    tmdbId: params.tmdbId,
    imdbId: params.imdbId,
    query: params.query,
  });

  if ('error' in showResult) {
    return {
      success: false,
      error: showResult.error,
      statusCode: showResult.statusCode,
    };
  }

  const { show } = showResult;
  const showIdentifier = show.ids?.slug || show.ids?.trakt;
  if (!showIdentifier) {
    return {
      success: false,
      error: 'Trakt show identifier is unavailable.',
      statusCode: 404,
    };
  }

  try {
    const res = await fetch(
      `${TRAKT_BASE_URL}/shows/${showIdentifier}/seasons/${season}?extended=full`,
      {
        headers: getTraktHeaders(clientId),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (res.status === 404) {
      return {
        success: false,
        error: `Season ${season} not found on Trakt for show "${show.title}".`,
        statusCode: 404,
      };
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After') || '30 seconds';
      return {
        success: false,
        error: `Trakt API rate limit reached. Please retry in ${retryAfter}.`,
        statusCode: 429,
      };
    }

    if (!res.ok) {
      return {
        success: false,
        error: `Trakt API returned status ${res.status}: ${res.statusText}`,
        statusCode: res.status,
      };
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return {
        success: false,
        error: 'Invalid response payload from Trakt API for season episodes.',
        statusCode: 500,
      };
    }

    return {
      success: true,
      showTitle: show.title || '',
      showYear: show.year,
      season,
      episodes: data.map((ep: any) => ({
        episodeNumber: ep.number,
        title: ep.title || '',
        overview: ep.overview || '',
        traktId: ep.ids?.trakt,
      })),
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error reaching Trakt API: ${err?.message || err}`,
      statusCode: 500,
    };
  }
}
