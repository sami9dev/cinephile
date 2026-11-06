/**
 * HubCloud Release Title Parser & Sanitizer for CineFuel.
 * Parses raw titles, scene filenames, and Telegram captions into structured metadata.
 */

export interface HubCloudParsedResult {
  rawTitle: string;
  cleanMovieTitle: string;
  year: number | null;
  seasonEpisode: string | null;
  isZipPack: boolean;
  extractedSize: string | null;
  resolution: '4K UHD' | '1080p FHD' | '720p HD' | '480p SD' | 'Unknown';
  source: string;
  ott: { code: string; name: string; region: 'Global' | 'India' | 'Specialty' } | null;
  hdr: string[];
  videoCodec: string | null;
  is10Bit: boolean;
  audioCodec: string | null;
  audioChannels: string | null;
  hasAtmos: boolean;
  isLosslessAudio: boolean;
  audioConfiguration: 'Multi Audio' | 'Dual Audio' | 'Single Audio';
  languages: string[];
  isOrgAudio: boolean;
  isLineAudio: boolean;
  hasSubtitles: boolean;
  modifiers: string[];
  releaseGroup: string | null;
  qualityScore: number;
  uiSummaryLabel: string;
}

export const OTT_MAP: Record<string, { code: string; name: string; region: 'Global' | 'India' | 'Specialty'; bonus: number }> = {
  BCORE:   { code: 'BCORE', name: 'Sony Pictures Core', region: 'Global', bonus: 12 },
  ATVP:    { code: 'ATVP',  name: 'Apple TV+', region: 'Global', bonus: 10 },
  APTV:    { code: 'ATVP',  name: 'Apple TV+', region: 'Global', bonus: 10 },
  MA:      { code: 'MA',    name: 'Movies Anywhere', region: 'Global', bonus: 9 },
  IT:      { code: 'iT',    name: 'Apple iTunes', region: 'Global', bonus: 8 },
  AMZN:    { code: 'AMZN',  name: 'Prime Video', region: 'Global', bonus: 8 },
  AMZ:     { code: 'AMZN',  name: 'Prime Video', region: 'Global', bonus: 8 },
  DSNP:    { code: 'DSNP',  name: 'Disney+', region: 'Global', bonus: 8 },
  DNSP:    { code: 'DSNP',  name: 'Disney+', region: 'Global', bonus: 8 },
  NF:      { code: 'NF',    name: 'Netflix', region: 'Global', bonus: 7 },
  NFLX:    { code: 'NF',    name: 'Netflix', region: 'Global', bonus: 7 },
  MAX:     { code: 'MAX',   name: 'Max', region: 'Global', bonus: 7 },
  HMAX:    { code: 'HMAX',  name: 'HBO Max', region: 'Global', bonus: 7 },
  PCOK:    { code: 'PCOK',  name: 'Peacock', region: 'Global', bonus: 5 },
  PMTP:    { code: 'PMTP',  name: 'Paramount+', region: 'Global', bonus: 5 },
  HULU:    { code: 'HULU',  name: 'Hulu', region: 'Global', bonus: 5 },
  // Indian OTTs
  BMS:     { code: 'BMS',   name: 'BookMyShow Stream', region: 'India', bonus: 7 },
  LGP:     { code: 'LGP',   name: 'Lionsgate Play', region: 'India', bonus: 6 },
  JHS:     { code: 'JHS',   name: 'JioHotstar', region: 'India', bonus: 5 },
  HS:      { code: 'JHS',   name: 'JioHotstar', region: 'India', bonus: 5 },
  HTSR:    { code: 'JHS',   name: 'JioHotstar', region: 'India', bonus: 5 },
  SLIV:    { code: 'SLIV',  name: 'SonyLIV', region: 'India', bonus: 5 },
  SONYLIV: { code: 'SLIV',  name: 'SonyLIV', region: 'India', bonus: 5 },
  JC:      { code: 'JC',    name: 'JioCinema', region: 'India', bonus: 4 },
  ZEE5:    { code: 'ZEE5',  name: 'ZEE5', region: 'India', bonus: 4 },
  SNXT:    { code: 'SNXT',  name: 'Sun NXT', region: 'India', bonus: 4 },
  AHA:     { code: 'AHA',   name: 'aha', region: 'India', bonus: 4 },
  HOICHOI: { code: 'HOICHOI', name: 'Hoichoi', region: 'India', bonus: 4 },
  MX:      { code: 'MX',    name: 'MX Player', region: 'India', bonus: 2 },
  // Specialty
  CR:      { code: 'CR',    name: 'Crunchyroll', region: 'Specialty', bonus: 7 },
  MUBI:    { code: 'MUBI',  name: 'MUBI', region: 'Specialty', bonus: 7 },
};

