import { MongoClient } from 'mongodb';
import fs from 'fs';

import path from 'path';

// Parse .env.local if present
const envPath = path.resolve(process.cwd(), '.env.local');
const envVars = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        envVars[key] = val;
      }
    }
  });
}

const MONGODB_URI = process.env.MONGODB_URI || envVars.MONGODB_URI;
const serverLinks = JSON.parse(fs.readFileSync('./src/data/serverLinks.json', 'utf8'));

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('cinefuel');
  const linksColl = db.collection('links');

  const beforeCount = await linksColl.countDocuments();
  console.log(`Before count in MongoDB Atlas: ${beforeCount}`);

  // Collect all links from serverLinks.json
  const allUrls = [];
  const linkObjects = [];
  for (const [mId, arr] of Object.entries(serverLinks)) {
    if (Array.isArray(arr)) {
      for (const l of arr) {
        if (l && l.url) {
          allUrls.push(l.url);
          linkObjects.push({ movieId: String(mId), ...l });
        }
      }
    }
  }

  // Fast set of existing URLs
  const existingUrls = new Set();
  const chunkSize = 1000;
  for (let i = 0; i < allUrls.length; i += chunkSize) {
    const chunk = allUrls.slice(i, i + chunkSize);
    const found = await linksColl.find({ url: { $in: chunk } }, { projection: { url: 1 } }).toArray();
    found.forEach(d => existingUrls.add(d.url));
  }

  const missingLinks = linkObjects.filter(l => !existingUrls.has(l.url)).map(l => ({
    ...l,
    createdAt: l.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  console.log(`Missing links to push: ${missingLinks.length}`);
  if (missingLinks.length > 0) {
    const result = await linksColl.insertMany(missingLinks);
    console.log(`Successfully inserted ${result.insertedCount} links into MongoDB Atlas.`);
  }

  const afterCount = await linksColl.countDocuments();
  console.log(`After count in MongoDB Atlas: ${afterCount}`);

  await client.close();
}

main().catch(console.error);
