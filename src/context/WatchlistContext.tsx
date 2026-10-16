'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { WatchlistItem, CustomLink, AppSettings, TitleDetails } from '@/types';

const DEFAULT_SETTINGS: AppSettings = {
  tmdbApiKey: '',
  omdbApiKey: '',
  defaultRegion: 'IN',
  theme: 'dark',
};

const INITIAL_WATCHLIST: WatchlistItem[] = [
  {
    id: 872585,
    mediaType: 'movie',
    title: 'Oppenheimer',
    poster_path: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    backdrop_path: '/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
    release_date: '2023-07-21',
    vote_average: 8.1,
    status: 'watched',
    isFavorite: true,
    personalRating: 9.5,
    review: 'Masterpiece of modern cinema. Visuals and sound design are unmatched.',
    watchedAt: '2024-01-15T20:30:00Z',
    addedAt: '2023-08-01T10:00:00Z',
    genres: ['Drama', 'History', 'Thriller'],
    runtime: 180,
    customLinks: [
      {
        id: 'link-1',
        title: 'Making of Oppenheimer - YouTube',
        url: 'https://www.youtube.com/watch?v=uYPbbksJxIg',
        category: 'Official',
        createdAt: '2024-01-16T12:00:00Z',
      },
      {
        id: 'link-2',
        title: 'Reddit Discussion Thread',
        url: 'https://reddit.com/r/movies/comments/155i9s9/official_discussion_oppenheimer_spoilers/',
        category: 'Discussion',
        createdAt: '2024-01-16T12:05:00Z',
      },
    ],
  },
  {
    id: 693134,
    mediaType: 'movie',
    title: 'Dune: Part Two',
    poster_path: '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    backdrop_path: '/xOMo8BRK7PfcJv9JCnx7s520QIq.jpg',
    release_date: '2024-03-01',
    vote_average: 8.3,
    status: 'watchlist',
    isFavorite: true,
    addedAt: '2024-02-28T09:00:00Z',
    genres: ['Sci-Fi', 'Adventure', 'Drama'],
    runtime: 166,
    customLinks: [
      {
        id: 'link-3',
        title: 'Book vs Movie Analysis',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        category: 'Review',
        createdAt: '2024-03-02T15:00:00Z',
      },
    ],
  },
  {
    id: 1396,
    mediaType: 'tv',
    title: 'Breaking Bad',
    poster_path: '/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg',
    backdrop_path: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
    release_date: '2008-01-20',
    vote_average: 8.9,
    status: 'watched',
    isFavorite: true,
    personalRating: 10,
    review: 'Arguably the greatest television series ever made. Unparalleled writing.',
    watchedAt: '2023-11-20T22:00:00Z',
    addedAt: '2023-10-01T00:00:00Z',
    genres: ['Drama', 'Crime'],
    runtime: 47,
    customLinks: [],
  },
  {
    id: 157336,
    mediaType: 'movie',
    title: 'Interstellar',
    poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdrop_path: '/rAiYTAppmDnUTBnv87RiZHagM9H.jpg',
    release_date: '2014-11-07',
    vote_average: 8.4,
    status: 'watched',
    isFavorite: true,
    personalRating: 9.8,
    review: 'Hans Zimmer score and emotional father-daughter bond elevate this sci-fi titan.',
    watchedAt: '2023-12-10T21:00:00Z',
    addedAt: '2023-09-01T00:00:00Z',
    genres: ['Adventure', 'Drama', 'Sci-Fi'],
    runtime: 169,
    customLinks: [],
  },
];

interface WatchlistStats {
  totalItems: number;
  watchedCount: number;
  watchlistCount: number;
  favoritesCount: number;
  totalRuntimeMinutes: number;
  averageRating: number;
}

