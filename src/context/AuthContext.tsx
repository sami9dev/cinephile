'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { UserProfile, CustomList, WatchlistItem, TitleDetails } from '@/types';

const INITIAL_GUEST_PROFILE: UserProfile = {
  uid: 'guest-user-default',
  email: 'cinephile@cinefuel.app',
  displayName: 'Cinema Explorer',
  photoURL: null,
  bio: 'Cinema lover exploring hidden gems, sci-fi masterpieces, and Indian blockbusters.',
  favoriteGenres: ['Sci-Fi', 'Drama', 'Action', 'Thriller'],
  createdAt: '2024-01-01T00:00:00Z',
  isGuest: true,
};

const INITIAL_CUSTOM_LISTS: CustomList[] = [];

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile;
  isLoading: boolean;
  isLoggedIn: boolean;
  loginWithGoogle: (customEmail?: string, customName?: string) => Promise<{ success: boolean; error?: string }>;
  loginWithEmail: (email: string, pass: string) => Promise<{ success: boolean; error?: string; notFound?: boolean }>;
  signupWithEmail: (email: string, pass: string, name: string) => Promise<{ success: boolean; error?: string; alreadyExists?: boolean }>;
  fastLogin: (email: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
  customLists: CustomList[];
  createCustomList: (title: string, description: string, isPublic?: boolean) => CustomList;
  deleteCustomList: (listId: string) => void;
  addTitleToCustomList: (listId: string, titleItem: TitleDetails) => void;
  removeTitleFromCustomList: (listId: string, titleId: number) => void;
  isTitleInCustomList: (listId: string, titleId: number) => boolean;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userProfile] = useState<UserProfile>(INITIAL_GUEST_PROFILE);
  const [customLists, setCustomLists] = useState<CustomList[]>(INITIAL_CUSTOM_LISTS);

  // Load custom lists from localStorage on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const storedLists = localStorage.getItem('cinefuel_custom_lists');
        if (storedLists) {
          const parsedLists = JSON.parse(storedLists);
          if (Array.isArray(parsedLists)) {
            setCustomLists(parsedLists);
          }
        }
      }
    } catch {}
  }, []);

  const saveLists = (lists: CustomList[]) => {
    setCustomLists(lists);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('cinefuel_custom_lists', JSON.stringify(lists));
      }
    } catch {}
  };

  const createCustomList = (title: string, description: string, isPublic = false): CustomList => {
    const newList: CustomList = {
      id: `list-${Date.now()}`,
      userId: INITIAL_GUEST_PROFILE.uid,
      title,
      description,
      isPublic,
      itemIds: [],
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [newList, ...customLists];
    saveLists(updated);
    return newList;
  };

  const deleteCustomList = (listId: string) => {
    const updated = customLists.filter((l) => l.id !== listId);
    saveLists(updated);
  };

  const addTitleToCustomList = (listId: string, titleItem: TitleDetails) => {
    const watchlistItem: WatchlistItem = {
      id: titleItem.id,
      title: titleItem.title || titleItem.name || 'Untitled',
      poster_path: titleItem.poster_path || null,
      backdrop_path: titleItem.backdrop_path || null,
      release_date: titleItem.release_date || titleItem.first_air_date || '',
      mediaType: (titleItem.media_type as 'movie' | 'tv') || 'movie',
      vote_average: titleItem.vote_average || 0,
      isFavorite: false,
      status: 'watchlist',
      addedAt: new Date().toISOString(),
      customLinks: [],
    };

    const updated = customLists.map((l) => {
      if (l.id === listId) {
        const exists = l.items.some((item) => item.id === titleItem.id);
        if (exists) return l;
        return {
          ...l,
          itemIds: [...l.itemIds, titleItem.id],
          items: [...l.items, watchlistItem],
          updatedAt: new Date().toISOString(),
        };
      }
      return l;
    });
    saveLists(updated);
  };

  const removeTitleFromCustomList = (listId: string, titleId: number) => {
    const updated = customLists.map((l) => {
      if (l.id === listId) {
        return {
          ...l,
          itemIds: l.itemIds.filter((id) => id !== titleId),
          items: l.items.filter((item) => item.id !== titleId),
          updatedAt: new Date().toISOString(),
        };
      }
      return l;
    });
    saveLists(updated);
  };

  const isTitleInCustomList = (listId: string, titleId: number): boolean => {
    const target = customLists.find((l) => l.id === listId);
    return target ? target.itemIds.includes(titleId) : false;
  };

  return (
    <AuthContext.Provider
      value={{
        user: null,
        userProfile,
        isLoading: false,
        isLoggedIn: false,
        loginWithGoogle: async () => ({ success: false, error: 'Authentication disabled' }),
        loginWithEmail: async () => ({ success: false, error: 'Authentication disabled' }),
        signupWithEmail: async () => ({ success: false, error: 'Authentication disabled' }),
        fastLogin: async () => ({ success: false, error: 'Authentication disabled' }),
        logout: async () => {},
        updateProfileData: async () => {},
        customLists,
        createCustomList,
        deleteCustomList,
        addTitleToCustomList,
        removeTitleFromCustomList,
        isTitleInCustomList,
        getIdToken: async () => null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
