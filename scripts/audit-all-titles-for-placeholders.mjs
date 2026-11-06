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

async function auditAllTitles() {
  console.log('Auditing all titles in Supabase...');
  let from = 0;
  const pageSize = 1000;
  const groupMap = new Map();

  while (true) {
    const { data } = await supabase
      .from('links')
      .select('id, movie_id, movie_title, title, poster_path, media_type, created_at')
      .range(from, from + pageSize - 1);

    if (!data || data.length === 0) break;
    for (const r of data) {
      const mid = String(r.movie_id);
      if (!groupMap.has(mid)) {
        groupMap.set(mid, {
          movieId: mid,
          movieTitle: r.movie_title || r.title,
          posterPath: r.poster_path,
          mediaType: r.media_type,
          count: 1,
          sampleTitles: [r.title]
        });
      } else {
        const g = groupMap.get(mid);
        g.count++;
        if (!g.posterPath && r.poster_path) g.posterPath = r.poster_path;
        if (g.sampleTitles.length < 3) g.sampleTitles.push(r.title);
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Total unique movie_ids: ${groupMap.size}`);

  // Flag suspicious entries:
  // 1. Non-numeric movie_id
  // 2. Poster is null or includes 'placeholder'
  // 3. Title contains 'Movie #' or 'Series #' or 'Mirror' or 'Untitled' or 'Cloud Resolved'
  const suspicious = [];
  for (const [mid, g] of groupMap.entries()) {
    const isSuspiciousId = !/^\d+$/.test(mid);
    const isMissingPoster = !g.posterPath || g.posterPath.includes('placeholder');
    const isWeirdTitle = /movie #|series #|cloud resolved|untitled/i.test(g.movieTitle || '');

    if (isSuspiciousId || isMissingPoster || isWeirdTitle) {
      suspicious.push(g);
    }
  }

  console.log(`\nSuspicious / Placeholder entries found: ${suspicious.length}`);
  for (const s of suspicious) {
    console.log(`- ID: "${s.movieId}" | Title: "${s.movieTitle}" | Poster: "${s.posterPath}" | Count: ${s.count}`);
    console.log(`  Sample: ${s.sampleTitles.join(' | ')}`);
  }
}

auditAllTitles().catch(console.error);
