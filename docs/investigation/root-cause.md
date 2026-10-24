# Root Cause Investigation Report: CineFuel Telegram Bot & Supabase Data Integrity

**Date:** 2026-10-16  
**Branch:** `fix/telegram-supabase-integrity`  
**Status:** Investigation Completed (Stage 1 & Stage 3)

---

## 1. Executive Summary

A comprehensive architectural trace and forensic analysis of the CineFuel Telegram ingestion pipelines, release parsers, and data storage layers was conducted. 

The investigation confirmed that the reported symptoms:
1. Destination links saved under the wrong movie or TV title;
2. Posters missing or belonging to the wrong title;
3. Some records being correct while others are corrupted;

originate from a combination of:
- **Audio codec/channel regex false-positives** (`x264`/`x265` parsed as `episodeNumber: 264/265`), which inverts media classification from Movie to TV and matches unrelated TV shows on TMDB;
- **Dual ID pollution** where raw numeric IMDb IDs (e.g. `tt17024450` -> `17024450`) were saved as `movieId` instead of canonical TMDB IDs (`670292`), causing frontend lookups to resolve wrong or nonexistent media;
- **Dual Bot Architecture Divergence**: Standalone polling bot (`scripts/telegramBot.mjs`) bypassed Supabase entirely (writing to local JSON, Redis, and legacy MongoDB Atlas), whereas the webhook bot (`src/app/api/telegram/route.ts` & `src/lib/telegramBotCore.ts`) wrote to Supabase;
- **Database Schema & Key Integrity Defects**: Missing compound uniqueness on `(movie_id, media_type)` and `(movie_id, url)` in Supabase, non-atomic multi-step writes (`delete` followed by `insert`), and silent fallback of `getSupabaseAdminClient()` to the public `anon` key.

---

## 2. Ingestion Path Architecture Trace

There are two distinct entrypoints for Telegram updates in the codebase:

### Path A: Serverless Webhook Endpoint (Next.js App Router / Cloudflare Worker)
```
Telegram Webhook POST -> src/app/api/telegram/route.ts (POST)
  -> Check TELEGRAM_WEBHOOK_SECRET
  -> processTelegramMessage(fromId, text) [src/lib/telegramBotCore.ts]
    -> cleanTitleForSearch(text)
    -> searchTmdbMedia(query, year, sensedType) [src/lib/telegramBotCore.ts]
    -> parseFullMediaTitle(text, primaryUrl) [src/lib/seasonParser.ts]
    -> saveLinkToServerDatabase(movieId, linkObj) [src/lib/telegramBotCore.ts]
      -> saveLinkToDatabase(movieId, link) [src/lib/redisDb.ts]
        -> saveLinkToSupabase(movieId, link) [src/lib/supabaseDb.ts]
          -> mapLinkToSupabaseRow(movieId, link)
          -> supabase.from('links').upsert(row, { onConflict: 'id' })
        -> redisClient.hset(REDIS_HASH_KEY, ...)
  -> sendTelegramPhotoCard(chatId, card) [src/app/api/telegram/route.ts]
```

### Path B: Standalone Long-Polling Daemon (`npm run bot`)
```
Telegram Polling getUpdates -> scripts/telegramBot.mjs (handleMessage)
  -> extractBlockMetadata(block.text, block.url) [scripts/telegramBot.mjs]
    -> parseReleaseDetails(text, url) [src/lib/releaseParser.ts]
  -> searchTmdb(query, year, mediaType) [scripts/telegramBot.mjs]
    -> TMDB /search/movie or /search/tv
    -> Fallback: resolveCanonicalMedia(imdbId)
  -> saveMultipleLinks(linksByMovieId) [scripts/telegramBot.mjs]
    -> 1. fs.writeFileSync('src/data/serverLinks.json')
    -> 2. redisClient.hset('cinefuel:curated_links', ...)
    -> 3. mongoDb.collection('links').bulkWrite(...) [LEGACY MONGODB]
    -> ❌ NEVER WRITES TO SUPABASE!
```

---

## 3. Detailed Findings & Root-Cause Classification

### [CONFIRMED] DEFECT 1: `x264` / `x265` Codec Misparsed as TV Episode Number
- **Files & Lines:** 
  - `src/lib/releaseParser.ts` lines 177–187
  - `src/lib/seasonParser.ts` lines 164–170
  - `scripts/telegramBot.mjs` lines 370–380
