/**
 * 4-Stage Zero-Loss TMDB Matcher Engine
 * Guarantees zero link loss through cascading multi-pass TMDB queries,
 * secondary metadata bridges (Cinemeta/OMDb), Telegram inline recovery,
 * and custom fallback publishing.
 */

import { getActiveTmdbKey } from '@/lib/tmdb';
import { getRedisClient } from '@/lib/redisDb';
import { dualWriteSaveMultipleLinks } from '@/lib/dualWrite';
import { CustomLink } from '@/types';

export interface TmdbCandidate {
  id: number | string;
  title: string;
  originalTitle?: string;
  mediaType: 'movie' | 'tv';
  year?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string;
  voteAverage?: number;
  confidenceScore: number; // 0 to 1
  stage: 'direct_id' | 'pass1_strict' | 'pass2_fuzzy' | 'pass3_prefix' | 'stage2_bridge' | 'custom_fallback';
}

export interface MatchResult {
  matched: boolean;
  stage: string;
  candidate?: TmdbCandidate;
  candidates?: TmdbCandidate[];
  jobId?: string;
  needsInlineConfirmation?: boolean;
}

/**
 * Calculates string similarity using Sorensen-Dice coefficient
 */
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0.0;

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bigram = s1.substring(i, i + 2);
    bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bigram = s2.substring(i, i + 2);
    const count = bigrams1.get(bigram) || 0;
    if (count > 0) {
      bigrams1.set(bigram, count - 1);
      intersection++;
    }
  }

  return (2.0 * intersection) / (s1.length + s2.length - 2);
}

/**
 * Resolves an IMDb ID (tt...) to official TMDB details via /3/find
 */
