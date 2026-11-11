import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach((l) => {
  const trimmed = l.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx > 0) env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function fixAllPlaceholders() {
  console.log('=== FIXING ALL PLACEHOLDER TITLES IN DATABASE ===\n');

  // 1. Fix "resolved_link" (Panchayat S03E04)
  console.log('[1/4] Reassigning "resolved_link" to Panchayat (TMDB TV: 101352)...');
  const { data: resolvedRows } = await supabase.from('links').select('*').eq('movie_id', 'resolved_link');
  console.log(`Found ${resolvedRows?.length || 0} links under "resolved_link".`);

  if (resolvedRows && resolvedRows.length > 0) {
    for (const r of resolvedRows) {
      // Try to fetch real title from landing page
      let realTitle = 'Panchayat S03E04 1080p AMZN WEB-DL';
      try {
        const res = await fetch(r.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          redirect: 'follow'
        });
        const html = await res.text();
        const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (m && m[1] && !m[1].includes('loading')) {
          realTitle = m[1].trim();
        }
      } catch {}

      // Quality detection
      let quality = '1080p FHD • WEB-DL';
      if (realTitle.includes('2160p') || realTitle.includes('4K')) quality = '2160p 4K • WEB-DL';
      else if (realTitle.includes('720p')) quality = '720p HD • WEB-DL';

      // Check if duplicate on 101352 to respect uq_links_movie_url
      const { data: existing } = await supabase.from('links').select('id').eq('movie_id', '101352').eq('url', r.url);
      if (existing && existing.length > 0) {
        console.log(`  Deleting duplicate link ${r.id}...`);
        await supabase.from('links').delete().eq('id', r.id);
      } else {
        const { error: updErr } = await supabase.from('links').update({
          movie_id: '101352',
          movie_title: 'Panchayat',
          title: realTitle,
          poster_path: '/8ivTX5q2otqXvH815BcOhxVkTPW.jpg',
          backdrop_path: '/iZ8EtGAqKWZdRJPzWfFseNfVxjh.jpg',
          media_type: 'tv',
          season_number: 3,
          episode_number: 4,
          release_date: '2024-05-28',
          vote_average: 8.8,
          quality: quality,
          category: 'SingleEpisode',
          updated_at: new Date().toISOString()
        }).eq('id', r.id);

        if (updErr) console.error(`  Error updating ${r.id}:`, updErr.message);
        else console.log(`  ✓ Updated ${r.id} -> Panchayat S03E04: "${realTitle}"`);
      }
    }
  }

  // 2. Fix The Rig (112581)
  console.log('\n[2/4] Updating The Rig (112581) with official poster...');
  const { error: rigErr } = await supabase.from('links').update({
    movie_title: 'The Rig',
    poster_path: '/o8KxvfdpSVCP53d4S6a4DPHOqNh.jpg',
    backdrop_path: '/o8KxvfdpSVCP53d4S6a4DPHOqNh.jpg',
    media_type: 'tv',
    release_date: '2023-01-06',
    vote_average: 7.8,
    updated_at: new Date().toISOString()
  }).eq('movie_id', '112581');
  if (rigErr) console.error('  The Rig update error:', rigErr.message);
  else console.log('  ✓ Successfully updated all The Rig links with official poster');

  // 3. Fix Wonder Woman (297762)
  console.log('\n[3/4] Updating Wonder Woman (297762) with official poster...');
  const { error: wwErr } = await supabase.from('links').update({
    movie_title: 'Wonder Woman',
    poster_path: '/imekS7f1OuHyUP2LAiTEM0zBzUz.jpg',
    backdrop_path: '/hA5oCgvgCxj5Vvgfmkg5qpW25fr.jpg',
    media_type: 'movie',
    release_date: '2017-05-30',
    vote_average: 7.2,
    updated_at: new Date().toISOString()
  }).eq('movie_id', '297762');
  if (wwErr) console.error('  Wonder Woman update error:', wwErr.message);
  else console.log('  ✓ Successfully updated all Wonder Woman links with official poster');

  // 4. Fix The Trap (283371)
  console.log('\n[4/4] Updating The Trap (283371) with official poster...');
  const { error: trapErr } = await supabase.from('links').update({
    movie_title: 'The Trap',
    poster_path: 'https://m.media-amazon.com/images/M/MV5BMjYwOTg1OTQtNmY4Yi00ZjdlLWFjYTgtOTFlM2Q1ZmNlYmI1XkEyXkFqcGc@._V1_.jpg',
    backdrop_path: 'https://m.media-amazon.com/images/M/MV5BMjYwOTg1OTQtNmY4Yi00ZjdlLWFjYTgtOTFlM2Q1ZmNlYmI1XkEyXkFqcGc@._V1_.jpg',
    media_type: 'tv',
    release_date: '2019-02-09',
    vote_average: 7.8,
    updated_at: new Date().toISOString()
  }).eq('movie_id', '283371');
  if (trapErr) console.error('  The Trap update error:', trapErr.message);
  else console.log('  ✓ Successfully updated all The Trap links with official poster');

  // 5. Invalidate Upstash Redis cache and delete resolved_link key if present
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    console.log('\n[5/5] Synchronizing Upstash Redis & invalidating caches...');
    await fetch(`${env.UPSTASH_REDIS_REST_URL}/hdel/cinefuel:curated_links/resolved_link`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }
    });

    // Invalidate version counters
    await fetch(`${env.UPSTASH_REDIS_REST_URL}/incr/cinefuel:staging:catalog:version`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    await fetch(`${env.UPSTASH_REDIS_REST_URL}/incr/cinefuel:production:catalog:version`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    console.log('  ✓ Invalidated Redis catalog caches');
  }

  console.log('\n=== ALL PLACEHOLDER TITLES RESOLVED & SYNCHRONIZED ===');
}

fixAllPlaceholders().catch(console.error);