- **Evidence:** In `backups/rollback_contaminated_13_links.json`:
  - `The Equalizer 3 (2023) 1080p BluRay [Hindi DDP 5.1 + English DDP 7.1] x264 ...`: stored as `mediaType: "tv"`, `category: "SingleEpisode"`, `episodeNumber: 264`.
  - `The Equalizer 2 (2018) ... x264 ...`: stored as `mediaType: "tv"`, `episodeNumber: 264`.
  - `Nosferatu (2024) ... x265 ...`: stored as `mediaType: "tv"`, `episodeNumber: 265`.
  - `Wonder Woman (2017) ... x264 ...`: stored as `mediaType: "tv"`, `episodeNumber: 264`.
- **Root Cause:** In release titles, audio specs like `[Hindi DDP 5.1 + English DDP 7.1] x264` had `1]` preceding `x264`. The regex `\b([1-9]\d{0,1})\s*x\s*0*([1-9]\d{0,2})\b` captured `1` as Season and `264` as Episode.
  Once `isEpisode` evaluated to `true`, the bot forcibly set `mediaType = 'tv'`.
  When querying TMDB for TV instead of Movie, TMDB either:
  1. Found a TV series sharing the same title (e.g. *The Equalizer* 2021 TV show instead of *The Equalizer 3* 2023 movie);
  2. Failed to match any TV show, causing fallback to IMDb scrapers which returned Amazon CDN poster URLs or mismatched metadata.

### [CONFIRMED] DEFECT 2: Raw Numeric IMDb ID Stored as `movieId` Instead of TMDB ID
- **Files & Lines:**
  - `scripts/telegramBot.mjs` lines 664–680, 2539, 2569
  - `src/lib/tmdb.ts` lines 240–280
- **Evidence:**
  - In `rollback_contaminated_13_links.json`:
    - `The Equalizer 3`: `movieId: "17024450"` (IMDb ID `tt17024450`; actual TMDB movie ID is `670292`).
    - `The Equalizer 2`: `movieId: "3766354"` (IMDb ID `tt3766354`; actual TMDB movie ID is `345887`).
    - `Wonder Woman`: `movieId: "451279"` (IMDb ID `tt0451279`; actual TMDB movie ID is `297762`).
    - `Nosferatu`: `movieId: "5040012"` (IMDb ID `tt5040012`; actual TMDB movie ID is `426063`).
- **Root Cause:** When canonical overrides or fallback IMDb lookups fired, the bot stripped `tt` or `tt0*` and assigned the remaining numeric string directly to `linkObj.movieId = String(movieId)`. The web frontend routing and TMDB metadata fetcher expects TMDB IDs. When querying TMDB with ID `17024450`, TMDB returns 404 or an arbitrary foreign title, leaving posters broken or displaying the wrong title.

### [CONFIRMED] DEFECT 3: TMDB Movie vs TV ID Collision
- **Files & Lines:**
  - `src/lib/supabaseDb.ts` lines 76–80 (`.from('links').select('*').eq('movie_id', mId)`)
  - `src/lib/redisDb.ts` lines 191, 374
- **Evidence:** TMDB integer IDs for movies and TV shows are distinct namespaces that overlap (e.g. Movie 1399 vs TV 1399).
- **Root Cause:** `links` in Supabase stores `movie_id` as a plain string without compounding with `media_type`. Queries fetching links by `movie_id` do not filter by `media_type`, causing destination links for TV shows and movies sharing the same TMDB ID to collide under the same page.

### [CONFIRMED] DEFECT 4: Dual Bot Implementations Diverge Across Data Stores
- **Files & Lines:**
  - `scripts/telegramBot.mjs` lines 757–825
  - `src/lib/telegramBotCore.ts` lines 149–156, 437
  - `src/lib/redisDb.ts` line 391
- **Evidence:** `scripts/telegramBot.mjs` writes strictly to `serverLinks.json`, Upstash Redis, and MongoDB Atlas. It does NOT call `saveLinkToSupabase`. Conversely, the webhook route (`src/lib/telegramBotCore.ts`) writes to Supabase.
- **Root Cause:** Links ingested via long-polling were never written to Supabase, explaining why "some records are correct and others are wrong" or missing across administrative and public views.

### [CONFIRMED] DEFECT 5: Supabase Admin Client Silently Falls Back to Public Anon Key
- **Files & Lines:**
  - `src/lib/supabase.ts` line 14:
    `const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SUPABASE_SERVICE_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');`
