import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';
import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';
import http from 'http';
import { parseReleaseDetails, formatTelegramReleaseSummary } from '../src/lib/releaseParser.ts';
import { resolveCanonicalMedia } from '../src/lib/canonicalMedia.ts';

// Ensure IPv4 lookup precedence for stable TMDB API and external cloud connections
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment from .env.local if exists
const envPath = path.join(rootDir, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        let k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        v = v.replace(/^["']|["']$/g, '').trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  });
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ FATAL: TELEGRAM_BOT_TOKEN is not set in environment or .env.local');
  process.exit(1);
}

// Global process crash shields: keep bot alive 24/7
process.on('uncaughtException', (err) => {
  console.error('🛡️ Process shielded from uncaughtException:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('🛡️ Process shielded from unhandledRejection:', reason);
});

const TMDB_API_KEY = (process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || '').trim();
const SITE_URL = (process.env.LIVE_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://cinephile.sk6216071.workers.dev')
  .replace('http://localhost:3000', 'https://cinephile.sk6216071.workers.dev')
  .replace('cineflue084.sk6216071.workers.dev', 'cinephile.sk6216071.workers.dev')
  .replace(/\/+$/, '');
const DATA_FILE = path.join(rootDir, 'src', 'data', 'serverLinks.json');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let supabaseClient = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    console.log('⚡ Supabase Database Connected (Service Role)!');
  } catch (e) {
    console.warn('Supabase init warning:', e.message);
  }
}

// Strictly validates that movieId is a genuine TMDB ID (1-7 digits)
// and rejects unmapped 8+ digit raw numeric IMDb IDs (e.g. 17024450)
export function isValidTmdbId(id) {
  if (!id) return false;
  const str = String(id).trim();
  return /^\d{1,7}$/.test(str);
}

// Authorized Admin IDs (Shyam)
const AUTHORIZED_TELEGRAM_IDS = [930928310];

// Memory state for multi-message uploads & interactive modes
const pendingChatState = new Map();

console.log('🤖 Starting Resilient Batch CineFuel Telegram Polling Daemon...');
console.log(`📡 Connected to Bot: @CineFlue_bot`);
console.log(`📁 Database Path: ${DATA_FILE}`);

async function registerBotCommands() {
  try {
    const res = await safeFetch(`https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'movie', description: 'Upload a Movie link (4K / 1080p / BluRay)' },
          { command: 'episode', description: 'Upload a Single TV Episode (S01E01)' },
          { command: 'bulk', description: 'Bulk upload multiple TV episodes' },
          { command: 'zip', description: 'Upload a Full Season Zip/Pack' },
          { command: 'requests', description: 'View & fulfill pending user movie/series requests' },
          { command: 'reports', description: 'View & fix broken link reports' },
          { command: 'reply', description: 'Reply to request or report: /reply <id> <msg>' },
          { command: 'resolve', description: 'Resolve request or report: /resolve <id> [link]' },
          { command: 'auto', description: 'Full Auto-Sensing Mode' },
          { command: 'domain', description: '1-Click switch HubCloud or GDFlix domain across all links' },
          { command: 'hubcloud', description: 'Update all HubCloud links (e.g. /hubcloud hubcloud.cx)' },
          { command: 'gdflix', description: 'Update all GDFlix links (e.g. /gdflix new1.gdflix.io)' },
          { command: 'status', description: 'Check database & bot status' },
          { command: 'help', description: 'Show commands and upload examples' },
        ],
      }),
    });
    const data = await res?.json();
    if (data?.ok) {
      console.log('🤖 Telegram Slash Commands Registered Successfully with Telegram API!');
    }
  } catch (err) {
    console.warn('Could not register bot commands:', err.message);
  }
}

async function sendChatAction(chatId, action = 'typing') {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {}
}

async function safeFetch(url, options = {}, retries = 2) {
  const timeoutMs = options.timeoutMs || 8000;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CineFuel/1.0', 'Accept': 'application/json', ...(options.headers || {}) },
        signal: controller.signal,
        ...options,
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 250 * attempt));
    }
  }
}

// Strict URL regex: matches http(s):// or www. or domain with path slash
// Never matches audio codec names like DTS-HD.MA or media file extensions!
const STRICT_URL_REGEX = /(?:https?:\/\/[^\s<>'"`]+|www\.[^\s<>'"`]+|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|cx|in|co|cc|me|app|dev|to|is|pw|club|vip|link|xyz|live|pro|site|online|top|info|stream|ws|download|tech|click|cloud|movie|nz)\/[^\s<>'"`]*)/gi;

function detectServer(url) {
  if (!url) return { name: 'Direct Server', badge: '⚡ Direct Server' };
  let host = '';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    const m = url.match(/(?:https?:\/\/)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
    host = m ? m[1].toLowerCase() : '';
  }

  if (host.includes('hubcloud')) return { name: 'HubCloud', badge: '⚡ HubCloud' };
  if (host.includes('gdflix')) return { name: 'GDFlix', badge: '🚀 GDFlix' };
  if (host.includes('drive.google')) return { name: 'Google Drive', badge: '📁 Google Drive' };
  if (host.includes('gofile')) return { name: 'GoFile', badge: '⚡ GoFile' };
  if (host.includes('mega.nz') || host.includes('mega.io')) return { name: 'MEGA', badge: '🔴 MEGA' };
  if (host.includes('1fichier')) return { name: '1Fichier', badge: '🗄️ 1Fichier' };
  if (host.includes('mediafire')) return { name: 'MediaFire', badge: '🔥 MediaFire' };
  if (host.includes('terabox')) return { name: 'TeraBox', badge: '📦 TeraBox' };
  if (host.includes('filepress')) return { name: 'FilePress', badge: '⚡ FilePress' };
  if (host.includes('streamtape') || host.includes('dood') || host.includes('mixdrop') || host.includes('streamwish')) {
    return { name: 'Stream Player', badge: '▶️ Stream Player' };
  }
  if (host) {
    const parts = host.split('.');
    const base = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    const cap = base.charAt(0).toUpperCase() + base.slice(1);
    return { name: cap, badge: `🔗 ${cap}` };
  }
  return { name: 'Direct Server', badge: '⚡ Direct Server' };
}

/**
 * Splits multi-line releases into distinct blocks (1 block per link).
 * Each release block spans from the end of the previous URL up to the end of current URL.
 */
function splitMessageIntoReleaseBlocks(text) {
  const matches = [];
  let m;
  const regex = new RegExp(STRICT_URL_REGEX.source, 'gi');

  while ((m = regex.exec(text)) !== null) {
    let clean = m[0].replace(/[),.;\]]+$/, '');
    const host = clean.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    if (!host.includes('.')) continue;
    if (/\.(mkv|mp4|avi|zip|rar|7z|tar|srt|txt|sub)$/i.test(host)) continue;

    const fullUrl = clean.startsWith('http') ? clean : 'https://' + clean;
    matches.push({
      url: fullUrl,
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  if (matches.length <= 1) {
    return [{ text: text.trim(), url: matches[0]?.url }];
  }

  const blocks = [];
  let prevEnd = 0;

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const blockText = text.substring(prevEnd, cur.end).trim();
    blocks.push({
      text: blockText,
      url: cur.url,
    });
    prevEnd = cur.end;
  }

  return blocks;
}

function cleanLeadingLabels(str) {
  if (!str) return '';
  return str
    .replace(/^[\s\r\n]*(?:\[?\d{1,3}[\]).:-]\s*)?(?:(?:Name|Title|Movie(?:\s*Name)?|Series(?:\s*Name)?|Show(?:\s*Name)?|Film(?:\s*Name)?|File(?:\s*Name)?|Filename|Release)\s*[-:=]+\s*)+/gi, '')
    .replace(/^[\s(\[]*\d{1,3}[\s)\]]*[\s._\-:]+/i, '')
    .replace(/^(?:Name|Title|Movie|Series|Show|Film|File|Release)\s*:\s*/gi, '')
    .trim();
}

function extractBlockMetadata(text, fallbackUrl, forcedMode = null) {
  let url = fallbackUrl;
  let rawReleaseTitle = '';

  const mdMatch = text.match(/\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/i);
  if (mdMatch) {
    url = mdMatch[2];
    if (mdMatch[1] && mdMatch[1].trim().length >= 8) {
      rawReleaseTitle = mdMatch[1].trim();
    }
  } else if (!url) {
    const rawUrlMatch = text.match(STRICT_URL_REGEX);
    if (rawUrlMatch) {
      url = rawUrlMatch[0].startsWith('http') ? rawUrlMatch[0] : 'https://' + rawUrlMatch[0];
    }
  }

  if (!rawReleaseTitle) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const candidate = lines.find(l => !l.startsWith('http') && /(?:1080p|2160p|720p|4k|bluray|remux|web-dl|hevc|x265|x264|\.mkv|\.mp4)/i.test(l)) || lines[0];
    if (candidate && candidate.length >= 8 && !candidate.startsWith('http')) {
      rawReleaseTitle = candidate
        .replace(/(?:Link|URL|Download)\s*[-:=]+\s*/gi, '')
        .replace(/https?:\/\/[^\s]+/gi, '')
        .trim();
    }
  }

  if (rawReleaseTitle) {
    rawReleaseTitle = rawReleaseTitle
      .replace(/^(?:📥|🔗|⚡|🔥|🎬|▶️|\d+\.|\d+\))\s*/gu, '')
      .replace(/^(?:Name|Title|Movie|Download|Link)\s*[-:=]+\s*/i, '')
      .trim();
  }

  let cleanText = text
    .replace(/\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/gi, ' ')
    .replace(new RegExp(STRICT_URL_REGEX.source, 'gi'), ' ')
    .replace(/(?:Link|URL)\s*[-:=]+\s*[^\s\r\n]+/gi, ' ')
    .replace(/(?:HubCloud|GDFlix|Gofile|Drive|Server)\s*[-:=]+\s*/gi, ' ')
    .replace(/https?:\/\/[^\s]+/gi, ' ')
    .replace(/www\.[^\s]+/gi, ' ');

  if (url) {
    cleanText = cleanText.split(url).join(' ');
  }

  // Strip release groups, website domains, and media container extensions from cleanText
  cleanText = cleanText
    .replace(/[-_.\s]*[a-zA-Z0-9_-]*(?:hub|mod|hd|flix|drive|cx|com|org|net|me|in|to)\.(?:com|org|net|mkv|mp4|avi)\b/gi, ' ')
    .replace(/\b(?:4khdhub|hdhub4u|moviesmod|bollyflix|dotmovies|vegamovies|katmoviehd|uhdmovies)[^\s]*\b/gi, ' ')
    .replace(/\.(mkv|mp4|avi|m4v)\b/gi, ' ');

  // Strip leading labels at start of text or lines
  cleanText = cleanLeadingLabels(cleanText);

  // 1. Explicit key-value labels if present
  const getField = (pattern) => {
    const m = cleanText.match(pattern);
    return m ? m[1].replace(/^[-\s:=]+/, '').trim() : undefined;
  };

  const explicitTitle = getField(/(?:^|\n)\s*(?:Title|Name|Movie|Series|Show)\s*[-:=]+\s*([^\n\r]+)/i);
  const explicitQuality = getField(/(?:^|\n)\s*Quality\s*[-:=]+\s*([^\n\r]+)/i);
  let explicitAudio = getField(/(?:^|\n)\s*(?:Language|Audio)\s*[-:=]+\s*([^\n\r]+)/i);
  let explicitSize = getField(/(?:^|\n)\s*(?:File\s*size|Size)\s*[-:=]+\s*([^\n\r]+)/i);
  let explicitType = getField(/(?:^|\n)\s*Media\s*Type\s*[-:=]+\s*([^\n\r]+)/i);

  // 2. Bracketed file size e.g. [5.75 GB] or [15.42 GB]
  if (!explicitSize) {
    const sizeMatch = cleanText.match(/\[?\b(\d+(?:\.\d+)?\s*(?:GB|MB|TB))\b\]?/i);
    if (sizeMatch) {
      explicitSize = sizeMatch[1].toUpperCase();
      cleanText = cleanText.replace(sizeMatch[0], ' ');
    }
  }

  // 3. Audio detection (bracketed or inline)
  if (!explicitAudio) {
    const bracketAudioMatch = cleanText.match(/\[([^\]]*(?:Hindi|English|Tamil|Telugu|Malayalam|Kannada|Dual|Multi|Audio|Dub|DDP|Atmos|TrueHD|DTS)[^\]]*)\]/i);
    if (bracketAudioMatch) {
      explicitAudio = bracketAudioMatch[1].trim();
      cleanText = cleanText.replace(bracketAudioMatch[0], ' ');
    }
  }

  if (!explicitAudio) {
    const langs = [];
    if (/\b(?:Dual[\s._-]?Audio)\b/i.test(cleanText)) langs.push('Dual Audio');
    else if (/\b(?:Multi[\s._-]?Audio)\b/i.test(cleanText)) langs.push('Multi Audio');

    if (/\bHindi\b/i.test(cleanText) && !langs.includes('Dual Audio')) langs.push('Hindi');
    if (/\bEnglish\b/i.test(cleanText) && !langs.includes('Dual Audio')) langs.push('English');
    if (/\bTamil\b/i.test(cleanText)) langs.push('Tamil');
    if (/\bTelugu\b/i.test(cleanText)) langs.push('Telugu');
    if (/\bMalayalam\b/i.test(cleanText)) langs.push('Malayalam');
    if (/\bKannada\b/i.test(cleanText)) langs.push('Kannada');

    const codecs = [];
    if (/\bAtmos\b/i.test(cleanText)) codecs.push('Atmos');
    if (/\bTrueHD\b/i.test(cleanText)) codecs.push('TrueHD');
    if (/DTS-HD(?:\.MA)?/i.test(cleanText)) codecs.push('DTS-HD MA');
    else if (/\bDTS\b/i.test(cleanText)) codecs.push('DTS');
    if (/DDP[\s._-]?5\.1/i.test(cleanText)) codecs.push('DDP 5.1');
    else if (/DD[\s._-]?5\.1/i.test(cleanText)) codecs.push('DD 5.1');

    if (langs.length > 0 || codecs.length > 0) {
      explicitAudio = [...langs, ...codecs].join(' ');
    }
  }

  // 4. Year
  const yearMatch = cleanText.match(/\b(19\d\d|20\d\d)\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  // 5. TV Season & Episode detection (supports S01...S100+ and E01...E100+)
  let season = undefined;
  let episode = undefined;

  // A. Combined Season & Episode e.g. S01E05, S1 E1, S02-EP03, S01.E04, 2x05
  const seMatch = cleanText.match(/(?:^|[\s._\-[\]()])s0*(\d{1,3})[\s._\-]*(?:ep|episode|e)[\s._-]?0*(\d{1,4})(?:[\s._\-[\]()]|\b)/i) ||
                  cleanText.match(/(?:^|[\s._\-[\]()])([1-9]\d{0,1})x0*([1-9]\d{0,2})(?:[\s._\-[\]()]|\b)(?!(?:264|265|266|vid)\b)/i);
  if (seMatch) {
    const candidateSeason = parseInt(seMatch[1], 10);
    const candidateEp = parseInt(seMatch[2], 10);
    // Audio channel/codec false-positive guard: 264/265/266 is a codec, not an episode
    if (![264, 265, 266].includes(candidateEp)) {
      season = candidateSeason;
      episode = candidateEp;
    }
  }

  // B. Standalone Season e.g. S01, Season 2, Season-03
  if (season === undefined) {
    const sMatch = cleanText.match(/(?:^|[\s._\-[\]()])s0*(\d{1,3})(?:[\s._\-[\]()]|\b)/i) ||
                  cleanText.match(/(?:^|[\s._\-[\]()])season[\s._-]?0*(\d{1,3})(?:[\s._\-[\]()]|\b)/i);
    if (sMatch) season = parseInt(sMatch[1], 10);
  }

  // C. Standalone Episode e.g. E05, Ep 12, Episode 3
  if (episode === undefined) {
    const eMatch = cleanText.match(/(?:^|[\s._\-[\]()])(?:ep|episode)[\s._-]?0*(\d{1,4})(?:[\s._\-[\]()]|\b)/i) ||
                  cleanText.match(/(?:^|[\s._\-[\]()])e0*(\d{1,4})(?:[\s._\-[\]()]|\b)(?![0-9]*p\b)/i);
    if (eMatch) episode = parseInt(eMatch[1], 10);
  }

  // 6. Universal Shared Parser Integration (Strict Independence of Properties)
  const parsedRelease = parseReleaseDetails(rawReleaseTitle || text, url);

  if (parsedRelease.episodeNumber !== undefined) {
    episode = parsedRelease.episodeNumber;
  }
  if (parsedRelease.seasonNumber !== undefined) {
    season = parsedRelease.seasonNumber;
  }

  // File container: .zip is ZIP archive, .mkv is MKV video file
  let isZip = parsedRelease.container === 'ZIP' || parsedRelease.container === 'RAR' || parsedRelease.container === '7Z';
  let isPack = parsedRelease.isPack;

  if (forcedMode === 'zip') {
    isZip = true;
    isPack = true;
    explicitType = 'tv';
    if (!season) season = 1;
    episode = undefined;
  } else if (forcedMode === 'episode') {
    isZip = false;
    isPack = false;
    explicitType = 'tv';
    if (!season) season = 1;
    if (episode === undefined) episode = 1;
  } else if (forcedMode === 'movie') {
    isZip = false;
    isPack = false;
    explicitType = 'movie';
    season = undefined;
    episode = undefined;
  } else {
    // HubCloud Pack label must NEVER turn an individual episode into a pack
    if (episode !== undefined && episode > 0) {
      isPack = false;
    }

    if (season !== undefined || episode !== undefined || isPack || /(?:\bs\d{1,3}(?!\d)|\be\d{1,4}(?!\d)|\bseason\s*\d+|\bepisodes?\b|\bseries\b)/i.test(cleanText)) {
      explicitType = 'tv';
      if (!season) season = 1;
    } else {
      explicitType = 'movie';
      season = undefined;
      episode = undefined;
    }
  }

  // 7. Intelligent Title Extraction
  // Strip emojis, pictographs, and decorative channel bullets from text
  const textWithoutEmojis = cleanText.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ');

  let titleForSearch = '';
  // Rule A: If TV Season/Episode marker present, everything BEFORE it is the show title!
  const sMarker = textWithoutEmojis.match(/^(.*?)(?:[\s._\-[\]()]s0*\d{1,3}|[\s._\-[\]()]season[\s._-]?\d{1,3}|[\s._\-[\]()]e0*\d{1,4}|[\s._\-[\]()](?:ep|episode)[\s._-]?\d{1,4}|[\s._\-[\]()]\d{1,3}x\d{1,4})/i);
  if (sMarker && sMarker[1].trim().length >= 2) {
    titleForSearch = sMarker[1]
      .replace(/\b(19\d\d|20\d\d)\b/g, '')
      .replace(/[\(\)\[\]\{\}\-_.:|•+~#*@/\\=]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } else if (year) {
    // Rule B: If movie with Year, everything BEFORE the year is the movie title!
    const yMarker = textWithoutEmojis.match(/^(.*?)(?:[\s._\-[\]()]|\b)(19\d\d|20\d\d)\b/i);
    if (yMarker && yMarker[1].trim().length >= 2) {
      titleForSearch = yMarker[1].replace(/[\(\)\[\]\{\}\-_.:|•+~#*@/\\=]/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  if (!titleForSearch) {
    titleForSearch = explicitTitle || textWithoutEmojis;
    titleForSearch = titleForSearch.replace(/\b(19\d\d|20\d\d)\b/g, '');
    titleForSearch = titleForSearch.replace(/\bs\d{1,3}(?:\s*e\d{1,4})?\b/gi, '');
    titleForSearch = titleForSearch.replace(/\b(?:season|episode|ep)[\s._-]?\d{1,4}\b/gi, '');
    titleForSearch = titleForSearch.replace(/\b(?:director'?s\s*cut|extended(?:\s*cut)?|theatrical(?:\s*cut)?|unrated|remastered)\b/gi, '');
    titleForSearch = titleForSearch.replace(/\b(?:complete|zip\s*pack|zip|pack|batch)\b/gi, '');
    titleForSearch = titleForSearch.replace(/\b(?:2160p|4k|1080p|720p|480p|uhd|fhd|hd|sd)\b/gi, '');
    titleForSearch = titleForSearch.replace(/\b(?:remux|bluray|blu-ray|web-dl|webrip|web|hdtv|bdrip|dsnp|nf|amzn)\b/gi, '');
    titleForSearch = titleForSearch.replace(/\b(?:hdr10\+|hdr10|hdr|dv|dolby\s*vision|10bit|hevc|x265|x264|h264|h265)\b/gi, '');
    titleForSearch = titleForSearch.replace(/\b(?:esubs?|mkv|mp4|avi|king-bhdstudio|dtins|r3fl3x|h0ne|hybrid)\b/gi, '');
    titleForSearch = titleForSearch.replace(/[\(\)\[\]\{\}\-_.:|•+~#*@/\\=]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Strip leading list numbers, indexes, or release prefixes e.g. "2.", "01.", "[1]", "Name :", "Title :"
  titleForSearch = cleanLeadingLabels(titleForSearch);

  // 8. Quality Detection: NEVER DEFAULT TO SDR!
  let quality = explicitQuality;
  if (!quality) {
    const qParts = [];
    if (parsedRelease.resolutionLabel) qParts.push(parsedRelease.resolutionLabel);
    if (parsedRelease.source && parsedRelease.source !== 'WebDL') qParts.push(parsedRelease.source);
    else if (parsedRelease.source) qParts.push(parsedRelease.sourceLabel);
    if (parsedRelease.dynamicRangeLabel && parsedRelease.dynamicRangeLabel !== 'Unknown') qParts.push(parsedRelease.dynamicRangeLabel);
    if (parsedRelease.bitDepthLabel) qParts.push(parsedRelease.bitDepthLabel);
    if (parsedRelease.codecLabel) qParts.push(parsedRelease.codecLabel);
    if (parsedRelease.provider && parsedRelease.provider !== 'HubCloud') qParts.push(parsedRelease.provider);

    quality = qParts.length > 0 ? qParts.join(' ') : '1080p WEB-DL';
  }

  const releaseSummary = formatTelegramReleaseSummary(rawReleaseTitle || text, url);

  return {
    url,
    titleQuery: titleForSearch,
    year,
    quality,
    audio: explicitAudio ? explicitAudio.replace(/[\[\]]/g, '').trim() : (parsedRelease.audioLabel || 'Hindi + English'),
    size: explicitSize ? explicitSize.replace(/[\[\]]/g, '').trim() : undefined,
    mediaType: explicitType,
    season,
    episode,
    isZip,
    isPack,
    rawReleaseTitle,
    parsedRelease,
    releaseSummary,
  };
}

// Intelligent TMDB result ranking: prioritizes exact title, exact release year, and penalizes distant sequels
function rankTmdbResults(items, cleanQ, targetYear, forcedType) {
  if (!items || items.length === 0) return null;
  const normQ = cleanQ.toLowerCase().trim();
  const scored = items.map((item) => {
    let score = 0;
    const itemTitle = (item.title || item.name || '').toLowerCase().trim();
    const itemYear = (item.release_date || item.first_air_date || '').slice(0, 4);

    // Exact title match gets highest boost
    if (itemTitle === normQ) score += 120;
    else if (itemTitle.startsWith(normQ)) score += 40;

    // Exact year match
    if (targetYear && itemYear === String(targetYear)) score += 80;
    else if (targetYear && Math.abs(Number(itemYear) - Number(targetYear)) <= 1) score += 40;
    else if (targetYear && itemYear && Math.abs(Number(itemYear) - Number(targetYear)) > 2) {
      // Penalize titles with heavily mismatched release years (e.g. 1961 series when searching 2012 movie)
      score -= Math.min(80, Math.abs(Number(itemYear) - Number(targetYear)) * 2);
    }

    // Penalize far future sequels (e.g. 2027 in-production when searching 2025 release)
    if (targetYear && Number(itemYear) > Number(targetYear) + 1) score -= 60;

    // Type match
    if (forcedType && item.media_type === forcedType) score += 50;

    // Popularity tie-breaker
    score += Math.min(item.popularity || 0, 25);

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  if (!scored[0]) return null;

  const top = scored[0];
  const item = { ...top.item };

  // Ambiguity detection: if top 2 results have close scores and different IDs
  if (scored.length > 1 && top.score > 0 && scored[1].score > 0) {
    const scoreDiff = top.score - scored[1].score;
    if (scoreDiff < 15 && top.item.id !== scored[1].item.id) {
      item.matchingDecision = 'ambiguous_review_needed';
      item.matchingConfidence = 'low_ambiguous';
      item.candidates = scored.slice(0, 3).map((s) => ({
        id: s.item.id,
        title: s.item.title || s.item.name,
        media_type: s.item.media_type,
        release_date: s.item.release_date || s.item.first_air_date,
        score: s.score,
      }));
      return item;
    }
  }

  item.matchingDecision = 'auto_matched';
  item.matchingConfidence = top.score >= 100 ? 'high' : 'medium';
  return item;
}

// Global in-memory cache for TMDB results (persists across polls)
const globalTmdbCache = new Map();

/**
 * Dual Identifier: Queries IMDb suggestion API to find authoritative IMDb ID (tt...)
 * and cross-validates release year and media type.
 */
async function searchImdb(cleanQ, targetYear, forcedType) {
  try {
    const cleanTitle = cleanLeadingLabels(cleanQ);
    const slug = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const url = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(slug)}.json`;
    const res = await safeFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeoutMs: 3500,
    }, 2);

    if (res && res.ok) {
      const data = await res.json();
      const list = (data.d || []).filter(
        (item) => item.id && item.id.startsWith('tt') && (item.q === 'feature' || item.q === 'TV series' || item.q === 'TV mini-series')
      );

      let best = null;
      let bestScore = -999;

      for (const item of list) {
        let score = 0;
        const normTitle = (item.l || '').toLowerCase().trim();
        if (normTitle === cleanTitle.toLowerCase()) score += 100;
        else if (normTitle.startsWith(cleanTitle.toLowerCase())) score += 40;

        if (targetYear && item.y === Number(targetYear)) score += 80;
        else if (targetYear && item.y && Math.abs(item.y - Number(targetYear)) <= 1) score += 40;
        else if (targetYear && item.y && Math.abs(item.y - Number(targetYear)) > 2) {
          score -= Math.min(80, Math.abs(item.y - Number(targetYear)) * 2);
        }

        if (forcedType === 'movie' && item.q === 'feature') score += 50;
        if (forcedType === 'tv' && (item.q === 'TV series' || item.q === 'TV mini-series')) score += 50;

        score += Math.max(0, 50 - (item.rank ? item.rank / 1000 : 25));

        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }

      if (best && bestScore >= 80) {
        return best;
      }
    }
  } catch (err) {
    // Non-blocking: IMDb acts as co-identifier
  }
  return null;
}

/**
 * Dual Identifier TMDB Search:
 * Uses both TMDB and IMDb simultaneously. If IMDb resolves an exact IMDb ID (tt...),
 * it queries TMDB Find API for 100% precision.
 */
async function searchTmdb(query, year, forcedType = null) {
  if (!query || query.trim().length < 2) return null;
  // Strip leading list numbers, indexes e.g. "2.", "01.", "[1]", and leading labels e.g. "Name :", "Title :"
  const cleanQ = cleanLeadingLabels(query.trim());
  const cacheKey = `${cleanQ.toLowerCase()}_${year || 'any'}_${forcedType || 'any'}`;
  if (globalTmdbCache.has(cacheKey)) {
    return globalTmdbCache.get(cacheKey);
  }

  // 1. Co-Identifier: Parallel IMDb + TMDB lookup
  const [imdbCandidate, tmdbMultiRes] = await Promise.all([
    searchImdb(cleanQ, year, forcedType),
    safeFetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanQ)}&include_adult=false`,
      { timeoutMs: 4000 },
      2
    ).catch(() => null),
  ]);

  // If IMDb gave a confident title match, resolve with TMDB Find endpoint (or use IMDb directly!)
  if (imdbCandidate && imdbCandidate.id) {
    // Check canonical media map first to prevent numeric IMDb ID collision
    const canonical = resolveCanonicalMedia(imdbCandidate.id, forcedType);
    if (canonical) {
      console.log(`🎯 Canonical Media Map locked [${imdbCandidate.id}]: ${canonical.title} (${canonical.mediaType}) -> ID ${canonical.canonicalId}`);
      const canonicalMatched = {
        id: canonical.canonicalId,
        imdb_id: imdbCandidate.id,
        title: canonical.title,
        name: canonical.title,
        overview: `Available for high-speed download on CineFuel.`,
        poster_path: canonical.posterPath,
        backdrop_path: canonical.backdropPath || canonical.posterPath,
        release_date: canonical.releaseDate || '2024-01-01',
        first_air_date: canonical.releaseDate || '2024-01-01',
        vote_average: canonical.voteAverage || 8.0,
        vote_count: 1000,
        media_type: canonical.mediaType,
        matchingDecision: 'canonical_mapped',
        matchingConfidence: 'high_canonical',
      };
      globalTmdbCache.set(cacheKey, canonicalMatched);
      return canonicalMatched;
    }

    try {
      const findUrl = `https://api.themoviedb.org/3/find/${imdbCandidate.id}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
      const findRes = await safeFetch(findUrl, { timeoutMs: 2500 }, 1).catch(() => null);
      if (findRes && findRes.ok) {
        const findData = await findRes.json();
        const movies = (findData.movie_results || []).map(m => ({ ...m, media_type: 'movie' }));
        const tvs = (findData.tv_results || []).map(t => ({ ...t, media_type: 'tv' }));
        const combined = [...movies, ...tvs];

        if (combined.length > 0) {
          const matched = rankTmdbResults(combined, cleanQ, year, forcedType);
          if (matched) {
            console.log(`🎯 Dual Identifier (TMDB + IMDb) locked [${imdbCandidate.id}]: ${matched.title || matched.name} (${matched.media_type})`);
            matched.matchingDecision = matched.matchingDecision || 'tmdb_imdb_find_locked';
            matched.matchingConfidence = 'high_verified';
            globalTmdbCache.set(cacheKey, matched);
            return matched;
          }
        }
      }
    } catch {}

    // Note: If TMDB Find did not resolve the IMDb ID, proceed directly to TMDB multi-search
    // using clean title and release year. Do NOT synthesize a raw numeric IMDb ID.
  }

  // 2. Fallback to TMDB Multi-Search Ranking if IMDb didn't match or timed out
  if (tmdbMultiRes && tmdbMultiRes.ok) {
    try {
      const data = await tmdbMultiRes.json();
      if (data.results && data.results.length > 0) {
        const filtered = data.results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
        const best = rankTmdbResults(filtered, cleanQ, year, forcedType);
        if (best) {
          globalTmdbCache.set(cacheKey, best);
          return best;
        }
      }
    } catch (err) {
      console.error(`TMDB multi-search parse error:`, err.message);
    }
  }

  // 3. Shortened search if multi-word
  const words = cleanQ.split(/\s+/);
  if (words.length > 3) {
    const shortened = words.slice(0, 3).join(' ');
    try {
      const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(shortened)}&include_adult=false`;
      const res = await safeFetch(url, { timeoutMs: 3000 }, 1);
      if (res && res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const filtered = data.results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
          const best = rankTmdbResults(filtered, shortened, year, forcedType);
          if (best) {
            globalTmdbCache.set(cacheKey, best);
            return best;
          }
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Batch saves multiple links grouped by movieId to both local disk and Upstash Redis
 */
async function saveMultipleLinks(linksByMovieId) {
  // 1. Local disk backup (Single file read & single write for maximum speed)
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let all = {};
    if (fs.existsSync(DATA_FILE)) {
      try {
        all = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '{}');
      } catch {}
    }
    for (const [movieId, newLinks] of Object.entries(linksByMovieId)) {
      const existing = all[movieId] || [];
      const newIds = new Set(newLinks.map(l => l.id));
      const newUrls = new Set(newLinks.map(l => l.url));
      all[movieId] = [...newLinks, ...existing.filter(l => !newIds.has(l.id) && !newUrls.has(l.url))];
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2), 'utf-8');
  } catch (err) {
    console.error('Local JSON batch write error:', err);
  }

  // 2. Upstash Redis Cloud save (Concurrent execution for zero lag)
  if (redisClient) {
    await Promise.allSettled(Object.entries(linksByMovieId).map(async ([movieId, newLinks]) => {
      try {
        let current = [];
        try {
          const fetched = await redisClient.hget('cinefuel:curated_links', movieId);
          if (Array.isArray(fetched)) current = fetched;
        } catch {}
        const newIds = new Set(newLinks.map(l => l.id));
        const newUrls = new Set(newLinks.map(l => l.url));
        const updated = [...newLinks, ...current.filter(l => !newIds.has(l.id) && !newUrls.has(l.url))];
        await redisClient.hset('cinefuel:curated_links', { [movieId]: updated });
        console.log(`☁️ Synced to Upstash Redis Cloud: [${movieId}] (${newLinks.length} links)`);
      } catch (redisErr) {
        console.warn(`Upstash Redis batch sync warning for ${movieId}:`, redisErr.message);
      }
    }));
  }

  // 3. Supabase Cloud save
  if (supabaseClient) {
    try {
      const allRows = [];
      for (const [movieId, newLinks] of Object.entries(linksByMovieId)) {
        for (const l of newLinks) {
          allRows.push({
            id: l.id,
            movie_id: String(movieId).trim(),
            title: l.title,
            movie_title: l.movieTitle || null,
            url: l.url,
            category: l.category || 'Download',
            quality: l.quality || null,
            codec: l.codec || null,
            audio_language: l.audioLanguage || null,
            size: l.size || null,
            link_type: l.linkType || 'general',
            season_number: l.seasonNumber !== undefined ? Number(l.seasonNumber) : null,
            episode_number: l.episodeNumber !== undefined ? Number(l.episodeNumber) : null,
            server_name: l.serverName || null,
            server_badge: l.serverBadge || null,
            media_type: l.mediaType || 'movie',
            release_date: l.releaseDate || null,
            poster_path: l.posterPath || null,
            backdrop_path: l.backdropPath || null,
            vote_average: l.voteAverage !== undefined ? Number(l.voteAverage) : null,
            created_at: l.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
      if (allRows.length > 0) {
        const { error: sbErr } = await supabaseClient
          .from('links')
          .upsert(allRows, { onConflict: 'movie_id,url' });
        if (sbErr) {
          console.warn('Supabase batch link upsert warning:', sbErr.message);
        } else {
          console.log(`🗄️ Synced to Supabase: (${allRows.length} links across ${Object.keys(linksByMovieId).length} titles)`);
        }
      }
    } catch (sbErr) {
      console.warn('Supabase batch sync error:', sbErr.message);
    }
  }

  return true;
}

function getDomainFamily(host) {
  if (!host) return null;
  const h = host.toLowerCase().replace(/^www\./, '');
  if (h.includes('hubcloud')) return { family: 'hubcloud', name: 'HubCloud' };
  if (h.includes('gdflix')) return { family: 'gdflix', name: 'GDFlix' };
  return null;
}

/**
 * Migrates all links from oldDomain to newDomain across local JSON, Upstash Redis, and MongoDB Atlas.
 */
async function migrateDomain(oldDomain, newDomain) {
  const cleanOld = oldDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  const cleanNew = newDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();

  if (!cleanOld || !cleanNew || cleanOld === cleanNew) {
    return { success: false, updatedCount: 0, oldDomain: cleanOld, newDomain: cleanNew };
  }

  let totalUpdated = 0;

  // 1. Local JSON update
  try {
    if (fs.existsSync(DATA_FILE)) {
      const all = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '{}');
      let localCount = 0;
      for (const [movieId, links] of Object.entries(all)) {
        if (!Array.isArray(links)) continue;
        for (const link of links) {
          if (link.url && link.url.toLowerCase().includes(cleanOld)) {
            link.url = link.url.replace(new RegExp(cleanOld, 'gi'), cleanNew);
            const sInfo = detectServer(link.url);
            link.serverName = sInfo.name;
            link.serverBadge = sInfo.badge;
            link.updatedAt = new Date().toISOString();
            localCount++;
          }
        }
      }
      if (localCount > 0) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2), 'utf-8');
        totalUpdated = Math.max(totalUpdated, localCount);
        console.log(`📁 Local JSON: migrated ${localCount} links from ${cleanOld} to ${cleanNew}`);
      }
    }
  } catch (err) {
    console.error('Local JSON domain migration error:', err);
  }

  // 2. Upstash Redis Cloud update
  if (redisClient) {
    try {
      const allKeys = await redisClient.hgetall('cinefuel:curated_links');
      if (allKeys && typeof allKeys === 'object') {
        let redisCount = 0;
        const toUpdate = {};
        for (const [movieId, linksVal] of Object.entries(allKeys)) {
          let links = [];
          if (Array.isArray(linksVal)) links = linksVal;
          else if (typeof linksVal === 'string') {
            try { links = JSON.parse(linksVal); } catch {}
          }
          let modified = false;
          for (const link of links) {
            if (link.url && link.url.toLowerCase().includes(cleanOld)) {
              link.url = link.url.replace(new RegExp(cleanOld, 'gi'), cleanNew);
              const sInfo = detectServer(link.url);
              link.serverName = sInfo.name;
              link.serverBadge = sInfo.badge;
              link.updatedAt = new Date().toISOString();
              modified = true;
              redisCount++;
            }
          }
          if (modified) {
            toUpdate[movieId] = links;
          }
        }
        if (Object.keys(toUpdate).length > 0) {
          await redisClient.hset('cinefuel:curated_links', toUpdate);
          totalUpdated = Math.max(totalUpdated, redisCount);
          console.log(`☁️ Upstash Redis: migrated ${redisCount} links to ${cleanNew}`);
        }
      }
    } catch (redisErr) {
      console.warn('Redis domain migration warning:', redisErr.message);
    }
  }

  // 3. MongoDB Atlas update
  if (mongoDb) {
    try {
      const collection = mongoDb.collection('links');
      const docs = await collection.find({ url: { $regex: cleanOld, $options: 'i' } }).toArray();
      if (docs && docs.length > 0) {
        const ops = docs.map((doc) => {
          const newUrl = doc.url.replace(new RegExp(cleanOld, 'gi'), cleanNew);
          const sInfo = detectServer(newUrl);
          return {
            updateOne: {
              filter: { _id: doc._id },
              update: {
                $set: {
                  url: newUrl,
                  serverName: sInfo.name,
                  serverBadge: sInfo.badge,
                  updatedAt: new Date(),
                },
              },
            },
          };
        });
        if (ops.length > 0) {
          await collection.bulkWrite(ops);
          totalUpdated = Math.max(totalUpdated, ops.length);
          console.log(`🍃 MongoDB Atlas: migrated ${ops.length} links from ${cleanOld} to ${cleanNew}`);
        }
      }
    } catch (mongoErr) {
      console.warn('MongoDB Atlas domain migration warning:', mongoErr.message);
    }
  }

  return { success: true, updatedCount: totalUpdated, oldDomain: cleanOld, newDomain: cleanNew };
}

/**
 * Checks if incoming link is from a dynamic provider (HubCloud / GDFlix)
 * and automatically migrates any older links in the database to the new domain.
 */
async function autoDetectAndSyncDomain(newUrl) {
  if (!newUrl) return null;
  try {
    let newHost = '';
    try {
      const p = new URL(newUrl.startsWith('http') ? newUrl : `https://${newUrl}`);
      newHost = p.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      const m = newUrl.match(/(?:https?:\/\/)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
      newHost = m ? m[1].toLowerCase().replace(/^www\./, '') : '';
    }

    const familyInfo = getDomainFamily(newHost);
    if (!familyInfo) return null;

    const oldHostsFound = new Set();

    // Check MongoDB Atlas for older domains under same family
    if (mongoDb) {
      try {
        const collection = mongoDb.collection('links');
        const regexStr = familyInfo.family === 'hubcloud' ? 'hubcloud\\.' : 'gdflix\\.';
        const docs = await collection.find({ url: { $regex: regexStr, $options: 'i' } }, { projection: { url: 1 } }).toArray();
        docs.forEach((d) => {
          try {
            const h = new URL(d.url).hostname.toLowerCase().replace(/^www\./, '');
            if (h && h !== newHost && getDomainFamily(h)?.family === familyInfo.family) {
              oldHostsFound.add(h);
            }
          } catch {}
        });
      } catch {}
    }

    // Also check local JSON
    try {
      if (fs.existsSync(DATA_FILE)) {
        const all = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '{}');
        Object.values(all).flat().forEach((l) => {
          try {
            const h = new URL(l.url).hostname.toLowerCase().replace(/^www\./, '');
            if (h && h !== newHost && getDomainFamily(h)?.family === familyInfo.family) {
              oldHostsFound.add(h);
            }
          } catch {}
        });
      }
    } catch {}

    if (oldHostsFound.size === 0) return null;

    const migrations = [];
    for (const oldHost of oldHostsFound) {
      const res = await migrateDomain(oldHost, newHost);
      if (res.updatedCount > 0) {
        migrations.push({ name: familyInfo.name, oldHost, newHost, count: res.updatedCount });
      }
    }

    return migrations.length > 0 ? migrations : null;
  } catch (err) {
    console.warn('Auto domain sync check warning:', err.message);
    return null;
  }
}

/**
 * Automatically detects the provider (HubCloud / GDFlix) from the given input (domain or URL)
 * and replaces ALL existing links of that provider across the entire database with the new domain.
 */
async function migrateProviderToNewDomain(input, forcedProvider = null) {
  if (!input) return { success: false, error: 'No domain or link provided' };

  let cleanHost = '';
  try {
    const p = new URL(input.startsWith('http') ? input : `https://${input}`);
    cleanHost = p.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    cleanHost = input.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').trim();
  }

  if (!cleanHost || !cleanHost.includes('.')) {
    return { success: false, error: `Invalid domain: "${input}"` };
  }

  let family = null;
  if (forcedProvider === 'hubcloud' || cleanHost.includes('hubcloud')) {
    family = { id: 'hubcloud', name: 'HubCloud', regexStr: 'hubcloud\\.' };
  } else if (forcedProvider === 'gdflix' || cleanHost.includes('gdflix')) {
    family = { id: 'gdflix', name: 'GDFlix', regexStr: 'gdflix\\.' };
  } else {
    return {
      success: false,
      error: `Could not auto-detect provider for "${cleanHost}". Please use \`/hubcloud ${cleanHost}\` or \`/gdflix ${cleanHost}\``,
    };
  }

  const oldHostsMap = new Map();

  // 1. Find all older hosts currently stored in MongoDB Atlas
  if (mongoDb) {
    try {
      const docs = await mongoDb
        .collection('links')
        .find({ url: { $regex: family.regexStr, $options: 'i' } }, { projection: { url: 1 } })
        .toArray();
      docs.forEach((d) => {
        try {
          const h = new URL(d.url).hostname.toLowerCase().replace(/^www\./, '');
          if (h && h !== cleanHost) {
            oldHostsMap.set(h, (oldHostsMap.get(h) || 0) + 1);
          }
        } catch {}
      });
    } catch (e) {
      console.warn('MongoDB query error in migrateProviderToNewDomain:', e.message);
    }
  }

  // 2. Also check local JSON fallback
  if (fs.existsSync(DATA_FILE)) {
    try {
      const all = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '{}');
      Object.values(all)
        .flat()
        .forEach((l) => {
          try {
            const h = new URL(l.url).hostname.toLowerCase().replace(/^www\./, '');
            if (h && h !== cleanHost && getDomainFamily(h)?.family === family.id) {
              if (!oldHostsMap.has(h)) {
                oldHostsMap.set(h, (oldHostsMap.get(h) || 0) + 1);
              }
            }
          } catch {}
        });
    } catch {}
  }

  if (oldHostsMap.size === 0) {
    return {
      success: true,
      provider: family.name,
      newDomain: cleanHost,
      oldHosts: [],
      updatedCount: 0,
      alreadyUpToDate: true,
    };
  }

  let grandTotal = 0;
  const replacedDetails = [];

  for (const [oldHost, expectedCount] of oldHostsMap.entries()) {
    const res = await migrateDomain(oldHost, cleanHost);
    if (res.updatedCount > 0) {
      grandTotal += res.updatedCount;
      replacedDetails.push({ oldHost, count: res.updatedCount });
    }
  }

  return {
    success: true,
    provider: family.name,
    newDomain: cleanHost,
    oldHosts: replacedDetails,
    updatedCount: grandTotal,
    alreadyUpToDate: false,
  };
}

async function saveLink(movieId, link) {
  return saveMultipleLinks({ [String(movieId)]: [link] });
}

const TMDB_GENRES = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendMediaPostCard(chatId, {
  photoUrl,
  title,
  year,
  mediaType = 'movie',
  movieId,
  rating,
  genres,
  outline,
  versions = [],
  audio,
  uploadedBy = 'Shyam',
  channelHandle = '@cinflue',
  pageUrl,
  autoMigrationNotice = '',
}) {
  const versionsLines = versions.map((v) => {
    let q = v.quality || '1080p';
    if (!q.includes('·')) {
      if (/\b(?:2160p|2160|4k|uhd)\b/i.test(q)) q = '2160p';
      else if (/\b(?:1080p|1080|fhd)\b/i.test(q)) q = '1080p';
      else if (/\b(?:720p|720|hd)\b/i.test(q)) q = '720p';
      else if (/\b(?:480p|480|sd)\b/i.test(q)) q = '480p';
    }
    const s = v.size ? `\n  ${v.size}` : '';
    return `• ${q} :${s}`;
  }).join('\n');

  const versionsText = versionsLines || '• 1080p :\n  WEB-DL';

  let cleanOutline = (outline || 'Every release brings the cinema home.').trim();
  if (cleanOutline.length > 240) {
    cleanOutline = cleanOutline.slice(0, 237) + '...';
  }

  const caption = 
`⚡ <b>${escapeHtml(title.toUpperCase())} ${year ? `(${year})` : ''}</b>
─────────────────────────────
⭐ <b>Rating:</b> ${rating || '6.5'}/10
🎭 <b>Genres:</b> ${escapeHtml(genres || 'Drama, Cinema')}
─────────────────────────────

📖 <b>Plot Outline:</b>
<blockquote>${escapeHtml(cleanOutline)}</blockquote>

📦 <b>Available Versions:</b>
<pre>${escapeHtml(versionsText)}</pre>

🔊 <b>Audio Track:</b> ${escapeHtml(audio || 'Hindi, English')}

👤 <b>Uploaded by:</b> #${uploadedBy.replace(/^#/, '')}

🚀 ${channelHandle}${autoMigrationNotice ? `\n\n${autoMigrationNotice}` : ''}`;

  const destinationUrl = pageUrl || `${SITE_URL}/${mediaType}/${movieId}`;
  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: `🚀 Download ${title}`,
          url: destinationUrl,
        },
      ],
    ],
  };

  // 1. Try sending Photo with styled HTML Caption & Inline Keyboard (media_1790946099611.png)
  if (photoUrl) {
    try {
      const res = await safeFetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }),
        timeoutMs: 9000,
      });
      const data = await res?.json();
      if (data?.ok) return data;
      console.warn('sendPhoto failed, falling back to sendMessage:', data?.description);
    } catch (e) {
      console.warn('sendPhoto error, falling back to sendMessage:', e.message);
    }
  }

  // 2. Fallback to HTML Message with Inline Keyboard
  return await safeFetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
      disable_web_page_preview: false,
    }),
    timeoutMs: 6000,
  });
}

