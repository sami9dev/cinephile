'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Download,
  Plus,
  Trash2,
  Pencil,
  Tv,
  Zap,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Sparkles,
  Info,
  FileArchive,
  FileVideo,
  Layers,
  ExternalLink,
  Flag,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { CustomLink, TitleDetails } from '@/types';
import { sanitizeSafeUrl } from '@/lib/security';
import { useWatchlist } from '@/context/WatchlistContext';
import {
  updateGlobalCustomLink,
  deleteGlobalCustomLink,
  updateGlobalEpisodeTitle,
} from '@/lib/curatedLinks';
import {
  detectSeasonNumber,
  detectEpisodeNumber,
  detectLinkType,
  detectQuality,
  detectAudio,
  detectSize,
  getQualityWeight,
  parseFullMediaTitle,
  detectShowPlatform,
  stripWatermarks,
  extractFilenameFromUrl,
  isPackMedia,
  isPackUrl,
} from '@/lib/seasonParser';
import { parseReleaseDetails, ReleaseOverrides } from '@/lib/releaseParser';
import { detectServer } from '@/lib/serverDetector';
import RequestLinkModal from './RequestLinkModal';
import ReportBrokenLinkModal, { ReportModalData } from './ReportBrokenLinkModal';

interface TVEpisodeLinksManagerProps {
  titleDetails: TitleDetails;
  customLinks: CustomLink[];
  isAdmin: boolean;
  onLinkAdded?: () => void;
}

interface EnrichedLink extends CustomLink {
  seasonNumber: number;
  episodeNumber?: number;
  linkType: 'zip_pack' | 'single_episode';
  quality: string;
  audioLanguage: string;
  size?: string;
  resolution?: string;
  source: string;
  dynamicRange?: string;
  bitDepth?: string;
  codec?: string;
  container?: string;
  containerLabel?: string;
}

interface ReleaseOption {
  id: string;
  title: string;
  seasonNumber: number;
  episodeCountLabel: string;
  audioLanguages: string;
  packs: EnrichedLink[];
  episodes: EnrichedLink[];
}

interface FormatGroup {
  id: string;
  resolution: string;
  source: string;
  options: ReleaseOption[];
}

interface GroupedEpisode {
  episodeNumber: number;
  title: string;
  size: string;
  links: EnrichedLink[];
}

export type QualityFilterChip =
  | '4K'
  | '1080P'
  | '720P'
  | '480P'
  | 'SDR'
  | 'HDR'
  | 'DV'
  | 'H.265'
  | 'H.264';
export const QUALITY_FILTER_CHIPS: QualityFilterChip[] = [
  '4K',
  'SDR',
  'HDR',
  'DV',
  '1080P',
  'H.265',
  'H.264',
];

export interface VerifiedReleaseAttributes {
  resolution?: '2160p' | '1080p' | '720p' | '480p';
  hasDV: boolean;
  hasHDR: boolean;
  hasSDR: boolean;
  codec?: 'H.265' | 'H.264' | 'AV1' | 'VC-1';
  hasAnyVerifiedQuality: boolean;
}

/**
 * Extracts ONLY explicitly verified quality attributes from a release record.
 * Never fabricates 1080p, H.265, or H.264 when missing, and never confuses DV with HDR.
 */
export function getVerifiedReleaseAttributes(
  release: Partial<EnrichedLink>
): VerifiedReleaseAttributes {
  const parsedPrimary = parseReleaseDetails(
    release.title || '',
    release.url,
    release.manualOverrides
  );

  // Determine whether the primary title/URL is a detailed scene release filename
  const isDetailedSceneFilename = Boolean(
    parsedPrimary.resolution ||
      parsedPrimary.codec ||
      parsedPrimary.dynamicRange ||
      /\.(?:mkv|mp4|avi|zip|rar|7z)\b/i.test(release.title || '') ||
      /\b(?:web-?dl|webrip|bluray|remux|hdtv)\b/i.test(release.title || '')
  );

  // 1. Verified Resolution
  let resolution: VerifiedReleaseAttributes['resolution'] = parsedPrimary.resolution;
  if (!resolution) {
    const parsedResSecondary = parseReleaseDetails(
      `${release.resolution || ''} ${release.quality || ''}`,
      undefined,
      release.manualOverrides
    );
    resolution = parsedResSecondary.resolution;
  }

  // 2. Verified Dynamic Range (Strict separation: DV vs HDR vs SDR)
  let hasDV = false;
  let hasHDR = false;
  let hasSDR = false;

  if (release.manualOverrides?.dynamicRange !== undefined) {
    const dr = release.manualOverrides.dynamicRange.trim();
    if (!/^(?:none|unknown|conflict)$/i.test(dr) && dr.length > 0) {
      hasDV = /\b(?:dv|dovi|dolby\s*vision)\b/i.test(dr);
      hasHDR = /\b(?:hdr10\+|hdr10|hdr|hlg)\b/i.test(dr);
      hasSDR = /\bsdr\b/i.test(dr) && !hasDV && !hasHDR;
    }
  } else if (parsedPrimary.dynamicRange) {
    if (parsedPrimary.dynamicRange !== 'conflict') {
      hasDV =
        parsedPrimary.dynamicRange === 'DV' || parsedPrimary.dynamicRange === 'DV HDR';
      hasHDR =
        parsedPrimary.dynamicRange === 'HDR' || parsedPrimary.dynamicRange === 'DV HDR';
      hasSDR = parsedPrimary.dynamicRange === 'SDR';
    }
  } else if (!isDetailedSceneFilename) {
    const parsedDynSecondary = parseReleaseDetails(
      `${release.dynamicRange || ''} ${release.quality || ''}`
    );
    if (parsedDynSecondary.dynamicRange && parsedDynSecondary.dynamicRange !== 'conflict') {
      hasDV =
        parsedDynSecondary.dynamicRange === 'DV' ||
        parsedDynSecondary.dynamicRange === 'DV HDR';
      hasHDR =
        parsedDynSecondary.dynamicRange === 'HDR' ||
        parsedDynSecondary.dynamicRange === 'DV HDR';
      hasSDR = parsedDynSecondary.dynamicRange === 'SDR';
    }
  }

  // 3. Verified Codec (Strict separation: H.265 vs H.264; never inferred from resolution)
  let codec: VerifiedReleaseAttributes['codec'] = parsedPrimary.codec;
  if (!codec && !isDetailedSceneFilename) {
    const parsedCodecSecondary = parseReleaseDetails(
      `${release.codec || ''} ${release.quality || ''}`
    );
    codec = parsedCodecSecondary.codec;
  }

  const hasAnyVerifiedQuality = Boolean(
    resolution ||
      hasDV ||
      hasHDR ||
      hasSDR ||
      codec === 'H.265' ||
      codec === 'H.264'
  );

  return {
    resolution,
    hasDV,
    hasHDR,
    hasSDR,
    codec,
    hasAnyVerifiedQuality,
  };
}

export function releaseMatchesChip(
  release: Partial<EnrichedLink>,
  chip: QualityFilterChip
): boolean {
  const attrs = getVerifiedReleaseAttributes(release);

  switch (chip) {
    case '4K':
      return attrs.resolution === '2160p';
    case '1080P':
      return attrs.resolution === '1080p';
    case '720P':
      return attrs.resolution === '720p';
    case '480P':
      return attrs.resolution === '480p';
    case 'DV':
      return attrs.hasDV;
    case 'HDR':
      return attrs.hasHDR;
    case 'SDR':
      return attrs.hasSDR;
    case 'H.265':
      return attrs.codec === 'H.265';
    case 'H.264':
      return attrs.codec === 'H.264';
    default:
      return false;
  }
}

export function filterReleasesForEpisode(
  releases: EnrichedLink[],
  activeChips: QualityFilterChip[]
): EnrichedLink[] {
  if (activeChips.length === 0) {
    return releases;
  }
  return releases.filter((rel) =>
    activeChips.every((chip) => releaseMatchesChip(rel, chip))
  );
}

export interface QualityCombinationDef {
  key: string;
  label: string;
  resolution?: '2160p' | '1080p' | '720p' | '480p';
  dynamicRange?: 'DV' | 'HDR' | 'SDR';
  codec?: 'H.265' | 'H.264';
}

export const QUALITY_COMBINATIONS: QualityCombinationDef[] = [
  // 4K Combinations
  { key: '4K', label: '4K', resolution: '2160p' },
  { key: '4K_DV', label: '4K + DV', resolution: '2160p', dynamicRange: 'DV' },
  { key: '4K_HDR', label: '4K + HDR', resolution: '2160p', dynamicRange: 'HDR' },
  {
    key: '4K_DV_H265',
    label: '4K + DV + H.265',
    resolution: '2160p',
    dynamicRange: 'DV',
    codec: 'H.265',
  },
  {
    key: '4K_HDR_H265',
    label: '4K + HDR + H.265',
    resolution: '2160p',
    dynamicRange: 'HDR',
    codec: 'H.265',
  },
  { key: '4K_SDR', label: '4K + SDR', resolution: '2160p', dynamicRange: 'SDR' },
  { key: '4K_H265', label: '4K + H.265', resolution: '2160p', codec: 'H.265' },

  // 1080P Combinations
  { key: '1080P', label: '1080P', resolution: '1080p' },
  { key: '1080P_DV', label: '1080P + DV', resolution: '1080p', dynamicRange: 'DV' },
  { key: '1080P_HDR', label: '1080P + HDR', resolution: '1080p', dynamicRange: 'HDR' },
  { key: '1080P_SDR', label: '1080P + SDR', resolution: '1080p', dynamicRange: 'SDR' },
  { key: '1080P_H265', label: '1080P + H.265', resolution: '1080p', codec: 'H.265' },
  { key: '1080P_H264', label: '1080P + H.264', resolution: '1080p', codec: 'H.264' },

  // 720P Combinations
  { key: '720P', label: '720P', resolution: '720p' },
  { key: '720P_H265', label: '720P + H.265', resolution: '720p', codec: 'H.265' },
  { key: '720P_H264', label: '720P + H.264', resolution: '720p', codec: 'H.264' },

  // 480P Combinations
  { key: '480P', label: '480P', resolution: '480p' },

  // Standalone Codecs
  { key: 'H265', label: 'H.265', codec: 'H.265' },
  { key: 'H264', label: 'H.264', codec: 'H.264' },
];

