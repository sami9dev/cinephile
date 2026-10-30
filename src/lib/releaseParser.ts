/**
 * Unified Release Name and Filename Metadata Parser for CineFuel.
 * 
 * Accurately and independently extracts:
 * 1. File/container type (.zip -> ZIP archive, .mkv -> MKV video file, .mp4, etc.)
 * 2. Pack vs Episode (Season-level ZIP / Pack keywords vs S01E01 / Episode number)
 * 3. Resolution (2160p/4K, 1080p, 720p, 480p) - does NOT imply dynamic range!
 * 4. Dynamic Range (DV HDR, HDR, SDR, conflict, or undefined/unknown) - NEVER defaults to SDR!
 * 5. Bit Depth (10bit, 8bit) - independent of dynamic range!
 * 6. Codec (H.265, H.264, AV1, VC-1) - independent of dynamic range!
 * 7. Source & Provider (WEB-DL, BluRay, REMUX / NF, DSNP, Hulu, AMZN, Max, HubCloud, GDFlix)
 * 8. Audio and Languages (Hindi, English, DDP 5.1, Atmos, etc.)
 * 
 * Supports manual admin overrides so admin edits are never silently overwritten.
 */

export interface ReleaseDetails {
  rawTitle: string;
  url?: string;

  // 1. Container / File type
  container?: 'ZIP' | 'MKV' | 'MP4' | 'RAR' | '7Z' | 'AVI' | 'UNKNOWN';
  containerLabel?: string; // 'ZIP archive' | 'MKV video file' | 'MP4 video file' etc.

  // 2. Pack vs Episode
  packType: 'season_pack' | 'individual_episode' | 'general';
  packTypeLabel: string; // 'Season pack' | 'Individual episode' | 'Movie / Media'
  isPack: boolean;
  isEpisode: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeNumberEnd?: number;
  isMultiEpisode?: boolean;
  isSpecial?: boolean;
  seriesFolder?: string;
  folderSeasonNumber?: number;

  // 3. Resolution
  resolution?: '2160p' | '1080p' | '720p' | '480p';
  resolutionLabel?: '2160p/4K' | '1080p' | '720p' | '480p';

  // 4. Dynamic Range
  dynamicRange?: 'DV HDR' | 'DV' | 'HDR' | 'SDR' | 'conflict';
  dynamicRangeLabel?: 'DV HDR' | 'DV' | 'HDR' | 'SDR' | 'Conflict' | 'Unknown';

  // 5. Bit Depth
  bitDepth?: '10bit' | '8bit' | '12bit';

  // 6. Codec
  codec?: 'H.265' | 'H.264' | 'AV1' | 'VC-1';

  // 7. Source & Provider
  source?: 'WEB-DL' | 'WEBRip' | 'BluRay' | 'REMUX' | 'HDTV' | 'DVD';
  provider?: 'NF' | 'DSNP' | 'Hulu' | 'AMZN' | 'Max' | 'ATVP' | 'HubCloud' | 'GDFlix' | 'KatDrive' | string;

  // 8. Audio
  audioLanguage?: string;
  audioChannels?: string;
  audioLabel?: string;

  // Additional details
  fileSize?: string;
  part?: string;

  // Formatted summaries
  summaryLine: string; // e.g. "ZIP archive · Season pack · 2160p · DV HDR · H.265 · Hindi + English DDP 5.1"
  badges: string[]; // ['2160p/4K', 'WEB-DL', 'DV HDR', '10bit', 'H.265', 'ZIP archive', 'Season pack', 'DSNP']
}

