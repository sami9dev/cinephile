import { getSupabaseAdminClient } from '@/lib/supabase';
import { CustomLink } from '@/types';

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
 */
export async function getLinksFromSupabase(movieId: string | number): Promise<CustomLink[] | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const mId = String(movieId).trim();
  const { data, error } = await supabase
    .from('links')
    .select('*')
    .eq('movie_id', mId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase getLinksFromSupabase error:', error.message);
    return null;
  }

  return (data || []).map(mapSupabaseRowToLink);
}

/**
 * Save or update a single link in Supabase.
 */
export async function saveLinkToSupabase(movieId: string | number, link: CustomLink, metadata?: any): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const row = mapLinkToSupabaseRow(movieId, link, metadata);
  const { error } = await supabase
    .from('links')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    console.error('Supabase saveLinkToSupabase error:', error.message);
    throw new Error(`Supabase write error: ${error.message}`);
  }

  return true;
}

/**
 * Bulk insert or upsert links into Supabase.
 */
export async function saveMultipleLinksToSupabase(
  movieId: string | number,
  links: CustomLink[],
  metadata?: any
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const rows = links.map((l) => mapLinkToSupabaseRow(movieId, l, metadata));
  const { error } = await supabase
    .from('links')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('Supabase saveMultipleLinksToSupabase error:', error.message);
    throw new Error(`Supabase bulk write error: ${error.message}`);
  }

  return true;
}

/**
 * Atomically replace all links for a title in Supabase.
 */
export async function replaceAllLinksForTitleInSupabase(
  movieId: string | number,
  links: CustomLink[],
  metadata?: any
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const mId = String(movieId).trim();

  // 1. Delete existing links for this movie_id
  const { error: delError } = await supabase
    .from('links')
    .delete()
    .eq('movie_id', mId);

  if (delError) {
    console.error('Supabase delete error in replaceAllLinksForTitleInSupabase:', delError.message);
    throw new Error(`Supabase replace delete failed: ${delError.message}`);
  }

  // 2. Insert new links if any
  if (links.length > 0) {
    const rows = links.map((l) => mapLinkToSupabaseRow(mId, l, metadata));
    const { error: insError } = await supabase
      .from('links')
      .insert(rows);

    if (insError) {
      console.error('Supabase insert error in replaceAllLinksForTitleInSupabase:', insError.message);
      throw new Error(`Supabase replace insert failed: ${insError.message}`);
    }
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