interface WatchlistContextType {
  watchlist: WatchlistItem[];
  stats: WatchlistStats;
  settings: AppSettings;
  isMounted: boolean;
  addToWatchlist: (item: TitleDetails, initialStatus?: 'watchlist' | 'watched') => void;
  removeFromWatchlist: (id: number) => void;
  toggleStatus: (id: number, status?: 'watchlist' | 'watched') => void;
  toggleFavorite: (id: number) => void;
  setPersonalRating: (id: number, rating: number, review?: string) => void;
  getItem: (id: number) => WatchlistItem | undefined;
  isItemInWatchlist: (id: number) => boolean;
  addCustomLink: (titleId: number, link: Omit<CustomLink, 'id' | 'createdAt'>) => void;
  removeCustomLink: (titleId: number, linkId: string) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

export const WatchlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(INITIAL_WATCHLIST);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isMounted, setIsMounted] = useState(false);

  // Load from localStorage on mount (read-only, zero redundant disk writes)
  useEffect(() => {
    try {
      const storedWatchlist = localStorage.getItem('cinefuel_watchlist');
      if (storedWatchlist) {
        setWatchlist(JSON.parse(storedWatchlist));
      }

      const storedSettings = localStorage.getItem('cinefuel_settings');
      if (storedSettings) {
        setSettings((prev) => ({ ...prev, ...JSON.parse(storedSettings) }));
      }
    } catch (error) {
      console.error('Failed to load storage in CineFuel:', error);
    } finally {
      setIsMounted(true);
    }
  }, []);

  // Save to localStorage ONLY when state updates after mount (skip initial render cycle)
  const isFirstWatchlistSave = useRef(true);
  useEffect(() => {
    if (!isMounted) return;
    if (isFirstWatchlistSave.current) {
      isFirstWatchlistSave.current = false;
      return;
    }
    try {
      localStorage.setItem('cinefuel_watchlist', JSON.stringify(watchlist));
    } catch (e) {
      console.error('Failed to save watchlist to localStorage:', e);
    }
  }, [watchlist, isMounted]);

  const isFirstSettingsSave = useRef(true);
  useEffect(() => {
    if (!isMounted) return;
    if (isFirstSettingsSave.current) {
      isFirstSettingsSave.current = false;
      return;
    }
    try {
      localStorage.setItem('cinefuel_settings', JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings to localStorage:', e);
    }
  }, [settings, isMounted]);

  // Watchlist Actions
  const addToWatchlist = (item: TitleDetails, initialStatus: 'watchlist' | 'watched' = 'watchlist') => {
    setWatchlist((prev) => {
      const existingIndex = prev.findIndex((w) => w.id === item.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          status: initialStatus,
          watchedAt: initialStatus === 'watched' ? new Date().toISOString() : updated[existingIndex].watchedAt,
        };
        return updated;
      }

      const newItem: WatchlistItem = {
        id: item.id,
        mediaType: item.media_type || (item.name ? 'tv' : 'movie'),
        title: item.title || item.name || 'Untitled',
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        release_date: item.release_date || item.first_air_date || '',
        vote_average: item.vote_average || 0,
        status: initialStatus,
        isFavorite: false,
        addedAt: new Date().toISOString(),
        watchedAt: initialStatus === 'watched' ? new Date().toISOString() : undefined,
        genres: item.genres?.map((g) => g.name) || [],
        runtime: item.runtime || (item.episode_run_time?.[0] || 45),
        customLinks: [],
      };

      return [newItem, ...prev];
    });
  };

  const removeFromWatchlist = (id: number) => {
    setWatchlist((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleStatus = (id: number, targetStatus?: 'watchlist' | 'watched') => {
    setWatchlist((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextStatus = targetStatus || (item.status === 'watched' ? 'watchlist' : 'watched');
          return {
            ...item,
            status: nextStatus,
            watchedAt: nextStatus === 'watched' ? item.watchedAt || new Date().toISOString() : undefined,
          };
        }
        return item;
      })
    );
  };

  const toggleFavorite = (id: number) => {
    setWatchlist((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return { ...item, isFavorite: !item.isFavorite };
        }
        return item;
      })
    );
  };

  const setPersonalRating = (id: number, rating: number, review?: string) => {
    setWatchlist((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            personalRating: rating,
            review: review !== undefined ? review : item.review,
            status: 'watched',
            watchedAt: item.watchedAt || new Date().toISOString(),
          };
        }
        return item;
      })
    );
  };

  const getItem = (id: number) => {
    return watchlist.find((i) => i.id === id);
  };

  const isItemInWatchlist = (id: number) => {
    return watchlist.some((i) => i.id === id);
  };

  const addCustomLink = (titleId: number, link: Omit<CustomLink, 'id' | 'createdAt'>) => {
    const newLink: CustomLink = {
      ...link,
      id: `link-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    setWatchlist((prev) => {
      const existing = prev.find((i) => i.id === titleId);
      if (existing) {
        return prev.map((item) => {
          if (item.id === titleId) {
            return {
              ...item,
              customLinks: [...(item.customLinks || []), newLink],
            };
          }
          return item;
        });
      }
      return prev;
    });
  };

  const removeCustomLink = (titleId: number, linkId: string) => {
    setWatchlist((prev) =>
      prev.map((item) => {
        if (item.id === titleId) {
          return {
            ...item,
            customLinks: (item.customLinks || []).filter((l) => l.id !== linkId),
          };
        }
        return item;
      })
    );
  };

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  // Derived statistics
  const stats = useMemo(() => {
    const totalItems = watchlist.length;
    const watchedItems = watchlist.filter((w) => w.status === 'watched');
    const watchedCount = watchedItems.length;
    const watchlistCount = watchlist.filter((w) => w.status === 'watchlist').length;
    const favoritesCount = watchlist.filter((w) => w.isFavorite).length;

    const totalRuntimeMinutes = watchedItems.reduce((acc, curr) => acc + (curr.runtime || 90), 0);

    const ratedItems = watchlist.filter((w) => typeof w.personalRating === 'number' && w.personalRating > 0);
    const averageRating =
      ratedItems.length > 0
        ? Number((ratedItems.reduce((acc, curr) => acc + (curr.personalRating || 0), 0) / ratedItems.length).toFixed(1))
        : 0;

    return {
      totalItems,
      watchedCount,
      watchlistCount,
      favoritesCount,
      totalRuntimeMinutes,
      averageRating,
    };
  }, [watchlist]);

  return (
    <WatchlistContext.Provider
      value={{
        watchlist,
        stats,
        settings,
        isMounted,
        addToWatchlist,
        removeFromWatchlist,
        toggleStatus,
        toggleFavorite,
        setPersonalRating,
        getItem,
        isItemInWatchlist,
        addCustomLink,
        removeCustomLink,
        updateSettings,
      }}
    >
      {children}
    </WatchlistContext.Provider>
  );
};

export const useWatchlist = () => {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
};
