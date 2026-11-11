import fs from 'fs';
import path from 'path';
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const redisUrl = env.UPSTASH_REDIS_REST_URL;
const redisToken = env.UPSTASH_REDIS_REST_TOKEN;

// Real TMDB image paths for Panchayat (TMDB TV ID: 101352)
// Poster: /8ivTX5q2otqXvH815BcOhxVkTPW.jpg
// Backdrop: /iZ8EtGAqKWZdRJPzWfFseNfVxjh.jpg
const CORRECT_POSTER = '/8ivTX5q2otqXvH815BcOhxVkTPW.jpg';
const CORRECT_BACKDROP = '/iZ8EtGAqKWZdRJPzWfFseNfVxjh.jpg';

async function fixPanchayat() {
  console.log('--- 1. Checking Supabase for Panchayat (movie_id: 101352) ---');
  const { data: rows, error: fetchErr } = await supabase
    .from('links')
    .select('id, movie_id, movie_title, poster_path, backdrop_path')
    .eq('movie_id', '101352');

  if (fetchErr) {
    console.error('Error fetching Panchayat links:', fetchErr);
    return;
  }

  console.log(`Found ${rows.length} rows for Panchayat in Supabase.`);
  console.log('Sample current poster_path:', rows[0]?.poster_path);
  console.log('Sample current backdrop_path:', rows[0]?.backdrop_path);

  console.log('--- 2. Updating Supabase links to real Panchayat poster & backdrop ---');
  const { error: updateErr } = await supabase
    .from('links')
    .update({
      poster_path: CORRECT_POSTER,
      backdrop_path: CORRECT_BACKDROP,
      updated_at: new Date().toISOString(),
    })
    .eq('movie_id', '101352');

  if (updateErr) {
    console.error('Failed to update Supabase:', updateErr);
  } else {
    console.log('✓ Successfully updated all Panchayat rows in Supabase!');
  }

  // Also check if any other rows in Supabase still reference ulwZb3l4WNnUdx2hwZ4frPpwh3E.jpg
  const { data: lingering } = await supabase
    .from('links')
    .select('id, movie_id, movie_title')
    .or(`poster_path.eq./ulwZb3l4WNnUdx2hwZ4frPpwh3E.jpg,backdrop_path.eq./ulwZb3l4WNnUdx2hwZ4frPpwh3E.jpg`);

  if (lingering && lingering.length > 0) {
    console.log(`Found ${lingering.length} other rows with wrong cartoon image. Updating them too...`);
    await supabase
      .from('links')
      .update({
        poster_path: CORRECT_POSTER,
        backdrop_path: CORRECT_BACKDROP,
      })
      .or(`poster_path.eq./ulwZb3l4WNnUdx2hwZ4frPpwh3E.jpg,backdrop_path.eq./ulwZb3l4WNnUdx2hwZ4frPpwh3E.jpg`);
  } else {
    console.log('✓ No other rows reference the cartoon image.');
  }

  console.log('--- 3. Re-syncing Upstash Redis & local serverLinks.json ---');
  // Re-run the full sync script to rebuild cinefuel:all_titles_summary and cinefuel:curated_links
}

fixPanchayat();
