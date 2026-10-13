'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Home,
  Film,
  Tv,
  MonitorPlay,
  Star,
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import { TitleDetails } from '@/types';
import MovieCard from './MovieCard';
import Pagination from './Pagination';

export type ActiveTabType = 'home' | 'movie' | 'tv' | 'ott' | 'top_imdb' | 'anime' | 'quality';

interface LatestUploadsGridProps {
  items: TitleDetails[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  activeType?: 'all' | 'movie' | 'tv';
  activeTab?: ActiveTabType;
  activeOtt?: string;
  activeQuality?: string;
  basePath?: string;
}

const OTT_PLATFORMS = [
  { label: 'All OTT Platforms', ott: 'all', badge: '✨' },
  { label: 'Netflix', ott: 'netflix', badge: '🔴' },
  { label: 'Amazon Prime Video', ott: 'prime', badge: '📦' },
  { label: 'Disney+ Hotstar', ott: 'hotstar', badge: '⭐' },
  { label: 'JioCinema', ott: 'jiocinema', badge: '🎬' },
  { label: 'SonyLIV', ott: 'sonyliv', badge: '📺' },
  { label: 'Zee5', ott: 'zee5', badge: '⚡' },
  { label: 'Apple TV+', ott: 'appletv', badge: '🍎' },
];

const QUALITY_PRESETS = [
  { label: 'All Qualities', quality: '', badge: '✨' },
  { label: '4K Ultra HD (2160p)', quality: '4k', badge: '💎' },
  { label: '1080p Full HD', quality: '1080p', badge: '🎬' },
  { label: '720p HD', quality: '720p', badge: '⚡' },
  { label: 'BluRay / REMUX', quality: 'remux', badge: '💿' },
  { label: 'HDR / Dolby Vision', quality: 'hdr', badge: '🌈' },
];

export const LatestUploadsGrid: React.FC<LatestUploadsGridProps> = ({
  items,
  currentPage,
  totalPages,
  totalCount,
  activeType = 'all',
  activeTab = 'home',
  activeOtt = '',
  activeQuality = '',
  basePath = '/',
}) => {
  const [openDropdown, setOpenDropdown] = useState<'ott' | 'quality' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const effectiveTab: ActiveTabType =
    activeTab || (activeType === 'movie' ? 'movie' : activeType === 'tv' ? 'tv' : 'home');

  return (
    <div className="space-y-6">
      {/* Filter Tabs matching Ola Movies styling */}
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800/80 pb-3 min-w-0 max-w-full">
        {/* Outer wrapper for non-clipped dropdown popovers */}
        <div ref={dropdownRef} className="relative max-w-full min-w-0">
          {/* Horizontally Scrollable Filter Pills Strip */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#14121f] border border-[#2b2542] max-w-full overflow-x-auto no-scrollbar scroll-smooth shadow-inner">
            {/* 1. Home / All */}
            <Link
              href="/"
              onClick={() => setOpenDropdown(null)}
              className={`font-ui flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-1.5 min-h-[36px] rounded-lg text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
                effectiveTab === 'home'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              Home
            </Link>

            {/* 2. Movies */}
            <Link
              href="/?tab=movie"
              onClick={() => setOpenDropdown(null)}
              className={`font-ui flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-1.5 min-h-[36px] rounded-lg text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
                effectiveTab === 'movie'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/30 font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Movies
            </Link>

            {/* 3. TV Series */}
            <Link
              href="/?tab=tv"
              onClick={() => setOpenDropdown(null)}
              className={`font-ui flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-1.5 min-h-[36px] rounded-lg text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
                effectiveTab === 'tv'
                  ? 'bg-sky-500 text-black shadow-md shadow-sky-500/30 font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              TV Series
            </Link>

            {/* 4. OTT (with Dropdown trigger) */}
            <div className="relative shrink-0 flex items-center">
              <Link
                href="/?tab=ott"
                onClick={() => setOpenDropdown(null)}
                className={`font-ui flex items-center gap-1.5 pl-3 sm:pl-3.5 pr-1.5 py-2 sm:py-1.5 min-h-[36px] rounded-l-lg text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap ${
                  effectiveTab === 'ott'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                OTT
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === 'ott' ? null : 'ott');
                }}
                className={`py-2 sm:py-1.5 pr-2.5 pl-1.5 min-h-[36px] flex items-center rounded-r-lg text-xs transition-all ${
                  effectiveTab === 'ott'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
                title="Select OTT platform"
                aria-label="Toggle OTT platform menu"
              >
                <ChevronDown className="w-3 h-3 opacity-80" />
              </button>
            </div>

            {/* 5. Top IMDb */}
            <Link
              href="/?tab=top_imdb"
              onClick={() => setOpenDropdown(null)}
              className={`font-ui flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-1.5 min-h-[36px] rounded-lg text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
                effectiveTab === 'top_imdb'
                  ? 'bg-yellow-500 text-black shadow-md shadow-yellow-500/30 font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              Top IMDb
            </Link>

            {/* 6. Anime */}
            <Link
              href="/?tab=anime"
              onClick={() => setOpenDropdown(null)}
              className={`font-ui flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-1.5 min-h-[36px] rounded-lg text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
                effectiveTab === 'anime'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30 font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Anime
            </Link>

            {/* 7. Quality (with Dropdown trigger) */}
            <div className="relative shrink-0 flex items-center">
              <Link
                href="/?tab=quality"
                onClick={() => setOpenDropdown(null)}
                className={`font-ui flex items-center gap-1.5 pl-3 sm:pl-3.5 pr-1.5 py-2 sm:py-1.5 min-h-[36px] rounded-l-lg text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap ${
                  effectiveTab === 'quality'
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30 font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Quality
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === 'quality' ? null : 'quality');
                }}
                className={`py-2 sm:py-1.5 pr-2.5 pl-1.5 min-h-[36px] flex items-center rounded-r-lg text-xs transition-all ${
                  effectiveTab === 'quality'
                    ? 'bg-emerald-500 text-black shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
                title="Select resolution & quality"
                aria-label="Toggle resolution menu"
              >
                <ChevronDown className="w-3 h-3 opacity-80" />
              </button>
            </div>
          </div>

          {/* OTT Dropdown Menu (Rendered outside overflow-x-auto container to prevent clipping) */}
          {openDropdown === 'ott' && (
            <div className="absolute left-0 sm:left-auto sm:right-24 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] py-1.5 rounded-xl bg-[#14121f] border border-[#2b2542] shadow-2xl z-50 backdrop-blur-md">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                Streaming Platforms
              </div>
              {OTT_PLATFORMS.map((platform) => {
                const href =
                  platform.ott === 'all'
                    ? '/?tab=ott'
                    : `/?tab=ott&ott=${platform.ott}`;
                const isSelected =
                  effectiveTab === 'ott' &&
                  (platform.ott === 'all'
                    ? !activeOtt || activeOtt === 'all'
                    : activeOtt === platform.ott);
                return (
                  <Link
                    key={platform.ott}
                    href={href}
                    onClick={() => setOpenDropdown(null)}
                    className={`flex items-center justify-between px-3 py-2.5 text-xs transition-all ${
                      isSelected
                        ? 'bg-rose-600/20 text-rose-400 font-bold'
                        : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{platform.badge}</span>
                      <span>{platform.label}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Quality Dropdown Menu (Rendered outside overflow-x-auto container to prevent clipping) */}
          {openDropdown === 'quality' && (
            <div className="absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] py-1.5 rounded-xl bg-[#14121f] border border-[#2b2542] shadow-2xl z-50 backdrop-blur-md">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                Select Resolution
              </div>
              {QUALITY_PRESETS.map((preset) => {
                const href =
                  preset.quality === ''
                    ? '/?tab=quality'
                    : `/?tab=quality&quality=${preset.quality}`;
                const isSelected =
                  effectiveTab === 'quality' &&
                  (preset.quality === ''
                    ? !activeQuality || activeQuality === '4k'
                    : activeQuality === preset.quality);
                return (
                  <Link
                    key={preset.label}
                    href={href}
                    onClick={() => setOpenDropdown(null)}
                    className={`flex items-center justify-between px-3 py-2.5 text-xs transition-all ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                        : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{preset.badge}</span>
                      <span>{preset.label}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sub-Filters: OTT Platform Bar (shown when OTT tab is active) */}
      {effectiveTab === 'ott' && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider shrink-0 flex items-center gap-1.5">
            <MonitorPlay className="w-3.5 h-3.5 text-rose-500" /> Platform:
          </span>
          {OTT_PLATFORMS.map((platform) => {
            const isSelected =
              platform.ott === 'all'
                ? !activeOtt || activeOtt === 'all'
                : activeOtt === platform.ott;
            const href =
              platform.ott === 'all'
                ? '/?tab=ott'
                : `/?tab=ott&ott=${platform.ott}`;
            return (
              <Link
                key={platform.ott}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-sm'
                    : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                }`}
              >
                <span>{platform.badge}</span>
                <span>{platform.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Sub-Filters: Quality Bar (shown when Quality tab is active) */}
      {effectiveTab === 'quality' && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider shrink-0 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" /> Preset:
          </span>
          {QUALITY_PRESETS.map((preset) => {
            const isSelected =
              preset.quality === ''
                ? !activeQuality || activeQuality === '4k'
                : activeQuality === preset.quality;
            const href =
              preset.quality === ''
                ? '/?tab=quality'
                : `/?tab=quality&quality=${preset.quality}`;
            return (
              <Link
                key={preset.label}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-sm'
                    : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                }`}
              >
                <span>{preset.badge}</span>
                <span>{preset.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* 4-Column Responsive Grid matching Reference Screenshot */}
      {items.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {items.map((item, idx) => (
              <MovieCard
                key={`${item.media_type || activeType}-${item.id}-${idx}`}
                item={item}
                aspect="landscape"
                priority={idx < 2}
                isLcp={idx === 0}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              basePath={basePath}
              extraParams={{
                tab: effectiveTab !== 'home' ? effectiveTab : undefined,
                type: effectiveTab === 'movie' ? 'movie' : effectiveTab === 'tv' ? 'tv' : undefined,
                ott: activeOtt || undefined,
                quality: activeQuality || undefined,
              }}
            />
          )}
        </div>
      ) : (
        <div className="py-16 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/60 p-8 space-y-3">
          <Sparkles className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="text-zinc-300 font-semibold text-sm">
            No uploads found under this filter.
          </p>
          <p className="text-xs text-zinc-500">
            Try switching to another tab or check all releases on the Home tab.
          </p>
        </div>
      )}
    </div>
  );
};

export default LatestUploadsGrid;