async function sendTelegram(chatId, text, replyMarkup = null, parseMode = 'Markdown') {
  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const res = await safeFetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 5000,
    });
    return await res?.json();
  } catch (e) {
    console.error('Telegram reply error:', e.message);
  }
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    await safeFetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
      timeoutMs: 3000,
    });
  } catch {}
}

const REDIS_REQUESTS_KEY = 'cinefuel:user_requests';
const REDIS_REPORTS_KEY = 'cinefuel:defective_reports';
const REDIS_NOTIFICATIONS_KEY = 'cinefuel:user_notifications';
const REDIS_USERS_KEY = 'cinefuel:registered_users';

function parseRedisList(data) {
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

async function getMergedRequests(filterStatus = 'pending') {
  const map = new Map();

  // 1. Upstash Redis
  if (redisClient) {
    try {
      const raw = await redisClient.get(REDIS_REQUESTS_KEY);
      const list = parseRedisList(raw);
      list.forEach((r) => {
        if (!filterStatus || filterStatus === 'all' || r.status === filterStatus) {
          map.set(r.id, r);
        }
      });
    } catch (e) {
      console.warn('Redis requests read warning in bot:', e.message);
    }
  }

  // 2. MongoDB Atlas
  if (mongoDb) {
    try {
      const query = filterStatus && filterStatus !== 'all' ? { status: filterStatus } : {};
      const docs = await mongoDb.collection('requests').find(query).toArray();
      docs.forEach((d) => {
        const { _id, ...rest } = d;
        map.set(rest.id, { ...(map.get(rest.id) || {}), ...rest });
      });
    } catch (e) {
      console.warn('MongoDB requests read warning in bot:', e.message);
    }
  }

  const result = Array.from(map.values());
  result.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return result;
}

async function getMergedReports(filterStatus = 'pending') {
  const map = new Map();

  // 1. Upstash Redis
  if (redisClient) {
    try {
      const raw = await redisClient.get(REDIS_REPORTS_KEY);
      const list = parseRedisList(raw);
      list.forEach((r) => {
        if (!filterStatus || filterStatus === 'all' || r.status === filterStatus) {
          map.set(r.id, r);
        }
      });
    } catch (e) {
      console.warn('Redis reports read warning in bot:', e.message);
    }
  }

  // 2. MongoDB Atlas
  if (mongoDb) {
    try {
      const query = filterStatus && filterStatus !== 'all' ? { status: filterStatus } : {};
      const docs = await mongoDb.collection('defective_reports').find(query).toArray();
      docs.forEach((d) => {
        const { _id, ...rest } = d;
        map.set(rest.id, { ...(map.get(rest.id) || {}), ...rest });
      });
    } catch (e) {
      console.warn('MongoDB reports read warning in bot:', e.message);
    }
  }

  const result = Array.from(map.values());
  result.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return result;
}

async function saveNotificationToBotStorage(notif) {
  // 1. MongoDB
  if (mongoDb) {
    try {
      await mongoDb.collection('notifications').insertOne({ ...notif }).catch(() => {});
    } catch {}
  }
  // 2. Upstash Redis
  if (redisClient) {
    try {
      const raw = await redisClient.get(REDIS_NOTIFICATIONS_KEY);
      const list = parseRedisList(raw);
      const updated = [notif, ...list.filter((n) => n.id !== notif.id)].slice(0, 1000);
      await redisClient.set(REDIS_NOTIFICATIONS_KEY, updated);
    } catch {}
  }
}

async function handleListRequests(chatId) {
  try {
    const list = await getMergedRequests('pending');
    if (!list || list.length === 0) {
      return sendTelegram(chatId, `🎉 *No Pending Requests!* All user movie and TV requests have been fulfilled or resolved.`);
    }

    sendTelegram(chatId, `📥 *Pending User Requests (${list.length}):*\nReview submissions below and use the buttons to reply, update progress, or fulfill:`);

    for (const req of list.slice(0, 10)) {
      const yearStr = req.releaseYear ? ` (${req.releaseYear})` : '';
      const notesStr = req.notes ? `\n📝 _Note: ${req.notes}_` : '';
      const text =
`🎬 *${req.title}*${yearStr}
💎 *Quality:* \`${req.quality || '1080p'}\`
🔊 *Audio:* \`${req.audioLanguage || 'Dual Audio'}\`
👤 *User:* \`${req.userEmail || req.userName || 'Anonymous'}\`
🆔 \`${req.id}\`${notesStr}

⚡ *Quick Commands:*
• Reply: \`/reply ${req.id} <message>\`
• In Progress: \`/inprogress ${req.id}\`
• Fulfill: \`/resolve ${req.id} <working link>\`
• Reject: \`/reject ${req.id} <reason>\``;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: '💬 Reply', callback_data: `reply_req:${req.id}` },
            { text: '⏳ In Progress', callback_data: `prog_req:${req.id}` },
          ],
          [
            { text: '✅ Fulfill', callback_data: `fulfill_req:${req.id}` },
            { text: '❌ Reject', callback_data: `reject_req:${req.id}` },
          ],
        ],
      };

      await sendTelegram(chatId, text, replyMarkup, 'Markdown');
    }
  } catch (err) {
    console.error('Error fetching requests in Telegram:', err.message);
    sendTelegram(chatId, `⚠️ Error fetching requests: ${err.message}`);
  }
}

