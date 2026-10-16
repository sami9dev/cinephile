'use client';

import React, { useState, useEffect, useTransition, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Search, Filter, Star, Film, Tv, User, X, SlidersHorizontal, Sparkles, Download, Check, Clock, Layers, Send } from 'lucide-react';
import { TitleDetails, PersonDetails } from '@/types';
import { searchMulti, getDiscover, getImageURL } from '@/lib/tmdb';
import { POPULAR_GENRES } from '@/lib/mockData';
import MovieCard from '@/components/MovieCard';
import RequestLinkModal from '@/components/RequestLinkModal';

const QUALITY_PRESETS = [
  { id: 'all_uploaded', label: 'All Uploaded', query: {} },
  { id: '4k_hdr', label: '⚡ 4K HDR', query: { quality: '4k_hdr' } },
  { id: '1080p', label: '1080p Full HD', query: { quality: '1080p' } },
  { id: 'remux', label: 'BluRay REMUX', query: { quality: 'remux' } },
  { id: 'hdr', label: 'HDR / Dolby Vision', query: { quality: 'hdr' } },
  { id: 'zippack', label: 'Season Packs (Zip)', query: { category: 'zippack', type: 'tv' } },
  { id: 'hindi', label: 'Hindi / Dual Audio', query: { audio: 'hindi' } },
  { id: 'movies_only', label: 'Movies', query: { type: 'movie' } },
  { id: 'tv_only', label: 'Web Series', query: { type: 'tv' } },
];

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialQuery = searchParams.get('q') || '';
  const initialGenre = searchParams.get('genre') || '';
  const initialType = searchParams.get('type') || 'all';
  const initialQuality = searchParams.get('quality') || '';
  const initialCategory = searchParams.get('category') || '';
  const initialAudio = searchParams.get('audio') || '';
  const initialOtt = searchParams.get('ott') || '';

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<'all' | 'movie' | 'tv' | 'person'>(
    (initialType as 'all' | 'movie' | 'tv' | 'person') || 'all'
  );
  const [selectedQuality, setSelectedQuality] = useState<string>(initialQuality);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [selectedAudio, setSelectedAudio] = useState<string>(initialAudio);
  const [selectedOtt, setSelectedOtt] = useState<string>(initialOtt);
  const [selectedGenre, setSelectedGenre] = useState<string>(initialGenre);
  const [minRating, setMinRating] = useState<number>(0);

  const [uploadedResults, setUploadedResults] = useState<TitleDetails[]>([]);
  const [tmdbResults, setTmdbResults] = useState<(TitleDetails | PersonDetails)[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  // Sync state when searchParams change from navigation clicks
  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setSelectedQuality(searchParams.get('quality') || '');
    setSelectedCategory(searchParams.get('category') || '');
    setSelectedAudio(searchParams.get('audio') || '');
    setSelectedOtt(searchParams.get('ott') || '');
    setSelectedGenre(searchParams.get('genre') || '');
    const t = searchParams.get('type') || 'all';
    setActiveTab((t as any) || 'all');
  }, [searchParams]);

  // Main search & catalog fetch
  useEffect(() => {
    let isCancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const qualityParam = selectedQuality ? `&quality=${encodeURIComponent(selectedQuality)}` : '';
        const categoryParam = selectedCategory ? `&category=${encodeURIComponent(selectedCategory)}` : '';
        const audioParam = selectedAudio ? `&audio=${encodeURIComponent(selectedAudio)}` : '';
        const ottParam = selectedOtt ? `&ott=${encodeURIComponent(selectedOtt)}` : '';
        const typeParam = activeTab !== 'all' && activeTab !== 'person' ? `&type=${activeTab}` : '';
        const queryParam = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : '';

        // 1. Fetch from our uploaded files database catalog
        const catalogUrl = `/api/catalog?limit=80${typeParam}${qualityParam}${categoryParam}${audioParam}${ottParam}${queryParam}`;
        const catRes = await fetch(catalogUrl);
        const catData = await catRes.json();
        if (!isCancelled && catData?.success) {
          setUploadedResults(catData.items || []);
        }

        // 2. Fetch TMDB results (supplemental or when user searches a broad term)
        if (query.trim().length > 0) {
          const res = await searchMulti(query.trim());
          if (!isCancelled) {
            setTmdbResults(res.results || []);
          }
        } else if (selectedGenre) {
          const genreId = Number(selectedGenre);
          const [movies, tvs] = await Promise.all([
            getDiscover('movie', { genreId }),
            getDiscover('tv', { genreId }),
          ]);
          if (!isCancelled) {
            setTmdbResults([...movies, ...tvs]);
          }
        } else {
          setTmdbResults([]);
        }
      } catch (err) {
        console.error('Catalog search error:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, [query, selectedQuality, selectedCategory, selectedAudio, selectedOtt, activeTab, selectedGenre]);

  const updateFilters = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    startTransition(() => {
      router.replace(`/search?${params.toString()}`, { scroll: false });
    });
  };

  const handleQualityPresetClick = (preset: typeof QUALITY_PRESETS[0]) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    Object.entries(preset.query).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    startTransition(() => {
      router.replace(`/search?${params.toString()}`, { scroll: false });
    });
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    updateFilters({ q: val });
  };

  // Determine active quality label for header
  const isFiltered = !!(selectedQuality || selectedCategory || selectedAudio || selectedOtt || (activeTab !== 'all'));
  let filterTitle = 'Uploaded Releases';
  if (selectedQuality === '4k_hdr' || selectedQuality === '4k') filterTitle = '4K Ultra HD & HDR Releases';
  else if (selectedQuality === 'remux') filterTitle = 'BluRay REMUX High-Bitrate Releases';
  else if (selectedQuality === '1080p') filterTitle = '1080p Full HD Releases';
  else if (selectedQuality === 'hdr') filterTitle = 'HDR & Dolby Vision Releases';
  else if (selectedCategory === 'zippack') filterTitle = 'Complete Season Zip Packs (All Episodes)';
  else if (selectedAudio === 'hindi') filterTitle = 'Hindi & Dual Audio Releases';
  else if (selectedOtt) filterTitle = `${selectedOtt.toUpperCase()} Streaming Releases`;
  else if (activeTab === 'movie') filterTitle = 'Uploaded Movies';
  else if (activeTab === 'tv') filterTitle = 'Uploaded Web Series';

  // Deduplicate and filter results
  const filteredUploaded = uploadedResults.filter((item) => {
    if (minRating > 0 && (item.vote_average || 0) < minRating) return false;
    return true;
  });

  const uploadedIds = new Set(filteredUploaded.map((u) => u.id));
  const filteredTmdb = tmdbResults.filter((item) => {
    if (uploadedIds.has(item.id)) return false; // avoid duplicates
    if (minRating > 0 && (item as TitleDetails).vote_average && (item as TitleDetails).vote_average < minRating) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Search Input Bar */}
      <div className="bg-[#0f121a] border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="relative">
          <input
            type="text"
            placeholder="Search uploaded files by movie title or TV series..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="font-ui font-medium w-full bg-zinc-900/90 border border-zinc-700/80 rounded-xl pl-11 pr-10 py-3 text-sm text-zinc-100 placeholder:font-meta placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all shadow-inner"
            autoFocus
            suppressHydrationWarning
          />
          <Search className="w-5 h-5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          {query && (
            <button
              onClick={() => handleQueryChange('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1"
              suppressHydrationWarning
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="py-20 text-center space-y-3">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-zinc-400">Loading requested quality releases...</p>
        </div>
      )}

      {/* 1. Uploaded Releases Grid */}
      {!loading && filteredUploaded.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                <Download className="w-4 h-4 text-amber-400" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-2xl sm:text-3xl text-white uppercase tracking-wider flex flex-wrap items-center gap-2 leading-tight">
                  <span>{filterTitle}</span>
                  <span className="font-ui text-xs font-bold text-amber-400 px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20">
                    {filteredUploaded.length} files available
                  </span>
                </h2>
                <p className="font-meta text-xs text-zinc-400 mt-1">Direct download links ready in high quality</p>
              </div>
            </div>

            {isFiltered && (
              <button
                onClick={() => {
                  setSelectedQuality('');
                  setSelectedCategory('');
                  setSelectedAudio('');
                  setSelectedOtt('');
                  setActiveTab('all');
                  router.replace('/search', { scroll: false });
                }}
                className="text-xs text-zinc-400 hover:text-white underline shrink-0"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-6">
            {filteredUploaded.map((item, idx) => (
              <MovieCard key={`uploaded-${item.id}-${idx}`} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* 2. Additional Discover / TMDB Results */}
      {!loading && filteredTmdb.length > 0 && (
        <div className="space-y-4 pt-6">
          <div className="border-b border-zinc-800 pb-3">
            <h3 className="text-base font-bold text-zinc-300 flex flex-wrap items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400 shrink-0" /> More Matching Titles on TMDB
              <span className="text-xs text-zinc-500">({filteredTmdb.length})</span>
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-6">
            {filteredTmdb.map((item, idx) => {
              const isPerson = 'known_for_department' in item || (item as any).media_type === 'person';

              if (isPerson) {
                const person = item as PersonDetails;
                const photoUrl = getImageURL(person.profile_path, 'w500');
                return (
                  <Link
                    key={`person-${person.id}-${idx}`}
                    href={`/person/${person.id}`}
                    className="group rounded-2xl bg-[#11141c] border border-white/5 overflow-hidden hover:border-amber-400/40 transition-all p-3 flex flex-col items-center text-center space-y-2 hover:-translate-y-1"
                  >
                    <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-zinc-900 border-2 border-zinc-700 group-hover:border-amber-400 transition-colors">
                      <Image
                        src={photoUrl}
                        alt={person.name}
                        fill
                        sizes="128px"
                        className="object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <h3 className="text-sm font-bold text-zinc-100 group-hover:text-amber-400 transition-colors line-clamp-1">
                      {person.name}
                    </h3>
                    <span className="text-xs text-zinc-400">
                      {person.known_for_department || 'Actor / Cast'}
                    </span>
                  </Link>
                );
              }

              return <MovieCard key={`tmdb-${item.id}-${idx}`} item={item as TitleDetails} />;
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredUploaded.length === 0 && filteredTmdb.length === 0 && (
        <div className="py-20 text-center max-w-md mx-auto space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-zinc-200">No matching uploaded releases found</h3>
          <p className="text-xs text-zinc-400">
            Try choosing another quality option (such as 4K HDR, 1080p, or REMUX) or clearing your search term.
          </p>
          <div className="pt-2">
            <button
              onClick={() => setIsRequestModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all hover:scale-105 active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Request This Title / Link</span>
            </button>
          </div>
        </div>
      )}

      {/* User Title Request Modal */}
      <RequestLinkModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        prefillTitle={query}
        prefillMediaType="movie"
      />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
