import React from 'react';
import { getPaginatedUploadedTitles } from '@/lib/redisDb';
import LatestUploadsGrid from '@/components/LatestUploadsGrid';
import { getLcpCardImageUrl } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

interface HomePageProps {
  searchParams: Promise<{
    page?: string;
    type?: string;
    tab?: string;
    ott?: string;
    quality?: string;
    collection?: string;
    year?: string;
    sort?: string;
  }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedParams = await searchParams;
  const page = typeof resolvedParams?.page === 'string' ? Math.max(1, parseInt(resolvedParams.page, 10)) : 1;
  const rawTab = (resolvedParams?.tab || '').toLowerCase().trim();
  const rawType = (resolvedParams?.type || '').toLowerCase().trim();
  const rawOtt = (resolvedParams?.ott || '').toLowerCase().trim();
  const rawQuality = (resolvedParams?.quality || '').toLowerCase().trim();
  const rawCollection = (resolvedParams?.collection || '').toLowerCase().trim();
  const rawYear = (resolvedParams?.year || '').toLowerCase().trim();
  const rawSort = (resolvedParams?.sort || '').toLowerCase().trim();

  // Determine active tab
  let activeTab: 'home' | 'movie' | 'tv' | 'ott' | 'top_imdb' | 'anime' | 'quality' | 'collection' | 'year' = 'home';
  if (rawTab === 'movie' || rawType === 'movie') activeTab = 'movie';
  else if (rawTab === 'tv' || rawType === 'tv') activeTab = 'tv';
  else if (rawTab === 'ott' || rawOtt) activeTab = 'ott';
  else if (rawTab === 'top_imdb' || rawSort === 'top_rated') activeTab = 'top_imdb';
  else if (rawTab === 'anime') activeTab = 'anime';
  else if (rawTab === 'quality' || rawQuality) activeTab = 'quality';
  else if (rawTab === 'collection' || rawCollection) activeTab = 'collection';
  else if (rawTab === 'year' || rawYear) activeTab = 'year';
  else activeTab = 'home';

  // Map active tab to query options
  let typeOption: 'all' | 'movie' | 'tv' = 'all';
  if (activeTab === 'movie') typeOption = 'movie';
  else if (activeTab === 'tv') typeOption = 'tv';

  let ottOption: string | undefined = undefined;
  if (activeTab === 'ott') {
    ottOption = rawOtt || 'all';
  }

  let qualityOption: string | undefined = undefined;
  if (activeTab === 'quality') {
    qualityOption = rawQuality || '4k';
  }

  let collectionOption: string | undefined = undefined;
  if (activeTab === 'collection') {
    collectionOption = rawCollection || 'mcu';
  }

  let yearOption: string | undefined = undefined;
  if (activeTab === 'year') {
    yearOption = rawYear || '2026';
  }

  let genreOption: string | undefined = undefined;
  if (activeTab === 'anime') {
    genreOption = 'anime';
  }

  let sortOption: 'latest' | 'top_rated' | 'rating' | 'popular' | undefined = undefined;
  if (activeTab === 'top_imdb' || rawSort === 'top_rated') {
    sortOption = 'top_rated';
  }

  const result = await getPaginatedUploadedTitles({
    type: typeOption,
    page,
    limit: 16,
    ott: ottOption,
    quality: qualityOption,
    collection: collectionOption,
    year: yearOption,
    genre: genreOption,
    sort: sortOption,
  });

  const firstItem = result.items && result.items.length > 0 ? result.items[0] : null;
  const lcpImageUrl = getLcpCardImageUrl(firstItem, 'landscape');

  return (
    <div className="min-h-screen pb-16 space-y-8 pt-6">
      {/* High-priority preload for mobile/desktop LCP image to eliminate resource discovery delay */}
      {lcpImageUrl && (
        <link
          rel="preload"
          as="image"
          href={lcpImageUrl}
          fetchPriority="high"
        />
      )}

      {/* Latest Uploads Section with 16:9 Landscape Poster Grid and Full Pagination */}
      <section id="latest-uploads-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <LatestUploadsGrid
          items={result.items || []}
          currentPage={result.page}
          totalPages={result.totalPages}
          totalCount={result.total}
          activeType={typeOption}
          activeTab={activeTab}
          activeOtt={rawOtt}
          activeQuality={rawQuality}
          activeCollection={rawCollection}
          activeYear={rawYear}
          basePath="/"
        />
      </section>
    </div>
  );
}