async function handleListReports(chatId) {
  try {
    const list = await getMergedReports('pending');
    if (!list || list.length === 0) {
      return sendTelegram(chatId, `🎉 *No Broken Links Reported!* All link reports have been reviewed and resolved.`);
    }

    sendTelegram(chatId, `🚨 *Pending Defective Link Reports (${list.length}):*\nReview broken links below and use buttons to fix or dismiss:`);

    for (const rep of list.slice(0, 10)) {
      const notesStr = rep.additionalNotes ? `\n📝 _Note: ${rep.additionalNotes}_` : '';
      const text =
`🎬 *${rep.mediaTitle || 'Reported Movie/Series'}*
⚠️ *Issue:* \`${rep.issueLabel || rep.issueType}\`
🔗 *URL:* \`${rep.reportedUrl}\`
👤 *Reporter:* \`${rep.userEmail || rep.userName || 'User'}\`
🆔 \`${rep.id}\`${notesStr}

⚡ *Quick Commands:*
• Reply: \`/reply ${rep.id} <message>\`
• In Progress: \`/inprogress ${rep.id}\`
• Fix: \`/resolve ${rep.id} <replacement link>\`
• Dismiss: \`/dismiss ${rep.id} <reason>\``;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: '💬 Reply', callback_data: `reply_rep:${rep.id}` },
            { text: '⏳ In Progress', callback_data: `prog_rep:${rep.id}` },
          ],
          [
            { text: '🔧 Fix / Replace', callback_data: `fix_rep:${rep.id}` },
            { text: '⚠️ Dismiss', callback_data: `dismiss_rep:${rep.id}` },
          ],
        ],
      };

      await sendTelegram(chatId, text, replyMarkup, 'Markdown');
    }
  } catch (err) {
    console.error('Error fetching reports in Telegram:', err.message);
    sendTelegram(chatId, `⚠️ Error fetching reports: ${err.message}`);
  }
}