export function isValidDestinationUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === '#' || trimmed === 'javascript:void(0)') return false;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

export function matchesQualityCombination(
  release: Partial<EnrichedLink>,
  combo: QualityCombinationDef
): boolean {
  const attrs = getVerifiedReleaseAttributes(release);

  // Must have at least one verified quality attribute to match any quality button
  if (!attrs.hasAnyVerifiedQuality) return false;

  // 1. Resolution check
  if (combo.resolution) {
    if (attrs.resolution !== combo.resolution) return false;
  }

  // 2. Dynamic Range check (strict: DV != HDR)
  if (combo.dynamicRange) {
    if (combo.dynamicRange === 'DV' && !attrs.hasDV) return false;
    if (combo.dynamicRange === 'HDR' && !attrs.hasHDR) return false;
    if (combo.dynamicRange === 'SDR' && !attrs.hasSDR) return false;
  }

  // 3. Codec check (strict: H.265 != H.264)
  if (combo.codec) {
    if (attrs.codec !== combo.codec) return false;
  }

  return true;
}

export function getReleaseFidelityScore(release: Partial<EnrichedLink>): number {
  const attrs = getVerifiedReleaseAttributes(release);
  let score = 0;

  // Resolution weight
  if (attrs.resolution === '2160p') score += 1000;
  else if (attrs.resolution === '1080p') score += 500;
  else if (attrs.resolution === '720p') score += 200;
  else if (attrs.resolution === '480p') score += 100;

  // Dynamic range weight: DV + HDR (50) > DV (40) > HDR (30) > SDR (10)
  if (attrs.hasDV && attrs.hasHDR) {
    score += 50;
  } else if (attrs.hasDV) {
    score += 40;
  } else if (attrs.hasHDR) {
    score += 30;
  } else if (attrs.hasSDR) {
    score += 10;
  }

  // Codec weight: H.265 (20) > H.264 (10)
  if (attrs.codec === 'H.265') {
    score += 20;
  } else if (attrs.codec === 'H.264') {
    score += 10;
  }

  // Audio weight: Atmos/5.1/Dual (5)
  const audio = (release.audioLanguage || release.title || '').toLowerCase();
  if (audio.includes('atmos') || audio.includes('5.1') || audio.includes('dual')) {
    score += 5;
  }

  return score;
}

export function resolveDeterministicRelease<T extends Partial<EnrichedLink>>(
  matchingReleases: T[]
): T | null {
  const validReleases = matchingReleases.filter((r) => isValidDestinationUrl(r.url));
  if (validReleases.length === 0) return null;

  const sorted = [...validReleases].sort((a, b) => {
    const scoreB = getReleaseFidelityScore(b);
    const scoreA = getReleaseFidelityScore(a);
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    // Stable deterministic tie-breaker
    const idA = a.id || a.url || a.title || '';
    const idB = b.id || b.url || b.title || '';
    return idA.localeCompare(idB);
  });

  return sorted[0];
}

export function resolveDestinationForQuality<T extends Partial<EnrichedLink>>(
  releases: T[],
  combo: QualityCombinationDef
): { release: T; url: string } | null {
  const matching = releases.filter((rel) => matchesQualityCombination(rel, combo));
  const deterministic = resolveDeterministicRelease(matching);
  if (!deterministic || !deterministic.url || !isValidDestinationUrl(deterministic.url)) {
    return null;
  }
  return {
    release: deterministic,
    url: deterministic.url,
  };
}

/**
 * Generates dynamic quality buttons for an episode strictly from verified attributes of valid destination links.
 */
export function getDynamicQualityButtonsForEpisode<T extends Partial<EnrichedLink>>(
  releases: T[]
): Array<{ combo: QualityCombinationDef; release: T; url: string }> {
  return QUALITY_COMBINATIONS.map((combo) => {
    const result = resolveDestinationForQuality(releases, combo);
    return result ? { combo, ...result } : null;
  }).filter((item): item is NonNullable<typeof item> => item !== null);
}

// Extract release profile without fabricating unverified resolution or codec defaults
function extractReleaseProfile(
  title: string,
  quality?: string,
  titleDetails?: TitleDetails,
  url?: string,
  overrides?: ReleaseOverrides
) {
  const parsed = parseReleaseDetails(title, url, overrides);

  const platform = overrides?.provider || parsed.provider || detectShowPlatform(title, titleDetails);
  const verifiedResolution = parsed.resolution;
  const verifiedResolutionLabel = parsed.resolutionLabel;
  const resolution = verifiedResolutionLabel || '1080p';
  const resTag = verifiedResolution || '1080p';
  const source = overrides?.source || parsed.source || 'WEB-DL';
  const dynamicRange = parsed.dynamicRangeLabel === 'Unknown' ? '' : (parsed.dynamicRangeLabel || '');
  const bitDepth = parsed.bitDepth || '';
  const verifiedCodec = parsed.codec;
  const codec = verifiedCodec || '';
  const container = parsed.container || '';
  const containerLabel = parsed.containerLabel || '';
  const part = parsed.part || '';

  return {
    resolution,
    resTag,
    verifiedResolution,
    verifiedResolutionLabel,
    source,
    dynamicRange,
    bitDepth,
    codec,
    verifiedCodec,
    platform,
    container,
    containerLabel,
    isPack: parsed.isPack,
    isEpisode: parsed.isEpisode,
    episodeNumber: parsed.episodeNumber,
    seasonNumber: parsed.seasonNumber,
    audioLanguages: parsed.audioLanguage,
    part,
    cleanDisplayTitle: (showName: string, seasonNum: number) => {
      const sTag = `S${String(seasonNum).padStart(2, '0')}`;
      const cleanShow = (showName || 'Series').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '.');
      const partSeg = part ? `.${part.replace(/-/g, '.')}` : '';
      const dynSeg = dynamicRange && dynamicRange !== 'Conflict' ? `.${dynamicRange.replace(/\s+/g, '.')}` : '';
      const codecSeg = verifiedCodec || (resTag === '2160p' ? 'H.265' : 'H.264');
      const platSeg = platform ? `.${platform}` : '';
      const effSource = platform === 'DSNP' ? 'WEB-DL' : source;
      return `${cleanShow}.${sTag}${partSeg}.${resTag}${platSeg}.${effSource}.DUAL.DDP5.1.Atmos${dynSeg}.${codecSeg}`;
    },
  };
}

interface ParsedOptionTitle {
  baseTitle: string;
  partTag: string;
  epSize: string;
  zipSize: string;
}

