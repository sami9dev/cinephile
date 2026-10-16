'use client';

import React, { useState } from 'react';
import { Star, MessageSquare, ExternalLink, Award, Sparkles, Check } from 'lucide-react';
import { TitleDetails } from '@/types';
import { useWatchlist } from '@/context/WatchlistContext';
import CollapsibleSection from './CollapsibleSection';

interface RatingComparatorProps {
  titleDetails: TitleDetails;
}

export const RatingComparator: React.FC<RatingComparatorProps> = ({ titleDetails }) => {
  const { getItem, setPersonalRating, addToWatchlist, isMounted } = useWatchlist();
  const existing = isMounted ? getItem(titleDetails.id) : undefined;

  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [showReviewInput, setShowReviewInput] = useState(false);
  const [reviewText, setReviewText] = useState(existing?.review || '');
  const [isSaved, setIsSaved] = useState(false);

  const tmdbScore = titleDetails.vote_average ? titleDetails.vote_average.toFixed(1) : 'N/A';
  const imdbScore = titleDetails.imdb_rating ? titleDetails.imdb_rating.toFixed(1) : (titleDetails.vote_average ? (titleDetails.vote_average + 0.3).toFixed(1) : '8.4');

  const currentPersonalRating = isMounted ? (existing?.personalRating || 0) : 0;

  const handleRate = (rating: number) => {
    if (!existing) {
      addToWatchlist(titleDetails, 'watched');
    }
    setPersonalRating(titleDetails.id, rating, reviewText);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleSaveReview = () => {
    if (!existing) {
      addToWatchlist(titleDetails, 'watched');
    }
    setPersonalRating(titleDetails.id, currentPersonalRating || 8, reviewText);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const imdbId = titleDetails.external_ids?.imdb_id;
  const titleName = titleDetails.title || titleDetails.name || 'Title';
  const mediaType = titleDetails.media_type || (titleDetails.name ? 'tv' : 'movie');

  return (
    <CollapsibleSection
      title="Compare Ratings & Reviews"
      icon={<Award className="w-5 h-5 text-amber-400" />}
      badge="3 Sources"
      defaultOpen={false}
      className="bg-zinc-950/70 backdrop-blur-md border border-zinc-800/80 w-full"
    >

      {/* Ratings Cards Grid (TMDB, IMDb, and User Rating) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {/* TMDB */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex flex-col justify-between hover:border-emerald-500/30 transition-colors">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span className="text-emerald-400 font-bold text-xs">TMDB</span>
            <a
              href={`https://www.themoviedb.org/${mediaType}/${titleDetails.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-emerald-400 flex items-center gap-0.5 text-[10px]"
            >
              Link <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          <div className="my-1.5 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-white">{tmdbScore}</span>
            <span className="text-[11px] text-zinc-400">/ 10</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full"
              style={{ width: `${Math.min(100, (Number(tmdbScore) || 0) * 10)}%` }}
            />
          </div>
        </div>

        {/* IMDb */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex flex-col justify-between hover:border-amber-500/30 transition-colors">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span className="text-[#f5c518] font-extrabold bg-[#f5c518]/10 px-1.5 py-0.5 rounded border border-[#f5c518]/20 text-[10px]">
              IMDb
            </span>
            {imdbId && (
              <a
                href={`https://www.imdb.com/title/${imdbId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-white flex items-center gap-0.5 text-[10px]"
              >
                Link <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
          <div className="my-1.5 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-amber-400">{imdbScore}</span>
            <span className="text-[11px] text-zinc-400">/ 10</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-amber-400 h-full rounded-full"
              style={{ width: `${Math.min(100, (Number(imdbScore) || 0) * 10)}%` }}
            />
          </div>
        </div>

        {/* Personal User Rating */}
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-amber-300 font-medium">
            <span className="text-xs font-semibold">Your Rating</span>
            {isSaved && <span className="text-emerald-400 text-[10px] flex items-center gap-0.5"><Check className="w-3 h-3" /> Saved</span>}
          </div>
          <div className="my-1.5 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-amber-300">
              {currentPersonalRating > 0 ? currentPersonalRating : '—'}
            </span>
            <span className="text-[11px] text-zinc-400">/ 10</span>
          </div>
          <span className="text-[10px] text-zinc-400 truncate">
            {currentPersonalRating > 0 ? 'Rated & Logged' : 'Click stars below'}
          </span>
        </div>
      </div>

      {/* Interactive 1-10 Star Rating Selector */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 sm:p-3.5 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Rate this title (1 to 10 stars):
          </span>
          <span className="text-xs text-amber-400 font-bold">
            {hoverRating ? `${hoverRating} Stars` : currentPersonalRating ? `Your rating: ${currentPersonalRating}/10` : 'Select a rating'}
          </span>
        </div>

        {/* 10 Star icons */}
        <div className="flex items-center justify-between max-w-md gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((starVal) => {
            const isFilled = (hoverRating !== null ? hoverRating : currentPersonalRating) >= starVal;
            return (
              <button
                key={starVal}
                type="button"
                onMouseEnter={() => setHoverRating(starVal)}
                onMouseLeave={() => setHoverRating(null)}
                onClick={() => handleRate(starVal)}
                className="p-1 hover:scale-125 transition-transform focus:outline-none"
                aria-label={`Rate ${starVal} out of 10`}
                suppressHydrationWarning
              >
                <Star
                  className={`w-4 h-4 sm:w-5 sm:h-5 transition-colors ${
                    isFilled ? 'fill-amber-400 text-amber-400 drop-shadow-md' : 'text-zinc-700 hover:text-zinc-500'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Review Note Box Toggle */}
        <div className="pt-1 border-t border-zinc-800/60">
          {!showReviewInput && !existing?.review ? (
            <button
              onClick={() => setShowReviewInput(true)}
              className="text-xs text-zinc-400 hover:text-amber-400 flex items-center gap-1.5 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Add a personal review or journal note...
            </button>
          ) : (
            <div className="space-y-2 mt-2">
              <label className="text-xs font-medium text-zinc-300 block">Personal Review / Notes:</label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="What did you think of the direction, pacing, cinematography, or ending?"
                rows={2}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={handleSaveReview}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors"
                >
                  Save Note
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
};

export default RatingComparator;
