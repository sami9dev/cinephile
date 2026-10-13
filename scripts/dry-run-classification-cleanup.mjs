import { MongoClient } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://shyam:shyam081@cluster0.fiwla4n.mongodb.net/cinefuel?retryWrites=true&w=majority';

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('cinefuel');
  const coll = db.collection('links');

  const targetMovieIds = ['5040012', '451279', '3766354', '17024450'];

  // 1. Fetch all links for these 4 movie IDs to inspect both clean and contaminated links
  const allTargetDocs = await coll.find({ movieId: { $in: targetMovieIds } }).sort({ movieId: 1, createdAt: 1 }).toArray();
  console.log(`Total links found across target movie IDs: ${allTargetDocs.length}`);

  // 2. Identify contaminated links: mediaType === 'tv' or episodeNumber in [264, 265, 266]
  const contaminated = allTargetDocs.filter(d => d.mediaType === 'tv' || [264, 265, 266].includes(d.episodeNumber));
  console.log(`Contaminated TV links found: ${contaminated.length}`);

  // Confirm every contaminated link belongs to one of the 4 movie IDs
  const allBelong = contaminated.every(d => targetMovieIds.includes(String(d.movieId)));
  console.log(`All belong to target movie IDs: ${allBelong}`);

  // 3. Save full original documents for rollback
  const backupDir = path.join(process.cwd(), 'src', 'data');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, 'rollback_contaminated_13_links.json');
  fs.writeFileSync(backupPath, JSON.stringify(contaminated, null, 2), 'utf8');
  console.log(`Rollback backup written to: ${backupPath}`);

  // 4. Inspect sister links to see existing category/linkType conventions for each title
  const sisterLinksByMovie = {};
  allTargetDocs.filter(d => d.mediaType === 'movie').forEach(d => {
    sisterLinksByMovie[d.movieId] = sisterLinksByMovie[d.movieId] || [];
    sisterLinksByMovie[d.movieId].push(d);
  });

  console.log('\n--- SISTER LINKS CONVENTIONS ---');
  for (const mId of targetMovieIds) {
    const sisters = sisterLinksByMovie[mId] || [];
    console.log(`MovieId ${mId} has ${sisters.length} clean movie links. Samples:`);
    sisters.slice(0, 2).forEach(s => {
      console.log(`  - id: ${s.id}, category: "${s.category}", linkType: "${s.linkType}", quality: "${s.quality}"`);
    });
  }

  // 5. Build proposed updates individually
  const proposedChanges = contaminated.map((doc, idx) => {
    // Individual determination of category:
    // If original was "SingleEpisode" or "ZipPack", determine based on doc's url or provider or sister link
    // Most movies in CineFuel use 'Streaming' for web/hubcloud drive links, or 'Download' for direct downloads.
    // For HubCloud drive links, sister clean links use 'Streaming'.
    let determinedCategory = 'Streaming';
    if (doc.url && (doc.url.includes('/drive/') || doc.url.includes('hubcloud') || doc.url.includes('gdflix'))) {
      determinedCategory = 'Streaming';
    } else if (doc.url && /\.(mkv|mp4|zip|rar)/i.test(doc.url)) {
      determinedCategory = 'Download';
    } else {
      const sisters = sisterLinksByMovie[doc.movieId] || [];
      determinedCategory = sisters[0]?.category || 'Streaming';
    }

    // linkType determination: 'general' for movie links (matching clean movie sister links)
    const sisters = sisterLinksByMovie[doc.movieId] || [];
    const sisterLinkType = sisters[0]?.linkType || 'general';

    const proposedDoc = {
      ...doc,
      mediaType: 'movie',
      seasonNumber: null,
      episodeNumber: null,
      linkType: sisterLinkType,
      category: determinedCategory,
    };

    return {
      index: idx + 1,
      id: doc.id,
      _id: doc._id,
      movieId: doc.movieId,
      movieTitle: doc.movieTitle,
      title: doc.title,
      url: doc.url,
      quality: doc.quality,
      codec: doc.codec,
      resolution: doc.resolution,
      before: {
        mediaType: doc.mediaType,
        seasonNumber: doc.seasonNumber,
        episodeNumber: doc.episodeNumber,
        linkType: doc.linkType,
        category: doc.category,
      },
      after: {
        mediaType: proposedDoc.mediaType,
        seasonNumber: proposedDoc.seasonNumber,
        episodeNumber: proposedDoc.episodeNumber,
        linkType: proposedDoc.linkType,
        category: proposedDoc.category,
      },
      unchangedFields: {
        id: doc.id,
        _id: String(doc._id),
        movieId: doc.movieId,
        url: doc.url,
        title: doc.title,
        movieTitle: doc.movieTitle,
        quality: doc.quality,
        codec: doc.codec,
        resolution: doc.resolution,
        dynamicRange: doc.dynamicRange,
        bitDepth: doc.bitDepth,
        container: doc.container,
        provider: doc.provider,
        serverName: doc.serverName,
        serverBadge: doc.serverBadge,
        audioLanguage: doc.audioLanguage,
        createdAt: doc.createdAt,
      }
    };
  });

  const dryRunReportPath = path.join(backupDir, 'dry_run_classification_diff.json');
  fs.writeFileSync(dryRunReportPath, JSON.stringify(proposedChanges, null, 2), 'utf8');
  console.log(`Dry run diff report written to: ${dryRunReportPath}`);

  await client.close();
}

main().catch(console.error);