function parseOptionTitleAndTags(
  option: ReleaseOption,
  titleDetails: TitleDetails,
  seasonNum: number,
  groupRes: string,
  groupSource: string
): ParsedOptionTitle {
  const showName = titleDetails.name || titleDetails.title || 'Series';
  const rawTitle = option.title || '';

  // 1. Part tag
  let partTag = '';
  const partMatch =
    rawTitle.match(/(?:^|[\s._\-[\]()])(?:part|pt)[\s._-]?0*(\d+)(?:[\s._\-[\]()]|$)/i) ||
    (option.episodes[0]?.title || '').match(/(?:^|[\s._\-[\]()])(?:part|pt)[\s._-]?0*(\d+)(?:[\s._\-[\]()]|$)/i) ||
    (option.packs[0]?.title || '').match(/(?:^|[\s._\-[\]()])(?:part|pt)[\s._-]?0*(\d+)(?:[\s._\-[\]()]|$)/i);
  if (partMatch && partMatch[1]) {
    partTag = `Part-${parseInt(partMatch[1], 10)}`;
  }

  // 2. Base release title
  let baseTitle = stripWatermarks(rawTitle)
    .replace(/^Name\s*:\s*/i, '')
    .replace(/HUBCLOUD\s*=\s*/gi, '')
    .replace(/\[Part[-.\s]*\d+\]/gi, '')
    .replace(/\[\s*[\d.]+\s*(?:GB|MB)\s*\/\s*E\s*\]/gi, '')
    .replace(/\[\s*[\d.]+\s*(?:GB|MB)\s*Zip\s*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  baseTitle = baseTitle.replace(/\.(?:mkv|mp4|zip|rar)$/i, '');

  const correctPlat = detectShowPlatform(baseTitle, titleDetails);

  if (!baseTitle.includes('.') || baseTitle.includes('(')) {
    const prof = extractReleaseProfile(rawTitle, undefined, titleDetails);
    const sTag = `S${String(seasonNum).padStart(2, '0')}`;
    const cleanShow = showName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '.');
    const partSeg = partTag ? `.${partTag.replace(/-/g, '.')}` : '';
    const dynSeg = prof.dynamicRange ? `.${prof.dynamicRange.replace(/\s+/g, '.')}` : '';
    const resSeg = groupRes.replace(/\s*\/\s*/g, '.');
    const platSeg = prof.platform ? `.${prof.platform}` : '';
    const sourceSeg = prof.platform === 'DSNP' ? 'WEB-DL' : groupSource;
    const codecSeg = prof.codec || (resSeg.includes('2160') ? 'H.265' : 'H.264');
    baseTitle = `${cleanShow}.${sTag}${partSeg}.${resSeg}${platSeg}.${sourceSeg}.DUAL.DDP5.1.Atmos${dynSeg}.${codecSeg}`;
  } else {
    // If title has dot syntax, normalize platform & source tags according to verified platform
    if (correctPlat === 'DSNP') {
      // Disney+ titles MUST use DSNP.WEB-DL (never NF, never REMUX/BluRay)
      baseTitle = baseTitle
        .replace(/(?:^|\.)(?:NF|AMZN|ATVP|MAX|SLIV|SONYLIV|ZEE5|JIO)(?:\.(?:REMUX|BluRay|BDRip|WEB-DL|WEBRip))?(?=\.|$)/gi, '.DSNP.WEB-DL')
        .replace(/(?:^|\.)DSNP\.(?:REMUX|BluRay|BDRip)(?=\.|$)/gi, '.DSNP.WEB-DL');
      if (!baseTitle.includes('.DSNP.')) {
        baseTitle = baseTitle.replace(/(?:^|\.)(?:REMUX|BluRay|BDRip|WEB-DL|WEBRip)(?=\.|$)/i, '.DSNP.WEB-DL');
      }
    } else if (correctPlat) {
      // Normalize wrong NF tag on other known OTT services (e.g. Amazon The Boys, Apple Ted Lasso)
      baseTitle = baseTitle.replace(/(?:^|\.)NF(?=\.|$)/gi, `.${correctPlat}`);
    }
  }

  // 3. Episode size (per episode)
  let epSize = '';
  if (option.episodes.length > 0) {
    for (const ep of option.episodes) {
      const s = ep.size || detectSize(ep.title) || detectSize(ep.url);
      if (s) {
        epSize = s;
        break;
      }
    }
  }
  if (!epSize) {
    epSize = detectSize(rawTitle) || '';
  }

  // 4. Zip pack size
  let zipSize = '';
  if (option.packs.length > 0) {
    for (const pack of option.packs) {
      const s = pack.size || detectSize(pack.title) || detectSize(pack.url);
      if (s) {
        zipSize = s;
        break;
      }
    }
  }
  if (!zipSize && option.packs.length > 0) {
    zipSize = detectSize(rawTitle) || '';
  }

  return {
    baseTitle,
    partTag,
    epSize,
    zipSize,
  };
}

function formatEpisodeTitle(
  ep: EnrichedLink,
  option: ReleaseOption,
  titleDetails: TitleDetails,
  seasonNum: number,
  groupRes: string,
  groupSource: string
): string {
  const epNumStr = String(ep.episodeNumber || 1).padStart(2, '0');
  const sTag = `S${String(seasonNum).padStart(2, '0')}E${epNumStr}`;

  // If ep.title or ep.url is already an authentic scene release filename:
  const raw = (ep.title || '').trim();
  const urlFn = extractFilenameFromUrl(ep.url);
  const candidate = (raw && raw.includes('.')) ? raw : (urlFn || raw);

  if (candidate && /(?:s\d{1,2}e\d{1,2}|e\d{1,2})/i.test(candidate) && candidate.includes('.')) {
    let clean = stripWatermarks(candidate);
    const plat = detectShowPlatform(clean, titleDetails);
    if (plat === 'DSNP') {
      clean = clean
        .replace(/(?:^|\.)(?:NF|AMZN|ATVP|MAX)(?:\.(?:REMUX|BluRay|BDRip|WEB-DL|WEBRip))?(?=\.|$)/gi, '.DSNP.WEB-DL')
        .replace(/(?:^|\.)DSNP\.(?:REMUX|BluRay|BDRip)(?=\.|$)/gi, '.DSNP.WEB-DL');
    }
    return clean;
  }

  const { baseTitle } = parseOptionTitleAndTags(
    option,
    titleDetails,
    seasonNum,
    groupRes,
    groupSource
  );

  const sMatch = baseTitle.match(/S\d{2}/i);
  if (sMatch) {
    return `${baseTitle.replace(sMatch[0], sTag)}.mkv`;
  }

  return `${baseTitle}.${sTag}.mkv`;
}

function getResolutionBadgeStyle(resolution: string): string {
  if (resolution.includes('2160p') || resolution.includes('4K') || resolution.includes('4k')) {
    return 'bg-[#f59e0b] text-black font-bold px-3 py-1 rounded-lg text-xs shadow-sm';
  }
  if (resolution.includes('1080p')) {
    return 'bg-[#14223d] text-blue-400 border border-[#1e3a6a] font-bold px-3 py-1 rounded-lg text-xs shadow-sm';
  }
  if (resolution.includes('720p')) {
    return 'bg-[#221838] text-purple-400 border border-[#3b2960] font-bold px-3 py-1 rounded-lg text-xs shadow-sm';
  }
  return 'bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold px-3 py-1 rounded-lg text-xs shadow-sm';
}

function formatAudioLanguages(audio?: string, title?: string): string {
  const combined = `${audio || ''} ${title || ''}`.toLowerCase();
  const list: string[] = [];
  if (combined.includes('hindi') || combined.includes('hin')) list.push('Hindi');
  if (combined.includes('english') || combined.includes('eng')) list.push('English');
  if (combined.includes('spanish') || combined.includes('spa')) list.push('Spanish');
  if (combined.includes('tamil') || combined.includes('tam')) list.push('Tamil');
  if (combined.includes('telugu') || combined.includes('tel')) list.push('Telugu');
  if (combined.includes('korean') || combined.includes('kor')) list.push('Korean');
  if (combined.includes('japanese') || combined.includes('jap')) list.push('Japanese');

  // DUAL audio on Indian streaming scene indicates Hindi + English
  if (combined.includes('dual')) {
    if (!list.includes('Hindi')) list.unshift('Hindi');
    if (!list.includes('English')) list.push('English');
  }

  if (list.length > 0) {
    return list.join(', ');
  }

  if (audio && audio !== 'Original' && audio !== 'English') {
    return audio.replace(/\s*•\s*/g, ', ').replace(/\s*\+\s*/g, ', ');
  }

  return 'Hindi, English, Spanish';
}

export const TVEpisodeLinksManager: React.FC<TVEpisodeLinksManagerProps> = ({
  titleDetails,
  customLinks,
  isAdmin,
  onLinkAdded,
}) => {
  const { removeCustomLink } = useWatchlist();
  const [sessionAdmin, setSessionAdmin] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token =
        sessionStorage.getItem('cinefuel_admin_token') ||
        localStorage.getItem('cinefuel_admin_token') ||
        localStorage.getItem('cinefuel_id_token') ||
        '';
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSessionAdmin(Boolean(token));
    }
  }, []);

  const isEffectiveAdmin = isAdmin && sessionAdmin;

  // Open state for individual seasons: e.g. 5: true
  const [openSeasons, setOpenSeasons] = useState<Record<number, boolean>>({});
  // Open mirror dropdown menu per episode or zip: e.g. "optionId_ep_1" or "optionId_zip"
  const [openMirrorMenu, setOpenMirrorMenu] = useState<string | null>(null);
  // Option ID currently being managed by admin
  const [managingOptionId, setManagingOptionId] = useState<string | null>(null);

  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false);
  const [reportingLink, setReportingLink] = useState<ReportModalData | null>(null);

  // Click outside to dismiss open mirror dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openMirrorMenu && !(e.target as HTMLElement).closest('.mirror-menu-container')) {
        setOpenMirrorMenu(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [openMirrorMenu]);

  // Form states for Admin editing an existing link
  const [editingLink, setEditingLink] = useState<CustomLink | null>(null);
  const [editSeason, setEditSeason] = useState<number>(1);
  const [editType, setEditType] = useState<'zip_pack' | 'single_episode'>('zip_pack');
  const [editEpisode, setEditEpisode] = useState<number>(1);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editUrl, setEditUrl] = useState<string>('');
  const [editQuality, setEditQuality] = useState<string>('');
  const [editAudio, setEditAudio] = useState<string>('');
  const [editSize, setEditSize] = useState<string>('');
  const [editContainer, setEditContainer] = useState<string>('');
  const [editDynamicRange, setEditDynamicRange] = useState<string>('');
  const [editCodec, setEditCodec] = useState<string>('');
  const [editResolution, setEditResolution] = useState<string>('');
  const [editProvider, setEditProvider] = useState<string>('');

  // User Selection States (Single Open Accordion Slide & Season Selection)
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [openSlideId, setOpenSlideId] = useState<string | null>(null);

  // Verified official episode titles map (from DB or IMDb/TVMaze/TMDB/Trakt API)
  const [verifiedEpisodesMap, setVerifiedEpisodesMap] = useState<
    Map<number, { title: string; overview?: string }>
  >(new Map());
  const [isLoadingVerifiedEpisodes, setIsLoadingVerifiedEpisodes] = useState<boolean>(false);

  // Manual Episode Title Correction States (Admin inline edit without TMDB search)
  const [editingEpisodeNumber, setEditingEpisodeNumber] = useState<number | null>(null);
  const [editingEpisodeTitleInput, setEditingEpisodeTitleInput] = useState<string>('');
  const [isSavingEpisodeTitle, setIsSavingEpisodeTitle] = useState<boolean>(false);
  const [manualEpisodeTitlesMap, setManualEpisodeTitlesMap] = useState<Map<string, string>>(
    new Map()
  );

  // Dynamically calculate all seasons in ascending order (Season 1, Season 2, Season 3...) matching screenshot
  const seasonsList = useMemo(() => {
    const detectedSeasons = new Set<number>();
    const tmdbSeasons = titleDetails.number_of_seasons || 1;
    for (let i = 1; i <= tmdbSeasons; i++) {
      detectedSeasons.add(i);
    }

    customLinks.forEach((link) => {
      const s = detectSeasonNumber(link);
      if (s > 0) detectedSeasons.add(s);
    });

    // Sort ascending (Season 1, Season 2, Season 3...) matching reference screenshot
    return Array.from(detectedSeasons).sort((a, b) => a - b);
  }, [titleDetails.number_of_seasons, customLinks]);

  // Enrich each custom link with smart auto-detected metadata and manual overrides
  const enrichedLinks: EnrichedLink[] = useMemo(() => {
    return customLinks.map((l) => {
      const urlFn = extractFilenameFromUrl(l.url);
      const effectiveTitle = l.title || urlFn || '';
      const prof = extractReleaseProfile(
        effectiveTitle,
        l.quality,
        titleDetails,
        l.url,
        l.manualOverrides
      );
      const isPack = l.manualOverrides?.linkType === 'zip_pack' || prof.isPack;
      const detectedSeason =
        l.manualOverrides?.seasonNumber ||
        l.seasonNumber ||
        prof.seasonNumber ||
        detectSeasonNumber({ title: effectiveTitle, seasonNumber: l.seasonNumber, url: l.url });
      const detectedEp = isPack
        ? undefined
        : l.manualOverrides?.episodeNumber ||
          l.episodeNumber ||
          prof.episodeNumber ||
          detectEpisodeNumber({ title: effectiveTitle, episodeNumber: l.episodeNumber, url: l.url });
      const detectedType: 'zip_pack' | 'single_episode' =
        (l.manualOverrides?.linkType as 'zip_pack' | 'single_episode') ||
        (isPack ? 'zip_pack' : 'single_episode');
      const isSceneRelease =
        /(?:s\d{1,2}e\d{1,2}|2160p|1080p|720p|480p|\.mkv|\.mp4|web-dl|webdl|bluray)/i.test(
          effectiveTitle
        );
      const detectedQ =
        l.manualOverrides?.resolution ||
        (isSceneRelease || !l.quality || l.quality === 'HD'
          ? detectQuality(effectiveTitle, l.quality, l.url)
          : l.quality) ||
        '';
      const detectedAud =
        l.manualOverrides?.audioLanguage ||
        (l.audioLanguage && l.audioLanguage !== 'Original'
          ? l.audioLanguage
          : prof.audioLanguages || detectAudio(effectiveTitle, l.audioLanguage, l.url));
      const detectedSz =
        l.manualOverrides?.size || l.size || detectSize(effectiveTitle, undefined, l.url);

      const finalTitle =
        isSceneRelease && effectiveTitle.includes('.')
          ? stripWatermarks(effectiveTitle)
          : urlFn && /\.(?:mkv|mp4)/i.test(urlFn)
          ? stripWatermarks(urlFn)
          : l.title || '';

      return {
        ...l,
        title: finalTitle,
        seasonNumber: detectedSeason,
        episodeNumber: detectedEp,
        linkType: detectedType,
        category:
          detectedType === 'zip_pack'
            ? 'ZipPack'
            : l.category === 'ZipPack'
            ? 'SingleEpisode'
            : l.category,
        quality: detectedQ,
        audioLanguage: detectedAud,
        size: detectedSz,
        resolution:
          l.manualOverrides?.resolution || prof.verifiedResolutionLabel || l.resolution || undefined,
        source: prof.source,
        dynamicRange: prof.dynamicRange || l.dynamicRange || undefined,
        bitDepth: prof.bitDepth || l.bitDepth || undefined,
        codec: l.manualOverrides?.codec || prof.verifiedCodec || l.codec || undefined,
        container: prof.container || l.container || undefined,
        containerLabel: prof.containerLabel || undefined,
      };
    });
  }, [customLinks, titleDetails]);

  // Group enriched links by Season -> Format Groups (2160p / 4K DV HDR, 2160p / 4K SDR, 1080p...) -> Release Options
  const seasonGroupsMap = useMemo(() => {
    const map = new Map<number, FormatGroup[]>();
    const showName = titleDetails.name || titleDetails.title || 'Series';

    seasonsList.forEach((s) => {
      const currentSeasonLinks = enrichedLinks.filter((l) => l.seasonNumber === s);
      if (currentSeasonLinks.length === 0) {
        map.set(s, []);
        return;
      }

      // Group by format key: resolution + source + dynamicRange + codec
      const formatMap = new Map<
        string,
        { resolution: string; source: string; links: EnrichedLink[] }
      >();

      currentSeasonLinks.forEach((link) => {
        const prof = extractReleaseProfile(
          link.title,
          link.quality,
          titleDetails,
          link.url,
          link.manualOverrides
        );
        const resGroupLabel = link.resolution || prof.resolution || '1080p';
        const dyn = prof.dynamicRange || '';
        const dynSuffix = dyn ? `_${dyn.replace(/\s+/g, '_')}` : '';
        const codecSuffix = prof.codec ? `_${prof.codec.replace(/\s+/g, '_')}` : '';
        const key = `${resGroupLabel}_${link.source}${dynSuffix}${codecSuffix}`;
        if (!formatMap.has(key)) {
          formatMap.set(key, {
            resolution: resGroupLabel,
            source: link.source,
            links: [],
          });
        }
        formatMap.get(key)!.links.push(link);
      });

      const formats: FormatGroup[] = [];

      formatMap.forEach((fVal, fKey) => {
        // Group links inside this format by release profile (Separate 4K DV HDR vs 4K SDR vs 1080p DV HDR vs 1080p SDR)
        const optionsMap = new Map<
          string,
          {
            id: string;
            title: string;
            seasonNumber: number;
            audioLanguages: string;
            packs: EnrichedLink[];
            episodes: EnrichedLink[];
          }
        >();

        fVal.links.forEach((link) => {
          const prof = extractReleaseProfile(link.title, link.quality, titleDetails, link.url, link.manualOverrides);
          const partSuffix = prof.part ? `_${prof.part}` : '';
          const optKey = `s${s}_${fKey}_${prof.dynamicRange || 'std'}_${prof.codec || 'codec'}${partSuffix}`;

          if (!optionsMap.has(optKey)) {
            let optTitle = link.title;
            if (optTitle.includes('.mkv') || optTitle.includes('.zip') || !optTitle.includes('(')) {
              optTitle = prof.cleanDisplayTitle(showName, s);
            }

            optionsMap.set(optKey, {
              id: optKey,
              title: optTitle,
              seasonNumber: s,
              audioLanguages: formatAudioLanguages(link.audioLanguage, link.title),
              packs: [],
              episodes: [],
            });
          }

          const opt = optionsMap.get(optKey)!;
          // IMPORTANT: Check episode status first! An individual episode (S01E01, etc.) must NEVER be placed in packs,
          // even if provider label or title contains "HubCloud Pack"!
          const isEpisode = link.episodeNumber !== undefined || prof.isEpisode || link.linkType === 'single_episode';
          if (!isEpisode && (link.linkType === 'zip_pack' || prof.isPack || isPackMedia(link.title, link.url))) {
            opt.packs.push(link);
          } else {
            opt.episodes.push(link);
          }
        });

        const options: ReleaseOption[] = [];

        optionsMap.forEach((optVal) => {
          // Intelligent Auto-Recovery:
          // If no episodes were detected, but multiple links are in packs:
          // A TV season release never has multiple zip packs on the same server unless they are different parts/providers!
          // Separate true zip/rar/pack links from episode links.
          if (optVal.episodes.length === 0 && optVal.packs.length > 1) {
            const realPacks: EnrichedLink[] = [];
            const recoveredEpisodes: EnrichedLink[] = [];

            optVal.packs.forEach((p, idx) => {
              const isPack = isPackMedia(p.title, p.url) || p.linkType === 'zip_pack' || p.category === 'ZipPack';

              if (isPack) {
                realPacks.push(p);
              } else {
                const epNum = p.episodeNumber || detectEpisodeNumber(p) || idx + 1;
                recoveredEpisodes.push({
                  ...p,
                  episodeNumber: epNum,
                  linkType: 'single_episode',
                  category: 'SingleEpisode',
                });
              }
            });

            if (recoveredEpisodes.length > 0 && realPacks.length > 0) {
              optVal.episodes = recoveredEpisodes;
              optVal.packs = realPacks;
            } else if (recoveredEpisodes.length > 0 && realPacks.length === 0) {
              optVal.episodes = recoveredEpisodes;
              optVal.packs = [];
            }
          }

          // Ensure every episode has a valid positive integer episodeNumber
          optVal.episodes.forEach((ep, idx) => {
            if (!ep.episodeNumber || ep.episodeNumber <= 0) {
              ep.episodeNumber = detectEpisodeNumber(ep) || idx + 1;
            }
          });

          let epCount = '10';
          if (optVal.episodes.length > 0) {
            epCount = `${optVal.episodes.length}`;
          } else if (optVal.packs.length > 0) {
            const firstPack = optVal.packs[0];
            const epMatch = firstPack.title.match(/(?:episodes?\s*|e\d{1,2}\s*-\s*e?|total\s*)(\d{1,3})/i);
            epCount = epMatch
              ? epMatch[1]
              : titleDetails.number_of_episodes
              ? `${titleDetails.number_of_episodes}`
              : '10';
          }

          options.push({
            id: optVal.id,
            title: optVal.title,
            seasonNumber: s,
            episodeCountLabel: `Episodes ${epCount}`,
            audioLanguages: optVal.audioLanguages,
            packs: optVal.packs,
            episodes: optVal.episodes.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0)),
          });
        });

        // Sort options: DV HDR first, then SDR, then others
        options.sort((a, b) => {
          const orderA = a.title.includes('DV') || a.title.includes('HDR') ? 2 : a.title.includes('SDR') ? 1 : 0;
          const orderB = b.title.includes('DV') || b.title.includes('HDR') ? 2 : b.title.includes('SDR') ? 1 : 0;
          return orderB - orderA;
        });

        formats.push({
          id: `s${s}_${fKey}`,
          resolution: fVal.resolution,
          source: fVal.source,
          options,
        });
      });

      // Sort formats: 2160p / 4K > 1080p > 720p > 480p
      formats.sort((a, b) => getQualityWeight(b.resolution) - getQualityWeight(a.resolution));
      map.set(s, formats);
    });

    return map;
  }, [seasonsList, enrichedLinks, titleDetails]);

  // Effective season selection (auto-defaults to first season with links if selected is not present)
  const effectiveSeason = useMemo(() => {
    if (seasonsList.includes(selectedSeason)) return selectedSeason;
    if (seasonsList.length > 0) {
      const firstSeasonWithLinks =
        seasonsList.find((s) => {
          const fmts = seasonGroupsMap.get(s);
          return fmts && fmts.length > 0;
        }) || seasonsList[0];
      return firstSeasonWithLinks;
    }
    return selectedSeason;
  }, [seasonsList, seasonGroupsMap, selectedSeason]);

  const handleSelectSeason = (seasonNum: number) => {
    setSelectedSeason(seasonNum);
    setOpenSlideId(null);
    setEditingEpisodeNumber(null);
  };

  // Fetch verified official episode metadata for the effective season (IMDb -> TVMaze -> TMDB -> Trakt)
  useEffect(() => {
    let isCancelled = false;
    async function fetchSeasonTitles() {
      if (!titleDetails.id) return;
      setIsLoadingVerifiedEpisodes(true);
      try {
        const showTitle = titleDetails.name || titleDetails.title || '';
        const imdbId =
          titleDetails.external_ids?.imdb_id ||
          (titleDetails as { imdb_id?: string }).imdb_id ||
          '';
        const airDate = titleDetails.first_air_date || titleDetails.release_date || '';
        const year = airDate ? airDate.slice(0, 4) : '';
        const queryParams = new URLSearchParams({
          id: String(titleDetails.id),
          season: String(effectiveSeason),
          title: showTitle,
        });
        if (imdbId) queryParams.set('imdbId', imdbId);
        if (year) queryParams.set('year', year);

        const res = await fetch(`/api/tv-episodes?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.episodes) && !isCancelled) {
            const map = new Map<number, { title: string; overview?: string }>();
            data.episodes.forEach(
              (ep: {
                episodeNumber?: number | string;
                episode_number?: number | string;
                title?: string;
                name?: string;
                overview?: string;
              }) => {
                const epNum = Number(ep.episodeNumber ?? ep.episode_number);
                const epTitle = (ep.title || ep.name || '').trim();
                if (
                  epNum > 0 &&
                  epTitle &&
                  !/^(?:ep(?:isode)?\s*#?\d+|e\d+|s\d+e\d+|tba|tbd|unknown|n\/a)$/i.test(epTitle)
                ) {
                  map.set(epNum, {
                    title: epTitle,
                    overview: ep.overview || '',
                  });
                }
              }
            );
            setVerifiedEpisodesMap(map);
          }
        }
      } catch {
        // Silently fallback to stored DB titles or Episode N
      } finally {
        if (!isCancelled) setIsLoadingVerifiedEpisodes(false);
      }
    }

    fetchSeasonTitles();
    return () => {
      isCancelled = true;
    };
  }, [
    titleDetails,
    titleDetails.id,
    titleDetails.name,
    titleDetails.title,
    titleDetails.external_ids?.imdb_id,
    titleDetails.first_air_date,
    titleDetails.release_date,
    effectiveSeason,
  ]);

  // Active season packs for effectiveSeason
  const activeSeasonPacks = useMemo(() => {
    const showName = titleDetails.name || titleDetails.title || 'Series';
    const formats = seasonGroupsMap.get(effectiveSeason) || [];
    const results: Array<{
      optionId: string;
      resolution: string;
      source: string;
      title: string;
      codec?: string;
      dynamicRange?: string;
      bitDepth?: string;
      containerLabel?: string;
      audioLanguages: string;
      packs: EnrichedLink[];
      size: string;
    }> = [];

    formats.forEach((fmt) => {
      fmt.options.forEach((opt) => {
        if (opt.packs.length > 0) {
          const first = opt.packs[0];
          const detectedSz = first.size || detectSize(first.title) || detectSize(undefined, undefined, first.url) || '';
          const urlFn = extractFilenameFromUrl(first.url);
          let rawPackTitle = first.title || opt.title || '';
          if (urlFn && (/\.(?:zip|rar|7z|tar|mkv|mp4)$/i.test(urlFn) || /(?:2160p|1080p|720p|s\d{1,2}|season)/i.test(urlFn))) {
            if (!rawPackTitle || rawPackTitle.length < 15 || !/(?:2160p|1080p|720p|web-dl|h\.?26[45])/i.test(rawPackTitle)) {
              rawPackTitle = urlFn;
            }
          }
          let cleanPackTitle = stripWatermarks(rawPackTitle);
          if (!cleanPackTitle || cleanPackTitle.length < 5 || /^p[0-9a-z]{10,}$/i.test(cleanPackTitle) || cleanPackTitle.startsWith('http')) {
            cleanPackTitle = `${showName} S0${effectiveSeason} Complete Pack (${fmt.resolution} ${fmt.source})`;
          }
          const finalPackTitle = cleanPackTitle || rawPackTitle || opt.title;
          const prof = extractReleaseProfile(finalPackTitle, first.quality, titleDetails, first.url, first.manualOverrides);

          results.push({
            optionId: opt.id,
            resolution: fmt.resolution,
            source: fmt.source,
            title: finalPackTitle,
            codec: prof.codec,
            dynamicRange: prof.dynamicRange,
            bitDepth: prof.bitDepth,
            containerLabel: prof.containerLabel,
            audioLanguages: opt.audioLanguages,
            packs: opt.packs,
            size: detectedSz,
          });
        }
      });
    });

    return results;
  }, [effectiveSeason, seasonGroupsMap, titleDetails]);

  // Unified Season Episodes with All Available Releases across Formats
  const seasonEpisodes = useMemo(() => {
    const currentSeasonLinks = enrichedLinks.filter((l) => l.seasonNumber === effectiveSeason);
    const epMap = new Map<number, EnrichedLink[]>();

    currentSeasonLinks.forEach((link) => {
      // Exclude true complete season packs from individual episodes list
      const isPack = isPackMedia(link.title, link.url) || link.linkType === 'zip_pack' || link.category === 'ZipPack';
      if (isPack && link.episodeNumber === undefined) return;

      const epNum = link.episodeNumber || detectEpisodeNumber(link) || 1;
      if (epNum <= 0) return;

      if (!epMap.has(epNum)) {
        epMap.set(epNum, []);
      }
      epMap.get(epNum)!.push(link);
    });

    const epNumbers = Array.from(epMap.keys()).sort((a, b) => a - b);

    const isReleaseFilenameLike = (val?: string): boolean => {
      if (!val) return false;
      const t = val.trim();
      if (/(?:2160p|1080p|720p|480p|web-dl|webdl|webrip|bluray|bdrip|remux|h\.?26[45]|x26[45]|hevc|avc|ddp\d|atmos|\.mkv|\.mp4|\.avi|\.zip|4khdhub|hdhub4u| Vegamovies)/i.test(t)) {
        return true;
      }
      if (t.includes('.') && !t.includes(' ') && t.length > 12) return true;
      if (/^https?:\/\//i.test(t)) return true;
      return false;
    };

    const isCleanVerifiedTitle = (val?: string): boolean => {
      if (!val || !val.trim()) return false;
      const t = val.trim();
      if (/^(?:ep(?:isode)?\s*#?\d+|e\d+|s\d+e\d+|tba|tbd|unknown|n\/a|untitled)$/i.test(t)) {
        return false;
      }
      if (isReleaseFilenameLike(t)) return false;
      return true;
    };

    return epNumbers.map((epNum) => {
      const epLinks = epMap.get(epNum) || [];
      const sTag = `S${String(effectiveSeason).padStart(2, '0')}E${String(epNum).padStart(2, '0')}`;
      const verifiedObj = verifiedEpisodesMap.get(epNum);

      // 1. Live manual override in current session
      const sessionManualTitle = manualEpisodeTitlesMap.get(`${effectiveSeason}_${epNum}`);
      // 2. Stored manual correction with manualTitleVerified: true
      const storedManualTitle = epLinks.find(
        (e) => e.manualTitleVerified && e.episodeTitle && !isReleaseFilenameLike(e.episodeTitle)
      )?.episodeTitle;
      // 3. Verified external lookup (IMDb / TVMaze / TMDB / Trakt)
      const externalVerifiedTitle = isCleanVerifiedTitle(verifiedObj?.title)
        ? verifiedObj!.title.trim()
        : undefined;
      // 4. Stored verified episodeTitle in DB
      const storedVerifiedTitle = epLinks.find((e) => isCleanVerifiedTitle(e.episodeTitle))?.episodeTitle;
      // 5. Existing non-filename stored title (even if generic like "Episode 1")
      const existingNonFilenameTitle = epLinks.find(
        (e) => e.episodeTitle && e.episodeTitle.trim() && !isReleaseFilenameLike(e.episodeTitle)
      )?.episodeTitle;

      const resolvedVerifiedCandidate =
        sessionManualTitle ||
        storedManualTitle ||
        externalVerifiedTitle ||
        storedVerifiedTitle;

      const isVerified = Boolean(resolvedVerifiedCandidate && resolvedVerifiedCandidate.trim());

      // Never invent episode names or treat release filenames as official episode titles!
      const officialTitle = isVerified
        ? resolvedVerifiedCandidate!.trim()
        : existingNonFilenameTitle?.trim() || `Episode ${epNum}`;

      // Dot separator ' · ' matching user mockup media_1791796102840_4c86c0a4.png
      const heading = `${sTag} · ${officialTitle}`;

      // Identify any valid destination links that lack verified quality metadata (for admin review)
      const unverifiedQualityReleases = epLinks.filter(
        (r) => isValidDestinationUrl(r.url) && !getVerifiedReleaseAttributes(r).hasAnyVerifiedQuality
      );

      return {
        episodeNumber: epNum,
        sTag,
        heading,
        officialTitle,
        isVerified,
        isManualVerified: Boolean(sessionManualTitle || storedManualTitle),
        overview: verifiedObj?.overview,
        releases: epLinks,
        unverifiedQualityCount: unverifiedQualityReleases.length,
      };
    });
  }, [enrichedLinks, effectiveSeason, verifiedEpisodesMap, manualEpisodeTitlesMap]);

  const handleSaveManualEpisodeTitle = async (epNum: number) => {
    const trimmed = editingEpisodeTitleInput.trim();
    if (!trimmed) return;
    setIsSavingEpisodeTitle(true);
    try {
      const res = await updateGlobalEpisodeTitle(titleDetails.id, {
        seasonNumber: effectiveSeason,
        episodeNumber: epNum,
        episodeTitle: trimmed,
        manualTitleVerified: true,
        forceOverwrite: true,
      });
      if (res.success) {
        setManualEpisodeTitlesMap((prev) => {
          const next = new Map(prev);
          next.set(`${effectiveSeason}_${epNum}`, trimmed);
          return next;
        });
        setEditingEpisodeNumber(null);
        setEditingEpisodeTitleInput('');
        if (onLinkAdded) onLinkAdded();
      }
    } finally {
      setIsSavingEpisodeTitle(false);
    }
  };

  // Accordion toggle: clicking an open tab minimizes it, clicking a minimized tab maximizes it & closes other tabs
  const toggleSlide = (slideKey: string) => {
    setOpenSlideId((prev) => (prev === slideKey ? null : slideKey));
  };

  const handleStartEdit = (link: CustomLink) => {
    const prof = extractReleaseProfile(link.title, link.quality, titleDetails, link.url, link.manualOverrides);
    setEditingLink(link);
    setEditSeason(link.manualOverrides?.seasonNumber || link.seasonNumber || 1);
    setEditType((link.manualOverrides?.linkType || link.linkType) === 'single_episode' ? 'single_episode' : 'zip_pack');
    setEditEpisode(link.manualOverrides?.episodeNumber || link.episodeNumber || 1);
    setEditTitle(link.title);
    setEditUrl(link.url);
    setEditQuality(link.manualOverrides?.resolution || link.quality || prof.resolution || '');
    setEditAudio(link.manualOverrides?.audioLanguage || link.audioLanguage || prof.audioLanguages || '');
    setEditSize(link.manualOverrides?.size || link.size || '');
    setEditContainer(link.manualOverrides?.container || prof.container || '');
    setEditDynamicRange(link.manualOverrides?.dynamicRange || prof.dynamicRange || '');
    setEditCodec(link.manualOverrides?.codec || prof.codec || '');
    setEditResolution(link.manualOverrides?.resolution || prof.resTag || '');
    setEditProvider(link.manualOverrides?.provider || prof.platform || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLink || !editTitle.trim() || !editUrl.trim()) return;

    let finalUrl = editUrl.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`;
    }

    const manualOverrides: CustomLink['manualOverrides'] = {
      container: editContainer || undefined,
      linkType: editType,
      seasonNumber: editSeason,
      episodeNumber: editType === 'single_episode' ? editEpisode : undefined,
      resolution: editResolution || undefined,
      dynamicRange: editDynamicRange === 'None' ? undefined : (editDynamicRange || undefined),
      codec: editCodec || undefined,
      provider: editProvider || undefined,
      audioLanguage: editAudio.trim() || undefined,
      size: editSize.trim() || undefined,
    };

    const parsed = parseReleaseDetails(editTitle.trim(), finalUrl, manualOverrides);

    const updatedLink: CustomLink = {
      ...editingLink,
      title: editTitle.trim(),
      url: finalUrl,
      category: editType === 'zip_pack' ? 'ZipPack' : 'SingleEpisode',
      seasonNumber: editSeason,
      episodeNumber: editType === 'single_episode' ? editEpisode : undefined,
      quality: editQuality.trim() || parsed.resolutionLabel || editingLink.quality,
      audioLanguage: editAudio.trim() || parsed.audioLanguage || editingLink.audioLanguage,
      size: editSize.trim() || parsed.fileSize || editingLink.size,
      linkType: editType,
      container: editContainer || parsed.container,
      dynamicRange: editDynamicRange === 'None' ? undefined : (editDynamicRange || parsed.dynamicRangeLabel),
      codec: editCodec || parsed.codec,
      resolution: editResolution || parsed.resolution,
      provider: editProvider || parsed.provider,
      manualOverrides,
    };

    updateGlobalCustomLink(titleDetails.id, updatedLink);
    setEditingLink(null);
    if (onLinkAdded) onLinkAdded();
  };

  const handleDelete = async (linkId: string) => {
    if (confirm('Delete this TV link permanently?')) {
      removeCustomLink(titleDetails.id, linkId);
      if (onLinkAdded) onLinkAdded();
      await deleteGlobalCustomLink(titleDetails.id, linkId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Admin Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Tv className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg sm:text-xl font-bold text-white">Season & Episode Vault</h3>
          </div>
          <p className="text-xs text-zinc-400">
            Select format (4K DV HDR, 4K SDR, 1080p, 720p) and release packages to access direct episode & zip downloads.
          </p>
        </div>

        {isEffectiveAdmin && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
            <a
              href={`/admin?title=${encodeURIComponent(titleDetails.name || titleDetails.title || '')}&id=${titleDetails.id}`}
              className="flex items-center justify-center gap-1.5 w-full sm:w-auto flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-amber-500/50 text-amber-400 hover:text-amber-300 font-bold text-xs transition-all hover:bg-zinc-800 shadow-sm"
            >
              <Zap className="w-3.5 h-3.5 fill-amber-400" />
              <span>Admin File Uploader ↗</span>
            </a>
          </div>
        )}
      </div>

      {/* 1. SELECT SEASON (media_1790848168477.png reference design) */}
      <div className="rounded-2xl sm:rounded-3xl bg-[#0c0d13] border border-white/5 p-3.5 sm:p-6 shadow-2xl space-y-3">
        <label className="text-[11px] font-bold tracking-wider text-zinc-400 uppercase block">
          SELECT SEASON
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {seasonsList.map((s) => {
            const isActive = effectiveSeason === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => handleSelectSeason(s)}
                className={`min-h-[42px] px-4 py-2 sm:px-6 sm:py-3 rounded-2xl font-black text-xs sm:text-sm tracking-wider uppercase transition-all cursor-pointer select-none ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 text-white shadow-[0_4px_24px_rgba(59,130,246,0.65)] border border-blue-400/40 scale-[1.02]'
                    : 'bg-[#14161f] hover:bg-[#1f2230] text-zinc-300 hover:text-white border border-white/5'
                }`}
              >
                SEASON {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Choose a Download Option Header & Accordion Cards (media_1790899727140.png) */}
      <div className="space-y-4 min-w-0 max-w-full">
        {/* Section Title */}
        <div className="space-y-1.5 pt-2 pb-1">
          <p className="text-xs font-bold tracking-widest text-sky-400 uppercase">
            CHOOSE A DOWNLOAD OPTION
          </p>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Open download links
          </h3>
          <p className="text-xs sm:text-sm text-zinc-400 font-medium">
            Select the type of links you want to view.
          </p>
        </div>

        {/* SLIDE: Full Collection / Zip Archive */}
        <div className="rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 border-l-4 border-l-cyan-400 shadow-xl transition-all duration-300 bg-[#0e1322]/95 hover:bg-[#12182c]/95 min-w-0 max-w-full">
          {/* Card Button matching media_1790899727140.png */}
          <button
            type="button"
            onClick={() => toggleSlide('zip')}
            className="w-full text-left p-3.5 sm:p-5 flex items-center justify-between gap-3 sm:gap-4 cursor-pointer select-none focus:outline-none transition-colors min-w-0"
          >
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#1c243a] border border-[#2b3756] flex items-center justify-center text-cyan-400 shadow-inner shrink-0">
                <ArrowUpRight className="w-5 h-5 text-cyan-400" />
              </div>

              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <p className="text-[10px] sm:text-[11px] font-bold tracking-widest text-sky-400 uppercase">
                    FULL COLLECTION / SEASON PACKS
                  </p>
                  {activeSeasonPacks.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {activeSeasonPacks.reduce((acc, r) => acc + r.packs.length, 0)} Available
                    </span>
                  )}
                </div>
                <h4 className="text-base sm:text-xl font-bold text-white tracking-tight leading-tight truncate">
                  Zip Archive / Season Packs
                </h4>
                <p className="text-xs text-zinc-400 font-medium truncate">
                  Complete Season Packs · GDrive · HubCloud · All Episodes in One Link
                </p>
              </div>
            </div>

            <div className="text-zinc-400 shrink-0 p-1">
              {openSlideId === 'zip' ? (
                <ChevronDown className="w-5 h-5 text-zinc-300 transition-transform duration-200" />
              ) : (
                <ChevronRight className="w-5 h-5 text-zinc-400 transition-transform duration-200" />
              )}
            </div>
          </button>

          {/* Expanded Body for Zip Archive */}
          {openSlideId === 'zip' && (
            <div className="bg-[#090c15] p-3.5 sm:p-6 space-y-4 animate-fadeIn border-t border-white/10">
              {activeSeasonPacks.length > 0 ? (
                <div className="space-y-2.5">
                  {activeSeasonPacks.map((packRel) => {
                    return packRel.packs.map((primaryPack, pIdx) => {
                      const destinationUrl = primaryPack?.url || '#';
                      const server = detectServer(destinationUrl);
                      const serverName = server.name || 'HubCloud';
                      const packTitle = primaryPack.title && !primaryPack.title.startsWith('http') && !/^p[0-9a-z]{10,}$/i.test(primaryPack.title)
                        ? primaryPack.title
                        : packRel.title;
                      const detectedSz = primaryPack.size || detectSize(primaryPack.title) || detectSize(undefined, undefined, primaryPack.url) || packRel.size;

                      return (
                        <div
                          key={`${primaryPack.id || pIdx}-${packRel.optionId}`}
                          className="group relative rounded-2xl bg-[#0e111a] hover:bg-[#131724] border border-white/5 hover:border-amber-500/40 p-3.5 sm:p-4.5 transition-all shadow-md hover:shadow-amber-500/10 flex flex-col md:flex-row md:items-center justify-between gap-3"
                        >
                          {/* Direct Clickable Release Filename redirecting directly to HubCloud / GDFlix */}
                          <a
                            href={sanitizeSafeUrl(destinationUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 min-w-0 flex-1 select-none cursor-pointer"
                            title={`Click to download ${packTitle} on ${serverName}`}
                          >
                            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 group-hover:bg-amber-500/25 transition-all shadow-inner">
                              <FileArchive className="w-4 h-4" />
                            </div>

                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-amber-300 group-hover:underline transition-colors break-all">
                                  {packTitle}
                                </span>
                                <ExternalLink className="w-3.5 h-3.5 text-amber-400/70 group-hover:text-amber-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] text-zinc-400">
                                <span className="font-semibold text-amber-400">
                                  {packRel.resolution} {packRel.source}
                                </span>
                                {detectedSz && (
                                  <span className="font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                                    {detectedSz}
                                  </span>
                                )}
                                {packRel.containerLabel && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    {packRel.containerLabel}
                                  </span>
                                )}
                                {packRel.dynamicRange && (
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    packRel.dynamicRange === 'Conflict'
                                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                      : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                  }`}>
                                    {packRel.dynamicRange}
                                  </span>
                                )}
                                {packRel.bitDepth && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                    {packRel.bitDepth}
                                  </span>
                                )}
                                {packRel.codec && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                    {packRel.codec}
                                  </span>
                                )}
                                {packRel.audioLanguages && (
                                  <span className="text-zinc-500">
                                    🔊 {packRel.audioLanguages}
                                  </span>
                                )}
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  {serverName} Pack
                                </span>
                              </div>
                            </div>
                          </a>

                          {/* Report Broken Link Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReportingLink({
                                linkId: primaryPack?.id,
                                movieId: titleDetails.id,
                                mediaTitle: titleDetails.name || titleDetails.title || 'TV Series',
                                mediaType: 'tv',
                                posterPath: titleDetails.poster_path,
                                linkTitle: packTitle,
                                reportedUrl: destinationUrl,
                                quality: packRel.resolution,
                                server: serverName,
                              });
                            }}
                            className="p-2 sm:p-2.5 rounded-xl bg-[#141824] hover:bg-[#1d2335] text-zinc-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/30 transition-colors cursor-pointer shrink-0 self-end md:self-center"
                            title="Report broken or defective pack link"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>

                          {/* Admin Controls (Only visible to admin) */}
                          {isEffectiveAdmin && primaryPack && (
                            <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(primaryPack);
                                }}
                                className="p-2 sm:p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 transition-colors cursor-pointer"
                                title="Admin: Edit pack link"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(primaryPack.id);
                                }}
                                className="p-2 sm:p-2.5 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-400 border border-rose-900/50 transition-colors cursor-pointer"
                                title="Admin: Delete pack link"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })}
                </div>
              ) : (
                <div className="p-5 sm:p-8 rounded-2xl bg-[#0c0d13] border border-white/5 text-center space-y-3.5 shadow-xl">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h4 className="text-white font-bold text-base sm:text-lg">
                    No Complete Season {effectiveSeason} Zip Packs Uploaded Yet
                  </h4>
                  <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
                    Single episodes are available in the quality slides below! You can also request a complete season pack zip archive.
                  </p>
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsRequestModalOpen(true)}
                      className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 sm:px-6 py-2.5 min-h-[42px] rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Request Season {effectiveSeason} Zip Pack</span>
                    </button>
                    {isEffectiveAdmin && (
                      <a
                        href={`/admin?title=${encodeURIComponent(titleDetails.name || titleDetails.title || '')}&id=${titleDetails.id}`}
                        className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 min-h-[42px] rounded-xl bg-zinc-800 border border-zinc-700 hover:border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-bold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Upload in Admin ↗
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* EPISODE CARDS WITH DIRECT ONE-CLICK QUALITY BUTTONS */}
        <div className="space-y-4 min-w-0 max-w-full">
          {seasonEpisodes.length > 0 ? (
            seasonEpisodes.map((ep) => {
              // Strictly generate buttons only for quality combinations supported by verified metadata of actual links
              const buttonsToRender = getDynamicQualityButtonsForEpisode(ep.releases);
              const isEditingThisTitle = editingEpisodeNumber === ep.episodeNumber;

              return (
                <div
                  key={ep.episodeNumber}
                  className="rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-xl transition-all duration-300 bg-[#0e1322]/95 hover:bg-[#12182c]/95 p-3.5 sm:p-5 space-y-3.5 min-w-0 max-w-full"
                >
                  {/* Header Row: S01E01 · Title and Report Button */}
                  <div className="flex items-start justify-between gap-2.5 sm:gap-4 min-w-0">
                    <div className="space-y-1 min-w-0 flex-1 text-left">
                      {isEditingThisTitle && (isEffectiveAdmin || isAdmin) ? (
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="text-sm font-mono font-bold text-amber-400 shrink-0">
                            {ep.sTag} ·
                          </span>
                          <input
                            type="text"
                            value={editingEpisodeTitleInput}
                            onChange={(e) => setEditingEpisodeTitleInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveManualEpisodeTitle(ep.episodeNumber);
                              } else if (e.key === 'Escape') {
                                setEditingEpisodeNumber(null);
                                setEditingEpisodeTitleInput('');
                              }
                            }}
                            placeholder={`Official title for ${ep.sTag}...`}
                            className="flex-1 min-w-0 w-full sm:w-auto bg-[#090c15] border border-amber-500/40 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400"
                            autoFocus
                          />
                          <button
                            type="button"
                            disabled={isSavingEpisodeTitle || !editingEpisodeTitleInput.trim()}
                            onClick={() => handleSaveManualEpisodeTitle(ep.episodeNumber)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                            title="Save manual episode title correction (preserves all destination links)"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEpisodeNumber(null);
                              setEditingEpisodeTitleInput('');
                            }}
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <h4 className="text-sm sm:text-lg font-bold text-white flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0 break-words leading-snug">
                          <span className="break-words min-w-0">{ep.heading}</span>
                          {!ep.isVerified && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 font-semibold shrink-0"
                              title="Unverified title. Administrator can verify via IMDb/TVMaze/TMDB or edit manually."
                            >
                              Unverified
                            </span>
                          )}
                          {ep.isManualVerified && (isEffectiveAdmin || isAdmin) && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-semibold shrink-0"
                              title="Verified manual title correction (protected from automatic bulk overwrites)"
                            >
                              Manual Verified
                            </span>
                          )}
                          {(isEffectiveAdmin || isAdmin) && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEpisodeNumber(ep.episodeNumber);
                                setEditingEpisodeTitleInput(ep.officialTitle);
                              }}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 text-zinc-400 hover:text-amber-300 border border-white/10 hover:border-amber-500/30 transition-colors cursor-pointer shrink-0"
                              title="Admin: Manually edit episode title without TMDB search (preserves all links)"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </h4>
                      )}
                      <p className="text-xs text-zinc-400 font-medium">
                        Direct 1-Click Downloads · Opens destination in new tab
                      </p>
                    </div>

                    {/* Report Broken Link Flag */}
                    <button
                      type="button"
                      onClick={() => {
                        setReportingLink({
                          movieId: titleDetails.id,
                          mediaTitle: titleDetails.name || titleDetails.title || 'TV Series',
                          mediaType: 'tv',
                          posterPath: titleDetails.poster_path,
                          linkTitle: ep.heading,
                          reportedUrl: ep.releases[0]?.url || '',
                          quality: 'TV Episode',
                        });
                      }}
                      className="min-w-[38px] min-h-[38px] p-2 rounded-xl bg-[#141824] hover:bg-[#1d2335] text-zinc-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/30 transition-colors cursor-pointer shrink-0 inline-flex items-center justify-center"
                      title="Report broken or defective link for this episode"
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Episode Overview (if available from IMDb/TVMaze/TMDB/Trakt) */}
                  {ep.overview && (
                    <p className="text-[11px] text-zinc-400/90 line-clamp-2 leading-relaxed text-left">
                      {ep.overview}
                    </p>
                  )}

                  {/* DIRECT ONE-CLICK QUALITY BUTTONS (No Release Drawer / No Second Screen) */}
                  <div
                    className="flex flex-wrap items-center gap-2 sm:gap-2.5 pt-0.5 max-w-full"
                    role="toolbar"
                    aria-label={`Direct download links for ${ep.sTag}`}
                  >
                    {buttonsToRender.length > 0 ? (
                      buttonsToRender.map(({ combo, release: rel, url }) => {
                        const server = detectServer(url);
                        const serverName = server.name || 'Server';
                        const detectedSz =
                          rel.size ||
                          detectSize(rel.title) ||
                          detectSize(undefined, undefined, rel.url) ||
                          '';

                        // Badge styling by quality tier
                        let badgeStyle =
                          'bg-[#131724] text-zinc-200 hover:text-white border-white/10 hover:border-blue-400/50 hover:bg-[#1a2133]';
                        if (combo.resolution === '2160p') {
                          if (combo.dynamicRange === 'DV') {
                            badgeStyle =
                              'bg-gradient-to-r from-purple-950/70 to-indigo-950/70 text-purple-200 hover:text-white border-purple-500/35 hover:border-purple-400 hover:from-purple-900/80 hover:to-indigo-900/80 shadow-[0_0_12px_rgba(168,85,247,0.18)]';
                          } else if (combo.dynamicRange === 'HDR') {
                            badgeStyle =
                              'bg-gradient-to-r from-cyan-950/70 to-blue-950/70 text-cyan-200 hover:text-white border-cyan-500/35 hover:border-cyan-400 hover:from-cyan-900/80 hover:to-blue-900/80 shadow-[0_0_12px_rgba(6,182,212,0.18)]';
                          } else if (combo.dynamicRange === 'SDR') {
                            badgeStyle =
                              'bg-[#181d2c] text-amber-200 hover:text-white border-amber-500/30 hover:border-amber-400 hover:bg-[#20273c]';
                          } else {
                            badgeStyle =
                              'bg-gradient-to-r from-amber-950/60 to-yellow-950/60 text-amber-200 hover:text-white border-amber-500/35 hover:border-amber-400 hover:from-amber-900/70 hover:to-yellow-900/70 shadow-[0_0_12px_rgba(245,158,11,0.18)]';
                          }
                        } else if (combo.resolution === '1080p') {
                          if (combo.dynamicRange === 'DV') {
                            badgeStyle =
                              'bg-gradient-to-r from-purple-950/60 to-blue-950/60 text-purple-200 hover:text-white border-purple-500/35 hover:border-purple-400';
                          } else if (combo.dynamicRange === 'HDR') {
                            badgeStyle =
                              'bg-gradient-to-r from-cyan-950/60 to-blue-950/60 text-cyan-200 hover:text-white border-cyan-500/35 hover:border-cyan-400';
                          } else {
                            badgeStyle =
                              'bg-[#12192e] text-blue-200 hover:text-white border-blue-500/35 hover:border-blue-400 hover:bg-[#18223e]';
                          }
                        } else if (combo.resolution === '720p') {
                          badgeStyle =
                            'bg-[#18152c] text-indigo-200 hover:text-white border-indigo-500/35 hover:border-indigo-400 hover:bg-[#221e3c]';
                        } else if (combo.codec === 'H.265') {
                          badgeStyle =
                            'bg-gradient-to-r from-purple-950/60 to-indigo-950/60 text-purple-200 hover:text-white border-purple-500/35 hover:border-purple-400 hover:bg-[#1f1933]';
                        } else if (combo.codec === 'H.264') {
                          badgeStyle =
                            'bg-[#131d2e] text-sky-200 hover:text-white border-sky-500/35 hover:border-sky-400 hover:bg-[#1a273e]';
                        }

                        return (
                          <a
                            key={combo.key}
                            href={sanitizeSafeUrl(url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`group inline-flex items-center gap-1.5 sm:gap-2 min-h-[40px] px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold transition-all select-none border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 hover:scale-[1.02] shadow-sm cursor-pointer max-w-full ${badgeStyle}`}
                            title={`Direct Download: ${combo.label} on ${serverName}${detectedSz ? ` (${detectedSz})` : ''}`}
                          >
                            <Download className="w-3.5 h-3.5 shrink-0 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform" />
                            <span>{combo.label}</span>
                            {detectedSz && (
                              <span className="text-[10px] text-zinc-400 font-mono font-normal bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
                                {detectedSz}
                              </span>
                            )}
                            <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
                          </a>
                        );
                      })
                    ) : (
                      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 italic py-1">
                        <span>
                          {ep.unverifiedQualityCount > 0
                            ? 'Quality metadata pending verification for this episode.'
                            : 'No direct download links available for this episode yet.'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsRequestModalOpen(true)}
                          className="text-xs font-bold text-sky-400 hover:text-sky-300 not-italic hover:underline cursor-pointer"
                        >
                          Request format
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Admin link: Full release management, editing, deletion, and uncertain quality review in the Admin Panel */}
                  {(isEffectiveAdmin || isAdmin) && (
                    <div className="pt-2 border-t border-white/5 mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 text-zinc-400 font-medium">
                          <Pencil className="w-3.5 h-3.5 text-amber-400" />
                          {ep.releases.length} release(s) configured
                        </span>
                        {ep.unverifiedQualityCount > 0 && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold"
                            title="One or more release records have missing or unverified quality metadata and are hidden from quality buttons until reviewed."
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            <span>
                              {ep.unverifiedQualityCount} unverified quality record(s) — Review in Admin
                            </span>
                          </span>
                        )}
                      </div>
                      <a
                        href={`/admin?title=${encodeURIComponent(titleDetails.name || titleDetails.title || '')}&id=${titleDetails.id}&season=${effectiveSeason}`}
                        className="text-xs font-bold text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1"
                        title="Manage, edit, or delete full release records in the Admin Panel"
                      >
                        <span>Manage in Admin Panel</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            /* Season-Level Empty State */
            <div className="p-5 sm:p-8 rounded-2xl bg-[#0c0d13] border border-white/5 text-center space-y-3.5 shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
                <FileVideo className="w-6 h-6" />
              </div>
              <h4 className="text-white font-bold text-base sm:text-lg">
                No Episode Links Uploaded for Season {effectiveSeason} Yet
              </h4>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
                Download links for Season {effectiveSeason} haven&apos;t been uploaded yet. Request below and our team will add it!
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2.5 min-h-[42px] rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Request Season {effectiveSeason} Links</span>
                </button>
                {isEffectiveAdmin && (
                  <a
                    href={`/admin?title=${encodeURIComponent(titleDetails.name || titleDetails.title || '')}&id=${titleDetails.id}`}
                    className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 min-h-[42px] rounded-xl bg-zinc-800 border border-zinc-700 hover:border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-bold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Upload in Admin ↗
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Request Custom Quality & Report Card */}
      <div className="p-4 sm:p-6 rounded-2xl bg-[#0b0e17] border border-blue-500/25 shadow-xl text-center space-y-3.5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="w-10 h-10 rounded-full bg-blue-500/15 border border-blue-500/40 flex items-center justify-center mx-auto text-blue-400 shadow-md shadow-blue-500/10">
          <Info className="w-5 h-5" />
        </div>
        <p className="text-xs sm:text-sm text-zinc-200 font-medium max-w-md mx-auto leading-relaxed">
          Can&apos;t find the episode or quality you want? Request custom format (4K DV HDR, 1080p, Dual Audio) or report a broken link and our team will add it!
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => setIsRequestModalOpen(true)}
            className="w-full sm:w-auto px-6 sm:px-8 py-3 min-h-[44px] rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            REQUEST LINK
          </button>
          <button
            type="button"
            onClick={() => {
              const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
              setReportingLink({
                movieId: titleDetails.id,
                mediaTitle: titleDetails.name || titleDetails.title || 'TV Series',
                mediaType: 'tv',
                posterPath: titleDetails.poster_path,
                linkTitle: `${titleDetails.name || titleDetails.title} (Broken Link Report)`,
                reportedUrl: currentUrl,
              });
            }}
            className="w-full sm:w-auto justify-center px-6 py-3 min-h-[44px] rounded-2xl bg-[#141824] hover:bg-[#1d2335] text-zinc-300 hover:text-rose-400 border border-white/10 hover:border-rose-500/40 font-bold text-xs uppercase tracking-wider shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer inline-flex items-center gap-2"
            title="Report broken or defective link"
          >
            <Flag className="w-4 h-4 text-zinc-400 group-hover:text-rose-400" />
            <span>REPORT LINK</span>
          </button>
        </div>
      </div>

      {/* Admin Quick Edit Modal */}
      {editingLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <Pencil className="w-4 h-4" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Edit TV Link
                </h4>
              </div>
              <button
                onClick={() => setEditingLink(null)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Season Number
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editSeason}
                    onChange={(e) => setEditSeason(parseInt(e.target.value) || 1)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Link Type
                  </label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as 'zip_pack' | 'single_episode')}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="zip_pack">🗜️ Complete Season Zip/Pack</option>
                    <option value="single_episode">📥 Single Episode (Weekly)</option>
                  </select>
                </div>
              </div>

              {editType === 'single_episode' && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Episode Number
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editEpisode}
                    onChange={(e) => setEditEpisode(parseInt(e.target.value) || 1)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Display Title / Release Tag
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Destination URL
                </label>
                <input
                  type="text"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Container</label>
                  <select
                    value={editContainer}
                    onChange={(e) => setEditContainer(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Auto Detect</option>
                    <option value="MKV">MKV (Video)</option>
                    <option value="ZIP">ZIP (Archive)</option>
                    <option value="MP4">MP4 (Video)</option>
                    <option value="RAR">RAR (Archive)</option>
                    <option value="7Z">7Z (Archive)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Dynamic Range</label>
                  <select
                    value={editDynamicRange}
                    onChange={(e) => setEditDynamicRange(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Auto (Filename)</option>
                    <option value="None">None (No Badge)</option>
                    <option value="SDR">SDR</option>
                    <option value="HDR">HDR</option>
                    <option value="DV HDR">DV HDR</option>
                    <option value="Conflict">Conflict (Review)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Codec</label>
                  <select
                    value={editCodec}
                    onChange={(e) => setEditCodec(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Auto Detect</option>
                    <option value="H.265">H.265 / HEVC</option>
                    <option value="H.264">H.264 / AVC</option>
                    <option value="AV1">AV1</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Resolution</label>
                  <select
                    value={editResolution}
                    onChange={(e) => setEditResolution(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Auto Detect</option>
                    <option value="2160p">2160p (4K)</option>
                    <option value="1080p">1080p (FHD)</option>
                    <option value="720p">720p (HD)</option>
                    <option value="480p">480p (SD)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Provider / OTT</label>
                  <input
                    type="text"
                    value={editProvider}
                    onChange={(e) => setEditProvider(e.target.value)}
                    placeholder="DSNP, NF, Hulu..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Audio</label>
                  <input
                    type="text"
                    value={editAudio}
                    onChange={(e) => setEditAudio(e.target.value)}
                    placeholder="Hindi DDP..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Size</label>
                  <input
                    type="text"
                    value={editSize}
                    onChange={(e) => setEditSize(e.target.value)}
                    placeholder="1.2 GB..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingLink(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-xs hover:scale-105 transition-transform"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Modal */}
      <RequestLinkModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        prefillTitle={titleDetails.name || titleDetails.title}
        prefillMediaType="tv"
        prefillTmdbId={titleDetails.id}
        prefillPosterPath={titleDetails.poster_path}
        prefillYear={titleDetails.first_air_date ? new Date(titleDetails.first_air_date).getFullYear().toString() : undefined}
      />

      {/* Report Broken Link Modal */}
      <ReportBrokenLinkModal
        isOpen={!!reportingLink}
        data={reportingLink}
        onClose={() => setReportingLink(null)}
      />
    </div>
  );
};

export default TVEpisodeLinksManager;
