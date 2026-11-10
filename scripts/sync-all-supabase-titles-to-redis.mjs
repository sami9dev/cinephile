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

async function syncAll() {
  console.log('--- 1. Fetching all 14,800+ links from Supabase by pagination ---');
  let from = 0;
  const pageSize = 1000;
  const titlesMap = new Map(); // movieId -> { latestDoc, links: [], count: 0, sortDate }
  let totalFetched = 0;

  while (true) {
    const { data, error } = await supabase
      .from('links')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Fetch error at', from, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    totalFetched += data.length;

    for (const row of data) {
      const mid = String(row.movie_id || '').trim();
      if (!mid) continue;

      if (!titlesMap.has(mid)) {
        titlesMap.set(mid, {
          movieId: mid,
          movieTitle: row.movie_title || row.title,
          posterPath: row.poster_path,
          backdropPath: row.backdrop_path,
          mediaType: row.media_type || 'movie',
          releaseDate: row.release_date,
          voteAverage: typeof row.vote_average === 'number' ? row.vote_average : 7.5,
          quality: row.quality,
          audioLanguage: row.audio_language,
          category: row.category,
          linkType: row.link_type,
          sortDate: row.created_at,
          linksCount: 0,
          latestDoc: {
            movieId: mid,
            movieTitle: row.movie_title || row.title,
            posterPath: row.poster_path,
            backdropPath: row.backdrop_path,
            mediaType: row.media_type,
            quality: row.quality,
            audioLanguage: row.audio_language,
            category: row.category,
            linkType: row.link_type,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            seasonNumber: row.season_number,
            episodeNumber: row.episode_number,
            releaseDate: row.release_date,
            voteAverage: row.vote_average,
            title: row.title,
          },
          links: []
        });
      }

      const t = titlesMap.get(mid);
      t.linksCount++;
      if (!t.posterPath && row.poster_path) t.posterPath = row.poster_path;
      if (!t.backdropPath && row.backdrop_path) t.backdropPath = row.backdrop_path;

      // Keep up to 20 representative links in memory per title for Redis hash
      t.links.push({
        id: row.id,
        movieId: mid,
        movieTitle: row.movie_title,
        title: row.title,
        url: row.url,
        quality: row.quality,
        codec: row.codec,
        audioLanguage: row.audio_language,
        size: row.size,
        linkType: row.link_type,
        seasonNumber: row.season_number,
        episodeNumber: row.episode_number,
        episodeTitle: row.episode_title,
        manualTitleVerified: row.manual_title_verified,
        serverName: row.server_name,
        serverBadge: row.server_badge,
        mediaType: row.media_type,
        releaseDate: row.release_date,
        posterPath: row.poster_path,
        backdropPath: row.backdrop_path,
        overview: row.overview,
        voteAverage: row.vote_average,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Fetched ${totalFetched} link rows.`);
  console.log(`Total unique titles identified: ${titlesMap.size}`);

  // 2. Prepare lightweight summary array for Redis
  const allTitlesArray = Array.from(titlesMap.values()).map(t => ({
    _id: t.movieId,
    latestDoc: t.latestDoc,
    linksCount: t.linksCount,
    sortDate: t.sortDate,
    groupMovieTitle: t.movieTitle,
    groupPosterPath: t.posterPath,
    groupBackdropPath: t.backdropPath,
    groupVoteAverage: t.voteAverage,
    allMediaTypes: [t.mediaType]
  }));

  console.log(`--- 2. Syncing to Upstash Redis ---`);
  if (redisUrl && redisToken) {
    try {
      // Set the full titles summary
      const setSummaryRes = await fetch(`${redisUrl}/set/cinefuel:all_titles_summary`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(JSON.stringify(allTitlesArray))
      });
      console.log(`  ✓ 'cinefuel:all_titles_summary' stored in Redis (${allTitlesArray.length} titles)`);

      // Increment catalog version to invalidate old caches
      const appEnv = (env.APP_ENV || env.CINEFUEL_ENV || 'production').toLowerCase();
      await fetch(`${redisUrl}/incr/cinefuel:${appEnv}:catalog:version`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` }
      });
      await fetch(`${redisUrl}/incr/cinefuel:staging:catalog:version`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` }
      });
      console.log(`  ✓ Incremented catalog version in Redis`);

      // Store in cinefuel:curated_links hash in batches of 50
      const titlesEntries = Array.from(titlesMap.entries());
      const batchSize = 50;
      for (let i = 0; i < titlesEntries.length; i += batchSize) {
        const batch = titlesEntries.slice(i, i + batchSize);
        const hashObj = {};
        for (const [mid, t] of batch) {
          hashObj[mid] = JSON.stringify(t.links);
        }
        await fetch(`${redisUrl}/hset/cinefuel:curated_links`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${redisToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(hashObj)
        });
      }
      console.log(`  ✓ Synced all ${titlesEntries.length} titles into 'cinefuel:curated_links' hash`);
    } catch (err) {
      console.error('Redis sync failed:', err.message);
    }
  }

  // 3. Update local serverLinks.json backup
  console.log(`--- 3. Updating local serverLinks.json backup ---`);
  const localBackup = {};
  for (const [mid, t] of titlesMap.entries()) {
    localBackup[mid] = t.links;
  }
  const localFile = path.resolve(process.cwd(), 'src/data/serverLinks.json');
  fs.writeFileSync(localFile, JSON.stringify(localBackup, null, 2), 'utf8');
  console.log(`  ✓ Updated serverLinks.json with all ${Object.keys(localBackup).length} titles`);
  console.log('--- ALL SYNC COMPLETE ---');
}

syncAll().catch(console.error);