async function isUserNotificationEnabled(userId, userEmail, category) {
  if (mongoDb) {
    try {
      const query = [];
      if (userId) query.push({ uid: userId }, { firebaseUid: userId });
      if (userEmail) query.push({ email: userEmail });
      if (query.length > 0) {
        const userDoc = await mongoDb.collection('users').findOne({ $or: query });
        if (userDoc?.notificationPreferences) {
          if (category === 'requests') {
            return userDoc.notificationPreferences.inAppRequests !== false;
          }
          if (category === 'reports') {
            return userDoc.notificationPreferences.inAppReports !== false;
          }
        }
      }
    } catch {}
  }

  if (redisClient) {
    try {
      const raw = await redisClient.get(REDIS_USERS_KEY);
      const users = parseRedisList(raw);
      const u = users.find((user) => (userId && (user.uid === userId || user.firebaseUid === userId)) || (userEmail && user.email === userEmail));
      if (u?.notificationPreferences) {
        if (category === 'requests') {
          return u.notificationPreferences.inAppRequests !== false;
        }
        if (category === 'reports') {
          return u.notificationPreferences.inAppReports !== false;
        }
      }
    } catch {}
  }

  return true;
}

async function handleAdminReplyAction(chatId, targetId, targetType, replyMessage) {
  const cleanId = String(targetId || '').trim();
  const cleanMsg = String(replyMessage || '').trim();
  if (!cleanId || !cleanMsg) {
    return sendTelegram(chatId, `⚠️ Usage: \`/reply <id> <message>\``);
  }

  try {
    const replyObj = { sender: 'admin', message: cleanMsg, createdAt: new Date().toISOString() };

    // 1. Try finding in requests (Mongo or Redis)
    let reqDoc = mongoDb ? await mongoDb.collection('requests').findOne({ id: cleanId }) : null;
    if (!reqDoc && redisClient) {
      const raw = await redisClient.get(REDIS_REQUESTS_KEY);
      const list = parseRedisList(raw);
      reqDoc = list.find((r) => r.id === cleanId) || null;
    }

    if (reqDoc) {
      // Update in MongoDB
      if (mongoDb) {
        await mongoDb.collection('requests').updateOne(
          { id: cleanId },
          {
            $set: { adminNote: cleanMsg, updatedAt: new Date() },
            $push: { adminReplies: replyObj },
          }
        ).catch(() => {});
      }

      // Update in Redis
      if (redisClient) {
        try {
          const raw = await redisClient.get(REDIS_REQUESTS_KEY);
          const list = parseRedisList(raw);
          const updated = list.map((r) =>
            r.id === cleanId
              ? {
                  ...r,
                  adminNote: cleanMsg,
                  adminReplies: [...(r.adminReplies || []), replyObj],
                }
              : r
          );
          await redisClient.set(REDIS_REQUESTS_KEY, updated);
        } catch {}
      }

      // Create in-app notification if user enabled it
      if (await isUserNotificationEnabled(reqDoc.userId, reqDoc.userEmail, 'requests')) {
        const notifId = `notif-reply-${reqDoc.id}-${Date.now()}`;
        await saveNotificationToBotStorage({
          id: notifId,
          userId: reqDoc.userId,
          firebaseUid: reqDoc.userId,
          requestId: reqDoc.id,
          type: 'ADMIN_REPLY',
          title: `Admin Replied to Your Request: ${reqDoc.title}`,
          message: `Admin reply: "${cleanMsg}"`,
          mediaTitle: reqDoc.title,
          movieId: reqDoc.tmdbId,
          mediaType: reqDoc.mediaType || 'movie',
          linkUrl: reqDoc.tmdbId ? `/${reqDoc.mediaType || 'movie'}/${reqDoc.tmdbId}` : '/profile',
          posterPath: reqDoc.posterPath || null,
          read: false,
          createdAt: new Date().toISOString(),
          readAt: null,
          adminReply: cleanMsg,
        });
      }

      // Notify user via Telegram if connected
      let tgLink = mongoDb ? await mongoDb.collection('telegram_links').findOne({
        firebaseUid: reqDoc.userId,
        status: 'active',
      }) : null;

      if (tgLink && tgLink.requestNotifications !== false) {
        await sendTelegram(
          tgLink.telegramChatId,
          `💬 *Admin Reply from CineFuel*\nRegarding your request for *${reqDoc.title}*:\n\n"${cleanMsg}"\n\n🌐 View your profile on CineFuel for details.`
        ).catch(() => {});
      }

      return sendTelegram(chatId, `✅ *Reply Sent!* Successfully notified user for request *${reqDoc.title}*:\n"${cleanMsg}"`);
    }

    // 2. Try finding in defective_reports (Mongo or Redis)
    let repDoc = mongoDb ? await mongoDb.collection('defective_reports').findOne({ id: cleanId }) : null;
    if (!repDoc && redisClient) {
      const raw = await redisClient.get(REDIS_REPORTS_KEY);
      const list = parseRedisList(raw);
      repDoc = list.find((r) => r.id === cleanId) || null;
    }

    if (repDoc) {
      // Update in MongoDB
      if (mongoDb) {
        await mongoDb.collection('defective_reports').updateOne(
          { id: cleanId },
          {
            $set: { adminNote: cleanMsg, updatedAt: new Date() },
            $push: { adminReplies: replyObj },
          }
        ).catch(() => {});
      }

      // Update in Redis
      if (redisClient) {
        try {
          const raw = await redisClient.get(REDIS_REPORTS_KEY);
          const list = parseRedisList(raw);
          const updated = list.map((r) =>
            r.id === cleanId
              ? {
                  ...r,
                  adminNote: cleanMsg,
                  adminReplies: [...(r.adminReplies || []), replyObj],
                }
              : r
          );
          await redisClient.set(REDIS_REPORTS_KEY, updated);
        } catch {}
      }

      // Create in-app notification if user enabled it
      if (await isUserNotificationEnabled(repDoc.userId, repDoc.userEmail, 'reports')) {
        const notifId = `notif-reply-${repDoc.id}-${Date.now()}`;
        await saveNotificationToBotStorage({
          id: notifId,
          userId: repDoc.userId,
          firebaseUid: repDoc.userId,
          reportId: repDoc.id,
          type: 'ADMIN_REPLY',
          title: `Admin Replied to Your Broken Link Report: ${repDoc.mediaTitle}`,
          message: `Admin reply: "${cleanMsg}"`,
          mediaTitle: repDoc.mediaTitle,
          movieId: repDoc.movieId,
          mediaType: repDoc.mediaType || 'movie',
          linkUrl: repDoc.movieId ? `/${repDoc.mediaType || 'movie'}/${repDoc.movieId}` : '/profile',
          posterPath: repDoc.posterPath || null,
          read: false,
          createdAt: new Date().toISOString(),
          readAt: null,
          adminReply: cleanMsg,
        });
      }

      // Notify user via Telegram if connected
      let tgLink = mongoDb ? await mongoDb.collection('telegram_links').findOne({
        firebaseUid: repDoc.userId,
        status: 'active',
      }) : null;

      if (tgLink && tgLink.reportNotifications !== false) {
        await sendTelegram(
          tgLink.telegramChatId,
          `💬 *Admin Reply from CineFuel*\nRegarding your broken link report for *${repDoc.mediaTitle}*:\n\n"${cleanMsg}"\n\n🌐 View your profile on CineFuel for details.`
        ).catch(() => {});
      }

      return sendTelegram(chatId, `✅ *Reply Sent!* Successfully notified reporter for *${repDoc.mediaTitle}*:\n"${cleanMsg}"`);
    }

    return sendTelegram(chatId, `⚠️ No request or defective report found matching ID \`${cleanId}\`.`);
  } catch (err) {
    console.error('Error replying from Telegram:', err.message);
    return sendTelegram(chatId, `⚠️ Error saving reply: ${err.message}`);
  }
}

