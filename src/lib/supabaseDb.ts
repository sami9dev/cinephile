import { getSupabaseAdminClient } from '@/lib/supabase';
import { CustomLink } from '@/types';
import { detectSeasonNumber, detectEpisodeNumber, isPackMedia } from './seasonParser';

const parseNumOrNull = (val: any): number | null => {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
};

// Map CustomLink from Cinephile application schema to Supabase snake_case row
export function mapLinkToSupabaseRow(movieId: string | number, link: CustomLink, metadata?: any) {
  const mId = String(movieId).trim();
  const nowIso = new Date().toISOString();
  const isTv = metadata?.mediaType === 'tv' || link.mediaType === 'tv' || /(?:s\d{1,2}(?:e\d{1,3})?|season\s*\d+)/i.test(link.title || '');
  const isPack = link.category === 'ZipPack' || link.linkType === 'zip_pack' || isPackMedia(link.title, link.url);

  let seasonNum = parseNumOrNull(link.seasonNumber);
  if (seasonNum === null && isTv) {
    const s = detectSeasonNumber({ title: link.title, url: link.url, seasonNumber: link.seasonNumber });
    if (s > 0) seasonNum = s;
  }

  let epNum = parseNumOrNull(link.episodeNumber);
  if (epNum === null && isTv && !isPack) {
    const ep = detectEpisodeNumber({ title: link.title, url: link.url, episodeNumber: link.episodeNumber });
    if (ep !== undefined) epNum = ep;
  }

  const effectiveLinkType = isTv ? (isPack ? 'zip_pack' : (epNum !== null ? 'single_episode' : (link.linkType || 'general'))) : (link.linkType || 'general');
  const effectiveCategory = isTv ? (isPack ? 'ZipPack' : (epNum !== null ? 'SingleEpisode' : (link.category || 'Download'))) : (link.category || 'Download');

  return {
    id: link.id,
    movie_id: mId,
    title: link.title,
    movie_title: metadata?.movieTitle || link.movieTitle || null,
    url: link.url,
    category: effectiveCategory,
    quality: link.quality || null,
    codec: link.codec || null,
    audio_language: link.audioLanguage || null,
    size: link.size || null,
    link_type: effectiveLinkType,
    season_number: seasonNum,
    episode_number: epNum,
    episode_title: link.episodeTitle || null,
    manual_title_verified: Boolean(link.manualTitleVerified),
    server_name: link.serverName || null,
    server_badge: link.serverBadge || null,
    media_type: isTv ? 'tv' : (metadata?.mediaType || link.mediaType || 'movie'),
    release_date: metadata?.releaseDate || link.releaseDate || null,
    poster_path: metadata?.posterPath || link.posterPath || null,
    backdrop_path: metadata?.backdropPath || link.backdropPath || null,
    overview: metadata?.overview || link.overview || null,
    vote_average: parseNumOrNull(metadata?.voteAverage) ?? parseNumOrNull(link.voteAverage),
    created_at: link.createdAt || nowIso,
    updated_at: nowIso,
  };
}

// Map Supabase snake_case row to Cinephile CustomLink with resilient self-healing
export function mapSupabaseRowToLink(row: any): CustomLink {
  const isTv = row.media_type === 'tv' || /(?:s\d{1,2}(?:e\d{1,3})?|season\s*\d+)/i.test(row.title || '');
  const isPack = row.category === 'ZipPack' || row.link_type === 'zip_pack' || isPackMedia(row.title, row.url);
  
  let seasonNumber = (row.season_number !== null && row.season_number !== undefined && Number.isFinite(Number(row.season_number))) ? Number(row.season_number) : undefined;
  if ((seasonNumber === undefined || seasonNumber <= 0) && isTv) {
    const s = detectSeasonNumber({ title: row.title, url: row.url });
    if (s > 0) seasonNumber = s;
  }

  let episodeNumber = (row.episode_number !== null && row.episode_number !== undefined && Number.isFinite(Number(row.episode_number))) ? Number(row.episode_number) : undefined;
  if (episodeNumber === undefined && isTv && !isPack) {
    episodeNumber = detectEpisodeNumber({ title: row.title, url: row.url });
  }

  let linkType = row.link_type || 'general';
  if (isTv) {
    linkType = isPack ? 'zip_pack' : (episodeNumber !== undefined ? 'single_episode' : linkType);
  }

  let category = row.category || 'Download';
  if (isTv) {
    if (isPack) category = 'ZipPack';
    else if (episodeNumber !== undefined) category = 'SingleEpisode';
  }

  return {
    id: row.id,
    movieId: row.movie_id,
    title: row.title,
    movieTitle: row.movie_title || undefined,
    url: row.url,
    category,
    quality: row.quality || undefined,
    codec: row.codec || undefined,
    audioLanguage: row.audio_language || undefined,
    size: row.size || undefined,
    linkType,
    seasonNumber,
    episodeNumber,
    episodeTitle: row.episode_title || undefined,
    manualTitleVerified: row.manual_title_verified || false,
    serverName: row.server_name || undefined,
    serverBadge: row.server_badge || undefined,
    mediaType: isTv ? 'tv' : (row.media_type || 'movie'),
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
