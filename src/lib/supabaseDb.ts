import { getSupabaseAdminClient } from './supabase.ts';
import type { CustomLink } from '../types';

// Map CustomLink from Cinephile application schema to Supabase snake_case row
export function mapLinkToSupabaseRow(movieId: string | number, link: CustomLink, metadata?: any) {
  const mId = String(movieId).trim();
  const nowIso = new Date().toISOString();
  return {
    id: link.id,
    movie_id: mId,
    title: link.title,
    movie_title: metadata?.movieTitle || link.movieTitle || null,
    url: link.url,
    category: link.category || 'Download',
    quality: link.quality || null,
    codec: link.codec || null,
    audio_language: link.audioLanguage || null,
    size: link.size || null,
    link_type: link.linkType || 'general',
    season_number: link.seasonNumber !== undefined ? Number(link.seasonNumber) : null,
    episode_number: link.episodeNumber !== undefined ? Number(link.episodeNumber) : null,
    episode_title: link.episodeTitle || null,
    manual_title_verified: Boolean(link.manualTitleVerified),
    server_name: link.serverName || null,
    server_badge: link.serverBadge || null,
    media_type: metadata?.mediaType || link.mediaType || 'movie',
    release_date: metadata?.releaseDate || link.releaseDate || null,
    poster_path: metadata?.posterPath || link.posterPath || null,
    backdrop_path: metadata?.backdropPath || link.backdropPath || null,
    overview: metadata?.overview || link.overview || null,
    vote_average: metadata?.voteAverage !== undefined ? Number(metadata.voteAverage) : (link.voteAverage !== undefined ? Number(link.voteAverage) : null),
    created_at: link.createdAt || nowIso,
    updated_at: nowIso,
  };
}