async function handleAdminInProgressAction(chatId, targetId, targetType, note = '') {
  const cleanId = String(targetId || '').trim();
  const cleanNote = String(note || 'Admin is actively sourcing/fixing this item').trim();
  if (!cleanId) {
    return sendTelegram(chatId, `⚠️ Usage: \`/inprogress <id> [optional note]\``);
  }

  try {
    // 1. Try finding in requests
    let reqDoc = mongoDb ? await mongoDb.collection('requests').findOne({ id: cleanId }) : null;
    if (!reqDoc && redisClient) {
      const raw = await redisClient.get(REDIS_REQUESTS_KEY);
      const list = parseRedisList(raw);
      reqDoc = list.find((r) => r.id === cleanId) || null;
    }

    if (reqDoc) {
      if (mongoDb) {
        await mongoDb.collection('requests').updateOne(
          { id: cleanId },
          { $set: { status: 'in_progress', adminNote: cleanNote, updatedAt: new Date() } }
        ).catch(() => {});
      }
      if (redisClient) {
        try {
          const raw = await redisClient.get(REDIS_REQUESTS_KEY);
          const list = parseRedisList(raw);
          const updated = list.map((r) => (r.id === cleanId ? { ...r, status: 'in_progress', adminNote: cleanNote } : r));
          await redisClient.set(REDIS_REQUESTS_KEY, updated);
        } catch {}
      }

      // Create in-app notification
      if (await isUserNotificationEnabled(reqDoc.userId, reqDoc.userEmail, 'requests')) {
        const notifId = `notif-prog-${reqDoc.id}`;
        await saveNotificationToBotStorage({
          id: notifId,
          userId: reqDoc.userId,
          firebaseUid: reqDoc.userId,
          requestId: reqDoc.id,
          type: 'REQUEST_IN_PROGRESS',
          title: `Request in Progress: ${reqDoc.title}`,
          message: `Our curators are working on sourcing "${reqDoc.title}". (${cleanNote})`,
          mediaTitle: reqDoc.title,
          movieId: reqDoc.tmdbId,
          mediaType: reqDoc.mediaType || 'movie',
          linkUrl: reqDoc.tmdbId ? `/${reqDoc.mediaType || 'movie'}/${reqDoc.tmdbId}` : '/profile',
          posterPath: reqDoc.posterPath || null,
          read: false,
          createdAt: new Date().toISOString(),
          readAt: null,
          adminReply: cleanNote,
        });
      }

      return sendTelegram(chatId, `⏳ *Marked In Progress:* Request \`${cleanId}\` for *${reqDoc.title}* is now set to in-progress.`);
    }

    // 2. Try finding in defective_reports
    let repDoc = mongoDb ? await mongoDb.collection('defective_reports').findOne({ id: cleanId }) : null;
    if (!repDoc && redisClient) {
      const raw = await redisClient.get(REDIS_REPORTS_KEY);
      const list = parseRedisList(raw);
      repDoc = list.find((r) => r.id === cleanId) || null;
    }

    if (repDoc) {
      if (mongoDb) {
        await mongoDb.collection('defective_reports').updateOne(
          { id: cleanId },
          { $set: { status: 'in_progress', adminNote: cleanNote, updatedAt: new Date() } }
        ).catch(() => {});
      }
      if (redisClient) {
        try {
          const raw = await redisClient.get(REDIS_REPORTS_KEY);
          const list = parseRedisList(raw);
          const updated = list.map((r) => (r.id === cleanId ? { ...r, status: 'in_progress', adminNote: cleanNote } : r));
          await redisClient.set(REDIS_REPORTS_KEY, updated);
        } catch {}
      }

      // Create in-app notification
      if (await isUserNotificationEnabled(repDoc.userId, repDoc.userEmail, 'reports')) {
        const notifId = `notif-rep-prog-${repDoc.id}`;
        await saveNotificationToBotStorage({
          id: notifId,
          userId: repDoc.userId,
          firebaseUid: repDoc.userId,
          reportId: repDoc.id,
          type: 'DEFECTIVE_LINK_IN_PROGRESS',
          title: `Broken Link Report In Progress: ${repDoc.mediaTitle}`,
          message: `Our technical team is currently investigating and repairing the reported link for "${repDoc.mediaTitle}". (${cleanNote})`,
          mediaTitle: repDoc.mediaTitle,
          movieId: repDoc.movieId,
          mediaType: repDoc.mediaType || 'movie',
          linkUrl: repDoc.movieId ? `/${repDoc.mediaType || 'movie'}/${repDoc.movieId}` : '/profile',
          posterPath: repDoc.posterPath || null,
          read: false,
          createdAt: new Date().toISOString(),
          readAt: null,
          adminReply: cleanNote,
        });
      }

      return sendTelegram(chatId, `⏳ *Marked In Progress:* Defective report \`${cleanId}\` for *${repDoc.mediaTitle}* is now set to in-progress.`);
    }

    return sendTelegram(chatId, `⚠️ No request or report found matching ID \`${cleanId}\`.`);
  } catch (err) {
    return sendTelegram(chatId, `⚠️ Error: ${err.message}`);
  }
}

async function handleAdminResolveAction(chatId, targetId, targetType, linkUrl = '') {
  const cleanId = String(targetId || '').trim();
  const cleanUrl = String(linkUrl || '').trim();

  try {
    // 1. Try finding in requests (Mongo or Redis)
    let reqDoc = mongoDb ? await mongoDb.collection('requests').findOne({ id: cleanId }) : null;
    if (!reqDoc && redisClient) {
      const raw = await redisClient.get(REDIS_REQUESTS_KEY);
      const list = parseRedisList(raw);
      reqDoc = list.find((r) => r.id === cleanId) || null;
    }

    if (reqDoc) {
      if (mongoDb) {
        await mongoDb.collection('requests').updateOne(
          { id: cleanId },
          {
            $set: {
              status: 'fulfilled',
              fulfilledAt: new Date().toISOString(),
              ...(cleanUrl ? { fulfilledLinkUrl: cleanUrl } : {}),
              updatedAt: new Date(),
            },
          }
        ).catch(() => {});
      }

      if (redisClient) {
        try {
          const raw = await redisClient.get(REDIS_REQUESTS_KEY);
          const list = parseRedisList(raw);
          const updated = list.map((r) =>
            r.id === cleanId
              ? {
                  ...r,
                  status: 'fulfilled',
                  fulfilledAt: new Date().toISOString(),
                  ...(cleanUrl ? { fulfilledLinkUrl: cleanUrl } : {}),
                }
              : r
          );
          await redisClient.set(REDIS_REQUESTS_KEY, updated);
        } catch {}
      }

      // Create in-app notification in MongoDB & Redis if enabled
      if (await isUserNotificationEnabled(reqDoc.userId, reqDoc.userEmail, 'requests')) {
        const notifId = `notif-${reqDoc.id}`;
        await saveNotificationToBotStorage({
          id: notifId,
          userId: reqDoc.userId,
          firebaseUid: reqDoc.userId,
          requestId: reqDoc.id,
          type: 'REQUEST_FULFILLED',
          title: 'Your request has been fulfilled',
          message: `"${reqDoc.title}" is now available on CineFuel.`,
          mediaTitle: reqDoc.title,
          movieId: reqDoc.tmdbId,
          mediaType: reqDoc.mediaType || 'movie',
          linkUrl: cleanUrl || (reqDoc.tmdbId ? `/${reqDoc.mediaType || 'movie'}/${reqDoc.tmdbId}` : '/profile'),
          posterPath: reqDoc.posterPath || null,
          read: false,
          createdAt: new Date().toISOString(),
          readAt: null,
        });
      }

      // Notify user via Telegram if connected
      let tgLink = mongoDb ? await mongoDb.collection('telegram_links').findOne({
        firebaseUid: reqDoc.userId,
        status: 'active',
      }) : null;

      if (tgLink && tgLink.requestNotifications !== false) {
        await sendTelegram(
          tgLink.telegramChatId,
          `🎬 *CineFuel Request Fulfilled*\n\nYour requested title *${reqDoc.title}* is now available!\n${cleanUrl ? `🔗 Link: ${cleanUrl}\n` : ''}Enjoy watching on CineFuel!`
        ).catch(() => {});
      }

      return sendTelegram(chatId, `🎉 *Request Fulfilled!* Marked request \`${cleanId}\` for *${reqDoc.title}* as fulfilled.`);
    }

    // 2. Try finding in defective_reports (Mongo or Redis)
    let repDoc = mongoDb ? await mongoDb.collection('defective_reports').findOne({ id: cleanId }) : null;
    if (!repDoc && redisClient) {
      const raw = await redisClient.get(REDIS_REPORTS_KEY);
      const list = parseRedisList(raw);
      repDoc = list.find((r) => r.id === cleanId) || null;
    }

    if (repDoc) {
      if (mongoDb) {
        await mongoDb.collection('defective_reports').updateOne(
          { id: cleanId },
          {
            $set: {
              status: 'fixed',
              resolvedAt: new Date().toISOString(),
              ...(cleanUrl ? { replacementUrl: cleanUrl } : {}),
              updatedAt: new Date(),
            },
          }
        ).catch(() => {});
      }

      if (redisClient) {
        try {
          const raw = await redisClient.get(REDIS_REPORTS_KEY);
          const list = parseRedisList(raw);
          const updated = list.map((r) =>
            r.id === cleanId
              ? {
                  ...r,
                  status: 'fixed',
                  resolvedAt: new Date().toISOString(),
                  ...(cleanUrl ? { replacementUrl: cleanUrl } : {}),
                }
              : r
          );
          await redisClient.set(REDIS_REPORTS_KEY, updated);
        } catch {}
      }

      // Create in-app notification if enabled
      if (await isUserNotificationEnabled(repDoc.userId, repDoc.userEmail, 'reports')) {
        const notifId = `notif-rep-${repDoc.id}-fixed`;
        await saveNotificationToBotStorage({
          id: notifId,
          userId: repDoc.userId,
          firebaseUid: repDoc.userId,
          reportId: repDoc.id,
          type: 'DEFECTIVE_LINK_RESOLVED',
          title: 'Broken Link Report Resolved',
          message: `The link you reported for "${repDoc.mediaTitle}" has been verified and resolved.`,
          mediaTitle: repDoc.mediaTitle,
          movieId: repDoc.movieId,
          mediaType: repDoc.mediaType || 'movie',
          linkUrl: repDoc.movieId ? `/${repDoc.mediaType || 'movie'}/${repDoc.movieId}` : '/profile',
          posterPath: repDoc.posterPath || null,
          read: false,
          createdAt: new Date().toISOString(),
          readAt: null,
        });
      }

      // Notify user via Telegram if connected
      let tgLink = mongoDb ? await mongoDb.collection('telegram_links').findOne({
        firebaseUid: repDoc.userId,
        status: 'active',
      }) : null;

      if (tgLink && tgLink.reportNotifications !== false) {
        await sendTelegram(
          tgLink.telegramChatId,
          `🔧 *Broken Link Fixed*\n\nThe link for *${repDoc.mediaTitle}* has been verified and resolved!\n${cleanUrl ? `🔗 New Mirror: ${cleanUrl}\n` : ''}Thank you for helping keep CineFuel clean!`
        ).catch(() => {});
      }

      return sendTelegram(chatId, `🔧 *Report Fixed!* Marked broken link report \`${cleanId}\` for *${repDoc.mediaTitle}* as resolved.`);
    }

    return sendTelegram(chatId, `⚠️ No request or report found matching ID \`${cleanId}\`.`);
  } catch (err) {
    console.error('Error resolving submission in Telegram:', err.message);
    return sendTelegram(chatId, `⚠️ Error resolving submission: ${err.message}`);
  }
}

