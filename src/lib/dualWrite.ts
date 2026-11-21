/**
 * Dual-Write Resilient Storage Engine
 * Coordinates atomic writes and updates across Supabase PostgreSQL and Upstash Redis
 * with immediate cache invalidation and immutable audit logs.
 */

import { CustomLink, TitleDetails } from '@/types';
import {
  saveLinkToDatabase,
  saveMultipleLinksToDatabase,
  deleteLinkFromDatabase,
  deleteMultipleLinksFromDatabase,
  deleteEntireTitleWithAudit,
  reassignLinksInDatabase,
  migrateDomainInDatabase,
  updateTitleMetadata,
  invalidateCatalogCache,
  getRedisClient,
} from '@/lib/redisDb';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { isValidHttpUrl, sanitizeInputString } from '@/lib/security';

export interface DualWriteResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  source?: string;
  count?: number;
}

/**
 * Atomically writes a single link to both Supabase PostgreSQL and Upstash Redis.
 */
export async function dualWriteSaveLink(
  link: CustomLink,
  options: { bumpVersion?: boolean } = { bumpVersion: true }
): Promise<DualWriteResult<CustomLink>> {
  if (!link || !link.url) {
    return { success: false, error: 'Link object and valid URL are required' };
  }

  if (!isValidHttpUrl(link.url)) {
    return { success: false, error: 'Invalid URL: must be a safe HTTP/HTTPS URL' };
  }

  const movieId = link.movieId || (link as any).tmdbId || '0';
  const cleanLink: CustomLink = {
    ...link,
    movieId: String(movieId),
    title: sanitizeInputString(link.title || 'Untitled Stream'),
    movieTitle: link.movieTitle ? sanitizeInputString(link.movieTitle) : undefined,
    url: link.url.trim(),
    quality: link.quality ? sanitizeInputString(link.quality, 50) : undefined,
    codec: link.codec ? sanitizeInputString(link.codec, 50) : undefined,
    audioLanguage: link.audioLanguage ? sanitizeInputString(link.audioLanguage, 100) : undefined,
    serverName: link.serverName ? sanitizeInputString(link.serverName, 100) : undefined,
    serverBadge: link.serverBadge ? sanitizeInputString(link.serverBadge, 100) : undefined,
    createdAt: link.createdAt || new Date().toISOString(),
  };

  try {
    const success = await saveLinkToDatabase(cleanLink.movieId || '0', cleanLink);
    if (!success) {
      return { success: false, error: 'Failed to persist link to database layers' };
    }

    if (options.bumpVersion) {
      await invalidateCatalogCache().catch(() => {});
    }

    return {
      success: true,
      data: cleanLink,
      source: 'dual_write_success',
    };
  } catch (err: any) {
    console.error('dualWriteSaveLink error:', err);
    return { success: false, error: err.message || 'Dual write exception' };
  }
}

/**
 * Atomically writes a batch of links to both Supabase PostgreSQL and Upstash Redis.
 */
