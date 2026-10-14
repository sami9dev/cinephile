'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, Film, Tv, Play, Clock } from 'lucide-react';
import { TitleDetails } from '@/types';
import { getImageURL } from '@/lib/tmdb';
import { detectShowPlatform } from '@/lib/seasonParser';

interface MovieCardProps {
  item: TitleDetails;
  priority?: boolean;
  aspect?: 'portrait' | 'landscape';
  isLcp?: boolean;
}

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    if (isNaN(diffMs) || diffMs < 0) return '';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays} days ago`;
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} mo ago`;
  } catch {
    return '';
  }
}

const HOLLYWOOD_REGEX =
  /(?:marvel|avenger|spider[- ]*man|spiderman|iron[- ]*man|thor|captain\s*america|captain\s*marvel|black\s*widow|ant[- ]*man|antman|doctor\s*strange|black\s*panther|guardians\s*of\s*the\s*galaxy|deadpool|wolverine|x[- ]*men|eternals|shang[- ]*chi|loki|hawkeye|daredevil|punisher|batman|superman|justice\s*league|wonder\s*woman|aquaman|flash|joker|harley\s*quinn|shazam|lanterns|star\s*wars|avatar|jurassic|fast\s*(?:and|&)\s*furious|mission:?\s*impossible|transformers?|harry\s*potter|fantastic\s*beasts|lord\s*of\s*the\s*rings|hobbit|game\s*of\s*thrones|house\s*of\s*the\s*dragon|stranger\s*things|godzilla|kong|john\s*wick|dune|oppenheimer|interstellar|inception|matrix|terminator|gladiator|alien|predator|blade\s*runner|mad\s*max|planet\s*of\s*the\s*apes|fallout|the\s*boys|reacher|jack\s*ryan|witcher|halo|peaky\s*blinders|walking\s*dead|american\s*primeval|squid\s*game|toy\s*story|pixar|disney)/i;

const ENGLISH_OR_DUAL_REGEX =
  /(?:dual|multi|english|eng|\+\s*eng|eng\s*\+|org\s*eng|atmos|truehd)/i;