async function handleAdminRejectOrDismissAction(chatId, targetId, action, reason = '') {
  const cleanId = String(targetId || '').trim();
  const cleanReason = String(reason || 'Reviewed by admin').trim();

  try {
    if (action === 'reject') {
      let reqDoc = mongoDb ? await mongoDb.collection('requests').findOne({ id: cleanId }) : null;
      if (!reqDoc && redisClient) {
        const raw = await redisClient.get(REDIS_REQUESTS_KEY);
        const list = parseRedisList(raw);
        reqDoc = list.find((r) => r.id === cleanId) || null;
      }
      if (!reqDoc) return sendTelegram(chatId, `⚠️ Request ID \`${cleanId}\` not found.`);

      if (mongoDb) {
        await mongoDb.collection('requests').updateOne(
          { id: cleanId },
          { $set: { status: 'rejected', adminNote: cleanReason, updatedAt: new Date() } }
        ).catch(() => {});
      }
      if (redisClient) {
        try {
          const raw = await redisClient.get(REDIS_REQUESTS_KEY);
          const list = parseRedisList(raw);
          const updated = list.map((r) => (r.id === cleanId ? { ...r, status: 'rejected', adminNote: cleanReason } : r));
          await redisClient.set(REDIS_REQUESTS_KEY, updated);
        } catch {}
      }

      return sendTelegram(chatId, `❌ *Request Rejected:* \`${cleanId}\` (${reqDoc.title}).`);
    } else {
      let repDoc = mongoDb ? await mongoDb.collection('defective_reports').findOne({ id: cleanId }) : null;
      if (!repDoc && redisClient) {
        const raw = await redisClient.get(REDIS_REPORTS_KEY);
        const list = parseRedisList(raw);
        repDoc = list.find((r) => r.id === cleanId) || null;
      }
      if (!repDoc) return sendTelegram(chatId, `⚠️ Report ID \`${cleanId}\` not found.`);

      if (mongoDb) {
        await mongoDb.collection('defective_reports').updateOne(
          { id: cleanId },
          { $set: { status: 'dismissed', adminNote: cleanReason, updatedAt: new Date() } }
        ).catch(() => {});
      }
      if (redisClient) {
        try {
          const raw = await redisClient.get(REDIS_REPORTS_KEY);
          const list = parseRedisList(raw);
          const updated = list.map((r) => (r.id === cleanId ? { ...r, status: 'dismissed', adminNote: cleanReason } : r));
          await redisClient.set(REDIS_REPORTS_KEY, updated);
        } catch {}
      }

      // Create in-app dismissal notification
      if (await isUserNotificationEnabled(repDoc.userId, repDoc.userEmail, 'reports')) {
        const notifId = `notif-rep-${repDoc.id}-dismissed`;
        await saveNotificationToBotStorage({
          id: notifId,
          userId: repDoc.userId,
          firebaseUid: repDoc.userId,
          reportId: repDoc.id,
          type: 'DEFECTIVE_LINK_DISMISSED',
          title: 'Broken Link Report Dismissed',
          message: `The link report for "${repDoc.mediaTitle}" was checked and dismissed. (${cleanReason})`,
          mediaTitle: repDoc.mediaTitle,
          movieId: repDoc.movieId,
          mediaType: repDoc.mediaType || 'movie',
          linkUrl: repDoc.movieId ? `/${repDoc.mediaType || 'movie'}/${repDoc.movieId}` : '/profile',
          posterPath: repDoc.posterPath || null,
          read: false,
          createdAt: new Date().toISOString(),
          readAt: null,
          adminReply: cleanReason,
        });
      }

      return sendTelegram(chatId, `⚠️ *Report Dismissed:* \`${cleanId}\` (${repDoc.mediaTitle}).`);
    }
  } catch (err) {
    return sendTelegram(chatId, `⚠️ Error: ${err.message}`);
  }
}

async function handleCallbackQuery(cq) {
  const fromId = cq.from ? cq.from.id : null;
  if (!AUTHORIZED_TELEGRAM_IDS.includes(fromId)) {
    return answerCallbackQuery(cq.id, 'Unauthorized admin.');
  }

  await answerCallbackQuery(cq.id, 'Please open the Website Admin Panel to review and moderate.');
  return sendTelegram(
    fromId,
    `ℹ️ *Website Moderation Reminder*\n\nReviewing, replying, fulfilling, and resolving user requests & broken links is handled directly in the Website Admin Panel:\n🔗 https://cinephile.sk6216071.workers.dev/admin`
  );
}

// Anti-spam rapid repeat protection cache (15 seconds cooldown for identical message)
const recentRepeatsCache = new Map();

