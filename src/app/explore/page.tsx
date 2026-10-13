import React from 'react';
import Link from 'next/link';
import { Compass, Film, Tv, Sparkles, Download, Layers } from 'lucide-react';
import { getPaginatedUploadedTitles } from '@/lib/redisDb';
import MovieCard from '@/components/MovieCard';
import Pagination from '@/components/Pagination';

export const dynamic = 'force-dynamic';

interface ExplorePageProps {
  searchParams: Promise<{
    page?: string;
    type?: string;
    quality?: string;
    category?: string;
    audio?: string;
    q?: string;
  }>;
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const resolvedParams = await searchParams;
  const page = typeof resolvedParams?.page === 'string' ? Math.max(1, parseInt(resolvedParams.page, 10)) : 1;
  const typeParam = resolvedParams?.type;
  const activeType: 'all' | 'movie' | 'tv' =
    typeParam === 'movie' || typeParam === 'tv' ? typeParam : 'all';
  const quality = resolvedParams?.quality || '';
  const category = resolvedParams?.category || '';
  const audio = resolvedParams?.audio || '';
  const q = resolvedParams?.q || '';

  const result = await getPaginatedUploadedTitles({
    type: activeType,
    page,
    limit: 16,
    quality: quality || undefined,
    category: category || undefined,
    audio: audio || undefined,
    query: q || undefined,
  });

  const buildUrl = (p: number, overrides: Record<string, string | undefined> = {}) => {
    const params = new URLSearchParams();
    const finalPage = overrides.page !== undefined ? overrides.page : (p > 1 ? String(p) : '');
    const finalType = overrides.type !== undefined ? overrides.type : (activeType !== 'all' ? activeType : '');
    const finalQuality = overrides.quality !== undefined ? overrides.quality : quality;
    const finalCategory = overrides.category !== undefined ? overrides.category : category;
    const finalAudio = overrides.audio !== undefined ? overrides.audio : audio;
    const finalQ = overrides.q !== undefined ? overrides.q : q;

    if (finalPage && Number(finalPage) > 1) params.set('page', finalPage);
    if (finalType) params.set('type', finalType);
    if (finalQuality) params.set('quality', finalQuality);
    if (finalCategory) params.set('category', finalCategory);
    if (finalAudio) params.set('audio', finalAudio);
    if (finalQ) params.set('q', finalQ);

    const qs = params.toString();
    return `/explore${qs ? `?${qs}` : ''}`;
  };

  const hasFilter = Boolean(quality || category || audio || q || activeType !== 'all');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 min-h-screen">
      {/* Page Header */}
      <div className="space-y-4 border-b border-zinc-800 pb-6">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
          <Compass className="w-4 h-4" /> Comprehensive Uploads Catalog
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Explore Releases
            </h1>
            <p className="text-sm text-zinc-400 max-w-2xl mt-1">
              Browse all movies and television series with verified high-speed download links.
            </p>
          </div>

          {result.total > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-400 self-start md:self-auto">
              <span className="px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 font-bold">
                {result.total} {result.total === 1 ? 'Title' : 'Titles'} Available
              </span>
              <span>
                Page {result.page} of {result.totalPages}
              </span>
            </div>
          )}
        </div>

        {/* Media Type Tabs & Quality Pills */}
        <div className="space-y-3 pt-2">
          {/* Main Media Type Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildUrl(1, { type: '', page: '' })}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                activeType === 'all'
                  ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
                  : 'bg-zinc-900/90 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              All Uploads
            </Link>
            <Link
              href={buildUrl(1, { type: 'movie', page: '' })}
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                activeType === 'movie'
                  ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
                  : 'bg-zinc-900/90 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" /> Movies
            </Link>
            <Link
              href={buildUrl(1, { type: 'tv', page: '' })}
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                activeType === 'tv'
                  ? 'bg-sky-500 text-black border-sky-400 shadow-md shadow-sky-500/20'
                  : 'bg-zinc-900/90 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Tv className="w-3.5 h-3.5" /> Web Series
            </Link>
          </div>

          {/* Quality and Category Filter Pills */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pt-1">
            <Link
              href={buildUrl(1, { quality: quality === '4k' ? '' : '4k', page: '' })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                quality === '4k'
                  ? 'bg-amber-400 text-black border-amber-300 shadow-md'
                  : 'bg-zinc-900/90 text-amber-300 border-amber-400/30 hover:bg-amber-400/10'
              }`}
            >
              ⚡ 4K Ultra HD
            </Link>
            <Link
              href={buildUrl(1, { quality: quality === 'remux' ? '' : 'remux', page: '' })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                quality === 'remux'
                  ? 'bg-purple-500 text-white border-purple-400 shadow-md'
                  : 'bg-zinc-900/90 text-purple-300 border-purple-400/30 hover:bg-purple-400/10'
              }`}
            >
              💎 BluRay REMUX
            </Link>
            <Link
              href={buildUrl(1, { quality: quality === '1080p' ? '' : '1080p', page: '' })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                quality === '1080p'
                  ? 'bg-sky-500 text-black border-sky-400 shadow-md'
                  : 'bg-zinc-900/90 text-sky-300 border-sky-400/30 hover:bg-sky-400/10'
              }`}
            >
              1080p Full HD
            </Link>
            <Link
              href={buildUrl(1, { category: category === 'zippack' ? '' : 'zippack', page: '' })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                category === 'zippack'
                  ? 'bg-emerald-500 text-black border-emerald-400 shadow-md'
                  : 'bg-zinc-900/90 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10'
              }`}
            >
              📦 Season Packs (Zip)
            </Link>
            <Link
              href={buildUrl(1, { audio: audio === 'hindi' ? '' : 'hindi', page: '' })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                audio === 'hindi'
                  ? 'bg-amber-400 text-black border-amber-300 shadow-md'
                  : 'bg-zinc-900/90 text-amber-300 border-amber-400/30 hover:bg-amber-400/10'
              }`}
            >
              Hindi / Dual Audio
            </Link>
          </div>
        </div>
      </div>

      {/* Grid of Results */}
      {result.items && result.items.length > 0 ? (
        <section className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5">
            {result.items.map((item, idx) => (
              <MovieCard
                key={`explore-${item.media_type}-${item.id}-${idx}`}
                item={item}
                priority={idx < 2}
                aspect="portrait"
              />
            ))}
          </div>

          {/* Pagination Controls */}
          <Pagination
            currentPage={result.page}
            totalPages={result.totalPages}
            basePath="/explore"
            extraParams={{
              type: activeType !== 'all' ? activeType : undefined,
              quality: quality || undefined,
              category: category || undefined,
              audio: audio || undefined,
              q: q || undefined,
            }}
          />
        </section>
      ) : (
        <div className="py-20 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-8 space-y-4 max-w-xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
            <Sparkles className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">
            {hasFilter ? 'No Releases Match This Filter' : 'No Uploaded Releases Found'}
          </h2>
          <p className="text-sm text-zinc-400">
            {hasFilter
              ? 'Try resetting the filters to view all available titles.'
              : 'Releases with verified links will appear here as soon as they are uploaded.'}
          </p>
          {hasFilter && (
            <div className="pt-2">
              <Link
                href="/explore"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all"
              >
                Clear All Filters
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