export const LANGUAGE_MAP: Array<{ regex: RegExp; name: string }> = [
  { regex: /\b(HINDI|HIN)\b/i, name: 'Hindi' },
  { regex: /\b(ENGLISH|ENG)\b/i, name: 'English' },
  { regex: /\b(TAMIL|TAM)\b/i, name: 'Tamil' },
  { regex: /\b(TELUGU|TEL)\b/i, name: 'Telugu' },
  { regex: /\b(MALAYALAM|MAL)\b/i, name: 'Malayalam' },
  { regex: /\b(KANNADA|KAN)\b/i, name: 'Kannada' },
  { regex: /\b(BENGALI|BEN)\b/i, name: 'Bengali' },
  { regex: /\b(PUNJABI|PUN)\b/i, name: 'Punjabi' },
  { regex: /\b(MARATHI|MAR)\b/i, name: 'Marathi' },
  { regex: /\b(JAPANESE|JAP|JPN)\b/i, name: 'Japanese' },
  { regex: /\b(KOREAN|KOR)\b/i, name: 'Korean' },
];

/**
 * Authoritative HubCloud and scene title parsing implementation.
 */
export function parseHubCloudTitle(rawInput: string): HubCloudParsedResult {
  let working = (rawInput || '').trim();

  // 1. Detect ZIP / Pack & Strip file extension
  const isZipPack = /\.(zip|rar|7z)(\s*\[.*?\])?$/i.test(working) || /\b(COMPLETE\s*PACK|SEASON\s*PACK|ZIP)\b/i.test(working);
  working = working.replace(/\.(mkv|mp4|avi|zip|rar|7z)\b/gi, '');

  // 2. Extract inline file size if present e.g. [4.5GB] or (950 MB)
  let extractedSize: string | null = null;
  const sizeMatch = working.match(/[\[( -]?(\d+(?:\.\d+)?\s*(?:GB|MB|TB))[\])]?/i);
  if (sizeMatch) {
    extractedSize = sizeMatch[1].toUpperCase().replace(/\s+/, ' ');
    working = working.replace(sizeMatch[0], ' ');
  }

  // 3. Strip leading site watermarks e.g. [Olamovies.mov]- or (UHDMovies)
  working = working.replace(/^(\[[^\]]+\]|\([^)]+\))[\s._-]*/i, '');
  working = working.replace(/\b(Olamovies|UHDMovies|HDHub4u|VegaMovies|KatmovieHD|Pahe)\.[a-z]{2,5}\b/gi, '');

  // 4. ANCHOR SPLIT: Separate Movie Title from Technical Specs
  // Matches first (Year), Season/Episode (S01 / S01E01), or Resolution (2160p/1080p/720p)
  const anchorRegex = /\b((?:19|20)\d{2}|S\d{1,2}(?:E\d{1,3})?|Season\s*\d+|2160p|4K|UHD|1080p|720p|480p)\b/i;
  const anchorMatch = working.match(anchorRegex);

  let cleanMovieTitle = working;
  let specsPart = working;

  if (anchorMatch && anchorMatch.index !== undefined && anchorMatch.index > 0) {
    cleanMovieTitle = working
      .slice(0, anchorMatch.index)
      .replace(/[._(\[-]+$/g, '')
      .replace(/[._]+/g, ' ')
      .replace(/^[\s•\-\*\>▶►⚡🌟🎬🔥\?\.\|\[\]\(\)]+/, '')
      .replace(/[\s•\-\*\>▶►⚡🌟🎬🔥\?\.\|\[\]\(\)]+$/, '')
      .trim();
    specsPart = working.slice(anchorMatch.index);
  } else {
    cleanMovieTitle = cleanMovieTitle
      .replace(/^[\s•\-\*\>▶►⚡🌟🎬🔥\?\.\|\[\]\(\)]+/, '')
      .replace(/[\s•\-\*\>▶►⚡🌟🎬🔥\?\.\|\[\]\(\)]+$/, '')
      .trim();
  }

  // 5. Extract Year and Season/Episode from the anchor region
  const yearMatch = specsPart.match(/\b((?:19|20)\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  const seMatch = specsPart.match(/\b(S\d{1,2}(?:E\d{1,3}(?:-?E?\d{1,3})?)?|Season\s*\d+(?:\s*Complete)?)\b/i);
  const seasonEpisode = seMatch ? seMatch[1].toUpperCase() : null;

  // Normalize specsPart tokens for safe word-boundary scanning
  const cleanSpecs = specsPart.replace(/[._\-()[\]+]+/g, ' ');
  const upperTokens = cleanSpecs.split(/\s+/).filter(Boolean).map(t => t.toUpperCase());

  let score = 0;

  // 6. Resolution
  let resolution: HubCloudParsedResult['resolution'] = 'Unknown';
  if (/\b(2160P|4K|UHD)\b/i.test(cleanSpecs)) { resolution = '4K UHD'; score += 45; }
  else if (/\b(1080P|FHD)\b/i.test(cleanSpecs)) { resolution = '1080p FHD'; score += 30; }
  else if (/\b(720P)\b/i.test(cleanSpecs)) { resolution = '720p HD'; score += 15; }
  else if (/\b(480P|576P)\b/i.test(cleanSpecs)) { resolution = '480p SD'; score += 5; }

  // 7. Source Type
  let source = 'WEB';
  if (/\b(REMUX)\b/i.test(cleanSpecs)) { source = 'BluRay REMUX'; score += 100; }
  else if (/\b(COMPLETE\s*BLURAY|BDMV|BDISO)\b/i.test(cleanSpecs)) { source = 'COMPLETE BluRay'; score += 100; }
  else if (/\b(WEB\s*DL|WEBDL)\b/i.test(cleanSpecs)) { source = 'WEB-DL'; score += 88; }
  else if (/\b(BLURAY|BDRIP)\b/i.test(cleanSpecs)) { source = 'BluRay'; score += 85; }
  else if (/\b(WEBRIP)\b/i.test(cleanSpecs)) { source = 'WEBRip'; score += 74; }
  else if (/\b(BRRIP)\b/i.test(cleanSpecs)) { source = 'BRRip'; score += 68; }
  else if (/\b(HQ\s*HDTC|HDTC)\b/i.test(cleanSpecs)) { source = 'HQ-HDTC'; score += 30; }
  else if (/\b(HDTS|TELESYNC)\b/i.test(cleanSpecs)) { source = 'HDTS'; score += 20; }
  else if (/\b(HDCAM|CAMRIP|CAM)\b/i.test(cleanSpecs)) { source = 'CAM'; score += 10; }

  // 8. OTT Platform Detection (Only scanned inside specsPart!)
  let ott: HubCloudParsedResult['ott'] = null;
  for (const token of upperTokens) {
    if (OTT_MAP[token]) {
      const matched = OTT_MAP[token];
      ott = { code: matched.code, name: matched.name, region: matched.region };
      score += matched.bonus;
      break;
    }
  }

  // 9. HDR Profiles
  const hdr: string[] = [];
  if (/\b(DV|DOVI|DOLBY\s*VISION)\b/i.test(cleanSpecs)) { hdr.push('Dolby Vision'); score += 8; }
  if (/\b(HDR10\+|HDR10PLUS)\b/i.test(specsPart)) { hdr.push('HDR10+'); score += 6; }
  else if (/\b(HDR10|HDR)\b/i.test(cleanSpecs)) { hdr.push('HDR10'); score += 5; }
  if (hdr.length === 0 && /\b(SDR)\b/i.test(cleanSpecs)) { hdr.push('SDR'); }

  // 10. Video Codec & 10-Bit
  let videoCodec: string | null = null;
  if (/\b(H\s*265|HEVC)\b/i.test(cleanSpecs)) videoCodec = 'HEVC';
  else if (/\b(X265)\b/i.test(cleanSpecs)) videoCodec = 'x265';
  else if (/\b(AV1)\b/i.test(cleanSpecs)) videoCodec = 'AV1';
  else if (/\b(H\s*264|AVC)\b/i.test(cleanSpecs)) videoCodec = 'H.264';
  else if (/\b(X264)\b/i.test(cleanSpecs)) videoCodec = 'x264';

  const is10Bit = /\b(10BIT|HI10P)\b/i.test(cleanSpecs);
  if (is10Bit) score += 4;

  // 11. Audio Codec, Channels & Atmos
  let audioCodec: string | null = null;
  let isLosslessAudio = false;
  if (/\b(TRUEHD)\b/i.test(cleanSpecs)) { audioCodec = 'TrueHD'; isLosslessAudio = true; score += 15; }
  else if (/\b(DTS\s*X)\b/i.test(cleanSpecs)) { audioCodec = 'DTS:X'; isLosslessAudio = true; score += 15; }
  else if (/\b(DTS\s*HD\s*MA|DTS\s*HD)\b/i.test(cleanSpecs)) { audioCodec = 'DTS-HD MA'; isLosslessAudio = true; score += 12; }
  else if (/\b(FLAC|LPCM)\b/i.test(cleanSpecs)) { audioCodec = 'FLAC'; isLosslessAudio = true; score += 10; }
  else if (/\b(DDP|EAC3|DD\+)\b/i.test(specsPart)) { audioCodec = 'DDP'; score += 6; }
  else if (/\b(DD|AC3)\b/i.test(cleanSpecs)) { audioCodec = 'DD'; score += 4; }
  else if (/\b(AAC)\b/i.test(cleanSpecs)) { audioCodec = 'AAC'; score += 2; }

  const hasAtmos = /\b(ATMOS)\b/i.test(cleanSpecs);
  if (hasAtmos) score += 6;

  const chMatch = specsPart.match(/\b(7\.1|5\.1|2\.0)\b/);
  const audioChannels = chMatch ? chMatch[1] : null;

  // 12. Languages & Multi/Dual Audio Detection
  const languages: string[] = [];
  for (const lang of LANGUAGE_MAP) {
    if (lang.regex.test(cleanSpecs)) {
      languages.push(lang.name);
    }
  }

  let audioConfiguration: HubCloudParsedResult['audioConfiguration'] = 'Single Audio';
  if (/\b(MULTI\s*AUDIO|MULTI)\b/i.test(cleanSpecs) || languages.length >= 3) {
    audioConfiguration = 'Multi Audio';
  } else if (/\b(DUAL\s*AUDIO|DUAL)\b/i.test(cleanSpecs) || languages.length === 2) {
    audioConfiguration = 'Dual Audio';
  }

  const isOrgAudio = /\b(ORG|ORIGINAL)\b/i.test(cleanSpecs);
  const isLineAudio = /\b(LINE)\b/i.test(cleanSpecs);
  const hasSubtitles = /\b(ESUBS?|MSUBS?|SUBS?)\b/i.test(cleanSpecs);

  // 13. Special Modifiers
  const modifiers: string[] = [];
  if (/\b(IMAX)\b/i.test(cleanSpecs)) { modifiers.push('IMAX'); score += 5; }
  if (/\b(HYBRID)\b/i.test(cleanSpecs)) { modifiers.push('HYBRID'); score += 6; }
  if (/\b(DS4K)\b/i.test(cleanSpecs)) { modifiers.push('DS4K'); score += 5; }
  if (/\b(RM4K)\b/i.test(cleanSpecs)) { modifiers.push('RM4K'); score += 4; }
  if (/\b(EXTENDED|UNCUT)\b/i.test(cleanSpecs)) { modifiers.push('EXTENDED'); }
  if (/\b(CBR)\b/i.test(cleanSpecs)) { modifiers.push('CBR'); score += 2; }

  // 14. Extract Release Group (e.g. -Spidey, -Telly)
  const groupMatch = working.match(/-([A-Za-z0-9_]+)$/);
  const releaseGroup = groupMatch ? groupMatch[1] : null;

  // 15. Build Clean UI Summary Label for the Download Button
  const summaryParts = [
    resolution !== 'Unknown' ? resolution : null,
    ott ? `${ott.name} (${ott.code})` : null,
    source,
    is10Bit ? '10bit' : null,
    videoCodec,
    hdr.length ? hdr.join(' • ') : null,
    audioCodec ? `${audioCodec}${audioChannels ? ' ' + audioChannels : ''}${hasAtmos ? ' Atmos' : ''}` : null,
    audioConfiguration !== 'Single Audio' ? audioConfiguration : languages[0] || null,
  ].filter(Boolean);

  return {
    rawTitle: rawInput,
    cleanMovieTitle,
    year,
    seasonEpisode,
    isZipPack,
    extractedSize,
    resolution,
    source,
    ott,
    hdr,
    videoCodec,
    is10Bit,
    audioCodec,
    audioChannels,
    hasAtmos,
    isLosslessAudio,
    audioConfiguration,
    languages,
    isOrgAudio,
    isLineAudio,
    hasSubtitles,
    modifiers,
    releaseGroup,
    qualityScore: score,
    uiSummaryLabel: summaryParts.join(' | '),
  };
}

/**
 * Format bytes into standard MB / GB string
 */
export function formatBytesAuthoritative(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Stage 1: Sanitize Telegram Captions & Strip Promotional Spam.
 * Extracts IMDb/TMDB IDs and clean text lines.
 */
export function cleanTelegramText(rawText: string): {
  cleanLines: string[];
  cleanText: string;
  imdbId: string | null;
  tmdbId: string | null;
  extractedUrls: string[];
} {
  const text = (rawText || '').trim();

  // Extract IMDb ID (e.g. tt15398776)
  const imdbMatch = text.match(/(?:imdb\.com\/title\/|imdb:?\s*)(tt\d{7,10})/i);
  const imdbId = imdbMatch ? imdbMatch[1].toLowerCase() : null;

  // Extract TMDB ID (e.g. themoviedb.org/movie/872585 or /tv/60625)
  const tmdbMatch = text.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/i);
  const tmdbId = tmdbMatch ? tmdbMatch[1] : null;

  // Extract all download / streaming URLs (excluding IMDb, TMDB metadata links and Telegram invite links)
  const urlRegex = /(https?:\/\/[^\s<>'"`]+)/gi;
  const extractedUrls: string[] = [];
  let uMatch: RegExpExecArray | null;
  while ((uMatch = urlRegex.exec(text)) !== null) {
    const u = uMatch[1].trim();
    if (!/imdb\.com|themoviedb\.org|tmdb\.org|(?:t|telegram)\.me/i.test(u)) {
      extractedUrls.push(u);
    }
  }

  // Promo line exclusion keywords
  const promoKeywords = [
    /\bjoin\b/i,
    /\bchannel\b/i,
    /\bbackup\b/i,
    /\buploaded\s*by\b/i,
    /\bdownload\s*links?\b/i,
    /\bhow\s*to\s*download\b/i,
    /\bdirect\s*download\b/i,
    /\bshared\s*by\b/i,
    /\bpowered\s*by\b/i,
    /\bfollow\s*us\b/i,
    /\bsubscribe\b/i,
    /\btelegram\s*channel\b/i,
  ];

  const lines = text.split(/\r?\n/);
  const cleanLines: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Check if line is promo spam
    const isPromo = promoKeywords.some((p) => p.test(line));
    if (isPromo) continue;

    // Strip @handles e.g. @MyChannel or @cinflue
    line = line.replace(/@[A-Za-z0-9_]+/g, ' ');

    // Strip t.me / telegram.me invite links
    line = line.replace(/https?:\/\/(?:t|telegram)\.me\/[^\s]+/gi, ' ');
    line = line.replace(/(?:t|telegram)\.me\/[^\s]+/gi, ' ');

    // Strip zero-width spaces & control characters
    line = line.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // Strip markdown formatting symbols (**, __, ~~, `, #)
    line = line.replace(/(\*\*|__|\~\~|`+|#+)/g, '');

    // Strip leading decorative emojis / bullet symbols e.g. ⚡, 🌟, 🎬, •, ▶
    line = line.replace(/^[\s•\-\*\>▶►⚡🌟🎬🔥]+/, '').trim();

    if (line.length > 0) {
      cleanLines.push(line);
    }
  }

  return {
    cleanLines,
    cleanText: cleanLines.join('\n'),
    imdbId,
    tmdbId,
    extractedUrls,
  };
}

/**
 * Stage 2: Solve Telegram's 64-Character Filename Truncation Bug.
 * Compares document.file_name with caption, selects the non-truncated release string,
 * and attaches authoritative formatted byte size.
 */
export function resolveTruncatedTelegramDocument(
  doc: { file_name?: string; file_size?: number },
  caption?: string
): { authoritativeReleaseString: string; authoritativeSize: string | null } {
  const fileName = (doc?.file_name || '').trim();
  const rawCaption = (caption || '').trim();
  const authoritativeSize = doc?.file_size ? formatBytesAuthoritative(doc.file_size) : null;

  if (!rawCaption) {
    return {
      authoritativeReleaseString: fileName,
      authoritativeSize,
    };
  }

  // Get sanitized caption lines
  const { cleanLines } = cleanTelegramText(rawCaption);
  const firstCaptionLine = cleanLines[0] || '';

  // Technical tokens counter
  const technicalRegex = /\b(WEB-DL|WEBRIP|BLURAY|REMUX|BDRIP|BRRIP|HDTC|2160P|4K|1080P|720P|480P|X265|X264|H\.265|H\.264|HEVC|AVC|ATMOS|TRUEHD|DTS|DDP|AAC|10BIT|HDR|DV|DOVI)\b/gi;
  const fileNameTokens = (fileName.match(technicalRegex) || []).length;
  const captionTokens = (firstCaptionLine.match(technicalRegex) || []).length;

  // If caption is longer AND contains equal or more technical details, use caption
  let chosen = fileName;
  if (firstCaptionLine.length > fileName.length && captionTokens >= fileNameTokens) {
    chosen = firstCaptionLine;
  } else if (fileName.length >= 60 && firstCaptionLine.length > 30 && captionTokens > fileNameTokens) {
    chosen = firstCaptionLine;
  }

  return {
    authoritativeReleaseString: chosen,
    authoritativeSize,
  };
}

/**
 * Stage 3: Auto-Fetch Metadata for Bare HubCloud URLs.
 * Extracts full filename from <title> or .card-header and file size from DOM.
 */
export async function fetchHubCloudPageMetadata(
  url: string,
  timeoutMs: number = 7000
): Promise<{ filename: string | null; fileSize: string | null; pageTitle: string | null }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { filename: null, fileSize: null, pageTitle: null };
    }

    const html = await res.text();

    // 1. Title tag extraction
    let filename: string | null = null;
    let pageTitle: string | null = null;
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      pageTitle = titleMatch[1].trim();
      filename = pageTitle
        .replace(/\s*[-–—|]\s*(?:HubCloud|HubDrive|GDFlix|KatDrive|Gofile|FastDL|Direct).*$/i, '')
        .trim();
    }

    // 2. Card header fallback
    if (!filename || filename.length < 5) {
      const headerMatch = html.match(
        /<(?:h\d|div|span)[^>]*class="[^"]*(?:card-header|header|title|filename)[^"]*"[^>]*>([\s\S]*?)<\/(?:h\d|div|span)>/i
      );
      if (headerMatch) {
        const rawH = headerMatch[1].replace(/<[^>]+>/g, '').trim();
        if (rawH.length >= 5) filename = rawH;
      }
    }

    // 3. Size extraction from DOM e.g. Size: 4.8 GB or (1.2 GB) or inside a badge
    let fileSize: string | null = null;
    const sizeMatch = html.match(/(?:Size|File Size)[:\s]*([0-9.]+\s*(?:GB|MB|TB))/i) ||
                      html.match(/\b([0-9.]+\s*(?:GB|MB|TB))\b/i);
    if (sizeMatch) {
      fileSize = sizeMatch[1].toUpperCase().replace(/\s+/, ' ');
    }

    return {
      filename,
      fileSize,
      pageTitle,
    };
  } catch (err: any) {
    return { filename: null, fileSize: null, pageTitle: null };
  }
}

/**
 * Determine authoritative top-level Card Badge for the movie poster based on highest-scoring release.
 */
export function computeCardBadge(parsed: HubCloudParsedResult): string {
  const parts: string[] = [];

  // Resolution
  if (parsed.resolution !== 'Unknown') {
    parts.push(parsed.resolution);
  }

  // HDR / Dolby Vision
  if (parsed.hdr.includes('Dolby Vision')) {
    parts.push('Dolby Vision');
  } else if (parsed.hdr.includes('HDR10+')) {
    parts.push('HDR10+');
  } else if (parsed.hdr.includes('HDR10')) {
    parts.push('HDR');
  }

  // OTT Platform or Source
  if (parsed.ott) {
    parts.push(parsed.ott.code);
  } else if (parsed.source) {
    parts.push(parsed.source);
  }

  return parts.length > 0 ? parts.join(' • ') : 'HD';
}
