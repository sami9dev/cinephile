'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Link2,
  ExternalLink,
  Trash2,
  Pencil,
  Tag,
  Globe,
  MessageSquare,
  Subtitles,
  Film,
  Download,
  Clock,
  Info,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Sparkles,
  FolderArchive,
} from 'lucide-react';
import { TitleDetails, CustomLink } from '@/types';
import { useWatchlist } from '@/context/WatchlistContext';
import {
  getConsolidatedCustomLinks,
  updateGlobalCustomLink,
  deleteGlobalCustomLink,
  getDeletedLinkIds,
} from '@/lib/curatedLinks';
import { parseFullMediaTitle, detectSize, stripWatermarks, getQualityWeight, extractFilenameFromUrl } from '@/lib/seasonParser';
import { parseReleaseDetails } from '@/lib/releaseParser';
import { detectServer } from '@/lib/serverDetector';
import { safeGetLocalStorage, safeSetLocalStorage, pruneCustomLinksCache } from '@/lib/safeStorage';
import { sanitizeSafeUrl } from '@/lib/security';
import TVEpisodeLinksManager from './TVEpisodeLinksManager';
import CollapsibleSection from './CollapsibleSection';

interface CustomLinksManagerProps {
  titleDetails: TitleDetails;
}

const CATEGORIES: CustomLink['category'][] = [
  'Streaming',
  'Download',
  'Discussion',
  'Subtitles',
  'Official',
  'Review',
];

function detectResolution(quality?: string, title?: string, url?: string): string {
  const urlFn = extractFilenameFromUrl(url);
  const cleanTitle = stripWatermarks(title || urlFn || '');
  const cleanQuality = stripWatermarks(quality || '');

  // 1. Check title first (title is the true source of truth for the media file)
  if (/(?:^|[\s._\-[\]()])(?:1080p|1080i|fhd)(?:[\s._\-[\]()]|$)/i.test(cleanTitle)) return '1080p';
  if (/(?:^|[\s._\-[\]()])(?:720p|720i|hd)(?:[\s._\-[\]()]|$)/i.test(cleanTitle)) return '720p';
  if (/(?:^|[\s._\-[\]()])(?:480p|480i|sd)(?:[\s._\-[\]()]|$)/i.test(cleanTitle)) return '480p';
  if (/(?:^|[\s._\-[\]()])(?:2160p|2160i|\buhd\b|\b4k\b)(?:[\s._\-[\]()]|$)/i.test(cleanTitle)) return '2160p';

  // 2. Fallback to quality hint if title had no resolution tag
  if (/(?:^|[\s._\-[\]()])(?:1080p|1080i|fhd)(?:[\s._\-[\]()]|$)/i.test(cleanQuality)) return '1080p';
  if (/(?:^|[\s._\-[\]()])(?:720p|720i|hd)(?:[\s._\-[\]()]|$)/i.test(cleanQuality)) return '720p';
  if (/(?:^|[\s._\-[\]()])(?:480p|480i|sd)(?:[\s._\-[\]()]|$)/i.test(cleanQuality)) return '480p';
  if (/(?:^|[\s._\-[\]()])(?:2160p|2160i|\buhd\b|\b4k\b)(?:[\s._\-[\]()]|$)/i.test(cleanQuality)) return '2160p';

  return '1080p';
}


function detectSource(title?: string, quality?: string): string {
  const combined = `${title || ''} ${quality || ''}`.toLowerCase();
  if (/remux/i.test(combined)) return 'BluRay';
  if (/bluray|blu-ray|bdrip/i.test(combined)) return 'BluRay';
  if (/web-dl|webdl|webrip|web/i.test(combined)) return 'WEB-DL';
  if (/hdtv/i.test(combined)) return 'HDTV';
  if (/dvd|dvdrip/i.test(combined)) return 'DVD';
  return 'WEB-DL';
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
  if (combined.includes('tamil') || combined.includes('tam')) list.push('Tamil');
  if (combined.includes('telugu') || combined.includes('tel')) list.push('Telugu');
  if (combined.includes('malayalam') || combined.includes('mal')) list.push('Malayalam');
  if (combined.includes('kannada') || combined.includes('kan')) list.push('Kannada');
  if (combined.includes('bengali') || combined.includes('ben')) list.push('Bengali');
  if (combined.includes('marathi') || combined.includes('mar')) list.push('Marathi');
  if (combined.includes('english') || combined.includes('eng')) list.push('English');
  if (combined.includes('japanese') || combined.includes('jap')) list.push('Japanese');
  if (combined.includes('korean') || combined.includes('kor')) list.push('Korean');
  if (combined.includes('spanish') || combined.includes('spa')) list.push('Spanish');
  if (combined.includes('french') || combined.includes('fre')) list.push('French');
  if (combined.includes('german') || combined.includes('ger')) list.push('German');

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

  return 'Hindi, English';
}


