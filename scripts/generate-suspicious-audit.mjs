import fs from 'fs';
import path from 'path';

const contaminatedPath = path.resolve('backups/rollback_contaminated_13_links.json');
const contaminated = JSON.parse(fs.readFileSync(contaminatedPath, 'utf8'));

const headers = [
  'internal_title_id',
  'title',
  'year',
  'media_type',
  'external_ids',
  'legacy_mongo_id',
  'stored_links',
  'poster_path_url',
  'reason_flagged',
];

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const rows = [headers.join(',')];

for (const item of contaminated) {
  const reasons = [];

  // 1. Episode / Codec check
  if (item.episodeNumber === 264 || item.episodeNumber === 265) {
    reasons.push(`Codec x${item.episodeNumber} misparsed as TV episodeNumber ${item.episodeNumber}`);
  }

  // 2. Movie vs TV check
  if (
    item.mediaType === 'tv' &&
    (item.movieTitle.includes('Equalizer') ||
      item.movieTitle.includes('Wonder Woman') ||
      item.movieTitle.includes('Nosferatu'))
  ) {
    reasons.push('Movie incorrectly classified as TV series');
  }

  // 3. Numeric IMDb ID check
  if (['17024450', '3766354', '451279', '5040012'].includes(item.movieId)) {
    reasons.push(
      'IMDb numeric ID stored as movieId instead of TMDB ID (missing canonical TMDB ID)'
    );
  }

  // 4. Poster check
  if (item.posterPath && item.posterPath.includes('media-amazon.com')) {
    reasons.push('External Amazon CDN poster URL instead of canonical TMDB image path');
  } else if (!item.posterPath) {
    reasons.push('Null or missing poster path');
  }

  const year = item.releaseDate ? item.releaseDate.slice(0, 4) : '';
  const externalIds = 'imdb:' + (item.movieId ? 'tt' + item.movieId.padStart(7, '0') : 'unknown');

  rows.push(
    [
      escapeCsv(item.movieId),
      escapeCsv(item.movieTitle || item.title),
      escapeCsv(year),
      escapeCsv(item.mediaType),
      escapeCsv(externalIds),
      escapeCsv(item._id || ''),
      escapeCsv(item.url),
      escapeCsv(item.posterPath || ''),
      escapeCsv(reasons.join('; ')),
    ].join(',')
  );
}

const outDir = path.resolve('docs/investigation');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(path.join(outDir, 'suspicious-records.csv'), rows.join('\n'), 'utf8');
console.log(`✅ Generated docs/investigation/suspicious-records.csv with ${contaminated.length} records.`);
