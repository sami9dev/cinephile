import fs from 'fs';
import path from 'path';

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

async function checkRedis() {
  console.log('=== CHECKING UPSTASH REDIS ===');
  const headers = { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` };
  
  // 1. Check all_titles_summary
  const resSum = await fetch(`${env.UPSTASH_REDIS_REST_URL}/get/cinefuel:all_titles_summary`, { headers });
  const dataSum = await resSum.json();
  if (dataSum.result) {
    const p = typeof dataSum.result === 'string' ? JSON.parse(dataSum.result) : dataSum.result;
    console.log(`✓ cinefuel:all_titles_summary exists with ${p.length} titles`);
  } else {
    console.log(`⚠ cinefuel:all_titles_summary is NULL or MISSING in Redis!`);
  }

  // 2. Check keys pattern
  const resKeys = await fetch(`${env.UPSTASH_REDIS_REST_URL}/dbsize`, { headers });
  const dataKeys = await resKeys.json();
  console.log(`Total Keys in Upstash Redis (dbsize): ${dataKeys.result}`);

  // 3. Check memory
  const resInfo = await fetch(`${env.UPSTASH_REDIS_REST_URL}/info`, { headers });
  const dataInfo = await resInfo.json();
  const infoText = dataInfo.result || '';
  const usedMemMatch = infoText.match(/used_memory_human:([^\r\n]+)/);
  console.log(`Used Memory in Redis: ${usedMemMatch ? usedMemMatch[1] : 'unknown'}`);
}

async function checkCloudflareWorker() {
  console.log('\n=== CHECKING LIVE PRODUCTION WORKER ===');
  const t0 = Date.now();
  const res = await fetch('https://cinephile.sk6216071.workers.dev/api/catalog?limit=5');
  const ms = Date.now() - t0;
  console.log(`GET /api/catalog HTTP ${res.status} (${ms}ms)`);
  console.log('X-Cache header:', res.headers.get('x-cache'));
  console.log('Cache-Control header:', res.headers.get('cache-control'));
  const json = await res.json().catch(() => null);
  console.log(`Catalog items returned: ${json?.items?.length ?? 0}, total: ${json?.total ?? 0}, source: ${json?.source}`);
}

async function main() {
  await checkRedis();
  await checkCloudflareWorker();
}

main().catch(console.error);

async function checkCuratedLinks() {
  console.log('\n=== CHECKING CURATED LINKS API ===');
  const t0 = Date.now();
  const res = await fetch('https://cinephile.sk6216071.workers.dev/api/curated-links?movieId=157336');
  const ms = Date.now() - t0;
  console.log(`GET /api/curated-links?movieId=157336 HTTP ${res.status} (${ms}ms)`);
  console.log('Cache-Control header:', res.headers.get('cache-control'));
  const json = await res.json().catch(() => null);
  console.log(`Links returned: ${json?.links?.length ?? 0}, source: ${json?.source}`);
}

checkCuratedLinks().catch(console.error);
