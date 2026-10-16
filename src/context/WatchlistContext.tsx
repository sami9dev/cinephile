'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { WatchlistItem, CustomLink, AppSettings, TitleDetails } from '@/types';

const DEFAULT_SETTINGS: AppSettings = {
  tmdbApiKey: '',
  omdbApiKey: '',
  defaultRegion: 'IN',
  theme: 'dark',
};

const INITIAL_WATCHLIST: WatchlistItem[] = [];

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
        const parsed = JSON.parse(storedWatchlist);
        if (Array.isArray(parsed)) {
          // If watchlist only contains the legacy mock items (Oppenheimer, Dune, Breaking Bad, Interstellar), clear it
          const DEMO_IDS = new Set([872585, 693134, 1396, 157336]);
          const hasOnlyDemos = parsed.length > 0 && parsed.every((p: any) => DEMO_IDS.has(p.id));
          if (hasOnlyDemos) {
            localStorage.removeItem('cinefuel_watchlist');
            setWatchlist([]);
          } else {
            setWatchlist(parsed);
          }
        }
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
