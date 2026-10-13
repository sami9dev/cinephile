import { CustomLink } from '@/types';
import { parseReleaseDetails } from './releaseParser';

export interface ParsedMediaMeta {
  seasonNumber: number;
  episodeNumber?: number;
  linkType: 'zip_pack' | 'single_episode';
  quality?: string;
  audioLanguage?: string;
  size?: string;
  category: 'ZipPack' | 'SingleEpisode';
  rawReleaseTitle?: string;
}

/**
 * Auto-extract authentic media filename from URL (e.g. HubCloud, GDFlix, KatDrive, GDrive)
 */
export function extractFilenameFromUrl(url?: string): string {
  if (!url) return '';
  try {
    const decoded = decodeURIComponent(url);
    // 1. Check query parameters like ?file=, ?filename=, ?name=, ?title=, ?f=
    const queryMatch = decoded.match(/[?&](?:file|filename|name|title|f)=([^&#]+)/i);
    if (queryMatch && queryMatch[1]) {
      const candidate = queryMatch[1].replace(/\+/g, ' ').trim();
      if (candidate.length > 5) return candidate;
    }

    // 2. Check path segments (looking from right to left)
    const urlWithoutQuery = decoded.split(/[?#]/)[0];
    const segments = urlWithoutQuery.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i].replace(/\+/g, ' ').trim();
      // If segment looks like a file name or release title (has extension, resolution, or scene tags):
      if (
        /\.(?:mkv|mp4|avi|zip|rar|7z|tar)$/i.test(seg) ||
        /(?:2160p|1080p|720p|480p|s\d{1,2}e\d{1,2}|web-dl|webdl|bluray|remux|hevc|x265|x264|hdr)/i.test(seg)
      ) {
        return seg;
      }
    }
    // Fallback: if last segment is long enough and not a generic path like "drive", "file", "video", "d", "packs"
    if (segments.length > 0) {
      const prev = segments.length > 1 ? segments[segments.length - 2].toLowerCase() : '';
      const last = segments[segments.length - 1].replace(/\+/g, ' ').trim();
      // If preceded by "packs" or "pack", this is a pack token ID, not a media filename
      if (prev === 'packs' || prev === 'pack') {
        return '';
      }
      if (
        last.length > 8 &&
        !/^(?:drive|file|video|watch|download|view|d|v|u|packs?)$/i.test(last) &&
        !/^[a-zA-Z0-9_-]{12,}$/.test(last)
      ) {
        return last;
      }
    }
  } catch {
    // fallback
  }
  return '';
}

/**
 * Auto-detect Season Number from title, filename, or link metadata
 */
export function detectSeasonNumber(link: { title?: string; seasonNumber?: number; url?: string }): number {
  if (link.seasonNumber && link.seasonNumber > 0) {
    return link.seasonNumber;
  }

  const urlFn = extractFilenameFromUrl(link.url);
  const text = `${link.title || ''} ${urlFn}`.trim();

  if (text) {
    // 1. Check patterns like 1x01, 02x05, 10x12 (Season x Episode)
    const xMatch = text.match(/(?:^|[\s._\-[\]()])([1-9]\d{0,1})x0*([1-9]\d{0,2})(?:[\s._\-[\]()]|\b)(?!(?:264|265|266|vid)\b)/i);
    if (xMatch && xMatch[1] && xMatch[2]) {
      const candidateEp = parseInt(xMatch[2], 10);
      if (![264, 265, 266].includes(candidateEp)) {
        return parseInt(xMatch[1], 10);
      }
    }

    // 2. Check patterns like S01, S02, S100, s100, S.02, S-02, S_02, [S01], (S100)
    const sMatch = text.match(/(?:^|[\s._\-[\]()])s0*(\d{1,3})(?:[\s._\-[\]()]|e\d|\b)/i);
    if (sMatch && sMatch[1]) {
      return parseInt(sMatch[1], 10);
    }

    // 3. Check patterns like Season 2, Season 02, Season 100, Season.2, Season_2, Season-2
    const seasonMatch = text.match(/(?:^|[\s._\-[\]()])season[\s._-]?0*(\d{1,3})/i);
    if (seasonMatch && seasonMatch[1]) {
      return parseInt(seasonMatch[1], 10);
    }

    // 4. Check ordinal patterns like 1st Season, 2nd Season, 10th Season
    const ordinalMatch = text.match(/(\d{1,3})(?:st|nd|rd|th)\s*season/i);
    if (ordinalMatch && ordinalMatch[1]) {
      return parseInt(ordinalMatch[1], 10);
    }

    // 5. Check season range like S01-S04, S1-S8, S01-04
    const rangeMatch = text.match(/(?:^|[\s._\-[\]()])s0*(\d{1,3})\s*[-–—to]+\s*s?0*(\d{1,3})/i);
    if (rangeMatch && rangeMatch[1]) {
      return parseInt(rangeMatch[1], 10);
    }
  }

  return 1;
}

/**
 * Check whether a URL points to a complete season pack (e.g. HubCloud /drive/packs/..., KatDrive /packs/...)
 */
export function isPackUrl(url?: string): boolean {
  if (!url) return false;
  return /(?:\/(?:drive\/)?packs?(?:\/|$|\?)|[?&](?:type|cat|mode)=packs?|\bpacks?\b)/i.test(url);
}

/**
 * Check whether a URL or release title indicates a complete season pack or zip archive.
 * Does NOT classify individual episodes (e.g. S01E01, .mkv) as packs even if labeled "HubCloud Pack".
 */
export function isPackMedia(title?: string, url?: string): boolean {
  if (!title && !url) return false;
  const parsed = parseReleaseDetails(title || '', url);
  return parsed.isPack;
}

/**
 * Auto-detect Episode Number from title or link metadata (supports E01 - E100+)
 */
export function detectEpisodeNumber(link: { title?: string; episodeNumber?: number; url?: string }): number | undefined {
  if (link.episodeNumber !== undefined && link.episodeNumber > 0) {
    return link.episodeNumber;
  }

  // Release parser checks filename independently: S01E01 takes priority over "HubCloud Pack" labels
  const parsed = parseReleaseDetails(link.title || '', link.url);
  if (parsed.isEpisode && parsed.episodeNumber) {
    return parsed.episodeNumber;
  }

  // True pack / archive links contain the entire season / all episodes, not an individual episode
  if (parsed.isPack) {
    return undefined;
  }

  const urlFn = extractFilenameFromUrl(link.url);
  let text = `${link.title || ''} ${urlFn}`.trim();
  if (link.url) {
    try {
      const decoded = decodeURIComponent(link.url);
      text = `${text} ${decoded}`;
    } catch {
      text = `${text} ${link.url}`;
    }
  }

  if (!text) return undefined;

  // 1. Check patterns like 1x05, 01x13, 10x12 (Season x Episode)
  const xMatch = text.match(/(?:^|[\s._\-[\]()])[1-9]\d{0,1}x0*([1-9]\d{0,2})(?:[\s._\-[\]()]|\b)(?!(?:264|265|266|vid)\b)/i);
  if (xMatch && xMatch[1]) {
    const candidate = parseInt(xMatch[1], 10);
    if (![264, 265, 266].includes(candidate)) {
      return candidate;
    }
  }

  // 2. Check patterns like S01E05, S1E1, s01e13, S02-E04, S100E100, S01.E01, S01_E01
  const sEpMatch = text.match(/s\d{1,3}[\s._\-]*(?:ep|episode|e)[\s._-]?0*(\d{1,4})(?:[\s._\-[\]()]|\b)/i);
  if (sEpMatch && sEpMatch[1]) {
    return parseInt(sEpMatch[1], 10);
  }

  // 3. Check patterns like S01.01, S01-01, S01_01, S01 01 (season.episode without 'e')
  const sNumMatch = text.match(/s\d{1,3}[\s._\-]+0*(\d{1,3})(?:[\s._\-[\]()]|\b)(?![0-9]*p\b)/i);
  if (sNumMatch && sNumMatch[1]) {
    const candidate = parseInt(sNumMatch[1], 10);
    if (candidate > 0 && candidate < 200) {
      return candidate;
    }
  }

  // 4. Check patterns like Episode 01, Episode 1, Episode: 1, Episode - 1, Episode.01, Episode-01
  const episodeMatch = text.match(/(?:^|[\s._\-[\]()])episode[\s._\-:]*0*(\d{1,4})(?:[\s._\-[\]()]|\b)/i);
  if (episodeMatch && episodeMatch[1]) {
    return parseInt(episodeMatch[1], 10);
  }

  // 5. Check patterns like EP01, EP 01, EP.01, EP. 01, EP: 1, EP - 1, Ep:01
  const epMatch = text.match(/(?:^|[\s._\-[\]()])ep[\s._\-:]*0*(\d{1,4})(?:[\s._\-[\]()]|\b)/i);
  if (epMatch && epMatch[1]) {
    return parseInt(epMatch[1], 10);
  }

  // 6. Check patterns like E01, E1, E.01, E. 1, E: 1, E-01 (must not match 2160p, 1080p, etc.)
  const eMatch = text.match(/(?:^|[\s._\-[\]()])e[\s._\-:]*0*(\d{1,4})(?:[\s._\-[\]()]|\b)(?![0-9]*p\b)/i);
  if (eMatch && eMatch[1]) {
    return parseInt(eMatch[1], 10);
  }

  // 7. Check brackets like [01], [1], (01), (1) following a season or separator
  const bracketMatch = text.match(/(?:season|\bS\d{1,3}\b|[-|•:])[ \t]*[\[(]0*(\d{1,3})[\])]/i);
  if (bracketMatch && bracketMatch[1]) {
    const candidate = parseInt(bracketMatch[1], 10);
    if (candidate > 0 && candidate < 200) {
      return candidate;
    }
  }

  // 8. Check patterns like " - 01.mkv", " - 01", " - 1.mkv", ".01.mkv"
  const fileNumMatch = text.match(/[-_.\s]0*(\d{1,3})\.(?:mkv|mp4|avi|webm)/i);
  if (fileNumMatch && fileNumMatch[1]) {
    const candidate = parseInt(fileNumMatch[1], 10);
    if (candidate > 0 && candidate < 200) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Auto-detect whether a link is a Complete Season Zip/Batch Pack or Single Episode
 */
export function detectLinkType(link: { title?: string; linkType?: string; category?: string; episodeNumber?: number; url?: string }): 'zip_pack' | 'single_episode' {
  // 1. Explicit episode number provided
  if (link.episodeNumber !== undefined && link.episodeNumber > 0) {
    return 'single_episode';
  }

  // 2. Parse release metadata independently
  const parsed = parseReleaseDetails(link.title || '', link.url);

  // 3. Filename explicitly identifies an episode (e.g. S01E01, S01E02, E05, .mkv individual episode)
  if (parsed.isEpisode) {
    return 'single_episode';
  }

  // 4. Explicit flags from database / admin payload
  if (link.linkType === 'single_episode' || link.category === 'SingleEpisode') {
    return 'single_episode';
  }
  if (link.linkType === 'zip_pack' || link.category === 'ZipPack') {
    return 'zip_pack';
  }

  // 5. True season pack archive or keywords
  if (parsed.isPack || isPackMedia(link.title, link.url)) {
    return 'zip_pack';
  }

  // 6. Default: for media files and streaming links, default to single episode
  return 'single_episode';
}

/**
 * Strip website domains, release site branding, and noise watermarks
 * Prevents false 4K matches on watermarks like (TSS-4kHdHub.com) or (UHDmovies.vip)
 */
export function stripWatermarks(text: string): string {
  if (!text) return '';
  return text
    // 0. Remove leading prefix noise like "Name : ", "1. Name : ", "Title: "
    .replace(/^\s*(?:\d+[\.\)]\s*)?(?:Name|Title|Movie|Download|Link|File)\s*[:=-]+\s*/i, '')
    // 1. Remove bracketed / parenthesized domains (e.g. (TSS-4kHdHub.com), [4kHdHub.org], (UHDmovies.vip))
    .replace(/[\(\[]\s*[-a-z0-9_]*(?:4k|uhd|hd|movie|flix|hub|luxe|kat|mod|dot|vega|sky|desire)[-a-z0-9_]*(?:\.(?:com|org|net|in|cx|to|nl|app|site|vip|cc|me|xyz|top|online|co|link|cloud|live))[^\)\]]*[\)\]]/gi, ' ')
    // 2. Remove any other parenthesized/bracketed domain name ending with a common TLD
    .replace(/[\(\[]\s*[-a-z0-9_]+\.(?:com|org|net|in|cx|to|nl|app|site|vip|cc|me|xyz|top|online|co|link)\s*[\)\]]/gi, ' ')
    // 3. Remove raw domain names containing known site prefixes/suffixes without consuming preceding dots
    .replace(/(?:[-_ \(\[]+)?(?:tss[-_]*)?(?:4khdhub|vegamovies|bollyflix|hdhub4u|katmoviehd|cinemaluxe|skymovieshd|uhdmovies|desiremovies|moviesmod|dotmovies)[-a-z0-9_]*(?:\.(?:com|org|net|in|cx|to|nl|app|site|vip|cc|me|xyz|top|online|co|link|cloud|live))/gi, '')
    // 4. Remove standalone site brandings
    .replace(/(?:[-_ \(\[]+)?\b(?:tss[-_]*)?(?:4khdhub|vegamovies|bollyflix|hdhub4u|katmoviehd|cinemaluxe|skymovieshd|uhdmovies|desiremovies|moviesmod|dotmovies)[-a-z0-9_]*/gi, '')
    // 5. Remove trailing HubCloud / noise
    .replace(/\s*HUBCLOUD\s*=?\s*$/gi, '')
    .replace(/\s*HUBCLOUD\s*=?\s*/gi, ' ')
    .replace(/\s+\./g, '.')
    .replace(/\.+/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract friendly episode title from scene release filename (e.g., 'The End of the Road')
 */
export function extractEpisodeTitle(filename: string): string {
  if (!filename) return '';
  const cleaned = stripWatermarks(filename);

  // Find S\d+E\d+ or E\d+
  const match = cleaned.match(/(?:S\d{1,2}[\s._-]*E\d{1,3}|\bE\d{1,3}\b)[\s._-]+(.*)/i);
  if (!match || !match[1]) return '';

  const remainder = match[1];

  // Stop at the first quality/resolution, source, codec, audio, or metadata tag
  const stopKeywords = [
    '2160p', '1080p', '720p', '480p', '2160i', '1080i', '720i', '480i',
    'uhd', 'fhd', 'hd', 'sd', '4k',
    'web-dl', 'webdl', 'webrip', 'web', 'bluray', 'blu-ray', 'remux', 'hdtv',
    'nf', 'amzn', 'dsnp', 'atvp', 'max', 'hulu', 'zee5', 'sonyliv', 'jio',
    'hevc', 'x265', 'h.265', 'x264', 'h.264', 'avc',
    'ddp5.1', 'ddp5', 'ddp', 'dd5.1', 'aac2.0', 'aac', 'ac3', 'atmos',
    'multi', 'dual', 'hindi', 'english', 'esub', 'subs'
  ];

  const tokens = remainder.split(/[\s._-]+/);
  const titleTokens: string[] = [];

  for (const token of tokens) {
    const tLower = token.toLowerCase();
    if (
      stopKeywords.includes(tLower) ||
      /^\d{3,4}p$/i.test(token) ||
      /^(?:mkv|mp4|avi)$/i.test(token)
    ) {
      break;
    }
    titleTokens.push(token);
  }

  if (titleTokens.length > 0) {
    return titleTokens.join(' ').trim();
  }
  return '';
}

/**
 * Auto-extract Quality/Resolution format tags from title
 */
/**
 * Auto-extract Quality/Resolution format tags from title or URL
 */
export function detectQuality(title: string, defaultQuality?: string, url?: string): string {
  const urlFn = extractFilenameFromUrl(url);
  const text = `${title || ''} ${urlFn}`.trim();
  if (!text) return defaultQuality || '';

  const tags: string[] = [];
  const cleanForQuality = stripWatermarks(text);

  // 1. Resolution (Check 1080p, 720p, 480p FIRST before 4K, to prevent false 4K matches)
  let is4k = false;
  let is1080p = false;
  let is720p = false;
  let is480p = false;

  if (/(?:^|[\s._\-[\]()])(?:1080p|1080i|fhd)(?:[\s._\-[\]()]|\b)/i.test(cleanForQuality)) {
    tags.push('1080p FHD');
    is1080p = true;
  } else if (/(?:^|[\s._\-[\]()])(?:720p|720i|hd)(?:[\s._\-[\]()]|\b)/i.test(cleanForQuality)) {
    tags.push('720p HD');
    is720p = true;
  } else if (/(?:^|[\s._\-[\]()])(?:480p|480i|sd)(?:[\s._\-[\]()]|\b)/i.test(cleanForQuality)) {
    tags.push('480p SD');
    is480p = true;
  } else if (/(?:^|[\s._\-[\]()])(?:2160p|2160i|\buhd\b|\b4k\b)(?:[\s._\-[\]()]|\b)/i.test(cleanForQuality)) {
    tags.push('2160p 4K');
    is4k = true;
  }

  // 2. Source
  if (/(?:^|[\s._\-[\]()])remux(?:[\s._\-[\]()]|$)/i.test(cleanForQuality)) tags.push('REMUX');
  else if (/(?:^|[\s._\-[\]()])(?:bluray|blu-ray|bdrip)(?:[\s._\-[\]()]|$)/i.test(cleanForQuality)) tags.push('BluRay');
  else if (/(?:^|[\s._\-[\]()])(?:web-dl|webdl|webrip|web)(?:[\s._\-[\]()]|$)/i.test(cleanForQuality)) tags.push('WEB-DL');
  else if (/(?:^|[\s._\-[\]()])hdtv(?:[\s._\-[\]()]|$)/i.test(cleanForQuality)) tags.push('HDTV');

  // 3. Dynamic Range (Strict explicit identification only - NEVER default to SDR and never conflate DV with HDR!)
  const hasDV = /(?:^|[\s._\-[\]()])(?:dv|dovi|dolby[.\s_-]*vision|hdr[-._]dv|dv[-._]hdr)(?:[\s._\-[\]()]|$)/i.test(cleanForQuality);
  const hasHDR = /(?:^|[\s._\-[\]()])(?:hdr10\+|hdr10|hdr|hlg)(?:[\s._\-[\]()]|$)/i.test(cleanForQuality);
  const hasSDR = /(?:^|[\s._\-[\]()])sdr(?:[\s._\-[\]()]|$)/i.test(cleanForQuality);

  if ((hasDV || hasHDR) && hasSDR) {
    tags.push('Conflict');
  } else if (hasDV && hasHDR) {
    tags.push('DV HDR');
  } else if (hasDV) {
    tags.push('DV');
  } else if (hasHDR) {
    tags.push('HDR');
  } else if (hasSDR) {
    tags.push('SDR');
  }
  // If neither appears, do NOT push SDR! Keep dynamic range omitted/unknown!

  if (/10bit/i.test(cleanForQuality)) tags.push('10bit');

  // 4. Codec (Supports H.265 / HEVC, H.264 / AVC, AV1) - Keep codec separate from dynamic range
  const isHEVC = /(?:^|[\s._\-[\]()])(?:h\.?265|x265|hevc)(?:[\s._\-[\]()]|$)/i.test(cleanForQuality);
  if (isHEVC) {
    tags.push('HEVC');
  } else if (/(?:^|[\s._\-[\]()])(?:h\.?264|x264|avc)(?:[\s._\-[\]()]|$)/i.test(cleanForQuality)) {
    tags.push('x264');
  } else if (/(?:^|[\s._\-[\]()])av1(?:[\s._\-[\]()]|$)/i.test(cleanForQuality)) {
    tags.push('AV1');
  }

  if (tags.length > 0) {
    return tags.join(' • ');
  }

  return defaultQuality || '';
}

/**
 * Auto-extract Audio and Language tags from title or URL
 */
export function detectAudio(title: string, defaultAudio?: string, url?: string): string {
  const urlFn = extractFilenameFromUrl(url);
  const text = `${title || ''} ${urlFn}`.trim();
  if (!text) return defaultAudio || 'English';

  const languages: string[] = [];

  // Dual / Multi Audio
  if (/dual\s*audio/i.test(text)) {
    return 'Dual Audio (Hin + Eng)';
  }
  if (/multi\s*audio/i.test(text)) {
    return 'Multi Audio (5.1)';
  }

  // Language tags with channels
  const hasHindi = /hindi|hin/i.test(text);
  const hasEnglish = /english|eng/i.test(text);
  const hasTamil = /tamil|tam/i.test(text);
  const hasTelugu = /telugu|tel/i.test(text);
  const hasJapanese = /japanese|jap/i.test(text);
  const hasKorean = /korean|kor/i.test(text);
  const hasSpanish = /spanish|spa/i.test(text);

  if (hasHindi && hasEnglish) {
    const atmos = /atmos|truehd/i.test(text) ? 'Atmos' : '';
    const ddp = /ddp\s*5\.1|ddp5\.1|5\.1/i.test(text) ? '5.1' : '';
    return `Hindi + English ${[atmos, ddp].filter(Boolean).join(' ')}`.trim();
  }

  if (hasHindi) languages.push('Hindi Dubbed');
  if (hasEnglish) languages.push('English (Original)');
  if (hasTamil) languages.push('Tamil');
  if (hasTelugu) languages.push('Telugu');
  if (hasJapanese) languages.push('Japanese Sub');
  if (hasKorean) languages.push('Korean Sub');
  if (hasSpanish) languages.push('Spanish');

  if (languages.length > 0) {
    return languages.join(' • ');
  }

  return defaultAudio || 'English';
}

/**
 * Auto-extract File Size from title or URL (e.g. 16.8 GB, 7.4 GB, 850 MB, 6.36 GB)
 */
export function detectSize(title?: string, defaultSize?: string, url?: string): string | undefined {
  if (title) {
    const sizeMatch = title.match(/\b(\d+(?:\.\d+)?\s*(?:gb|mb|tb))\b/i);
    if (sizeMatch && sizeMatch[1]) {
      return sizeMatch[1].toUpperCase();
    }
  }
  if (url) {
    const urlFn = extractFilenameFromUrl(url);
    const candidate = `${urlFn} ${url}`;
    const sizeMatch = candidate.match(/\b(\d+(?:\.\d+)?\s*(?:gb|mb|tb))\b/i);
    if (sizeMatch && sizeMatch[1]) {
      return sizeMatch[1].toUpperCase();
    }
  }
  return defaultSize;
}

/**
 * Auto-parse full media metadata from title string or URL
 */
export function parseFullMediaTitle(title: string, url?: string): ParsedMediaMeta {
  const parsed = parseReleaseDetails(title, url);
  const seasonNumber = parsed.seasonNumber || detectSeasonNumber({ title, url });
  const episodeNumber = parsed.isEpisode ? parsed.episodeNumber : detectEpisodeNumber({ title, url });
  const linkType = detectLinkType({ title, episodeNumber, url });
  const quality = detectQuality(title, undefined, url);
  const audioLanguage = parsed.audioLanguage || detectAudio(title, undefined, url);
  const size = parsed.fileSize || detectSize(title, undefined, url);
  const category: 'ZipPack' | 'SingleEpisode' = linkType === 'zip_pack' ? 'ZipPack' : 'SingleEpisode';

  // Extract raw release title candidate if present
  let rawReleaseTitle = '';
  const lines = title.split('\n').map((l) => l.trim()).filter(Boolean);
  const candidate = lines.find((l) => !l.startsWith('http') && /(?:1080p|2160p|720p|4k|bluray|remux|web-dl|hevc|x265|x264|\.mkv|\.mp4)/i.test(l)) || lines[0];
  if (candidate && candidate.length > 8 && !candidate.startsWith('http')) {
    rawReleaseTitle = candidate
      .replace(/^(?:📥|🔗|⚡|🔥|🎬|▶️|\d+\.|\d+\))\s*/gu, '')
      .replace(/^(?:Name|Title|Movie|Download|Link)\s*[-:=]+\s*/i, '')
      .replace(/https?:\/\/[^\s]+/gi, '')
      .trim();
  }

  return {
    seasonNumber,
    episodeNumber: linkType === 'zip_pack' ? undefined : episodeNumber,
    linkType,
    quality,
    audioLanguage,
    size,
    category,
    rawReleaseTitle: rawReleaseTitle || undefined,
  };
}

/**
 * Quality weight score for sorting links (2160p 4K at top, then 1080p, then 720p)
 */
export function getQualityWeight(qualityStr: string = ''): number {
  const q = qualityStr.toLowerCase();
  if (q.includes('2160') || q.includes('4k') || q.includes('uhd')) return 400;
  if (q.includes('remux')) return 350;
  if (q.includes('1080') || q.includes('fhd')) return 300;
  if (q.includes('720') || q.includes('hd')) return 200;
  if (q.includes('480') || q.includes('sd')) return 100;
  return 250;
}

export interface ParsedBulkItem {
  id: string;
  title: string;
  url: string;
  linkType?: 'zip_pack' | 'single_episode' | 'general';
  seasonNumber?: number;
  episodeNumber?: number;
  quality: string;
  audioLanguage: string;
  size?: string;
  category: CustomLink['category'];
}

/**
 * Intelligently parse raw bulk/multi-line text into structured season/episode links OR movie release links
 */
export function parseBulkLinksInput(
  rawText: string,
  fallbackSeason: number = 1,
  mediaType: 'movie' | 'tv' = 'tv',
  defaultCategory: CustomLink['category'] = 'Streaming'
): ParsedBulkItem[] {
  if (!rawText || !rawText.trim()) return [];

  const items: ParsedBulkItem[] = [];
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const urlRegex = /(https?:\/\/[^\s<>"']+)/i;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(urlRegex);

    if (match) {
      const url = match[1];
      let titlePart = line.replace(url, '').trim();
      titlePart = titlePart.replace(/^[-|:•\s\t>\])]+|[-|:•\s\t<\[(]+$/g, '').trim();

      if (!titlePart || titlePart.length < 3) {
        try {
          const urlObj = new URL(url);
          const pathname = decodeURIComponent(urlObj.pathname);
          const filename = pathname.split('/').pop() || '';
          titlePart = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[._-]/g, ' ').trim();
        } catch {
          titlePart = `Link ${items.length + 1}`;
        }
      }

      if (mediaType === 'movie') {
        const quality = detectQuality(titlePart);
        const audioLanguage = detectAudio(titlePart);
        const size = detectSize(titlePart);

        items.push({
          id: `bulk-${Date.now()}-${items.length}-${Math.random().toString(36).slice(2, 6)}`,
          title: titlePart || `Movie Release ${items.length + 1}`,
          url,
          linkType: 'general',
          seasonNumber: undefined,
          episodeNumber: undefined,
          quality: quality || '1080p WEB-DL',
          audioLanguage: audioLanguage || 'English',
          size,
          category: defaultCategory || 'Streaming',
        });
        i++;
        continue;
      }

      const meta = parseFullMediaTitle(titlePart, url);
      const sNum = meta.seasonNumber || fallbackSeason;
      let finalEp = meta.episodeNumber || detectEpisodeNumber({ title: titlePart, url });
      let finalLinkType = meta.linkType;
      const isExplicitZip = isPackMedia(titlePart, url);
      if (isExplicitZip) {
        finalLinkType = 'zip_pack';
        finalEp = undefined;
      } else if (!finalEp) {
        finalEp = items.filter((it) => it.linkType !== 'zip_pack').length + 1;
        finalLinkType = 'single_episode';
      }

      items.push({
        id: `bulk-${Date.now()}-${items.length}-${Math.random().toString(36).slice(2, 6)}`,
        title: titlePart || (finalLinkType === 'zip_pack' ? `Season ${sNum} Complete Pack` : `Episode ${finalEp || items.length + 1}`),
        url,
        linkType: finalLinkType,
        seasonNumber: sNum,
        episodeNumber: finalEp,
        quality: meta.quality || '1080p WEB-DL',
        audioLanguage: meta.audioLanguage || 'English',
        size: meta.size,
        category: finalLinkType === 'zip_pack' ? 'ZipPack' : 'SingleEpisode',
      });
      i++;
    } else {
      if (i + 1 < lines.length && urlRegex.test(lines[i + 1])) {
        const titlePart = line.replace(/^[-|:•\s\t>\])]+|[-|:•\s\t<\[(]+$/g, '').trim();
        const nextUrlMatch = lines[i + 1].match(urlRegex);
        if (nextUrlMatch) {
          const url = nextUrlMatch[1];

          if (mediaType === 'movie') {
            const quality = detectQuality(titlePart);
            const audioLanguage = detectAudio(titlePart);
            const size = detectSize(titlePart);

            items.push({
              id: `bulk-${Date.now()}-${items.length}-${Math.random().toString(36).slice(2, 6)}`,
              title: titlePart || `Movie Release ${items.length + 1}`,
              url,
              linkType: 'general',
              seasonNumber: undefined,
              episodeNumber: undefined,
              quality: quality || '1080p WEB-DL',
              audioLanguage: audioLanguage || 'English',
              size,
              category: defaultCategory || 'Streaming',
            });
            i += 2;
            continue;
          }

          const meta = parseFullMediaTitle(titlePart, url);
          const sNum = meta.seasonNumber || fallbackSeason;
          let finalEp = meta.episodeNumber || detectEpisodeNumber({ title: titlePart, url });
          let finalLinkType = meta.linkType;
          const isExplicitZip = isPackMedia(titlePart, url);
          if (isExplicitZip) {
            finalLinkType = 'zip_pack';
            finalEp = undefined;
          } else if (!finalEp) {
            finalEp = items.filter((it) => it.linkType !== 'zip_pack').length + 1;
            finalLinkType = 'single_episode';
          }

          items.push({
            id: `bulk-${Date.now()}-${items.length}-${Math.random().toString(36).slice(2, 6)}`,
            title: titlePart || (finalLinkType === 'zip_pack' ? `Season ${sNum} Complete Pack` : `Episode ${finalEp || items.length + 1}`),
            url,
            linkType: finalLinkType,
            seasonNumber: sNum,
            episodeNumber: finalEp,
            quality: meta.quality || '1080p WEB-DL',
            audioLanguage: meta.audioLanguage || 'English',
            size: meta.size,
            category: finalLinkType === 'zip_pack' ? 'ZipPack' : 'SingleEpisode',
          });
          i += 2;
          continue;
        }
      }
      i++;
    }
  }

  return items;
}

/**
 * Auto-detect official OTT Streaming Platform (DSNP, NF, AMZN, ATVP, MAX, JIO, SONYLIV, ZEE5)
 * Accurately maps Marvel & Star Wars series to Disney+ (DSNP), Amazon shows to AMZN, etc.
 */
export function detectShowPlatform(
  rawTitle: string,
  titleDetails?: { title?: string; name?: string; networks?: any[]; 'watch/providers'?: any; production_companies?: any }
): string {
  const titleLower = (rawTitle || '').toLowerCase();
  const showName = (titleDetails?.name || titleDetails?.title || '').toLowerCase();
  const combined = `${titleLower} ${showName}`.toLowerCase();

  // 1. TMDB Networks detection (Highest authority)
  const networks = titleDetails?.networks || [];
  if (Array.isArray(networks) && networks.length > 0) {
    for (const net of networks) {
      const netName = (net.name || '').toLowerCase();
      const netId = Number(net.id);
      if (netId === 2739 || /disney/i.test(netName)) return 'DSNP';
      if (netId === 213 || /netflix/i.test(netName)) return 'NF';
      if (netId === 1024 || /amazon|prime/i.test(netName)) return 'AMZN';
      if (netId === 2552 || /apple/i.test(netName)) return 'ATVP';
      if (netId === 49 || netId === 3186 || /hbo|max/i.test(netName)) return 'MAX';
      if (netId === 453 || /hulu/i.test(netName)) return 'HULU';
      if (/jio/i.test(netName)) return 'JIO';
      if (/sony/i.test(netName)) return 'SONYLIV';
      if (/zee/i.test(netName)) return 'ZEE5';
      if (/paramount/i.test(netName)) return 'PARAMOUNT';
      if (/peacock/i.test(netName)) return 'PEACOCK';
    }
  }

  // 2. TMDB Production Companies detection
  const companies = titleDetails?.production_companies || [];
  if (Array.isArray(companies) && companies.length > 0) {
    for (const comp of companies) {
      const compName = (comp.name || '').toLowerCase();
      if (/marvel\s*studios|lucasfilm|walt\s*disney|pixar/i.test(compName)) return 'DSNP';
      if (/netflix/i.test(compName)) return 'NF';
      if (/amazon\s*studios/i.test(compName)) return 'AMZN';
      if (/apple\s*studios/i.test(compName)) return 'ATVP';
      if (/hbo|warner\s*bros/i.test(compName)) return 'MAX';
    }
  }

  // 3. High-Precision Known Titles / Franchise Registry (Marvel MCU, Star Wars = Disney+ DSNP)
  // Disney+ (Marvel Cinematic Universe, Star Wars & Disney+ originals)
  if (
    /(?:hawkeye|echo\b|loki\b|moon\s*knight|wandavision|ms\.?\s*marvel|she[- ]*hulk|secret\s*invasion|falcon\s*(?:and|&)\s*(?:the\s*)?winter\s*soldier|what\s*if|agatha|ironheart|daredevil:\s*born\s*again|daredevil\s*born\s*again|mandalorian|ahsoka|andor\b|obi[- ]*wan|boba\s*fett|acolyte|skeleton\s*crew|bad\s*batch|tales\s*of\s*the\s*jedi|percy\s*jackson|extraordinary|shogun\b)/i.test(
      combined
    )
  ) {
    return 'DSNP';
  }

  // Amazon Prime Video
  if (
    /(?:the\s*boys|gen\s*v|reacher|rings\s*of\s*power|lord\s*of\s*the\s*rings|fallout|citadel|invincible|wheel\s*of\s*time|jack\s*ryan|bosch|mirzapur|the\s*family\s*man|panchayat|farzi|paatal\s*lok|made\s*in\s*heaven|fleabag|maisel)/i.test(
      combined
    )
  ) {
    return 'AMZN';
  }

  // Apple TV+
  if (
    /(?:ted\s*lasso|severance|silo\b|foundation\b|morning\s*show|slow\s*horses|for\s*all\s*mankind|monarch:\s*legacy|presumed\s*innocent|masters\s*of\s*the\s*air|shrinking|black\s*bird|defending\s*jacob|dark\s*matter)/i.test(
      combined
    )
  ) {
    return 'ATVP';
  }

  // HBO / Max
  if (
    /(?:house\s*of\s*the\s*dragon|game\s*of\s*thrones|last\s*of\s*us|succession|euphoria|white\s*lotus|peacemaker|true\s*detective|the\s*penguin|penguin\b|chernobyl|westworld|sopranos|the\s*wire|barry\b|silicon\s*valley|dune:\s*prophecy)/i.test(
      combined
    )
  ) {
    return 'MAX';
  }

  // Netflix
  if (
    /(?:stranger\s*things|squid\s*game|wednesday|money\s*heist|dark\b|witcher|black\s*mirror|bridgerton|one\s*piece|cobra\s*kai|sex\s*education|ozark|narcos|all\s*of\s*us\s*are\s*dead|alice\s*in\s*borderland|sacred\s*games|delhi\s*crime|kota\s*factory|american\s*primeval|heartstopper|the\s*crown|outer\s*banks|lucifer|emily\s*in\s*paris|sandman|arcane|3\s*body\s*problem|baby\s*reindeer|sweet\s*tooth|locke\s*(?:and|&)\s*key)/i.test(
      combined
    )
  ) {
    return 'NF';
  }

  // JioCinema
  if (/(?:asur\b|taaza\s*khabar|special\s*ops|criminal\s*justice|aarya|freelancer)/i.test(combined)) {
    return 'JIO';
  }

  // SonyLIV
  if (/(?:scam\s*1992|scam\s*2003|gullak|rocket\s*boys|maharani|tabbar|undekhi)/i.test(combined)) {
    return 'SONYLIV';
  }

  // Zee5
  if (/(?:taj:\s*divided|sunflower|pitchers|tripling|rangbaaz)/i.test(combined)) {
    return 'ZEE5';
  }

  // 4. TMDB Watch Providers detection
  const wpResults = titleDetails?.['watch/providers']?.results || {};
  const allProviders = [
    ...(wpResults.IN?.flatrate || []),
    ...(wpResults.US?.flatrate || []),
    ...(wpResults.GB?.flatrate || []),
  ];
  for (const p of allProviders) {
    const pName = (p.provider_name || '').toLowerCase();
    if (/disney|hotstar/i.test(pName)) return 'DSNP';
    if (/netflix/i.test(pName)) return 'NF';
    if (/amazon|prime/i.test(pName)) return 'AMZN';
    if (/apple/i.test(pName)) return 'ATVP';
    if (/max|hbo/i.test(pName)) return 'MAX';
    if (/jio/i.test(pName)) return 'JIO';
    if (/sony/i.test(pName)) return 'SONYLIV';
    if (/zee5/i.test(pName)) return 'ZEE5';
  }

  // 5. Explicit platform tag in release title / filename (checked if not identified above)
  if (/(?:^|[\s._\-[\]()])(?:dsnp|disney(?:\s*\+)?|hotstar)(?:[\s._\-[\]()]|$)/i.test(titleLower)) return 'DSNP';
  if (/(?:^|[\s._\-[\]()])(?:amzn|prime\s*video)(?:[\s._\-[\]()]|$)/i.test(titleLower)) return 'AMZN';
  if (/(?:^|[\s._\-[\]()])(?:atvp|apple\s*tv(?:\s*\+)?)(?:[\s._\-[\]()]|$)/i.test(titleLower)) return 'ATVP';
  if (/(?:^|[\s._\-[\]()])(?:max|hbo\s*max|hbo)(?:[\s._\-[\]()]|$)/i.test(titleLower)) return 'MAX';
  if (/(?:^|[\s._\-[\]()])(?:nf|netflix)(?:[\s._\-[\]()]|$)/i.test(titleLower)) return 'NF';
  if (/(?:^|[\s._\-[\]()])(?:zee5)(?:[\s._\-[\]()]|$)/i.test(titleLower)) return 'ZEE5';
  if (/(?:^|[\s._\-[\]()])(?:sonyliv|sliv)(?:[\s._\-[\]()]|$)/i.test(titleLower)) return 'SONYLIV';
  if (/(?:^|[\s._\-[\]()])(?:jiocinema|jio)(?:[\s._\-[\]()]|$)/i.test(titleLower)) return 'JIO';
  if (/(?:^|[\s._\-[\]()])(?:hulu)(?:[\s._\-[\]()]|$)/i.test(titleLower)) return 'HULU';
  if (/(?:^|[\s._\-[\]()])(?:paramount(?:\s*\+)?|p\+)(?:[\s._\-[\]()]|$)/i.test(titleLower)) return 'PARAMOUNT';
  if (/(?:^|[\s._\-[\]()])(?:peacock)(?:[\s._\-[\]()]|$)/i.test(titleLower)) return 'PEACOCK';

  return '';
}

