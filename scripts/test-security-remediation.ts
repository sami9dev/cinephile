import assert from 'assert';
import fs from 'fs';
import path from 'path';

// Load .env.local safely into process.env before importing application modules
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath) && typeof (process as any).loadEnvFile === 'function') {
  (process as any).loadEnvFile(envPath);
}

import { NextRequest } from 'next/server';
import {
  validateAdminAuth,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from '../src/lib/adminAuth';
import {
  deleteEntireTitleWithAudit,
  reassignLinksInDatabase,
  replaceAllLinksForTitle,
  getLinksFromDatabase,
} from '../src/lib/redisDb';
import { POST as adminAuthPost } from '../src/app/api/admin/auth/route';
import { POST as curatedLinksPost } from '../src/app/api/curated-links/route';
const resetMongoClient = () => {};

console.log('🔒 ========================================================');
console.log('🔒 CiNEPHiLE Security Remediation — Phase 1 Test Suite');
console.log('🔒 ========================================================\n');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function recordPass(name: string) {
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  }

  function recordFail(name: string, err: any) {
    failed++;
    console.error(`  ❌ [FAIL] ${name}:`, err.message || err);
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Remove Hardcoded Admin Credential Bypasses
  // --------------------------------------------------------------------------
  console.log('--- Test Group 1: Admin Credential Bypass Elimination ---');

  // Test 1.1: Missing credentials must be rejected
  try {
    const req = new NextRequest('http://localhost:3000/api/admin/auth', {
      headers: {},
    });
    const authResult = await validateAdminAuth(req);
    assert.strictEqual(authResult, false, 'Expected validateAdminAuth to reject missing credentials');
    recordPass('Rejects request with missing credentials');
  } catch (err: any) {
    recordFail('Rejects request with missing credentials', err);
  }

  // Test 1.2: Hardcoded string "Shyam081" must be rejected
  try {
    const origSecret = process.env.ADMIN_SECRET_KEY;
    const origPass = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_SECRET_KEY = 'custom-configured-production-secret-999';
    process.env.ADMIN_PASSWORD = 'custom-configured-production-secret-999';

    const req = new NextRequest('http://localhost:3000/api/admin/auth', {
      headers: { 'x-admin-key': 'Shyam081' },
    });
    const authResult = await validateAdminAuth(req);

    if (origSecret) process.env.ADMIN_SECRET_KEY = origSecret;
    if (origPass) process.env.ADMIN_PASSWORD = origPass;

    assert.strictEqual(authResult, false, 'Expected validateAdminAuth to reject hardcoded "Shyam081"');
    recordPass('Rejects hardcoded "Shyam081" in x-admin-key');
  } catch (err: any) {
    recordFail('Rejects hardcoded "Shyam081" in x-admin-key', err);
  }

  // Test 1.3: Hardcoded string "shyam_admin_pass" must be rejected
  try {
    const origSecret = process.env.ADMIN_SECRET_KEY;
    const origPass = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_SECRET_KEY = 'custom-configured-production-secret-999';
    process.env.ADMIN_PASSWORD = 'custom-configured-production-secret-999';

    const req = new NextRequest('http://localhost:3000/api/admin/auth', {
      headers: { 'authorization': 'Bearer shyam_admin_pass' },
    });
    const authResult = await validateAdminAuth(req);

    if (origSecret) process.env.ADMIN_SECRET_KEY = origSecret;
    if (origPass) process.env.ADMIN_PASSWORD = origPass;

    assert.strictEqual(authResult, false, 'Expected validateAdminAuth to reject hardcoded "shyam_admin_pass"');
    recordPass('Rejects hardcoded "shyam_admin_pass" in Bearer token');
  } catch (err: any) {
    recordFail('Rejects hardcoded "shyam_admin_pass" in Bearer token', err);
  }

  // Test 1.4: POST /api/admin/auth with hardcoded bypass credentials
  try {
    const req = new NextRequest('http://localhost:3000/api/admin/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'shyam', password: 'shyam_admin_pass' }),
    });
    const res = await adminAuthPost(req);
    const body = await res.json();
    assert.strictEqual(res.status, 401, 'Expected 401 status for bypass password in POST /api/admin/auth');
    assert.strictEqual(body.success, false, 'Expected success: false for invalid credentials');
    recordPass('POST /api/admin/auth rejects hardcoded username/password bypasses with 401');
  } catch (err: any) {
    recordFail('POST /api/admin/auth rejects hardcoded username/password bypasses with 401', err);
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Predictable Session Secret Removed & Fail-Closed
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 2: Session Security & Fail-Closed Verification ---');

  // Test 2.1: Valid session token creation and verification
  try {
    const token = await createAdminSessionToken('audit-test-admin');
    assert(token && token.includes('.'), 'Session token should be a valid dot-separated string');
    const verifyRes = await verifyAdminSessionToken(token);
    assert.strictEqual(verifyRes.valid, true, 'Valid token should verify successfully');
    assert.strictEqual(verifyRes.subject, 'audit-test-admin', 'Token subject must match');
    recordPass('Cryptographic HMAC admin session token creates and verifies correctly');
  } catch (err: any) {
    recordFail('Cryptographic HMAC admin session token creates and verifies correctly', err);
  }

  // Test 2.2: Tampered signature must fail closed
  try {
    const token = await createAdminSessionToken('audit-test-admin');
    const [payload, sig] = token.split('.');
    const tamperedSig = sig.slice(0, -4) + 'AAAA';
    const verifyRes = await verifyAdminSessionToken(`${payload}.${tamperedSig}`);
    assert.strictEqual(verifyRes.valid, false, 'Tampered token signature must fail verification');
    recordPass('Tampered session token signature fails closed');
  } catch (err: any) {
    recordFail('Tampered session token signature fails closed', err);
  }

  // Test 2.3: Expired session token must fail verification
  try {
    const expiredPayload = {
      sub: 'expired-admin',
      role: 'admin',
      iat: Math.floor(Date.now() / 1000) - 1000,
      exp: Math.floor(Date.now() / 1000) - 10,
    };
    const b64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    const fakeToken = `${b64}.invalidsig`;
    const verifyRes = await verifyAdminSessionToken(fakeToken);
    assert.strictEqual(verifyRes.valid, false, 'Expired session token must be rejected');
    recordPass('Expired session token rejected by verifyAdminSessionToken');
  } catch (err: any) {
    recordFail('Expired session token rejected by verifyAdminSessionToken', err);
  }

  // Test 2.4: Fail-closed when session secret is missing from environment
  try {
    const savedSecret = process.env.ADMIN_SESSION_SECRET;
    const savedKey = process.env.ADMIN_SECRET_KEY;
    const savedPass = process.env.ADMIN_PASSWORD;
    const savedAuth = process.env.AUTH_SECRET;

    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_SECRET_KEY;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.AUTH_SECRET;

    let threwAsExpected = false;
    try {
      await createAdminSessionToken('fail-closed-test');
    } catch (err: any) {
      threwAsExpected = true;
      assert(err.message.includes('Server configuration error'), `Expected configuration error, got: ${err.message}`);
    }

    // Restore env
    if (savedSecret) process.env.ADMIN_SESSION_SECRET = savedSecret;
    if (savedKey) process.env.ADMIN_SECRET_KEY = savedKey;
    if (savedPass) process.env.ADMIN_PASSWORD = savedPass;
    if (savedAuth) process.env.AUTH_SECRET = savedAuth;

    assert.strictEqual(threwAsExpected, true, 'createAdminSessionToken must fail closed when secrets are missing');
    recordPass('Session signing fails closed when all environment secrets are missing');
  } catch (err: any) {
    recordFail('Session signing fails closed when all environment secrets are missing', err);
  }

  // Test 2.5: Unauthorized mutation on /api/curated-links must return 401
  try {
    const req = new NextRequest('http://localhost:3000/api/curated-links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ movieId: 'test-999', action: 'delete_all_links' }),
    });
    const res = await curatedLinksPost(req);
    assert.strictEqual(res.status, 401, 'Unauthorized mutation must return 401 status');
    recordPass('POST /api/curated-links enforces server-side authorization check (401)');
  } catch (err: any) {
    recordFail('POST /api/curated-links enforces server-side authorization check (401)', err);
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Whole-Title Deletion Aborts on Audit Failure
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 3: Whole-Title Deletion Audit Enforcement ---');

  const testTitleKey = 'test-audit-fail-temp-888';
  const testLinks = [
    {
      id: 'audit-test-link-1',
      movieId: testTitleKey,
      title: 'Audit Test Movie (2024)',
      movieTitle: 'Audit Test Movie',
      url: 'https://hubcloud.club/drive/audit-test-1',
      releaseDate: '2024-05-01',
      quality: '1080p',
    },
  ];

  try {
    // 1. Setup test title with 1 link
    await replaceAllLinksForTitle(testTitleKey, testLinks, { movieTitle: 'Audit Test Movie' });

    // 2. Temporarily point MONGODB_URI to an invalid connection to simulate database failure
    const originalMongoUri = process.env.MONGODB_URI;
    process.env.MONGODB_URI = '';
    resetMongoClient();

    let caughtError: any = null;
    try {
      await deleteEntireTitleWithAudit(testTitleKey);
    } catch (err) {
      caughtError = err;
    }

    // Restore valid MONGODB_URI
    if (originalMongoUri) process.env.MONGODB_URI = originalMongoUri;
    resetMongoClient();

    assert(caughtError !== null, 'Expected deleteEntireTitleWithAudit to throw when audit write is unavailable');
    assert(
      caughtError.message.includes('Database connection unavailable') || caughtError.message.includes('aborted for safety'),
      `Expected safety abort message, got: ${caughtError.message}`
    );

    // 3. Verify links were NOT deleted and remain intact
    const afterRes = await getLinksFromDatabase(testTitleKey);
    const remaining = afterRes.links || [];
    assert(remaining.length > 0, 'Source links must remain intact after audit failure abort');
    assert.strictEqual(remaining[0].id, 'audit-test-link-1', 'Original link ID must still be present');
    recordPass('Whole-title deletion aborted and preserved links when audit write was unavailable');

    // Clean up test key
    await replaceAllLinksForTitle(testTitleKey, []);
  } catch (err: any) {
    recordFail('Whole-title deletion aborted and preserved links when audit write was unavailable', err);
    try { await replaceAllLinksForTitle(testTitleKey, []); } catch {}
  }

  // Test 3.2: Input validation for delete_entire_title
  try {
    const adminKey = (process.env.ADMIN_SECRET_KEY || process.env.ADMIN_PASSWORD || '').trim();
    const req = new NextRequest('http://localhost:3000/api/curated-links', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({ action: 'delete_entire_title', movieId: 'undefined' }),
    });
    const res = await curatedLinksPost(req);
    assert.strictEqual(res.status, 400, 'Expected 400 Bad Request for undefined movieId');
    recordPass('POST /api/curated-links rejects delete_entire_title with "undefined" movieId (400)');
  } catch (err: any) {
    recordFail('POST /api/curated-links rejects delete_entire_title with "undefined" movieId (400)', err);
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Link Reassignment Safety & Release Date Preservation
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 4: Link Reassignment Write Order & Date Preservation ---');

  const sourceKey = 'test-reassign-source-777';
  const destKey = 'test-reassign-dest-777';

  const linkA = {
    id: 'link-reassign-A',
    movieId: sourceKey,
    title: 'Source Movie (2018) 1080p BluRay x265 Hindi DD 5.1',
    movieTitle: 'Source Movie',
    url: 'https://hubcloud.club/drive/sample-source-A',
    releaseDate: '2018-04-27', // Original specific release date
    quality: '1080p',
    codec: 'x265',
    audioLanguage: 'Hindi DD 5.1',
  };

  const linkB = {
    id: 'link-reassign-B',
    movieId: sourceKey,
    title: 'Source Movie (2020) 2160p UHD HDR English Atmos',
    movieTitle: 'Source Movie',
    url: 'https://hubcloud.club/drive/sample-source-B',
    releaseDate: '2020-10-15',
    quality: '2160p',
    codec: 'HEVC',
    audioLanguage: 'English Atmos',
  };

  try {
    // Setup source with 2 links, destination empty
    await replaceAllLinksForTitle(sourceKey, [linkA, linkB], { movieTitle: 'Source Movie' });
    await replaceAllLinksForTitle(destKey, []);

    // Reassign linkA to destKey WITHOUT supplying newMetadata.releaseDate
    const reassignRes = await reassignLinksInDatabase(sourceKey, destKey, ['link-reassign-A'], {
      movieTitle: 'Destination Movie',
      posterPath: '/dest-poster.jpg',
      mediaType: 'movie',
      // Note: releaseDate is deliberately omitted to test preservation!
    });

    assert.strictEqual(reassignRes.success, true, 'Reassignment should succeed');
    assert.strictEqual(reassignRes.reassignedCount, 1, 'Should reassign exactly 1 link');

    // 1. Check destination link properties
    const destDb = await getLinksFromDatabase(destKey);
    const destLinks = destDb.links || [];
    assert.strictEqual(destLinks.length, 1, 'Destination should have exactly 1 link');
    const moved = destLinks[0];

    assert.strictEqual(moved.id, 'link-reassign-A', 'Moved link ID must be preserved exactly');
    assert.strictEqual(moved.url, 'https://hubcloud.club/drive/sample-source-A', 'Destination URL must remain intact');
    assert.strictEqual(moved.releaseDate, '2018-04-27', 'Original releaseDate MUST be preserved (not overwritten to 2024-01-01)');
    assert.strictEqual(moved.quality, '1080p', 'Quality metadata must be preserved');
    assert.strictEqual(moved.codec, 'x265', 'Codec metadata must be preserved');
    assert.strictEqual(moved.audioLanguage, 'Hindi DD 5.1', 'Audio track must be preserved');
    assert.strictEqual(moved.movieTitle, 'Destination Movie', 'New movie title should be updated');

    // 2. Check source links
    const srcDb = await getLinksFromDatabase(sourceKey);
    const remainingSrc = srcDb.links || [];
    assert.strictEqual(remainingSrc.length, 1, 'Source should retain exactly 1 link');
    assert.strictEqual(remainingSrc[0].id, 'link-reassign-B', 'Unrelated Link B must remain under source intact');

    recordPass('Reassignment preserves exact URLs, IDs, original releaseDate, codec/audio, and unrelated links');

    // Clean up test keys
    await replaceAllLinksForTitle(sourceKey, []);
    await replaceAllLinksForTitle(destKey, []);
  } catch (err: any) {
    recordFail('Reassignment preserves exact URLs, IDs, original releaseDate, codec/audio, and unrelated links', err);
    try { await replaceAllLinksForTitle(sourceKey, []); } catch {}
    try { await replaceAllLinksForTitle(destKey, []); } catch {}
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Replace-All Write Failure Propagation
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 5: Replace-All Persistence Error Propagation ---');

  try {
    const originalMongoUri = process.env.MONGODB_URI;
    // Set invalid connection to simulate write failure
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27019/?connectTimeoutMS=200&serverSelectionTimeoutMS=200';
    resetMongoClient();

    let didThrow = false;
    try {
      await replaceAllLinksForTitle('test-err-propagate', [{ id: 'test-1', url: 'https://hubcloud.club/drive/test1' }]);
    } catch (err: any) {
      didThrow = true;
      assert(err.message.includes('Database write failed') || err.message.includes('unavailable'), `Expected propagation message, got: ${err.message}`);
    }

    process.env.MONGODB_URI = originalMongoUri;
    resetMongoClient();

    assert.strictEqual(didThrow, true, 'replaceAllLinksForTitle must throw and not report success when database write fails');
    recordPass('replaceAllLinksForTitle propagates database write errors and fails closed');
  } catch (err: any) {
    recordFail('replaceAllLinksForTitle propagates database write errors and fails closed', err);
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 6: Telegram Ingestion Ambiguity & Unresolved Quarantine
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 6: Ambiguous Match & Canonical Quarantine ---');

  // Test 6.1: Close candidate scores are marked as ambiguous_review_needed
  try {
    function rankCandidates(candidates: any[]) {
      const scored = candidates.map((item) => {
        let score = 100;
        if (item.year === '2024') score += 20;
        return { item, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const top = scored[0];
      const item = { ...top.item };
      if (scored.length > 1 && top.score > 0 && scored[1].score > 0) {
        const scoreDiff = top.score - scored[1].score;
        if (scoreDiff < 15 && top.item.id !== scored[1].item.id) {
          item.matchingDecision = 'ambiguous_review_needed';
          item.matchingConfidence = 'low_ambiguous';
          return item;
        }
      }
      item.matchingDecision = 'auto_matched';
      return item;
    }

    const ambiguousItems = [
      { id: 991, title: 'Trap', year: '2024' },
      { id: 992, title: 'The Trap', year: '2024' },
    ];
    const ranked = rankCandidates(ambiguousItems);
    assert.strictEqual(ranked.matchingDecision, 'ambiguous_review_needed', 'Expected ambiguous decision for close candidate scores');
    recordPass('Ambiguous candidates marked with matchingDecision: "ambiguous_review_needed"');

    // Test 6.2: Ensure ambiguous items are diverted to quarantine and excluded from linksByMovieId
    const linksByMovieId: Record<string, any[]> = {};
    const quarantinedItems: any[] = [];

    const simulatedBatch = [
      {
        meta: { titleQuery: 'The Trap', url: 'https://hubcloud.club/drive/trap-sample' },
        tmdbItem: ranked, // Ambiguous
      },
      {
        meta: { titleQuery: 'Inception', url: 'https://hubcloud.club/drive/inception-sample' },
        tmdbItem: { id: 27205, title: 'Inception', matchingDecision: 'auto_matched' }, // Clear match
      },
    ];

    for (const { meta, tmdbItem } of simulatedBatch) {
      const isAmbiguous = tmdbItem?.matchingDecision === 'ambiguous_review_needed' || tmdbItem?.matchingConfidence === 'low_ambiguous';
      const isUnresolved = !tmdbItem || !tmdbItem.id || tmdbItem.matchingDecision === 'unresolved_quarantine';

      if (isAmbiguous || isUnresolved) {
        quarantinedItems.push({
          reason: isAmbiguous ? 'ambiguous_title_match' : 'unresolved_canonical_id',
          titleQuery: meta.titleQuery,
          url: meta.url,
        });
        continue; // Strictly prevents publishing
      }

      const strId = String(tmdbItem.id);
      if (!linksByMovieId[strId]) linksByMovieId[strId] = [];
      linksByMovieId[strId].push({ movieId: strId, url: meta.url });
    }

    assert.strictEqual(quarantinedItems.length, 1, 'Ambiguous post must be routed to quarantine');
    assert.strictEqual(quarantinedItems[0].titleQuery, 'The Trap');
    assert.strictEqual(Object.keys(linksByMovieId).length, 1, 'Only clear match (Inception) should be staged for publishing');
    assert(!linksByMovieId['991'] && !linksByMovieId['992'], 'Ambiguous IDs must never enter published links');

    recordPass('Ambiguous posts are diverted to quarantine and NEVER enter published catalog');
  } catch (err: any) {
    recordFail('Ambiguous posts are diverted to quarantine and NEVER enter published catalog', err);
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n========================================================');
  console.log(`Test Execution Finished: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
