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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const redisUrl = env.UPSTASH_REDIS_REST_URL;
const redisToken = env.UPSTASH_REDIS_REST_TOKEN;

async function run() {
  console.log('================================================================');
  console.log('       CINEPHILE PUBLIC SITE & DATABASE DEEP AUDIT');
  console.log('================================================================\n');

  // 1. Audit Supabase links table
  console.log('[1/5] Auditing all links in Supabase table...');
  const titleMap = new Map(); // movieId -> { id, title, type, poster, backdrop, links: [], qualities: Set, sources: Set, brokenUrls: [] }
  let from = 0;
  const pageSize = 1000;
  let totalLinks = 0;
  let invalidUrlsCount = 0;

  while (true) {
    const { data, error } = await supabase
      .from('links')
      .select('id, movie_id, movie_title, title, quality, media_type, url, poster_path, backdrop_path, season_number, episode_number, created_at')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Error querying links:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    totalLinks += data.length;

    for (const row of data) {
      const mid = String(row.movie_id || '').trim();
      if (!mid) continue;

      if (!titleMap.has(mid)) {
        titleMap.set(mid, {
          id: mid,
          title: row.movie_title || row.title || 'Untitled',
          type: row.media_type || 'movie',
          poster: row.poster_path || null,
          backdrop: row.backdrop_path || null,
          linkCount: 0,
          qualities: new Set(),
          sampleUrl: row.url,
          brokenUrls: [],
          hasSeasons: false,
          seasons: new Set(),
          episodes: new Set(),
          latestCreatedAt: row.created_at,
        });
      }

      const entry = titleMap.get(mid);
      entry.linkCount++;
      if (row.quality) entry.qualities.add(row.quality);
      if (row.poster_path && !entry.poster) entry.poster = row.poster_path;
      if (row.backdrop_path && !entry.backdrop) entry.backdrop = row.backdrop_path;
      if (row.movie_title && entry.title === 'Untitled') entry.title = row.movie_title;

      if (row.season_number !== null && row.season_number !== undefined) {
        entry.hasSeasons = true;
        entry.seasons.add(row.season_number);
      }
      if (row.episode_number !== null && row.episode_number !== undefined) {
        entry.episodes.add(row.episode_number);
      }

      // Check URL validity
      const url = String(row.url || '').trim();
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        entry.brokenUrls.push({ id: row.id, url });
        invalidUrlsCount++;
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`✓ Total link rows analyzed: ${totalLinks}`);
  console.log(`✓ Total unique titles with active links: ${titleMap.size}`);
  console.log(`✓ Invalid/malformed URLs: ${invalidUrlsCount}`);

  // 2. Check for missing posters or suspicious titles
  console.log('\n[2/5] Checking for missing metadata, posters, or suspicious names...');
  let missingPosters = [];
  let suspiciousTitles = [];

  for (const [mid, t] of titleMap.entries()) {
    if (!t.poster || t.poster === 'null' || t.poster === 'undefined') {
      missingPosters.push({ id: mid, title: t.title, links: t.linkCount });
    }
    const lower = t.title.toLowerCase();
    if (
      lower.includes('placeholder') ||
      lower.includes('mirror') ||
      lower.startsWith('untitled') ||
      lower.startsWith('cloud resolved')
    ) {
      suspiciousTitles.push({ id: mid, title: t.title, links: t.linkCount });
    }
  }

  console.log(`  -> Titles missing poster_path: ${missingPosters.length}`);
  if (missingPosters.length > 0) {
    missingPosters.slice(0, 5).forEach((m) => console.log(`     - [${m.id}] "${m.title}" (${m.links} links)`));
  }
  console.log(`  -> Suspicious title names: ${suspiciousTitles.length}`);
  if (suspiciousTitles.length > 0) {
    suspiciousTitles.forEach((s) => console.log(`     - [${s.id}] "${s.title}" (${s.links} links)`));
  }

  // 3. Check Upstash Redis state
  console.log('\n[3/5] Inspecting Upstash Redis cache coverage...');
  let redisHashCount = 0;
  if (redisUrl && redisToken) {
    try {
      const res = await fetch(`${redisUrl}/hlen/cinefuel:curated_links`, {
        headers: { Authorization: `Bearer ${redisToken}` }
      });
      const data = await res.json();
      redisHashCount = data.result || 0;
      console.log(`  -> Upstash Redis hash 'cinefuel:curated_links' length: ${redisHashCount} titles`);
    } catch (e) {
      console.log(`  -> Redis read failed:`, e.message);
    }
  }

  // 4. Test public Cloudflare worker & Render API catalog
  console.log('\n[4/5] Testing Public Site APIs...');
  const publicHosts = [
    { name: 'Cloudflare Worker', url: 'https://cinephile.sk6216071.workers.dev' },
    { name: 'Render Production', url: 'https://cinephile-web.onrender.com' },
  ];

  for (const host of publicHosts) {
    try {
      const catRes = await fetch(`${host.url}/api/catalog?limit=50&page=1`);
      if (catRes.ok) {
        const catData = await catRes.json();
        console.log(`  [${host.name}] /api/catalog: Total titles in catalog API: ${catData.total} (Source: ${catData.source || 'db'})`);
      } else {
        console.log(`  [${host.name}] /api/catalog HTTP ${catRes.status}`);
      }
    } catch (err) {
      console.log(`  [${host.name}] failed to reach:`, err.message);
    }
  }

  // 5. Sample test 10 random titles against public curated-links API
  console.log('\n[5/5] Sample Testing Individual Title Links on Public Site...');
  const sampleMids = Array.from(titleMap.keys()).slice(0, 10);
  for (const mid of sampleMids) {
    const t = titleMap.get(mid);
    try {
      const cfRes = await fetch(`https://cinephile.sk6216071.workers.dev/api/curated-links?movieId=${mid}`);
      if (cfRes.ok) {
        const linksData = await cfRes.json();
        const count = linksData.links?.length || 0;
        console.log(`  -> [${t.type.toUpperCase()}] ${t.title} (ID: ${mid}): ${count} links returned on public API (expected ~${t.linkCount})`);
      } else {
        console.log(`  -> [${t.type.toUpperCase()}] ${t.title} (ID: ${mid}): HTTP ${cfRes.status}`);
      }
    } catch (e) {
      console.log(`  -> [${t.type.toUpperCase()}] ${t.title} (ID: ${mid}) check failed:`, e.message);
    }
  }

  console.log('\n================================================================');
  console.log('                     AUDIT COMPLETE');
  console.log('================================================================');
}

run().catch(console.error);
