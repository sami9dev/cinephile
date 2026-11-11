import fs from 'fs';
import path from 'path';
import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
envText.split('\n').forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
});

const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const missingIds = ['1400837', '303044', '1368337', '617505'];

async function syncMissingToSupabase() {
  console.log('--- Syncing missing titles from Redis Hash to Supabase ---');

  for (const mid of missingIds) {
    const raw = await redis.hget('cinefuel:curated_links', mid);
    const links = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(links) || links.length === 0) {
      console.log(`No links found for ${mid}`);
      continue;
    }

    console.log(`Processing ${mid} (${links[0].movieTitle || links[0].title}) with ${links.length} links...`);

    const rowsToInsert = links.map((l, index) => ({
      id: l.id || `tg-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      movie_id: String(mid),
      movie_title: l.movieTitle || l.title,
      title: l.title || l.movieTitle,
      url: l.url,
      quality: l.quality || '1080p FHD',
      codec: l.codec || null,
      audio_language: l.audioLanguage || 'Hindi + English',
      size: l.size || null,
      link_type: l.linkType || (l.mediaType === 'tv' ? 'single_episode' : 'general'),
      season_number: l.seasonNumber || null,
      episode_number: l.episodeNumber || null,
      episode_title: l.episodeTitle || null,
      manual_title_verified: false,
      server_name: l.serverName || 'Hubdrive',
      server_badge: l.serverBadge || '🔗 Server: Hubdrive',
      media_type: l.mediaType || 'movie',
      release_date: l.releaseDate || null,
      poster_path: l.posterPath || null,
      backdrop_path: l.backdropPath || null,
      overview: l.overview || null,
      vote_average: typeof l.voteAverage === 'number' ? l.voteAverage : 7.0,
      created_at: l.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    // Upsert into Supabase
    const { error } = await sb.from('links').upsert(rowsToInsert, { onConflict: 'movie_id,url' });
    if (error) {
      console.error(`Failed to insert ${mid} into Supabase:`, error);
    } else {
      console.log(`✓ Successfully inserted ${rowsToInsert.length} links for ${mid} into Supabase!`);
    }
  }
}

syncMissingToSupabase();
