import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const keys = await redis.keys('cinefuel:*catalog:v*');
  console.log(`Found ${keys.length} cached catalog keys:`, keys);

  if (keys.length > 0) {
    await redis.del(...keys);
    console.log(`Deleted ${keys.length} stale catalog cache keys!`);
  }

  // Increment version again to force any worker in memory to bump immediately
  const nextVer = await redis.incr('cinefuel:production:catalog:version');
  await redis.set('cinefuel:catalog_version', nextVer);
  await redis.set('cinefuel:development:catalog:version', nextVer);
  await redis.set('cinefuel:staging:catalog:version', nextVer);
  console.log(`Updated catalog versions to: ${nextVer}`);
}

main().catch(console.error);