- **Evidence:** If `SUPABASE_SERVICE_ROLE_KEY` is undefined in an environment, `getSupabaseAdminClient()` silently initializes with `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Root Cause:** Under Supabase RLS, inserts or updates attempted with the anon key fail with 0 rows affected and NO error thrown by `supabase-js`. The application treats the operation as successful even though zero records were written.

### [CONFIRMED] DEFECT 6: Missing Unique Constraint on `(movie_id, url)` and Webhook Duplicate Ingestion
- **Files & Lines:**
  - `src/lib/supabaseDb.ts` lines 98–100 (`upsert(row, { onConflict: 'id' })`)
  - `src/lib/telegramBotCore.ts` line 412 (`customLinkId = 'tg-' + Date.now() + ...`)
- **Evidence:** Because `id` is always randomly generated per invocation, `onConflict: 'id'` never triggers a conflict on re-ingestion of the same link URL.
- **Root Cause:** Without a unique constraint on `(movie_id, url)` in Postgres, webhook retries from Telegram (triggered whenever TMDB requests exceed 5 seconds) create duplicate link rows.

### [CONFIRMED] DEFECT 7: Non-Atomic Multi-Step Replacement in `replaceAllLinksForTitleInSupabase`
- **Files & Lines:**
  - `src/lib/supabaseDb.ts` lines 148–169
- **Evidence:**
  ```typescript
  await supabase.from('links').delete().eq('movie_id', mId);
  await supabase.from('links').insert(rows);
  ```
- **Root Cause:** This is executed as two separate HTTP REST calls without a transaction. If network failure, timeout, or validation error occurs on step 2, all destination links for the title are irrevocably deleted.

### [CONFIRMED] DEFECT 8: Poster URL Resolution, Sizing, and Amazon CDN URLs
- **Files & Lines:**
  - `src/lib/telegramBotCore.ts` lines 458–460
  - `backups/rollback_contaminated_13_links.json` lines 7, 21, 39, 53
- **Evidence:** Stored posters include `https://m.media-amazon.com/images/M/...` instead of standard TMDB paths (`/abc.jpg`).
- **Root Cause:** Telegram's `sendPhoto` API often rejects or times out on certain external CDN URLs, or fails if the path lacks proper prefixing. When `sendPhoto` fails, the bot fails to render the photo card.

### [POTENTIAL] DEFECT 9: Missing Deduplication on Telegram `update_id`
- **Files & Lines:**
  - `src/app/api/telegram/route.ts` lines 144–150
- **Evidence:** Telegram webhooks send an integer `update_id`. The route currently parses `update.message` without recording or checking `update_id`.
- **Root Cause:** If processing takes longer than Telegram's webhook timeout (5s), Telegram retries the exact same `update_id`, causing concurrent duplicate executions.

### [POTENTIAL] DEFECT 10: In-Memory Conversation State Lost Across Serverless Invocations
- **Files & Lines:**
  - `src/lib/telegramBotCore.ts` line 6 (`const recentMessagesCache = new Map<string, number>();`)
  - `scripts/telegramBot.mjs` line 2131 (`pendingChatState = new Map()`)
- **Evidence:** Cloudflare Workers and serverless containers do not share memory across instances.
- **Root Cause:** Multi-turn conversational commands or rapid deduplication caches fail across distributed serverless invocations.

---

## 4. Summary Table of Defect Classifications

| Defect ID | Description | Classification | Affected Files |
|-----------|-------------|----------------|----------------|
| DEF-1 | `x264`/`x265` parsed as episode number, turning movies into TV | **CONFIRMED** | `src/lib/releaseParser.ts`, `src/lib/seasonParser.ts`, `scripts/telegramBot.mjs` |
| DEF-2 | Numeric IMDb ID stored as `movieId` instead of TMDB ID | **CONFIRMED** | `scripts/telegramBot.mjs`, `src/lib/tmdb.ts`, `src/lib/canonicalMedia.ts` |
| DEF-3 | TMDB ID collision between movie and TV without compound key | **CONFIRMED** | `src/lib/supabaseDb.ts`, `src/lib/redisDb.ts` |
| DEF-4 | Polling bot writes to Mongo/Redis/JSON, bypassing Supabase | **CONFIRMED** | `scripts/telegramBot.mjs` |
| DEF-5 | Supabase admin client falls back to public anon key | **CONFIRMED** | `src/lib/supabase.ts` |
| DEF-6 | Missing unique constraint on `(movie_id, url)` causing duplicate rows | **CONFIRMED** | `src/lib/supabaseDb.ts` |
| DEF-7 | Non-atomic delete-then-insert in `replaceAllLinksForTitleInSupabase` | **CONFIRMED** | `src/lib/supabaseDb.ts` |
| DEF-8 | Malformed poster path and external Amazon CDN URLs in photo card | **CONFIRMED** | `src/lib/telegramBotCore.ts`, `scripts/telegramBot.mjs` |
| DEF-9 | Missing `update_id` deduplication table (`processed_updates`) | **POTENTIAL** | `src/app/api/telegram/route.ts` |
| DEF-10 | In-memory conversation state lost across serverless instances | **POTENTIAL** | `src/lib/telegramBotCore.ts`, `scripts/telegramBot.mjs` |
