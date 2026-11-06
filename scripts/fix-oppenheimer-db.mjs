import fs from 'fs';
import path from 'path';
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

const OPPENHEIMER_META = {
  movieId: '872585',
  movieTitle: 'Oppenheimer',
  posterPath: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
  backdropPath: '/neeNHeXjMF5fXoCJRsOmkNGC7q.jpg',
  releaseDate: '2023-07-21',
  voteAverage: 8.1,
  mediaType: 'movie'
};

async function fixOppenheimerData() {
  console.log('--- 1. Inspecting links under "tt15398776" and "1" in Supabase ---');
  const { data: rows1 } = await supabase.from('links').select('*').in('movie_id', ['1', 'tt15398776']);
  console.log(`Found ${rows1?.length || 0} links under "1" or "tt15398776":`);

  const oppenheimerLinksToReassign = [];
  const junkLinkIds = [];

  for (const r of rows1 || []) {
    console.log(`  - [ID: ${r.id}] movie_id: ${r.movie_id} | title: ${r.title} | url: ${r.url}`);
    if (r.title && r.title.toLowerCase().includes('oppenheimer')) {
      oppenheimerLinksToReassign.push(r);
    } else {
      junkLinkIds.push(r.id);
    }
  }

  // 2. Reassign valid Oppenheimer links to 872585
  if (oppenheimerLinksToReassign.length > 0) {
    console.log(`\n--- 2. Reassigning ${oppenheimerLinksToReassign.length} Oppenheimer links to TMDB ID 872585 ---`);
    for (const r of oppenheimerLinksToReassign) {
      // Check if a link with same (movie_id, url) already exists on 872585 to respect uq_links_movie_url
      const { data: existing } = await supabase.from('links').select('id').eq('movie_id', '872585').eq('url', r.url);
      if (existing && existing.length > 0) {
        console.log(`  Link with URL ${r.url} already exists under 872585 (ID: ${existing[0].id}). Deleting duplicate ${r.id}...`);
        await supabase.from('links').delete().eq('id', r.id);
      } else {
        console.log(`  Updating link ${r.id} -> movie_id: 872585 with official poster...`);
        const { error: updErr } = await supabase.from('links').update({
          movie_id: '872585',
          movie_title: OPPENHEIMER_META.movieTitle,
          poster_path: OPPENHEIMER_META.posterPath,
          backdrop_path: OPPENHEIMER_META.backdropPath,
          release_date: OPPENHEIMER_META.releaseDate,
          vote_average: OPPENHEIMER_META.voteAverage,
          media_type: 'movie',
          updated_at: new Date().toISOString()
        }).eq('id', r.id);
        if (updErr) {
          console.error(`  Failed to update ${r.id}:`, updErr.message);
        } else {
          console.log(`  ✓ Updated ${r.id}`);
        }
      }
    }
  }

  // 3. Delete any junk links (e.g. "IMDb:")
  if (junkLinkIds.length > 0) {
    console.log(`\n--- 3. Deleting ${junkLinkIds.length} junk links ---`);
    const { error: delErr } = await supabase.from('links').delete().in('id', junkLinkIds);
    if (delErr) console.error('  Failed to delete junk:', delErr.message);
    else console.log(`  ✓ Deleted junk links:`, junkLinkIds);
  }

  // 4. Update all existing links under 872585 to have the official poster if missing
  console.log('\n--- 4. Ensuring all 872585 rows have the official poster ---');
  const { data: current872585 } = await supabase.from('links').select('*').eq('movie_id', '872585');
  console.log(`Current 872585 link count: ${current872585?.length}`);
  const { error: fixPostersErr } = await supabase.from('links').update({
    movie_title: OPPENHEIMER_META.movieTitle,
    poster_path: OPPENHEIMER_META.posterPath,
    backdrop_path: OPPENHEIMER_META.backdropPath,
    release_date: OPPENHEIMER_META.releaseDate,
    vote_average: OPPENHEIMER_META.voteAverage,
    media_type: 'movie',
    updated_at: new Date().toISOString()
  }).eq('movie_id', '872585');
  if (fixPostersErr) console.error('  Error updating posters:', fixPostersErr.message);
  else console.log('  ✓ Updated all 872585 links with official poster metadata');

  // 5. Clean up Upstash Redis
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    console.log('\n--- 5. Synchronizing Upstash Redis ---');
    // Delete keys '1' and 'tt15398776' from hash
    const delRes1 = await fetch(`${env.UPSTASH_REDIS_REST_URL}/hdel/cinefuel:curated_links/1`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    console.log('  Deleted "1" from Redis:', await delRes1.json());

    const delRestt = await fetch(`${env.UPSTASH_REDIS_REST_URL}/hdel/cinefuel:curated_links/tt15398776`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    console.log('  Deleted "tt15398776" from Redis:', await delRestt.json());

    // Update 872585 in Redis with latest links from Supabase
    const { data: updated872585 } = await supabase.from('links').select('*').eq('movie_id', '872585');
    const redisLinks = (updated872585 || []).map(r => ({
      id: r.id,
      movieId: '872585',
      title: r.title,
      movieTitle: r.movie_title || 'Oppenheimer',
      url: r.url,
      category: r.category || 'Download',
      quality: r.quality,
      codec: r.codec,
      audioLanguage: r.audio_language,
      size: r.size,
      mediaType: 'movie',
      posterPath: OPPENHEIMER_META.posterPath,
      backdropPath: OPPENHEIMER_META.backdropPath,
      releaseDate: OPPENHEIMER_META.releaseDate,
      voteAverage: OPPENHEIMER_META.voteAverage,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    await fetch(`${env.UPSTASH_REDIS_REST_URL}/hset/cinefuel:curated_links/872585`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
      body: JSON.stringify(redisLinks)
    });
    console.log(`  ✓ Synced ${redisLinks.length} links for 872585 into Redis`);

    // Invalidate versioned catalog cache in Redis
    const incrRes = await fetch(`${env.UPSTASH_REDIS_REST_URL}/incr/cinefuel:staging:catalog:version`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    const incrProd = await fetch(`${env.UPSTASH_REDIS_REST_URL}/incr/cinefuel:production:catalog:version`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    console.log('  Invalidated staging catalog cache version:', await incrRes.json());
    console.log('  Invalidated production catalog cache version:', await incrProd.json());
  }

  console.log('\n--- DATABASE CLEANUP COMPLETE ---');
}

fixOppenheimerData().catch(console.error);
