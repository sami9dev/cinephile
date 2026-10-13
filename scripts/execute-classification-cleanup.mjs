import { MongoClient } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://shyam:shyam081@cluster0.fiwla4n.mongodb.net/cinefuel?retryWrites=true&w=majority';

const EXACT_13_IDS = [
  'tg-1791652746497-d7c0',
  'tg-1791652746497-kcqe',
  'tg-1791652746496-dcqc',
  'tg-1791652746496-yiye',
  'tg-1791907186585-6npk',
  'tg-1791907186594-ybpr',
  'tg-1791907186594-g51z',
  'tg-1791907186594-pn8s',
  'tg-1791818619764-apds',
  'tg-1791818619764-okv4',
  'tg-1791818619764-mm0v',
  'tg-1791818619764-f3ln',
  'tg-1791818619764-gp6l',
];

const APPROVED_MOVIE_IDS = ['17024450', '3766354', '451279', '5040012'];

async function main() {
  console.log('🛡️  Starting Targeted Cinephile MongoDB Classification Cleanup with Strict Safeguards...\n');

  // SAFEGUARD 1: Verify rollback backup is complete, readable, and outside deployable source dir
  const backupPath = path.join(process.cwd(), 'backups', 'rollback_contaminated_13_links.json');
  console.log(`[SAFEGUARD 1] Verifying rollback backup file at: ${backupPath}`);
  assert.ok(fs.existsSync(backupPath), `Rollback backup file missing at: ${backupPath}`);
  assert.ok(!backupPath.includes(path.join(process.cwd(), 'src')), 'Backup MUST be stored outside src/');

  const backupRaw = fs.readFileSync(backupPath, 'utf8');
  const backupDocs = JSON.parse(backupRaw);
  assert.equal(Array.isArray(backupDocs), true, 'Backup must be a JSON array');
  assert.equal(backupDocs.length, 13, `Backup must contain exactly 13 documents, got ${backupDocs.length}`);
  const backupMap = new Map(backupDocs.map(d => [d.id, d]));
  for (const id of EXACT_13_IDS) {
    assert.ok(backupMap.has(id), `Backup is missing expected link ID: ${id}`);
  }
  console.log('  ✅ Safeguard 1 Passed: Rollback backup verified with all 13 complete documents.\n');

  // Connect to MongoDB Atlas
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('cinefuel');
  const coll = db.collection('links');

  const initialTotalCount = await coll.countDocuments();
  console.log(`Initial total link collection count: ${initialTotalCount}`);

  // SAFEGUARD 2 & 6: Precondition check — Confirm all 13 exact link IDs exist and match dry-run report
  console.log('[SAFEGUARD 2 & 6] Checking preconditions on live MongoDB Atlas...');
  const currentDocs = await coll.find({ id: { $in: EXACT_13_IDS } }).toArray();
  assert.equal(currentDocs.length, 13, `Precondition Failed: Expected 13 matched records, found ${currentDocs.length}`);

  for (const doc of currentDocs) {
    assert.ok(EXACT_13_IDS.includes(doc.id), `Unexpected doc id: ${doc.id}`);
    assert.ok(APPROVED_MOVIE_IDS.includes(String(doc.movieId)), `Doc ${doc.id} does not belong to approved movie IDs! movieId: ${doc.movieId}`);
    assert.equal(doc.mediaType, 'tv', `Doc ${doc.id} mediaType expected "tv", got "${doc.mediaType}"`);
    assert.equal(doc.linkType, 'single_episode', `Doc ${doc.id} linkType expected "single_episode", got "${doc.linkType}"`);
    assert.equal(doc.category, 'SingleEpisode', `Doc ${doc.id} category expected "SingleEpisode", got "${doc.category}"`);
  }
  console.log('  ✅ Safeguards 2 & 6 Passed: All 13 documents exist and strictly match pre-conditions.\n');

  // SAFEGUARD 3, 4 & 5: Update only those 13 exact link IDs with ONLY the approved 5 fields
  console.log('[SAFEGUARD 3, 4 & 5] Executing targeted update on exact 13 IDs...');
  const updateResult = await coll.updateMany(
    { id: { $in: EXACT_13_IDS } },
    {
      $set: {
        mediaType: 'movie',
        seasonNumber: null,
        episodeNumber: null,
        linkType: 'general',
        category: 'Streaming',
      },
    }
  );

  console.log(`  Database matchedCount: ${updateResult.matchedCount}`);
  console.log(`  Database modifiedCount: ${updateResult.modifiedCount}`);
  assert.equal(updateResult.matchedCount, 13, `Update failed: Expected matchedCount=13, got ${updateResult.matchedCount}`);
  assert.equal(updateResult.modifiedCount, 13, `Update failed: Expected modifiedCount=13, got ${updateResult.modifiedCount}`);
  console.log('  ✅ Safeguards 3, 4 & 5 Passed: Exactly 13 records matched and modified.\n');

  // SAFEGUARD 7: Reread all 13 records after update and verify field preservation & total count
  console.log('[SAFEGUARD 7] Rereading all 13 updated documents from MongoDB Atlas...');
  const updatedDocs = await coll.find({ id: { $in: EXACT_13_IDS } }).toArray();
  assert.equal(updatedDocs.length, 13, 'Post-update fetch must return exactly 13 documents');

  for (const postDoc of updatedDocs) {
    const orig = backupMap.get(postDoc.id);
    assert.ok(orig, `Original document not found for ${postDoc.id}`);

    // Verify the 5 approved changed fields
    assert.equal(postDoc.mediaType, 'movie', `mediaType not "movie" on ${postDoc.id}`);
    assert.equal(postDoc.seasonNumber, null, `seasonNumber not null on ${postDoc.id}`);
    assert.equal(postDoc.episodeNumber, null, `episodeNumber not null on ${postDoc.id}`);
    assert.equal(postDoc.linkType, 'general', `linkType not "general" on ${postDoc.id}`);
    assert.equal(postDoc.category, 'Streaming', `category not "Streaming" on ${postDoc.id}`);

    // Verify all other fields are 100% UNCHANGED
    assert.equal(postDoc.url, orig.url, `URL altered on ${postDoc.id}`);
    assert.equal(postDoc.title, orig.title, `Title altered on ${postDoc.id}`);
    assert.equal(postDoc.movieTitle, orig.movieTitle, `MovieTitle altered on ${postDoc.id}`);
    assert.equal(postDoc.quality, orig.quality, `Quality altered on ${postDoc.id}`);
    assert.equal(postDoc.codec, orig.codec, `Codec altered on ${postDoc.id}`);
    assert.equal(postDoc.resolution, orig.resolution, `Resolution altered on ${postDoc.id}`);
    assert.equal(postDoc.dynamicRange, orig.dynamicRange, `DynamicRange altered on ${postDoc.id}`);
    assert.equal(postDoc.bitDepth, orig.bitDepth, `BitDepth altered on ${postDoc.id}`);
    assert.equal(postDoc.container, orig.container, `Container altered on ${postDoc.id}`);
    assert.equal(postDoc.provider, orig.provider, `Provider altered on ${postDoc.id}`);
    assert.equal(postDoc.serverName, orig.serverName, `ServerName altered on ${postDoc.id}`);
    assert.equal(postDoc.serverBadge, orig.serverBadge, `ServerBadge altered on ${postDoc.id}`);
    assert.equal(postDoc.audioLanguage, orig.audioLanguage, `AudioLanguage altered on ${postDoc.id}`);
    assert.equal(postDoc.createdAt, orig.createdAt, `CreatedAt altered on ${postDoc.id}`);
  }

  const finalTotalCount = await coll.countDocuments();
  assert.equal(finalTotalCount, initialTotalCount, `Total documents changed! Initial: ${initialTotalCount}, Final: ${finalTotalCount}`);
  console.log(`  ✅ Safeguard 7 Passed: Post-update verification confirmed all 13 documents match approved diff and all metadata/URLs are preserved intact. Total collection count unchanged (${finalTotalCount}).\n`);

  await client.close();
  console.log('🎉 Targeted MongoDB Classification Cleanup Completed Successfully!');
}

main().catch(err => {
  console.error('❌ Cleanup halted or failed:', err);
  process.exit(1);
});
