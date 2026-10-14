import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Clock, Film, Tv } from 'lucide-react';
import { getTitleDetails } from '@/lib/tmdb';
import { getImageURL, getBackdropURL } from '@/lib/tmdb';
import CustomLinksManager from '@/components/CustomLinksManager';

interface PageProps {
  params: Promise<{
    type: string;
    id: string;
  }>;
}

export const dynamic = 'force-dynamic';

export default async function TitleDetailPage({ params }: PageProps) {
  const { type, id } = await params;
  const normalizedType: 'movie' | 'tv' = type?.toLowerCase() === 'tv' ? 'tv' : 'movie';

  const titleDetails = await getTitleDetails(normalizedType, id);

  const title = titleDetails.title || titleDetails.name || 'Untitled';
  const releaseDate = titleDetails.release_date || titleDetails.first_air_date || '';
  const releaseYear = releaseDate.split('-')[0];
  const posterUrl = getImageURL(titleDetails.poster_path, 'w780');
  const backdropUrl = getBackdropURL(titleDetails.backdrop_path, 'w1280');

  const isTv = titleDetails.media_type === 'tv' || normalizedType === 'tv';
  const seasonsCount = titleDetails.number_of_seasons || 1;
  const episodesCount = titleDetails.number_of_episodes;
  const tvMetaStr = `${seasonsCount} Season${seasonsCount > 1 ? 's' : ''}${episodesCount ? ` (${episodesCount} eps)` : ''}`;
  const runtimeStr = titleDetails.runtime ? `${Math.floor(titleDetails.runtime / 60)}h ${titleDetails.runtime % 60}m` : null;

  const metaItems = [
    releaseYear,
    isTv ? tvMetaStr : runtimeStr,
    titleDetails.status,
  ].filter(Boolean);

  const heroImage = (backdropUrl && !backdropUrl.includes('placeholder')) ? backdropUrl : posterUrl;

  return (
    <div className="min-h-screen pb-20 space-y-10 bg-[#090a10] relative overflow-hidden">
      {/* Ambient Purple Atmospheric Glow matching reference UI */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[550px] pointer-events-none bg-[radial-gradient(circle_at_50%_180px,rgba(139,92,246,0.18)_0%,rgba(88,28,135,0.06)_45%,transparent_70%)] z-0" />

      {backdropUrl && !backdropUrl.includes('placeholder') && (
        <link
          rel="preload"
          as="image"
          href={backdropUrl}
          fetchPriority="high"
        />
      )}

      {/* 1. Hero Backdrop Header */}
      <div className="relative w-full min-h-[500px] lg:min-h-[580px] z-10">
        {/* Backdrop Image for desktop ambient lighting */}
        <div className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none">
          <Image
            src={backdropUrl}
            alt={title}
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            className="object-cover object-center opacity-30 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090a10] via-[#090a10]/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#090a10] via-[#090a10]/80 to-transparent" />
        </div>

        {/* Content Box */}
        <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 w-full pt-6 sm:pt-10 pb-16 min-w-0">
          {/* Mobile View: Exactly matching media_1791970616300_b2d3794c.jpg */}
          <div className="flex md:hidden flex-col items-center text-center space-y-4 max-w-lg mx-auto">
            {/* Centered Landscape Hero with Purple Glow */}
            <div className="w-full aspect-[16/10] rounded-2xl overflow-hidden border border-violet-500/30 shadow-[0_0_50px_rgba(139,92,246,0.25)] relative bg-zinc-950">
              <Image
                src={heroImage}
                alt={title}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 480px"
                className="object-cover object-center"
              />
            </div>

            {/* Badges & Dot-Separated Meta */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold pt-1">
              <span className="font-ui px-2.5 py-0.5 rounded-md bg-[#ea580c] text-white uppercase font-bold tracking-wider text-[11px] flex items-center gap-1 shadow-sm">
                {isTv ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                {isTv ? 'TV SERIES' : 'MOVIE'}
              </span>

              {metaItems.length > 0 && (
                <span className="font-meta text-xs text-zinc-300 font-medium flex items-center gap-1.5 flex-wrap">
                  {metaItems.map((item, idx) => (
                    <React.Fragment key={idx}>
                      <span className="text-zinc-500">•</span>
                      <span>{item}</span>
                    </React.Fragment>
                  ))}
                </span>
              )}
            </div>

            {/* Centered Title */}
            <h1 className="font-display text-3xl sm:text-4xl text-white uppercase tracking-wider leading-tight drop-shadow-md">
              {title}
            </h1>

            {/* Tagline */}
            {titleDetails.tagline && (
              <p className="font-meta text-xs sm:text-sm italic text-zinc-400 font-medium">
                &quot;{titleDetails.tagline}&quot;
              </p>
            )}

            {/* Genres */}
            {titleDetails.genres && titleDetails.genres.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 pt-0.5">
                {titleDetails.genres.map((g) => (
                  <Link
                    key={g.id}
                    href={`/search?type=${type}&genre=${g.id}&name=${encodeURIComponent(g.name)}`}
                    className="font-ui text-xs font-medium px-3.5 py-1 rounded-full bg-[#131622] text-zinc-300 border border-white/5 hover:border-amber-400 transition-colors"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            )}

            {/* TV Series Season & Episode Vault / Movie Direct Download Links */}
            <div className="w-full pt-2">
              <CustomLinksManager titleDetails={titleDetails} />
            </div>
          </div>

          {/* Desktop View: Classic side-by-side with rich poster */}
          <div className="hidden md:flex gap-8 items-start min-w-0">
            {/* Poster Card */}
            <div className="w-56 md:w-64 shrink-0 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 bg-zinc-900 group relative">
              <Image
                src={posterUrl}
                alt={title}
                width={300}
                height={450}
                priority
                className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>

            {/* Text & Meta */}
            <div className="flex-1 min-w-0 flex flex-col items-start text-left space-y-3 w-full">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold">
                <span className="font-ui px-2.5 py-1 rounded-md bg-[#ea580c] text-white uppercase font-bold tracking-wider flex items-center gap-1 shadow-sm">
                  {isTv ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                  {isTv ? 'TV SERIES' : 'MOVIE'}
                </span>

                {metaItems.length > 0 && (
                  <span className="font-meta text-xs text-zinc-300 font-medium flex items-center gap-1.5 flex-wrap">
                    {metaItems.map((item, idx) => (
                      <React.Fragment key={idx}>
                        <span className="text-zinc-500">•</span>
                        <span>{item}</span>
                      </React.Fragment>
                    ))}
                  </span>
                )}
              </div>

              {/* Title */}
              <h1 className="font-display text-4xl lg:text-6xl text-white uppercase tracking-wider leading-[0.95] drop-shadow-md break-words max-w-full">
                {title}
              </h1>

              {/* Tagline */}
              {titleDetails.tagline && (
                <p className="font-meta text-sm sm:text-base italic text-amber-300/90 font-medium break-words max-w-full">
                  &quot;{titleDetails.tagline}&quot;
                </p>
              )}

              {/* Genres */}
              {titleDetails.genres && titleDetails.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 max-w-full">
                  {titleDetails.genres.map((g) => (
                    <Link
                      key={g.id}
                      href={`/search?type=${type}&genre=${g.id}&name=${encodeURIComponent(g.name)}`}
                      className="font-ui text-xs font-semibold px-3 py-1 rounded-full bg-zinc-800/90 text-zinc-200 border border-zinc-700 hover:border-amber-400 transition-colors"
                    >
                      {g.name}
                    </Link>
                  ))}
                </div>
              )}

              {/* TV Series Season & Episode Vault / Movie Direct Download Links */}
              <div className="w-full max-w-full min-w-0 pt-3">
                <CustomLinksManager titleDetails={titleDetails} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