// Map Supabase snake_case row to Cinephile CustomLink
export function mapSupabaseRowToLink(row: any): CustomLink {
  return {
    id: row.id,
    movieId: row.movie_id,
    title: row.title,
    movieTitle: row.movie_title || undefined,
    url: row.url,
    category: row.category || 'Download',
    quality: row.quality || undefined,
    codec: row.codec || undefined,
    audioLanguage: row.audio_language || undefined,
    size: row.size || undefined,
    linkType: row.link_type || 'general',
    seasonNumber: row.season_number !== null ? Number(row.season_number) : undefined,
    episodeNumber: row.episode_number !== null ? Number(row.episode_number) : undefined,
    episodeTitle: row.episode_title || undefined,
    manualTitleVerified: row.manual_title_verified || false,
    serverName: row.server_name || undefined,
    serverBadge: row.server_badge || undefined,
    mediaType: row.media_type || 'movie',
    releaseDate: row.release_date || undefined,
    posterPath: row.poster_path || undefined,
    backdropPath: row.backdrop_path || undefined,
    overview: row.overview || undefined,
    voteAverage: row.vote_average !== null ? Number(row.vote_average) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetch links for a specific title from Supabase.
 * Supports filtering by mediaType ('movie' | 'tv') to prevent ID collision across namespaces.
 */
export async function getLinksFromSupabase(
  movieId: string | number,
  mediaType?: 'movie' | 'tv'
): Promise<CustomLink[] | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const mId = String(movieId).trim();
  let query = supabase
    .from('links')
    .select('*')
    .eq('movie_id', mId);

  if (mediaType) {
    query = query.eq('media_type', mediaType);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase getLinksFromSupabase error:', error.message);
    return null;
  }

  return (data || []).map(mapSupabaseRowToLink);
}

/**
 * Save or update a single link in Supabase.
 * Conflicts on (movie_id, url) to prevent duplicate links for the same title.
 */
export async function saveLinkToSupabase(movieId: string | number, link: CustomLink, metadata?: any): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const row = mapLinkToSupabaseRow(movieId, link, metadata);
  const { data, error } = await supabase
    .from('links')
    .upsert(row, { onConflict: 'movie_id,url' })
    .select('id');

  if (error) {
    console.error('Supabase saveLinkToSupabase error:', error.message);
    throw new Error(`Supabase write error: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('Supabase write error: 0 rows affected (RLS policy may be blocking write)');
  }

  return true;
}

/**
 * Bulk insert or upsert links into Supabase.
 * Conflicts on (movie_id, url) to prevent duplicate links for the same title.
 */
export async function saveMultipleLinksToSupabase(
  movieId: string | number,
  links: CustomLink[],
  metadata?: any
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const rows = links.map((l) => mapLinkToSupabaseRow(movieId, l, metadata));
  const { data, error } = await supabase
    .from('links')
    .upsert(rows, { onConflict: 'movie_id,url' })
    .select('id');

  if (error) {
    console.error('Supabase saveMultipleLinksToSupabase error:', error.message);
    throw new Error(`Supabase bulk write error: ${error.message}`);
  }

  return true;
}

/**
 * Atomically replace all links for a title in Supabase via Postgres RPC.
 */
export async function replaceAllLinksForTitleInSupabase(
  movieId: string | number,
  links: CustomLink[],
  metadata?: any
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const mId = String(movieId).trim();
  const rows = links.map((l) => mapLinkToSupabaseRow(mId, l, metadata));

  const { error: rpcError } = await supabase.rpc('replace_title_links', {
    p_movie_id: mId,
    p_links: rows,
  });

  if (rpcError) {
    console.error('Supabase replace_title_links RPC error:', rpcError.message);
    throw new Error(`Atomic title replacement failed: ${rpcError.message}`);
  }

  return true;
}

/**
 * Idempotency check for Telegram updates. Returns true if update is new, false if already processed.
 */
export async function recordTelegramUpdateId(updateId: number, chatId?: number): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !updateId) return true;

  const { error } = await supabase
    .from('processed_updates')
    .insert({ update_id: updateId, chat_id: chatId || null });

  if (error) {
    if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
      return false; // Duplicate update
    }
    console.warn('processed_updates check warning:', error.message);
  }
  return true;
}

/**
 * Delete a specific link from Supabase.
 */
export async function deleteLinkFromSupabase(movieId: string | number, linkId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('links')
    .delete()
    .eq('id', linkId);

  if (error) {
    console.error('Supabase deleteLinkFromSupabase error:', error.message);
    return false;
  }

  return true;
}

/**
 * Reassign selected links in Supabase from source to destination.
 */
export async function reassignLinksInSupabase(
  sourceMovieId: string | number,
  targetMovieId: string | number,
  linkIds: string[],
  newMetadata?: any
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const targetId = String(targetMovieId).trim();
  const updatePayload: Record<string, any> = {
    movie_id: targetId,
    updated_at: new Date().toISOString(),
  };

  if (newMetadata?.movieTitle) updatePayload.movie_title = newMetadata.movieTitle;
  if (newMetadata?.posterPath) updatePayload.poster_path = newMetadata.posterPath;
  if (newMetadata?.backdropPath) updatePayload.backdrop_path = newMetadata.backdropPath;
  if (newMetadata?.mediaType) updatePayload.media_type = newMetadata.mediaType;
  if (newMetadata?.releaseDate) updatePayload.release_date = newMetadata.releaseDate;
  if (newMetadata?.voteAverage !== undefined) updatePayload.vote_average = newMetadata.voteAverage;

  const { error } = await supabase
    .from('links')
    .update(updatePayload)
    .in('id', linkIds);

  if (error) {
    console.error('Supabase reassignLinksInSupabase error:', error.message);
    throw new Error(`Supabase reassign error: ${error.message}`);
  }

  return true;
}

/**
 * Update title metadata in Supabase.
 */
export async function updateTitleMetadataInSupabase(
  sourceMovieId: string | number,
  updates: {
    newMovieId?: string | number;
    movieTitle?: string;
    releaseDate?: string;
    mediaType?: 'movie' | 'tv';
    posterPath?: string;
    backdropPath?: string;
    overview?: string;
  }
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const oldId = String(sourceMovieId).trim();
  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.newMovieId) updatePayload.movie_id = String(updates.newMovieId).trim();
  if (updates.movieTitle) updatePayload.movie_title = updates.movieTitle;
  if (updates.releaseDate) updatePayload.release_date = updates.releaseDate;
  if (updates.mediaType) updatePayload.media_type = updates.mediaType;
  if (updates.posterPath !== undefined) updatePayload.poster_path = updates.posterPath;
  if (updates.backdropPath !== undefined) updatePayload.backdrop_path = updates.backdropPath;
  if (updates.overview !== undefined) updatePayload.overview = updates.overview;

  const { error } = await supabase
    .from('links')
    .update(updatePayload)
    .eq('movie_id', oldId);

  if (error) {
    console.error('Supabase updateTitleMetadataInSupabase error:', error.message);
    throw new Error(`Supabase metadata update error: ${error.message}`);
  }

  return true;
}