export async function dualWriteSaveMultipleLinks(
  links: CustomLink[],
  options: { bumpVersion?: boolean } = { bumpVersion: true }
): Promise<DualWriteResult<{ count: number }>> {
  if (!Array.isArray(links) || links.length === 0) {
    return { success: false, error: 'Links array must not be empty' };
  }

  // Group links by movieId
  const grouped = new Map<string, CustomLink[]>();
  for (const l of links) {
    if (l && l.url && isValidHttpUrl(l.url)) {
      const mId = String(l.movieId || (l as any).tmdbId || '0');
      const clean: CustomLink = {
        ...l,
        movieId: mId,
        title: sanitizeInputString(l.title || 'Untitled Stream'),
        movieTitle: l.movieTitle ? sanitizeInputString(l.movieTitle) : undefined,
        url: l.url.trim(),
        quality: l.quality ? sanitizeInputString(l.quality, 50) : undefined,
        codec: l.codec ? sanitizeInputString(l.codec, 50) : undefined,
        audioLanguage: l.audioLanguage ? sanitizeInputString(l.audioLanguage, 100) : undefined,
        serverName: l.serverName ? sanitizeInputString(l.serverName, 100) : undefined,
        serverBadge: l.serverBadge ? sanitizeInputString(l.serverBadge, 100) : undefined,
        createdAt: l.createdAt || new Date().toISOString(),
      };
      if (!grouped.has(mId)) grouped.set(mId, []);
      grouped.get(mId)!.push(clean);
    }
  }

  if (grouped.size === 0) {
    return { success: false, error: 'No valid links provided' };
  }

  let totalSaved = 0;
  try {
    for (const [mId, list] of grouped.entries()) {
      const ok = await saveMultipleLinksToDatabase(mId, list);
      if (ok) totalSaved += list.length;
    }

    if (options.bumpVersion) {
      await invalidateCatalogCache().catch(() => {});
    }

    return {
      success: true,
      data: { count: totalSaved },
      count: totalSaved,
      source: 'dual_write_success',
    };
  } catch (err: any) {
    console.error('dualWriteSaveMultipleLinks error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Deletes a single link from Supabase and Upstash Redis.
 */
export async function dualWriteDeleteLink(
  linkId: string,
  movieId: string | number
): Promise<DualWriteResult> {
  if (!linkId || !movieId) {
    return { success: false, error: 'linkId and movieId are required' };
  }

  try {
    const success = await deleteLinkFromDatabase(movieId, linkId);
    await invalidateCatalogCache().catch(() => {});
    return {
      success,
      source: 'dual_write_delete',
    };
  } catch (err: any) {
    console.error('dualWriteDeleteLink error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Deletes multiple links from Supabase and Upstash Redis in bulk.
 */
export async function dualWriteDeleteMultipleLinks(
  linkIds: string[],
  movieId: string | number
): Promise<DualWriteResult> {
  if (!Array.isArray(linkIds) || linkIds.length === 0 || !movieId) {
    return { success: false, error: 'linkIds array and movieId are required' };
  }

  try {
    const items = linkIds.map((linkId) => ({ movieId, linkId }));
    const success = await deleteMultipleLinksFromDatabase(items);
    await invalidateCatalogCache().catch(() => {});
    return {
      success,
      count: linkIds.length,
      source: 'dual_write_bulk_delete',
    };
  } catch (err: any) {
    console.error('dualWriteDeleteMultipleLinks error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Completely purges a title and its links from Supabase and Redis,
 * recording an immutable audit log in audit_title_deletions.
 */
export async function dualWriteDeleteEntireTitle(
  movieId: string | number,
  reason: string = 'Administrative Purge',
  adminUser: string = 'master-admin',
  titleHint?: string
): Promise<DualWriteResult> {
  if (!movieId) {
    return { success: false, error: 'movieId is required' };
  }

  try {
    const res = await deleteEntireTitleWithAudit(movieId, titleHint);
    await invalidateCatalogCache().catch(() => {});
    return {
      success: res.success,
      count: res.deletedCount,
      data: res.auditBackup,
    };
  } catch (err: any) {
    console.error('dualWriteDeleteEntireTitle error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Reassigns all links from an old/custom ID to a verified TMDB ID.
 */
export async function dualWriteReassignTitle(
  oldMovieId: string | number,
  newMovieId: string | number,
  newTitle?: string,
  adminUser: string = 'master-admin'
): Promise<DualWriteResult> {
  if (!oldMovieId || !newMovieId) {
    return { success: false, error: 'Both oldMovieId and newMovieId are required' };
  }

  try {
    const aliases = newTitle ? [newTitle] : [];
    const res = await reassignLinksInDatabase(oldMovieId, newMovieId, aliases);
    await invalidateCatalogCache().catch(() => {});
    return {
      success: res.success,
      count: res.reassignedCount,
      data: res,
    };
  } catch (err: any) {
    console.error('dualWriteReassignTitle error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Batch migrates a file host domain across all links in Supabase and Redis.
 */
export async function dualWriteMigrateDomain(
  oldDomain: string,
  newDomain: string,
  adminUser: string = 'master-admin',
  options: { dryRun?: boolean } = {}
): Promise<DualWriteResult<{ modifiedCount: number; dryRun: boolean }>> {
  if (!oldDomain || !newDomain) {
    return { success: false, error: 'Both oldDomain and newDomain are required' };
  }

  const cleanOld = oldDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const cleanNew = newDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');

  if (!cleanOld || !cleanNew) {
    return { success: false, error: 'Invalid domain formats' };
  }

  if (cleanOld === cleanNew) {
    return { success: false, error: 'Source and target domains are identical' };
  }

  try {
    const res = await migrateDomainInDatabase(cleanOld, cleanNew);
    if (!options.dryRun) {
      await invalidateCatalogCache().catch(() => {});
    }
    return {
      success: res.success,
      count: res.updatedCount,
      data: {
        modifiedCount: res.updatedCount,
        dryRun: Boolean(options.dryRun),
      },
    };
  } catch (err: any) {
    console.error('dualWriteMigrateDomain error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Updates metadata for a title in Supabase and Redis catalog summary.
 */
export async function dualWriteUpdateMetadata(
  movieId: string | number,
  updates: {
    title?: string;
    movieTitle?: string;
    posterPath?: string | null;
    backdropPath?: string | null;
    overview?: string | null;
    releaseDate?: string | null;
    voteAverage?: number | null;
    mediaType?: 'movie' | 'tv';
  },
  adminUser: string = 'master-admin'
): Promise<DualWriteResult> {
  if (!movieId) {
    return { success: false, error: 'movieId is required' };
  }

  try {
    const res = await updateTitleMetadata(movieId, {
      movieTitle: updates.movieTitle || updates.title,
      posterPath: updates.posterPath || undefined,
      backdropPath: updates.backdropPath || undefined,
      releaseDate: updates.releaseDate || undefined,
      overview: updates.overview || undefined,
      mediaType: updates.mediaType,
    });
    await invalidateCatalogCache().catch(() => {});
    return {
      success: res.success,
      data: res,
    };
  } catch (err: any) {
    console.error('dualWriteUpdateMetadata error:', err);
    return { success: false, error: err.message };
  }
}