/**
 * Format movie download button label according to reference image:
 * e.g. "400mb 480p [HubCloud]", "1.5GB 720p [HubCloud]", "4GB 1080p [HubCloud]",
 * "3.5GB 1080p HEVC 10bit [HubCloud]", "8GB 1080p WebDL [HubCloud]",
 * "12GB 2160p SDR [HubCloud]", "16GB 2160p HDR [HubCloud]"
 * Renames GDTOT with HubCloud, GDFlix, or detected link server.
 */
export function formatMovieDownloadButtonTitle(link: CustomLink): string {
  const parsed = parseReleaseDetails(
    `${link.title || ''} ${link.quality || ''}`.trim(),
    link.url,
    link.manualOverrides
  );
  const urlFn = extractFilenameFromUrl(link.url);
  const cleanTitle = stripWatermarks(link.title || urlFn || '');
  const cleanQuality = stripWatermarks(link.quality || '');

  // 1. Detect Size:
  let size = link.manualOverrides?.size || link.size || detectSize(cleanTitle) || detectSize(urlFn) || detectSize(undefined, undefined, link.url) || detectSize(cleanQuality) || '';
  if (size) {
    size = size.replace(/\s+/g, '').trim();
    if (/^\d+mb$/i.test(size)) {
      size = size.toLowerCase();
    } else {
      size = size.replace(/gb/i, 'GB').replace(/mb/i, 'MB');
    }
  }

  // 2. Resolution:
  const resolution = parsed.resolution || '1080p';

  // 3. Parts:
  const parts: string[] = [];
  if (size) parts.push(size);
  parts.push(resolution);

  // 4. Dynamic Range & Codec: NEVER default to SDR!
  const dynTag = parsed.dynamicRange === 'DV HDR' ? 'DV HDR' :
                 parsed.dynamicRange === 'HDR' ? 'HDR' :
                 parsed.dynamicRange === 'SDR' ? 'SDR' :
                 parsed.dynamicRange === 'conflict' ? 'Conflict' : '';

  const codecTag = parsed.codec === 'H.265' ? 'H.265' :
                   parsed.codec === 'AV1' ? 'AV1' : '';

  if (dynTag && codecTag) {
    parts.push(`${dynTag} ${codecTag}`);
  } else if (dynTag) {
    parts.push(dynTag);
  } else if (codecTag) {
    if (parsed.bitDepth === '10bit' && resolution === '1080p') {
      parts.push('10bit HEVC');
    } else {
      parts.push(codecTag);
    }
  } else if (parsed.bitDepth === '10bit') {
    parts.push('10bit');
  }

  // Source (if REMUX, BluRay, etc.)
  if (parsed.source && parsed.source !== 'WEB-DL') {
    parts.push(parsed.source);
  }

  // Server detection:
  const server = detectServer(link.url);
  let serverName = parsed.provider || server.name || 'HubCloud';
  const urlLower = (link.url || '').toLowerCase();

  if (urlLower.includes('gdflix')) {
    serverName = 'GDFlix';
  } else if (urlLower.includes('hubcloud')) {
    serverName = 'HubCloud';
  } else if (urlLower.includes('hubdrive')) {
    serverName = 'HubDrive';
  } else if (urlLower.includes('katdrive')) {
    serverName = 'KatDrive';
  } else if (urlLower.includes('drivehub')) {
    serverName = 'DriveHub';
  } else if (urlLower.includes('drive.google') || urlLower.includes('google')) {
    serverName = 'GDrive';
  } else if (urlLower.includes('gdtot')) {
    serverName = 'HubCloud';
  }

  if (!serverName || serverName === 'Cloud Server' || serverName === 'Direct Server' || serverName === 'GDTot') {
    serverName = 'HubCloud';
  }

  return `${parts.join(' ')} [${serverName}]`;
}

interface MovieCardBadge {
  label: string;
  className: string;
}

interface MovieCardDetails {
  title: string;
  badges: MovieCardBadge[];
  subtext: string;
  accentBorder: string;
}