async function handleMessage(msg) {
  const fromId = msg.from ? msg.from.id : msg.chat.id;
  const chatId = msg.chat.id;
  const rawText = (msg.text || msg.caption || '').trim();

  // Send instant typing indicator so Telegram user sees instant response (<50ms)
  sendChatAction(chatId, 'typing').catch(() => {});

  console.log(`📩 Received message from ${msg.from?.first_name || 'User'} (${fromId}):\n"${rawText}"`);

  // 1. Authorization check
  if (!AUTHORIZED_TELEGRAM_IDS.includes(fromId)) {
    return sendTelegram(chatId, `⛔ *Unauthorized*\nYour Telegram ID (${fromId}) is not registered as an Admin.`);
  }

  // 1b. Rapid repeat anti-spam check (if exact same message sent within 15 seconds)
  const repeatKey = `${fromId}:${rawText}`;
  const lastSeen = recentRepeatsCache.get(repeatKey);
  if (lastSeen && (Date.now() - lastSeen) < 15000) {
    return sendTelegram(chatId, `⚡ *Already Processed!*
This exact release was just processed a moment ago. Your links are already live and active on CineFuel!`);
  }
  recentRepeatsCache.set(repeatKey, Date.now());
  if (recentRepeatsCache.size > 200) {
    const now = Date.now();
    for (const [k, t] of recentRepeatsCache.entries()) {
      if (now - t > 60000) recentRepeatsCache.delete(k);
    }
  }

  // Handle interactive pending state (replying to user, providing link to fulfill/fix)
  if (pendingChatState.has(fromId)) {
    const pState = pendingChatState.get(fromId);
    if (pState.action === 'await_reply') {
      pendingChatState.delete(fromId);
      return await handleAdminReplyAction(chatId, pState.id, pState.type, rawText);
    }
    if (pState.action === 'await_fulfill_link') {
      pendingChatState.delete(fromId);
      const url = rawText.trim().toLowerCase() === 'done' ? '' : rawText.trim();
      return await handleAdminResolveAction(chatId, pState.id, 'request', url);
    }
    if (pState.action === 'await_fix_link') {
      pendingChatState.delete(fromId);
      const url = rawText.trim().toLowerCase() === 'done' ? '' : rawText.trim();
      return await handleAdminResolveAction(chatId, pState.id, 'report', url);
    }
  }

  // 2. Parse command if present
  let command = null;
  let commandArgs = '';
  const cmdMatch = rawText.match(/^\/([a-zA-Z0-9_-]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  if (cmdMatch) {
    command = cmdMatch[1].toLowerCase();
    commandArgs = (cmdMatch[2] || '').trim();
  }

  // Handle Command Menu & Help
  if (command === 'start' || command === 'help' || command === 'commands') {
    return sendTelegram(chatId, `🚀 *Welcome to CineFuel Auto-Uploader & Moderation Bot!*

⚡ *Content Upload Commands:*
• \`/movie\` - Movie Upload Mode (4K / 1080p / BluRay)
• \`/episode\` or \`/ep\` - Single TV Episode Mode (S01E01)
• \`/bulk\` or \`/batch\` - Bulk TV Episodes Mode
• \`/zip\` or \`/pack\` - Full Season Zip / RAR / Pack Mode
• \`/auto\` - Full Auto-Sensing Mode (Default)
• \`/domain\` or \`/hubcloud\` / \`/gdflix\` - 1-Click switch mirror across all links

📥 *User Submissions & Moderation:*
• \`/requests\` or \`/req\` - View & fulfill pending user movie/series requests
• \`/reports\` or \`/rep\` - View & resolve broken link reports
• \`/reply <id> <message>\` - Send reply directly to user (notifies website + Telegram)
• \`/resolve <id> [link]\` - Fulfill request or fix broken report (notifies website + Telegram)
• \`/reject <id> [reason]\` - Reject a movie request
• \`/dismiss <id> [reason]\` - Dismiss a false alarm report
• \`/status\` - Server database & active link stats

💡 *Instant Interactive Actions:*
You can also use the inline buttons under notification cards to reply, fulfill, or fix in 1 tap!`);
  }

  if (command === 'requests' || command === 'req') {
    return await handleListRequests(chatId);
  }

  if (command === 'reports' || command === 'rep') {
    return await handleListReports(chatId);
  }

  if (['inprogress', 'progress', 'reply', 'resolve', 'fulfill', 'reject', 'dismiss', 'fix'].includes(command)) {
    return sendTelegram(
      chatId,
      `ℹ️ *Website Moderation Required*\n\nReviewing, replying, fulfilling, and resolving user requests & broken links is handled directly in the Website Admin Panel:\n🔗 https://cinephile.sk6216071.workers.dev/admin`
    );
  }

  if (command === 'status') {
    let count = 0;
    try {
      if (fs.existsSync(DATA_FILE)) {
        const all = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '{}');
        Object.values(all).forEach(arr => { if (Array.isArray(arr)) count += arr.length; });
      }
    } catch {}
    return sendTelegram(chatId, `📊 *CineFuel Bot Status*
• Bot Status: 🟢 Online & Listening
• Server Database: Connected
• Total Active Links Uploaded: *${count}*
• Admin Authorized: ✅ Yes (${msg.from?.first_name || 'Shyam'})`);
  }

  if (command === 'domain' || command === 'setdomain' || command === 'hubcloud' || command === 'gdflix' || command === 'updatedomain' || command === 'migrate') {
    let forced = null;
    if (command === 'hubcloud') forced = 'hubcloud';
    if (command === 'gdflix') forced = 'gdflix';

    const parts = (commandArgs || '').trim().split(/\s+/).filter(Boolean);

    // Case 1: Two domains provided explicitly (/updatedomain old new)
    if (parts.length >= 2) {
      const oldDom = parts[0];
      const newDom = parts[1];
      sendChatAction(chatId, 'typing');
      const res = await migrateDomain(oldDom, newDom);
      if (res.updatedCount > 0) {
        return sendTelegram(chatId, `🎉 *Domain Migration Successful!*
• Provider: \`${res.oldDomain}\` ➡️ \`${res.newDomain}\`
• Total Links Updated: *${res.updatedCount}*
• Synced across MongoDB Atlas, Upstash Redis & local cache.
🌐 All movies on CineFuel will now use \`${res.newDomain}\`!`);
      } else {
        return sendTelegram(chatId, `⚠️ *No Links Matched \`${oldDom}\`*
No links in the database currently use \`${oldDom}\`.
Use \`/domain\` without arguments to see all active domains in your database.`);
      }
    }

    // Case 2: One domain or link provided (/domain hubcloud.cx or /hubcloud hubcloud.cx or /gdflix new1.gdflix.io)
    if (parts.length === 1) {
      sendChatAction(chatId, 'typing');
      const res = await migrateProviderToNewDomain(parts[0], forced);

      if (!res.success) {
        return sendTelegram(chatId, `⚠️ *Domain Migration Error:*\n${res.error}`);
      }

      if (res.alreadyUpToDate) {
        return sendTelegram(chatId, `✅ *${res.provider} is Already Up To Date!*
All existing ${res.provider} links in your database and on CineFuel already use \`${res.newDomain}\`.`);
      }

      if (res.updatedCount > 0) {
        const details = res.oldHosts.map(h => `• \`${h.oldHost}\` ➡️ \`${res.newDomain}\` (*${h.count}* links)`).join('\n');
        return sendTelegram(chatId, `🎉 *${res.provider} Domain Updated Across Entire Website!*

• *New Active Domain:* \`${res.newDomain}\`
• *Replaced Older Mirrors:*
${details}

• *Total Links Migrated in Database:* *${res.updatedCount}*
• *Databases Synced:* MongoDB Atlas, Upstash Redis & local storage

🌐 *Live on Website:* All download buttons on CineFuel now open with \`${res.newDomain}\`!`);
      }

      return sendTelegram(chatId, `⚠️ No links found to update for ${res.provider}.`);
    }

    // Case 3: No arguments provided - show current database summary & quick examples
    sendChatAction(chatId, 'typing');
    const hostCounts = {};
    if (mongoDb) {
      try {
        const docs = await mongoDb.collection('links').find({}, { projection: { url: 1 } }).toArray();
        docs.forEach(d => {
          try {
            const h = new URL(d.url).hostname.toLowerCase().replace(/^www\./, '');
            if (h) hostCounts[h] = (hostCounts[h] || 0) + 1;
          } catch {}
        });
      } catch {}
    }
    if (Object.keys(hostCounts).length === 0 && fs.existsSync(DATA_FILE)) {
      try {
        const all = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '{}');
        Object.values(all).flat().forEach(l => {
          try {
            const h = new URL(l.url).hostname.toLowerCase().replace(/^www\./, '');
            if (h) hostCounts[h] = (hostCounts[h] || 0) + 1;
          } catch {}
        });
      } catch {}
    }

    const hubcloudHosts = Object.entries(hostCounts).filter(([h]) => h.includes('hubcloud')).map(([h, c]) => `  • \`${h}\`: *${c}* links`).join('\n') || '  • No HubCloud links yet';
    const gdflixHosts = Object.entries(hostCounts).filter(([h]) => h.includes('gdflix')).map(([h, c]) => `  • \`${h}\`: *${c}* links`).join('\n') || '  • No GDFlix links yet';
    const otherHosts = Object.entries(hostCounts).filter(([h]) => !h.includes('hubcloud') && !h.includes('gdflix')).slice(0, 5).map(([h, c]) => `  • \`${h}\`: *${c}* links`).join('\n');

    return sendTelegram(chatId, `🔄 *1-Click Domain Switcher*

Send the new domain (or any link from it), and the bot will auto-detect the provider and update ALL existing links in your database and on your website in 1 second!

📌 *How to use:*
• \`/domain <new_domain_or_link>\`
• \`/hubcloud <new_domain_or_link>\`
• \`/gdflix <new_domain_or_link>\`

💡 *Examples (tap to copy):*
• \`/hubcloud hubcloud.cx\`
• \`/gdflix new1.gdflix.io\`
• \`/domain https://hubcloud.cx/drive/4luzeji9zlxioea\`

📊 *Domains Currently Stored in Database:*
*⚡ HubCloud:*
${hubcloudHosts}

*🚀 GDFlix:*
${gdflixHosts}
${otherHosts ? `\n*📁 Other Hosts:*\n${otherHosts}` : ''}

💡 *Smart Auto-Sync Active:* When you upload any release with a newer mirror, older links are also upgraded automatically!`);
  }

  if (command === 'auto' || command === 'reset') {
    pendingChatState.delete(chatId);
    return sendTelegram(chatId, `🔄 *Auto-Sensing Mode Activated!*

You can now send any movie, single episode, bulk list, or zip pack without commands — the bot will automatically sense the release type and upload it!`);
  }

  // Interactive Command Modes (when command is sent alone)
  if ((command === 'movie' || command === 'film') && !commandArgs) {
    pendingChatState.set(chatId, { mode: 'movie', time: Date.now() });
    return sendTelegram(chatId, `🎥 *Movie Upload Mode Active!*

Send your movie release text or link. I will auto-sense movie details, quality, audio, and upload it directly to CineFuel!

📌 *Example format:*
\`Oppenheimer 2023 2160p UHD BluRay Dual Audio [15.4 GB] https://hubcloud.foo/...\`

👉 *Send your movie release now:*`);
  }

  if ((command === 'episode' || command === 'ep' || command === 'single') && !commandArgs) {
    pendingChatState.set(chatId, { mode: 'episode', time: Date.now() });
    return sendTelegram(chatId, `🎬 *Single Episode Upload Mode Active!*

Send your single TV episode details. I will auto-sense show name, season, episode, quality, and audio!

📌 *Example format:*
\`Daredevil Born Again S01E01 1080p WEB-DL Hindi DDP 5.1 [6.36 GB] - https://hubcloud.foo/...\`

👉 *Send your episode release now:*`);
  }

  if ((command === 'bulk' || command === 'batch' || command === 'episodes') && !commandArgs) {
    pendingChatState.set(chatId, { mode: 'bulk', time: Date.now() });
    return sendTelegram(chatId, `📦 *Bulk Episodes Upload Mode Active!*

Paste multiple TV episode lines or download URLs at once!

📌 *Example format:*
\`Oppenheimer S01E01 2160p WEB-DL Hindi DDP 5.1 [6.36 GB] - https://hubcloud.foo/1\`
\`Oppenheimer S01E02 2160p WEB-DL Hindi DDP 5.1 [6.28 GB] - https://hubcloud.foo/2\`
\`Oppenheimer S01E03 2160p WEB-DL Hindi DDP 5.1 [6.15 GB] - https://hubcloud.foo/3\`

👉 *Paste your multiple episode lines now:*`);
  }

  if ((command === 'zip' || command === 'pack' || command === 'season') && !commandArgs) {
    pendingChatState.set(chatId, { mode: 'zip', time: Date.now() });
    return sendTelegram(chatId, `🗜️ *Season Zip/Pack Upload Mode Active!*

Send your full season zip pack or batch archive!

📌 *Example format:*
\`Oppenheimer S01 Complete 2160p UHD BluRay DV HDR [Hindi DDP 5.1 + English Atmos].zip https://mega.nz/file/...\`

I will auto-sense the Season number, quality, audio, and publish it under the Season Zip/Pack tab!

👉 *Send your season zip pack now:*`);
  }

  // Determine active mode & text to process
  let activeMode = null;
  let textToProcess = rawText;

  if (command && ['movie', 'film'].includes(command)) {
    activeMode = 'movie';
    textToProcess = commandArgs;
  } else if (command && ['episode', 'ep', 'single'].includes(command)) {
    activeMode = 'episode';
    textToProcess = commandArgs;
  } else if (command && ['bulk', 'batch', 'episodes'].includes(command)) {
    activeMode = 'bulk';
    textToProcess = commandArgs;
  } else if (command && ['zip', 'pack', 'season'].includes(command)) {
    activeMode = 'zip';
    textToProcess = commandArgs;
  } else {
    // Check if user had a previous mode set
    const pending = pendingChatState.get(chatId);
    if (pending && pending.mode) {
      activeMode = pending.mode;
      pendingChatState.delete(chatId);
    }
  }

  // 3. Split message into individual release blocks
  const blocks = splitMessageIntoReleaseBlocks(textToProcess);

  // If no URLs found in message
  if (blocks.length === 1 && !blocks[0].url) {
    if (/^(?:hi|hello|hey)\b/i.test(textToProcess)) {
      return sendTelegram(chatId, `👋 *Hello ${msg.from?.first_name || 'Shyam'}!*

CineFuel Auto-Uploader is online! Send any movie or TV series link with details to auto-upload to your site.`);
    }

    const meta = extractBlockMetadata(textToProcess, null, activeMode);
    if (meta.titleQuery && meta.titleQuery.length >= 3) {
      pendingChatState.set(chatId, {
        rawText: textToProcess,
        meta,
        mode: activeMode,
        time: Date.now(),
      });
      return sendTelegram(chatId, `⏳ *Received Details for:* "${meta.titleQuery}"\n👉 Now send the download/stream link to publish it to CineFuel!`);
    }

    return sendTelegram(chatId, `⚠️ *No Link Detected*\nPlease include a download/stream URL with your title.`);
  }

  // Check pending state if this message is just a link
  if (blocks.length === 1 && blocks[0].url && blocks[0].text === blocks[0].url) {
    const pending = pendingChatState.get(chatId);
    if (pending) {
      blocks[0].text = `${pending.rawText}\n${blocks[0].url}`;
      if (pending.mode) activeMode = pending.mode;
      pendingChatState.delete(chatId);
    }
  }

  // Detect sensed mode if not forced
  let sensedOverall = activeMode;
  if (!sensedOverall) {
    if (/(?:\.zip|\.rar|\.7z|\bzip\b|\bpack\b|\bbatch\b|\bcomplete\b|\ball\s*episodes\b|\bfull\s*season\b)/i.test(textToProcess)) sensedOverall = 'zip';
    else if (/(?:s\d{1,2}[\s._-]*(?:ep|episode|e)[\s._-]?\d{1,3}|\be\d{1,3}\b|\bepisode[\s._-]?\d{1,3}\b)/i.test(textToProcess)) sensedOverall = 'episode';
    else if (/\b(19\d\d|20\d\d)\b/.test(textToProcess) && !/s\d{1,2}/i.test(textToProcess)) sensedOverall = 'movie';
    else sensedOverall = 'auto';
  }

  // 4. High-Performance Parallel Block Processing
  const publishedItems = [];
  const linksByMovieId = {};

  const blockItems = blocks
    .filter(b => b.url)
    .map(block => {
      const blockMode = activeMode || (sensedOverall !== 'auto' ? sensedOverall : null);
      const meta = extractBlockMetadata(block.text, block.url, blockMode);
      return { block, meta };
    })
    .filter(item => item.meta.titleQuery && item.meta.titleQuery.length >= 2);

  // Group by titleQuery to query TMDB once per unique title in the batch
  const uniqueSearches = new Map();
  for (const item of blockItems) {
    const key = `${item.meta.titleQuery.toLowerCase()}_${item.meta.year || 'any'}_${item.meta.mediaType || 'any'}`;
    if (!uniqueSearches.has(key)) {
      uniqueSearches.set(key, item.meta);
    }
  }

  // Fetch TMDB concurrently
  const searchResults = new Map();
  await Promise.all(
    Array.from(uniqueSearches.entries()).map(async ([key, meta]) => {
      const result = await searchTmdb(meta.titleQuery, meta.year, meta.mediaType);
      if (result) searchResults.set(key, result);
    })
  );

  const quarantinedItems = [];

  for (const { block, meta } of blockItems) {
    const key = `${meta.titleQuery.toLowerCase()}_${meta.year || 'any'}_${meta.mediaType || 'any'}`;
    let tmdbItem = searchResults.get(key);

    // Prevent ambiguous or unresolved posts from being automatically published
    const isAmbiguous = tmdbItem?.matchingDecision === 'ambiguous_review_needed' || tmdbItem?.matchingConfidence === 'low_ambiguous';
    const isUnresolved = !tmdbItem || !tmdbItem.id || tmdbItem.matchingDecision === 'unresolved_quarantine';

    if (isAmbiguous || isUnresolved) {
      const reason = isAmbiguous ? 'ambiguous_title_match' : 'unresolved_canonical_id';
      console.warn(`🛑 Quarantining release for admin review (${reason}): "${meta.titleQuery}" -> ${meta.url}`);
      quarantinedItems.push({
        reason,
        titleQuery: meta.titleQuery,
        year: meta.year,
        mediaType: meta.mediaType,
        rawReleaseTitle: meta.rawReleaseTitle,
        url: meta.url,
        quality: meta.quality,
        audio: meta.audio,
        size: meta.size,
        telegramMessageId: msg?.message_id,
        telegramChatId: chatId,
        telegramSender: msg?.from?.username || msg?.from?.first_name || 'telegram',
        tmdbCandidates: tmdbItem?.candidates || (tmdbItem ? [tmdbItem] : []),
        createdAt: new Date().toISOString(),
      });
      continue; // Strictly prevents publishing to public catalog
    }

    // Strict Movie vs TV Classification:
    // 1. Explicit user commands (/episode, /zip, /movie) take priority
    // 2. TMDB result is authoritative: if TMDB found a movie, it is a MOVIE
    // 3. If TMDB found a TV series, it is a TV SERIES
    // 4. Otherwise, auto-sensed metadata is used
    let isTv = false;
    if (activeMode === 'episode' || activeMode === 'zip') {
      isTv = true;
    } else if (activeMode === 'movie') {
      isTv = false;
    } else if (tmdbItem.media_type === 'movie') {
      isTv = false;
    } else if (tmdbItem.media_type === 'tv') {
      isTv = true;
    } else {
      isTv = meta.mediaType === 'tv';
    }

    const mediaType = isTv ? 'tv' : 'movie';
    const officialTitle = tmdbItem.title || tmdbItem.name || meta.titleQuery;
    const releaseDate = tmdbItem.release_date || tmdbItem.first_air_date || '';
    if (!isValidTmdbId(tmdbItem.id)) {
      console.warn(`🛑 Quarantining release due to invalid or unmapped numeric IMDb ID: "${tmdbItem.id}"`);
      quarantinedItems.push({
        reason: 'invalid_numeric_tmdb_id',
        titleQuery: meta.titleQuery,
        url: meta.url,
        telegramMessageId: msg?.message_id,
        telegramChatId: chatId,
        createdAt: new Date().toISOString(),
      });
      continue;
    }

    const movieId = tmdbItem.id;

    let displayTitle = '';
    let category = 'Streaming';

    if (mediaType === 'tv') {
      const tvSeason = meta.season || 1;
      if (meta.isPack || (meta.isZip && !meta.episode)) {
        category = 'ZipPack';
        displayTitle = meta.rawReleaseTitle || `${officialTitle} (${releaseYear}) Season ${tvSeason} Complete ${meta.quality} [${meta.audio}]`;
      } else {
        category = 'SingleEpisode';
        const epStr = meta.episode ? `E${String(meta.episode).padStart(2, '0')}` : 'E01';
        displayTitle = meta.rawReleaseTitle || `${officialTitle} (${releaseYear}) S${String(tvSeason).padStart(2, '0')}${epStr} ${meta.quality} [${meta.audio}]`;
      }
    } else {
      category = 'Streaming';
      // Exact scene release format matching reference: Black Widow (2021) IMAX 1080p 10bit Bluray x265 HEVC [Org DD 5.1 Hindi + DD 5.1 English] MSubs ~ TombDoc.mkv
      if (meta.rawReleaseTitle && meta.rawReleaseTitle.length >= 10) {
        displayTitle = meta.rawReleaseTitle;
      } else {
        displayTitle = `${officialTitle} (${releaseYear}) ${meta.quality} [${meta.audio}] ~ CineFuel.mkv`;
      }
    }

    const serverInfo = detectServer(meta.url);

    const isTvPack = mediaType === 'tv' && (meta.isPack || (meta.isZip && !meta.episode));
    const linkObj = {
      id: `tg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      movieId: String(movieId),
      mediaType,
      title: displayTitle,
      movieTitle: officialTitle,
      originalLanguage: tmdbItem.original_language || '',
      originCountry: tmdbItem.origin_country || [],
      posterPath: tmdbItem.poster_path || null,
      backdropPath: tmdbItem.backdrop_path || null,
      releaseDate: releaseDate || '',
      voteAverage: tmdbItem.vote_average || 0,
      url: meta.url,
      category,
      seasonNumber: mediaType === 'tv' ? (meta.season || 1) : undefined,
      episodeNumber: mediaType === 'tv' ? (meta.episode || (isTvPack ? undefined : 1)) : undefined,
      linkType: mediaType === 'tv' ? (isTvPack ? 'zip_pack' : 'single_episode') : 'general',
      quality: meta.quality,
      audioLanguage: meta.audio,
      size: meta.size,
      serverName: serverInfo.name,
      serverBadge: serverInfo.badge,
      container: meta.parsedRelease?.container,
      dynamicRange: meta.parsedRelease?.dynamicRange,
      bitDepth: meta.parsedRelease?.bitDepth,
      codec: meta.parsedRelease?.codec,
      resolution: meta.parsedRelease?.resolution,
      provider: meta.parsedRelease?.provider,
      telegramMessageId: msg?.message_id,
      telegramChatId: chatId,
      telegramSender: msg?.from?.username || msg?.from?.first_name || 'telegram',
      matchingDecision: tmdbItem?.matchingDecision || 'auto_matched',
      matchingConfidence: tmdbItem?.matchingConfidence || (tmdbItem?.imdb_id ? 'high_imdb' : 'standard_tmdb'),
      createdAt: new Date().toISOString(),
    };

    const strMovieId = String(movieId);
    if (!linksByMovieId[strMovieId]) linksByMovieId[strMovieId] = [];
    linksByMovieId[strMovieId].push(linkObj);

    publishedItems.push({
      title: officialTitle,
      year: releaseYear,
      mediaType,
      movieId,
      season: mediaType === 'tv' ? (meta.season || 1) : undefined,
      episode: mediaType === 'tv' ? (meta.episode || (meta.isZip ? undefined : 1)) : undefined,
      isZip: mediaType === 'tv' ? meta.isZip : false,
      quality: meta.quality,
      audio: meta.audio,
      size: meta.size,
      serverName: serverInfo.name,
      serverBadge: serverInfo.badge,
      url: meta.url,
      pageUrl: `${SITE_URL}/${mediaType}/${movieId}`,
      tmdbItem,
      releaseSummary: meta.releaseSummary,
    });
  }

  // 1. Persist quarantined releases to MongoDB for admin review
  if (quarantinedItems.length > 0 && mongoDb) {
    try {
      await mongoDb.collection('quarantine_telegram_posts').insertMany(quarantinedItems);
      console.log(`🛡️ Persisted ${quarantinedItems.length} quarantined release(s) to quarantine_telegram_posts in MongoDB`);
    } catch (qErr) {
      console.warn('MongoDB quarantine persistence warning:', qErr.message);
    }
  }

  // 2. Save all approved links in a single high-speed batch
  if (Object.keys(linksByMovieId).length > 0) {
    await saveMultipleLinks(linksByMovieId);
    console.log(`✅ Batch published ${publishedItems.length} links across ${Object.keys(linksByMovieId).length} titles!`);
  }

  // Auto-detect and sync newer filehost domains across the database
  const domainMigrations = [];
  const handledFamilies = new Set();
  for (let i = publishedItems.length - 1; i >= 0; i--) {
    const item = publishedItems[i];
    if (item.url) {
      try {
        const p = new URL(item.url.startsWith('http') ? item.url : `https://${item.url}`);
        const h = p.hostname.toLowerCase().replace(/^www\./, '');
        const fam = getDomainFamily(h);
        if (fam && !handledFamilies.has(fam.family)) {
          handledFamilies.add(fam.family);
          const migs = await autoDetectAndSyncDomain(item.url);
          if (migs && migs.length > 0) {
            domainMigrations.push(...migs);
          }
        }
      } catch {}
    }
  }

  let autoMigrationNotice = '';
  if (domainMigrations.length > 0) {
    const lines = domainMigrations.map(m => `• <b>${escapeHtml(m.name)}</b>: <code>${escapeHtml(m.oldHost)}</code> ➡️ <code>${escapeHtml(m.newHost)}</code> (<b>${m.count}</b> links upgraded)`).join('\n');
    autoMigrationNotice = `🔄 <b>Smart Domain Auto-Sync:</b>\n${lines}\n<i>All older releases were auto-upgraded to the new mirror!</i>`;
  }

  // 5. Send Confirmation Message back to Telegram matching media_1790946099611.png
  if (publishedItems.length === 0) {
    if (quarantinedItems.length > 0) {
      const qSummary = quarantinedItems
        .map((q) => `• <b>${escapeHtml(q.titleQuery)}</b> (${q.reason === 'ambiguous_title_match' ? 'Ambiguous TMDB Match' : 'Unresolved Canonical ID'})`)
        .join('\n');
      return sendTelegram(
        chatId,
        `⚠️ <b>Releases Quarantined for Admin Review</b>\n\n${qSummary}\n\n<i>These releases were NOT published to the public catalog because canonical title verification requires admin review.</i>`
      );
    }
    return sendTelegram(chatId, `⚠️ *Could Not Process Releases*\nCould not find TMDB matches for the titles provided. Please verify spelling.`);
  }

  const uploadedByTag = process.env.TELEGRAM_UPLOADED_BY || 'Shyam';
  const channelHandle = process.env.TELEGRAM_CHANNEL_HANDLE || '@cinflue';

  // Helper to extract clean metadata from tmdbItem
  const extractMediaCardMeta = (item) => {
    const tmdb = item.tmdbItem || {};
    const bPath = tmdb.backdrop_path || '';
    const pPath = tmdb.poster_path || '';
    let photoUrl = null;
    if (bPath && !bPath.includes('placeholder')) {
      photoUrl = bPath.startsWith('http') ? bPath : `https://image.tmdb.org/t/p/w780${bPath.startsWith('/') ? bPath : `/${bPath}`}`;
    } else if (pPath && !pPath.includes('placeholder')) {
      photoUrl = pPath.startsWith('http') ? pPath : `https://image.tmdb.org/t/p/w780${pPath.startsWith('/') ? pPath : `/${pPath}`}`;
    }
    const rating = tmdb.vote_average ? Number(tmdb.vote_average).toFixed(1) : '8.0';
    const genreList = Array.isArray(tmdb.genres)
      ? tmdb.genres.map((g) => g.name).filter(Boolean).join(', ')
      : (Array.isArray(tmdb.genre_ids)
          ? tmdb.genre_ids.map((id) => TMDB_GENRES[id]).filter(Boolean).join(', ')
          : 'Action, Cinema');
    const outline = tmdb.overview || `${item.title} is now streaming in high definition.`;
    return { photoUrl, rating, genreList, outline };
  };

  // Case A: Single Release
  if (publishedItems.length === 1) {
    const item = publishedItems[0];
    const { photoUrl, rating, genreList, outline } = extractMediaCardMeta(item);

    let cardTitle = item.title;
    if (item.mediaType === 'tv') {
      if (item.isZip) cardTitle = `${item.title} - SEASON ${item.season}`;
      else cardTitle = `${item.title} - S${String(item.season).padStart(2, '0')}${item.episode ? `E${String(item.episode).padStart(2, '0')}` : ''}`;
    }

    const versions = [
      {
        quality: item.releaseSummary || item.quality,
        size: item.size || (item.quality.includes('2160p') ? '4K UHD' : 'WEB-DL'),
      },
    ];

    return await sendMediaPostCard(chatId, {
      photoUrl,
      title: cardTitle,
      year: item.year,
      mediaType: item.mediaType,
      movieId: item.movieId,
      rating,
      genres: genreList,
      outline,
      versions,
      audio: item.audio,
      uploadedBy: uploadedByTag,
      channelHandle,
      pageUrl: item.pageUrl,
      autoMigrationNotice,
    });
  }

  // Case B: Batch of TV Episodes for the SAME show and season (e.g. Daredevil Season 2 E01-E13)
  const allSameTvSeason = publishedItems.length > 1 &&
    publishedItems.every(i => i.mediaType === 'tv' && i.movieId === publishedItems[0].movieId && i.season === publishedItems[0].season);

  if (allSameTvSeason) {
    const first = publishedItems[0];
    const { photoUrl, rating, genreList, outline } = extractMediaCardMeta(first);

    const epNumbers = publishedItems.map(i => i.episode).filter(Boolean).sort((a, b) => a - b);
    const epRange = epNumbers.length > 0 
      ? `E${String(epNumbers[0]).padStart(2, '0')} - E${String(epNumbers[epNumbers.length - 1]).padStart(2, '0')}` 
      : `${publishedItems.length} Episodes`;

    const versions = [
      {
        quality: `${first.quality} (${epRange})`,
        size: `${publishedItems.length} Episodes`,
      },
    ];

    const allAudios = Array.from(new Set(publishedItems.map(i => i.audio).filter(Boolean))).join(', ') || 'Hindi, English';

    return await sendMediaPostCard(chatId, {
      photoUrl,
      title: `${first.title} - SEASON ${first.season}`,
      year: first.year,
      mediaType: 'tv',
      movieId: first.movieId,
      rating,
      genres: genreList,
      outline,
      versions,
      audio: allAudios,
      uploadedBy: uploadedByTag,
      channelHandle,
      pageUrl: first.pageUrl,
      autoMigrationNotice,
    });
  }

  // Case B2: Batch of Multiple Releases for the SAME Movie (e.g. 365 Days with 2160p and 1080p)
  const allSameMovie = publishedItems.length > 1 &&
    publishedItems.every(i => i.mediaType === 'movie' && i.movieId === publishedItems[0].movieId);

  if (allSameMovie) {
    const first = publishedItems[0];
    const { photoUrl, rating, genreList, outline } = extractMediaCardMeta(first);

    const versions = publishedItems.map((item) => ({
      quality: item.quality,
      size: item.size || (item.quality.includes('2160p') ? '4K UHD' : 'FHD WEB-DL'),
    }));

    const allAudios = Array.from(new Set(publishedItems.map(i => i.audio).filter(Boolean))).join(', ') || 'Hindi, English';

    return await sendMediaPostCard(chatId, {
      photoUrl,
      title: first.title,
      year: first.year,
      mediaType: 'movie',
      movieId: first.movieId,
      rating,
      genres: genreList,
      outline,
      versions,
      audio: allAudios,
      uploadedBy: uploadedByTag,
      channelHandle,
      pageUrl: first.pageUrl,
      autoMigrationNotice,
    });
  }

  // Case C: Multi-Movie Collection / Trilogy Batch (Group by title)
  const movieGroups = {};
  for (const item of publishedItems) {
    const mId = String(item.movieId);
    if (!movieGroups[mId]) movieGroups[mId] = [];
    movieGroups[mId].push(item);
  }

  for (const items of Object.values(movieGroups)) {
    const first = items[0];
    const { photoUrl, rating, genreList, outline } = extractMediaCardMeta(first);

    let cardTitle = first.title;
    if (first.mediaType === 'tv') {
      if (first.isZip) cardTitle = `${first.title} - SEASON ${first.season}`;
      else cardTitle = `${first.title} - S${String(first.season).padStart(2, '0')}`;
    }

    const versions = items.map((item) => ({
      quality: item.quality,
      size: item.size || 'HD',
    }));

    const allAudios = Array.from(new Set(items.map(i => i.audio).filter(Boolean))).join(', ') || 'Hindi, English';

    await sendMediaPostCard(chatId, {
      photoUrl,
      title: cardTitle,
      year: first.year,
      mediaType: first.mediaType,
      movieId: first.movieId,
      rating,
      genres: genreList,
      outline,
      versions,
      audio: allAudios,
      uploadedBy: uploadedByTag,
      channelHandle,
      pageUrl: first.pageUrl,
      autoMigrationNotice,
    });
  }
}