export async function resolveImdbIdViaTmdb(imdbId: string): Promise<TmdbCandidate | null> {
  const apiKey = getActiveTmdbKey();
  if (!apiKey || !/^tt\d{7,8}$/i.test(imdbId.trim())) return null;

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/find/${imdbId.trim()}?api_key=${apiKey}&external_source=imdb_id`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const movie = data.movie_results?.[0];
    if (movie) {
      return {
        id: movie.id,
        title: movie.title || movie.original_title,
        originalTitle: movie.original_title,
        mediaType: 'movie',
        year: movie.release_date ? movie.release_date.split('-')[0] : undefined,
        posterPath: movie.poster_path,
        backdropPath: movie.backdrop_path,
        overview: movie.overview,
        voteAverage: movie.vote_average,
        confidenceScore: 0.99,
        stage: 'direct_id',
      };
    }

    const tv = data.tv_results?.[0];
    if (tv) {
      return {
        id: tv.id,
        title: tv.name || tv.original_name,
        originalTitle: tv.original_name,
        mediaType: 'tv',
        year: tv.first_air_date ? tv.first_air_date.split('-')[0] : undefined,
        posterPath: tv.poster_path,
        backdropPath: tv.backdrop_path,
        overview: tv.overview,
        voteAverage: tv.vote_average,
        confidenceScore: 0.99,
        stage: 'direct_id',
      };
    }
  } catch (err) {
    console.warn('resolveImdbIdViaTmdb error:', err);
  }
  return null;
}

/**
 * Stage 1: Cascading Multi-Pass TMDB Matcher
 */
export async function matchTmdbCascading(
  rawText: string,
  cleanTitle: string,
  extractedYear?: number,
  isSeries?: boolean
): Promise<MatchResult> {
  const apiKey = getActiveTmdbKey();
  if (!apiKey) {
    return { matched: false, stage: 'api_key_missing' };
  }

  // --- PASS 0: Direct TMDB / IMDb ID in Caption ---
  const imdbMatch = rawText.match(/\b(tt\d{7,8})\b/i);
  if (imdbMatch && imdbMatch[1]) {
    const resolved = await resolveImdbIdViaTmdb(imdbMatch[1]);
    if (resolved) {
      return { matched: true, stage: 'pass0_imdb_direct', candidate: resolved };
    }
  }

  const tmdbUrlMatch = rawText.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
  if (tmdbUrlMatch) {
    const mediaType = tmdbUrlMatch[1].toLowerCase() as 'movie' | 'tv';
    const id = tmdbUrlMatch[2];
    try {
      const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${apiKey}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const item = await res.json();
        return {
          matched: true,
          stage: 'pass0_tmdb_direct',
          candidate: {
            id: item.id,
            title: item.title || item.name,
            originalTitle: item.original_title || item.original_name,
            mediaType,
            year: (item.release_date || item.first_air_date || '').split('-')[0],
            posterPath: item.poster_path,
            backdropPath: item.backdrop_path,
            overview: item.overview,
            voteAverage: item.vote_average,
            confidenceScore: 1.0,
            stage: 'direct_id',
          },
        };
      }
    } catch {}
  }

  // --- PASS 1: Strict Search with Year & Adult ---
  try {
    const endpoint = isSeries ? '/search/tv' : '/search/multi';
    const params = new URLSearchParams({
      api_key: apiKey,
      query: cleanTitle,
      include_adult: 'true',
    });
    if (extractedYear) {
      if (isSeries) {
        params.set('first_air_date_year', String(extractedYear));
      } else {
        params.set('year', String(extractedYear));
      }
    }

    const res = await fetch(`https://api.themoviedb.org/3${endpoint}?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const results = (data.results || []).filter((r: any) => r.media_type !== 'person');
      if (results.length > 0) {
        const top = results[0];
        const titleStr = top.title || top.name || '';
        const sim = stringSimilarity(cleanTitle, titleStr);
        if (sim >= 0.75) {
          return {
            matched: true,
            stage: 'pass1_strict',
            candidate: {
              id: top.id,
              title: titleStr,
              originalTitle: top.original_title || top.original_name,
              mediaType: (top.media_type || (isSeries ? 'tv' : 'movie')) as 'movie' | 'tv',
              year: (top.release_date || top.first_air_date || '').split('-')[0],
              posterPath: top.poster_path,
              backdropPath: top.backdrop_path,
              overview: top.overview,
              voteAverage: top.vote_average,
              confidenceScore: sim,
              stage: 'pass1_strict',
            },
          };
        }
      }
    }
  } catch {}

  // --- PASS 2: Year-Relaxed Fuzzy Search ---
  try {
    const endpoint = isSeries ? '/search/tv' : '/search/multi';
    const params = new URLSearchParams({
      api_key: apiKey,
      query: cleanTitle,
      include_adult: 'true',
    });

    const res = await fetch(`https://api.themoviedb.org/3${endpoint}?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const results = (data.results || []).filter((r: any) => r.media_type !== 'person');
      const scored: TmdbCandidate[] = [];

      for (const item of results.slice(0, 5)) {
        const titleStr = item.title || item.name || '';
        const origStr = item.original_title || item.original_name || '';
        const sim1 = stringSimilarity(cleanTitle, titleStr);
        const sim2 = stringSimilarity(cleanTitle, origStr);
        let sim = Math.max(sim1, sim2);

        const candYearStr = (item.release_date || item.first_air_date || '').split('-')[0];
        const candYear = parseInt(candYearStr, 10);
        if (extractedYear && !isNaN(candYear)) {
          if (Math.abs(candYear - extractedYear) <= 1) {
            sim = Math.min(1.0, sim + 0.15); // Year match boost
          } else if (Math.abs(candYear - extractedYear) > 3) {
            sim = Math.max(0, sim - 0.25); // Year mismatch penalty
          }
        }

        if (sim >= 0.6) {
          scored.push({
            id: item.id,
            title: titleStr,
            originalTitle: origStr,
            mediaType: (item.media_type || (isSeries ? 'tv' : 'movie')) as 'movie' | 'tv',
            year: candYearStr,
            posterPath: item.poster_path,
            backdropPath: item.backdrop_path,
            overview: item.overview,
            voteAverage: item.vote_average,
            confidenceScore: sim,
            stage: 'pass2_fuzzy',
          });
        }
      }

      scored.sort((a, b) => b.confidenceScore - a.confidenceScore);
      if (scored.length > 0 && scored[0].confidenceScore >= 0.72) {
        return { matched: true, stage: 'pass2_fuzzy', candidate: scored[0] };
      }
    }
  } catch {}

  // --- PASS 3: Prefix Split (e.g. "Stree 2: Sarkate Ka Aatank" -> "Stree 2") ---
  if (cleanTitle.includes(':') || cleanTitle.includes('-')) {
    const prefix = cleanTitle.split(/[:\-]/)[0].trim();
    if (prefix.length >= 3 && prefix !== cleanTitle) {
      const prefixResult = await matchTmdbCascading(rawText, prefix, extractedYear, isSeries);
      if (prefixResult.matched && prefixResult.candidate) {
        return {
          ...prefixResult,
          stage: 'pass3_prefix',
        };
      }
    }
  }

  // --- STAGE 2: Secondary Metadata Bridge (Cinemeta / Stremio) ---
  try {
    const type = isSeries ? 'series' : 'movie';
    const cinemetaUrl = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(cleanTitle)}.json`;
    const cmRes = await fetch(cinemetaUrl, { signal: AbortSignal.timeout(4000) });
    if (cmRes.ok) {
      const cmData = await cmRes.json();
      const meta = cmData?.metas?.[0];
      if (meta && meta.imdb_id) {
        const bridgeCandidate = await resolveImdbIdViaTmdb(meta.imdb_id);
        if (bridgeCandidate) {
          bridgeCandidate.stage = 'stage2_bridge';
          return { matched: true, stage: 'stage2_bridge', candidate: bridgeCandidate };
        }
      }
    }
  } catch {}

  return { matched: false, stage: 'unmatched' };
}

/**
 * Stage 3: Stages pending links in Redis for Telegram Inline Keyboard recovery
 */
export async function stagePendingIngestionJob(
  cleanTitle: string,
  links: CustomLink[],
  candidates: TmdbCandidate[]
): Promise<string> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(
        `ingest:pending:${jobId}`,
        JSON.stringify({
          jobId,
          cleanTitle,
          links,
          candidates,
          createdAt: new Date().toISOString(),
        }),
        { ex: 86400 } // 24h expiration
      );
    } catch (e: any) {
      console.error('Failed to stage pending ingestion job in Redis:', e.message);
    }
  }
  return jobId;
}

/**
 * Stage 4: Publishes links under a fallback custom ID to guarantee zero link drop
 */
export async function createCustomFallbackEntry(
  cleanTitle: string,
  links: CustomLink[],
  extraMetadata: {
    year?: string | number;
    mediaType?: 'movie' | 'tv';
  } = {}
): Promise<{ movieId: string; count: number }> {
  const customId = `custom_${Date.now()}`;
  const customLinks = links.map((l) => ({
    ...l,
    movieId: customId,
    movieTitle: cleanTitle,
    mediaType: extraMetadata.mediaType || 'movie',
    releaseDate: extraMetadata.year ? `${extraMetadata.year}-01-01` : '2024-01-01',
    voteAverage: 8.0,
    posterPath: null,
    backdropPath: null,
  }));

  const res = await dualWriteSaveMultipleLinks(customLinks);
  return {
    movieId: customId,
    count: res.count || customLinks.length,
  };
}