function formatMovieCardDetails(link: CustomLink, titleDetails: TitleDetails): MovieCardDetails {
  const parsed = parseReleaseDetails(
    `${link.title || ''} ${link.quality || ''}`.trim(),
    link.url,
    link.manualOverrides
  );
  const urlFn = extractFilenameFromUrl(link.url);
  const combined = `${link.title || ''} ${link.quality || ''} ${urlFn}`.trim();
  const lower = combined.toLowerCase();

  // 1. Resolution
  const resTag: '2160p' | '1080p' | '720p' | '480p' = (parsed.resolution as any) || '1080p';

  // 2. Source
  let sourceTag = parsed.source || '';
  const isIMAX = /imax/i.test(lower);
  const isOrg = /org\b|original/i.test(lower);

  if (/remux/i.test(lower)) {
    sourceTag = isIMAX ? 'IMAX REMUX' : 'REMUX';
  } else if (/bluray|blu-ray|bdrip/i.test(lower)) {
    if (isIMAX) sourceTag = 'IMAX BluRay';
    else if (isOrg) sourceTag = 'Org. BluRay';
    else sourceTag = 'BluRay';
  } else if (/uhd/i.test(lower)) {
    sourceTag = isIMAX ? 'IMAX UHD' : 'UHD';
  } else if (/web-dl|webdl|webrip|web/i.test(lower)) {
    sourceTag = isIMAX ? 'IMAX WEB-DL' : 'WEB-DL';
  } else if (/hdtv/i.test(lower)) {
    sourceTag = 'HDTV';
  } else {
    sourceTag = resTag === '2160p' ? 'UHD BluRay' : 'WEB-DL';
  }

  const baseBadgeClass = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-wider uppercase shadow-inner';
  const badgeStyles = {
    fhd: 'bg-[#0d2238] border border-cyan-500/40 text-cyan-300',
    hd: 'bg-[#0d2238] border border-sky-500/40 text-sky-300',
    tenBit: 'bg-[#121c2e] border border-blue-400/30 text-blue-300',
    hdr4k: 'bg-[#24133b] border border-purple-500/40 text-purple-200',
    dv4k: 'bg-[#2b123d] border border-purple-400/40 text-purple-200',
    sdr4k: 'bg-[#151a29] border border-slate-600/40 text-slate-300',
    sd: 'bg-zinc-800 border border-zinc-700 text-zinc-300',
    conflict: 'bg-amber-950 border border-amber-600/40 text-amber-200',
    container: 'bg-zinc-900 border border-zinc-700 text-zinc-300',
  };

  const badges: MovieCardBadge[] = [];
  let title = '';
  let accentBorder = 'border-l-4 border-l-[#1e293b]';
  const isHEVC = parsed.codec === 'H.265';

  if (resTag === '2160p') {
    if (parsed.dynamicRange === 'DV HDR') {
      title = isHEVC ? '2160p Dolby Vision HDR H.265' : '2160p Dolby Vision HDR';
      badges.push({ label: '4K · DV HDR', className: `${baseBadgeClass} ${badgeStyles.dv4k}` });
      accentBorder = 'border-l-4 border-l-violet-400';
    } else if (parsed.dynamicRange === 'HDR') {
      title = isHEVC ? '2160p HDR H.265' : '2160p HDR';
      badges.push({ label: '4K · HDR', className: `${baseBadgeClass} ${badgeStyles.hdr4k}` });
      accentBorder = 'border-l-4 border-l-purple-500';
    } else if (parsed.dynamicRange === 'SDR') {
      title = isHEVC ? '2160p SDR H.265' : '2160p SDR';
      badges.push({ label: '4K · SDR', className: `${baseBadgeClass} ${badgeStyles.sdr4k}` });
      accentBorder = 'border-l-4 border-l-blue-600';
    } else if (parsed.dynamicRange === 'conflict') {
      title = isHEVC ? '2160p [Conflict] H.265' : '2160p [Conflict]';
      badges.push({ label: '4K · CONFLICT', className: `${baseBadgeClass} ${badgeStyles.conflict}` });
      accentBorder = 'border-l-4 border-l-amber-500';
    } else {
      // Unknown / No HDR or SDR marker: NEVER DEFAULT TO SDR!
      title = isHEVC ? '2160p H.265' : '2160p UHD';
      badges.push({ label: '4K UHD', className: `${baseBadgeClass} ${badgeStyles.sdr4k}` });
      accentBorder = 'border-l-4 border-l-blue-600';
    }
  } else if (resTag === '1080p') {
    badges.push({ label: 'FULL HD', className: `${baseBadgeClass} ${badgeStyles.fhd}` });
    if (parsed.bitDepth === '10bit') {
      badges.push({ label: '10-BIT', className: `${baseBadgeClass} ${badgeStyles.tenBit}` });
    }

    if (parsed.dynamicRange === 'DV HDR') {
      title = isHEVC ? '1080p Dolby Vision HDR H.265' : '1080p Dolby Vision HDR';
      accentBorder = 'border-l-4 border-l-violet-400';
    } else if (parsed.dynamicRange === 'HDR') {
      title = isHEVC ? '1080p HDR H.265' : '1080p HDR';
      accentBorder = 'border-l-4 border-l-purple-500';
    } else if (parsed.dynamicRange === 'SDR') {
      title = isHEVC ? '1080p SDR H.265' : '1080p SDR';
      accentBorder = 'border-l-4 border-l-blue-400';
    } else if (parsed.dynamicRange === 'conflict') {
      title = '1080p [Conflict]';
      accentBorder = 'border-l-4 border-l-amber-500';
    } else if (parsed.bitDepth === '10bit' && isHEVC) {
      title = '1080p 10-bit HEVC';
      accentBorder = 'border-l-4 border-l-cyan-400';
    } else if (isHEVC) {
      title = '1080p H.265';
      accentBorder = 'border-l-4 border-l-blue-400';
    } else if (sourceTag.includes('BluRay')) {
      title = '1080p BluRay';
      accentBorder = 'border-l-4 border-l-blue-500';
    } else {
      title = `1080p ${sourceTag}`;
      accentBorder = 'border-l-4 border-l-sky-500';
    }
  } else if (resTag === '720p') {
    badges.push({ label: 'HD', className: `${baseBadgeClass} ${badgeStyles.hd}` });
    if (parsed.bitDepth === '10bit') {
      badges.push({ label: '10-BIT', className: `${baseBadgeClass} ${badgeStyles.tenBit}` });
    }
    if (parsed.dynamicRange === 'DV HDR') {
      title = '720p DV HDR';
    } else if (parsed.dynamicRange === 'HDR') {
      title = '720p HDR';
    } else if (parsed.dynamicRange === 'SDR') {
      title = '720p SDR';
    } else if (parsed.bitDepth === '10bit' && isHEVC) {
      title = '720p 10-bit HEVC';
    } else if (isHEVC) {
      title = '720p HEVC';
    } else if (sourceTag.includes('BluRay')) {
      title = '720p BluRay';
    } else {
      title = `720p ${sourceTag}`;
    }
    accentBorder = 'border-l-4 border-l-cyan-400';
  } else {
    badges.push({ label: 'SD', className: `${baseBadgeClass} ${badgeStyles.sd}` });
    title = `480p ${sourceTag}`;
    accentBorder = 'border-l-4 border-l-zinc-500';
  }

  // Add container badge if archive
  if (parsed.containerLabel && parsed.container !== 'UNKNOWN' && parsed.container !== 'MKV') {
    badges.push({ label: parsed.containerLabel, className: `${baseBadgeClass} ${badgeStyles.container}` });
  }

  const has60fps = /60fps|60\s*fps/i.test(lower);
  const is10Bit = parsed.bitDepth === '10bit' || /10bit|10-bit/i.test(lower);
  const hasDV = parsed.dynamicRange === 'DV HDR';
  const hasHDR = parsed.dynamicRange === 'HDR' || hasDV;
  const isX264 = parsed.codec === 'H.264' || /x264|h\.?264|avc/i.test(lower);
  const hasHDR10Plus = /hdr10\+|hdr10plus/i.test(lower);

  const subtextParts: string[] = [];
  if (has60fps) {
    subtextParts.push('60 FPS');
  } else if (isHEVC && resTag === '1080p' && (is10Bit || lower.includes('efficient'))) {
    subtextParts.push('Efficient encode');
  } else if (is10Bit || resTag === '2160p' || hasHDR || hasDV) {
    subtextParts.push('10-bit');
  } else if (isX264 || lower.includes('8bit') || lower.includes('8-bit')) {
    subtextParts.push('8-bit');
  }

  if (hasHDR10Plus) {
    subtextParts.push('HDR10+');
  } else if (isX264 && !title.toLowerCase().includes('x264')) {
    subtextParts.push('x264');
  }

  if (sourceTag) {
    if (title.toLowerCase().includes(sourceTag.toLowerCase())) {
      // omit if already in title
    } else {
      if (sourceTag === 'BluRay' && lower.includes('x265')) {
        subtextParts.push('BluRay x265');
      } else {
        subtextParts.push(sourceTag);
      }
    }
  }

  const audio = formatAudioLanguages(link.audioLanguage, combined);
  if (audio) subtextParts.push(audio);

  const server = detectServer(link.url);
  let serverName = server.name || 'HubCloud';
  const urlLower = (link.url || '').toLowerCase();
  if (urlLower.includes('gdflix')) serverName = 'GDFlix';
  else if (urlLower.includes('hubcloud')) serverName = 'HubCloud';
  else if (urlLower.includes('hubdrive')) serverName = 'HubDrive';
  else if (urlLower.includes('katdrive')) serverName = 'KatDrive';
  else if (urlLower.includes('drivehub')) serverName = 'DriveHub';
  else if (urlLower.includes('drive.google') || urlLower.includes('google')) serverName = 'GDrive';
  else if (urlLower.includes('gdtot')) serverName = 'HubCloud';
  if (!serverName || serverName === 'Cloud Server' || serverName === 'Direct Server' || serverName === 'GDTot') {
    serverName = 'HubCloud';
  }
  subtextParts.push(serverName);

  const size = link.size || detectSize(link.title) || detectSize(undefined, undefined, link.url);
  if (size && !subtextParts.includes(size)) {
    subtextParts.push(size);
  }

  return {
    title,
    badges,
    subtext: subtextParts.join(' · '),
    accentBorder,
  };
}