// Long-polling loop
let lastUpdateId = 0;

async function pollUpdates() {
  while (true) {
    try {
      const res = await safeFetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=25`, { timeoutMs: 32000 });
      if (res && res.status === 401) {
        console.error('❌ FATAL AUTH ERROR: Telegram API returned 401 Unauthorized during polling.');
        console.error('🔒 Your TELEGRAM_BOT_TOKEN is invalid or was revoked by BotFather / GitHub Secret Scanning.');
        console.error('👉 Please get a new token from @BotFather and update .env.local / your host environment.');
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      if (res && res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            lastUpdateId = update.update_id;
            const message = update.message || update.edited_message;
            if (message) {
              // Execute message handler concurrently so polling is never blocked
              handleMessage(message).catch(msgErr => {
                console.error('Error handling message:', msgErr);
              });
            }
            if (update.callback_query) {
              handleCallbackQuery(update.callback_query).catch(cbErr => {
                console.error('Error handling callback query:', cbErr);
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Polling loop error (retry in 1s):', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function main() {
  const PORT = process.env.BOT_PORT || 3005;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      service: 'Cinefuel Telegram Bot',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    }));
  });

  server.on('error', (err) => {
    console.warn(`Health check server note (${err.code}), continuing Telegram polling...`);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Health check HTTP server ready on port ${PORT}`);
  });

  // Verify Telegram Bot authentication before starting polling
  try {
    const authRes = await safeFetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, { timeoutMs: 10000 });
    const authData = await authRes?.json();
    if (!authData?.ok) {
      console.error(`❌ FATAL AUTH ERROR: Failed to authenticate with Telegram API: ${authData?.description || 'Unauthorized'} (HTTP ${authRes?.status})`);
      console.error(`🔒 Root Cause: TELEGRAM_BOT_TOKEN is invalid or was revoked by Telegram / GitHub Secret Scanning.`);
      console.error(`👉 Action Required: Open Telegram -> message @BotFather -> generate a new token -> update .env.local`);
      return;
    }
    console.log(`✅ Authenticated with Telegram as @${authData.result.username} (ID: ${authData.result.id}, Name: ${authData.result.first_name})`);
  } catch (authErr) {
    console.error('⚠️ Could not verify Telegram bot authentication:', authErr.message);
  }

  // Render Free Tier Keep-Alive: Ping external URL every 10 minutes to prevent container sleep
  const renderExternalUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_SERVICE_URL;
  if (renderExternalUrl) {
    console.log(`⏱️ Setting up 10-minute keep-alive ping for ${renderExternalUrl}`);
    setInterval(async () => {
      try {
        await safeFetch(renderExternalUrl, { timeoutMs: 10000 });
        console.log('💓 Keep-alive ping sent to prevent Render sleep');
      } catch (pingErr) {
        console.warn('Keep-alive ping notice:', pingErr.message);
      }
    }, 10 * 60 * 1000);
  }

  await registerBotCommands();
  pollUpdates();
}

// Only auto-start when invoked directly from command line (not when imported)
const isDirectRun = process.argv[1] && (
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
  process.argv[1].endsWith('telegramBot.mjs')
);
if (isDirectRun) {
  main();
}