export const MovieCard: React.FC<MovieCardProps> = ({
  item,
  priority = false,
  aspect = 'portrait',
  isLcp = false,
}) => {
  const mediaType: 'movie' | 'tv' =
    item.media_type === 'tv'
      ? 'tv'
      : item.media_type === 'movie'
      ? 'movie'
      : (item.number_of_seasons && item.number_of_seasons > 0) || (item.name && !item.title)
      ? 'tv'
      : 'movie';
  const title = item.title || item.name || 'Untitled';
  const releaseDate = item.release_date || item.first_air_date || '';
  const year = releaseDate ? releaseDate.split('-')[0] : '';

  const isLandscape = aspect === 'landscape';
  const hasValidBackdrop = typeof item.backdrop_path === 'string' &&
    !item.backdrop_path.includes('placeholder') &&
    item.backdrop_path !== 'undefined' &&
    item.backdrop_path !== 'null';
  const hasValidPoster = typeof item.poster_path === 'string' &&
    !item.poster_path.includes('placeholder') &&
    item.poster_path !== 'undefined' &&
    item.poster_path !== 'null';
  
  const chosenPath = isLandscape
    ? (hasValidBackdrop ? item.backdrop_path : hasValidPoster ? item.poster_path : null)
    : (hasValidPoster ? item.poster_path : hasValidBackdrop ? item.backdrop_path : null);

  const fallbackUrl = isLandscape ? '/placeholder-backdrop.svg' : '/placeholder-poster.svg';
  const computedPosterUrl = chosenPath
    ? getImageURL(chosenPath, isLandscape ? 'w500' : 'w300')
    : fallbackUrl;

  const [imgSrc, setImgSrc] = React.useState(computedPosterUrl);

  React.useEffect(() => {
    setImgSrc(computedPosterUrl);
  }, [computedPosterUrl]);

  // Upload metadata sensing (DV, 4K, Platform, Category, Size)
  const uploadMeta = item.uploadMeta || {};
  const is4k =
    uploadMeta.is4k ||
    (item as any).qualities?.includes('4K UHD') ||
    (item as any).qualities?.includes('4K');
  const is1080p = uploadMeta.is1080p || (item as any).qualities?.includes('1080p');
  const isDV =
    uploadMeta.isDV ||
    (item as any).qualities?.some((q: string) => /dv|dolby\s*vision/i.test(q));
  const isHDR =
    uploadMeta.isHDR ||
    (item as any).qualities?.some((q: string) => /hdr/i.test(q));
  const isBluRay =
    uploadMeta.isBluRay ||
    (item as any).qualities?.includes('REMUX') ||
    (item as any).qualities?.includes('BluRay');

  // Platform
  const detectedPlat = detectShowPlatform(
    `${uploadMeta.rawTitle || ''} ${item.title || ''} ${item.name || ''}`,
    item
  );
  let platform = detectedPlat || (uploadMeta.platform !== 'TV' && uploadMeta.platform !== 'MOVIE' ? uploadMeta.platform : '');
  if (!platform) {
    platform = mediaType === 'tv' ? 'TV' : 'MOVIE';
  } else if (mediaType === 'movie' && platform === 'TV') {
    platform = 'MOVIE';
  }

  // Category resolution: TV titles are always branded as 'TV SERIES', movies show movie categories
  let category = uploadMeta.category;
  if (mediaType === 'tv') {
    category = 'TV SERIES';
  } else {
    // For movies, strip any stale TV series or episode categories
    if (category === 'TV SERIES' || category === 'ENGLISH TV SERIES' || category === 'HINDI TV SHOWS' || category === 'SOUTH TV SHOWS' || category === 'SingleEpisode' || category === 'ZipPack') {
      category = '';
    }
    const origLang = (item.original_language || (item as any).originalLanguage || '').toLowerCase().trim();
    const origCountry: string[] = Array.isArray((item as any).origin_country)
      ? (item as any).origin_country
      : Array.isArray((item as any).originCountry)
      ? (item as any).originCountry
      : [];
    const titleCombined = `${item.title || ''} ${item.name || ''} ${item.original_title || ''} ${item.original_name || ''} ${uploadMeta.rawTitle || ''}`.toLowerCase();

    const isHollywood =
      origLang === 'en' ||
      origCountry.some((c: string) => ['US', 'GB', 'CA', 'AU', 'NZ'].includes(c)) ||
      HOLLYWOOD_REGEX.test(titleCombined);

    const hasEnglishOrDual = ENGLISH_OR_DUAL_REGEX.test(
      `${uploadMeta.rawTitle || ''} ${(item as any).audioLanguage || ''}`
    );

    // Guardrail: Hollywood productions with Hindi dub audio should NEVER be categorized as BOLLYWOOD
    if (isHollywood || hasEnglishOrDual) {
      category = 'HOLLYWOOD';
    } else if (!category || category === 'BOLLYWOOD' || category === 'HINDI TV SHOWS') {
      if (origLang === 'hi' || origCountry.includes('IN')) {
        category = 'BOLLYWOOD';
      } else if (['te', 'ta', 'ml', 'kn'].includes(origLang)) {
        category = 'SOUTH INDIAN';
      } else if (origLang === 'ja') {
        category = 'ANIME';
      } else if (origLang === 'ko') {
        category = 'KOREAN';
      } else if (origLang === 'en') {
        category = 'HOLLYWOOD';
      } else if (/(?:bollywood|hindi\s*movie|desiremovies|bollyflix|vegamovies|katmoviehd)/i.test(titleCombined)) {
        category = 'BOLLYWOOD';
      } else {
        category = 'HOLLYWOOD';
      }
    }
  }

  // Size
  const size = uploadMeta.size || (item as any).size || '';

  // Time ago
  const timeAgo = formatTimeAgo(uploadMeta.createdAt);

  // Status text
  const statusText =
    uploadMeta.statusText ||
    (mediaType === 'tv'
      ? item.status === 'Ended'
        ? 'COMPLETED'
        : 'ON'
      : 'MOVIE');

  // Landscape Mode (Matching Reference Screenshot Aspect Ratio & Badges)
  if (isLandscape) {
    return (
      <div className={`group relative flex flex-col rounded-2xl bg-[#12101c] border border-[#252038] hover:border-amber-400/50 overflow-hidden cursor-pointer select-none transition-all duration-300 shadow-md hover:shadow-2xl hover:shadow-purple-950/20 ${!priority ? '[content-visibility:auto] [contain-intrinsic-size:240px]' : ''}`}>
        {/* 16:9 Landscape Poster Image Container */}
        <Link
          href={`/${mediaType}/${item.id}`}
          prefetch={false}
          className="relative aspect-[16/9] w-full overflow-hidden bg-[#181524] block"
        >
          <Image
            src={imgSrc}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            priority={priority}
            fetchPriority={isLcp ? 'high' : undefined}
            onError={() => setImgSrc(fallbackUrl)}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />

          {/* Branded fallback overlay if no remote image exists */}
          {Boolean(imgSrc && typeof imgSrc === 'string' && imgSrc.includes('placeholder')) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-zinc-950/75 backdrop-blur-[2px] z-[5]">
              {mediaType === 'tv' ? (
                <Tv className="w-8 h-8 text-indigo-400 mb-1.5" />
              ) : (
                <Film className="w-8 h-8 text-amber-400/90 mb-1.5" />
              )}
              <span className="text-sm font-bold text-zinc-100 line-clamp-1 px-3 tracking-wide">{title}</span>
              <span className="text-[11px] font-medium text-zinc-400 mt-0.5">
                {year && /^\d{4}$/.test(year) ? year : (mediaType === 'tv' ? 'TV Series' : 'Feature Film')}
              </span>
            </div>
          )}

          {/* Top Gradient for badge legibility */}
          <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/85 via-black/35 to-transparent pointer-events-none z-10" />

          {/* Bottom Gradient for category & size legibility */}
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none z-10" />

          {/* Badges Top Left (4K / DV / HDR / 1080p / BluRay) */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1 z-20">
            {is4k && (
              <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-black text-[10px] tracking-wide shadow-md">
                4K
              </span>
            )}
            {isDV && (
              <span className="px-2 py-0.5 rounded bg-black/75 backdrop-blur-sm text-white font-bold text-[10px] tracking-wide border border-white/15 shadow-md">
                DV
              </span>
            )}
            {!isDV && isHDR && (
              <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] tracking-wide shadow-md">
                HDR
              </span>
            )}
            {!is4k && is1080p && (
              <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-black text-[10px] tracking-wide shadow-md">
                1080p
              </span>
            )}
            {isBluRay && (
              <span className="px-2 py-0.5 rounded bg-sky-950/90 text-sky-300 font-bold text-[10px] tracking-wide border border-sky-400/30 shadow-md">
                BluRay
              </span>
            )}
          </div>

          {/* Badge Top Right (Platform Pill e.g. AMZN, NF) */}
          <div className="absolute top-2.5 right-2.5 z-20">
            <span className="px-2 py-0.5 rounded bg-white text-black font-black text-[10px] uppercase tracking-wider shadow-md">
              {platform}
            </span>
          </div>

          {/* Bottom Left of Image: Category (TV SERIES, HOLLYWOOD, etc.) */}
          <div className="absolute bottom-2 left-2.5 z-20 max-w-[65%] truncate">
            <span className="text-[10px] font-black uppercase text-zinc-200 tracking-wider drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.9)]">
              {mediaType === 'tv' ? 'TV SERIES' : (category || 'MOVIE')}
            </span>
          </div>

          {/* Bottom Right of Image: Total Size Badge (e.g. 192 GB) */}
          {size && (
            <div className="absolute bottom-2 right-2.5 z-20">
              <span className="px-2 py-0.5 rounded bg-black/85 backdrop-blur-sm text-white font-bold text-[10px] border border-white/15 shadow-md">
                {size}
              </span>
            </div>
          )}

          {/* Play Icon on Hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100 pointer-events-none z-20">
            <div className="w-12 h-12 rounded-full bg-amber-500/90 text-black flex items-center justify-center shadow-xl shadow-amber-500/40 backdrop-blur-sm border border-amber-300/50">
              <Play className="w-5 h-5 fill-black ml-0.5" />
            </div>
          </div>

        </Link>

        {/* Info Section Below Poster */}
        <div className="p-3.5 flex flex-col justify-between flex-1 bg-[#100e19]">
          <Link href={`/${mediaType}/${item.id}`} className="block">
            <h3 className="font-ui text-sm font-semibold text-zinc-100 group-hover:text-amber-400 transition-colors duration-200 line-clamp-2 leading-snug">
              {title} {year ? `(${year})` : ''}
            </h3>
          </Link>

          {/* Meta / Status Line */}
          <div className="font-meta flex items-center justify-between text-xs text-zinc-400 mt-2.5 pt-2 border-t border-zinc-800/50">
            <div className="font-ui flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{statusText}</span>
            </div>

            <div className="font-meta flex items-center gap-2 text-[11px] text-zinc-400 font-medium">
              {timeAgo && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  {timeAgo}
                </span>
              )}
              {item.vote_average > 0 && (
                <span className="flex items-center gap-0.5 text-amber-400 font-bold">
                  <Star className="w-3 h-3 fill-amber-400" />
                  {item.vote_average.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Portrait Mode (Default for Catalog / Search / Actor pages)
  return (
    <div className={`group cine-card-glow relative flex flex-col rounded-2xl bg-[#10131b] border border-white/10 overflow-hidden cursor-pointer select-none ${!priority ? '[content-visibility:auto] [contain-intrinsic-size:360px]' : ''}`}>
      {/* Poster Image Container with Shimmer and Zoom */}
      <Link href={`/${mediaType}/${item.id}`} prefetch={false} className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-950 block">
        <Image
          src={imgSrc}
          alt={title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          priority={priority}
          fetchPriority={isLcp ? 'high' : undefined}
          onError={() => setImgSrc(fallbackUrl)}
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
        />

        {/* Branded fallback overlay if no remote image exists */}
        {Boolean(imgSrc && typeof imgSrc === 'string' && imgSrc.includes('placeholder')) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-zinc-950/75 backdrop-blur-[2px] z-[5]">
            {mediaType === 'tv' ? (
              <Tv className="w-10 h-10 text-indigo-400 mb-2" />
            ) : (
              <Film className="w-10 h-10 text-amber-400/90 mb-2" />
            )}
            <span className="text-xs font-bold text-zinc-100 line-clamp-2 px-2 tracking-wide">{title}</span>
            <span className="text-[10px] font-medium text-zinc-400 mt-1">
              {year && /^\d{4}$/.test(year) ? year : (mediaType === 'tv' ? 'TV Series' : 'Feature Film')}
            </span>
          </div>
        )}

        {/* Diagonal Light Shimmer Sweep on Hover */}
        <div className="cine-shimmer" />

        {/* Ambient Dark Gradient Vignette Overlay on Hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3.5 pointer-events-none" />

        {/* Badges Top Left (Media Type & Quality) */}
        <div className="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 flex items-center gap-1 sm:gap-1.5 z-20 flex-wrap max-w-[75%]">
          <span className="font-ui flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-black/75 backdrop-blur-md text-[9px] sm:text-[10px] font-semibold text-zinc-200 border border-white/15 uppercase tracking-wider shadow-lg group-hover:border-amber-400/40 transition-colors">
            {mediaType === 'tv' ? <Tv className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-sky-400" /> : <Film className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400" />}
            {mediaType === 'tv' ? 'TV' : 'Movie'}
          </span>
          {(item as any).hasZipPack && (
            <span className="font-ui px-1.5 sm:px-2 py-0.5 rounded-lg bg-emerald-500/90 text-black text-[9px] font-semibold uppercase tracking-wider shadow-md">
              ZIP
            </span>
          )}
          {(item as any).qualities?.includes('REMUX') && (
            <span className="font-ui px-1.5 sm:px-2 py-0.5 rounded-lg bg-purple-500/90 text-white text-[9px] font-semibold uppercase tracking-wider shadow-md">
              REMUX
            </span>
          )}
          {((item as any).qualities?.includes('4K UHD') || (item as any).qualities?.includes('4K')) && (
            <span className="font-ui px-1.5 sm:px-2 py-0.5 rounded-lg bg-amber-400/95 text-black text-[9px] font-semibold uppercase tracking-wider shadow-md">
              4K
            </span>
          )}
        </div>

        {/* Badges Top Right (Rating) */}
        {item.vote_average > 0 && (
          <div className="font-meta absolute top-2 right-2 sm:top-2.5 sm:right-2.5 flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-black/85 backdrop-blur-md text-[11px] sm:text-xs font-bold text-amber-300 border border-amber-400/40 shadow-lg group-hover:scale-105 group-hover:border-amber-400 transition-all z-20">
            <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-amber-400 text-amber-400" />
            <span>{item.vote_average.toFixed(1)}</span>
          </div>
        )}

        {/* Center Play Button on Hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100 pointer-events-none z-20">
          <div className="w-12 h-12 rounded-full bg-amber-500/90 text-black flex items-center justify-center shadow-xl shadow-amber-500/40 backdrop-blur-sm border border-amber-300/50">
            <Play className="w-5 h-5 fill-black ml-0.5" />
          </div>
        </div>

      </Link>

      {/* Info Section Below Poster */}
      <div className="p-2.5 sm:p-3.5 flex flex-col justify-between flex-1 bg-gradient-to-b from-[#10131b] to-[#0c0f16]">
        <Link href={`/${mediaType}/${item.id}`} className="block">
          <h3 className="font-ui text-xs sm:text-sm font-semibold text-zinc-100 line-clamp-1 group-hover:text-amber-400 transition-colors duration-200">
            {title}
          </h3>
        </Link>
        <div className="font-meta flex items-center justify-between gap-1 text-[11px] sm:text-xs text-zinc-400 mt-1.5 font-medium">
          <span className="font-meta text-zinc-400 group-hover:text-zinc-300 transition-colors shrink-0">{year || 'TBA'}</span>
          {(item as any).qualities && (item as any).qualities.length > 0 ? (
            <span className="font-ui text-[9px] sm:text-[10px] text-amber-400 font-semibold tracking-wider truncate">
              {(item as any).qualities.slice(0, 2).join(' • ')}
            </span>
          ) : (
            <span className="font-ui text-[9px] sm:text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">HD • 4K</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default MovieCard;