function formatReleaseTitle(custom: CustomLink, titleDetails: TitleDetails): string {
  const urlFn = extractFilenameFromUrl(custom.url);
  const raw = (custom.title || urlFn || '').trim();
  const movieName = titleDetails.title || titleDetails.name || '';
  const movieYear = (titleDetails.release_date || titleDetails.first_air_date || '').slice(0, 4);

  // If the title or URL filename is already in authentic release format:
  const candidate = (custom.title && custom.title.includes('.')) ? custom.title : (urlFn || custom.title || '');
  const isAlreadyFullRelease =
    (movieName && candidate.toLowerCase().includes(movieName.toLowerCase()) && /(?:1080p|2160p|720p|bluray|remux|hevc|web-dl|x265|x264|ddp|dd\s*5|dts|atmos|truehd)/i.test(candidate)) ||
    /\.(?:mkv|mp4|avi)\b/i.test(candidate) ||
    (/\b(19\d\d|20\d\d)\b/.test(candidate) && /(?:bluray|remux|web-dl|hevc|x265|x264)/i.test(candidate));

  if (isAlreadyFullRelease && candidate.length >= 15) {
    return stripWatermarks(candidate);
  }

  // Synthesize scene release format matching reference screenshot:
  // e.g. "Black Widow (2021) IMAX 1080p 10bit Bluray x265 HEVC [Org DD 5.1 Hindi + DD 5.1 English] MSubs ~ TombDoc.mkv"
  let cleanQuality = (custom.quality || '')
    .replace(/•/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanQuality || cleanQuality.length < 3) {
    cleanQuality = 'IMAX 1080p 10bit Bluray x265 HEVC';
  } else if (!/bluray|remux|web-dl|webrip|hdtv/i.test(cleanQuality)) {
    cleanQuality = `${cleanQuality} Bluray x265 HEVC`;
  }

  let cleanAudio = (custom.audioLanguage || '')
    .replace(/•/g, '+')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanAudio || cleanAudio.length < 3) {
    cleanAudio = 'Org DD 5.1 Hindi + DD 5.1 English';
  }

  const audioPart = cleanAudio.startsWith('[') && cleanAudio.endsWith(']') ? cleanAudio : `[${cleanAudio}]`;
  const yearPart = movieYear ? `(${movieYear})` : '';

  return `${movieName} ${yearPart} ${cleanQuality} ${audioPart} MSubs ~ CineFuel.mkv`.replace(/\s+/g, ' ').trim();
}

