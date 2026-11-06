import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Read .env.local
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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
const redisUrl = env.UPSTASH_REDIS_REST_URL;
const redisToken = env.UPSTASH_REDIS_REST_TOKEN;

console.log('--- SUPABASE AUDIT & SYNC START ---');
console.log('Supabase URL:', supabaseUrl);
console.log('Service Key configured:', !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Supabase credentials missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  // 1. Audit tables
  const tables = [
    'links',
    'user_requests',
    'defective_reports',
    'notifications',
    'users',
    'telegram_links',
    'telegram_linking_tokens',
    'notification_deliveries',
    'audit_reassignments',
    'audit_title_deletions',
    'app_settings'
  ];

  console.log('\n[1/4] Checking Supabase Tables Availability...');
  for (const table of tables) {
    try {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`  ⚠ Table '${table}': ${error.message} (Code: ${error.code})`);
      } else {
        console.log(`  ✓ Table '${table}': ONLINE (${count ?? 0} rows)`);
      }
    } catch (e) {
      console.log(`  ✗ Table '${table}' failed:`, e.message);
    }
  }

  // 2. Inspect links in Supabase with pagination
  console.log('\n[2/4] Inspecting existing links in Supabase...');
  const sbLinkIds = new Set();
  const sbMovieUrlKeys = new Set();
  const sbTitles = new Set();
  let from = 0;
  const pageSize = 1000;
  let totalSbLinks = 0;

  while (true) {
    const { data, error: pageErr } = await supabase
      .from('links')
      .select('id, movie_id, url')
      .range(from, from + pageSize - 1);

    if (pageErr) {
      console.error('Error fetching links page:', pageErr.message);
      break;
    }
    if (!data || data.length === 0) break;

    totalSbLinks += data.length;
    for (const r of data) {
      sbLinkIds.add(r.id);
      sbMovieUrlKeys.add(`${r.movie_id}::${r.url}`);
      sbTitles.add(String(r.movie_id));
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`  Total rows in Supabase 'links': ${totalSbLinks}`);
  console.log(`  Distinct movie_ids in Supabase: ${sbTitles.size}`);

  // 3. Inspect Redis & local serverLinks.json
  console.log('\n[3/4] Inspecting Upstash Redis & local serverLinks.json...');
  let redisLinksMap = {};
  if (redisUrl && redisToken) {
    try {
      const res = await fetch(`${redisUrl}/hgetall/cinefuel:curated_links`, {
        headers: { Authorization: `Bearer ${redisToken}` }
      });
      const data = await res.json();
      if (data && data.result) {
        if (Array.isArray(data.result)) {
          for (let i = 0; i < data.result.length; i += 2) {
            const k = data.result[i];
            const v = typeof data.result[i + 1] === 'string' ? JSON.parse(data.result[i + 1]) : data.result[i + 1];
            redisLinksMap[k] = v;
          }
        } else if (typeof data.result === 'object') {
          for (const [k, v] of Object.entries(data.result)) {
            redisLinksMap[k] = typeof v === 'string' ? JSON.parse(v) : v;
          }
        }
      }
      console.log(`  Upstash Redis 'cinefuel:curated_links': ${Object.keys(redisLinksMap).length} titles`);
    } catch (err) {
      console.error('  Failed to read Redis:', err.message);
    }
  }

  const localPath = path.resolve(process.cwd(), 'src/data/serverLinks.json');
  let localLinksMap = {};
  if (fs.existsSync(localPath)) {
    try {
      localLinksMap = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      console.log(`  Local serverLinks.json: ${Object.keys(localLinksMap).length} titles`);
    } catch (e) {
      console.error('  Failed to parse serverLinks.json:', e.message);
    }
  }

  // Merge Redis and Local
  const mergedSourceTitles = new Map();
  for (const [mid, list] of Object.entries(localLinksMap)) {
    if (Array.isArray(list)) mergedSourceTitles.set(String(mid), list);
  }
  for (const [mid, list] of Object.entries(redisLinksMap)) {
    if (Array.isArray(list)) mergedSourceTitles.set(String(mid), list);
  }
  console.log(`  Combined Redis + Local Unique Titles: ${mergedSourceTitles.size}`);

  // Find missing or un-synced links
  const missingRows = [];
  const candidateUrlKeys = new Set(sbMovieUrlKeys);

  for (const [movieId, links] of mergedSourceTitles.entries()) {
    for (const link of links) {
      if (!link.url) continue;
      const key = `${movieId}::${link.url}`;
      if (candidateUrlKeys.has(key)) continue;
      candidateUrlKeys.add(key);

      const linkId = link.id || `${movieId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      if (sbLinkIds.has(linkId)) continue;

      const nowIso = new Date().toISOString();
      missingRows.push({
        id: linkId,
        movie_id: String(movieId),
        title: link.title || 'Untitled Stream',
        movie_title: link.movieTitle || null,
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
        media_type: link.mediaType || 'movie',
        release_date: link.releaseDate || null,
        poster_path: link.posterPath || null,
        backdrop_path: link.backdropPath || null,
        overview: link.overview || null,
        vote_average: link.voteAverage !== undefined ? Number(link.voteAverage) : null,
        created_at: link.createdAt || nowIso,
        updated_at: nowIso,
      });
    }
  }

  console.log(`\n[4/4] Synchronization to Supabase...`);
  console.log(`  Unsynced unique links identified: ${missingRows.length}`);

  if (missingRows.length > 0) {
    console.log(`  Syncing ${missingRows.length} links to Supabase in batches of 50...`);
    const batchSize = 50;
    let synced = 0;
    for (let i = 0; i < missingRows.length; i += batchSize) {
      const batch = missingRows.slice(i, i + batchSize);
      const { error: upsertErr } = await supabase.from('links').upsert(batch, { onConflict: 'id' });
      if (upsertErr) {
        console.error(`  Batch ${i}-${i + batch.length} error:`, upsertErr.message);
      } else {
        synced += batch.length;
        console.log(`  Upserted ${synced}/${missingRows.length} links...`);
      }
    }
    console.log(`  ✓ Successfully synced ${synced} missing links to Supabase!`);
  } else {
    console.log('  ✓ Supabase is already 100% complete and synchronized with all Redis and local links!');
  }

  // Count final total
  const { count: finalCount } = await supabase.from('links').select('*', { count: 'exact', head: true });
  console.log(`\nFinal Supabase Status:`);
  console.log(`  Total Links: ${finalCount}`);
  console.log(`  Distinct Titles: ${sbTitles.size}`);
}

main().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