export interface ReleaseOverrides {
  container?: 'ZIP' | 'MKV' | 'MP4' | 'RAR' | '7Z' | 'AVI' | 'UNKNOWN' | string;
  packType?: 'season_pack' | 'individual_episode' | 'general' | string;
  linkType?: 'zip_pack' | 'single_episode' | 'general' | string;
  resolution?: string;
  dynamicRange?: string; // 'DV HDR' | 'HDR' | 'SDR' | 'None' | 'Unknown' | 'conflict'
  bitDepth?: string;
  codec?: string;
  provider?: string;
  source?: string;
  audioLanguage?: string;
  fileSize?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

/**
 * Extracts a filename from a URL path, stripping querystrings, hashes, and percent-encoding
 */
export function extractFilenameFromUrl(url?: string): string {
  if (!url) return '';
  try {
    const cleanUrl = url.split('#')[0].split('?')[0];
    const segments = cleanUrl.split('/').filter(Boolean);
    if (segments.length === 0) return '';
    const lastSeg = segments[segments.length - 1];
    return decodeURIComponent(lastSeg).trim();
  } catch {
    const lastPart = (url || '').split('/').pop() || '';
    return lastPart.split('?')[0].split('#')[0].trim();
  }
}

/**
 * Removes watermarks and domain prefixes
 */
export function cleanReleaseTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/^\s*(?:\d+[\.\)]\s*)?(?:Name|Title|Movie|Download|Link|File)\s*[:=-]+\s*/i, '')
    .replace(/^\[(?:HubCloud|GDFlix|KatDrive|MoviesDrive|BollyFlix|Vegamovies|HDHub4u)[^\]]*\]\s*/gi, '')
    .replace(
      /(?:[-_ \(\[]+)?(?:tss[-_]*)?(?:4khdhub|vegamovies|bollyflix|hdhub4u|katmoviehd|cinemaluxe|skymovieshd|uhdmovies|desiremovies|moviesmod|dotmovies)[-a-z0-9_]*(?:\.(?:com|org|net|in|cx|to|nl|app|site|vip|cc|me|xyz|top|online|co|link|cloud|live|lol|lat|pro|club|ink|bio|day|cfd))?/gi,
      ' '
    )
    .replace(
      /\b(?:www\.[a-z0-9-]+\.[a-z]{2,}|[a-z0-9-]+\.(?:org|com|in|me|cx|top|lol|lat|pro|club|ink|bio|day|cfd|vip|cc|to|xyz|app|net|site|cloud|live|online|link))\b/gi,
      ' '
    )
    .trim();
}

/**
 * Parses release filename and URL into independent metadata properties.
 */
export function parseReleaseDetails(
  rawInput: string,
  url?: string,
  overrides?: ReleaseOverrides
): ReleaseDetails {
  const cleanInput = cleanReleaseTitle(rawInput || '');
  const urlFilename = extractFilenameFromUrl(url);
  const cleanUrlFilename = cleanReleaseTitle(urlFilename);

  // 1. EXTRACT CONTAINER / FILE EXTENSION
  // Check explicit file extension in filename or URL (.zip, .mkv, .mp4, .rar, .7z)
  let container: ReleaseDetails['container'] = undefined;
  let containerLabel: string | undefined = undefined;

  const combinedForExt = `${cleanInput} ${cleanUrlFilename}`.toLowerCase();
  const extMatch = combinedForExt.match(/\.(zip|mkv|mp4|rar|7z|tar|gz|avi|iso)(?:$|[\s?#])/i);
  if (extMatch) {
    const ext = extMatch[1].toUpperCase();
    if (ext === 'ZIP') {
      container = 'ZIP';
      containerLabel = 'ZIP archive';
    } else if (ext === 'MKV') {
      container = 'MKV';
      containerLabel = 'MKV video file';
    } else if (ext === 'MP4') {
      container = 'MP4';
      containerLabel = 'MP4 video file';
    } else if (ext === 'RAR') {
      container = 'RAR';
      containerLabel = 'RAR archive';
    } else if (ext === '7Z') {
      container = '7Z';
      containerLabel = '7Z archive';
    } else if (ext === 'AVI') {
      container = 'AVI';
      containerLabel = 'AVI video file';
    }
  }

  // Text representation with normalized token separators for regex inspection
  // We protect audio channel numbers (e.g. 5.1, 7.1, 2.0) and video codecs (x264, x265, x266)
  // so audio channels like '5.1] x265' are never misparsed as Season 1, Episode 265!
  const textWithProtectedTokens = ` ${cleanInput} ${cleanUrlFilename} `
    .replace(/\b([1-9])\.([0-2])\b/g, ' audio_$1_$2 ')
    .replace(/\bx(264|265|266)\b/gi, ' codec_x$1 ')
    .replace(/\b(s0*\d{1,3}[\s._-]*e0*\d{1,4})[\s._-]*[-~to]+[\s._-]*(?:e|ep|episode)?0*(\d{1,4})\b/gi, ' $1_to_e$2 ')

  const normText = textWithProtectedTokens
    .replace(/[\.\_\-\[\]\(\)\{\}\\\/]/g, ' ')
    .replace(/\s+/g, ' ');

  // 2. PACK VS EPISODE DETECTION
  // Check for explicit episode number in filename (S01E05, S01E02-E03, 1x02, Season 1 Episode 2, E05, Ep 05)
  // CRITICAL: Individual episode markers ALWAYS take precedence over provider labels like "HubCloud Pack"!
  let seasonNumber: number | undefined = undefined;
  let episodeNumber: number | undefined = undefined;
  let episodeNumberEnd: number | undefined = undefined;
  let isMultiEpisode = false;
  let isSpecial = false;

  // Folder context inspection from rawInput (e.g. "TV/Show/Season 1/02.mkv", "Specials/S00E01.mkv")
  const normalizedPath = (rawInput || '').replace(/\\/g, '/');
  const pathSegments = normalizedPath.split('/').filter(Boolean);
  let folderSeasonNumber: number | undefined = undefined;
  let seriesFolder: string | undefined = undefined;

  if (pathSegments.length > 1) {
    const parentSegments = pathSegments.slice(0, -1);
    for (let i = parentSegments.length - 1; i >= 0; i--) {
      const seg = parentSegments[i];
      if (/specials/i.test(seg) || /season\s*0\b/i.test(seg)) {
        folderSeasonNumber = 0;
        isSpecial = true;
        if (i > 0) seriesFolder = parentSegments[i - 1];
        break;
      }
      const seasonFolderMatch = seg.match(/\b(?:season|series)\s*0*(\d{1,3})\b/i) || seg.match(/\bS0*(\d{1,3})\b/i);
      if (seasonFolderMatch) {
        folderSeasonNumber = parseInt(seasonFolderMatch[1], 10);
        if (i > 0) seriesFolder = parentSegments[i - 1];
        break;
      }
    }
  }

  // A. Season + Episode: S01E05, S1E1, 1x02, 01x02, Season 1 Episode 2, S01E02-E03, S00E01
  const sEpMatch = normText.match(/\bS0*(\d{1,3})\s*(?:EP|E|Episode)\s*0*(\d{1,4})(?:\s*[-~to]+\s*(?:EP|E|Episode)?\s*0*(\d{1,4}))?\b/i);
  const seasonEpisodeWordMatch = normText.match(/\bSeason\s*0*(\d{1,3})\s*(?:Episode|Ep|E)\s*0*(\d{1,4})(?:\s*[-~to]+\s*(?:Episode|Ep|E)?\s*0*(\d{1,4}))?\b/i);
  const xMatch = normText.match(/\b0*([0-9]\d{0,1})\s*x\s*0*([1-9]\d{0,2})(?:\s*[-~to]+\s*0*([1-9]\d{0,2}))?\b(?!(?:264|265|266|vid)\b)/i);

  if (sEpMatch) {
    const candidateSeason = parseInt(sEpMatch[1], 10);
    const candidateEp = parseInt(sEpMatch[2], 10);
    if (![264, 265, 266].includes(candidateEp)) {
      seasonNumber = candidateSeason;
      episodeNumber = candidateEp;
      if (sEpMatch[3]) {
        episodeNumberEnd = parseInt(sEpMatch[3], 10);
        isMultiEpisode = episodeNumberEnd > episodeNumber;
      }
      if (candidateSeason === 0) isSpecial = true;
    }
  } else if (seasonEpisodeWordMatch) {
    const candidateSeason = parseInt(seasonEpisodeWordMatch[1], 10);
    const candidateEp = parseInt(seasonEpisodeWordMatch[2], 10);
    seasonNumber = candidateSeason;
    episodeNumber = candidateEp;
    if (seasonEpisodeWordMatch[3]) {
      episodeNumberEnd = parseInt(seasonEpisodeWordMatch[3], 10);
      isMultiEpisode = episodeNumberEnd > episodeNumber;
    }
    if (candidateSeason === 0) isSpecial = true;
  } else if (xMatch) {
    const candidateSeason = parseInt(xMatch[1], 10);
    const candidateEp = parseInt(xMatch[2], 10);
    if (![264, 265, 266].includes(candidateEp)) {
      seasonNumber = candidateSeason;
      episodeNumber = candidateEp;
      if (xMatch[3]) {
        episodeNumberEnd = parseInt(xMatch[3], 10);
        isMultiEpisode = episodeNumberEnd > episodeNumber;
      }
      if (candidateSeason === 0) isSpecial = true;
    }
  }

  // B. Standalone Episode: E05, Episode 05, Ep 5 (ensuring it's not a resolution like 1080p or part)
  if (episodeNumber === undefined) {
    const epMatch = normText.match(/\b(?:Episode|Ep)\s*0*(\d{1,4})(?:\s*[-~to]+\s*0*(\d{1,4}))?\b/i) ||
                    normText.match(/\bE\s*0*(\d{1,4})(?:\s*[-~to]+\s*0*(\d{1,4}))?\b(?!\s*p\b)/i);
    if (epMatch) {
      episodeNumber = parseInt(epMatch[1], 10);
      if (epMatch[2]) {
        episodeNumberEnd = parseInt(epMatch[2], 10);
        isMultiEpisode = episodeNumberEnd > episodeNumber;
      }
    }
  }

  // C. Adopt Season from Folder Context if available
  if (seasonNumber === undefined && folderSeasonNumber !== undefined) {
    seasonNumber = folderSeasonNumber;
  }

  // D. Standalone Season: S01, Season 1
  if (seasonNumber === undefined) {
    const sMatch = normText.match(/\bS0*(\d{1,3})\b/i) ||
                   normText.match(/\bSeason\s*0*(\d{1,3})\b/i);
    if (sMatch) {
      seasonNumber = parseInt(sMatch[1], 10);
      if (seasonNumber === 0) isSpecial = true;
    }
  }

  const isEpisode = episodeNumber !== undefined && episodeNumber > 0;

  // A season pack is a season-level archive (.zip, .rar, .7z with S01... and NO episode number)
  // or explicitly labeled "Complete Season" / "Season Pack" (NOT just the word "Pack" from "HubCloud Pack")
  const hasSeasonArchive = (seasonNumber !== undefined && (container === 'ZIP' || container === 'RAR' || container === '7Z'));
  const hasExplicitPackKeyword = /\b(?:Complete\s*Season|Season\s*Pack|Full\s*Season|Series\s*Pack|Season\s*\d+\s*Complete|Batch|All\s*Episodes)\b/i.test(normText);
  // URL pack pattern: only if the URL path specifically has /packs/ or /drive/packs/
  const hasPackUrlPath = url ? /(?:\/(?:drive\/)?packs?(?:\/|$|\?)|[?&](?:type|cat|mode)=packs?)/i.test(url) : false;

  const isPack = !isEpisode && (hasSeasonArchive || hasExplicitPackKeyword || (hasPackUrlPath && !isEpisode));

  let packType: ReleaseDetails['packType'] = 'general';
  let packTypeLabel = 'Media';
  if (isPack) {
    packType = 'season_pack';
    packTypeLabel = 'Season pack';
  } else if (isEpisode) {
    packType = 'individual_episode';
    packTypeLabel = `Individual episode${episodeNumber ? ` (E${String(episodeNumber).padStart(2, '0')})` : ''}`;
  }

  // 3. RESOLUTION DETECTION (Check explicit numeric scanlines first before generic 4K/UHD/FHD/HD/SD)
  let resolution: ReleaseDetails['resolution'] = undefined;
  let resolutionLabel: ReleaseDetails['resolutionLabel'] = undefined;

  if (/\b(?:2160p|2160i)\b/i.test(normText)) {
    resolution = '2160p';
    resolutionLabel = '2160p/4K';
  } else if (/\b(?:1080p|1080i)\b/i.test(normText)) {
    resolution = '1080p';
    resolutionLabel = '1080p';
  } else if (/\b(?:720p|720i)\b/i.test(normText)) {
    resolution = '720p';
    resolutionLabel = '720p';
  } else if (/\b(?:480p|480i)\b/i.test(normText)) {
    resolution = '480p';
    resolutionLabel = '480p';
  } else if (/\b(?:4k|uhd)\b/i.test(normText)) {
    resolution = '2160p';
    resolutionLabel = '2160p/4K';
  } else if (/\bfhd\b/i.test(normText)) {
    resolution = '1080p';
    resolutionLabel = '1080p';
  } else if (/\bhd\b/i.test(normText)) {
    resolution = '720p';
    resolutionLabel = '720p';
  } else if (/\bsd\b/i.test(normText)) {
    resolution = '480p';
    resolutionLabel = '480p';
  }

  // 4. DYNAMIC RANGE (Strict separation: DV vs HDR vs DV HDR vs SDR vs Conflict)
  // Whole token matching to avoid substring accidents (e.g. "DV" in "ADVENTURE", "HDR" in "CHILDREN")
  const hasDV = /\b(?:DV|DOVI|Dolby\s*Vision)\b/i.test(normText);
  const hasHDR = /\b(?:HDR10\+|HDR10|HDR|HLG)\b/i.test(normText);
  const hasSDR = /\bSDR\b/i.test(normText);

  let dynamicRange: ReleaseDetails['dynamicRange'] = undefined;
  let dynamicRangeLabel: ReleaseDetails['dynamicRangeLabel'] = undefined;

  if ((hasDV || hasHDR) && hasSDR) {
    // Conflicting markers present in filename
    dynamicRange = 'conflict';
    dynamicRangeLabel = 'Conflict';
  } else if (hasDV && hasHDR) {
    dynamicRange = 'DV HDR';
    dynamicRangeLabel = 'DV HDR';
  } else if (hasDV) {
    dynamicRange = 'DV';
    dynamicRangeLabel = 'DV';
  } else if (hasHDR) {
    dynamicRange = 'HDR';
    dynamicRangeLabel = 'HDR';
  } else if (hasSDR) {
    dynamicRange = 'SDR';
    dynamicRangeLabel = 'SDR';
  } else {
    // Neither marker appears: DO NOT DEFAULT TO SDR!
    dynamicRange = undefined;
    dynamicRangeLabel = undefined;
  }

  // 5. BIT DEPTH
  let bitDepth: ReleaseDetails['bitDepth'] = undefined;
  if (/\b10\s*bit\b/i.test(normText)) {
    bitDepth = '10bit';
  } else if (/\b8\s*bit\b/i.test(normText)) {
    bitDepth = '8bit';
  } else if (/\b12\s*bit\b/i.test(normText)) {
    bitDepth = '12bit';
  }

  // 6. CODEC
  let codec: ReleaseDetails['codec'] = undefined;
  if (/\b(?:HEVC|H\s*265|x265)\b/i.test(normText)) {
    codec = 'H.265';
  } else if (/\b(?:AVC|H\s*264|x264)\b/i.test(normText)) {
    codec = 'H.264';
  } else if (/\bAV1\b/i.test(normText)) {
    codec = 'AV1';
  } else if (/\bVC\s*1\b/i.test(normText)) {
    codec = 'VC-1';
  }

  // 7. SOURCE
  let source: ReleaseDetails['source'] = undefined;
  if (/\bREMUX\b/i.test(normText)) {
    source = 'REMUX';
  } else if (/\b(?:BluRay|Blu\s*Ray|BDRip|BRRip)\b/i.test(normText)) {
    source = 'BluRay';
  } else if (/\b(?:WEB\s*DL|WEBDL)\b/i.test(normText)) {
    source = 'WEB-DL';
  } else if (/\bWEBRip\b/i.test(normText)) {
    source = 'WEBRip';
  } else if (/\bHDTV\b/i.test(normText)) {
    source = 'HDTV';
  } else if (/\b(?:DVDRip|DVD)\b/i.test(normText)) {
    source = 'DVD';
  }

  // 8. PROVIDER / STREAMING PLATFORM
  let provider: ReleaseDetails['provider'] = undefined;
  if (/\b(?:DSNP|Disney\+?|DisneyPlus)\b/i.test(normText)) {
    provider = 'DSNP';
  } else if (/\b(?:NF|Netflix)\b/i.test(normText)) {
    provider = 'NF';
  } else if (/\bHulu\b/i.test(normText)) {
    provider = 'Hulu';
  } else if (/\b(?:AMZN|Amazon|Prime)\b/i.test(normText)) {
    provider = 'AMZN';
  } else if (/\b(?:Max|HBOMax|HBO)\b/i.test(normText)) {
    provider = 'Max';
  } else if (/\b(?:ATVP|AppleTV\+?)\b/i.test(normText)) {
    provider = 'ATVP';
  } else if (/\bHubCloud\b/i.test(normText)) {
    provider = 'HubCloud';
  } else if (/\bGDFlix\b/i.test(normText)) {
    provider = 'GDFlix';
  } else if (/\bKatDrive\b/i.test(normText)) {
    provider = 'KatDrive';
  }

  // 9. AUDIO & LANGUAGES
  const langs: string[] = [];
  if (/\b(?:Dual\s*Audio|Dual)\b/i.test(normText)) langs.push('Dual Audio');
  else if (/\b(?:Multi\s*Audio|Multi|MULTi)\b/i.test(normText)) langs.push('MULTi');

  if (/\bHindi\b/i.test(normText) && !langs.includes('Dual Audio')) langs.push('Hindi');
  if (/\bEnglish\b/i.test(normText) && !langs.includes('Dual Audio')) langs.push('English');
  if (/\bTamil\b/i.test(normText)) langs.push('Tamil');
  if (/\bTelugu\b/i.test(normText)) langs.push('Telugu');
  if (/\bMalayalam\b/i.test(normText)) langs.push('Malayalam');
  if (/\bKannada\b/i.test(normText)) langs.push('Kannada');

  const audioFormats: string[] = [];
  if (/\bAtmos\b/i.test(normText)) audioFormats.push('Atmos');
  if (/\bTrueHD\b/i.test(normText)) audioFormats.push('TrueHD');
  if (/\bDTS\s*HD(?:\s*MA)?\b/i.test(normText)) audioFormats.push('DTS-HD MA');
  else if (/\bDTS\b/i.test(normText)) audioFormats.push('DTS');

  if (/\bDDP\s*5\s*1\b/i.test(normText)) audioFormats.push('DDP 5.1');
  else if (/\bDD\s*5\s*1\b/i.test(normText)) audioFormats.push('DD 5.1');
  else if (/\bDDP\s*2\s*0\b/i.test(normText)) audioFormats.push('DDP 2.0');
  else if (/\bAAC\s*2\s*0\b/i.test(normText)) audioFormats.push('AAC 2.0');
  else if (/\bAAC\b/i.test(normText) && !audioFormats.some(a => a.includes('AAC'))) audioFormats.push('AAC');

  let audioLanguage: string | undefined = undefined;
  if (langs.length > 0) {
    audioLanguage = langs.join(' + ');
  }
  const audioChannels: string | undefined = audioFormats.length > 0 ? audioFormats.join(' ') : undefined;

  // 10. FILE SIZE
  let fileSize: string | undefined = undefined;
  const sizeMatch = rawInput.match(/\[?\b(\d+(?:\.\d+)?\s*(?:GB|MB|TB))\b\]?/i);
  if (sizeMatch) {
    fileSize = sizeMatch[1].toUpperCase();
  }

  // 11. PART SENSING
  let part: string | undefined = undefined;
  const partMatch = normText.match(/\b(?:Part|Pt)\s*0*(\d+)\b/i);
  if (partMatch) {
    part = `Part-${parseInt(partMatch[1], 10)}`;
  }

  // ==========================================
  // APPLY MANUAL ADMIN OVERRIDES IF PROVIDED
  // ==========================================
  if (overrides) {
    if (overrides.container) {
      const c = overrides.container.toUpperCase();
      if (['ZIP', 'MKV', 'MP4', 'RAR', '7Z', 'AVI'].includes(c)) {
        container = c as any;
        containerLabel = c === 'ZIP' ? 'ZIP archive' : `${c} video file`;
      }
    }
    if (overrides.linkType || overrides.packType) {
      const pt = (overrides.packType || overrides.linkType || '').toLowerCase();
      if (pt === 'zip_pack' || pt === 'season_pack' || pt === 'pack') {
        packType = 'season_pack';
        packTypeLabel = 'Season pack';
      } else if (pt === 'single_episode' || pt === 'individual_episode' || pt === 'episode') {
        packType = 'individual_episode';
        packTypeLabel = 'Individual episode';
      }
    }
    if (overrides.resolution) {
      const r = overrides.resolution.toLowerCase();
      if (r.includes('2160') || r.includes('4k')) {
        resolution = '2160p';
        resolutionLabel = '2160p/4K';
      } else if (r.includes('1080')) {
        resolution = '1080p';
        resolutionLabel = '1080p';
      } else if (r.includes('720')) {
        resolution = '720p';
        resolutionLabel = '720p';
      } else if (r.includes('480')) {
        resolution = '480p';
        resolutionLabel = '480p';
      }
    }
    if (overrides.dynamicRange !== undefined) {
      const dr = overrides.dynamicRange.trim();
      if (/dv/i.test(dr) && /hdr/i.test(dr)) {
        dynamicRange = 'DV HDR';
        dynamicRangeLabel = 'DV HDR';
      } else if (/dv|dovi|dolby\s*vision/i.test(dr)) {
        dynamicRange = 'DV';
        dynamicRangeLabel = 'DV';
      } else if (/hdr/i.test(dr)) {
        dynamicRange = 'HDR';
        dynamicRangeLabel = 'HDR';
      } else if (/sdr/i.test(dr)) {
        dynamicRange = 'SDR';
        dynamicRangeLabel = 'SDR';
      } else if (/conflict/i.test(dr)) {
        dynamicRange = 'conflict';
        dynamicRangeLabel = 'Conflict';
      } else if (/none|unknown/i.test(dr) || dr === '') {
        dynamicRange = undefined;
        dynamicRangeLabel = undefined;
      }
    }
    if (overrides.bitDepth) {
      bitDepth = overrides.bitDepth as any;
    }
    if (overrides.codec) {
      const c = overrides.codec.toUpperCase();
      if (c.includes('265') || c.includes('HEVC')) codec = 'H.265';
      else if (c.includes('264') || c.includes('AVC')) codec = 'H.264';
      else if (c.includes('AV1')) codec = 'AV1';
      else if (c.includes('VC-1')) codec = 'VC-1';
    }
    if (overrides.provider) {
      provider = overrides.provider as any;
    }
    if (overrides.source) {
      source = overrides.source as any;
    }
    if (overrides.audioLanguage) {
      audioLanguage = overrides.audioLanguage;
    }
    if (overrides.fileSize) {
      fileSize = overrides.fileSize;
    }
    if (overrides.seasonNumber !== undefined) {
      seasonNumber = overrides.seasonNumber;
    }
    if (overrides.episodeNumber !== undefined) {
      episodeNumber = overrides.episodeNumber;
    }
  }

  // 12. BUILD BADGES & SUMMARY LINE
  const badges: string[] = [];
  if (resolutionLabel) badges.push(resolutionLabel);
  if (source) badges.push(source);
  if (dynamicRangeLabel) badges.push(dynamicRangeLabel);
  if (bitDepth) badges.push(bitDepth);
  if (codec) badges.push(codec);
  if (containerLabel) badges.push(containerLabel);
  if (packType === 'season_pack') badges.push('Season pack');
  else if (packType === 'individual_episode') badges.push('Individual episode');
  if (provider) badges.push(provider);

  // Build summary line for Telegram and Admin views:
  // e.g. "ZIP archive · Season pack · 2160p · DV HDR · H.265 · Hindi + English DDP 5.1"
  const summaryParts: string[] = [];
  if (containerLabel) summaryParts.push(containerLabel);
  if (packType === 'season_pack') {
    summaryParts.push('Season pack');
  } else if (packType === 'individual_episode') {
    summaryParts.push(episodeNumber ? `Episode ${episodeNumber}` : 'Individual episode');
  }
  if (resolutionLabel) summaryParts.push(resolutionLabel);
  if (dynamicRangeLabel) {
    summaryParts.push(dynamicRangeLabel);
  }
  if (bitDepth) summaryParts.push(bitDepth);
  if (codec) summaryParts.push(codec);
  if (source && source !== 'WEB-DL') summaryParts.push(source);
  if (provider) summaryParts.push(provider);
  const audioLabel = [audioLanguage, audioChannels].filter(Boolean).join(' ') || undefined;

  if (audioLabel) summaryParts.push(audioLabel);

  const summaryLine = summaryParts.join(' · ');

  return {
    rawTitle: rawInput,
    url,
    container,
    containerLabel,
    packType,
    packTypeLabel,
    isPack: packType === 'season_pack',
    isEpisode: packType === 'individual_episode',
    seasonNumber,
    episodeNumber,
    episodeNumberEnd,
    isMultiEpisode,
    isSpecial,
    seriesFolder,
    folderSeasonNumber,
    resolution,
    resolutionLabel,
    dynamicRange,
    dynamicRangeLabel,
    bitDepth,
    codec,
    source,
    provider,
    audioLanguage,
    audioChannels: audioFormats.join(' '),
    audioLabel,
    fileSize,
    part,
    summaryLine,
    badges,
  };
}

/**
 * Formats a release details object for Telegram Admin notification alerts.
 * Matches user's exact specification:
 * e.g. "ZIP archive · Season pack · 2160p · DV HDR · H.265 · Hindi + English DDP 5.1"
 */
export function formatTelegramReleaseSummary(detailsOrTitle: ReleaseDetails | string, url?: string): string {
  const details = typeof detailsOrTitle === 'string'
    ? parseReleaseDetails(detailsOrTitle, url)
    : detailsOrTitle;

  return details.summaryLine;
}