export const CustomLinksManager: React.FC<CustomLinksManagerProps> = ({ titleDetails }) => {
  const { watchlist, removeCustomLink, isMounted, settings } = useWatchlist();
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('All');
  const [linksRefresh, setLinksRefresh] = useState(0);

  // Edit Modal State
  const [editingLink, setEditingLink] = useState<CustomLink | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editCategory, setEditCategory] = useState<CustomLink['category']>('Streaming');
  const [editQuality, setEditQuality] = useState('');
  const [editAudio, setEditAudio] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editContainer, setEditContainer] = useState('');
  const [editDynamicRange, setEditDynamicRange] = useState('');
  const [editCodec, setEditCodec] = useState('');
  const [editResolution, setEditResolution] = useState('');
  const [editProvider, setEditProvider] = useState('');

  const [isAdmin, setIsAdmin] = useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const token =
        sessionStorage.getItem('cinefuel_admin_token') ||
        localStorage.getItem('cinefuel_admin_token') ||
        localStorage.getItem('cinefuel_id_token') ||
        '';
      setIsAdmin(Boolean(token));
    }
  }, [isMounted]);

  const [liveServerLinks, setLiveServerLinks] = useState<CustomLink[]>([]);

  // Listen to cross-app link updates to immediately refresh links
  React.useEffect(() => {
    let active = true;

    const fetchLiveLinks = async () => {
      try {
        const res = await fetch(`/api/curated-links?movieId=${titleDetails.id}&_t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data.links)) {
            setLiveServerLinks(data.links);
            try {
              const stored = safeGetLocalStorage('cinefuel_custom_links');
              const parsed = stored ? JSON.parse(stored) : {};
              parsed[String(titleDetails.id)] = data.links;
              safeSetLocalStorage('cinefuel_custom_links', JSON.stringify(pruneCustomLinksCache(parsed)));
            } catch {}
          }
        }
      } catch {}
    };

    fetchLiveLinks();

    const handleLinksUpdated = () => {
      setLinksRefresh((v) => v + 1);
      fetchLiveLinks();
    };
    window.addEventListener('cinefuel_links_updated', handleLinksUpdated);
    return () => {
      active = false;
      window.removeEventListener('cinefuel_links_updated', handleLinksUpdated);
    };
  }, [titleDetails.id]);

  // Consolidated Custom Links (Authoritative Live Cloud Server Links)
  const userCustomLinks = useMemo(() => {
    if (!isMounted) return [];
    const linkMap = new Map<string, CustomLink>();
    const deletedIds = getDeletedLinkIds();

    // 1. Live Server Links (authoritative source of truth)
    liveServerLinks.forEach((l) => {
      if (!deletedIds.has(l.id)) {
        linkMap.set(l.id || l.url, l);
      }
    });

    // 2. If live server links have not loaded yet, fallback to local storage
    if (liveServerLinks.length === 0) {
      const local = getConsolidatedCustomLinks(titleDetails.id);
      local.forEach((l) => {
        if (!deletedIds.has(l.id)) {
          linkMap.set(l.id || l.url, l);
        }
      });
    }

    return Array.from(linkMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [titleDetails.id, isMounted, linksRefresh, liveServerLinks]);

  const mediaType: 'movie' | 'tv' =
    titleDetails.media_type === 'tv'
      ? 'tv'
      : titleDetails.media_type === 'movie'
      ? 'movie'
      : (titleDetails.number_of_seasons && titleDetails.number_of_seasons > 0) || (titleDetails.name && !titleDetails.title)
      ? 'tv'
      : 'movie';

  // Filter links: for TV shows, episode links are already organized in TVEpisodeLinksManager
  const nonEpisodeLinks = useMemo(() => {
    if (mediaType !== 'tv') return userCustomLinks;
    return userCustomLinks.filter(
      (l) => l.category !== 'SingleEpisode' && l.category !== 'ZipPack' && l.linkType !== 'single_episode' && l.linkType !== 'zip_pack'
    );
  }, [userCustomLinks, mediaType]);

  const displayLinks = mediaType === 'tv' ? nonEpisodeLinks : userCustomLinks;

  // Filter links by category
  const filteredCustomLinks = useMemo(() => {
    if (activeCategoryFilter === 'All') return displayLinks;
    if (activeCategoryFilter === 'Recent') {
      const now = new Date().getTime();
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
      return displayLinks.filter(
        (l) => new Date(l.createdAt).getTime() > threeDaysAgo
      );
    }
    return displayLinks.filter((l) => l.category === activeCategoryFilter);
  }, [displayLinks, activeCategoryFilter]);

  // Group links by quality to calculate mirror index (e.g. 1080p -> Server 1, Server 2)
  const qualityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredCustomLinks.forEach(link => {
      const key = detectResolution(link.quality, link.title, link.url);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [filteredCustomLinks]);

  // Sorted movie links: ascending resolution (480p -> 720p -> 1080p -> 2160p) and size
  // matching reference image media_1790851187635.jpg
  const sortedMovieLinks = useMemo(() => {
    const list = [...filteredCustomLinks];

    const getResRank = (l: CustomLink): number => {
      const urlFn = extractFilenameFromUrl(l.url);
      const c = `${stripWatermarks(l.title || urlFn || '')} ${stripWatermarks(l.quality || '')} ${urlFn}`.toLowerCase();
      if (/(?:2160p|2160i|\buhd\b|\b4k\b)/i.test(c)) return 4;
      if (/(?:1080p|1080i|fhd)/i.test(c)) return 3;
      if (/(?:720p|720i|hd)/i.test(c)) return 2;
      if (/(?:480p|480i|sd)/i.test(c)) return 1;
      return 3;
    };

    const getSizeMB = (l: CustomLink): number => {
      const urlFn = extractFilenameFromUrl(l.url);
      const raw = l.size || detectSize(l.title) || detectSize(urlFn) || detectSize(undefined, undefined, l.url) || '';
      const m = raw.match(/([\d.]+)\s*(gb|mb)/i);
      if (!m) return 0;
      const v = parseFloat(m[1]);
      return m[2].toLowerCase() === 'gb' ? v * 1024 : v;
    };

    list.sort((a, b) => {
      const rankDiff = getResRank(a) - getResRank(b);
      if (rankDiff !== 0) return rankDiff;
      return getSizeMB(a) - getSizeMB(b);
    });

    return list;
  }, [filteredCustomLinks]);

  const existing = isMounted ? watchlist.find((w) => w.id === titleDetails.id) : undefined;
  const imdbId = titleDetails.external_ids?.imdb_id;
  const tmdbId = titleDetails.id;
  const titleName = titleDetails.title || titleDetails.name || 'Title';
  const releaseYear = (titleDetails.release_date || titleDetails.first_air_date || '').split('-')[0];
  const queryName = `${titleName} ${releaseYear}`.trim();

  const handleStartEdit = (link: CustomLink) => {
    const parsed = parseReleaseDetails(link.title, link.url, link.manualOverrides);
    setEditingLink(link);
    setEditTitle(link.title);
    setEditUrl(link.url);
    setEditCategory(link.category || 'Streaming');
    setEditQuality(link.manualOverrides?.resolution || link.quality || parsed.resolution || '');
    setEditAudio(link.manualOverrides?.audioLanguage || link.audioLanguage || parsed.audioLabel || '');
    setEditSize(link.manualOverrides?.size || link.size || '');
    setEditContainer(link.manualOverrides?.container || (parsed.container !== 'UNKNOWN' ? parsed.container : '') || '');
    setEditDynamicRange(link.manualOverrides?.dynamicRange || (parsed.dynamicRange === 'conflict' ? 'Conflict' : (parsed.dynamicRangeLabel || '')) || '');
    setEditCodec(link.manualOverrides?.codec || parsed.codec || '');
    setEditResolution(link.manualOverrides?.resolution || parsed.resolution || '');
    setEditProvider(link.manualOverrides?.provider || parsed.provider || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLink || !editTitle.trim() || !editUrl.trim()) return;

    let finalUrl = editUrl.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`;
    }

    const manualOverrides: CustomLink['manualOverrides'] = {
      ...editingLink.manualOverrides,
      container: editContainer || undefined,
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
      category: editCategory,
      seasonNumber: parsed.seasonNumber || editingLink.seasonNumber,
      episodeNumber: parsed.episodeNumber !== undefined ? parsed.episodeNumber : editingLink.episodeNumber,
      linkType: parsed.isPack ? 'zip_pack' : (parsed.episodeNumber ? 'single_episode' : editingLink.linkType),
      quality: editQuality.trim() || parsed.resolution || editingLink.quality,
      audioLanguage: editAudio.trim() || parsed.audioLabel || editingLink.audioLanguage,
      size: editSize.trim() || editingLink.size,
      manualOverrides,
    };

    updateGlobalCustomLink(titleDetails.id, updatedLink);
    setEditingLink(null);
    setLinksRefresh((v) => v + 1);
  };

  const handleDelete = async (linkId: string) => {
    if (confirm('Delete this custom link permanently?')) {
      setLiveServerLinks((prev) => prev.filter((l) => l.id !== linkId));
      removeCustomLink(titleDetails.id, linkId);
      setLinksRefresh((v) => v + 1);
      await deleteGlobalCustomLink(titleDetails.id, linkId);
    }
  };

  const getCategoryIcon = (cat: CustomLink['category']) => {
    switch (cat) {
      case 'Recent':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'Streaming':
        return <Film className="w-4 h-4 text-red-400" />;
      case 'Subtitles':
        return <Subtitles className="w-4 h-4 text-sky-400" />;
      case 'Discussion':
        return <MessageSquare className="w-4 h-4 text-amber-400" />;
      case 'Download':
        return <Download className="w-4 h-4 text-emerald-400" />;
      case 'Review':
        return <Tag className="w-4 h-4 text-purple-400" />;
      case 'Official':
        return <Globe className="w-4 h-4 text-sky-400" />;
      default:
        return <Link2 className="w-4 h-4 text-amber-400" />;
    }
  };

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return 'Recently';
    try {
      const now = new Date().getTime();
      const diff = now - new Date(dateStr).getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours < 1) return 'Just now';
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return 'Added';
    }
  };

  const totalLinkCount = userCustomLinks.length;

  return (
    <CollapsibleSection
      title={
        mediaType === 'tv' ? (
          <div className="flex flex-col text-left">
            <span className="text-sm sm:text-base font-bold text-white leading-tight">Season &amp; Episode</span>
            <span className="text-sm sm:text-base font-bold text-white leading-tight">Vault</span>
          </div>
        ) : (
          <div className="flex flex-col text-left">
            <span className="text-sm sm:text-base font-bold text-white leading-tight">Movie Downloads</span>
            <span className="text-sm sm:text-base font-bold text-white leading-tight">Vault</span>
          </div>
        )
      }
      icon={<FolderArchive className="w-5 h-5 text-amber-500" />}
      subtitle={
        mediaType === 'tv'
          ? 'Auto-arranged seasons, batch zip archives, and weekly single episode releases.'
          : 'High-speed cloud downloads across 480p, 720p, 1080p, and 2160p 4K qualities.'
      }
      badge={`${totalLinkCount} FILES`}
      defaultOpen={true}
    >
      {/* TV Series Season & Episode Vault */}
      {mediaType === 'tv' && (
        <TVEpisodeLinksManager
          titleDetails={titleDetails}
          customLinks={userCustomLinks}
          isAdmin={isAdmin}
          onLinkAdded={() => setLinksRefresh((v) => v + 1)}
        />
      )}

      {/* User Custom Attached Links with Category Filters & Admin Edit/Delete (Shown for movies, or TV series with extra general links) */}
      {(mediaType !== 'tv' || nonEpisodeLinks.length > 0) && (
        <div className={`space-y-4 ${mediaType === 'tv' ? 'pt-4 border-t border-zinc-800/70' : ''}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              <span>Custom Saved Links ({displayLinks.length})</span>
            </h4>

            {/* Category Filter Pills */}
            {displayLinks.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
                <button
                  onClick={() => setActiveCategoryFilter('All')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    activeCategoryFilter === 'All'
                      ? 'bg-amber-500 text-black shadow-sm'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                  suppressHydrationWarning
                >
                  All ({displayLinks.length})
                </button>

                <button
                  onClick={() => setActiveCategoryFilter('Recent')}
                  className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-all ${
                    activeCategoryFilter === 'Recent'
                      ? 'bg-amber-500 text-black shadow-sm'
                      : 'bg-zinc-900 text-amber-400/90 hover:text-amber-300 border border-amber-500/20'
                  }`}
                  suppressHydrationWarning
                >
                  <Clock className="w-3 h-3" /> Recent
                </button>

                {CATEGORIES.filter((c) => c !== 'Recent').map((cat) => {
                  const count = displayLinks.filter((l) => l.category === cat).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategoryFilter(cat)}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                        activeCategoryFilter === cat
                          ? 'bg-amber-500 text-black shadow-sm'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                      }`}
                      suppressHydrationWarning
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        {sortedMovieLinks.length > 0 ? (
          <div className="space-y-3.5 min-w-0 max-w-full">
            {/* Movie Header Card matching media_1790874784319.png */}
            <div className="rounded-2xl bg-[#0c1020]/95 border border-[#1e293b]/80 p-3.5 sm:p-5 flex items-center gap-3.5 shadow-xl min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg sm:text-2xl shadow-lg shadow-blue-500/25 shrink-0">
                {(titleDetails.title || titleDetails.name || 'M').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-wide truncate">
                  {titleDetails.title || titleDetails.name || 'Movie'}
                </h3>
                <p className="text-xs sm:text-sm text-zinc-400 font-medium">
                  Pick the best match for your screen
                </p>
              </div>
            </div>

            {/* Stack of Movie Download Cards (Reference: media_1790874784319.png) */}
            <div className="space-y-3 pt-1 min-w-0">
              {sortedMovieLinks.map((link, idx) => {
                const card = formatMovieCardDetails(link, titleDetails);

                return (
                  <div key={link.id || idx} className="relative group min-w-0">
                    <a
                      href={sanitizeSafeUrl(link.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block rounded-2xl bg-[#0c1020]/95 hover:bg-[#11172e] border border-[#1e293b]/80 ${card.accentBorder} hover:border-blue-500/50 p-3.5 sm:p-5 transition-all duration-200 shadow-md hover:shadow-blue-500/10 cursor-pointer select-none min-w-0`}
                      title={`Download ${card.title}`}
                    >
                      <div className="flex items-start justify-between gap-2.5 sm:gap-3 min-w-0">
                        <div className="space-y-1.5 min-w-0 flex-1 text-left">
                          {/* Top Row: Title + Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 min-w-0">
                            <span className="font-bold text-white text-sm sm:text-lg tracking-wide group-hover:text-blue-300 transition-colors break-words min-w-0">
                              {card.title}
                            </span>
                            {card.badges.map((b, bIdx) => (
                              <span key={bIdx} className={b.className}>
                                {b.label}
                              </span>
                            ))}
                          </div>

                          {/* Bottom Row: Subtext meta line */}
                          <p className="text-xs text-zinc-400 font-medium flex flex-wrap items-center gap-1.5 break-words">
                            {card.subtext}
                          </p>
                        </div>

                                                {/* Admin Controls (Only visible to admin) */}
                        {isAdmin && (
                          <div
                            className="flex items-center gap-1.5 shrink-0 self-start"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleStartEdit(link);
                              }}
                              className="p-2 sm:p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 transition-colors cursor-pointer"
                              title="Admin: Edit link"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDelete(link.id);
                              }}
                              className="p-2 sm:p-2.5 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-400 border border-rose-900/50 transition-colors cursor-pointer"
                              title="Admin: Delete link"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center space-y-1.5">
            <p className="text-xs text-zinc-300 font-medium">No custom links available yet for this title.</p>
            <p className="text-[11px] text-zinc-500">Need a streaming or download link? Click &quot;Request Link&quot; below and our team will add it!</p>
          </div>
        )}

        </div>
        )}

      {/* Edit Custom Link Modal (Admin Only) */}
      {isAdmin && editingLink && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#11141d] border border-amber-500/40 rounded-3xl p-4 sm:p-7 max-w-lg max-h-[90vh] overflow-y-auto w-full space-y-4 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Edit Custom Link
                </h4>
              </div>
              <button
                onClick={() => setEditingLink(null)}
                className="text-zinc-400 hover:text-white text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-semibold text-zinc-300 block mb-1">
                  Title / Label
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-300 block mb-1">
                  Destination URL
                </label>
                <input
                  type="text"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-300 block mb-1.5">
                  Category Tag
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setEditCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        editCategory === cat
                          ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                          : 'bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Quality</label>
                  <input
                    type="text"
                    placeholder="e.g. 1080p, 4K"
                    value={editQuality}
                    onChange={(e) => setEditQuality(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Audio</label>
                  <input
                    type="text"
                    placeholder="e.g. Hindi, English"
                    value={editAudio}
                    onChange={(e) => setEditAudio(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Size</label>
                  <input
                    type="text"
                    placeholder="e.g. 1.2 GB"
                    value={editSize}
                    onChange={(e) => setEditSize(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-zinc-800/80">
                <div>
                  <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Container</label>
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
                  <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Dynamic Range</label>
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
                  <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Codec</label>
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
                  <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Resolution</label>
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

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingLink(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow-md hover:scale-105"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      
    </CollapsibleSection>
  );
};

export default CustomLinksManager;
