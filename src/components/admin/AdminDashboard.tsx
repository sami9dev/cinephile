'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Shield,
  ShieldCheck,
  Key,
  Database,
  Link2,
  Trash2,
  Edit,
  ExternalLink,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Film,
  Tv,
  Users,
  Layers,
  Settings,
  Download,
  Upload,
  Lock,
  Unlock,
  Check,
  Copy,
  Sparkles,
  Server,
  Activity,
  Globe,
  Star,
  Search,
  Tag,
  Eye,
  EyeOff,
  User,
  UserCheck,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  Clock,
  Zap,
  ListPlus,
  LayoutGrid,
  LayoutDashboard,
  Inbox,
  MessageSquare,
  CheckCircle,
  Link2Off,
  Wrench,
  ShieldAlert,
  FileWarning,
  Home,
  FileText,
  Code2,
  Settings2,
  Send,
} from 'lucide-react';
import { useWatchlist } from '@/context/WatchlistContext';
import { useAuth } from '@/context/AuthContext';
import { CustomLink, CustomList, TitleDetails, UserRequest, DefectiveLinkReport, RegisteredUser } from '@/types';
import { MOCK_TITLES, TRENDING_LIST } from '@/lib/mockData';
import { getImageURL, getBackdropURL, searchMulti, getTitleDetails, getActiveTmdbKey } from '@/lib/tmdb';
import { BUILTIN_CURATED_LINKS, saveGlobalCustomLink, saveMultipleGlobalCustomLinks, deleteGlobalCustomLink, deleteMultipleGlobalCustomLinks, getDeletedLinkIds, syncServerLinks, replaceAllGlobalCustomLinks, deleteAllGlobalCustomLinks } from '@/lib/curatedLinks';
import { safeSetLocalStorage, safeGetLocalStorage, safeRemoveLocalStorage } from '@/lib/safeStorage';
import { parseFullMediaTitle, parseBulkLinksInput, ParsedBulkItem, isPackMedia, isPackUrl } from '@/lib/seasonParser';
import { parseReleaseDetails } from '@/lib/releaseParser';
import { detectServer } from '@/lib/serverDetector';
import { AdminFilmReelGraphic } from '@/components/admin/AdminFilmReelGraphic';
import { AdminCinemaSilhouetteGraphic } from '@/components/admin/AdminCinemaSilhouetteGraphic';
import { ServiceStatusPanel } from '@/components/admin/ServiceStatusPanel';

const DEFAULT_ADMIN_USER = 'shyam';

export interface LinkedCatalogTitle {
  id: number | string;
  title: string;
  name?: string;
  media_type: 'movie' | 'tv';
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  year?: string;
  linksCount: number;
  overview?: string;
  uploadMeta?: any;
}

interface PinnedTitle {
  id: number;
  title: string;
  media_type: 'movie' | 'tv';
  year: string;
  poster_path?: string | null;
}

// Initial Quick-Select Titles for 1-Click Access
const PINNED_TITLES: PinnedTitle[] = [
  { id: 872585, title: 'Oppenheimer', media_type: 'movie', year: '2023', poster_path: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg' },
  { id: 693134, title: 'Dune: Part Two', media_type: 'movie', year: '2024', poster_path: '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg' },
  { id: 61889, title: "Marvel's Daredevil", media_type: 'tv', year: '2015', poster_path: '/QWbPaDxiB6LW2LjASknzYBvjMj.jpg' },
  { id: 88396, title: 'Loki', media_type: 'tv', year: '2021', poster_path: '/kEl2t3OhXc3cm9hwvGuh8sqNVeb.jpg' },
  { id: 108978, title: 'Reacher', media_type: 'tv', year: '2022', poster_path: '/j733mRndJhu3i81fO0h69Bt0a8f.jpg' },
  { id: 113962, title: 'Special Ops: Lioness', media_type: 'tv', year: '2023', poster_path: '/eW9T8L1j5K7B6r3p1x8k7l0o5y.jpg' },
  { id: 1396, title: 'Breaking Bad', media_type: 'tv', year: '2008', poster_path: '/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg' },
  { id: 157336, title: 'Interstellar', media_type: 'movie', year: '2014', poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg' },
  { id: 155, title: 'The Dark Knight', media_type: 'movie', year: '2008', poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg' },
  { id: 27205, title: 'Inception', media_type: 'movie', year: '2010', poster_path: '/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg' },
  { id: 579974, title: 'RRR', media_type: 'movie', year: '2022', poster_path: '/nEufeZlyAOLqO2brrs0yeBEoo0R.jpg' },
];

interface BackdropTheme {
  name: string;
  editionTag: string;
  quote: string;
  backdropPath: string;
}

const BACKDROP_THEMES: Record<string, BackdropTheme> = {
  spiderman: {
    name: 'Spider-Man',
    editionTag: 'SPIDER-MAN : NO WAY HOME EDITION',
    quote: '“With great power comes great responsibility.”',
    backdropPath: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
  },
  dune: {
    name: 'Dune: Part Two',
    editionTag: 'DUNE : PART TWO EDITION',
    quote: '“Long live the fighters.”',
    backdropPath: '/xOMo8BRK7PfcJv9JCnx7s520fff.jpg',
  },
  oppenheimer: {
    name: 'Oppenheimer',
    editionTag: 'OPPENHEIMER CINEMATIC EDITION',
    quote: '“Now I am become Death, the destroyer of worlds.”',
    backdropPath: '/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
  },
  interstellar: {
    name: 'Interstellar',
    editionTag: 'INTERSTELLAR COSMIC EDITION',
    quote: '“Mankind was born on Earth. It was never meant to die here.”',
    backdropPath: '/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
  },
};

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Recently';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Recently';
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return 'Recently';
  }
}

function formatDateSafe(dateStr?: string | null): string {
  if (!dateStr) return 'Active Session';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 'Active Session' : d.toLocaleDateString();
  } catch {
    return 'Active Session';
  }
}

function formatDateTimeSafe(isoString?: string | null): string {
  if (!isoString) return 'Recently';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}

export default function AdminDashboard({ onLogout }: { onLogout?: () => void } = {}) {
  const {
    watchlist,
    addCustomLink,
    removeCustomLink,
    mdblistConfig,
    updateMdblistConfig,
    stats,
    isMounted,
  } = useWatchlist();

  const { userProfile, isLoggedIn } = useAuth();

  // Local state for standalone custom links map & custom lists
  const [customLinksMap, setCustomLinksMap] = useState<Record<string, CustomLink[]>>({});
  const [customLists, setCustomLists] = useState<CustomList[]>([]);

  // Known title metadata cache (maps TMDB ID to Title Info)
  const [knownTitlesCache, setKnownTitlesCache] = useState<Record<number, { title: string; poster_path?: string | null; media_type?: 'movie' | 'tv'; year?: string }>>({});

  // Admin Auth Gate State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [adminUser] = useState(DEFAULT_ADMIN_USER);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedBackdropTheme, setSelectedBackdropTheme] = useState<'spiderman' | 'dune' | 'oppenheimer' | 'interstellar'>('spiderman');

  // Tabs: 'overview' | 'links' | 'titles' | 'requests' | 'reports' | 'users' | 'apis' | 'backup' | 'logs'
  const [activeTab, setActiveTab] = useState<'overview' | 'links' | 'titles' | 'requests' | 'reports' | 'users' | 'apis' | 'backup' | 'logs'>('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // API Form States
  const [tmdbKey, setTmdbKey] = useState('');
  const [apiSaveSuccess, setApiSaveSuccess] = useState(false);
  const [isTestingTmdb, setIsTestingTmdb] = useState(false);
  const [tmdbTestResult, setTmdbTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  // Users Directory state
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userFilterCategory, setUserFilterCategory] = useState<'all' | 'requesters' | 'reporters'>('all');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const handleCopyUid = (uid: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(uid);
      setCopiedUid(uid);
      setTimeout(() => setCopiedUid(null), 2000);
    }
  };

  // Links Moderation Filter, Search & Pagination
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkCategoryFilter, setLinkCategoryFilter] = useState('All');
  const [linksCurrentPage, setLinksCurrentPage] = useState<number>(1);
  const [linksPerPage, setLinksPerPage] = useState<number>(50);
  const [totalServerLinksCount, setTotalServerLinksCount] = useState<number>(0);
  const [isRefreshingLinks, setIsRefreshingLinks] = useState(false);
  const [deletedCuratedLinkIds, setDeletedCuratedLinkIds] = useState<Set<string>>(new Set());
  const attemptedTitleFetchRef = useRef<Set<number>>(new Set());

  // Mode in Manage Links: 'single' vs 'bulk' vs 'grid'
  const [addLinkMode, setAddLinkMode] = useState<'single' | 'bulk' | 'grid'>('single');

  // Universal Target Title Live Search & Selection State
  const [selectedTargetTitle, setSelectedTargetTitle] = useState<{
    id: number;
    title: string;
    media_type: 'movie' | 'tv';
    poster_path?: string | null;
    backdrop_path?: string | null;
    year?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
  }>(PINNED_TITLES[0]);

  const [targetSearchQuery, setTargetSearchQuery] = useState('');
  const [targetSearchResults, setTargetSearchResults] = useState<TitleDetails[]>([]);
  const [targetMediaTypeFilter, setTargetMediaTypeFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [isSearchingTarget, setIsSearchingTarget] = useState(false);
  const [isTargetDropdownOpen, setIsTargetDropdownOpen] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  // Live Database Linked Titles State
  const [linkedCatalogTitles, setLinkedCatalogTitles] = useState<LinkedCatalogTitle[]>([]);
  const [isLoadingLinkedTitles, setIsLoadingLinkedTitles] = useState(false);
  const [linkedTitlesTotal, setLinkedTitlesTotal] = useState(0);
  const [linkedTitlesPage, setLinkedTitlesPage] = useState(1);
  const [linkedTitlesTotalPages, setLinkedTitlesTotalPages] = useState(1);
  const [linkedTitlesFilter, setLinkedTitlesFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [linkedTitlesSearch, setLinkedTitlesSearch] = useState('');
  const [quickJumpSearch, setQuickJumpSearch] = useState('');
  const [titlesViewMode, setTitlesViewMode] = useState<'linked' | 'tmdb'>('linked');
  const [isRawLinksTableOpen, setIsRawLinksTableOpen] = useState(false);

  // Dedicated Title Manager & Whole Link Replacement Modal State
  const [titleManagerModalOpen, setTitleManagerModalOpen] = useState(false);
  const [managingTitle, setManagingTitle] = useState<LinkedCatalogTitle | null>(null);
  const [managingTitleLinks, setManagingTitleLinks] = useState<CustomLink[]>([]);
  const [isLoadingManagingLinks, setIsLoadingManagingLinks] = useState(false);
  const [titleManagerTab, setTitleManagerTab] = useState<'view' | 'replace' | 'domain' | 'add' | 'edit_title' | 'trakt_episodes'>('view');
  const [titleLinksSearch, setTitleLinksSearch] = useState('');

  // Title Metadata Direct Editing State (without TMDB search)
  const [editTitleName, setEditTitleName] = useState('');
  const [editTitleYear, setEditTitleYear] = useState('');
  const [editTitleMediaType, setEditTitleMediaType] = useState<'movie' | 'tv'>('tv');
  const [editTitleId, setEditTitleId] = useState('');
  const [editTitlePoster, setEditTitlePoster] = useState('');
  const [editTitleBackdrop, setEditTitleBackdrop] = useState('');
  const [editTitleOverview, setEditTitleOverview] = useState('');
  const [isSavingTitleMeta, setIsSavingTitleMeta] = useState(false);
  const [titleMetaMsg, setTitleMetaMsg] = useState('');
  const [titleMetaError, setTitleMetaError] = useState('');

  // TMDB Interactive Search & Selective Link Reassignment States
  const [tmdbSearchQuery, setTmdbSearchQuery] = useState('');
  const [tmdbSearchResults, setTmdbSearchResults] = useState<any[]>([]);
  const [isSearchingTmdb, setIsSearchingTmdb] = useState(false);
  const [tmdbSearchError, setTmdbSearchError] = useState('');
  const [proposedTmdbCandidate, setProposedTmdbCandidate] = useState<any | null>(null);
  const [selectedReassignLinkIds, setSelectedReassignLinkIds] = useState<string[]>([]);
  const [isReassigningLinks, setIsReassigningLinks] = useState(false);
  const [reassignMsg, setReassignMsg] = useState('');
  const [reassignError, setReassignError] = useState('');

  // Link Inspection Drawer/Modal State
  const [inspectingLink, setInspectingLink] = useState<CustomLink | null>(null);

  // Link & Title Deletion Confirmation Modal States
  const [linkToDelete, setLinkToDelete] = useState<{ id: string; title: string; url: string; movieId: string | number } | null>(null);
  const [titleToDelete, setTitleToDelete] = useState<LinkedCatalogTitle | null>(null);
  const [deleteTitleConfirmChecked, setDeleteTitleConfirmChecked] = useState(false);

  // Trakt TV Episode Titles State
  const [traktSeason, setTraktSeason] = useState(1);
  const [traktEpisode, setTraktEpisode] = useState(1);
  const [traktShowId, setTraktShowId] = useState('');
  const [traktFetchedTitle, setTraktFetchedTitle] = useState('');
  const [traktOverview, setTraktOverview] = useState('');
  const [traktShowTitle, setTraktShowTitle] = useState('');
  const [isTraktLoading, setIsTraktLoading] = useState(false);
  const [isTraktSaving, setIsTraktSaving] = useState(false);
  const [traktMsg, setTraktMsg] = useState('');
  const [traktError, setTraktError] = useState('');
  const [traktSeasonEpisodes, setTraktSeasonEpisodes] = useState<
    Array<{ episodeNumber: number; title: string; overview?: string; traktId?: number }>
  >([]);

  // Batch Official Titles Sync & Verification State
  const [traktViewMode, setTraktViewMode] = useState<'single' | 'batch'>('single');
  const [batchEpisodeDiff, setBatchEpisodeDiff] = useState<
    Array<{
      seasonNumber: number;
      episodeNumber: number;
      currentEpisodeTitle: string | null;
      sampleReleaseTitle: string;
      linkCount: number;
      urlsIntact: boolean;
      proposedOfficialTitle: string;
      proposedHeading: string;
      source: 'imdb' | 'tvmaze' | 'tmdb' | 'trakt' | 'manual' | 'stored' | 'fallback';
      isVerified: boolean;
      manualTitleVerified?: boolean;
      status: 'clean' | 'needs_update' | 'unverified';
      overview?: string;
    }>
  >([]);
  const [isBatchVerifying, setIsBatchVerifying] = useState(false);
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [batchApplySuccessMsg, setBatchApplySuccessMsg] = useState('');
  const [batchApplyErrorMsg, setBatchApplyErrorMsg] = useState('');
  const [batchFilterStatus, setBatchFilterStatus] = useState<'all' | 'needs_update' | 'unverified'>('all');
  const [batchTargetSeason, setBatchTargetSeason] = useState<number | 'all'>('all');
  const [batchForceOverwrite, setBatchForceOverwrite] = useState(false);

  // Whole Link Replacement State
  const [replaceRawLinksText, setReplaceRawLinksText] = useState('');
  const [replaceParsedItems, setReplaceParsedItems] = useState<ParsedBulkItem[]>([]);
  const [isReplacingLinks, setIsReplacingLinks] = useState(false);
  const [replaceLinksMode, setReplaceLinksMode] = useState<'replace' | 'append'>('replace');
  const [replaceSuccessMsg, setReplaceSuccessMsg] = useState('');
  const [replaceErrorMsg, setReplaceErrorMsg] = useState('');

  // Title Domain Migration State
  const [titleOldDomain, setTitleOldDomain] = useState('');
  const [titleNewDomain, setTitleNewDomain] = useState('');
  const [isMigratingTitleDomain, setIsMigratingTitleDomain] = useState(false);
  const [titleDomainMsg, setTitleDomainMsg] = useState('');

  // Title Add Single Link State
  const [titleAddLinkTitle, setTitleAddLinkTitle] = useState('');
  const [titleAddLinkUrl, setTitleAddLinkUrl] = useState('');
  const [titleAddLinkCategory, setTitleAddLinkCategory] = useState<CustomLink['category']>('SingleEpisode');
  const [titleAddLinkQuality, setTitleAddLinkQuality] = useState('1080p');
  const [titleAddLinkAudio, setTitleAddLinkAudio] = useState('Hindi + English');
  const [titleAddLinkSeason, setTitleAddLinkSeason] = useState(1);
  const [titleAddLinkEpisode, setTitleAddLinkEpisode] = useState(1);
  const [titleAddLinkType, setTitleAddLinkType] = useState<'zip_pack' | 'single_episode' | 'general'>('single_episode');
  const [isAddingSingleTitleLink, setIsAddingSingleTitleLink] = useState(false);
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);
  const [isDeletingAllLinks, setIsDeletingAllLinks] = useState(false);

  // Manual Custom Title Creation State (for titles not in TMDB or title mismatches)
  const [isManualTitleModalOpen, setIsManualTitleModalOpen] = useState(false);
  const [manualTitleName, setManualTitleName] = useState('');
  const [manualMediaType, setManualMediaType] = useState<'movie' | 'tv'>('movie');
  const [manualYear, setManualYear] = useState('');
  const [manualPoster, setManualPoster] = useState('');

  // New Link Quick Add State
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkCategory, setNewLinkCategory] = useState<CustomLink['category']>('SingleEpisode');
  const [newLinkSeason, setNewLinkSeason] = useState(1);
  const [newLinkEpisode, setNewLinkEpisode] = useState(1);
  const [newLinkType, setNewLinkType] = useState<'zip_pack' | 'single_episode' | 'general'>('single_episode');
  const [newLinkQuality, setNewLinkQuality] = useState('');
  const [newLinkAudio, setNewLinkAudio] = useState('');
  const [newLinkSize, setNewLinkSize] = useState('');
  const [addLinkSuccess, setAddLinkSuccess] = useState(false);

  // Bulk Multi-Link Importer State
  const [adminBulkRawText, setAdminBulkRawText] = useState('');
  const [adminBulkParsedItems, setAdminBulkParsedItems] = useState<ParsedBulkItem[]>([]);
  const [adminBulkSuccessMsg, setAdminBulkSuccessMsg] = useState('');
  const [adminBulkMediaType, setAdminBulkMediaType] = useState<'movie' | 'tv'>('movie');
  const [adminBulkMovieCategory, setAdminBulkMovieCategory] = useState<CustomLink['category']>('Streaming');

  // Admin Dynamic Episode Grid State (N Containers)
  const [adminGridSeason, setAdminGridSeason] = useState(1);
  const [adminGridEpisodeCount, setAdminGridEpisodeCount] = useState(8);
  const [adminGridBasePattern, setAdminGridBasePattern] = useState('');
  const [adminGridQuality, setAdminGridQuality] = useState('2160p 4K');
  const [adminGridAudio, setAdminGridAudio] = useState('Hindi + English 5.1');
  const [adminGridSize, setAdminGridSize] = useState('');
  const [adminGridBulkLinksText, setAdminGridBulkLinksText] = useState('');
  const [adminGridEpisodes, setAdminGridEpisodes] = useState<
    Array<{
      episodeNumber: number;
      title: string;
      url: string;
      quality: string;
      audio: string;
      size: string;
    }>
  >([]);
  const [adminGridSuccessMsg, setAdminGridSuccessMsg] = useState('');

  // Edit Link Modal State
  const [editingLink, setEditingLink] = useState<{ movieId: number; link: CustomLink } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editCategory, setEditCategory] = useState<CustomLink['category']>('Streaming');
  const [editSeason, setEditSeason] = useState<number>(1);
  const [editEpisode, setEditEpisode] = useState<number>(1);
  const [editType, setEditType] = useState<'zip_pack' | 'single_episode' | 'general'>('general');
  const [editQuality, setEditQuality] = useState('');
  const [editAudio, setEditAudio] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editContainer, setEditContainer] = useState('');
  const [editDynamicRange, setEditDynamicRange] = useState('');
  const [editCodec, setEditCodec] = useState('');
  const [editResolution, setEditResolution] = useState('');
  const [editProvider, setEditProvider] = useState('');

  // Multi-Select Links State for Bulk Deletion
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(new Set());

  // Manage Titles Tab Live Search State
  const [titleSearchQuery, setTitleSearchQuery] = useState('');
  const [manageTitlesResults, setManageTitlesResults] = useState<TitleDetails[]>([]);
  const [isSearchingManageTitles, setIsSearchingManageTitles] = useState(false);

  // User Requests Management States
  const [requestsList, setRequestsList] = useState<UserRequest[]>([]);
  const [requestsFilter, setRequestsFilter] = useState<'all' | 'pending' | 'fulfilled' | 'rejected'>('all');
  const [requestsSearchQuery, setRequestsSearchQuery] = useState('');
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Fulfill Modal State (Single, Bulk, & Grid Modes)
  const [fulfillingRequest, setFulfillingRequest] = useState<UserRequest | null>(null);
  const [fulfillMode, setFulfillMode] = useState<'single' | 'bulk' | 'grid'>('single');
  const [fulfillUrl, setFulfillUrl] = useState('');
  const [fulfillTitle, setFulfillTitle] = useState('');
  const [fulfillQuality, setFulfillQuality] = useState('');
  const [fulfillAudio, setFulfillAudio] = useState('');
  const [fulfillSize, setFulfillSize] = useState('');
  const [fulfillCategory, setFulfillCategory] = useState<CustomLink['category']>('Download');
  const [isFulfillingSubmit, setIsFulfillingSubmit] = useState(false);
  const [fulfillSuccessMsg, setFulfillSuccessMsg] = useState('');

  // Fulfill Bulk Auto-Detector States
  const [fulfillBulkRawText, setFulfillBulkRawText] = useState('');
  const [fulfillBulkParsedItems, setFulfillBulkParsedItems] = useState<ParsedBulkItem[]>([]);
  const [fulfillBulkMediaType, setFulfillBulkMediaType] = useState<'movie' | 'tv'>('movie');
  const [fulfillBulkMovieCategory, setFulfillBulkMovieCategory] = useState<CustomLink['category']>('Download');

  // Fulfill Episode Grid States
  const [fulfillGridSeason, setFulfillGridSeason] = useState(1);
  const [fulfillGridEpisodeCount, setFulfillGridEpisodeCount] = useState(8);
  const [fulfillGridBasePattern, setFulfillGridBasePattern] = useState('');
  const [fulfillGridQuality, setFulfillGridQuality] = useState('1080p WEB-DL');
  const [fulfillGridAudio, setFulfillGridAudio] = useState('Hindi + English');
  const [fulfillGridSize, setFulfillGridSize] = useState('');
  const [fulfillGridBulkLinksText, setFulfillGridBulkLinksText] = useState('');
  const [fulfillGridEpisodes, setFulfillGridEpisodes] = useState<
    Array<{
      episodeNumber: number;
      title: string;
      url: string;
      quality: string;
      audio: string;
      size: string;
    }>
  >([]);

  // Defective Links Management States
  const [reportsList, setReportsList] = useState<DefectiveLinkReport[]>([]);
  const [reportsFilter, setReportsFilter] = useState<'all' | 'pending' | 'fixed' | 'dismissed'>('all');
  const [reportsIssueFilter, setReportsIssueFilter] = useState<string>('all');
  const [reportsSearchQuery, setReportsSearchQuery] = useState('');
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);

  // Fix / Replace Link Modal State
  const [fixingReport, setFixingReport] = useState<DefectiveLinkReport | null>(null);
  const [replaceUrl, setReplaceUrl] = useState('');
  const [replaceTitle, setReplaceTitle] = useState('');
  const [replaceQuality, setReplaceQuality] = useState('');
  const [replaceAudio, setReplaceAudio] = useState('');
  const [replaceSize, setReplaceSize] = useState('');
  const [replaceAdminNote, setReplaceAdminNote] = useState('');
  const [updateDbWithReplacement, setUpdateDbWithReplacement] = useState(true);
  const [isFixingSubmit, setIsFixingSubmit] = useState(false);
  const [fixSuccessMsg, setFixSuccessMsg] = useState('');

  // Reassign & Title Mismatch States for Fix Modal
  const [replaceTargetTitle, setReplaceTargetTitle] = useState('');
  const [replaceTargetMediaType, setReplaceTargetMediaType] = useState<'movie' | 'tv'>('movie');
  const [replaceTargetMovieId, setReplaceTargetMovieId] = useState<number>(0);
  const [isChangingTarget, setIsChangingTarget] = useState(false);
  const [reassignSearchQuery, setReassignSearchQuery] = useState('');
  const [reassignSearchResults, setReassignSearchResults] = useState<TitleDetails[]>([]);
  const [isSearchingReassign, setIsSearchingReassign] = useState(false);

  // Admin Reply Modal State for Requests & Reports
  const [adminReplyTarget, setAdminReplyTarget] = useState<{
    type: 'request' | 'report';
    id: string;
    title: string;
    userEmail?: string;
    currentStatus: string;
  } | null>(null);
  const [adminReplyText, setAdminReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Diagnostics logs
  const [systemLogs, setSystemLogs] = useState<Array<{ timestamp: string; level: 'info' | 'success' | 'warn'; message: string }>>([
    { timestamp: 'Just now', level: 'success', message: 'Admin session initialized for Shyam.' },
    { timestamp: '1m ago', level: 'info', message: 'Bulk Multi-Link Auto-Detector Engine ready for batch episodes & zip packs.' },
    { timestamp: '2m ago', level: 'info', message: 'TMDB & MDBList engines operational.' },
  ]);

  // Validate Saved Admin Session Token with server on mount & purge legacy stored credentials
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('cinefuel_admin_pass');
        localStorage.removeItem('cinefuel_admin_key');
        localStorage.removeItem('cinefuel_admin_user');
        sessionStorage.removeItem('cinefuel_admin_pass');
        sessionStorage.removeItem('cinefuel_admin_auth');
        sessionStorage.removeItem('cinefuel_admin_user');
      } catch {}

      const sessionToken =
        sessionStorage.getItem('cinefuel_admin_token') ||
        localStorage.getItem('cinefuel_admin_token') ||
        localStorage.getItem('cinefuel_id_token');
      if (sessionToken) {
        fetch('/api/admin/auth', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.authenticated) {
              setIsAuthenticated(true);
            } else {
              sessionStorage.removeItem('cinefuel_admin_token');
              localStorage.removeItem('cinefuel_admin_token');
              setIsAuthenticated(false);
            }
          })
          .catch(() => {
            setIsAuthenticated(false);
          });
      }

      const storedSettings = localStorage.getItem('cinefuel_settings');
      if (storedSettings) {
        try {
          const parsed = JSON.parse(storedSettings);
          if (parsed.tmdbApiKey) setTmdbKey(parsed.tmdbApiKey);
        } catch {
          // ignore
        }
      }

      const storedLinks = safeGetLocalStorage('cinefuel_custom_links');
      if (storedLinks) {
        try {
          if (storedLinks.length > 200000) {
            safeRemoveLocalStorage('cinefuel_custom_links');
          } else {
            const parsed = JSON.parse(storedLinks);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              setCustomLinksMap(parsed);
            }
          }
        } catch {
          // ignore
        }
      }

      // Real-time live fetch of all cloud database links with pagination
      const fetchAllAdminLinks = async (
        page = 1,
        limit = 50,
        q = '',
        category = 'All',
        showLoading = false
      ) => {
        try {
          if (showLoading) setIsRefreshingLinks(true);
          const params = new URLSearchParams();
          params.set('page', String(page));
          params.set('limit', String(limit));
          if (q && q.trim()) params.set('q', q.trim());
          if (category && category !== 'All') params.set('category', category);
          params.set('_t', String(Date.now()));

          const res = await fetch(`/api/curated-links?${params.toString()}`, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (typeof data.total === 'number') {
              setTotalServerLinksCount(data.total);
            }
            if (data && data.allLinks && typeof data.allLinks === 'object' && !Array.isArray(data.allLinks)) {
              const currentDeleted = getDeletedLinkIds();
              const cleanedMap: Record<string, CustomLink[]> = {};
              for (const [k, arr] of Object.entries(data.allLinks)) {
                if (Array.isArray(arr)) {
                  const filtered = (arr as CustomLink[]).filter((l) => l && l.id && !currentDeleted.has(l.id));
                  if (filtered.length > 0) {
                    cleanedMap[k] = filtered;
                  }
                }
              }
              setCustomLinksMap(cleanedMap);
            }
          }
        } catch {} finally {
          if (showLoading) setIsRefreshingLinks(false);
        }
      };

      fetchAllAdminLinks(1, 50, '', 'All', false);
      fetchLinkedCatalogTitles(1, 'all', '', 48);
      const adminSyncInterval = setInterval(() => {
        fetchAllAdminLinks(1, 50, '', 'All', false);
        fetchLinkedCatalogTitles(1, 'all', '', 48);
      }, 30000);

      const storedLists = localStorage.getItem('cinefuel_custom_lists');
      if (storedLists) {
        try {
          const parsed = JSON.parse(storedLists);
          if (Array.isArray(parsed)) {
            setCustomLists(parsed);
          }
        } catch {
          // ignore
        }
      }

      const storedTitlesCache = localStorage.getItem('cinefuel_known_titles_cache');
      if (storedTitlesCache) {
        try {
          const parsed = JSON.parse(storedTitlesCache);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            setKnownTitlesCache(parsed);
          }
        } catch {
          // ignore
        }
      }

      setDeletedCuratedLinkIds(getDeletedLinkIds());

      // Initial fetch and interval for user requests
      fetchAdminRequests();
      const requestsSyncInterval = setInterval(fetchAdminRequests, 15000);

      // Initial fetch and interval for defective link reports
      fetchAdminReports();
      const reportsSyncInterval = setInterval(fetchAdminReports, 15000);

      // Initial fetch and interval for registered users
      fetchAdminUsers();
      const usersSyncInterval = setInterval(fetchAdminUsers, 20000);

      const handleLinksUpdated = () => {
        setDeletedCuratedLinkIds(getDeletedLinkIds());
        fetchAllAdminLinks();
        fetchAdminRequests();
        fetchAdminReports();
        fetchAdminUsers();
      };
      const handleReportsUpdated = () => {
        fetchAdminReports();
        fetchAdminUsers();
      };
      window.addEventListener('cinefuel_links_updated', handleLinksUpdated);
      window.addEventListener('cinefuel_report_submitted', handleReportsUpdated);
      return () => {
        clearInterval(adminSyncInterval);
        clearInterval(requestsSyncInterval);
        clearInterval(reportsSyncInterval);
        clearInterval(usersSyncInterval);
        window.removeEventListener('cinefuel_links_updated', handleLinksUpdated);
        window.removeEventListener('cinefuel_report_submitted', handleReportsUpdated);
      };
    }
  }, [mdblistConfig]);

  // Pre-seed known titles cache with pinned titles and mock titles
  useEffect(() => {
    const initialMap: Record<number, { title: string; poster_path?: string | null; media_type?: 'movie' | 'tv'; year?: string }> = { ...knownTitlesCache };
    PINNED_TITLES.forEach((pt) => {
      if (!initialMap[pt.id]) {
        initialMap[pt.id] = { title: pt.title, poster_path: pt.poster_path, media_type: pt.media_type, year: pt.year };
      }
    });
    Object.values(MOCK_TITLES).forEach((m) => {
      if (!initialMap[m.id]) {
        const year = (m.release_date || m.first_air_date || '').split('-')[0];
        initialMap[m.id] = { title: m.title || m.name || `Title #${m.id}`, poster_path: m.poster_path, media_type: ((m.media_type as any) || (m.name ? 'tv' : 'movie')) as 'movie' | 'tv', year };
      }
    });
    setKnownTitlesCache(initialMap);
  }, []);

  // Save cache helper (in-memory for speed, never triggers quota errors)
  const cacheTitle = (id: number, data: { title: string; poster_path?: string | null; media_type?: 'movie' | 'tv'; year?: string }) => {
    setKnownTitlesCache((prev) => ({ ...prev, [id]: data }));
  };

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setIsTargetDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced TMDB Live Search for Target Title Picker in "Add Custom Link"
  useEffect(() => {
    const query = targetSearchQuery.trim();
    if (!query) {
      setTargetSearchResults([]);
      setIsSearchingTarget(false);
      return;
    }

    const numericMatch = query.match(/^\d+$/) || query.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
    if (numericMatch) {
      const detectedId = Number(numericMatch[2] || numericMatch[0]);
      const explicitType = numericMatch[1] as 'movie' | 'tv' | undefined;
      setIsSearchingTarget(true);

      if (explicitType) {
        getTitleDetails(explicitType, detectedId).then((res) => {
          setIsSearchingTarget(false);
          if (res && (res.title || res.name)) {
            setTargetSearchResults([{ ...res, media_type: explicitType }]);
          }
        });
      } else {
        // Query both Movie and TV in parallel so TMDB ID lookup never fails!
        Promise.allSettled([
          getTitleDetails('movie', detectedId),
          getTitleDetails('tv', detectedId),
        ]).then(([mRes, tRes]) => {
          setIsSearchingTarget(false);
          const list: TitleDetails[] = [];
          if (mRes.status === 'fulfilled' && mRes.value && (mRes.value.title || mRes.value.name)) {
            list.push({ ...mRes.value, media_type: 'movie' });
          }
          if (tRes.status === 'fulfilled' && tRes.value && (tRes.value.title || tRes.value.name)) {
            list.push({ ...tRes.value, media_type: 'tv' });
          }
          setTargetSearchResults(list);
        });
      }
      return;
    }

    setIsSearchingTarget(true);
    const handler = setTimeout(async () => {
      try {
        const data = await searchMulti(query, 1);
        if (data && data.results) {
          let filtered = data.results.filter(
            (item): item is TitleDetails =>
              (item as any).media_type === 'movie' || (item as any).media_type === 'tv'
          );
          if (targetMediaTypeFilter !== 'all') {
            filtered = filtered.filter((i) => (i as any).media_type === targetMediaTypeFilter);
          }
          setTargetSearchResults(filtered);
        } else {
          setTargetSearchResults([]);
        }
      } catch (err) {
        console.error('Target search failed:', err);
      } finally {
        setIsSearchingTarget(false);
      }
    }, 280);

    return () => clearTimeout(handler);
  }, [targetSearchQuery, targetMediaTypeFilter]);

  // Debounced TMDB Live Search for Reassigning Title in Defective Link Modal
  useEffect(() => {
    const q = reassignSearchQuery.trim();
    if (!q) {
      setReassignSearchResults([]);
      setIsSearchingReassign(false);
      return;
    }

    const numericMatch = q.match(/^\d+$/) || q.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
    if (numericMatch) {
      const detectedId = Number(numericMatch[2] || numericMatch[0]);
      setIsSearchingReassign(true);
      Promise.allSettled([
        getTitleDetails('movie', detectedId),
        getTitleDetails('tv', detectedId),
      ]).then(([mRes, tRes]) => {
        setIsSearchingReassign(false);
        const list: TitleDetails[] = [];
        if (mRes.status === 'fulfilled' && mRes.value && (mRes.value.title || mRes.value.name)) {
          list.push({ ...mRes.value, media_type: 'movie' });
        }
        if (tRes.status === 'fulfilled' && tRes.value && (tRes.value.title || tRes.value.name)) {
          list.push({ ...tRes.value, media_type: 'tv' });
        }
        setReassignSearchResults(list);
      });
      return;
    }

    setIsSearchingReassign(true);
    const handler = setTimeout(async () => {
      try {
        const data = await searchMulti(q, 1);
        if (data && data.results) {
          const filtered = data.results.filter(
            (item): item is TitleDetails =>
              (item as any).media_type === 'movie' || (item as any).media_type === 'tv'
          );
          setReassignSearchResults(filtered);
        } else {
          setReassignSearchResults([]);
        }
      } catch {
        setReassignSearchResults([]);
      } finally {
        setIsSearchingReassign(false);
      }
    }, 280);

    return () => clearTimeout(handler);
  }, [reassignSearchQuery]);

  // Debounced TMDB Live Search for "Manage Titles" Tab
  useEffect(() => {
    const query = titleSearchQuery.trim();
    if (!query) {
      setManageTitlesResults([]);
      setIsSearchingManageTitles(false);
      return;
    }

    setIsSearchingManageTitles(true);
    const handler = setTimeout(async () => {
      try {
        const data = await searchMulti(query, 1);
        if (data && data.results) {
          const filtered = data.results.filter(
            (item): item is TitleDetails =>
              (item as any).media_type === 'movie' || (item as any).media_type === 'tv'
          );
          setManageTitlesResults(filtered);
        } else {
          setManageTitlesResults([]);
        }
      } catch (err) {
        console.error('Manage titles search failed:', err);
      } finally {
        setIsSearchingManageTitles(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [titleSearchQuery]);

  // Real-time bulk parsing on admin textarea change
  useEffect(() => {
    if (!adminBulkRawText.trim()) {
      setAdminBulkParsedItems([]);
      return;
    }
    const currentType = adminBulkMediaType || (selectedTargetTitle?.media_type === 'tv' ? 'tv' : 'movie');
    const parsed = parseBulkLinksInput(adminBulkRawText, 1, currentType, adminBulkMovieCategory);
    setAdminBulkParsedItems(parsed);
  }, [adminBulkRawText, adminBulkMediaType, adminBulkMovieCategory, selectedTargetTitle?.media_type]);

  // Real-time bulk parsing for fulfill modal
  useEffect(() => {
    if (!fulfillBulkRawText.trim() || !fulfillingRequest) {
      setFulfillBulkParsedItems([]);
      return;
    }
    const currentType = fulfillBulkMediaType || (fulfillingRequest.mediaType === 'tv' ? 'tv' : 'movie');
    const defaultSeason = fulfillingRequest.seasonNumber || 1;
    const parsed = parseBulkLinksInput(fulfillBulkRawText, defaultSeason, currentType, fulfillBulkMovieCategory);
    setFulfillBulkParsedItems(parsed);
  }, [fulfillBulkRawText, fulfillBulkMediaType, fulfillBulkMovieCategory, fulfillingRequest]);

  // Real-time bulk parsing for Title Manager Whole Link replacement
  useEffect(() => {
    if (!replaceRawLinksText.trim() || !managingTitle) {
      setReplaceParsedItems([]);
      return;
    }
    const currentType = managingTitle.media_type || 'movie';
    const parsed = parseBulkLinksInput(
      replaceRawLinksText,
      1,
      currentType,
      currentType === 'movie' ? 'Download' : 'SingleEpisode'
    );
    setReplaceParsedItems(parsed);
  }, [replaceRawLinksText, managingTitle]);

  // Handle Target Title Selection
  const handleSelectTargetTitle = (item: {
    id: number;
    title?: string;
    name?: string;
    media_type?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
  }) => {
    const resolvedTitle = item.title || item.name || `Title #${item.id}`;
    const resolvedType = (item.media_type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';
    const resolvedYear = (item.release_date || item.first_air_date || '').split('-')[0];

    const targetObj = {
      id: item.id,
      title: resolvedTitle,
      media_type: resolvedType,
      poster_path: item.poster_path || null,
      backdrop_path: item.backdrop_path || null,
      year: resolvedYear,
      release_date: item.release_date || undefined,
      first_air_date: (item as any).first_air_date || undefined,
      vote_average: item.vote_average || undefined,
    };

    setSelectedTargetTitle(targetObj);
    cacheTitle(item.id, targetObj);
    setIsTargetDropdownOpen(false);
    setTargetSearchQuery('');

    // Set intelligent default category and bulk media type based on media type
    if (resolvedType === 'tv') {
      setNewLinkCategory('SingleEpisode');
      setNewLinkType('single_episode');
      setAdminBulkMediaType('tv');
      syncAdminGridSlots(adminGridEpisodeCount, adminGridSeason, adminGridBasePattern, adminGridQuality, adminGridAudio, adminGridSize, resolvedTitle);
    } else {
      setNewLinkCategory('Streaming');
      setNewLinkType('general');
      setAdminBulkMediaType('movie');
    }

    addLog(`Target title switched to "${resolvedTitle}" (ID: ${item.id})`, 'info');
  };

  // Handle Manual Custom Title Creation (When TMDB doesn't find title)
  const handleCreateManualTitle = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!manualTitleName.trim()) return;

    const manualId = Math.floor(900000000 + (Date.now() % 99999999));
    const targetObj = {
      id: manualId,
      title: manualTitleName.trim(),
      media_type: manualMediaType,
      poster_path: manualPoster.trim() || null,
      year: manualYear.trim() || String(new Date().getFullYear()),
    };

    setSelectedTargetTitle(targetObj);
    cacheTitle(manualId, targetObj);
    setIsTargetDropdownOpen(false);
    setTargetSearchQuery('');
    setIsManualTitleModalOpen(false);
    setManualTitleName('');
    setManualYear('');
    setManualPoster('');

    if (manualMediaType === 'tv') {
      setNewLinkCategory('SingleEpisode');
      setNewLinkType('single_episode');
      setAdminBulkMediaType('tv');
    } else {
      setNewLinkCategory('Streaming');
      setNewLinkType('general');
      setAdminBulkMediaType('movie');
    }

    addLog(`Created and selected custom title "${targetObj.title}" (ID: ${manualId})`, 'success');
  };

  // Auto-parse release title for quick link add
  const handleNewLinkTitleChange = (val: string) => {
    setNewLinkTitle(val);
    if (val.trim().length > 2) {
      const parsed = parseFullMediaTitle(val, newLinkUrl);
      if (parsed.seasonNumber) setNewLinkSeason(parsed.seasonNumber);

      if (parsed.episodeNumber) {
        setNewLinkEpisode(parsed.episodeNumber);
        setNewLinkCategory('SingleEpisode');
        setNewLinkType('single_episode');
      } else if (parsed.linkType === 'zip_pack' || isPackMedia(val, newLinkUrl)) {
        if (selectedTargetTitle?.media_type === 'tv' || /(?:zip|pack|complete|season)/i.test(val) || isPackMedia(val, newLinkUrl)) {
          setNewLinkCategory('ZipPack');
          setNewLinkType('zip_pack');
        }
      }

      if (parsed.quality) setNewLinkQuality(parsed.quality);
      if (parsed.audioLanguage) setNewLinkAudio(parsed.audioLanguage);
      if (parsed.size) setNewLinkSize(parsed.size);
    }
  };

  // Auto-detect pack/archive status from destination URL
  const handleNewLinkUrlChange = (val: string) => {
    setNewLinkUrl(val);
    if (val.trim()) {
      if (isPackMedia(newLinkTitle, val) && (selectedTargetTitle?.media_type === 'tv' || newLinkCategory === 'SingleEpisode')) {
        setNewLinkCategory('ZipPack');
        setNewLinkType('zip_pack');
      }
      const parsed = parseFullMediaTitle(newLinkTitle, val);
      if (parsed.quality && (!newLinkQuality || newLinkQuality === '1080p WEB-DL')) setNewLinkQuality(parsed.quality);
      if (parsed.audioLanguage && (!newLinkAudio || newLinkAudio === 'English')) setNewLinkAudio(parsed.audioLanguage);
      if (parsed.size && !newLinkSize) setNewLinkSize(parsed.size);
    }
  };

  // Helper to obtain admin authorization headers for all mutating API calls
  const getAdminAuthHeaders = useCallback(() => {
    let token = '';
    if (typeof window !== 'undefined') {
      token =
        sessionStorage.getItem('cinefuel_admin_token') ||
        localStorage.getItem('cinefuel_admin_token') ||
        localStorage.getItem('cinefuel_id_token') ||
        '';
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-admin-key'] = token;
    }
    return headers;
  }, []);

  // Fetch real titles that have custom links in database
  const fetchLinkedCatalogTitles = useCallback(
    async (page = 1, type: 'all' | 'movie' | 'tv' = 'all', query = '', limit = 48) => {
      try {
        setIsLoadingLinkedTitles(true);
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(limit));
        if (type && type !== 'all') params.set('type', type);
        if (query.trim()) params.set('q', query.trim());
        params.set('_t', String(Date.now()));

        const res = await fetch(`/api/catalog?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.items)) {
            const formatted: LinkedCatalogTitle[] = data.items.map((it: any) => ({
              id: it.id,
              title: it.title || it.name || `Title #${it.id}`,
              name: it.name,
              media_type: (it.media_type || (it.name ? 'tv' : 'movie')) as 'movie' | 'tv',
              poster_path: it.poster_path,
              backdrop_path: it.backdrop_path,
              release_date: it.release_date,
              first_air_date: it.first_air_date,
              year: (it.release_date || it.first_air_date || (it.uploadMeta?.createdAt || '')).split('-')[0] || '',
              linksCount: typeof it.linksCount === 'number' ? it.linksCount : (it.linksCount || 1),
              uploadMeta: it.uploadMeta,
            }));
            setLinkedCatalogTitles(formatted);
            if (typeof data.total === 'number') setLinkedTitlesTotal(data.total);
            if (typeof data.totalPages === 'number') setLinkedTitlesTotalPages(data.totalPages);
            setLinkedTitlesPage(page);

            // Seed into knownTitlesCache for instantaneous title resolution everywhere
            setKnownTitlesCache((prev) => {
              const updated = { ...prev };
              formatted.forEach((f) => {
                const n = Number(f.id);
                if (!isNaN(n)) {
                  updated[n] = {
                    title: f.title,
                    poster_path: f.poster_path,
                    media_type: f.media_type,
                    year: f.year,
                  };
                }
              });
              return updated;
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch linked catalog titles:', err);
      } finally {
        setIsLoadingLinkedTitles(false);
      }
    },
    []
  );

  // Fetch all links belonging to a specific title
  const fetchTitleLinks = useCallback(async (movieId: string | number) => {
    try {
      setIsLoadingManagingLinks(true);
      const res = await fetch(`/api/curated-links?movieId=${movieId}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.links)) {
          setManagingTitleLinks(data.links);
        } else {
          setManagingTitleLinks([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch links for title:', err);
    } finally {
      setIsLoadingManagingLinks(false);
    }
  }, []);

  // Open the dedicated Title Manager Modal for a specific title
  const openTitleManager = (title: LinkedCatalogTitle, defaultTab: 'view' | 'replace' | 'edit_title' | 'trakt_episodes' = 'view') => {
    setManagingTitle(title);
    setTitleManagerTab(defaultTab);
    setTitleManagerModalOpen(true);
    setReplaceSuccessMsg('');
    setReplaceErrorMsg('');
    setReplaceRawLinksText('');
    setReplaceParsedItems([]);
    setTitleDomainMsg('');
    setTitleLinksSearch('');
    setTitleAddLinkTitle(title.media_type === 'tv' ? `${title.title} S01E01` : `${title.title} 1080p WEB-DL`);
    setTitleAddLinkUrl('');
    setTitleAddLinkCategory(title.media_type === 'tv' ? 'SingleEpisode' : 'Download');
    setTitleAddLinkQuality('1080p');
    setTitleAddLinkAudio('Hindi + English');
    setTitleAddLinkSeason(1);
    setTitleAddLinkEpisode(1);
    setTitleAddLinkType(title.media_type === 'tv' ? 'single_episode' : 'general');

    // Populate title direct edit fields
    setEditTitleName(title.title || '');
    setEditTitleYear(title.year ? String(title.year) : '');
    setEditTitleMediaType(title.media_type === 'movie' ? 'movie' : 'tv');
    setEditTitleId(String(title.id));
    setEditTitlePoster(title.poster_path || '');
    setEditTitleBackdrop((title as any).backdrop_path || '');
    setEditTitleOverview((title as any).overview || '');
    setTitleMetaMsg('');
    setTitleMetaError('');

    // Initialize Trakt episode states
    setTraktSeason(1);
    setTraktEpisode(1);
    setTraktShowId(String(title.id));
    setTraktFetchedTitle('');
    setTraktOverview('');
    setTraktShowTitle(title.title || '');
    setTraktMsg('');
    setTraktError('');
    setTraktSeasonEpisodes([]);

    setSelectedTargetTitle({
      id: Number(title.id),
      title: title.title,
      media_type: title.media_type,
      poster_path: title.poster_path,
      backdrop_path: title.backdrop_path,
      year: title.year,
      release_date: title.release_date || title.first_air_date,
      first_air_date: title.first_air_date,
    });
    fetchTitleLinks(title.id);
  };

  // Execute Replace Whole Links (or Append) for the selected title
  const handleExecuteWholeLinkReplacement = async () => {
    if (!managingTitle || replaceParsedItems.length === 0) return;
    try {
      setIsReplacingLinks(true);
      setReplaceErrorMsg('');
      setReplaceSuccessMsg('');

      const linksToSave = replaceParsedItems.map((item, idx) => ({
        id: `rep-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        title: item.title,
        url: item.url,
        category: item.category || (managingTitle.media_type === 'tv' ? 'SingleEpisode' : 'Download'),
        quality: item.quality || '1080p',
        audioLanguage: item.audioLanguage || 'Hindi + English',
        size: item.size || '',
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        linkType: item.linkType || (managingTitle.media_type === 'tv' ? 'single_episode' : 'general'),
        createdAt: new Date().toISOString(),
      }));

      const res = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          movieId: String(managingTitle.id),
          action: replaceLinksMode === 'replace' ? 'replace_all_links' : undefined,
          links: linksToSave,
          movieTitle: managingTitle.title,
          posterPath: managingTitle.poster_path,
          backdropPath: managingTitle.backdrop_path,
          mediaType: managingTitle.media_type,
        }),
      });

      if (res.ok) {
        if (replaceLinksMode === 'replace') {
          await replaceAllGlobalCustomLinks(Number(managingTitle.id), linksToSave);
        } else {
          await saveMultipleGlobalCustomLinks(Number(managingTitle.id), linksToSave);
        }
        setReplaceSuccessMsg(
          replaceLinksMode === 'replace'
            ? `✅ Successfully replaced entire link set for "${managingTitle.title}" with ${linksToSave.length} new link(s)!`
            : `✅ Successfully appended ${linksToSave.length} new link(s) to "${managingTitle.title}"!`
        );
        addLog(
          `Admin ${replaceLinksMode === 'replace' ? 'replaced whole link set' : 'appended links'} for "${managingTitle.title}" (${linksToSave.length} links)`,
          'success'
        );
        setReplaceRawLinksText('');
        setReplaceParsedItems([]);
        fetchTitleLinks(managingTitle.id);
        fetchLinkedCatalogTitles(linkedTitlesPage, linkedTitlesFilter, linkedTitlesSearch);
        refreshAdminLinks();
      } else {
        const err = await res.json().catch(() => ({}));
        setReplaceErrorMsg(err.error || 'Failed to update links. Check admin authorization.');
      }
    } catch (err: any) {
      setReplaceErrorMsg(err.message || 'Network error occurred while replacing links.');
    } finally {
      setIsReplacingLinks(false);
    }
  };

  // Delete all links for a specific title
  const handleDeleteAllTitleLinks = async (title: LinkedCatalogTitle) => {
    const count = managingTitleLinks.length;
    if (!confirm(`Are you sure you want to completely delete all ${count} link(s) for "${title.title}"? (Only links for this title will be removed). This cannot be undone.`)) {
      return;
    }
    try {
      setIsDeletingAllLinks(true);
      const res = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          movieId: String(title.id),
          action: 'delete_all_links',
        }),
      });
      if (res.ok) {
        await deleteAllGlobalCustomLinks(Number(title.id));
        setCustomLinksMap((prev) => {
          const key = String(title.id);
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setManagingTitleLinks([]);
        addLog(`Admin deleted all links for "${title.title}" (ID: ${title.id})`, 'info');
        setTitleManagerModalOpen(false);
        fetchLinkedCatalogTitles(linkedTitlesPage, linkedTitlesFilter, linkedTitlesSearch);
        refreshAdminLinks();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to delete all links: ${errData.error || res.statusText || 'Server error'}`);
      }
    } catch (err: any) {
      console.error('Failed to delete title links:', err);
      alert(`Error deleting title links: ${err?.message || 'Network error'}`);
    } finally {
      setIsDeletingAllLinks(false);
    }
  };

  // Safely close the Title Manager Modal with unsaved changes confirmation
  const handleCloseTitleManager = () => {
    const hasUnsavedChanges =
      (titleAddLinkUrl && titleAddLinkUrl.trim().length > 0) ||
      (replaceRawLinksText && replaceRawLinksText.trim().length > 0) ||
      (titleOldDomain && titleOldDomain.trim().length > 0) ||
      (titleNewDomain && titleNewDomain.trim().length > 0);

    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved links or text in this manager window. Discard changes and close?')) {
        return;
      }
    }
    setTitleManagerModalOpen(false);
  };

  // Replace domain for this title
  const handleReplaceTitleDomain = async () => {
    if (!managingTitle || !titleOldDomain.trim() || !titleNewDomain.trim()) return;
    try {
      setIsMigratingTitleDomain(true);
      setTitleDomainMsg('');
      const res = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          movieId: String(managingTitle.id),
          action: 'replace_domain_for_title',
          oldDomain: titleOldDomain.trim(),
          newDomain: titleNewDomain.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTitleDomainMsg(`✅ Domain migrated in ${data.updatedCount} link(s) for "${managingTitle.title}"!`);
        fetchTitleLinks(managingTitle.id);
        refreshAdminLinks();
      } else {
        setTitleDomainMsg(`⚠️ ${data.error || 'No matching links found with that domain.'}`);
      }
    } catch (err: any) {
      setTitleDomainMsg(`❌ Error: ${err.message}`);
    } finally {
      setIsMigratingTitleDomain(false);
    }
  };

  // Direct Title Metadata Editing without TMDB search
  const handleSaveTitleMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingTitle) return;
    if (!editTitleName.trim()) {
      setTitleMetaError('Title name cannot be empty.');
      return;
    }
    if (!editTitleId.trim()) {
      setTitleMetaError('Title ID cannot be empty.');
      return;
    }
    try {
      setIsSavingTitleMeta(true);
      setTitleMetaMsg('');
      setTitleMetaError('');

      const res = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          action: 'update_title_metadata',
          currentMovieId: String(managingTitle.id),
          updates: {
            movieTitle: editTitleName.trim(),
            releaseDate: editTitleYear.trim(),
            mediaType: editTitleMediaType,
            newMovieId: editTitleId.trim() !== String(managingTitle.id) ? editTitleId.trim() : undefined,
            posterPath: editTitlePoster.trim(),
            backdropPath: editTitleBackdrop.trim(),
            overview: editTitleOverview.trim(),
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTitleMetaMsg('✅ Title details updated successfully!');
        addLog(`Admin updated title details for "${editTitleName.trim()}" (ID: ${editTitleId.trim()})`, 'success');
        const updatedTitleObj: LinkedCatalogTitle = {
          ...managingTitle,
          id: isNaN(Number(editTitleId.trim())) ? editTitleId.trim() : Number(editTitleId.trim()),
          title: editTitleName.trim(),
          year: editTitleYear.trim(),
          media_type: editTitleMediaType,
          poster_path: editTitlePoster.trim(),
          backdrop_path: editTitleBackdrop.trim() || undefined,
          overview: editTitleOverview.trim() || undefined,
        };
        setManagingTitle(updatedTitleObj);
        fetchTitleLinks(updatedTitleObj.id);
        fetchLinkedCatalogTitles(linkedTitlesPage, linkedTitlesFilter, linkedTitlesSearch);
        refreshAdminLinks();
      } else {
        setTitleMetaError(`❌ ${data.error || 'Failed to update title metadata.'}`);
      }
    } catch (err: any) {
      setTitleMetaError(`❌ Error: ${err.message || 'Network error'}`);
    } finally {
      setIsSavingTitleMeta(false);
    }
  };

  // TMDB Interactive Search Handler for Title Manager
  const handleSearchTmdbForTitle = async (queryToSearch?: string) => {
    const q = (queryToSearch || tmdbSearchQuery || editTitleName || managingTitle?.title || '').trim();
    if (!q) return;
    setIsSearchingTmdb(true);
    setTmdbSearchError('');
    try {
      const res = await fetch(`/api/admin/tmdb-search?q=${encodeURIComponent(q)}`, {
        headers: getAdminAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.results)) {
        setTmdbSearchResults(data.results);
        if (data.results.length === 0) {
          setTmdbSearchError('No matching TMDB titles found.');
        }
      } else {
        setTmdbSearchError(data.error || 'Failed to search TMDB');
      }
    } catch (err: any) {
      setTmdbSearchError(err.message || 'Network error');
    } finally {
      setIsSearchingTmdb(false);
    }
  };

  // Select TMDB Candidate and populate proposed values
  const handleSelectTmdbCandidate = (candidate: any) => {
    setProposedTmdbCandidate(candidate);
    setEditTitleName(candidate.title || candidate.name);
    setEditTitleYear((candidate.release_date || candidate.first_air_date || '').slice(0, 4));
    setEditTitleMediaType(candidate.media_type || (candidate.name ? 'tv' : 'movie'));
    setEditTitleId(String(candidate.id));
    setEditTitlePoster(candidate.poster_path || '');
    setEditTitleBackdrop(candidate.backdrop_path || '');
    setEditTitleOverview(candidate.overview || '');
    // Preselect all links by default for convenient reassignment
    setSelectedReassignLinkIds(managingTitleLinks.map((l) => l.id));
    setReassignMsg('');
    setReassignError('');
  };

  // Reassign Selected Links Handler
  const handleReassignSelectedLinks = async () => {
    if (!managingTitle || !proposedTmdbCandidate) return;
    if (selectedReassignLinkIds.length === 0) {
      setReassignError('Please select at least 1 link to reassign.');
      return;
    }
    setIsReassigningLinks(true);
    setReassignError('');
    setReassignMsg('');
    try {
      const res = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          action: 'reassign_links',
          currentMovieId: String(managingTitle.id),
          newMovieId: String(proposedTmdbCandidate.id),
          linkIds: selectedReassignLinkIds,
          newMetadata: {
            movieTitle: editTitleName.trim() || proposedTmdbCandidate.title || proposedTmdbCandidate.name,
            mediaType: editTitleMediaType,
            posterPath: editTitlePoster.trim() || proposedTmdbCandidate.poster_path,
            backdropPath: editTitleBackdrop.trim() || proposedTmdbCandidate.backdrop_path,
            releaseDate: editTitleYear.trim() ? `${editTitleYear.trim()}-01-01` : proposedTmdbCandidate.release_date,
            voteAverage: proposedTmdbCandidate.vote_average || 8.0,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReassignMsg(`✅ Successfully reassigned ${data.reassignedCount} link(s) to "${editTitleName}" (ID: ${proposedTmdbCandidate.id})!`);
        addLog(`Admin reassigned ${data.reassignedCount} links from ID ${managingTitle.id} to ${proposedTmdbCandidate.id}`, 'success');
        if (data.remainingCount === 0) {
          const updatedTitleObj: LinkedCatalogTitle = {
            ...managingTitle,
            id: proposedTmdbCandidate.id,
            title: editTitleName.trim(),
            year: editTitleYear.trim(),
            media_type: editTitleMediaType,
            poster_path: editTitlePoster.trim(),
            backdrop_path: editTitleBackdrop.trim(),
          };
          setManagingTitle(updatedTitleObj);
          fetchTitleLinks(updatedTitleObj.id);
        } else {
          fetchTitleLinks(managingTitle.id);
        }
        fetchLinkedCatalogTitles(linkedTitlesPage, linkedTitlesFilter, linkedTitlesSearch);
        refreshAdminLinks();
      } else {
        setReassignError(`❌ ${data.error || 'Failed to reassign links.'}`);
      }
    } catch (err: any) {
      setReassignError(`❌ Error: ${err.message || 'Network error'}`);
    } finally {
      setIsReassigningLinks(false);
    }
  };

  // Confirm Single Link Deletion Handler
  const handleConfirmDeleteSingleLink = async () => {
    if (!linkToDelete) return;
    try {
      setDeletingLinkId(linkToDelete.id);
      setManagingTitleLinks((prev) => prev.filter((l) => l.id !== linkToDelete.id));

      const res = await fetch(
        `/api/curated-links?movieId=${encodeURIComponent(String(linkToDelete.movieId))}&linkId=${encodeURIComponent(linkToDelete.id)}`,
        {
          method: 'DELETE',
          headers: getAdminAuthHeaders(),
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to delete link: ${errData.error || res.statusText || 'Server error'}`);
        if (managingTitle) fetchTitleLinks(managingTitle.id);
      } else {
        addLog(`Deleted link #${linkToDelete.id} for title ID ${linkToDelete.movieId}`, 'info');
      }
    } catch (err: any) {
      alert(`Error deleting link: ${err.message}`);
      if (managingTitle) fetchTitleLinks(managingTitle.id);
    } finally {
      setDeletingLinkId(null);
      setLinkToDelete(null);
    }
  };

  // Confirm Entire Title Deletion Handler
  const handleConfirmDeleteEntireTitle = async () => {
    if (!titleToDelete) return;
    try {
      setIsDeletingAllLinks(true);
      const res = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          movieId: String(titleToDelete.id),
          action: 'delete_entire_title',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await deleteAllGlobalCustomLinks(Number(titleToDelete.id));
        setCustomLinksMap((prev) => {
          const key = String(titleToDelete.id);
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setManagingTitleLinks([]);
        addLog(`Permanently deleted entire title "${titleToDelete.title}" (ID: ${titleToDelete.id}) and created audit backup`, 'success');
        setTitleManagerModalOpen(false);
        setTitleToDelete(null);
        setDeleteTitleConfirmChecked(false);
        fetchLinkedCatalogTitles(linkedTitlesPage, linkedTitlesFilter, linkedTitlesSearch);
        refreshAdminLinks();
      } else {
        alert(`Failed to delete title: ${data.error || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Error deleting title: ${err.message}`);
    } finally {
      setIsDeletingAllLinks(false);
    }
  };

  // Trakt Episode Titles: Fetch single episode from Trakt API
  const handleFetchTraktEpisode = async (seasonNum?: number, episodeNum?: number) => {
    if (!managingTitle) return;
    const s = seasonNum !== undefined ? seasonNum : traktSeason;
    const e = episodeNum !== undefined ? episodeNum : traktEpisode;
    setIsTraktLoading(true);
    setTraktError('');
    setTraktMsg('');

    try {
      const showId = traktShowId.trim() || String(managingTitle.id);
      const params = new URLSearchParams({
        tmdbId: showId,
        query: managingTitle.title,
        season: String(s),
        episode: String(e),
      });

      const res = await fetch(`/api/admin/trakt-episode?${params.toString()}`, {
        headers: getAdminAuthHeaders(),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setTraktError(data.error || 'Failed to fetch episode title from Trakt.');
      } else {
        setTraktFetchedTitle(data.title || '');
        setTraktOverview(data.overview || '');
        setTraktShowTitle(data.showTitle || managingTitle.title);
        setTraktMsg(`Retrieved title from Trakt: "${data.title}" (Season ${s}, Episode ${e})`);
      }
    } catch (err: any) {
      setTraktError(`Network error fetching from Trakt: ${err?.message || err}`);
    } finally {
      setIsTraktLoading(false);
    }
  };

  // Trakt Episode Titles: Fetch entire season list from Trakt API
  const handleFetchTraktSeason = async (seasonNum?: number) => {
    if (!managingTitle) return;
    const s = seasonNum !== undefined ? seasonNum : traktSeason;
    setIsTraktLoading(true);
    setTraktError('');
    setTraktMsg('');
    setTraktSeasonEpisodes([]);

    try {
      const showId = traktShowId.trim() || String(managingTitle.id);
      const params = new URLSearchParams({
        tmdbId: showId,
        query: managingTitle.title,
        season: String(s),
        seasonOnly: 'true',
      });

      const res = await fetch(`/api/admin/trakt-episode?${params.toString()}`, {
        headers: getAdminAuthHeaders(),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setTraktError(data.error || 'Failed to fetch season episodes from Trakt.');
      } else {
        setTraktSeasonEpisodes(data.episodes || []);
        setTraktShowTitle(data.showTitle || managingTitle.title);
        setTraktMsg(`Retrieved ${data.episodes?.length || 0} episodes for Season ${s} from Trakt.`);
      }
    } catch (err: any) {
      setTraktError(`Network error fetching season from Trakt: ${err?.message || err}`);
    } finally {
      setIsTraktLoading(false);
    }
  };

  // Trakt Episode Titles: Save episode title to database
  const handleSaveTraktEpisodeTitle = async (
    customTitle?: string,
    seasonNum?: number,
    episodeNum?: number,
    linkId?: string
  ) => {
    if (!managingTitle) return;
    const s = seasonNum !== undefined ? seasonNum : traktSeason;
    const e = episodeNum !== undefined ? episodeNum : traktEpisode;
    const titleToSave = (customTitle !== undefined ? customTitle : traktFetchedTitle).trim();

    if (!titleToSave) {
      setTraktError('Episode title cannot be empty. Please enter or fetch a title before saving.');
      return;
    }

    try {
      setIsTraktSaving(true);
      setTraktError('');
      setTraktMsg('');

      const res = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          movieId: String(managingTitle.id),
          action: 'update_episode_title',
          seasonNumber: s,
          episodeNumber: e,
          episodeTitle: titleToSave,
          linkId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTraktMsg(`✅ Saved episode title "${titleToSave}" for S${s}E${e}! Destination links (URLs) remain 100% untouched.`);
        addLog(`Admin updated episode title for "${managingTitle.title}" S${s}E${e} to "${titleToSave}"`, 'success');

        // Update local state in managingTitleLinks
        setManagingTitleLinks((prev) =>
          prev.map((l) => {
            const matches = linkId
              ? l.id === linkId
              : Number(l.seasonNumber) === s && Number(l.episodeNumber) === e;
            if (matches) {
              return { ...l, episodeTitle: titleToSave };
            }
            return l;
          })
        );
      } else {
        setTraktError(`❌ ${data.error || 'Failed to save episode title.'}`);
      }
    } catch (err: any) {
      setTraktError(`❌ Error saving episode title: ${err?.message || err}`);
    } finally {
      setIsTraktSaving(false);
    }
  };

  // Batch Official Episode Titles: Fetch audit diff
  const handleFetchBatchEpisodeDiff = async (targetSeason?: number | 'all', overrideForce?: boolean) => {
    if (!managingTitle) return;
    const seasonToQuery = targetSeason !== undefined ? targetSeason : batchTargetSeason;
    const forceToUse = overrideForce !== undefined ? overrideForce : batchForceOverwrite;
    setIsBatchVerifying(true);
    setBatchApplyErrorMsg('');
    setBatchApplySuccessMsg('');

    try {
      const showId = traktShowId.trim() || String(managingTitle.id);
      const queryParams = new URLSearchParams({
        movieId: showId,
        showTitle: managingTitle.title,
        forceOverwrite: forceToUse ? 'true' : 'false',
      });
      if (seasonToQuery !== 'all') {
        queryParams.set('season', String(seasonToQuery));
      }

      const res = await fetch(`/api/admin/verify-episode-titles?${queryParams.toString()}`, {
        headers: getAdminAuthHeaders(),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setBatchApplyErrorMsg(data.error || 'Failed to fetch batch episode audit.');
      } else {
        setBatchEpisodeDiff(data.preview || []);
        if (data.preview?.length === 0) {
          setBatchApplySuccessMsg('No episode links found to verify for this series.');
        } else {
          setBatchApplySuccessMsg(`Audit loaded: ${data.totalEpisodes} episodes inspected (${data.needsUpdateCount} need title cleanup, ${data.unverifiedCount} unverified).`);
        }
      }
    } catch (err: any) {
      setBatchApplyErrorMsg(`Network error running audit: ${err?.message || err}`);
    } finally {
      setIsBatchVerifying(false);
    }
  };

  // Batch Official Episode Titles: Apply verified titles safely
  const handleApplyBatchEpisodeTitles = async (itemsToApply?: typeof batchEpisodeDiff) => {
    if (!managingTitle) return;
    const items = itemsToApply || batchEpisodeDiff.filter((i) => i.status === 'needs_update' || i.isVerified);
    if (items.length === 0) {
      setBatchApplyErrorMsg('No items selected to update.');
      return;
    }

    setIsBatchApplying(true);
    setBatchApplyErrorMsg('');
    setBatchApplySuccessMsg('');

    try {
      const showId = traktShowId.trim() || String(managingTitle.id);
      const updates = items.map((i) => ({
        seasonNumber: i.seasonNumber,
        episodeNumber: i.episodeNumber,
        episodeTitle: i.proposedOfficialTitle.trim(),
        manualTitleVerified: i.source === 'manual' ? true : Boolean(i.manualTitleVerified),
      }));

      const res = await fetch('/api/admin/verify-episode-titles', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          action: 'apply',
          movieId: showId,
          updates,
          forceOverwrite: batchForceOverwrite,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setBatchApplyErrorMsg(data.error || 'Failed to apply batch updates.');
      } else {
        setBatchApplySuccessMsg(`✅ Successfully updated ${data.totalApplied} episode titles across ${data.totalLinksUpdated} links! All destination URLs remain 100% untouched.`);
        addLog(`Admin batch-applied ${data.totalApplied} official episode titles for "${managingTitle.title}"`, 'success');

        // Update local state in managingTitleLinks
        const updateMap = new Map<string, string>();
        updates.forEach((u) => updateMap.set(`S${u.seasonNumber}E${u.episodeNumber}`, u.episodeTitle));

        setManagingTitleLinks((prev) =>
          prev.map((l) => {
            const key = `S${l.seasonNumber}E${l.episodeNumber}`;
            if (updateMap.has(key)) {
              return { ...l, episodeTitle: updateMap.get(key) };
            }
            return l;
          })
        );

        // Re-run preview to refresh clean state
        handleFetchBatchEpisodeDiff(batchTargetSeason, batchForceOverwrite);
      }
    } catch (err: any) {
      setBatchApplyErrorMsg(`Error applying batch updates: ${err?.message || err}`);
    } finally {
      setIsBatchApplying(false);
    }
  };

  // Add single link from inside Title Manager Modal
  const handleAddSingleTitleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingTitle || !titleAddLinkTitle.trim() || !titleAddLinkUrl.trim()) return;
    try {
      setIsAddingSingleTitleLink(true);
      const newObj: CustomLink = {
        id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: titleAddLinkTitle.trim(),
        url: titleAddLinkUrl.trim(),
        category: titleAddLinkCategory,
        quality: titleAddLinkQuality,
        audioLanguage: titleAddLinkAudio,
        seasonNumber: managingTitle.media_type === 'tv' ? titleAddLinkSeason : undefined,
        episodeNumber: managingTitle.media_type === 'tv' && titleAddLinkType === 'single_episode' ? titleAddLinkEpisode : undefined,
        linkType: managingTitle.media_type === 'tv' ? titleAddLinkType : 'general',
        createdAt: new Date().toISOString(),
      };

      const res = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          movieId: String(managingTitle.id),
          link: newObj,
        }),
      });

      if (res.ok) {
        await saveGlobalCustomLink(Number(managingTitle.id), newObj);
        addLog(`Admin added link "${newObj.title}" to "${managingTitle.title}"`, 'success');
        setTitleAddLinkUrl('');
        if (managingTitle.media_type === 'tv' && titleAddLinkType === 'single_episode') {
          setTitleAddLinkEpisode((prev) => prev + 1);
          setTitleAddLinkTitle(`${managingTitle.title} S0${titleAddLinkSeason}E0${titleAddLinkEpisode + 1}`);
        }
        fetchTitleLinks(managingTitle.id);
        fetchLinkedCatalogTitles(linkedTitlesPage, linkedTitlesFilter, linkedTitlesSearch);
        refreshAdminLinks();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to add link: ${err.error || res.statusText || 'Server error'}`);
      }
    } catch (err: any) {
      console.error('Failed to add single title link:', err);
      alert(`Error adding link: ${err?.message || 'Network error'}`);
    } finally {
      setIsAddingSingleTitleLink(false);
    }
  };

  // Delete a single link from inside the Title Manager Modal
  const handleDeleteManagingTitleLink = async (linkId: string, linkTitle: string) => {
    if (!managingTitle) return;
    if (!confirm(`Delete link "${linkTitle}" permanently?`)) return;
    try {
      setDeletingLinkId(linkId);
      // 1. Optimistic UI update in the modal
      setManagingTitleLinks((prev) => prev.filter((l) => l.id !== linkId));

      // 2. Call server API directly with admin auth headers
      const movieIdStr = String(managingTitle.id);
      const res = await fetch(
        `/api/curated-links?movieId=${encodeURIComponent(movieIdStr)}&linkId=${encodeURIComponent(linkId)}`,
        {
          method: 'DELETE',
          headers: getAdminAuthHeaders(),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to delete link: ${errData.error || res.statusText || 'Server error'}`);
        // Revert modal state
        fetchTitleLinks(managingTitle.id);
        return;
      }

      // 3. Update global states and refresh lists
      removeCustomLink(Number(managingTitle.id), linkId);
      await deleteGlobalCustomLink(Number(managingTitle.id), linkId);
      setCustomLinksMap((prev) => {
        const key = String(managingTitle.id);
        return {
          ...prev,
          [key]: (prev[key] || []).filter((l) => l.id !== linkId),
        };
      });
      addLog(`Admin deleted link "${linkTitle}" from "${managingTitle.title}"`, 'warn');
      
      // 4. Update the parent linked catalog titles counts and refresh
      fetchTitleLinks(managingTitle.id);
      fetchLinkedCatalogTitles(linkedTitlesPage, linkedTitlesFilter, linkedTitlesSearch);
      refreshAdminLinks();
    } catch (err: any) {
      console.error('Failed to delete managing title link:', err);
      alert(`Error deleting link: ${err?.message || 'Network error'}`);
      fetchTitleLinks(managingTitle.id);
    } finally {
      setDeletingLinkId(null);
    }
  };

  // Submit search query for Linked Titles Hub
  const handleSearchTitlesSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLinkedTitlesPage(1);
    fetchLinkedCatalogTitles(1, linkedTitlesFilter, linkedTitlesSearch, 48);
  };

  // Clear search query for Linked Titles Hub
  const handleClearTitlesSearch = () => {
    setLinkedTitlesSearch('');
    setLinkedTitlesPage(1);
    fetchLinkedCatalogTitles(1, linkedTitlesFilter, '', 48);
  };

  // Handle Admin Login via server authorization
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(false);

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput.trim(),
          password: passwordInput,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.token) {
        sessionStorage.setItem('cinefuel_admin_token', data.token);
        localStorage.setItem('cinefuel_admin_token', data.token);
        setIsAuthenticated(true);
        setAuthError(false);
        setPasswordInput('');
        addLog('Administrator authenticated successfully via secure server session.', 'success');
      } else {
        setAuthError(true);
      }
    } catch {
      setAuthError(true);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('cinefuel_admin_token');
    localStorage.removeItem('cinefuel_admin_token');
    sessionStorage.removeItem('cinefuel_admin_auth');
    sessionStorage.removeItem('cinefuel_admin_user');
    sessionStorage.removeItem('cinefuel_admin_pass');
    localStorage.removeItem('cinefuel_admin_pass');
    localStorage.removeItem('cinefuel_admin_key');
    addLog('Admin logged out.', 'info');
    if (onLogout) onLogout();
  };

  const addLog = (message: string, level: 'info' | 'success' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setSystemLogs((prev) => [{ timestamp: time, level, message }, ...prev.slice(0, 19)]);
  };

  // Registered Users Directory Action Handlers
  const fetchAdminUsers = async () => {
    try {
      setIsLoadingUsers(true);
      const res = await fetch(`/api/users?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: getAdminAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.users)) {
          setRegisteredUsers(data.users);
        }
      }
    } catch (e) {
      console.error('Failed to fetch registered users:', e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleDeleteUser = async (uid: string, email: string) => {
    if (!confirm(`Are you sure you want to remove user "${email || uid}" from the system?`)) return;
    try {
      const res = await fetch(`/api/users?uid=${encodeURIComponent(uid)}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });
      if (res.ok) {
        setRegisteredUsers((prev) => prev.filter((u) => u.uid !== uid && u.firebaseUid !== uid));
        addLog(`Deleted user account: ${email || uid}`, 'info');
      }
    } catch (e: any) {
      alert('Failed to delete user: ' + e.message);
    }
  };

  // User Requests Action Handlers
  const fetchAdminRequests = async () => {
    try {
      setIsLoadingRequests(true);
      const res = await fetch(`/api/requests?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.requests)) {
          setRequestsList(data.requests);
          setPendingRequestsCount(data.pendingCount || 0);
        }
      }
    } catch (e) {
      console.error('Failed to fetch user requests:', e);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const handleUpdateStatus = async (
    id: string,
    status: 'pending' | 'in_progress' | 'fulfilled' | 'rejected',
    meta?: any
  ) => {
    // 1. Optimistic UI update for immediate instant feedback
    const previousRequests = [...requestsList];
    setRequestsList((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              ...(status === 'fulfilled' ? { fulfilledAt: new Date().toISOString() } : {}),
              ...(meta?.fulfilledLinkUrl ? { fulfilledLinkUrl: meta.fulfilledLinkUrl } : {}),
            }
          : r
      )
    );

    try {
      const res = await fetch('/api/requests', {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({ id, status, ...meta }),
      });
      if (res.ok) {
        addLog(`Request ${id} marked as ${status}.`, 'success');
        const refreshRes = await fetch(`/api/requests?_t=${Date.now()}`);
        if (refreshRes.ok) {
          const d = await refreshRes.json();
          if (Array.isArray(d.requests)) {
            setRequestsList(d.requests);
          }
          setPendingRequestsCount(d.pendingCount || 0);
        }
      } else {
        // Revert optimistic update on failure
        setRequestsList(previousRequests);
        const errData = await res.json().catch(() => ({}));
        addLog(`Failed to update request: ${errData.error || res.statusText}`, 'warn');
        alert(`Failed to update request: ${errData.error || res.statusText || 'Unauthorized'}`);
      }
    } catch (err: any) {
      setRequestsList(previousRequests);
      addLog(`Failed to update request: ${err.message}`, 'warn');
      alert(`Error updating request: ${err.message}`);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    const reqToDelete = requestsList.find((r) => r.id === id);
    const targetTitle = reqToDelete ? reqToDelete.title : id;
    if (!confirm(`Are you sure you want to delete the user request for "${targetTitle}"?\n\n(Only this user request entry will be deleted; media titles, links, and user accounts remain intact).`)) return;
    const previousRequests = [...requestsList];
    // Optimistic deletion
    setRequestsList((prev) => prev.filter((r) => r.id !== id));

    try {
      const res = await fetch(`/api/requests?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });
      if (res.ok) {
        addLog(`Request ${id} deleted.`, 'info');
        const refreshRes = await fetch(`/api/requests?_t=${Date.now()}`);
        if (refreshRes.ok) {
          const d = await refreshRes.json();
          if (Array.isArray(d.requests)) {
            setRequestsList(d.requests);
          }
          setPendingRequestsCount(d.pendingCount || 0);
        }
      } else {
        // Revert on failure
        setRequestsList(previousRequests);
        const errData = await res.json().catch(() => ({}));
        addLog(`Failed to delete request: ${errData.error || res.statusText}`, 'warn');
        alert(`Failed to delete request: ${errData.error || res.statusText || 'Unauthorized'}`);
      }
    } catch (err: any) {
      setRequestsList(previousRequests);
      addLog(`Failed to delete request: ${err.message}`, 'warn');
      alert(`Error deleting request: ${err.message}`);
    }
  };

  // Helper to format episode title with pattern tokens
  const formatAdminGridEpTitle = (
    epNum: number,
    pattern: string,
    season: number,
    targetTitle: string,
    quality: string,
    audio: string
  ) => {
    const epStr = epNum < 10 ? `0${epNum}` : `${epNum}`;
    const sStr = season < 10 ? `0${season}` : `${season}`;
    if (pattern && pattern.trim()) {
      return pattern
        .replace(/{title}/gi, targetTitle || 'Series')
        .replace(/{season}/gi, sStr)
        .replace(/{s}/gi, sStr)
        .replace(/{episode}/gi, epStr)
        .replace(/{ep}/gi, epStr)
        .replace(/{quality}/gi, quality || '')
        .replace(/{audio}/gi, audio || '')
        .trim();
    }
    return `${targetTitle || 'Series'} S${sStr}E${epStr} ${quality || '1080p WEB-DL'} [${audio || 'Hindi + English'}]`;
  };

  // Sync episode slots for Fulfill Modal grid
  const syncFulfillGridSlots = (
    count: number,
    season: number,
    pattern: string,
    quality: string,
    audio: string,
    size: string,
    titleName?: string
  ) => {
    const seriesTitle = titleName || fulfillingRequest?.title || 'Series';
    setFulfillGridEpisodes((prev) => {
      const newSlots = [];
      for (let i = 1; i <= count; i++) {
        const existing = prev.find((p) => p.episodeNumber === i);
        newSlots.push({
          episodeNumber: i,
          title:
            existing?.title && existing.title.trim().length > 3
              ? existing.title
              : formatAdminGridEpTitle(i, pattern, season, seriesTitle, quality, audio),
          url: existing?.url || '',
          quality: existing?.quality || quality || '1080p WEB-DL',
          audio: existing?.audio || audio || 'Hindi + English',
          size: existing?.size || size || '',
        });
      }
      return newSlots;
    });
  };

  const handleOpenFulfill = (req: UserRequest) => {
    setFulfillingRequest(req);
    const yr = req.releaseYear ? ` (${req.releaseYear})` : '';
    const initialQuality = req.quality || '1080p';
    const initialAudio = req.audioLanguage || 'Hindi + English';

    setFulfillTitle(`${req.title}${yr} ${initialQuality} [${initialAudio}]`);
    setFulfillUrl('');
    setFulfillQuality(initialQuality);
    setFulfillAudio(initialAudio);
    setFulfillSize('');
    setFulfillCategory(req.mediaType === 'tv' ? (req.seasonNumber ? 'SingleEpisode' : 'ZipPack') : 'Download');
    setFulfillSuccessMsg('');

    // Default mode: single, bulk, or grid
    setFulfillMode(req.mediaType === 'tv' && !req.episodeNumber ? 'bulk' : 'single');
    setFulfillBulkMediaType(req.mediaType === 'tv' ? 'tv' : 'movie');
    setFulfillBulkMovieCategory(req.mediaType === 'tv' ? 'SingleEpisode' : 'Download');
    setFulfillBulkRawText('');
    setFulfillBulkParsedItems([]);

    // Grid states
    const defaultSeason = req.seasonNumber || 1;
    const defaultCount = 8;
    const pattern = `{title} S{season}E{ep} {quality} [{audio}]`;
    setFulfillGridSeason(defaultSeason);
    setFulfillGridEpisodeCount(defaultCount);
    setFulfillGridBasePattern(pattern);
    setFulfillGridQuality(initialQuality);
    setFulfillGridAudio(initialAudio);
    setFulfillGridSize('');
    setFulfillGridBulkLinksText('');

    const newSlots = [];
    for (let i = 1; i <= defaultCount; i++) {
      newSlots.push({
        episodeNumber: i,
        title: formatAdminGridEpTitle(i, pattern, defaultSeason, req.title, initialQuality, initialAudio),
        url: '',
        quality: initialQuality,
        audio: initialAudio,
        size: '',
      });
    }
    setFulfillGridEpisodes(newSlots);
  };

  const handleFulfillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fulfillingRequest || !fulfillUrl.trim()) return;

    setIsFulfillingSubmit(true);
    let targetTmdbId = fulfillingRequest.tmdbId;

    if (!targetTmdbId) {
      const reqTitleLower = (fulfillingRequest.title || '').trim().toLowerCase();
      const found = Object.entries(knownTitlesCache).find(([_, info]) => {
        const titleStr = typeof info === 'string' ? info : info?.title;
        return (titleStr || '').trim().toLowerCase() === reqTitleLower;
      });
      if (found) targetTmdbId = Number(found[0]);
    }

    if (!targetTmdbId) {
      targetTmdbId = Math.floor(Math.random() * 800000) + 100000;
    }

    try {
      let finalUrl = fulfillUrl.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl;
      }

      const isPack = isPackMedia(fulfillTitle.trim(), finalUrl);
      const effCategory = isPack ? 'ZipPack' : fulfillCategory;
      const effLinkType = fulfillingRequest.mediaType === 'tv'
        ? (isPack || effCategory === 'ZipPack' ? 'zip_pack' : (fulfillingRequest.episodeNumber ? 'single_episode' : 'single_episode'))
        : (isPack ? 'zip_pack' : 'general');

      const generatedLinkId = `link-${Date.now()}`;
      const newCustomLink: CustomLink = {
        id: generatedLinkId,
        title: fulfillTitle.trim(),
        url: finalUrl,
        category: effCategory,
        createdAt: new Date().toISOString(),
        quality: fulfillQuality.trim() || undefined,
        audioLanguage: fulfillAudio.trim() || undefined,
        size: fulfillSize.trim() || undefined,
        seasonNumber: fulfillingRequest.seasonNumber,
        episodeNumber: effLinkType === 'zip_pack' ? undefined : fulfillingRequest.episodeNumber,
        linkType: effLinkType,
      };

      // 1. Save link to title database with verified admin auth
      const linkRes = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          movieId: String(targetTmdbId),
          link: newCustomLink,
          movieTitle: fulfillingRequest.title,
          posterPath: fulfillingRequest.posterPath,
          mediaType: fulfillingRequest.mediaType,
        }),
      });

      if (!linkRes.ok) {
        const linkErr = await linkRes.json().catch(() => ({}));
        throw new Error(linkErr.error || 'Failed to save link to title database');
      }

      await saveGlobalCustomLink(targetTmdbId, newCustomLink);

      // 2. Update local customLinksMap with URL deduplication
      setCustomLinksMap((prev) => {
        const key = String(targetTmdbId);
        const existing = prev[key] || [];
        const filtered = existing.filter(
          (l) => l.id !== newCustomLink.id && l.url.trim().toLowerCase() !== newCustomLink.url.trim().toLowerCase()
        );
        return {
          ...prev,
          [key]: [newCustomLink, ...filtered],
        };
      });

      // 3. Mark request as fulfilled
      const res = await fetch('/api/requests', {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          id: fulfillingRequest.id,
          status: 'fulfilled',
          fulfilledLinkId: generatedLinkId,
          fulfilledLinkUrl: finalUrl,
        }),
      });

      if (res.ok) {
        setFulfillSuccessMsg(`🎉 Successfully published link and fulfilled request for "${fulfillingRequest.title}"!`);
        addLog(`Fulfilled request for "${fulfillingRequest.title}" with link: ${finalUrl}`, 'success');
        fetchAdminRequests();
        
        setRequestsList((prev) =>
          prev.map((r) =>
            r.id === fulfillingRequest.id
              ? {
                  ...r,
                  status: 'fulfilled',
                  fulfilledAt: new Date().toISOString(),
                  fulfilledLinkUrl: finalUrl,
                }
              : r
          )
        );
        setPendingRequestsCount((prev) => Math.max(0, prev - 1));

        setTimeout(() => {
          setFulfillingRequest(null);
          setFulfillSuccessMsg('');
        }, 2200);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to fulfill request: ${err.error || res.statusText || 'Unauthorized'}`);
        addLog(`Failed to fulfill request: ${err.error || res.statusText}`, 'warn');
      }
    } catch (err: any) {
      console.error('Error fulfilling request:', err);
      addLog(`Failed to fulfill request: ${err.message}`, 'warn');
    } finally {
      setIsFulfillingSubmit(false);
    }
  };

  // Toggle type of individual item in fulfill bulk preview
  const handleFulfillToggleBulkItemType = (id: string) => {
    setFulfillBulkParsedItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const isSingle = item.linkType === 'single_episode';
          return {
            ...item,
            linkType: isSingle ? 'zip_pack' : 'single_episode',
            category: isSingle ? 'ZipPack' : 'SingleEpisode',
            episodeNumber: isSingle ? undefined : item.episodeNumber || 1,
          };
        }
        return item;
      })
    );
  };

  // Set category for all items in fulfill movie bulk mode
  const handleFulfillSetAllBulkCategory = (cat: CustomLink['category']) => {
    setFulfillBulkMovieCategory(cat);
    setFulfillBulkParsedItems((prev) =>
      prev.map((item) => ({
        ...item,
        category: cat,
      }))
    );
  };

  // Convert all items in fulfill bulk preview to single episodes or zip packs
  const handleFulfillSetAllBulkType = (type: 'single_episode' | 'zip_pack') => {
    setFulfillBulkParsedItems((prev) =>
      prev.map((item, index) => ({
        ...item,
        linkType: type,
        category: type === 'zip_pack' ? 'ZipPack' : 'SingleEpisode',
        episodeNumber: type === 'single_episode' ? (item.episodeNumber || index + 1) : undefined,
      }))
    );
  };

  // Handle Bulk Links Fulfill Submission
  const handleFulfillBulkSubmit = async () => {
    if (!fulfillingRequest || fulfillBulkParsedItems.length === 0) return;

    setIsFulfillingSubmit(true);
    let targetTmdbId = fulfillingRequest.tmdbId;

    if (!targetTmdbId) {
      const reqTitleLower = (fulfillingRequest.title || '').trim().toLowerCase();
      const found = Object.entries(knownTitlesCache).find(([_, info]) => {
        const titleStr = typeof info === 'string' ? info : info?.title;
        return (titleStr || '').trim().toLowerCase() === reqTitleLower;
      });
      if (found) targetTmdbId = Number(found[0]);
    }

    if (!targetTmdbId) {
      targetTmdbId = Math.floor(Math.random() * 800000) + 100000;
    }

    const isMovie = fulfillBulkMediaType === 'movie';
    const createdObjs: CustomLink[] = [];

    fulfillBulkParsedItems.forEach((item, index) => {
      let finalUrl = item.url.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = `https://${finalUrl}`;
      }

      const newObj: CustomLink = {
        id: `bulk-fulfill-${Date.now()}-${index}`,
        title: item.title,
        url: finalUrl,
        category: isMovie ? (item.category || fulfillBulkMovieCategory || 'Download') : item.category,
        createdAt: new Date(Date.now() - index * 1000).toISOString(),
        seasonNumber: isMovie ? undefined : item.seasonNumber,
        episodeNumber: isMovie ? undefined : item.episodeNumber,
        quality: item.quality,
        audioLanguage: item.audioLanguage,
        size: item.size,
        linkType: isMovie ? 'general' : item.linkType,
      };
      createdObjs.push(newObj);
    });

    try {
      // 1. Save all links to database with verified admin auth
      const linkRes = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          movieId: String(targetTmdbId),
          links: createdObjs,
          movieTitle: fulfillingRequest.title,
          posterPath: fulfillingRequest.posterPath,
          mediaType: fulfillingRequest.mediaType,
        }),
      });

      if (!linkRes.ok) {
        const linkErr = await linkRes.json().catch(() => ({}));
        throw new Error(linkErr.error || 'Failed to save bulk links to database');
      }

      await saveMultipleGlobalCustomLinks(targetTmdbId, createdObjs);

      // 2. Update local customLinksMap with URL deduplication
      setCustomLinksMap((prev) => {
        const key = String(targetTmdbId);
        const existing = prev[key] || [];
        const newUrls = new Set(createdObjs.map((l) => l.url.trim().toLowerCase()));
        const filtered = existing.filter((l) => !newUrls.has(l.url.trim().toLowerCase()));
        return {
          ...prev,
          [key]: [...createdObjs, ...filtered],
        };
      });

      // 3. Mark user request fulfilled
      const primeUrl = createdObjs[0]?.url || '';
      const primeId = createdObjs[0]?.id || `link-${Date.now()}`;

      const res = await fetch('/api/requests', {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          id: fulfillingRequest.id,
          status: 'fulfilled',
          fulfilledLinkId: primeId,
          fulfilledLinkUrl: primeUrl,
        }),
      });

      if (res.ok) {
        setFulfillSuccessMsg(`🎉 Successfully imported ${createdObjs.length} link${createdObjs.length > 1 ? 's' : ''} & fulfilled request for "${fulfillingRequest.title}"!`);
        addLog(`Fulfilled request for "${fulfillingRequest.title}" with ${createdObjs.length} bulk links`, 'success');
        fetchAdminRequests();

        setRequestsList((prev) =>
          prev.map((r) =>
            r.id === fulfillingRequest.id
              ? {
                  ...r,
                  status: 'fulfilled',
                  fulfilledAt: new Date().toISOString(),
                  fulfilledLinkUrl: primeUrl,
                }
              : r
          )
        );
        setPendingRequestsCount((prev) => Math.max(0, prev - 1));

        setTimeout(() => {
          setFulfillingRequest(null);
          setFulfillSuccessMsg('');
          setFulfillBulkRawText('');
          setFulfillBulkParsedItems([]);
        }, 2200);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to fulfill bulk request: ${err.error || res.statusText || 'Unauthorized'}`);
        addLog(`Failed to fulfill request with bulk links: ${err.error || res.statusText}`, 'warn');
      }
    } catch (err: any) {
      console.error('Error fulfilling bulk request:', err);
      addLog(`Failed to fulfill request with bulk links: ${err.message}`, 'warn');
    } finally {
      setIsFulfillingSubmit(false);
    }
  };

  // Distribute links pasted into fulfill grid
  const handleFulfillDistributeGridUrls = (text: string) => {
    setFulfillGridBulkLinksText(text);
    const urls = text.match(/(https?:\/\/[^\s<>"']+)/gi) || [];
    if (urls.length > 0) {
      setFulfillGridEpisodes((prev) =>
        prev.map((slot, index) => {
          if (urls[index]) {
            return { ...slot, url: urls[index] };
          }
          return slot;
        })
      );
    }
  };

  // Update a single episode slot in fulfill grid
  const handleFulfillUpdateGridSlot = (
    epNum: number,
    field: 'title' | 'url' | 'quality' | 'audio' | 'size',
    value: string
  ) => {
    setFulfillGridEpisodes((prev) =>
      prev.map((slot) => (slot.episodeNumber === epNum ? { ...slot, [field]: value } : slot))
    );
  };

  // Apply pattern to all titles in fulfill grid
  const handleFulfillApplyPatternToAll = () => {
    const seriesTitle = fulfillingRequest?.title || 'Series';
    setFulfillGridEpisodes((prev) =>
      prev.map((slot) => ({
        ...slot,
        title: formatAdminGridEpTitle(
          slot.episodeNumber,
          fulfillGridBasePattern,
          fulfillGridSeason,
          seriesTitle,
          fulfillGridQuality,
          fulfillGridAudio
        ),
      }))
    );
  };

  // Save all fulfill grid episode containers and fulfill request
  const handleFulfillGridSubmit = async () => {
    if (!fulfillingRequest) return;
    const valid = fulfillGridEpisodes.filter((e) => e.url.trim() && e.title.trim());
    if (valid.length === 0) {
      alert('Please fill in at least one episode container link before fulfilling.');
      return;
    }

    setIsFulfillingSubmit(true);
    let targetTmdbId = fulfillingRequest.tmdbId;

    if (!targetTmdbId) {
      const reqTitleLower = (fulfillingRequest.title || '').trim().toLowerCase();
      const found = Object.entries(knownTitlesCache).find(([_, info]) => {
        const titleStr = typeof info === 'string' ? info : info?.title;
        return (titleStr || '').trim().toLowerCase() === reqTitleLower;
      });
      if (found) targetTmdbId = Number(found[0]);
    }

    if (!targetTmdbId) {
      targetTmdbId = Math.floor(Math.random() * 800000) + 100000;
    }

    const createdObjs: CustomLink[] = [];
    valid.forEach((ep, index) => {
      let finalUrl = ep.url.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = `https://${finalUrl}`;
      }

      const newLink: CustomLink = {
        id: `fulfill-grid-${Date.now()}-${ep.episodeNumber}-${index}`,
        title: ep.title.trim(),
        url: finalUrl,
        category: 'SingleEpisode',
        createdAt: new Date(Date.now() - index * 1000).toISOString(),
        seasonNumber: fulfillGridSeason,
        episodeNumber: ep.episodeNumber,
        quality: ep.quality.trim() || fulfillGridQuality || '1080p WEB-DL',
        audioLanguage: ep.audio.trim() || fulfillGridAudio || 'Hindi + English',
        size: ep.size.trim() || fulfillGridSize || undefined,
        linkType: 'single_episode',
      };
      createdObjs.push(newLink);
    });

    try {
      // 1. Save links via backend API
      const linkRes = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          movieId: String(targetTmdbId),
          links: createdObjs,
          movieTitle: fulfillingRequest.title,
          posterPath: fulfillingRequest.posterPath,
          mediaType: fulfillingRequest.mediaType,
        }),
      });

      if (!linkRes.ok) {
        const linkErr = await linkRes.json().catch(() => ({}));
        throw new Error(linkErr.error || 'Failed to save grid links to database');
      }

      await saveMultipleGlobalCustomLinks(targetTmdbId, createdObjs);

      // 2. Update local customLinksMap with URL deduplication
      setCustomLinksMap((prev) => {
        const key = String(targetTmdbId);
        const existing = prev[key] || [];
        const newUrls = new Set(createdObjs.map((l) => l.url.trim().toLowerCase()));
        const filtered = existing.filter((l) => !newUrls.has(l.url.trim().toLowerCase()));
        return {
          ...prev,
          [key]: [...createdObjs, ...filtered],
        };
      });

      // 3. Mark request as fulfilled
      const primeUrl = createdObjs[0]?.url || '';
      const primeId = createdObjs[0]?.id || `link-${Date.now()}`;

      const res = await fetch('/api/requests', {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          id: fulfillingRequest.id,
          status: 'fulfilled',
          fulfilledLinkId: primeId,
          fulfilledLinkUrl: primeUrl,
        }),
      });

      if (res.ok) {
        setFulfillSuccessMsg(`🎉 Successfully saved ${createdObjs.length} episode containers & fulfilled request for "${fulfillingRequest.title}"!`);
        addLog(`Fulfilled request for "${fulfillingRequest.title}" with ${createdObjs.length} episode grid links`, 'success');
        fetchAdminRequests();

        setRequestsList((prev) =>
          prev.map((r) =>
            r.id === fulfillingRequest.id
              ? {
                  ...r,
                  status: 'fulfilled',
                  fulfilledAt: new Date().toISOString(),
                  fulfilledLinkUrl: primeUrl,
                }
              : r
          )
        );
        setPendingRequestsCount((prev) => Math.max(0, prev - 1));

        setTimeout(() => {
          setFulfillingRequest(null);
          setFulfillSuccessMsg('');
        }, 2200);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to fulfill grid request: ${err.error || res.statusText || 'Unauthorized'}`);
        addLog(`Failed to fulfill request with episode grid: ${err.error || res.statusText}`, 'warn');
      }
    } catch (err: any) {
      console.error('Error fulfilling grid request:', err);
      addLog(`Failed to fulfill request with episode grid: ${err.message}`, 'warn');
    } finally {
      setIsFulfillingSubmit(false);
    }
  };

  // ==============================================================
  // Defective Links / Broken Reports Handlers
  // ==============================================================
  const fetchAdminReports = async () => {
    try {
      setIsLoadingReports(true);
      const res = await fetch(`/api/reports?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.reports)) {
          setReportsList(data.reports);
          setPendingReportsCount(data.pendingCount || 0);
        }
      }
    } catch (e) {
      console.error('Failed to fetch defective link reports:', e);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const handleUpdateReportStatus = async (
    id: string,
    status: 'pending' | 'in_progress' | 'fixed' | 'dismissed',
    meta?: any
  ) => {
    // 1. Optimistic UI update
    const previousReports = [...reportsList];
    setReportsList((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              ...(status === 'fixed' || status === 'dismissed' ? { resolvedAt: new Date().toISOString() } : {}),
              ...(meta?.replacementUrl ? { replacementUrl: meta.replacementUrl } : {}),
              ...(meta?.adminNote ? { adminNote: meta.adminNote } : {}),
            }
          : r
      )
    );

    try {
      const res = await fetch('/api/reports', {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({ id, status, ...meta }),
      });
      if (res.ok) {
        addLog(`Defective report ${id} status updated to ${status}.`, 'success');
        const refreshRes = await fetch(`/api/reports?_t=${Date.now()}`);
        if (refreshRes.ok) {
          const d = await refreshRes.json();
          if (Array.isArray(d.reports)) {
            setReportsList(d.reports);
          }
          setPendingReportsCount(d.pendingCount || 0);
        }
      } else {
        // Revert optimistic update
        setReportsList(previousReports);
        const errData = await res.json().catch(() => ({}));
        addLog(`Failed to update report: ${errData.error || res.statusText}`, 'warn');
        alert(`Failed to update report: ${errData.error || res.statusText || 'Unauthorized'}`);
      }
    } catch (err: any) {
      setReportsList(previousReports);
      addLog(`Failed to update defective report: ${err.message}`, 'warn');
      alert(`Error updating report: ${err.message}`);
    }
  };

  const handleDeleteBrokenLinkDirectly = async (report: DefectiveLinkReport) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete this broken link from CiNEPHiLE?\n\nTitle: ${report.mediaTitle}\nURL: ${report.reportedUrl}`
      )
    )
      return;

    try {
      // 1. Remove from client state & local storage
      if (report.movieId) {
        const key = String(report.movieId);
        const currentLinks = customLinksMap[key] || [];
        const targetUrl = (report.reportedUrl || '').trim().toLowerCase();
        const matchingLink = currentLinks.find(
          (l) => (report.linkId && l.id === report.linkId) || (targetUrl && l.url.trim().toLowerCase() === targetUrl)
        );
        const linkIdToDelete = matchingLink?.id || report.linkId;
        if (linkIdToDelete) {
          removeCustomLink(report.movieId, linkIdToDelete);
          await deleteGlobalCustomLink(report.movieId, linkIdToDelete);
          setCustomLinksMap((prev) => ({
            ...prev,
            [key]: (prev[key] || []).filter((l) => l.id !== linkIdToDelete && (!targetUrl || l.url.trim().toLowerCase() !== targetUrl)),
          }));
        }
      }

      // 2. Mark report as fixed with deletion metadata
      await handleUpdateReportStatus(report.id, 'fixed', {
        adminNote: 'Broken link permanently removed from CiNEPHiLE database.',
        deleteInDatabase: true,
        movieId: report.movieId,
        linkId: report.linkId,
      });

      addLog(`Deleted defective link permanently for "${report.mediaTitle}"`, 'warn');
    } catch (err: any) {
      addLog(`Failed to delete defective link: ${err.message}`, 'warn');
      alert(`Error deleting defective link: ${err.message}`);
    }
  };

  const handleOpenFixModal = (report: DefectiveLinkReport) => {
    setFixingReport(report);
    setReplaceUrl(report.reportedUrl || ''); // Pre-fill with existing reported URL so admin can edit it directly!
    setReplaceTitle(report.linkTitle);
    setReplaceQuality(report.quality || '1080p WEB-DL');
    setReplaceAudio('');
    setReplaceSize('');
    setReplaceAdminNote(
      report.issueType === 'wrong_episode'
        ? 'Corrected media title/type and updated working link.'
        : 'Replaced with verified working download mirror.'
    );
    setUpdateDbWithReplacement(true);
    setFixSuccessMsg('');

    // Pre-populate target title, media type, and movieId
    setReplaceTargetTitle(report.mediaTitle);
    setReplaceTargetMediaType(report.mediaType || 'movie');
    setReplaceTargetMovieId(report.movieId);
    setIsChangingTarget(report.issueType === 'wrong_episode'); // Auto-open title reassign panel if issue was title/episode mismatch!
    setReassignSearchQuery('');
    setReassignSearchResults([]);
  };

  const handleSubmitFixReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fixingReport || !replaceUrl.trim()) return;

    let finalUrl = replaceUrl.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`;
    }

    const targetMovieId = replaceTargetMovieId || fixingReport.movieId;
    const isTargetChanged = targetMovieId !== fixingReport.movieId || replaceTargetMediaType !== fixingReport.mediaType;

    try {
      setIsFixingSubmit(true);

      // 1. If target changed (e.g. from TV show to Movie, or to another movie ID):
      if (isTargetChanged && fixingReport.movieId) {
        deleteGlobalCustomLink(fixingReport.movieId, fixingReport.linkId || '');
        removeCustomLink(fixingReport.movieId, fixingReport.linkId || '');
        await deleteMultipleGlobalCustomLinks([{ movieId: fixingReport.movieId, linkId: fixingReport.linkId || '' }]);
        try {
          await fetch(`/api/curated-links?movieId=${fixingReport.movieId}&linkId=${fixingReport.linkId}`, {
            method: 'DELETE',
            headers: getAdminAuthHeaders(),
          });
        } catch {}
      }

      // 2. If updateDbWithReplacement is enabled and we have a valid targetMovieId
      if (updateDbWithReplacement && targetMovieId) {
        const isTV = replaceTargetMediaType === 'tv';
        const parsed = parseFullMediaTitle(replaceTitle.trim(), finalUrl);
        const isPack = isTV && (isPackMedia(replaceTitle.trim(), finalUrl) || parsed.linkType === 'zip_pack');

        const replacementLinkObj: CustomLink = {
          id: fixingReport.linkId || `link-${Date.now()}`,
          title: replaceTitle.trim() || fixingReport.linkTitle,
          url: finalUrl,
          category: isTV ? (isPack ? 'ZipPack' : 'SingleEpisode') : 'Download',
          createdAt: new Date().toISOString(),
          seasonNumber: isTV ? (parsed.seasonNumber || 1) : undefined,
          episodeNumber: isTV ? (isPack ? undefined : (parsed.episodeNumber || 1)) : undefined,
          linkType: isTV ? (isPack ? 'zip_pack' : 'single_episode') : 'general',
          quality: replaceQuality.trim() || fixingReport.quality || '1080p WEB-DL',
          audioLanguage: replaceAudio.trim(),
          size: replaceSize.trim(),
        };

        saveGlobalCustomLink(targetMovieId, replacementLinkObj);
        addCustomLink(targetMovieId, {
          title: replacementLinkObj.title,
          url: replacementLinkObj.url,
          category: isTV ? 'SingleEpisode' : 'Download',
        });
        setCustomLinksMap((prev) => {
          const key = String(targetMovieId);
          const existing = prev[key] || [];
          const filtered = existing.filter(
            (l) => l.id !== replacementLinkObj.id && l.url.trim().toLowerCase() !== finalUrl.toLowerCase()
          );
          return {
            ...prev,
            [key]: [replacementLinkObj, ...filtered],
          };
        });
      }

      // 3. Mark report as fixed in server database
      const res = await fetch('/api/reports', {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          id: fixingReport.id,
          status: 'fixed',
          replacementUrl: finalUrl,
          adminNote: replaceAdminNote.trim(),
          replaceInDatabase: updateDbWithReplacement,
          movieId: targetMovieId,
          linkId: fixingReport.linkId,
          updatedLinkTitle: replaceTitle.trim() || fixingReport.linkTitle,
          updatedQuality: replaceQuality.trim(),
          updatedAudio: replaceAudio.trim(),
          updatedSize: replaceSize.trim(),
          oldMovieId: isTargetChanged ? fixingReport.movieId : undefined,
        }),
      });

      if (res.ok) {
        setFixSuccessMsg('🎉 Defective link updated, reassigned to correct title, and marked as fixed!');
        addLog(`Replaced defective link for "${replaceTargetTitle || fixingReport.mediaTitle}" with: ${finalUrl}`, 'success');

        setReportsList((prev) =>
          prev.map((r) =>
            r.id === fixingReport.id
              ? {
                  ...r,
                  status: 'fixed',
                  resolvedAt: new Date().toISOString(),
                  replacementUrl: finalUrl,
                  adminNote: replaceAdminNote.trim(),
                  mediaTitle: replaceTargetTitle || r.mediaTitle,
                  mediaType: replaceTargetMediaType || r.mediaType,
                  movieId: targetMovieId,
                }
              : r
          )
        );
        setPendingReportsCount((prev) => Math.max(0, prev - 1));

        setTimeout(() => {
          setFixingReport(null);
          setFixSuccessMsg('');
        }, 2000);
      } else {
        const errData = await res.json().catch(() => ({}));
        addLog(`Failed to fix defective link: ${errData.error || res.statusText}`, 'warn');
        alert(`Failed to save replacement: ${errData.error || res.statusText || 'Unauthorized'}`);
      }
    } catch (err: any) {
      addLog(`Failed to fix defective link: ${err.message}`, 'warn');
      alert(`Error fixing defective link: ${err.message}`);
    } finally {
      setIsFixingSubmit(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this defective link report record? (Note: This will only remove this report entry; movie titles, links, and user accounts will not be affected.)'
      )
    )
      return;
    const previousReports = [...reportsList];
    setReportsList((prev) => prev.filter((r) => r.id !== id));

    try {
      const res = await fetch(`/api/reports?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });
      if (res.ok) {
        addLog(`Report ${id} deleted permanently.`, 'info');
        const refreshRes = await fetch(`/api/reports?_t=${Date.now()}`);
        if (refreshRes.ok) {
          const d = await refreshRes.json();
          if (Array.isArray(d.reports)) setReportsList(d.reports);
          setPendingReportsCount(d.pendingCount || 0);
        }
      } else {
        setReportsList(previousReports);
        const errData = await res.json().catch(() => ({}));
        addLog(`Failed to delete report: ${errData.error || res.statusText}`, 'warn');
        alert(`Failed to delete report: ${errData.error || res.statusText || 'Unauthorized'}`);
      }
    } catch (err: any) {
      setReportsList(previousReports);
      addLog(`Failed to delete report: ${err.message}`, 'warn');
      alert(`Error deleting report: ${err.message}`);
    }
  };

  // Admin Reply Action Handler for Requests & Reports
  const handleSendAdminReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminReplyTarget || !adminReplyText.trim()) return;
    setIsSendingReply(true);
    try {
      const endpoint = adminReplyTarget.type === 'request' ? '/api/requests' : '/api/reports';
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          id: adminReplyTarget.id,
          status: adminReplyTarget.currentStatus,
          adminReply: adminReplyText.trim(),
        }),
      });

      if (res.ok) {
        addLog(`Reply sent to user for ${adminReplyTarget.type} "${adminReplyTarget.title}"`, 'success');
        const newReply = {
          sender: 'admin' as const,
          message: adminReplyText.trim(),
          createdAt: new Date().toISOString(),
        };

        if (adminReplyTarget.type === 'request') {
          setRequestsList((prev) =>
            prev.map((r) =>
              r.id === adminReplyTarget.id
                ? { ...r, adminReplies: [...(r.adminReplies || []), newReply] }
                : r
            )
          );
        } else {
          setReportsList((prev) =>
            prev.map((r) =>
              r.id === adminReplyTarget.id
                ? { ...r, adminReplies: [...(r.adminReplies || []), newReply] }
                : r
            )
          );
        }

        setAdminReplyTarget(null);
        setAdminReplyText('');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to send reply: ${err.error || res.statusText || 'Unauthorized'}`);
      }
    } catch (e: any) {
      alert(`Error sending reply: ${e.message}`);
    } finally {
      setIsSendingReply(false);
    }
  };

  // Test TMDB API Key Live
  const handleTestTmdb = async () => {
    setIsTestingTmdb(true);
    setTmdbTestResult(null);
    try {
      const keyToTest = tmdbKey.trim() || getActiveTmdbKey();
      if (!keyToTest) {
        setTmdbTestResult({ success: false, msg: 'No TMDB API key configured.' });
        return;
      }
      const res = await fetch(`https://api.themoviedb.org/3/movie/872585?api_key=${keyToTest}`);
      if (res.ok) {
        const data = await res.json();
        setTmdbTestResult({ success: true, msg: `Active: Verified connection to "${data.title}"` });
        addLog(`TMDB API Ping successful: ${data.title}`, 'success');
      } else {
        setTmdbTestResult({ success: false, msg: `Failed: TMDB returned status ${res.status}` });
        addLog(`TMDB API Ping failed: Status ${res.status}`, 'warn');
      }
    } catch (err: any) {
      setTmdbTestResult({ success: false, msg: `Error: ${err.message}` });
      addLog(`TMDB API Ping error: ${err.message}`, 'warn');
    } finally {
      setIsTestingTmdb(false);
    }
  };

  // Save API Configurations
  const handleSaveApis = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      const storedSettings = safeGetLocalStorage('cinefuel_settings') || '{}';
      try {
        const parsed = JSON.parse(storedSettings);
        parsed.tmdbApiKey = tmdbKey.trim();
        safeSetLocalStorage('cinefuel_settings', JSON.stringify(parsed));
      } catch {
        safeSetLocalStorage('cinefuel_settings', JSON.stringify({ tmdbApiKey: tmdbKey.trim() }));
      }
    }

    setApiSaveSuccess(true);
    addLog('API keys and engine settings updated.', 'success');
    setTimeout(() => setApiSaveSuccess(false), 3500);
  };

  // Handle Quick Add Single Custom Link
  const handleQuickAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkTitle.trim() || !newLinkUrl.trim() || !selectedTargetTitle) return;

    let url = newLinkUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const parsed = parseFullMediaTitle(newLinkTitle.trim(), url);
    const isPack = isPackMedia(newLinkTitle.trim(), url) || parsed.linkType === 'zip_pack';

    let finalCategory = newLinkCategory;
    let finalType: 'zip_pack' | 'single_episode' | 'general' = newLinkType;

    if (isPack && (selectedTargetTitle.media_type === 'tv' || newLinkCategory === 'SingleEpisode' || newLinkCategory === 'ZipPack')) {
      finalCategory = 'ZipPack';
      finalType = 'zip_pack';
    } else if (newLinkCategory === 'SingleEpisode') {
      finalType = 'single_episode';
    } else if (newLinkCategory === 'ZipPack') {
      finalType = 'zip_pack';
    } else if (selectedTargetTitle.media_type === 'tv') {
      finalType = parsed.linkType;
      if (parsed.linkType === 'single_episode') finalCategory = 'SingleEpisode';
      else if (parsed.linkType === 'zip_pack') finalCategory = 'ZipPack';
    }

    const isTVLink = finalCategory === 'SingleEpisode' || finalCategory === 'ZipPack' || selectedTargetTitle.media_type === 'tv';
    const effectiveMediaType: 'movie' | 'tv' = isTVLink ? 'tv' : 'movie';
    const movieTitle = selectedTargetTitle.title || '';
    const posterPath = selectedTargetTitle.poster_path || null;
    const backdropPath = selectedTargetTitle.backdrop_path || null;
    const releaseDate = selectedTargetTitle.release_date || selectedTargetTitle.first_air_date || (selectedTargetTitle.year ? `${selectedTargetTitle.year}-01-01` : '');
    const voteAverage = selectedTargetTitle.vote_average;

    const metadata = {
      movieTitle,
      mediaType: effectiveMediaType,
      posterPath,
      backdropPath,
      releaseDate,
      voteAverage,
    };

    const newLinkObj: CustomLink = {
      id: `link-${Date.now()}`,
      title: newLinkTitle.trim(),
      url,
      category: finalCategory,
      createdAt: new Date().toISOString(),
      seasonNumber: isTVLink ? newLinkSeason : parsed.seasonNumber,
      episodeNumber: finalType === 'zip_pack' ? undefined : (finalCategory === 'SingleEpisode' ? newLinkEpisode : parsed.episodeNumber),
      linkType: finalType,
      quality: newLinkQuality.trim() || parsed.quality,
      audioLanguage: newLinkAudio.trim() || parsed.audioLanguage,
      size: newLinkSize.trim() || parsed.size,
      movieTitle,
      mediaType: effectiveMediaType,
      posterPath,
      backdropPath,
      releaseDate,
      voteAverage,
    };

    saveGlobalCustomLink(selectedTargetTitle.id, newLinkObj, metadata);

    addCustomLink(selectedTargetTitle.id, {
      title: newLinkTitle.trim(),
      url,
      category: finalCategory,
    });

    setCustomLinksMap((prev) => {
      const key = String(selectedTargetTitle.id);
      const existing = prev[key] || [];
      const filtered = existing.filter(
        (l) => l.id !== newLinkObj.id && l.url.trim().toLowerCase() !== newLinkObj.url.trim().toLowerCase()
      );
      return {
        ...prev,
        [key]: [newLinkObj, ...filtered],
      };
    });

    setNewLinkTitle('');
    setNewLinkUrl('');
    setNewLinkQuality('');
    setNewLinkAudio('');
    setNewLinkSize('');
    setAddLinkSuccess(true);
    addLog(`Admin added custom link "${newLinkTitle}" for "${selectedTargetTitle.title}" (ID: ${selectedTargetTitle.id})`, 'success');
    setTimeout(() => setAddLinkSuccess(false), 3000);
  };

  // Toggle type of individual item in bulk preview
  const handleToggleBulkItemType = (id: string) => {
    setAdminBulkParsedItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const isSingle = item.linkType === 'single_episode';
          return {
            ...item,
            linkType: isSingle ? 'zip_pack' : 'single_episode',
            category: isSingle ? 'ZipPack' : 'SingleEpisode',
            episodeNumber: isSingle ? undefined : item.episodeNumber || 1,
          };
        }
        return item;
      })
    );
  };

  // Set category for all items in movie bulk mode
  const handleSetAllBulkCategory = (cat: CustomLink['category']) => {
    setAdminBulkMovieCategory(cat);
    setAdminBulkParsedItems((prev) =>
      prev.map((item) => ({
        ...item,
        category: cat,
      }))
    );
  };

  // Convert all items in bulk preview to single episodes or zip packs
  const handleSetAllBulkType = (type: 'single_episode' | 'zip_pack') => {
    setAdminBulkParsedItems((prev) =>
      prev.map((item, index) => ({
        ...item,
        linkType: type,
        category: type === 'zip_pack' ? 'ZipPack' : 'SingleEpisode',
        episodeNumber: type === 'single_episode' ? (item.episodeNumber || index + 1) : undefined,
      }))
    );
  };

  // Update season of item in bulk preview
  const handleUpdateBulkItemSeason = (id: string, s: number) => {
    setAdminBulkParsedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, seasonNumber: s } : item))
    );
  };

  // Update episode of item in bulk preview
  const handleUpdateBulkItemEpisode = (id: string, ep: number) => {
    setAdminBulkParsedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, episodeNumber: ep, linkType: 'single_episode', category: 'SingleEpisode' } : item))
    );
  };

  // Handle Bulk Links Import
  const handleAdminImportBulk = () => {
    if (adminBulkParsedItems.length === 0 || !selectedTargetTitle) return;

    const isMovie = adminBulkMediaType === 'movie';
    const effectiveMediaType: 'movie' | 'tv' = isMovie ? 'movie' : 'tv';
    const movieTitle = selectedTargetTitle.title || '';
    const posterPath = selectedTargetTitle.poster_path || null;
    const backdropPath = selectedTargetTitle.backdrop_path || null;
    const releaseDate = selectedTargetTitle.release_date || selectedTargetTitle.first_air_date || (selectedTargetTitle.year ? `${selectedTargetTitle.year}-01-01` : '');
    const voteAverage = selectedTargetTitle.vote_average;

    const metadata = {
      movieTitle,
      mediaType: effectiveMediaType,
      posterPath,
      backdropPath,
      releaseDate,
      voteAverage,
    };

    const createdObjs: CustomLink[] = [];
    adminBulkParsedItems.forEach((item, index) => {
      const newObj: CustomLink = {
        id: `bulk-admin-${Date.now()}-${index}`,
        title: item.title,
        url: item.url,
        category: isMovie ? (item.category || adminBulkMovieCategory || 'Streaming') : item.category,
        createdAt: new Date(Date.now() - index * 1000).toISOString(),
        seasonNumber: isMovie ? undefined : item.seasonNumber,
        episodeNumber: isMovie ? undefined : item.episodeNumber,
        quality: item.quality,
        audioLanguage: item.audioLanguage,
        size: item.size,
        linkType: isMovie ? 'general' : item.linkType,
        movieTitle,
        mediaType: effectiveMediaType,
        posterPath,
        backdropPath,
        releaseDate,
        voteAverage,
      };
      createdObjs.push(newObj);
    });

    saveMultipleGlobalCustomLinks(selectedTargetTitle.id, createdObjs, metadata);

    setCustomLinksMap((prev) => {
      const key = String(selectedTargetTitle.id);
      const existing = prev[key] || [];
      const newUrls = new Set(createdObjs.map((l) => l.url.trim().toLowerCase()));
      const filtered = existing.filter((l) => !newUrls.has(l.url.trim().toLowerCase()));
      return {
        ...prev,
        [key]: [...createdObjs, ...filtered],
      };
    });

    const count = adminBulkParsedItems.length;
    if (isMovie) {
      setAdminBulkSuccessMsg(`🎉 Successfully imported ${count} Movie Release${count > 1 ? 's' : ''} to "${selectedTargetTitle.title}"!`);
      addLog(`Admin bulk imported ${count} movie releases for "${selectedTargetTitle.title}"`, 'success');
    } else {
      const epCount = adminBulkParsedItems.filter((i) => i.linkType === 'single_episode').length;
      const zipCount = adminBulkParsedItems.filter((i) => i.linkType === 'zip_pack').length;
      setAdminBulkSuccessMsg(`🎉 Successfully imported ${count} links (${epCount} Episodes, ${zipCount} Zip Packs) for "${selectedTargetTitle.title}"!`);
      addLog(`Admin bulk imported ${count} TV links for "${selectedTargetTitle.title}"`, 'success');
    }

    setAdminBulkRawText('');
    setAdminBulkParsedItems([]);

    setTimeout(() => setAdminBulkSuccessMsg(''), 3500);
  };


  // Sync grid episode slots whenever count, season, or title changes
  const syncAdminGridSlots = (
    count: number,
    season: number,
    pattern: string,
    quality: string,
    audio: string,
    size: string,
    titleName?: string
  ) => {
    const seriesTitle = titleName || selectedTargetTitle?.title || 'Series';
    setAdminGridEpisodes((prev) => {
      const newSlots = [];
      for (let i = 1; i <= count; i++) {
        const existing = prev.find((p) => p.episodeNumber === i);
        newSlots.push({
          episodeNumber: i,
          title:
            existing?.title && existing.title.trim().length > 3
              ? existing.title
              : formatAdminGridEpTitle(i, pattern, season, seriesTitle, quality, audio),
          url: existing?.url || '',
          quality: existing?.quality || quality || '2160p 4K',
          audio: existing?.audio || audio || 'Hindi + English 5.1',
          size: existing?.size || size || '',
        });
      }
      return newSlots;
    });
  };

  // Initialize or open admin grid
  const handleOpenAdminGrid = (targetCount?: number, targetSeason?: number, titleName?: string) => {
    const count = targetCount || adminGridEpisodeCount || 8;
    const season = targetSeason || adminGridSeason || 1;
    setAdminGridEpisodeCount(count);
    setAdminGridSeason(season);
    syncAdminGridSlots(count, season, adminGridBasePattern, adminGridQuality, adminGridAudio, adminGridSize, titleName);
  };

  // Distribute links pasted into admin grid
  const handleDistributeAdminGridUrls = (text: string) => {
    setAdminGridBulkLinksText(text);
    const urls = text.match(/(https?:\/\/[^\s<>"']+)/gi) || [];
    if (urls.length > 0) {
      setAdminGridEpisodes((prev) =>
        prev.map((slot, index) => {
          if (urls[index]) {
            return { ...slot, url: urls[index] };
          }
          return slot;
        })
      );
    }
  };

  // Update a single episode slot in admin grid
  const handleUpdateAdminGridSlot = (
    epNum: number,
    field: 'title' | 'url' | 'quality' | 'audio' | 'size',
    value: string
  ) => {
    setAdminGridEpisodes((prev) =>
      prev.map((slot) => (slot.episodeNumber === epNum ? { ...slot, [field]: value } : slot))
    );
  };

  // Apply pattern to all titles in admin grid
  const handleApplyAdminPatternToAll = () => {
    const seriesTitle = selectedTargetTitle?.title || 'Series';
    setAdminGridEpisodes((prev) =>
      prev.map((slot) => ({
        ...slot,
        title: formatAdminGridEpTitle(
          slot.episodeNumber,
          adminGridBasePattern,
          adminGridSeason,
          seriesTitle,
          adminGridQuality,
          adminGridAudio
        ),
      }))
    );
  };

  // Save all admin grid episode containers
  const handleSaveAllAdminGridEpisodes = () => {
    if (!selectedTargetTitle) {
      alert('Please select a target title first.');
      return;
    }

    const valid = adminGridEpisodes.filter((e) => e.url.trim() && e.title.trim());
    if (valid.length === 0) {
      alert('Please fill in at least one episode container link before saving.');
      return;
    }

    const movieTitle = selectedTargetTitle.title || '';
    const posterPath = selectedTargetTitle.poster_path || null;
    const backdropPath = selectedTargetTitle.backdrop_path || null;
    const releaseDate = selectedTargetTitle.release_date || selectedTargetTitle.first_air_date || (selectedTargetTitle.year ? `${selectedTargetTitle.year}-01-01` : '');
    const voteAverage = selectedTargetTitle.vote_average;

    const metadata = {
      movieTitle,
      mediaType: 'tv' as const,
      posterPath,
      backdropPath,
      releaseDate,
      voteAverage,
    };

    const createdObjs: CustomLink[] = [];
    valid.forEach((ep, index) => {
      let finalUrl = ep.url.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = `https://${finalUrl}`;
      }

      const newLink: CustomLink = {
        id: `admin-grid-${Date.now()}-${ep.episodeNumber}-${index}`,
        title: ep.title.trim(),
        url: finalUrl,
        category: 'SingleEpisode',
        createdAt: new Date(Date.now() - index * 1000).toISOString(),
        seasonNumber: adminGridSeason,
        episodeNumber: ep.episodeNumber,
        quality: ep.quality.trim() || adminGridQuality || '2160p 4K',
        audioLanguage: ep.audio.trim() || adminGridAudio || 'Hindi + English 5.1',
        size: ep.size.trim() || adminGridSize || undefined,
        linkType: 'single_episode',
        movieTitle,
        mediaType: 'tv',
        posterPath,
        backdropPath,
        releaseDate,
        voteAverage,
      };

      createdObjs.push(newLink);
    });

    saveMultipleGlobalCustomLinks(selectedTargetTitle.id, createdObjs, metadata);

    setCustomLinksMap((prev) => {
      const key = String(selectedTargetTitle.id);
      const existing = prev[key] || [];
      const newUrls = new Set(createdObjs.map((l) => l.url.trim().toLowerCase()));
      const filtered = existing.filter((l) => !newUrls.has(l.url.trim().toLowerCase()));
      return {
        ...prev,
        [key]: [...createdObjs, ...filtered],
      };
    });

    const count = valid.length;
    setAdminGridSuccessMsg(`🎉 Successfully saved ${count} episode container${count > 1 ? 's' : ''} to Season ${adminGridSeason} for "${selectedTargetTitle.title}"!`);
    addLog(`Admin saved ${count} episode grid containers for "${selectedTargetTitle.title}" (Season ${adminGridSeason})`, 'success');

    setTimeout(() => {
      setAdminGridSuccessMsg('');
    }, 3500);
  };

  // Open Edit Link Modal
  const openEditModal = (movieId: number, link: CustomLink) => {
    const parsed = parseReleaseDetails(link.title, link.url, link.manualOverrides);
    setEditingLink({ movieId, link });
    setEditTitle(link.title);
    setEditUrl(link.url);
    setEditCategory(link.category);
    setEditSeason(link.manualOverrides?.seasonNumber || link.seasonNumber || 1);
    setEditEpisode(link.manualOverrides?.episodeNumber || link.episodeNumber || 1);
    setEditType(link.manualOverrides?.linkType || link.linkType || (link.category === 'ZipPack' ? 'zip_pack' : link.category === 'SingleEpisode' ? 'single_episode' : 'general'));
    setEditQuality(link.manualOverrides?.resolution || link.quality || parsed.resolution || '');
    setEditAudio(link.manualOverrides?.audioLanguage || link.audioLanguage || parsed.audioLabel || '');
    setEditSize(link.manualOverrides?.size || link.size || '');
    setEditContainer(link.manualOverrides?.container || (parsed.container && parsed.container !== 'UNKNOWN' ? parsed.container : '') || '');
    setEditDynamicRange(link.manualOverrides?.dynamicRange || (parsed.dynamicRange === 'conflict' ? 'Conflict' : (parsed.dynamicRangeLabel || '')) || '');
    setEditCodec(link.manualOverrides?.codec || parsed.codec || '');
    setEditResolution(link.manualOverrides?.resolution || parsed.resolution || '');
    setEditProvider(link.manualOverrides?.provider || parsed.provider || '');
  };

  // Save Edited Link
  const handleSaveEditLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLink || !editTitle.trim() || !editUrl.trim()) return;

    let url = editUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const manualOverrides: CustomLink['manualOverrides'] = {
      ...editingLink.link.manualOverrides,
      container: editContainer || undefined,
      linkType: editType,
      seasonNumber: editSeason,
      episodeNumber: editType === 'single_episode' ? editEpisode : undefined,
      resolution: editResolution || undefined,
      dynamicRange: editDynamicRange === 'None' ? undefined : (editDynamicRange || undefined),
      codec: editCodec || undefined,
      provider: editProvider || undefined,
      audioLanguage: editAudio.trim() || undefined,
      size: editSize.trim() || undefined,
    };

    const parsed = parseFullMediaTitle(editTitle.trim(), url);
    const parsedRel = parseReleaseDetails(editTitle.trim(), url, manualOverrides);
    const isPack = parsedRel.isPack || editCategory === 'ZipPack' || editType === 'zip_pack';
    const finalEditCategory = isPack ? 'ZipPack' : editCategory;
    const finalEditType = isPack ? 'zip_pack' : (editType === 'single_episode' || editCategory === 'SingleEpisode' ? 'single_episode' : 'general');

    const updatedLinkObj: CustomLink = {
      ...editingLink.link,
      title: editTitle.trim(),
      url,
      category: finalEditCategory,
      seasonNumber: editSeason,
      episodeNumber: isPack ? undefined : (finalEditCategory === 'SingleEpisode' || finalEditType === 'single_episode' ? editEpisode : undefined),
      linkType: finalEditType,
      quality: editQuality.trim() || parsed.quality || editingLink.link.quality,
      audioLanguage: editAudio.trim() || parsed.audioLanguage || editingLink.link.audioLanguage,
      size: editSize.trim() || parsed.size || editingLink.link.size,
      manualOverrides,
    };

    saveGlobalCustomLink(editingLink.movieId, updatedLinkObj);

    removeCustomLink(editingLink.movieId, editingLink.link.id);

    addCustomLink(editingLink.movieId, {
      title: editTitle.trim(),
      url,
      category: editCategory,
    });

    setCustomLinksMap((prev) => {
      const movieIdStr = String(editingLink.movieId);
      const existing = prev[movieIdStr] || [];
      const filtered = existing.filter((l) => l.id !== editingLink.link.id);
      const updatedList = [updatedLinkObj, ...filtered];
      return { ...prev, [movieIdStr]: updatedList };
    });

    addLog(`Admin updated link "${editTitle}" for ID ${editingLink.movieId}`, 'success');
    setEditingLink(null);
  };

  // Delete Link
  const handleDeleteLink = async (movieId: number, linkId: string, linkTitle: string) => {
    if (!confirm(`Delete link "${linkTitle}" permanently?`)) return;

    // 1. Instant optimistic state update
    setDeletedCuratedLinkIds((prev) => {
      const updated = new Set(prev);
      updated.add(linkId);
      return updated;
    });

    setCustomLinksMap((prev) => {
      const movieIdStr = String(movieId);
      const existing = prev[movieIdStr] || [];
      const updatedList = existing.filter((l) => l.id !== linkId);
      return { ...prev, [movieIdStr]: updatedList };
    });

    setSelectedLinkIds((prev) => {
      if (prev.has(linkId)) {
        const next = new Set(prev);
        next.delete(linkId);
        return next;
      }
      return prev;
    });

    removeCustomLink(movieId, linkId);
    addLog(`Admin deleted link "${linkTitle}"`, 'warn');

    // 2. Persist deletion to server & cloud database
    try {
      const res = await fetch(`/api/curated-links?movieId=${movieId}&linkId=${linkId}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn('Delete link error:', errData.error || res.statusText);
      }
    } catch (netErr) {
      console.warn('Network deletion error:', netErr);
    }
    await deleteGlobalCustomLink(movieId, linkId);
  };

  // Multi-Select Toggle for Single Link
  const toggleSelectLink = (linkId: string) => {
    setSelectedLinkIds((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) {
        next.delete(linkId);
      } else {
        next.add(linkId);
      }
      return next;
    });
  };

  // Multi-Select Toggle All Filtered Links
  const handleSelectAllFiltered = () => {
    if (filteredLinks.length === 0) return;
    const allSelected = filteredLinks.every((item) => selectedLinkIds.has(item.link.id));
    if (allSelected) {
      setSelectedLinkIds((prev) => {
        const next = new Set(prev);
        filteredLinks.forEach((item) => next.delete(item.link.id));
        return next;
      });
    } else {
      setSelectedLinkIds((prev) => {
        const next = new Set(prev);
        filteredLinks.forEach((item) => next.add(item.link.id));
        return next;
      });
    }
  };

  // Bulk Delete Selected Links
  const handleBulkDelete = async () => {
    if (selectedLinkIds.size === 0) return;
    const count = selectedLinkIds.size;
    if (!confirm(`Are you sure you want to permanently delete all ${count} selected link${count > 1 ? 's' : ''}?`)) return;

    const itemsToDelete = allFlattenedLinks.filter((item) => selectedLinkIds.has(item.link.id));
    const deleteIds = new Set(selectedLinkIds);

    // 1. Instant optimistic UI update
    setDeletedCuratedLinkIds((prev) => {
      const updated = new Set(prev);
      deleteIds.forEach((id) => updated.add(id));
      return updated;
    });

    setCustomLinksMap((prev) => {
      const updatedMap = { ...prev };
      itemsToDelete.forEach((item) => {
        const movieIdStr = String(item.movieId);
        if (updatedMap[movieIdStr]) {
          updatedMap[movieIdStr] = updatedMap[movieIdStr].filter((l) => !deleteIds.has(l.id));
        }
      });
      return updatedMap;
    });

    setSelectedLinkIds(new Set());
    itemsToDelete.forEach((item) => {
      removeCustomLink(item.movieId, item.link.id);
    });
    addLog(`Admin bulk deleted ${count} links permanently`, 'warn');

    // 2. Fast atomic batch deletion to cloud database
    await deleteMultipleGlobalCustomLinks(itemsToDelete.map((i) => ({ movieId: i.movieId, linkId: i.link.id })));
  };

  // Manual & Dynamic Refresh of Custom Links with pagination and search
  const refreshAdminLinks = async (
    page = linksCurrentPage,
    limit = linksPerPage,
    q = linkSearchQuery,
    category = linkCategoryFilter
  ) => {
    setIsRefreshingLinks(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (q && q.trim()) params.set('q', q.trim());
      if (category && category !== 'All') params.set('category', category);
      params.set('_t', String(Date.now()));

      const res = await fetch(`/api/curated-links?${params.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.total === 'number') {
          setTotalServerLinksCount(data.total);
        }
        if (data.allLinks && typeof data.allLinks === 'object') {
          const currentDeleted = getDeletedLinkIds();
          const cleanedMap: Record<string, CustomLink[]> = {};
          for (const [k, arr] of Object.entries(data.allLinks)) {
            if (Array.isArray(arr)) {
              const filtered = (arr as CustomLink[]).filter((l) => !currentDeleted.has(l.id));
              if (filtered.length > 0) {
                cleanedMap[k] = filtered;
              }
            }
          }
          setCustomLinksMap(cleanedMap);
          addLog(`Refreshed authoritative links from database (${(data.total || Object.keys(cleanedMap).length).toLocaleString()} total)`, 'success');
        }
      }
    } catch (e: any) {
      addLog(`Failed to refresh links: ${e.message}`, 'warn');
    } finally {
      setIsRefreshingLinks(false);
    }
  };

  // Re-fetch links whenever page, limit, search query, or category changes
  useEffect(() => {
    if (isMounted) {
      refreshAdminLinks(linksCurrentPage, linksPerPage, linkSearchQuery, linkCategoryFilter);
    }
  }, [linksCurrentPage, linksPerPage, linkSearchQuery, linkCategoryFilter, isMounted]);

  // Export Full JSON Backup
  const handleExportBackup = () => {
    if (typeof window === 'undefined') return;
    const backupData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      watchlist,
      customLists,
      customLinks: customLinksMap,
      knownTitles: knownTitlesCache,
      mdblistConfig,
      adminNotes: 'CiNEPHiLE Master Database Export',
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cinefuel-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('Exported full database backup JSON.', 'success');
  };

  // Import JSON Backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed.watchlist) safeSetLocalStorage('cinefuel_watchlist', JSON.stringify(parsed.watchlist));
        if (parsed.customLists) safeSetLocalStorage('cinefuel_custom_lists', JSON.stringify(parsed.customLists));
        if (parsed.customLinks) safeSetLocalStorage('cinefuel_custom_links', JSON.stringify(parsed.customLinks));
        if (parsed.knownTitles) safeSetLocalStorage('cinefuel_known_titles_cache', JSON.stringify(parsed.knownTitles));
        if (parsed.mdblistConfig) safeSetLocalStorage('cinefuel_mdblist_config', JSON.stringify(parsed.mdblistConfig));

        addLog('Database backup restored successfully! Reloading...', 'success');
        setTimeout(() => window.location.reload(), 1200);
      } catch (err: any) {
        alert('Invalid backup file format: ' + err.message);
        addLog('Failed to parse backup JSON: ' + err.message, 'warn');
      }
    };
    reader.readAsText(file);
  };

  // Memoized Title Lookup Map for O(1) Instant Title Resolution across 7,000+ links
  const titleLookupMap = useMemo(() => {
    const map = new Map<number, { title: string; poster_path?: string | null; media_type?: 'movie' | 'tv' }>();
    if (Array.isArray(PINNED_TITLES)) {
      PINNED_TITLES.forEach((p) => {
        if (p && p.id) {
          map.set(p.id, { title: p.title || `Title #${p.id}`, poster_path: p.poster_path, media_type: p.media_type || 'movie' });
        }
      });
    }
    if (typeof MOCK_TITLES === 'object' && MOCK_TITLES !== null) {
      Object.values(MOCK_TITLES).forEach((m) => {
        if (m && m.id) {
          map.set(m.id, {
            title: m.title || m.name || `Title #${m.id}`,
            poster_path: m.poster_path,
            media_type: ((m.media_type as any) || (m.name ? 'tv' : 'movie')) as 'movie' | 'tv',
          });
        }
      });
    }
    if (Array.isArray(watchlist)) {
      watchlist.forEach((w) => {
        if (w && w.id) {
          map.set(w.id, {
            title: w.title || `Title #${w.id}`,
            poster_path: w.poster_path,
            media_type: w.mediaType || 'movie',
          });
        }
      });
    }
    if (knownTitlesCache && typeof knownTitlesCache === 'object') {
      Object.entries(knownTitlesCache).forEach(([idStr, val]) => {
        const numId = Number(idStr);
        if (!isNaN(numId)) {
          if (typeof val === 'string') {
            map.set(numId, { title: val, media_type: 'movie' });
          } else if (val && typeof val === 'object') {
            map.set(numId, {
              title: (val as any).title || `Title #${numId}`,
              poster_path: (val as any).poster_path,
              media_type: (val as any).media_type || 'movie',
            });
          }
        }
      });
    }
    return map;
  }, [watchlist, knownTitlesCache]);

  const resolveTitleInfo = useCallback(
    (movieId: number) => {
      return titleLookupMap.get(movieId) || { title: `Title #${movieId}`, media_type: 'movie' as const };
    },
    [titleLookupMap]
  );

  // Flatten all custom links across all movie IDs for the moderation table (Memoized)
  const allFlattenedLinks = useMemo(() => {
    const list: Array<{ movieId: number; movieName: string; mediaType: 'movie' | 'tv'; link: CustomLink }> = [];
    const seenLinkIds = new Set<string>();
    const safeDelIds = deletedCuratedLinkIds instanceof Set ? deletedCuratedLinkIds : new Set<string>();

    // 1. Built-in Curated Links (Filtered by safeDelIds)
    if (typeof BUILTIN_CURATED_LINKS === 'object' && BUILTIN_CURATED_LINKS !== null) {
      Object.entries(BUILTIN_CURATED_LINKS).forEach(([movieIdStr, links]) => {
        const numId = Number(movieIdStr);
        const info = resolveTitleInfo(numId);
        if (Array.isArray(links)) {
          links.forEach((l) => {
            if (l && l.id && !safeDelIds.has(l.id) && !seenLinkIds.has(l.id)) {
              seenLinkIds.add(l.id);
              list.push({
                movieId: numId,
                movieName: info.title || `Title #${numId}`,
                mediaType: info.media_type || 'movie',
                link: l,
              });
            }
          });
        }
      });
    }

    // 2. Watchlist Links (Filtered by safeDelIds)
    if (Array.isArray(watchlist)) {
      watchlist.forEach((w) => {
        if (w && w.customLinks && Array.isArray(w.customLinks)) {
          w.customLinks.forEach((l) => {
            if (l && l.id && !safeDelIds.has(l.id) && !seenLinkIds.has(l.id)) {
              seenLinkIds.add(l.id);
              list.push({
                movieId: w.id,
                movieName: w.title || `Title #${w.id}`,
                mediaType: w.mediaType || 'movie',
                link: l,
              });
            }
          });
        }
      });
    }

    // 3. Dynamic Live Server/Cloud Custom Links
    if (customLinksMap && typeof customLinksMap === 'object') {
      Object.entries(customLinksMap).forEach(([movieIdStr, links]) => {
        if (Array.isArray(links)) {
          const numId = Number(movieIdStr);
          const info = resolveTitleInfo(numId);
          const isTv =
            info.media_type === 'tv' ||
            links.some(
              (l) =>
                l &&
                (l.seasonNumber !== undefined ||
                  l.episodeNumber !== undefined ||
                  l.linkType === 'single_episode' ||
                  l.linkType === 'zip_pack')
            );
          links.forEach((l: CustomLink) => {
            if (l && l.id && !safeDelIds.has(l.id) && !seenLinkIds.has(l.id)) {
              seenLinkIds.add(l.id);
              list.push({
                movieId: numId,
                movieName: info.title || `Title #${numId}`,
                mediaType: isTv ? 'tv' : 'movie',
                link: l,
              });
            }
          });
        }
      });
    }

    // Sort all links newest first by default
    list.sort((a, b) => {
      const timeA = a.link?.createdAt ? new Date(a.link.createdAt).getTime() : 0;
      const timeB = b.link?.createdAt ? new Date(b.link.createdAt).getTime() : 0;
      const validA = isNaN(timeA) ? 0 : timeA;
      const validB = isNaN(timeB) ? 0 : timeB;
      return validB - validA;
    });

    return list;
  }, [customLinksMap, deletedCuratedLinkIds, watchlist, resolveTitleInfo]);

  // Auto-resolve title names from TMDB for unknown IDs in customLinksMap (Throttled & Non-reentrant)
  useEffect(() => {
    const unknownIds = Object.keys(customLinksMap)
      .map(Number)
      .filter(
        (id) =>
          id > 0 &&
          !attemptedTitleFetchRef.current.has(id) &&
          (!knownTitlesCache[id] || knownTitlesCache[id].title.startsWith('Title #'))
      );
    if (unknownIds.length === 0) return;

    unknownIds.slice(0, 10).forEach(async (id) => {
      attemptedTitleFetchRef.current.add(id);
      try {
        const currentTmdbKey = getActiveTmdbKey();
        if (!currentTmdbKey) return;
        const res = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${currentTmdbKey}`);
        if (res.ok) {
          const d = await res.json();
          cacheTitle(id, {
            title: d.title || d.name || `Title #${id}`,
            poster_path: d.poster_path,
            media_type: 'movie',
            year: (d.release_date || '').split('-')[0],
          });
          return;
        }
        const tvRes = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${currentTmdbKey}`);
        if (tvRes.ok) {
          const d = await tvRes.json();
          cacheTitle(id, {
            title: d.name || `Title #${id}`,
            poster_path: d.poster_path,
            media_type: 'tv',
            year: (d.first_air_date || '').split('-')[0],
          });
        }
      } catch {}
    });
  }, [customLinksMap]);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setLinksCurrentPage(1);
  }, [linkSearchQuery, linkCategoryFilter]);

  // Memoized Filtered Links
  const filteredLinks = useMemo(() => {
    const q = linkSearchQuery.toLowerCase().trim();

    // 1. If Recent Uploads filter is active:
    if (linkCategoryFilter === 'Recent') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let recents = allFlattenedLinks.filter((item) => {
        if (!item || !item.link) return false;
        if (item.link.category === 'Recent') return true;
        if (!item.link.createdAt) return false;
        const t = new Date(item.link.createdAt).getTime();
        return !isNaN(t) && t >= sevenDaysAgo;
      });

      // If no links were uploaded in the last 7 days, fallback to the latest 100 uploaded links
      if (recents.length === 0) {
        recents = allFlattenedLinks
          .filter((item) => {
            if (!item || !item.link?.createdAt) return false;
            const t = new Date(item.link.createdAt).getTime();
            return !isNaN(t);
          })
          .slice(0, 100);
      }

      // Sort by upload time (newest first)
      recents = [...recents].sort((a, b) => {
        const timeA = a.link?.createdAt ? new Date(a.link.createdAt).getTime() : 0;
        const timeB = b.link?.createdAt ? new Date(b.link.createdAt).getTime() : 0;
        const validA = isNaN(timeA) ? 0 : timeA;
        const validB = isNaN(timeB) ? 0 : timeB;
        return validB - validA;
      });

      if (!q) return recents;
      return recents.filter((item) => {
        return (
          (item.link?.title || '').toLowerCase().includes(q) ||
          (item.link?.url || '').toLowerCase().includes(q) ||
          (item.movieName || '').toLowerCase().includes(q) ||
          String(item.movieId || '').includes(q)
        );
      });
    }

    // 2. Standard Category & Search Filter
    if (!q && linkCategoryFilter === 'All') {
      return allFlattenedLinks;
    }
    return allFlattenedLinks.filter((item) => {
      if (!item || !item.link) return false;
      const matchesCat = linkCategoryFilter === 'All' || item.link.category === linkCategoryFilter;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        (item.link.title || '').toLowerCase().includes(q) ||
        (item.link.url || '').toLowerCase().includes(q) ||
        (item.movieName || '').toLowerCase().includes(q) ||
        String(item.movieId || '').includes(q)
      );
    });
  }, [allFlattenedLinks, linkCategoryFilter, linkSearchQuery]);

  // Server-aware Pagination
  const effectiveTotalLinks = totalServerLinksCount > 0 ? totalServerLinksCount : allFlattenedLinks.length;
  const totalLinkPages = Math.max(1, Math.ceil(effectiveTotalLinks / linksPerPage));
  const paginatedLinks = filteredLinks;

  const isCurrentPageAllSelected =
    paginatedLinks.length > 0 && paginatedLinks.every((item) => selectedLinkIds.has(item.link.id));

  const handleSelectAllCurrentPage = () => {
    if (paginatedLinks.length === 0) return;
    setSelectedLinkIds((prev) => {
      const next = new Set(prev);
      if (isCurrentPageAllSelected) {
        paginatedLinks.forEach((item) => next.delete(item.link.id));
      } else {
        paginatedLinks.forEach((item) => next.add(item.link.id));
      }
      return next;
    });
  };

  // Displayed titles for Quick Title Jump on Overview tab (Real linked titles with search)
  const displayedQuickJumpTitles = useMemo(() => {
    let list: LinkedCatalogTitle[] = [];
    if (linkedCatalogTitles.length > 0) {
      list = linkedCatalogTitles;
    } else {
      list = PINNED_TITLES.map((p) => ({
        ...p,
        linksCount: (customLinksMap[String(p.id)] || []).length,
      }));
    }
    if (quickJumpSearch.trim()) {
      const q = quickJumpSearch.trim().toLowerCase();
      return list.filter(
        (t) => (t.title || '').toLowerCase().includes(q) || String(t.id).includes(q)
      ).slice(0, 16);
    }
    return list.slice(0, 16);
  }, [linkedCatalogTitles, quickJumpSearch, customLinksMap]);

  // Displayed titles for Manage Titles tab (combines live search or catalog)
  const displayedCatalogTitles = useMemo(() => {
    if (titleSearchQuery.trim() && manageTitlesResults.length > 0) {
      return manageTitlesResults;
    }
    const combined: PinnedTitle[] = [...PINNED_TITLES];
    Object.values(MOCK_TITLES).forEach((m) => {
      if (!combined.some((c) => c.id === m.id)) {
        combined.push({
          id: m.id,
          title: m.title || m.name || 'Untitled',
          media_type: ((m.media_type as any) || (m.name ? 'tv' : 'movie')) as 'movie' | 'tv',
          year: (m.release_date || m.first_air_date || '').split('-')[0],
          poster_path: m.poster_path,
        });
      }
    });
    return combined;
  }, [titleSearchQuery, manageTitlesResults]);

  // Filtered registered users for Manage Users directory tab
  const filteredRegisteredUsers = useMemo(() => {
    let list = Array.isArray(registeredUsers) ? registeredUsers : [];
    if (userFilterCategory === 'requesters') {
      list = list.filter((u) => (u.requestsCount || 0) > 0);
    } else if (userFilterCategory === 'reporters') {
      list = list.filter((u) => (u.reportsCount || 0) > 0);
    }

    const q = userSearchQuery.trim().toLowerCase();
    if (!q) return list;

    return list.filter((u) => {
      const matchName = (u.displayName || '').toLowerCase().includes(q);
      const matchEmail = (u.email || '').toLowerCase().includes(q);
      const matchUid = (u.uid || '').toLowerCase().includes(q);
      const matchRecent =
        Array.isArray(u.recentRequests) &&
        u.recentRequests.some((t) => String(t || '').toLowerCase().includes(q));
      return matchName || matchEmail || matchUid || matchRecent;
    });
  }, [registeredUsers, userFilterCategory, userSearchQuery]);

  // -------------------------------------------------------------
  // 1. Authenticated Guard
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return null;
  }

  // -------------------------------------------------------------
  // 2. Authenticated Admin Dashboard
  // -------------------------------------------------------------
  return (
    <div className="max-w-[1720px] mx-auto px-3 sm:px-6 py-6 min-h-screen relative text-slate-100">
      {/* Deep Obsidian Space Background & Atmospheric Cinematic Nebula Mesh */}
      <div className="fixed inset-0 bg-[#060813] -z-30 pointer-events-none" />
      {/* Procedural Starlight Dust Pattern */}
      <div
        className="fixed inset-0 opacity-20 pointer-events-none -z-20 bg-[radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:28px_28px]"
      />
      {/* Top-Left Volumetric Cyan/Electric Blue Nebula Bloom */}
      <div className="fixed -top-24 -left-12 w-[900px] h-[550px] bg-[radial-gradient(ellipse_at_top_left,_rgba(6,182,212,0.22),_rgba(37,99,235,0.12)_45%,_transparent_70%)] blur-3xl pointer-events-none -z-10" />
      {/* Top-Right Gotham Crimson Atmosphere Haze */}
      <div className="fixed top-10 right-0 w-[700px] h-[500px] bg-[radial-gradient(ellipse_at_top_right,_rgba(225,29,72,0.14),_rgba(159,18,57,0.06)_45%,_transparent_70%)] blur-3xl pointer-events-none -z-10" />
      {/* Bottom Center Indigo/Violet Deep Space Aura */}
      <div className="fixed bottom-0 left-1/4 w-[1000px] h-[450px] bg-[radial-gradient(ellipse_at_bottom,_rgba(99,102,241,0.12),_rgba(59,130,246,0.08)_50%,_transparent_70%)] blur-3xl pointer-events-none -z-10" />
      {/* Subtle Cinematic Vignette */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_50%,_rgba(6,8,19,0.75)_100%)] pointer-events-none -z-10" />
      {(() => {
        const navItems = [
          {
            id: 'overview' as const,
            label: 'Dashboard',
            shortLabel: 'Dashboard',
            icon: Home,
            badge: null,
            badgePulse: false,
            badgeColor: 'cyan' as const,
          },
          {
            id: 'links' as const,
            label: 'Links Management',
            shortLabel: 'Links',
            icon: Link2,
            badge: null,
            badgePulse: false,
            badgeColor: 'zinc' as const,
          },
          {
            id: 'requests' as const,
            label: 'User Requests',
            shortLabel: 'Requests',
            icon: FileText,
            badge: pendingRequestsCount > 0 ? pendingRequestsCount : (requestsList.length > 0 ? requestsList.length : 1),
            badgePulse: pendingRequestsCount > 0,
            badgeColor: 'cyan' as const,
          },
          {
            id: 'reports' as const,
            label: 'Defective Reports',
            shortLabel: 'Reports',
            icon: AlertTriangle,
            badge: pendingReportsCount > 0 ? pendingReportsCount : (reportsList.length > 0 ? reportsList.length : 1),
            badgePulse: pendingReportsCount > 0,
            badgeColor: 'cyan' as const,
          },
          {
            id: 'users' as const,
            label: 'Users Management',
            shortLabel: 'Users',
            icon: Users,
            badge: null,
            badgePulse: false,
            badgeColor: 'zinc' as const,
          },
          {
            id: 'apis' as const,
            label: 'API Integrations',
            shortLabel: 'APIs',
            icon: Code2,
            badge: null,
            badgePulse: false,
            badgeColor: 'cyan' as const,
          },
          {
            id: 'backup' as const,
            label: 'Backup & Vault',
            shortLabel: 'Backup',
            icon: Database,
            badge: null,
            badgePulse: false,
            badgeColor: 'cyan' as const,
          },
          {
            id: 'logs' as const,
            label: 'Diagnostics',
            shortLabel: 'Diagnostics',
            icon: Activity,
            badge: null,
            badgePulse: false,
            badgeColor: 'cyan' as const,
          },
        ];

        return (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Desktop Collapsible Sidebar */}
            <aside
              className={`hidden lg:flex flex-col shrink-0 sticky top-6 bg-[#080d1a]/95 backdrop-blur-2xl border border-cyan-500/40 rounded-[28px] p-4 shadow-[0_0_25px_rgba(6,182,212,0.25)] transition-all duration-300 ease-in-out z-30 ${
                isSidebarCollapsed ? 'w-20 items-center' : 'w-72'
              }`}
              style={{ maxHeight: 'calc(100vh - 3rem)' }}
            >
              {/* Sidebar Header */}
              <div
                className={`flex items-center pb-4 mb-3 border-b border-cyan-500/20 w-full ${
                  isSidebarCollapsed ? 'flex-col gap-2 justify-center' : 'justify-between'
                }`}
              >
                {!isSidebarCollapsed ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-400 flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.35)] shrink-0">
                      <Shield className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-black text-white tracking-wider uppercase truncate">
                        CiNEPHiLE
                      </h2>
                      <div className="text-[10px] text-cyan-400 font-extrabold tracking-wider uppercase">
                        ADMIN PANEL
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="w-9 h-9 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-400 flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.35)] shrink-0"
                    title="CiNEPHiLE Admin Panel"
                  >
                    <Shield className="w-5 h-5 text-cyan-400" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  className="p-1.5 rounded-xl bg-cyan-950/40 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-white transition-all cursor-pointer shadow-sm"
                  title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                  aria-label={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                >
                  {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
              </div>

              {/* Navigation Items List */}
              <nav className="flex-1 w-full space-y-1.5 overflow-y-auto no-scrollbar py-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  if (isSidebarCollapsed) {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        title={`${item.shortLabel}${item.badge !== null ? ` (${item.badge})` : ''}`}
                        className={`relative group w-12 h-12 mx-auto rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
                          isActive
                            ? 'bg-gradient-to-r from-blue-600 via-cyan-500 to-cyan-400 text-white font-black shadow-[0_0_20px_rgba(6,182,212,0.45)] border border-cyan-300/40'
                            : 'text-slate-400 hover:text-white hover:bg-cyan-500/10'
                        }`}
                        suppressHydrationWarning
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        {item.badge !== null && (
                          <span
                            className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center shadow-md bg-cyan-500 text-black shadow-cyan-500/50"
                          >
                            {typeof item.badge === 'number' && item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                        {/* Floating Tooltip */}
                        <span className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-xl bg-slate-900 border border-cyan-500/40 px-3 py-1.5 text-xs font-bold text-white shadow-2xl opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150">
                          {item.shortLabel}
                          {item.badge !== null && ` (${item.badge})`}
                        </span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full px-3.5 py-2.5 rounded-2xl flex items-center gap-3 transition-all duration-200 cursor-pointer text-left group ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600 via-cyan-500 to-cyan-400 text-white font-bold shadow-[0_0_20px_rgba(6,182,212,0.45)] border border-cyan-300/40'
                          : 'text-slate-300 hover:text-white hover:bg-cyan-500/10 font-medium'
                      }`}
                      suppressHydrationWarning
                    >
                      <div
                        className={`p-1.5 rounded-xl transition-all ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-800/60 text-slate-400 group-hover:text-cyan-300 group-hover:bg-cyan-500/15'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                      </div>
                      <span className="text-xs font-bold truncate flex-1 tracking-tight">
                        {item.label}
                      </span>
                      {item.badge !== null && (
                        <span
                          className={`w-5 h-5 rounded-full text-[11px] font-black flex items-center justify-center shrink-0 ${
                            isActive
                              ? 'bg-black/40 text-cyan-200'
                              : 'bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Sidebar Footer with Live Service Status */}
              {isSidebarCollapsed ? (
                <div className="pt-3 mt-2 border-t border-cyan-500/20 flex flex-col items-center gap-2 w-full">
                  <ServiceStatusPanel
                    getAuthHeaders={getAdminAuthHeaders}
                    isCollapsed={true}
                  />

                  <Link
                    href="/"
                    title="View Public Site"
                    className="w-10 h-10 rounded-xl bg-slate-900/80 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Logout"
                    className="w-10 h-10 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center transition-all cursor-pointer"
                    suppressHydrationWarning
                  >
                    <Lock className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="pt-3 mt-2 border-t border-cyan-500/20 space-y-2.5 w-full">
                  <ServiceStatusPanel
                    getAuthHeaders={getAdminAuthHeaders}
                    isCollapsed={false}
                  />

                  <div className="flex items-center gap-2">
                    <Link
                      href="/"
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/10 hover:border-cyan-500/30 text-slate-200 hover:text-white text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-cyan-400" /> Public Site
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:border-rose-400/50"
                      suppressHydrationWarning
                    >
                      <Lock className="w-3.5 h-3.5" /> Logout
                    </button>
                  </div>
                </div>
              )}
            </aside>

            {/* Main Content Workspace */}
            <main className="flex-1 min-w-0 w-full space-y-6">
              {/* Top Bar Header Banner with Dark Cinematic Silhouette */}
              <header className="bg-[#090d18]/85 backdrop-blur-2xl border border-cyan-500/30 hover:border-cyan-500/50 rounded-[28px] p-4 sm:p-6 lg:p-7 flex flex-col md:flex-row gap-4 sm:gap-5 items-start md:items-center justify-between shadow-2xl relative overflow-hidden transition-all duration-300">
                {/* 1. Ambient Lighting Bloom */}
                <div className="absolute -top-12 -right-12 w-96 h-96 bg-gradient-to-br from-cyan-500/20 via-blue-600/15 to-transparent rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 right-1/4 w-80 h-80 bg-rose-600/10 rounded-full blur-2xl pointer-events-none" />

                {/* 2. Cinematic Silhouette Graphic */}
                <AdminCinemaSilhouetteGraphic className="absolute right-0 top-0 bottom-0 w-80 sm:w-96 md:w-[420px] h-full opacity-85 pointer-events-none" />

                {/* Left Control Group */}
                <div className="relative z-10 flex items-center gap-3 sm:gap-4 min-w-0">
                  {/* Mobile Drawer Trigger (< lg) */}
                  <button
                    type="button"
                    onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
                    className="lg:hidden p-2 sm:p-2.5 rounded-xl bg-slate-900 border border-cyan-500/30 text-cyan-300 hover:text-white cursor-pointer shrink-0"
                    aria-label="Toggle Navigation Menu"
                  >
                    {isMobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>

                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-cyan-500/15 border-2 border-cyan-400/50 text-cyan-300 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.35)] shrink-0 font-black text-2xl">
                    <Shield className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                        👑 MASTER ADMIN
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" /> Full Access
                      </span>
                    </div>
                    <h1 className="text-lg sm:text-2xl lg:text-3xl font-black text-white tracking-tight truncate">
                      Welcome, Shyam
                    </h1>
                    <p className="text-xs text-slate-300/90 pt-0.5 sm:pt-1 leading-relaxed max-w-xl font-normal line-clamp-2 sm:line-clamp-none">
                      Manage your catalog, users, requests, and system integrations from a single control hub.
                    </p>
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div className="relative z-10 flex flex-wrap items-center gap-2 sm:gap-2.5 self-start sm:self-end md:self-center shrink-0">
                  <Link
                    href="/"
                    className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-cyan-500/30 hover:border-cyan-400/60 text-slate-200 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400" /> <span className="hidden sm:inline">View</span> Public Site
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer hover:border-rose-400/50"
                    suppressHydrationWarning
                  >
                    <Lock className="w-3.5 h-3.5 text-rose-400" /> Lock Panel
                  </button>
                </div>
              </header>

              {/* Mobile Quick Horizontal Bar (< lg) */}
              <div className="lg:hidden flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 pt-1 border-b border-cyan-500/20">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600 via-cyan-500 to-cyan-400 text-white shadow-md shadow-cyan-500/30'
                          : 'bg-slate-900/90 text-slate-400 hover:text-white hover:bg-slate-800 border border-white/5'
                      }`}
                      suppressHydrationWarning
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.shortLabel}</span>
                      {item.badge !== null && (
                        <span
                          className={`w-4 h-4 rounded-full text-[10px] font-black flex items-center justify-center ${
                            isActive
                              ? 'bg-black text-cyan-300'
                              : 'bg-cyan-500 text-black shadow-sm'
                          } ${item.badgePulse ? 'animate-pulse' : ''}`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Mobile Full Navigation Drawer (< lg) */}
              {isMobileNavOpen && (
                <div className="fixed inset-0 z-[70] lg:hidden flex flex-col bg-black/80 backdrop-blur-md animate-fade-in p-4">
                  <div className="bg-[#080d1a] border border-cyan-500/40 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-400 flex items-center justify-center text-sm shadow-[0_0_10px_rgba(6,182,212,0.35)]">
                          <Shield className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">CiNEPHiLE Navigation</h3>
                          <p className="text-[10px] text-cyan-400">Admin Control Center</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsMobileNavOpen(false)}
                        className="p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveTab(item.id);
                              setIsMobileNavOpen(false);
                            }}
                            className={`w-full px-4 py-3 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer ${
                              isActive
                                ? 'bg-gradient-to-r from-blue-600 via-cyan-500 to-cyan-400 text-white font-bold shadow-md shadow-cyan-500/25'
                                : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Icon className="w-4 h-4" />
                              <span className="text-xs font-bold">{item.label}</span>
                            </div>
                            {item.badge !== null && (
                              <span
                                className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${
                                  isActive ? 'bg-black text-cyan-300' : 'bg-cyan-500 text-black'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4">
                      <ServiceStatusPanel
                        getAuthHeaders={getAdminAuthHeaders}
                        isCollapsed={false}
                      />
                    </div>
                  </div>
                </div>
              )}

      {/* ========================================================= */}
      {/* TAB 1: OVERVIEW & METRICS */}
      {/* ========================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 6 Stat Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
            {/* 1. Total Tracked Titles */}
            <div className="p-3.5 sm:p-4.5 rounded-2xl sm:rounded-[22px] bg-[#090e1a]/90 backdrop-blur-xl border border-cyan-500/30 hover:border-cyan-400/60 shadow-[0_0_15px_rgba(6,182,212,0.1)] relative overflow-hidden transition-all duration-200 hover:scale-[1.02] flex flex-col justify-between min-w-0">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
                    <Film className="w-3.5 h-3.5" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('titles')}
                    className="text-[10px] font-bold text-cyan-400 hover:underline cursor-pointer"
                  >
                    Films →
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Total Tracked Titles
                </span>
                <p className="text-2xl sm:text-3xl font-black text-cyan-400 my-1 truncate" suppressHydrationWarning>
                  {isMounted ? (watchlist.length > 0 ? watchlist.length : 1) : 1}
                </p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">In local/cloud storage</span>
              {/* Bottom-right cyan wave */}
              <svg className="absolute -bottom-1 -right-1 w-24 h-12 pointer-events-none opacity-40" viewBox="0 0 100 50" fill="none">
                <path d="M0 35 C25 45, 50 10, 80 30 C90 38, 95 20, 100 15" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M10 42 C35 50, 60 20, 85 36 C95 44, 98 25, 100 22" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
              </svg>
            </div>

            {/* 2. Total Custom Links */}
            <div className="p-3.5 sm:p-4.5 rounded-2xl sm:rounded-[22px] bg-[#0d0a1c]/90 backdrop-blur-xl border border-purple-500/30 hover:border-purple-400/60 shadow-[0_0_15px_rgba(168,85,247,0.1)] relative overflow-hidden transition-all duration-200 hover:scale-[1.02] flex flex-col justify-between min-w-0">
              <div>
                <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center justify-center mb-2">
                  <Database className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Total Custom Links
                </span>
                <p className="text-2xl sm:text-3xl font-black text-purple-400 my-1 truncate">
                  {effectiveTotalLinks > 0 ? effectiveTotalLinks.toLocaleString() : '13,556'}
                </p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                {effectiveTotalLinks > 0 ? `${effectiveTotalLinks.toLocaleString()} in MongoDB Atlas` : 'Synced in cloud database'}
              </span>
              {/* Bottom-right purple wave */}
              <svg className="absolute -bottom-1 -right-1 w-24 h-12 pointer-events-none opacity-40" viewBox="0 0 100 50" fill="none">
                <path d="M0 35 C25 45, 50 10, 80 30 C90 38, 95 20, 100 15" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M10 42 C35 50, 60 20, 85 36 C95 44, 98 25, 100 22" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
              </svg>
            </div>

            {/* 3. User Requests */}
            <div
              onClick={() => setActiveTab('requests')}
              className="p-3.5 sm:p-4.5 rounded-2xl sm:rounded-[22px] bg-[#091417]/90 backdrop-blur-xl border border-teal-500/30 hover:border-teal-400/60 shadow-[0_0_15px_rgba(20,184,166,0.1)] relative overflow-hidden transition-all duration-200 hover:scale-[1.02] cursor-pointer flex flex-col justify-between group min-w-0"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/15 text-teal-400 border border-teal-500/30 flex items-center justify-center">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-bold text-teal-400 group-hover:underline">View →</span>
                </div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  User Requests
                </span>
                <p className="text-2xl sm:text-3xl font-black text-teal-400 my-1 truncate">
                  {pendingRequestsCount > 0 ? pendingRequestsCount : (requestsList.length > 0 ? requestsList.length : 1)}
                </p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                {requestsList.length > 0 ? requestsList.length : 1} total submitted
              </span>
              {/* Bottom-right teal wave */}
              <svg className="absolute -bottom-1 -right-1 w-24 h-12 pointer-events-none opacity-40" viewBox="0 0 100 50" fill="none">
                <path d="M0 35 C25 45, 50 10, 80 30 C90 38, 95 20, 100 15" stroke="#14b8a6" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M10 42 C35 50, 60 20, 85 36 C95 44, 98 25, 100 22" stroke="#14b8a6" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
              </svg>
            </div>

            {/* 4. Defective Links */}
            <div
              onClick={() => setActiveTab('reports')}
              className="p-3.5 sm:p-4.5 rounded-2xl sm:rounded-[22px] bg-[#170a10]/90 backdrop-blur-xl border border-rose-500/30 hover:border-rose-400/60 shadow-[0_0_15px_rgba(244,63,94,0.1)] relative overflow-hidden transition-all duration-200 hover:scale-[1.02] cursor-pointer flex flex-col justify-between group min-w-0"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-bold text-rose-400 group-hover:underline">Fix Now →</span>
                </div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Defective Links
                </span>
                <p className="text-2xl sm:text-3xl font-black text-rose-400 my-1 truncate">
                  {pendingReportsCount > 0 ? pendingReportsCount : (reportsList.length > 0 ? reportsList.length : 1)}
                </p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                {reportsList.length > 0 ? reportsList.length : 1} reported links
              </span>
              {/* Bottom-right rose wave */}
              <svg className="absolute -bottom-1 -right-1 w-24 h-12 pointer-events-none opacity-40" viewBox="0 0 100 50" fill="none">
                <path d="M0 35 C25 45, 50 10, 80 30 C90 38, 95 20, 100 15" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M10 42 C35 50, 60 20, 85 36 C95 44, 98 25, 100 22" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
              </svg>
            </div>

            {/* 5. User Accounts */}
            <div
              onClick={() => setActiveTab('users')}
              className="p-3.5 sm:p-4.5 rounded-2xl sm:rounded-[22px] bg-[#171209]/90 backdrop-blur-xl border border-amber-500/30 hover:border-amber-400/60 shadow-[0_0_15px_rgba(245,158,11,0.1)] relative overflow-hidden transition-all duration-200 hover:scale-[1.02] cursor-pointer flex flex-col justify-between group min-w-0"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-bold text-amber-400 group-hover:underline">Manage →</span>
                </div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  User Accounts
                </span>
                <p className="text-2xl sm:text-3xl font-black text-amber-400 my-1 truncate">
                  {registeredUsers.length > 0 ? registeredUsers.length : 4}
                </p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                {registeredUsers.filter((u) => (u.requestsCount || 0) > 0).length || 1} active requesters
              </span>
              {/* Bottom-right amber wave */}
              <svg className="absolute -bottom-1 -right-1 w-24 h-12 pointer-events-none opacity-40" viewBox="0 0 100 50" fill="none">
                <path d="M0 35 C25 45, 50 10, 80 30 C90 38, 95 20, 100 15" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M10 42 C35 50, 60 20, 85 36 C95 44, 98 25, 100 22" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
              </svg>
            </div>

            {/* 6. Active Admin */}
            <div className="p-3.5 sm:p-4.5 rounded-2xl sm:rounded-[22px] bg-[#100d1c]/90 backdrop-blur-xl border border-indigo-500/30 hover:border-indigo-400/60 shadow-[0_0_15px_rgba(99,102,241,0.1)] relative overflow-hidden transition-all duration-200 hover:scale-[1.02] flex flex-col justify-between min-w-0">
              <div>
                <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mb-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Active Admin
                </span>
                <p className="text-2xl sm:text-3xl font-black text-indigo-400 my-1 truncate">Shyam</p>
              </div>
              <span className="text-[11px] text-indigo-300/80 font-medium">Master Security Level</span>
              {/* Bottom-right indigo wave */}
              <svg className="absolute -bottom-1 -right-1 w-24 h-12 pointer-events-none opacity-40" viewBox="0 0 100 50" fill="none">
                <path d="M0 35 C25 45, 50 10, 80 30 C90 38, 95 20, 100 15" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M10 42 C35 50, 60 20, 85 36 C95 44, 98 25, 100 22" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
              </svg>
            </div>
          </div>

          {/* Quick Title Jump & Manage (Full Width, Service Status Shifted to Sidebar) */}
          <div className="w-full p-4 sm:p-6 rounded-2xl sm:rounded-[26px] bg-[#090d18]/90 backdrop-blur-xl border border-cyan-500/30 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-cyan-500/15 pb-3">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex flex-wrap items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-cyan-400 shrink-0" /> Quick Title Jump & Manage
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-mono font-bold">
                    {linkedTitlesTotal > 0 ? `${linkedTitlesTotal} Linked` : 'Catalog'}
                  </span>
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Quick filter titles..."
                    value={quickJumpSearch}
                    onChange={(e) => setQuickJumpSearch(e.target.value)}
                    className="w-36 sm:w-48 bg-zinc-900/90 border border-zinc-700/80 rounded-xl pl-7 pr-6 py-1.5 text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
                  />
                  <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
                  {quickJumpSearch && (
                    <button
                      type="button"
                      onClick={() => setQuickJumpSearch('')}
                      className="text-zinc-500 hover:text-white absolute right-2 top-1/2 -translate-y-1/2 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setActiveTab('titles')}
                  className="text-xs text-amber-400 font-bold hover:underline cursor-pointer shrink-0"
                >
                  View All Titles ({linkedTitlesTotal || 394}) →
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayedQuickJumpTitles.map((pt) => (
                <button
                  key={`${pt.media_type}-${pt.id}`}
                  type="button"
                  onClick={() => openTitleManager(pt, 'view')}
                  className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 hover:border-cyan-500/40 flex items-center gap-3 transition-all text-left group cursor-pointer hover:bg-slate-900/90"
                  title={`Click to manage links for ${pt.title}`}
                >
                  {/* Short Poster with Reliable Fallback */}
                  <div className="w-10 h-14 rounded-lg bg-slate-800 relative overflow-hidden shrink-0 border border-white/10 shadow-sm flex items-center justify-center">
                    <img
                      src={getImageURL(pt.poster_path, 'w200')}
                      alt={pt.title}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/placeholder-poster.svg';
                      }}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0 space-y-1">
                    <span className="text-xs font-bold text-white group-hover:text-cyan-300 truncate block">
                      {pt.title}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-black ${
                        pt.media_type === 'tv' ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {pt.media_type.toUpperCase()}
                      </span>
                      {pt.year && (
                        <span className="text-[10px] text-slate-400 font-mono">• {pt.year}</span>
                      )}
                      {typeof pt.linksCount === 'number' && pt.linksCount > 0 && (
                        <span className="text-[9px] font-bold text-emerald-400 px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 font-mono">
                          🔥 {pt.linksCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Status Bar */}
          <footer className="mt-6 p-4 rounded-2xl bg-[#080d19]/90 border border-cyan-500/30 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-400 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                <Shield className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white tracking-wide">
                  CiNEPHiLE Admin Panel
                </h4>
                <p className="text-[11px] text-slate-400">
                  Secure • Monitor • Manage • Grow
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-300">
              {/* Heartbeat ECG pulse wave */}
              <div className="flex items-center gap-2">
                <svg className="w-16 h-5 text-emerald-400" viewBox="0 0 100 24" fill="none">
                  <path
                    d="M0 12h25l4-8 6 16 5-11 4 5 3-2h53"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>System Online</span>
                </div>
              </div>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 font-mono text-[11px]" suppressHydrationWarning>
                {isMounted ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Oct 5, 2026 11:58 AM'}
              </span>
            </div>
          </footer>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: MANAGE LINKS (UNIVERSAL TITLE SEARCH + SINGLE / BULK IMPORTER) */}
      {/* ========================================================= */}
      {activeTab === 'links' && (
        <div className="space-y-6">
          {/* Add Custom Link Box with Universal Title Search & Mode Toggle */}
          <div className="p-6 sm:p-7 rounded-3xl bg-[#0f121a] border border-amber-500/30 space-y-5 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Plus className="w-4 h-4 text-amber-400" /> Add / Import Custom Links
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Select any title across TMDB, then add links one-by-one or use the Bulk Importer to auto-detect all episodes & zip packs.
                </p>
              </div>

              {/* Mode Toggle Pills (Single vs Bulk vs Episode Grid) */}
              <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-2xl border border-zinc-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setAddLinkMode('single')}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                    addLinkMode === 'single'
                      ? 'bg-amber-500 text-black shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" /> Single Link
                </button>
                <button
                  type="button"
                  onClick={() => setAddLinkMode('bulk')}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all ${
                    addLinkMode === 'bulk'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 fill-current" /> Bulk Auto-Detector
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddLinkMode('grid');
                    handleOpenAdminGrid();
                  }}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all ${
                    addLinkMode === 'grid'
                      ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Episode Grid ({adminGridEpisodeCount} EPs)
                </button>
              </div>
            </div>

            {/* Target Title Search & Picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300 block">
                  1. Search & Select Target Title <span className="text-amber-400 font-normal">(Search any movie, show, or TMDB ID)</span>:
                </label>
                {selectedTargetTitle && (
                  <span className="text-[10px] text-amber-400 font-mono font-bold">
                    Target: {selectedTargetTitle.title} ({selectedTargetTitle.id})
                  </span>
                )}
              </div>

              {/* Filter Pills for Movie vs TV */}
              <div className="flex flex-wrap items-center gap-1.5 pb-1 text-[11px]">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Filter:</span>
                {(['all', 'movie', 'tv'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setTargetMediaTypeFilter(filter)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-all ${
                      targetMediaTypeFilter === filter
                        ? 'bg-amber-500 text-black shadow-sm'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700/60'
                    }`}
                  >
                    {filter === 'all' ? 'All (Movies & TV)' : filter === 'movie' ? '🎬 Movies Only' : '📺 TV Series Only'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setManualTitleName(targetSearchQuery.trim());
                    setManualMediaType(targetMediaTypeFilter === 'tv' ? 'tv' : 'movie');
                    setManualYear(String(new Date().getFullYear()));
                    setIsManualTitleModalOpen(true);
                  }}
                  className="sm:ml-auto text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 underline pt-1 sm:pt-0"
                  title="Create a custom movie or TV series not in TMDB"
                >
                  <Plus className="w-3 h-3" /> Custom Title (Not on TMDB)
                </button>
              </div>

              <div className="relative" ref={searchDropdownRef}>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type title name (e.g. War, Loki, Inception) or enter TMDB ID (e.g. 585268)..."
                    value={targetSearchQuery}
                    onChange={(e) => {
                      setTargetSearchQuery(e.target.value);
                      setIsTargetDropdownOpen(true);
                    }}
                    onFocus={() => setIsTargetDropdownOpen(true)}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-2xl pl-10 pr-10 py-3 text-xs text-white placeholder-zinc-500 focus:outline-none shadow-inner"
                  />
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  {isSearchingTarget ? (
                    <RefreshCw className="w-4 h-4 text-amber-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
                  ) : targetSearchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetSearchQuery('');
                        setTargetSearchResults([]);
                      }}
                      className="text-zinc-400 hover:text-white absolute right-3.5 top-1/2 -translate-y-1/2 text-xs"
                    >
                      ✕
                    </button>
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  )}
                </div>

                {/* Auto-suggest Search Dropdown */}
                {isTargetDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-[#11141d] border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto">
                    {targetSearchResults.length > 0 ? (
                      <div>
                        <div className="divide-y divide-zinc-800">
                          {targetSearchResults.map((item) => {
                            const title = item.title || item.name || 'Untitled';
                            const type = (item.media_type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';
                            const year = (item.release_date || item.first_air_date || '').split('-')[0];
                            const poster = getImageURL(item.poster_path, 'w200');

                            return (
                              <button
                                key={`${type}-${item.id}`}
                                type="button"
                                onClick={() => handleSelectTargetTitle(item)}
                                className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/80 transition-colors text-left group"
                              >
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <div className="w-9 h-12 rounded bg-zinc-800 relative overflow-hidden shrink-0">
                                    <Image src={poster} alt={title} fill className="object-cover" sizes="36px" />
                                  </div>
                                  <div className="overflow-hidden">
                                    <span className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors block truncate">
                                      {title}
                                    </span>
                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
                                      <span className={`px-1.5 py-0.2 rounded font-black ${type === 'tv' ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'}`}>
                                        {type.toUpperCase()}
                                      </span>
                                      {year && <span>• {year}</span>}
                                      <span>• ID: {item.id}</span>
                                    </div>
                                  </div>
                                </div>

                                <span className="text-[11px] text-amber-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                                  Select ➔
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="p-2.5 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between text-[11px] px-3">
                          <span className="text-zinc-400">Can&apos;t find what you need on TMDB?</span>
                          <button
                            type="button"
                            onClick={() => {
                              setManualTitleName(targetSearchQuery.trim());
                              setManualMediaType(targetMediaTypeFilter === 'tv' ? 'tv' : 'movie');
                              setManualYear(String(new Date().getFullYear()));
                              setIsManualTitleModalOpen(true);
                            }}
                            className="text-amber-400 hover:text-amber-300 font-bold hover:underline"
                          >
                            + Create Custom Title
                          </button>
                        </div>
                      </div>
                    ) : targetSearchQuery.trim() ? (
                      <div className="p-5 text-center space-y-3">
                        <p className="text-xs text-zinc-400">
                          {isSearchingTarget ? 'Searching TMDB catalog...' : `No TMDB matches found for "${targetSearchQuery}".`}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setManualTitleName(targetSearchQuery.trim());
                            setManualMediaType(targetMediaTypeFilter === 'tv' ? 'tv' : 'movie');
                            setManualYear(String(new Date().getFullYear()));
                            setIsManualTitleModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-xs hover:scale-105 transition-all shadow-md"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Create &quot;{targetSearchQuery.trim()}&quot; as Custom Title</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-3">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block px-2 pb-2">
                          Popular / Quick Pinned Titles:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {PINNED_TITLES.map((pt) => (
                            <button
                              key={pt.id}
                              type="button"
                              onClick={() => handleSelectTargetTitle(pt)}
                              className="flex items-center gap-2 p-2 rounded-xl hover:bg-zinc-800 transition-colors text-left"
                            >
                              <div className="w-7 h-9 rounded bg-zinc-800 relative overflow-hidden shrink-0">
                                {pt.poster_path && (
                                  <Image src={getImageURL(pt.poster_path, 'w200')} alt={pt.title} fill className="object-cover" sizes="28px" />
                                )}
                              </div>
                              <div className="overflow-hidden">
                                <span className="text-xs font-bold text-white block truncate">{pt.title}</span>
                                <span className="text-[9px] text-zinc-400 font-mono">{pt.media_type.toUpperCase()} • {pt.year}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Suggestion Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-zinc-500 font-semibold">Quick pick:</span>
                {PINNED_TITLES.map((pt) => (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() => handleSelectTargetTitle(pt)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      selectedTargetTitle?.id === pt.id
                        ? 'bg-amber-500 text-black shadow-sm'
                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                  >
                    {pt.title} ({pt.id})
                  </button>
                ))}
              </div>
            </div>

            {/* VIEW A: SINGLE LINK FORM */}
            {addLinkMode === 'single' && (
              <form onSubmit={handleQuickAddLink} className="space-y-4 pt-3 border-t border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 block">
                    2. Enter Link Details for &quot;{selectedTargetTitle?.title || 'Selected Title'}&quot;:
                  </label>
                  <span className="text-[11px] text-amber-400 font-mono font-bold">
                    {selectedTargetTitle?.media_type === 'tv' ? '📺 TV Series Mode' : '🎬 Movie Mode'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="lg:col-span-2">
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
                      Link Title / Release Label <span className="text-amber-400 text-[10px]">(Auto-detects S01/S02, Episode, Zip, Quality & Audio)</span>
                    </label>
                    <input
                      type="text"
                      placeholder={selectedTargetTitle?.media_type === 'tv' ? "e.g. S01E01 2160p DSNP WEB-DL [Hindi + Eng] or S01 Complete.zip" : "e.g. 4K IMAX BluRay [Hindi + English Atmos], 1080p WEB-DL..."}
                      value={newLinkTitle}
                      onChange={(e) => handleNewLinkTitleChange(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Destination URL</label>
                    <input
                      type="text"
                      placeholder="https://..."
                      value={newLinkUrl}
                      onChange={(e) => handleNewLinkUrlChange(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Category / Release Type</label>
                    <select
                      value={newLinkCategory}
                      onChange={(e) => {
                        const val = e.target.value as CustomLink['category'];
                        setNewLinkCategory(val);
                        if (val === 'SingleEpisode') setNewLinkType('single_episode');
                        else if (val === 'ZipPack') setNewLinkType('zip_pack');
                        else setNewLinkType('general');
                      }}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-medium"
                    >
                      <option value="SingleEpisode">📥 Single Episode (TV Series)</option>
                      <option value="ZipPack">🗜️ Complete Season Zip / Batch Pack (TV)</option>
                      <option value="Streaming">🎬 Streaming & OTT Platform</option>
                      <option value="Download">📥 Movie / Direct Download</option>
                      <option value="Subtitles">🌐 Subtitles (SRT / Zip)</option>
                      <option value="Discussion">💬 Discussion & Community</option>
                      <option value="Review">📝 Review & Guides</option>
                      <option value="Official">🏛️ Official Website</option>
                      <option value="Recent">⚡ Recent Release</option>
                    </select>
                  </div>

                  {/* Season Selector for TV / Episode / ZipPack */}
                  {(newLinkCategory === 'SingleEpisode' || newLinkCategory === 'ZipPack' || selectedTargetTitle?.media_type === 'tv') && (
                    <div>
                      <label className="text-[11px] font-semibold text-amber-400 block mb-1">Season #</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={newLinkSeason}
                        onChange={(e) => setNewLinkSeason(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-zinc-900 border border-amber-500/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-bold"
                      />
                    </div>
                  )}

                  {/* Episode Selector when Single Episode is chosen */}
                  {newLinkCategory === 'SingleEpisode' && (
                    <div>
                      <label className="text-[11px] font-semibold text-sky-400 block mb-1">Episode #</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={newLinkEpisode}
                        onChange={(e) => setNewLinkEpisode(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-zinc-900 border border-sky-500/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400 font-bold"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Quality / Resolution</label>
                    <input
                      type="text"
                      placeholder="e.g. 2160p 4K, 1080p FHD"
                      value={newLinkQuality}
                      onChange={(e) => setNewLinkQuality(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Audio / Dub</label>
                    <input
                      type="text"
                      placeholder="e.g. Hindi + English, Dual Audio"
                      value={newLinkAudio}
                      onChange={(e) => setNewLinkAudio(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">File Size</label>
                    <input
                      type="text"
                      placeholder="e.g. 6.36 GB, 1.2 GB"
                      value={newLinkSize}
                      onChange={(e) => setNewLinkSize(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 hover:scale-105"
                  >
                    <Plus className="w-4 h-4" /> Attach Custom Link to {selectedTargetTitle?.title || 'Title'}
                  </button>
                </div>
              </form>
            )}

            {/* VIEW B: BULK MULTI-LINK AUTO-DETECTOR CONTAINER */}
            {addLinkMode === 'bulk' && (
              <div className="space-y-4 pt-3 border-t border-zinc-800/80">
                {/* Bulk Target Format Mode Selector (Movie vs TV) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-300">Bulk Target Format:</span>
                    <div className="inline-flex rounded-xl p-1 bg-zinc-900 border border-zinc-700/80 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAdminBulkMediaType('movie');
                          if (adminBulkRawText.trim()) {
                            const parsed = parseBulkLinksInput(adminBulkRawText, 1, 'movie', adminBulkMovieCategory);
                            setAdminBulkParsedItems(parsed);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          adminBulkMediaType === 'movie'
                            ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        <Film className="w-3.5 h-3.5" /> Movie Releases Mode
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdminBulkMediaType('tv');
                          if (adminBulkRawText.trim()) {
                            const parsed = parseBulkLinksInput(adminBulkRawText, 1, 'tv', 'SingleEpisode');
                            setAdminBulkParsedItems(parsed);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          adminBulkMediaType === 'tv'
                            ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        <Tv className="w-3.5 h-3.5" /> TV Episodes & Packs
                      </button>
                    </div>
                  </div>

                  {adminBulkMediaType === 'movie' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-zinc-400">Default Category:</span>
                      <select
                        value={adminBulkMovieCategory}
                        onChange={(e) => {
                          const cat = e.target.value as CustomLink['category'];
                          setAdminBulkMovieCategory(cat);
                          handleSetAllBulkCategory(cat);
                        }}
                        className="bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                      >
                        <option value="Streaming">🎬 Streaming & OTT</option>
                        <option value="Download">📥 Direct Download</option>
                        <option value="Subtitles">🌐 Subtitles</option>
                        <option value="Recent">⚡ Recent Release</option>
                        <option value="Official">🏛️ Official Website</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-300 block flex items-center justify-between">
                    <span>
                      {adminBulkMediaType === 'movie'
                        ? `2. Paste Multiple Movie Links / Releases for "${selectedTargetTitle?.title}":`
                        : `2. Paste Multiple Episode & Zip Pack Links for "${selectedTargetTitle?.title}":`}
                    </span>
                    <span className="text-[10px] text-amber-400 font-mono">
                      {adminBulkMediaType === 'movie'
                        ? 'Auto-detects 4K UHD, 1080p, 720p, HDR, Dubs, and Sizes'
                        : 'Auto-detects S01/S02, Zip Packs vs Single EPs, Qualities, and Dubs'}
                    </span>
                  </label>
                  <textarea
                    rows={6}
                    placeholder={
                      adminBulkMediaType === 'movie'
                        ? `Paste multiple movie release lines or download URLs at once! Examples:\n${selectedTargetTitle?.title} 2160p UHD BluRay HEVC TrueHD Atmos 7.1 [Hindi DDP 5.1 + English] [24.5 GB] - https://hubcloud.cx/drive/movie4k\n${selectedTargetTitle?.title} 1080p FHD BluRay x264 [Hindi + English 5.1] [10.2 GB] - https://gdflix.dev/file/movie1080\n${selectedTargetTitle?.title} 720p HD WEB-DL [Hindi Dubbed] [2.1 GB] - https://mnmcloud.fun/files/movie720`
                        : `Paste multiple release lines or download URLs at once! Examples:\n${selectedTargetTitle?.title} S01E01 2160p WEB-DL Hindi DDP 5.1 [6.36 GB] - https://hubcloud.foo/video/1...\n${selectedTargetTitle?.title} S01E02 2160p WEB-DL Hindi DDP 5.1 [6.28 GB] - https://hubcloud.foo/video/2...\n${selectedTargetTitle?.title} S01 Complete 2160p UHD BluRay DV HDR [Hindi DDP 5.1 + English Atmos].zip https://mega.nz/file/3...`
                    }
                    value={adminBulkRawText}
                    onChange={(e) => setAdminBulkRawText(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-2xl p-3.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-amber-500 leading-relaxed shadow-inner"
                    autoFocus
                  />
                </div>

                {/* Real-time Parsed Results Preview */}
                {adminBulkParsedItems.length > 0 && (
                  <div className="space-y-3 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-black text-white">
                          {adminBulkParsedItems.length} {adminBulkMediaType === 'movie' ? 'Movie Releases' : 'Links'} Auto-Detected:
                        </span>
                        {adminBulkMediaType === 'movie' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-bold text-[10px]">
                            🎬 {adminBulkParsedItems.length} Movie Releases
                          </span>
                        ) : (
                          <>
                            <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 font-bold text-[10px]">
                              📥 {adminBulkParsedItems.filter((i) => i.linkType === 'single_episode').length} Episodes
                            </span>
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-bold text-[10px]">
                              🗜️ {adminBulkParsedItems.filter((i) => i.linkType === 'zip_pack').length} Zip Packs
                            </span>
                          </>
                        )}
                      </div>

                      {/* Quick Bulk Convert Controls */}
                      <div className="flex items-center gap-2">
                        {adminBulkMediaType === 'movie' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSetAllBulkCategory('Streaming')}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px] font-bold transition-colors"
                              title="Set all movie items to Streaming"
                            >
                              🎬 Set All Streaming
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetAllBulkCategory('Download')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-bold transition-colors"
                              title="Set all movie items to Download"
                            >
                              📥 Set All Download
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetAllBulkCategory('Subtitles')}
                              className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 text-[10px] font-bold transition-colors"
                              title="Set all movie items to Subtitles"
                            >
                              🌐 Set All Subtitles
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSetAllBulkType('single_episode')}
                              className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 text-[10px] font-bold transition-colors"
                              title="Convert all items to Single Episodes"
                            >
                              📥 Set All as Episodes
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetAllBulkType('zip_pack')}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px] font-bold transition-colors"
                              title="Convert all items to Zip Packs"
                            >
                              🗜️ Set All as Zip Packs
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={handleAdminImportBulk}
                          className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs transition-all shadow-lg hover:scale-105 flex items-center gap-1.5 ml-2"
                        >
                          <ListPlus className="w-4 h-4" />
                          <span>🚀 Import All ({adminBulkParsedItems.length}) {adminBulkMediaType === 'movie' ? 'Movie' : ''} Links to {selectedTargetTitle?.title}</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                      {adminBulkParsedItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="overflow-hidden space-y-1">
                            <div className="flex items-center gap-1.5">
                              {adminBulkMediaType === 'movie' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextCat: CustomLink['category'] =
                                      item.category === 'Streaming' ? 'Download' : item.category === 'Download' ? 'Subtitles' : 'Streaming';
                                    setAdminBulkParsedItems((prev) =>
                                      prev.map((i) => (i.id === item.id ? { ...i, category: nextCat } : i))
                                    );
                                  }}
                                  className="px-2 py-0.5 rounded font-black text-[9px] font-mono transition-all hover:scale-105 bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  title="Click to toggle category (Streaming / Download / Subtitles)"
                                >
                                  {item.category === 'Download' ? '📥 DOWNLOAD' : item.category === 'Subtitles' ? '🌐 SUBTITLES' : '🎬 STREAMING'}
                                </button>
                              ) : (
                                <>
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-black text-[9px] font-mono">
                                    S0{item.seasonNumber}
                                  </span>

                                  {/* Clickable Badge to Toggle between Single Episode and Zip Pack */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleBulkItemType(item.id)}
                                    className={`px-2 py-0.5 rounded font-black text-[9px] font-mono transition-all hover:scale-105 ${
                                      item.linkType === 'zip_pack'
                                        ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40'
                                        : 'bg-sky-500/30 text-sky-200 border border-sky-500/40'
                                    }`}
                                    title="Click to toggle between Episode and Zip Pack"
                                  >
                                    {item.linkType === 'zip_pack'
                                      ? '🗜️ ZIP PACK (Click to switch)'
                                      : `📥 EP ${item.episodeNumber ? (item.episodeNumber < 10 ? '0' + item.episodeNumber : item.episodeNumber) : '?'} (Click to switch)`}
                                  </button>
                                </>
                              )}
                            </div>
                            <p className="font-bold text-white truncate text-[11px]">{item.title}</p>
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                              <span className="font-semibold text-amber-400/90">{item.quality}</span>
                              {item.audioLanguage && <span>• {item.audioLanguage}</span>}
                              {item.size && <span className="text-zinc-500 font-mono">• {item.size}</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAdminBulkParsedItems((prev) => prev.filter((i) => i.id !== item.id))}
                            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Remove"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {adminBulkSuccessMsg && (
                  <p className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 animate-fadeIn">
                    <CheckCircle2 className="w-4 h-4" /> {adminBulkSuccessMsg}
                  </p>
                )}
              </div>
            )}

            {/* VIEW C: DYNAMIC EPISODE GRID CONTAINER (N TITLE & N LINK CONTAINERS) */}
            {addLinkMode === 'grid' && (
              <div className="space-y-4 pt-3 border-t border-zinc-800/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold text-zinc-300 block">
                    2. Dynamic Episode Containers for &quot;{selectedTargetTitle?.title}&quot;:
                  </label>
                  <span className="text-[11px] text-sky-400 font-mono font-bold">
                    {adminGridEpisodes.length} Title Containers & {adminGridEpisodes.length} Link Containers Open
                  </span>
                </div>

                {/* Season & Episode Count Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-zinc-900/90 p-4 rounded-2xl border border-zinc-800/80">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 block mb-1">Target Season:</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={adminGridSeason}
                      onChange={(e) => {
                        const s = Math.max(1, parseInt(e.target.value) || 1);
                        setAdminGridSeason(s);
                        syncAdminGridSlots(adminGridEpisodeCount, s, adminGridBasePattern, adminGridQuality, adminGridAudio, adminGridSize);
                      }}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                      Episode Count <span className="text-sky-400">({adminGridEpisodeCount} Containers)</span>:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={adminGridEpisodeCount}
                        onChange={(e) => {
                          const c = Math.max(1, parseInt(e.target.value) || 1);
                          setAdminGridEpisodeCount(c);
                          syncAdminGridSlots(c, adminGridSeason, adminGridBasePattern, adminGridQuality, adminGridAudio, adminGridSize);
                        }}
                        className="w-20 bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-sky-500"
                      />
                      <div className="flex flex-wrap items-center gap-1">
                        {[6, 8, 10, 12, 16, 24].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => {
                              setAdminGridEpisodeCount(n);
                              syncAdminGridSlots(n, adminGridSeason, adminGridBasePattern, adminGridQuality, adminGridAudio, adminGridSize);
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                              adminGridEpisodeCount === n
                                ? 'bg-sky-500 text-black shadow-md'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 block mb-1">Default Quality:</label>
                    <input
                      type="text"
                      value={adminGridQuality}
                      onChange={(e) => setAdminGridQuality(e.target.value)}
                      placeholder="e.g. 2160p 4K, 1080p WEB-DL"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 block mb-1">Default Audio:</label>
                    <input
                      type="text"
                      value={adminGridAudio}
                      onChange={(e) => setAdminGridAudio(e.target.value)}
                      placeholder="e.g. Hindi + English 5.1"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Base Pattern Template & URL Distributor */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-zinc-300 block">
                        Title Pattern Template <span className="text-zinc-500 font-normal">(Tokens: {'{title}'}, {'{season}'}, {'{ep}'}, {'{quality}'}, {'{audio}'})</span>:
                      </label>
                      <button
                        type="button"
                        onClick={handleApplyAdminPatternToAll}
                        className="text-[10px] text-sky-400 hover:text-sky-300 font-bold bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/30 transition-colors"
                      >
                        ⚡ Apply Pattern to All {adminGridEpisodes.length} Titles
                      </button>
                    </div>
                    <input
                      type="text"
                      value={adminGridBasePattern}
                      onChange={(e) => setAdminGridBasePattern(e.target.value)}
                      placeholder="{title} S{season}E{ep} {quality} [{audio}]"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-zinc-300 block">
                        Paste Multiple URLs to Auto-Distribute into Containers:
                      </label>
                      <span className="text-[10px] text-zinc-500">1 URL per line</span>
                    </div>
                    <textarea
                      rows={2}
                      value={adminGridBulkLinksText}
                      onChange={(e) => handleDistributeAdminGridUrls(e.target.value)}
                      placeholder="Paste up to 8+ links here (one per line) — auto-fills into Link containers below!"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono resize-none shadow-inner"
                    />
                  </div>
                </div>

                {/* The N Title and N Link Containers Grid */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                      Episode Containers ({adminGridEpisodes.length} Episodes):
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      Filled: {adminGridEpisodes.filter((e) => e.url.trim()).length} / {adminGridEpisodes.length} Links
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                    {adminGridEpisodes.map((ep) => (
                      <div
                        key={ep.episodeNumber}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          ep.url.trim()
                            ? 'bg-zinc-900/90 border-sky-500/40 shadow-sm'
                            : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                          {/* Badge */}
                          <div className="md:col-span-2 flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-xl bg-sky-500/20 text-sky-300 font-black text-xs font-mono border border-sky-500/30 whitespace-nowrap">
                              EP {ep.episodeNumber < 10 ? `0${ep.episodeNumber}` : ep.episodeNumber}
                            </span>
                            <span className="text-[11px] font-bold text-zinc-400 hidden sm:inline">
                              S{adminGridSeason < 10 ? `0${adminGridSeason}` : adminGridSeason}
                            </span>
                          </div>

                          {/* Title Container */}
                          <div className="md:col-span-5">
                            <label className="text-[10px] text-zinc-400 block mb-0.5 font-bold uppercase tracking-wider">
                              Title Container #{ep.episodeNumber}
                            </label>
                            <input
                              type="text"
                              value={ep.title}
                              onChange={(e) => handleUpdateAdminGridSlot(ep.episodeNumber, 'title', e.target.value)}
                              placeholder={`Episode ${ep.episodeNumber} Title`}
                              className="w-full bg-zinc-900/80 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500"
                            />
                          </div>

                          {/* Link Container */}
                          <div className="md:col-span-5">
                            <label className="text-[10px] text-zinc-400 block mb-0.5 font-bold uppercase tracking-wider">
                              Link Container #{ep.episodeNumber}
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={ep.url}
                                onChange={(e) => handleUpdateAdminGridSlot(ep.episodeNumber, 'url', e.target.value)}
                                placeholder={`https://... / Drive link for Ep ${ep.episodeNumber}`}
                                className={`w-full bg-zinc-900/80 border rounded-xl px-3 py-2 text-xs font-mono placeholder-zinc-500 focus:outline-none ${
                                  ep.url.trim()
                                    ? 'border-emerald-500/50 text-emerald-300'
                                    : 'border-zinc-700 text-white focus:border-sky-500'
                                }`}
                              />
                              {ep.url.trim() && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateAdminGridSlot(ep.episodeNumber, 'url', '')}
                                  className="text-zinc-500 hover:text-rose-400 px-1 text-xs"
                                  title="Clear URL"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Success Message */}
                {adminGridSuccessMsg && (
                  <p className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 animate-fadeIn">
                    <CheckCircle2 className="w-4 h-4" /> {adminGridSuccessMsg}
                  </p>
                )}

                {/* Footer Save Button */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                  <span className="text-xs text-zinc-400">
                    Saving will attach episode links to <strong className="text-white">{selectedTargetTitle?.title}</strong> under <strong className="text-white">Season {adminGridSeason}</strong>.
                  </span>

                  <button
                    type="button"
                    onClick={handleSaveAllAdminGridEpisodes}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-black text-xs transition-all shadow-lg hover:scale-105 flex items-center gap-2"
                  >
                    <ListPlus className="w-4 h-4" />
                    <span>🚀 Save All ({adminGridEpisodes.filter((e) => e.url.trim()).length} of {adminGridEpisodes.length}) Episode Containers</span>
                  </button>
                </div>
              </div>
            )}

            {addLinkSuccess && (
              <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1 pt-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Link published to &quot;{selectedTargetTitle?.title}&quot; catalog and title page successfully!
              </p>
            )}
          </div>

          {/* Quick Title Jump on Links Tab */}
          <div className="p-5 sm:p-6 rounded-3xl bg-[#090d18]/90 backdrop-blur-xl border border-cyan-500/30 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-cyan-500/15 pb-3">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-cyan-400" /> Manage Links by Title
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-mono font-bold">
                    {linkedTitlesTotal > 0 ? `${linkedTitlesTotal} Linked` : 'Catalog'}
                  </span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Click any title to view all links, batch-replace URLs, or delete dead links in 1 click.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Quick title filter..."
                    value={quickJumpSearch}
                    onChange={(e) => setQuickJumpSearch(e.target.value)}
                    className="w-36 sm:w-48 bg-zinc-900/90 border border-zinc-700/80 rounded-xl pl-7 pr-6 py-1.5 text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
                  />
                  <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
                  {quickJumpSearch && (
                    <button
                      type="button"
                      onClick={() => setQuickJumpSearch('')}
                      className="text-zinc-500 hover:text-white absolute right-2 top-1/2 -translate-y-1/2 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayedQuickJumpTitles.map((pt) => (
                <button
                  key={`links-tab-${pt.media_type}-${pt.id}`}
                  type="button"
                  onClick={() => openTitleManager(pt, 'view')}
                  className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 hover:border-cyan-500/40 flex items-center gap-3 transition-all text-left group cursor-pointer hover:bg-slate-900/90"
                  title={`Click to manage links for ${pt.title}`}
                >
                  <div className="w-10 h-14 rounded-lg bg-slate-800 relative overflow-hidden shrink-0 border border-white/10 shadow-sm flex items-center justify-center">
                    <img
                      src={getImageURL(pt.poster_path, 'w200')}
                      alt={pt.title}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/placeholder-poster.svg';
                      }}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0 space-y-1">
                    <span className="text-xs font-bold text-white group-hover:text-cyan-300 truncate block">
                      {pt.title}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-black ${
                        pt.media_type === 'tv' ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {pt.media_type.toUpperCase()}
                      </span>
                      {pt.year && (
                        <span className="text-[10px] text-slate-400 font-mono">• {pt.year}</span>
                      )}
                      {typeof pt.linksCount === 'number' && pt.linksCount > 0 && (
                        <span className="text-[9px] font-bold text-emerald-400 px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 font-mono">
                          🔥 {pt.linksCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Links Moderation Table (Collapsible Space Saver) */}
          <div className="p-5 sm:p-6 rounded-3xl bg-[#0f121a] border border-zinc-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>{linkCategoryFilter === 'Recent' ? 'Recent Uploads' : 'All Saved Custom Links'}</span>
                  <span>({effectiveTotalLinks.toLocaleString()})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => refreshAdminLinks()}
                  disabled={isRefreshingLinks}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[11px] font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  title="Reload custom links from cloud database"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshingLinks ? 'animate-spin text-amber-400' : 'text-zinc-400'}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsRawLinksTableOpen(!isRawLinksTableOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 hover:text-white transition-all cursor-pointer shadow-sm"
                  title={isRawLinksTableOpen ? 'Collapse table to clear space' : 'Expand full raw links table'}
                >
                  <span>{isRawLinksTableOpen ? 'Hide Raw Table' : 'Show Raw Table'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isRawLinksTableOpen ? 'rotate-180 text-amber-400' : ''}`} />
                </button>
              </div>
            </div>

            {!isRawLinksTableOpen ? (
              <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-400">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span>
                    Raw URL table hidden to clear workspace space. All <strong className="text-white font-mono">{effectiveTotalLinks.toLocaleString()}</strong> URLs are active in database. Manage and replace links per-title above.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRawLinksTableOpen(true)}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer shrink-0"
                >
                  Expand Full Table ({effectiveTotalLinks.toLocaleString()} Rows) →
                </button>
              </div>
            ) : (
              <>
                {/* Search & Filter Row */}
                <div className="flex items-center justify-end gap-2 flex-wrap pt-1 border-t border-zinc-800/80">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search links, titles..."
                      value={linkSearchQuery}
                      onChange={(e) => {
                        setLinkSearchQuery(e.target.value);
                        setLinksCurrentPage(1);
                      }}
                      className="bg-zinc-900 border border-zinc-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 w-44"
                    />
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>

                  <select
                    value={linkCategoryFilter}
                    onChange={(e) => {
                      setLinkCategoryFilter(e.target.value);
                      setLinksCurrentPage(1);
                    }}
                    className="bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-semibold"
                  >
                    <option value="All">All Categories</option>
                    <option value="Recent">⚡ Recent Uploads</option>
                    <option value="Streaming">Streaming</option>
                    <option value="Download">Download</option>
                    <option value="ZipPack">ZipPack</option>
                    <option value="SingleEpisode">SingleEpisode</option>
                    <option value="Subtitles">Subtitles</option>
                    <option value="Discussion">Discussion</option>
                    <option value="Review">Review</option>
                    <option value="Official">Official</option>
                  </select>

                  <select
                    value={linksPerPage}
                    onChange={(e) => {
                      setLinksPerPage(Number(e.target.value));
                      setLinksCurrentPage(1);
                    }}
                    className="bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-semibold"
                    title="Rows per page"
                  >
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                    <option value={200}>200 / page</option>
                  </select>
                </div>

            {/* Bulk Action Controls */}
            {selectedLinkIds.size > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 animate-fadeIn shadow-lg">
                <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                  <span>
                    {selectedLinkIds.size} of {filteredLinks.length} link{selectedLinkIds.size !== 1 ? 's' : ''} selected
                  </span>
                  {selectedLinkIds.size < filteredLinks.length && (
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="ml-2 text-[11px] underline text-amber-400 hover:text-amber-300 font-normal"
                    >
                      (Select all {filteredLinks.length.toLocaleString()} matching)
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedLinkIds(new Set())}
                    className="px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold transition-colors"
                  >
                    Clear Selection
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-xs transition-all shadow-md shadow-rose-600/30 active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedLinkIds.size})</span>
                  </button>
                </div>
              </div>
            )}

            {/* Top Pagination Bar */}
            {filteredLinks.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 py-2 px-1 text-xs text-zinc-400 border-b border-zinc-800/60">
                <div className="text-zinc-400 text-xs">
                  Showing <span className="font-semibold text-white">{effectiveTotalLinks === 0 ? 0 : (linksCurrentPage - 1) * linksPerPage + 1}</span>-
                  <span className="font-semibold text-white">{Math.min(linksCurrentPage * linksPerPage, effectiveTotalLinks)}</span> of{' '}
                  <span className="font-bold text-amber-400">{effectiveTotalLinks.toLocaleString()}</span> links
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setLinksCurrentPage(1)}
                    disabled={linksCurrentPage <= 1}
                    className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-white text-[11px] font-mono transition-all"
                    title="First page"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinksCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={linksCurrentPage <= 1}
                    className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-white text-xs font-semibold transition-all"
                  >
                    ‹ Prev
                  </button>
                  <span className="px-2.5 py-1 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs font-mono text-zinc-300">
                    <span className="text-amber-400 font-bold">{linksCurrentPage}</span> / {totalLinkPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLinksCurrentPage((p) => Math.min(totalLinkPages, p + 1))}
                    disabled={linksCurrentPage >= totalLinkPages}
                    className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-white text-xs font-semibold transition-all"
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinksCurrentPage(totalLinkPages)}
                    disabled={linksCurrentPage >= totalLinkPages}
                    className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-white text-[11px] font-mono transition-all"
                    title="Last page"
                  >
                    »
                  </button>
                </div>
              </div>
            )}

            {filteredLinks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isCurrentPageAllSelected}
                          onChange={handleSelectAllCurrentPage}
                          className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-400 cursor-pointer accent-amber-500"
                          title="Select / Deselect all links on current page"
                        />
                      </th>
                      <th className="py-3 px-3">Target Title</th>
                      <th className="py-3 px-3">Link Name / Release</th>
                      <th className="py-3 px-3">Uploaded</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3">URL</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {paginatedLinks.map((item) => {
                      const isSelected = selectedLinkIds.has(item.link.id);
                      return (
                        <tr
                          key={item.link.id}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-amber-500/15 hover:bg-amber-500/20'
                              : 'hover:bg-zinc-900/40'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectLink(item.link.id)}
                              className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-400 cursor-pointer accent-amber-500"
                            />
                          </td>
                          <td className="py-3 px-3 font-semibold text-white">
                            <Link
                              href={`/${item.mediaType || 'movie'}/${item.movieId}`}
                              target="_blank"
                              className="hover:text-amber-400 transition-colors flex items-center gap-1.5"
                            >
                              <span>{item.movieName}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">({item.movieId})</span>
                            </Link>
                          </td>
                          <td className="py-3 px-3 font-bold text-amber-300">
                            <div>{item.link.title}</div>
                            {(() => {
                              const parsed = parseReleaseDetails(item.link.title, item.link.url, item.link.manualOverrides);
                              const cont = item.link.manualOverrides?.container || (parsed.container !== 'UNKNOWN' ? parsed.containerLabel : '');
                              const dyn = item.link.manualOverrides?.dynamicRange || (parsed.dynamicRange === 'conflict' ? 'Conflict' : (parsed.dynamicRangeLabel || ''));
                              const res = item.link.manualOverrides?.resolution || parsed.resolution;
                              const cod = item.link.manualOverrides?.codec || parsed.codec;
                              const pk = parsed.isPack ? 'Pack' : (parsed.episodeNumber ? `E${String(parsed.episodeNumber).padStart(2, '0')}` : '');
                              const aud = item.link.manualOverrides?.audioLanguage || item.link.audioLanguage || parsed.audioLabel;

                              return (
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  {cont && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                                      {cont}
                                    </span>
                                  )}
                                  {pk && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-700/50">
                                      {pk}
                                    </span>
                                  )}
                                  {res && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-300 border border-blue-700/50">
                                      {res}
                                    </span>
                                  )}
                                  {dyn && (
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                      dyn === 'DV HDR' ? 'bg-purple-950 text-purple-300 border-purple-700/50' :
                                      dyn === 'HDR' ? 'bg-fuchsia-950 text-fuchsia-300 border-fuchsia-700/50' :
                                      dyn === 'Conflict' ? 'bg-rose-950 text-rose-300 border-rose-700/50' :
                                      'bg-slate-900 text-slate-300 border-slate-700/50'
                                    }`}>
                                      {dyn}
                                    </span>
                                  )}
                                  {cod && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                                      {cod}
                                    </span>
                                  )}
                                  {aud && (
                                    <span className="text-[10px] text-zinc-400 font-normal ml-0.5">
                                      • {aud}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-3 text-[11px] text-zinc-400 whitespace-nowrap font-mono">
                            <span
                              className="flex items-center gap-1.5"
                              title={formatDateTimeSafe(item.link.createdAt)}
                            >
                              <Clock className="w-3 h-3 text-amber-400/80 shrink-0" />
                              <span>{formatRelativeTime(item.link.createdAt)}</span>
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-bold border border-amber-500/20 text-[10px]">
                              {item.link.category}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-zinc-400 max-w-xs truncate">
                            {item.link.url}
                          </td>
                          <td className="py-3 px-3 text-right space-x-1.5">
                            <a
                              href={item.link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                              title="Test URL"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={() => openEditModal(item.movieId, item.link)}
                              className="inline-flex p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                              title="Edit Link"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteLink(item.movieId, item.link.id, item.link.title)}
                              className="inline-flex p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                              title="Delete link"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-xs">
                No custom links match your search or filter.
              </div>
            )}

            {/* Bottom Pagination Bar */}
            {filteredLinks.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-zinc-800 text-xs text-zinc-400">
                <div>
                  Showing <span className="font-semibold text-white">{effectiveTotalLinks === 0 ? 0 : (linksCurrentPage - 1) * linksPerPage + 1}</span>-
                  <span className="font-semibold text-white">{Math.min(linksCurrentPage * linksPerPage, effectiveTotalLinks)}</span> of{' '}
                  <span className="font-bold text-amber-400">{effectiveTotalLinks.toLocaleString()}</span> links
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLinksCurrentPage(1)}
                    disabled={linksCurrentPage <= 1}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-white text-[11px] font-mono transition-all"
                  >
                    « First
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinksCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={linksCurrentPage <= 1}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-white text-xs font-semibold transition-all"
                  >
                    ‹ Prev
                  </button>
                  <span className="px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-300">
                    Page <strong className="text-amber-400">{linksCurrentPage}</strong> of <strong className="text-zinc-200">{totalLinkPages}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setLinksCurrentPage((p) => Math.min(totalLinkPages, p + 1))}
                    disabled={linksCurrentPage >= totalLinkPages}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-white text-xs font-semibold transition-all"
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinksCurrentPage(totalLinkPages)}
                    disabled={linksCurrentPage >= totalLinkPages}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-white text-[11px] font-mono transition-all"
                  >
                    Last »
                  </button>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: MANAGE TITLES & LINKED DATABASE HUB */}
      {/* ========================================================= */}
      {activeTab === 'titles' && (
        <div className="space-y-6">
          {/* Header & Mode Switcher */}
          <div className="p-6 sm:p-7 rounded-3xl bg-[#0f121a] border border-zinc-800 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Film className="w-5 h-5 text-amber-400" /> Linked Titles Hub & Media Manager
                </h3>
                <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                  Browse all <strong className="text-amber-400">{linkedTitlesTotal > 0 ? linkedTitlesTotal : '394+'}</strong> movies & TV series currently linked in your database. Click any title to inspect active links, delete links, or batch-replace the entire link set in 1 click.
                </p>
              </div>

              {/* View Mode Toggle & Refresh */}
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-2xl p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setTitlesViewMode('linked')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      titlesViewMode === 'linked'
                        ? 'bg-amber-500 text-black shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Linked in Database ({linkedTitlesTotal || 394})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTitlesViewMode('tmdb')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      titlesViewMode === 'tmdb'
                        ? 'bg-sky-500 text-black shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>TMDB Universal Search</span>
                  </button>
                </div>

                {titlesViewMode === 'linked' && (
                  <button
                    type="button"
                    onClick={() => fetchLinkedCatalogTitles(linkedTitlesPage, linkedTitlesFilter, linkedTitlesSearch, 48)}
                    disabled={isLoadingLinkedTitles}
                    className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                    title="Refresh linked titles list"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingLinkedTitles ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            </div>

            {/* MODE 1: LINKED DATABASE TITLES */}
            {titlesViewMode === 'linked' && (
              <div className="space-y-5">
                {/* Search Bar + Search Button + Filters */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 flex-wrap">
                  {/* Search Input with Explicit Search Button */}
                  <form onSubmit={handleSearchTitlesSubmit} className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-xl">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Search linked movies, series, or TMDB ID..."
                        value={linkedTitlesSearch}
                        onChange={(e) => setLinkedTitlesSearch(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-8 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                      />
                      <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      {linkedTitlesSearch && (
                        <button
                          type="button"
                          onClick={handleClearTitlesSearch}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
                          title="Clear search"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isLoadingLinkedTitles}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Search</span>
                    </button>
                  </form>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setLinkedTitlesFilter('all');
                        setLinkedTitlesPage(1);
                        fetchLinkedCatalogTitles(1, 'all', linkedTitlesSearch, 48);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        linkedTitlesFilter === 'all'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                      }`}
                    >
                      All ({linkedTitlesTotal || 394})
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLinkedTitlesFilter('movie');
                        setLinkedTitlesPage(1);
                        fetchLinkedCatalogTitles(1, 'movie', linkedTitlesSearch, 48);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        linkedTitlesFilter === 'movie'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                      }`}
                    >
                      🎬 Movies
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLinkedTitlesFilter('tv');
                        setLinkedTitlesPage(1);
                        fetchLinkedCatalogTitles(1, 'tv', linkedTitlesSearch, 48);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        linkedTitlesFilter === 'tv'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                      }`}
                    >
                      📺 TV Series
                    </button>
                  </div>
                </div>

                {/* Loading State */}
                {isLoadingLinkedTitles && (
                  <div className="py-12 flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                    <p className="text-xs text-zinc-400 font-mono">Loading linked titles from database...</p>
                  </div>
                )}

                {/* Empty State */}
                {!isLoadingLinkedTitles && linkedCatalogTitles.length === 0 && (
                  <div className="py-16 text-center space-y-3 bg-zinc-900/40 rounded-3xl border border-zinc-800">
                    <Film className="w-10 h-10 text-zinc-600 mx-auto" />
                    <h4 className="text-sm font-bold text-white">No Linked Titles Found</h4>
                    <p className="text-xs text-zinc-400 max-w-md mx-auto">
                      {linkedTitlesSearch
                        ? `No titles match "${linkedTitlesSearch}". Try a different title name or ID.`
                        : 'No custom links found for this filter.'}
                    </p>
                    {linkedTitlesSearch && (
                      <button
                        type="button"
                        onClick={handleClearTitlesSearch}
                        className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 hover:text-white text-xs font-bold"
                      >
                        Clear Search Filter
                      </button>
                    )}
                  </div>
                )}

                {/* Titles Grid with Short Posters & Quick Actions */}
                {!isLoadingLinkedTitles && linkedCatalogTitles.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {linkedCatalogTitles.map((t) => {
                      const poster = getImageURL(t.poster_path, 'w200');
                      const titleText = t.title || t.name || `Title #${t.id}`;
                      const mediaType = t.media_type || 'movie';
                      const yearText = t.year;

                      return (
                        <div
                          key={`${mediaType}-${t.id}`}
                          className="flex gap-3.5 p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/50 transition-all group shadow-md"
                        >
                          {/* Short Poster with Fallback */}
                          <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700/60 shadow-md relative group-hover:scale-102 transition-transform">
                            <img
                              src={poster}
                              alt={titleText}
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = '/placeholder-poster.svg';
                              }}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div className={`absolute top-1 left-1 px-1.5 py-0.2 rounded text-[9px] font-black font-mono shadow ${
                              mediaType === 'tv' ? 'bg-sky-500 text-black' : 'bg-amber-400 text-black'
                            }`}>
                              {mediaType.toUpperCase()}
                            </div>
                          </div>

                          {/* Info & Action Buttons */}
                          <div className="flex-1 overflow-hidden flex flex-col justify-between">
                            <div className="space-y-1">
                              <h4
                                className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors truncate"
                                title={titleText}
                              >
                                {titleText}
                              </h4>

                              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
                                {yearText && <span>{yearText} •</span>}
                                <span>ID: {t.id}</span>
                              </div>

                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20 inline-flex items-center gap-1 font-mono">
                                🔥 {t.linksCount} Link{t.linksCount !== 1 ? 's' : ''}
                              </span>
                            </div>

                            {/* Action Buttons Row */}
                            <div className="pt-2 border-t border-zinc-800/80 flex items-center gap-1.5 flex-wrap">
                              {/* 1. Manage Links Button */}
                              <button
                                type="button"
                                onClick={() => openTitleManager(t, 'view')}
                                className="flex-1 py-1.5 px-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                title="Inspect & manage all links for this title"
                              >
                                <Layers className="w-3 h-3" />
                                <span>Manage</span>
                              </button>

                              {/* 2. Change Whole Links Button */}
                              <button
                                type="button"
                                onClick={() => openTitleManager(t, 'replace')}
                                className="flex-1 py-1.5 px-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-bold text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                title="Change or replace the whole link set for this title"
                              >
                                <RefreshCw className="w-3 h-3 text-cyan-400" />
                                <span>Change Links</span>
                              </button>

                              {/* 3. Fix / Edit Title Details */}
                              <button
                                type="button"
                                onClick={() => openTitleManager(t, 'edit_title')}
                                className="p-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 hover:text-purple-200 transition-colors cursor-pointer"
                                title="Fix / Edit title name, year, ID, or poster without TMDB search"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              {/* 4. View Page Link */}
                              <Link
                                href={`/${mediaType}/${t.id}`}
                                target="_blank"
                                className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
                                title="View Page on CineFuel"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Link>

                              {/* 4. Delete All Links for Title */}
                              <button
                                type="button"
                                onClick={() => handleDeleteAllTitleLinks(t)}
                                className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors cursor-pointer"
                                title="Delete all links for this title"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination Controls */}
                {!isLoadingLinkedTitles && linkedCatalogTitles.length > 0 && linkedTitlesTotalPages > 1 && (
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                    <span className="text-xs text-zinc-400 font-mono">
                      Showing Page <strong className="text-white">{linkedTitlesPage}</strong> of{' '}
                      <strong className="text-white">{linkedTitlesTotalPages}</strong> ({linkedTitlesTotal} titles total)
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={linkedTitlesPage <= 1}
                        onClick={() => {
                          const p = Math.max(1, linkedTitlesPage - 1);
                          setLinkedTitlesPage(p);
                          fetchLinkedCatalogTitles(p, linkedTitlesFilter, linkedTitlesSearch, 48);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition-all disabled:opacity-40 cursor-pointer"
                      >
                        ← Previous
                      </button>

                      <button
                        type="button"
                        disabled={linkedTitlesPage >= linkedTitlesTotalPages}
                        onClick={() => {
                          const p = linkedTitlesPage + 1;
                          setLinkedTitlesPage(p);
                          fetchLinkedCatalogTitles(p, linkedTitlesFilter, linkedTitlesSearch, 48);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition-all disabled:opacity-40 cursor-pointer"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MODE 2: TMDB UNIVERSAL SEARCH */}
            {titlesViewMode === 'tmdb' && (
              <div className="space-y-5">
                <div className="relative w-full">
                  <input
                    type="text"
                    placeholder="Search TMDB catalog across any movie or show (e.g. Daredevil, Loki, Avatar)..."
                    value={titleSearchQuery}
                    onChange={(e) => setTitleSearchQuery(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-9 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  {isSearchingManageTitles && (
                    <RefreshCw className="w-4 h-4 text-amber-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedCatalogTitles.map((t) => {
                    const poster = getImageURL(t.poster_path, 'w200');
                    const linksCount = (customLinksMap[String(t.id)] || []).length + (BUILTIN_CURATED_LINKS[t.id] || []).length;
                    const titleText = t.title || (t as any).name || 'Title';
                    const mediaType = t.media_type || ((t as any).name ? 'tv' : 'movie');
                    const yearText = (t as any).year || ((t as any).release_date || (t as any).first_air_date || '').split('-')[0];

                    return (
                      <div key={`${mediaType}-${t.id}`} className="flex gap-3.5 p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-amber-500/50 transition-all group shadow-md">
                        <div className="w-16 h-24 rounded-xl overflow-hidden bg-zinc-800 shrink-0 relative border border-white/10">
                          <img
                            src={poster}
                            alt={titleText}
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = '/placeholder-poster.svg';
                            }}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 overflow-hidden space-y-1.5 flex flex-col justify-between">
                          <div>
                            <h4 className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors truncate">
                              {titleText}
                            </h4>
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
                              <span className={`px-1.5 py-0.2 rounded font-black ${mediaType === 'tv' ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'}`}>
                                {mediaType.toUpperCase()}
                              </span>
                              {yearText && <span>• {yearText}</span>}
                              <span>• ID: {t.id}</span>
                            </div>

                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20 inline-block mt-1">
                              {linksCount} Custom Link{linksCount !== 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/80">
                            <Link
                              href={`/${mediaType}/${t.id}`}
                              target="_blank"
                              className="text-[10px] text-zinc-300 hover:text-white flex items-center gap-1 font-semibold"
                            >
                              <Eye className="w-3 h-3" /> View Page
                            </Link>
                            <button
                              onClick={() => {
                                handleSelectTargetTitle({
                                  id: t.id,
                                  title: titleText,
                                  media_type: mediaType,
                                  poster_path: t.poster_path,
                                  release_date: (t as any).release_date,
                                  first_air_date: (t as any).first_air_date,
                                });
                                setActiveTab('links');
                              }}
                              className="text-[10px] text-amber-400 hover:underline font-bold cursor-pointer"
                            >
                              + Add Custom Link
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB: USER REQUESTS & FULFILLMENT */}
      {/* ========================================================= */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="p-6 rounded-3xl bg-[#0f121a] border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Inbox className="w-4 h-4 text-amber-400" /> User Link Requests & Fulfillment Vault
              </h3>
              <p className="text-xs text-zinc-400">
                Review titles requested by visitors, add custom qualities/languages, and fulfill downloads in 1-click.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAdminRequests}
                disabled={isLoadingRequests}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-amber-500/50 text-amber-400 hover:text-amber-300 text-xs font-bold transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRequests ? 'animate-spin' : ''}`} />
                <span>Refresh Requests</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => setRequestsFilter('all')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                requestsFilter === 'all'
                  ? 'bg-blue-600/10 border-blue-500 text-white shadow-md'
                  : 'bg-[#11141c] border-white/5 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">Total Requests</span>
              <p className="text-2xl font-black text-white">{requestsList.length}</p>
            </button>

            <button
              onClick={() => setRequestsFilter('pending')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                requestsFilter === 'pending'
                  ? 'bg-amber-500/15 border-amber-500 text-white shadow-md shadow-amber-500/10'
                  : 'bg-[#11141c] border-white/5 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Pending</span>
                {pendingRequestsCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                )}
              </div>
              <p className="text-2xl font-black text-amber-400">{pendingRequestsCount}</p>
            </button>

            <button
              onClick={() => setRequestsFilter('fulfilled')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                requestsFilter === 'fulfilled'
                  ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md shadow-emerald-500/10'
                  : 'bg-[#11141c] border-white/5 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">Fulfilled</span>
              <p className="text-2xl font-black text-emerald-400">
                {requestsList.filter((r) => r.status === 'fulfilled').length}
              </p>
            </button>

            <button
              onClick={() => setRequestsFilter('rejected')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                requestsFilter === 'rejected'
                  ? 'bg-rose-500/15 border-rose-500 text-white shadow-md shadow-rose-500/10'
                  : 'bg-[#11141c] border-white/5 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block mb-1">Rejected</span>
              <p className="text-2xl font-black text-rose-400">
                {requestsList.filter((r) => r.status === 'rejected').length}
              </p>
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-4 rounded-2xl bg-[#0f121a] border border-zinc-800 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search by title, quality, audio, contact, or notes..."
                value={requestsSearchQuery}
                onChange={(e) => setRequestsSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-9 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
              {requestsSearchQuery && (
                <button
                  onClick={() => setRequestsSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto no-scrollbar">
              {(['all', 'pending', 'fulfilled', 'rejected'] as const).map((filterKey) => (
                <button
                  key={filterKey}
                  onClick={() => setRequestsFilter(filterKey)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all shrink-0 ${
                    requestsFilter === filterKey
                      ? 'bg-amber-500 text-black shadow-md'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  {filterKey}
                </button>
              ))}
            </div>
          </div>

          {/* Requests Cards List */}
          {(() => {
            const filteredRequests = (Array.isArray(requestsList) ? requestsList : []).filter((r) => {
              if (requestsFilter !== 'all' && r.status !== requestsFilter) return false;
              if (!requestsSearchQuery.trim()) return true;
              const q = requestsSearchQuery.toLowerCase();
              return (
                (r.title || '').toLowerCase().includes(q) ||
                (r.userContact && r.userContact.toLowerCase().includes(q)) ||
                (r.notes && r.notes.toLowerCase().includes(q)) ||
                (r.quality && r.quality.toLowerCase().includes(q)) ||
                (r.audioLanguage && r.audioLanguage.toLowerCase().includes(q))
              );
            });

            if (filteredRequests.length === 0) {
              return (
                <div className="p-12 rounded-3xl bg-[#0f121a] border border-zinc-800 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-600">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-zinc-300">No requests found</h4>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    {requestsSearchQuery
                      ? 'No user requests match your current search query.'
                      : requestsFilter === 'pending'
                      ? 'All caught up! No pending requests to fulfill.'
                      : 'No requests submitted under this filter.'}
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {filteredRequests.map((req) => {
                  const posterUrl = req.posterPath ? getImageURL(req.posterPath, 'w200') : null;
                  const dateStr = formatDateTimeSafe(req.createdAt);

                  return (
                    <div
                      key={req.id}
                      className="p-5 rounded-3xl bg-[#0f121a] border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg group"
                    >
                      {/* Left: Thumbnail & Details */}
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        {posterUrl ? (
                          <div className="relative w-14 h-20 rounded-xl overflow-hidden shrink-0 border border-zinc-700 bg-zinc-900 shadow-md">
                            <Image
                              src={posterUrl}
                              alt={req.title}
                              fill
                              sizes="56px"
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-14 h-20 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 text-zinc-600">
                            {req.mediaType === 'tv' ? <Tv className="w-6 h-6" /> : <Film className="w-6 h-6" />}
                          </div>
                        )}

                        <div className="space-y-1.5 flex-1 min-w-0">
                          {/* Title & Badges */}
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm sm:text-base font-bold text-white truncate">
                              {req.title}
                            </h4>
                            {req.releaseYear && (
                              <span className="text-xs text-zinc-400 font-mono">({req.releaseYear})</span>
                            )}
                            <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                              {req.mediaType === 'tv' ? <Tv className="w-2.5 h-2.5 text-sky-400" /> : <Film className="w-2.5 h-2.5 text-amber-400" />}
                              {req.mediaType === 'tv' ? 'TV' : 'Movie'}
                            </span>

                            {/* Status Badge */}
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                req.status === 'pending'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                  : req.status === 'in_progress'
                                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                                  : req.status === 'fulfilled'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              }`}
                            >
                              {req.status === 'in_progress' ? 'In Progress' : req.status}
                            </span>
                          </div>

                          {/* Requested Quality & Audio Pills */}
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="px-2.5 py-0.5 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-300 font-semibold text-[11px] flex items-center gap-1">
                              <Zap className="w-3 h-3 text-blue-400" />
                              <span>{req.quality || 'Any Quality'}</span>
                            </span>

                            <span className="px-2.5 py-0.5 rounded-lg bg-purple-600/15 border border-purple-500/30 text-purple-300 font-semibold text-[11px] flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-purple-400" />
                              <span>{req.audioLanguage || 'Any Audio'}</span>
                            </span>

                            {req.mediaType === 'tv' && (req.seasonNumber || req.episodeNumber) && (
                              <span className="px-2 py-0.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] font-mono">
                                {req.seasonNumber ? `S${req.seasonNumber}` : ''}
                                {req.episodeNumber ? `E${req.episodeNumber}` : ' (Pack)'}
                              </span>
                            )}
                          </div>

                          {/* User notes & contact */}
                          {(req.notes || req.userContact) && (
                            <div className="pt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                              {req.notes && (
                                <p className="italic text-zinc-300 bg-zinc-900/60 px-2.5 py-1 rounded-lg border border-zinc-800 text-[11px]">
                                  &ldquo;{req.notes}&rdquo;
                                </p>
                              )}
                              {(req.userName || req.userEmail || req.userContact) && (
                                <button
                                  onClick={() => {
                                    setActiveTab('users');
                                    setUserSearchQuery(req.userEmail || req.userName || req.userContact || '');
                                  }}
                                  className="text-[11px] text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-0.5 rounded-lg border border-blue-500/20 transition-colors text-left"
                                  title="Jump to this user in Manage Users directory"
                                >
                                  <UserCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                  <span>
                                    {req.userName ? `${req.userName} • ` : ''}
                                    {req.userEmail || req.userContact}
                                  </span>
                                  <span className="text-[10px] text-zinc-500 underline ml-1 hidden sm:inline">View Account →</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Fulfilled Link URL preview */}
                          {req.status === 'fulfilled' && req.fulfilledLinkUrl && (
                            <div className="pt-1 flex items-center gap-2 text-xs text-emerald-400">
                              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-semibold text-[11px]">Fulfilled Link:</span>
                              <a
                                href={req.fulfilledLinkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate max-w-xs font-mono text-[11px] underline hover:text-emerald-300"
                              >
                                {req.fulfilledLinkUrl}
                              </a>
                            </div>
                          )}

                          {/* Admin Conversation Replies */}
                          {req.adminReplies && req.adminReplies.length > 0 && (
                            <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> Admin Replies ({req.adminReplies.length})
                              </span>
                              {req.adminReplies.map((r, i) => (
                                <div key={i} className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                                  <p className="text-zinc-200 text-[11px] leading-relaxed">{r.message}</p>
                                  <span className="text-[9px] text-zinc-500">{new Date(r.createdAt).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="text-[10px] text-zinc-500 pt-0.5">
                            <span>Requested on {dateStr}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex flex-wrap items-center gap-2 self-end md:self-center shrink-0">
                        {/* 1-Click Fulfill Action Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenFulfill(req)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                          title="Open fulfillment dialog (Single Link, Bulk Auto-Detector, or Episode Grid)"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>{req.status === 'fulfilled' ? 'Add Another Link' : 'Fulfill & Add Link'}</span>
                        </button>

                        {/* Reply to User Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setAdminReplyTarget({
                              type: 'request',
                              id: req.id,
                              title: req.title,
                              userEmail: req.userEmail || req.userContact,
                              currentStatus: req.status,
                            });
                            setAdminReplyText('');
                          }}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-amber-500/60 text-zinc-300 hover:text-amber-400 text-xs font-bold transition-all cursor-pointer hover:scale-105 active:scale-95"
                          title="Reply to user request (notifies user on site and Telegram)"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                          <span>Reply</span>
                        </button>

                        {/* Direct Jump to Manage Links Modal */}
                        <button
                          type="button"
                          onClick={() => {
                            const targetTitle: LinkedCatalogTitle = {
                              id: String(req.tmdbId || req.id),
                              title: req.title,
                              media_type: (req.mediaType === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv',
                              poster_path: req.posterPath || null,
                              backdrop_path: null,
                              year: req.releaseYear || '',
                              linksCount: 0,
                            };
                            openTitleManager(targetTitle);
                            addLog(`Opened Link Manager for "${req.title}"`, 'info');
                          }}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-amber-500/60 text-zinc-300 hover:text-amber-400 text-xs font-bold transition-all cursor-pointer hover:scale-105 active:scale-95"
                          title="Open Link Manager for this title"
                        >
                          <Link2 className="w-3.5 h-3.5 text-amber-400" />
                          <span className="hidden lg:inline">Manage Links</span>
                        </button>

                        {/* Status Toggle Quick Buttons */}
                        {req.status !== 'rejected' && (
                          <button
                            type="button"
                            onClick={() => {
                              const reason = prompt(
                                `Enter rejection reason for "${req.title}" (will be displayed to user):`,
                                'Content currently unavailable or already listed on platform'
                              );
                              if (reason === null) return;
                              if (!reason.trim()) {
                                alert('A rejection reason is required to reject a request.');
                                return;
                              }
                              handleUpdateStatus(req.id, 'rejected', { adminNote: reason.trim() });
                            }}
                            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-rose-500/50 text-rose-400 hover:text-rose-300 text-xs font-bold transition-colors cursor-pointer hover:scale-105 active:scale-95"
                            title="Reject this request with reason"
                          >
                            Reject
                          </button>
                        )}

                        {req.status !== 'pending' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(req.id, 'pending')}
                            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-amber-500/50 text-amber-400 hover:text-amber-300 text-xs font-bold transition-colors cursor-pointer hover:scale-105 active:scale-95"
                            title="Reopen as pending"
                          >
                            Reopen
                          </button>
                        )}

                        {/* View Title on Live Site / Search */}
                        <a
                          href={req.tmdbId ? `/${req.mediaType || 'movie'}/${req.tmdbId}` : `/search?q=${encodeURIComponent(req.title)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                          title={req.tmdbId ? `Open ${req.title} on Cinefuel` : `Search ${req.title} on Cinefuel`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>

                        {/* Delete Request */}
                        <button
                          type="button"
                          onClick={() => handleDeleteRequest(req.id)}
                          className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Delete Request"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB: DEFECTIVE LINKS CONTROL CENTER */}
      {/* ========================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="p-6 rounded-3xl bg-[#0f121a] border border-rose-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-start sm:items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/10">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Defective Links Control Center
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-mono font-bold uppercase">
                    Live Moderation
                  </span>
                </div>
                <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                  Review and manage links reported by users for 404 dead links, paywall loops, corrupted files, or audio desyncs. Test, replace with working mirrors, or purge broken downloads in 1 click.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
              <button
                onClick={fetchAdminReports}
                disabled={isLoadingReports}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                title="Refresh defective reports list"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReports ? 'animate-spin text-rose-400' : ''}`} />
                <span>{isLoadingReports ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <button
              onClick={() => setReportsFilter('all')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                reportsFilter === 'all'
                  ? 'bg-rose-500/15 border-rose-500 text-white shadow-md shadow-rose-500/10'
                  : 'bg-[#11141c] border-white/5 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Total Reports</span>
              <p className="text-2xl font-black text-white">{reportsList.length}</p>
            </button>

            <button
              onClick={() => setReportsFilter('pending')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                reportsFilter === 'pending'
                  ? 'bg-rose-500/15 border-rose-500 text-white shadow-md shadow-rose-500/10'
                  : 'bg-[#11141c] border-white/5 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Needs Fix</span>
                {pendingReportsCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                )}
              </div>
              <p className="text-2xl font-black text-rose-400">{pendingReportsCount}</p>
            </button>

            <button
              onClick={() => setReportsFilter('fixed')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                reportsFilter === 'fixed'
                  ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md shadow-emerald-500/10'
                  : 'bg-[#11141c] border-white/5 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">Fixed / Replaced</span>
              <p className="text-2xl font-black text-emerald-400">
                {reportsList.filter((r) => r.status === 'fixed').length}
              </p>
            </button>

            <button
              onClick={() => setReportsFilter('dismissed')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                reportsFilter === 'dismissed'
                  ? 'bg-zinc-700/40 border-zinc-500 text-white shadow-md'
                  : 'bg-[#11141c] border-white/5 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Dismissed (Valid)</span>
              <p className="text-2xl font-black text-zinc-300">
                {reportsList.filter((r) => r.status === 'dismissed').length}
              </p>
            </button>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="p-4 rounded-2xl bg-[#0f121a] border border-zinc-800 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search by title, URL, release name, server, or notes..."
                value={reportsSearchQuery}
                onChange={(e) => setReportsSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-9 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
              />
              {reportsSearchQuery && (
                <button
                  onClick={() => setReportsSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto no-scrollbar">
              {(['all', 'pending', 'fixed', 'dismissed'] as const).map((filterKey) => (
                <button
                  key={filterKey}
                  onClick={() => setReportsFilter(filterKey)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all shrink-0 ${
                    reportsFilter === filterKey
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  {filterKey}
                </button>
              ))}
            </div>

            {/* Issue Filter Selector */}
            <select
              value={reportsIssueFilter}
              onChange={(e) => setReportsIssueFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-rose-500"
            >
              <option value="all">All Issue Types</option>
              <option value="dead_link">Dead Link / 404</option>
              <option value="paywall_loop">Bypass / Paywall Loop</option>
              <option value="audio_desync">Audio Desync / Missing</option>
              <option value="video_glitch">Video Glitch / Corrupted</option>
              <option value="wrong_episode">Wrong Episode / Title</option>
              <option value="slow_timeout">Slow Server / Timeout</option>
              <option value="other">Other Issue</option>
            </select>
          </div>

          {/* Reports List Cards */}
          {(() => {
            const filteredReports = (Array.isArray(reportsList) ? reportsList : []).filter((r) => {
              if (reportsFilter !== 'all' && r.status !== reportsFilter) return false;
              if (reportsIssueFilter !== 'all' && r.issueType !== reportsIssueFilter) return false;
              if (!reportsSearchQuery.trim()) return true;
              const q = reportsSearchQuery.toLowerCase();
              return (
                (r.mediaTitle || '').toLowerCase().includes(q) ||
                (r.linkTitle || '').toLowerCase().includes(q) ||
                (r.reportedUrl || '').toLowerCase().includes(q) ||
                (r.server && r.server.toLowerCase().includes(q)) ||
                (r.additionalNotes && r.additionalNotes.toLowerCase().includes(q)) ||
                (r.userEmail && r.userEmail.toLowerCase().includes(q))
              );
            });

            if (filteredReports.length === 0) {
              return (
                <div className="p-12 rounded-3xl bg-[#0f121a] border border-zinc-800 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-600">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-white">No Defective Link Reports</h4>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    {reportsFilter === 'all'
                      ? 'All custom downloads and streams are functioning normally! When a user reports a broken link, it will appear here.'
                      : `No reports currently matching the filter "${reportsFilter}".`}
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {filteredReports.map((report) => {
                  const issueBadgeStyle = (() => {
                    switch (report.issueType) {
                      case 'dead_link':
                        return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
                      case 'paywall_loop':
                        return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
                      case 'audio_desync':
                        return 'bg-purple-500/15 text-purple-300 border-purple-500/40';
                      case 'video_glitch':
                        return 'bg-pink-500/15 text-pink-300 border-pink-500/40';
                      case 'wrong_episode':
                        return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
                      case 'slow_timeout':
                        return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40';
                      default:
                        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
                    }
                  })();

                  const serverInfo = detectServer(report.reportedUrl);

                  return (
                    <div
                      key={report.id}
                      className="p-5 rounded-3xl bg-[#0f121a] border border-zinc-800/80 hover:border-zinc-700 flex flex-col md:flex-row items-start justify-between gap-5 transition-all shadow-md group"
                    >
                      {/* Left: Poster + Details */}
                      <div className="flex items-start gap-4 overflow-hidden w-full md:w-auto">
                        {/* Title Poster Thumbnail */}
                        <div className="w-14 h-20 rounded-xl bg-zinc-900 border border-zinc-800 relative overflow-hidden shrink-0 shadow-md">
                          {report.posterPath ? (
                            <Image
                              src={getImageURL(report.posterPath, 'w200')}
                              alt={report.mediaTitle}
                              fill
                              className="object-cover"
                              sizes="56px"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-700 font-black text-xs">
                              {report.mediaType === 'tv' ? 'TV' : 'MOVIE'}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 overflow-hidden flex-1">
                          {/* Title & Badges */}
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-black text-white hover:text-rose-400 transition-colors">
                              {report.movieId ? (
                                <Link
                                  href={`/${report.mediaType || 'movie'}/${report.movieId}`}
                                  target="_blank"
                                  className="flex items-center gap-1.5"
                                >
                                  <span>{report.mediaTitle}</span>
                                  <ExternalLink className="w-3 h-3 text-zinc-500" />
                                </Link>
                              ) : (
                                report.mediaTitle
                              )}
                            </h4>

                            <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase">
                              {report.mediaType === 'tv' ? 'TV Series' : 'Movie'}
                            </span>

                            {/* Issue Pill */}
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 ${issueBadgeStyle}`}>
                              <AlertTriangle className="w-3 h-3" />
                              <span>{report.issueLabel}</span>
                            </span>

                            {/* Status Pill */}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                report.status === 'fixed'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : report.status === 'in_progress'
                                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                                  : report.status === 'dismissed'
                                  ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-pulse'
                              }`}
                            >
                              {report.status === 'fixed' ? '✓ Fixed' : report.status === 'in_progress' ? '⏳ In Progress' : report.status === 'dismissed' ? 'Dismissed' : 'Pending Fix'}
                            </span>
                          </div>

                          {/* Link Title / Release Name */}
                          <div className="text-xs font-bold text-zinc-300 font-mono break-all">
                            {report.linkTitle}
                          </div>

                          {/* Server & Quality Tags */}
                          <div className="flex flex-wrap items-center gap-2 text-[10px]">
                            <span className={`px-2 py-0.5 rounded font-bold border flex items-center gap-1 ${serverInfo.badgeClass}`}>
                              {report.server || serverInfo.name}
                            </span>
                            {report.quality && (
                              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold border border-zinc-700">
                                {report.quality}
                              </span>
                            )}
                            <span className="text-zinc-500 font-mono">
                              Reported {formatRelativeTime(report.createdAt)}
                            </span>
                            {(report.userName || report.userEmail) && (
                              <button
                                onClick={() => {
                                  setActiveTab('users');
                                  setUserSearchQuery(report.userEmail || report.userName || '');
                                }}
                                className="text-zinc-300 hover:text-white font-mono flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-800 transition-colors"
                                title="Jump to this user in Manage Users directory"
                              >
                                <UserCheck className="w-3 h-3 text-emerald-400" />
                                <span>{report.userName ? `${report.userName} (${report.userEmail})` : report.userEmail}</span>
                              </button>
                            )}
                          </div>

                          {/* Reported Broken URL Box */}
                          <div className="flex items-center gap-2 p-2 rounded-xl bg-black/40 border border-white/5 text-[11px] font-mono text-zinc-400 max-w-xl">
                            <span className="text-rose-400 font-bold shrink-0">Dead URL:</span>
                            <span className="truncate flex-1 text-zinc-300" title={report.reportedUrl}>
                              {report.reportedUrl}
                            </span>
                            <a
                              href={report.reportedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center gap-1 text-[10px] shrink-0 transition-colors"
                              title="Test link in new tab to see if it 404s"
                            >
                              <span>Test Link</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>

                          {/* User Additional Notes */}
                          {report.additionalNotes && (
                            <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-300 italic">
                              &ldquo;{report.additionalNotes}&rdquo;
                            </div>
                          )}

                          {/* Resolved State Display */}
                          {report.status === 'fixed' && report.replacementUrl && (
                            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
                              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-semibold">Replaced with:</span>
                              <a
                                href={report.replacementUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate underline font-mono text-[11px]"
                              >
                                {report.replacementUrl}
                              </a>
                            </div>
                          )}

                          {/* Admin Conversation Replies */}
                          {report.adminReplies && report.adminReplies.length > 0 && (
                            <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> Admin Replies ({report.adminReplies.length})
                              </span>
                              {report.adminReplies.map((r, i) => (
                                <div key={i} className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs">
                                  <p className="text-zinc-200 text-[11px] leading-relaxed">{r.message}</p>
                                  <span className="text-[9px] text-zinc-500">{new Date(r.createdAt).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Admin Action Controls */}
                      <div className="flex flex-wrap md:flex-col items-center md:items-end gap-2 shrink-0 self-end md:self-center w-full md:w-auto">
                        {/* 1. Replace & Fix Link Action */}
                        <button
                          type="button"
                          onClick={() => handleOpenFixModal(report)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500 hover:from-rose-400 hover:to-amber-400 text-black font-black text-xs shadow-md shadow-rose-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                          title="Open dialog to enter working replacement link"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          <span>{report.status === 'fixed' ? 'Update Replacement' : 'Replace & Fix Link'}</span>
                        </button>

                        {/* Reply to Reporter Action */}
                        <button
                          type="button"
                          onClick={() => {
                            setAdminReplyTarget({
                              type: 'report',
                              id: report.id,
                              title: report.mediaTitle || report.linkTitle,
                              userEmail: report.userEmail,
                              currentStatus: report.status,
                            });
                            setAdminReplyText('');
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-rose-500/50 text-rose-400 hover:text-rose-300 text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer"
                          title="Reply to reporter (notifies user on site and Telegram)"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Reply</span>
                        </button>

                        {/* 2. Direct Delete Broken Link Button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteBrokenLinkDirectly(report)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer"
                          title="Permanently remove broken link from CiNEPHiLE"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Broken Link</span>
                        </button>

                        {/* 3. In Progress, Dismiss & Reopen Actions */}
                        <div className="flex items-center gap-1.5">
                          {report.status !== 'in_progress' && report.status !== 'fixed' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateReportStatus(report.id, 'in_progress')}
                              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-sky-500 text-sky-400 hover:text-sky-300 text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer"
                              title="Mark report as being investigated / in progress"
                            >
                              In Progress
                            </button>
                          )}

                          {report.status !== 'dismissed' && (
                            <button
                              type="button"
                              onClick={() => {
                                const reason = prompt('Enter dismissal explanation for user:', 'Curators verified and confirmed link is active.');
                                if (reason === null) return;
                                handleUpdateReportStatus(report.id, 'dismissed', { adminNote: reason });
                              }}
                              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer"
                              title="Mark as false alarm or link is functioning fine with explanation"
                            >
                              Dismiss (Valid)
                            </button>
                          )}

                          {report.status !== 'pending' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateReportStatus(report.id, 'pending')}
                              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-amber-500 text-amber-400 hover:text-amber-300 text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer"
                              title="Reopen report as pending"
                            >
                              Reopen
                            </button>
                          )}

                          {/* Delete Report Record */}
                          <button
                            type="button"
                            onClick={() => handleDeleteReport(report.id)}
                            className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title="Delete this report record"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: MANAGE USERS */}
      {/* ========================================================= */}
      {activeTab === 'users' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#0f121a] border border-zinc-800 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
            <div className="space-y-1">
              <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2.5">
                <Users className="w-5 h-5 text-amber-400" /> User Directory & Account Vault
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono">
                  {registeredUsers.length} {registeredUsers.length === 1 ? 'User' : 'Users'}
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Real-time registry of authenticated users, sign-in accounts, movie request history, and active link reports.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchAdminUsers()}
                disabled={isLoadingUsers}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-amber-500/10 active:scale-95 disabled:opacity-50"
                title="Fetch latest accounts from database"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                <span>{isLoadingUsers ? 'Fetching...' : 'Fetch Users'}</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Total Accounts
              </span>
              <p className="text-2xl font-black text-white">{registeredUsers.length}</p>
              <span className="text-[10px] text-zinc-500 block">Registered & Live</span>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-blue-500/20 space-y-1">
              <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider block">
                Active Requesters
              </span>
              <p className="text-2xl font-black text-blue-400">
                {registeredUsers.filter((u) => (u.requestsCount || 0) > 0).length}
              </p>
              <span className="text-[10px] text-zinc-500 block">Requested Media</span>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-rose-500/20 space-y-1">
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block">
                Defective Reporters
              </span>
              <p className="text-2xl font-black text-rose-400">
                {registeredUsers.filter((u) => (u.reportsCount || 0) > 0).length}
              </p>
              <span className="text-[10px] text-zinc-500 block">Reported Issues</span>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-emerald-500/20 space-y-1">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
                Active Admin Session
              </span>
              <p className="text-sm font-bold text-emerald-400 truncate">
                {userProfile?.displayName || userProfile?.email?.split('@')[0] || 'Shyam'}
              </p>
              <span className="text-[10px] text-zinc-500 block truncate">
                {userProfile?.email || 'admin@cinefuel.app'}
              </span>
            </div>
          </div>

          {/* Search & Category Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search users by name, email, UID, or requested title (e.g. Ballerina)..."
                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/60"
              />
              {userSearchQuery && (
                <button
                  onClick={() => setUserSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 shrink-0">
              <button
                onClick={() => setUserFilterCategory('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  userFilterCategory === 'all'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                All ({registeredUsers.length})
              </button>
              <button
                onClick={() => setUserFilterCategory('requesters')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  userFilterCategory === 'requesters'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Requesters ({registeredUsers.filter((u) => (u.requestsCount || 0) > 0).length})
              </button>
              <button
                onClick={() => setUserFilterCategory('reporters')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  userFilterCategory === 'reporters'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Reporters ({registeredUsers.filter((u) => (u.reportsCount || 0) > 0).length})
              </button>
            </div>
          </div>

          {/* User Directory Cards Grid */}
          {isLoadingUsers && registeredUsers.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
              <p className="text-sm font-bold text-white">Fetching user directory & accounts...</p>
              <p className="text-xs text-zinc-500">Querying central database and activity registry</p>
            </div>
          ) : filteredRegisteredUsers.length === 0 ? (
            <div className="py-16 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-3 p-6">
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
                <Users className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">
                {userSearchQuery || userFilterCategory !== 'all'
                  ? 'No matching users found'
                  : 'No registered user accounts yet'}
              </h4>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                {userSearchQuery || userFilterCategory !== 'all'
                  ? 'Try clearing your search query or switching filters.'
                  : 'When visitors sign in with Google or Email/Password, or submit movie requests, their accounts will appear here automatically.'}
              </p>
              <div className="pt-2">
                <button
                  onClick={() => {
                    setUserSearchQuery('');
                    setUserFilterCategory('all');
                    fetchAdminUsers();
                  }}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white inline-flex items-center gap-2 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reset & Fetch Users
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredRegisteredUsers.map((user) => {
                const userName = user.name || user.displayName || 'Cinema Explorer';
                const initial = (userName || user.email || 'U')[0].toUpperCase();
                const userUid = user.firebaseUid || user.uid;
                const isCopied = copiedUid === userUid;
                const isGoogle = user.provider === 'google' || user.provider === 'google.com';
                const providerLabel = isGoogle
                  ? 'Google Auth'
                  : user.provider === 'password' || user.provider === 'email_password'
                  ? 'Email / Password'
                  : user.provider === 'request_submitter'
                  ? 'Request Submitter'
                  : user.provider === 'report_submitter'
                  ? 'Report Submitter'
                  : user.provider === 'fast_login'
                  ? 'Fast Login'
                  : 'Firebase User';

                return (
                  <div
                    key={userUid}
                    className="p-5 rounded-2xl bg-zinc-900/75 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all space-y-4 flex flex-col justify-between group shadow-sm"
                  >
                    <div className="space-y-3.5">
                      {/* User Identity Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-full overflow-hidden bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-black font-black text-base shrink-0 shadow-md">
                            {user.photoURL ? (
                              <img
                                src={user.photoURL}
                                alt={userName}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              initial
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                              <span className="truncate">{userName}</span>
                            </h4>
                            <span className="text-xs text-zinc-400 truncate block font-mono">
                              {user.email || 'No email registered'}
                            </span>
                          </div>
                        </div>

                        {/* Provider & Status Badges */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              isGoogle
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            }`}
                          >
                            {providerLabel}
                          </span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700/60 uppercase">
                            {user.status || 'active'}
                          </span>
                        </div>
                      </div>

                      {/* UID & Date Info */}
                      <div className="grid grid-cols-1 gap-1 text-[11px] text-zinc-400 font-mono bg-black/40 p-2.5 rounded-xl border border-zinc-800/80">
                        <div className="flex items-center justify-between text-zinc-400">
                          <span className="text-zinc-500">Firebase UID:</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate max-w-[140px] text-zinc-300 font-mono text-[10px]" title={userUid}>
                              {userUid}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyUid(userUid)}
                              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors"
                              title="Copy Firebase UID"
                            >
                              {isCopied ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-zinc-400">
                          <span className="text-zinc-500">Joined:</span>
                          <span className="text-zinc-300">
                            {formatDateSafe(user.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-zinc-400">
                          <span className="text-zinc-500">Last Active:</span>
                          <span className="text-zinc-300">
                            {formatRelativeTime(user.lastLoginAt || user.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Activity Badges */}
                      <div className="grid grid-cols-2 gap-2 text-center text-xs">
                        <div className="p-2 rounded-xl bg-blue-500/5 border border-blue-500/20">
                          <span className="text-blue-400/80 block text-[10px] font-semibold uppercase">Requests</span>
                          <span className="font-black text-blue-400 text-sm">{user.requestsCount || 0}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/20">
                          <span className="text-rose-400/80 block text-[10px] font-semibold uppercase">Reports</span>
                          <span className="font-black text-rose-400 text-sm">{user.reportsCount || 0}</span>
                        </div>
                      </div>

                      {/* Requested Titles Pills */}
                      {Array.isArray(user.recentRequests) && user.recentRequests.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                            Requested Titles:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {user.recentRequests.map((title, i) => (
                              <button
                                key={i}
                                onClick={() => {
                                  setActiveTab('requests');
                                  setRequestsSearchQuery(title);
                                }}
                                className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center gap-1 transition-colors"
                                title={`Jump to requests for "${title}"`}
                              >
                                <Film className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="truncate max-w-[180px]">{title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                      <button
                        onClick={() => {
                          setActiveTab('requests');
                          setRequestsSearchQuery(user.email || user.displayName || '');
                        }}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Inbox className="w-3.5 h-3.5 text-amber-400" />
                        <span>View Requests</span>
                      </button>

                      <button
                        onClick={() => handleDeleteUser(user.uid, user.email)}
                        className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete user account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: API KEYS & INTEGRATIONS */}
      {/* ========================================================= */}
      {activeTab === 'apis' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#0f121a] border border-zinc-800 space-y-6">
          <div className="space-y-1">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" /> API Keys & Configuration
            </h3>
            <p className="text-xs text-zinc-400">
              Configure and test live connection credentials for TMDB movie & TV database.
            </p>
          </div>

          <form onSubmit={handleSaveApis} className="space-y-5 max-w-2xl">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>TMDB API Key (v3 auth)</span>
                <span className="text-[10px] text-amber-400 font-normal">themoviedb.org/settings/api</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter TMDB API Key (e.g. 8265bd16...)"
                  value={tmdbKey}
                  onChange={(e) => setTmdbKey(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleTestTmdb}
                  disabled={isTestingTmdb}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all shrink-0 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingTmdb ? 'animate-spin' : ''}`} />
                  {isTestingTmdb ? 'Pinging...' : 'Test Connection'}
                </button>
              </div>
              {tmdbTestResult && (
                <p className={`text-xs font-medium flex items-center gap-1 mt-1 ${tmdbTestResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {tmdbTestResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  {tmdbTestResult.msg}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> Save API Configuration
            </button>

            {apiSaveSuccess && (
              <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Credentials saved securely!
              </p>
            )}
          </form>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 6: BACKUP & DATABASE RESTORE */}
      {/* ========================================================= */}
      {activeTab === 'backup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-3xl bg-[#0f121a] border border-zinc-800 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-white">Export Complete Database Backup</h4>
              <p className="text-xs text-zinc-400">
                Downloads a JSON file containing all user watchlists, custom lists, ratings, custom attached links, and engine settings.
              </p>
            </div>
            <button
              onClick={handleExportBackup}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Download Backup (.json)
            </button>
          </div>

          <div className="p-6 rounded-3xl bg-[#0f121a] border border-zinc-800 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-white">Restore from Backup JSON</h4>
              <p className="text-xs text-zinc-400">
                Upload a previously exported backup file to restore all watchlists, custom links, and settings instantly.
              </p>
            </div>
            <label className="inline-flex px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs transition-all cursor-pointer items-center gap-2">
              <Upload className="w-4 h-4" /> Select Backup JSON File
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 7: DIAGNOSTICS & LOGS */}
      {/* ========================================================= */}
      {activeTab === 'logs' && (
        <div className="p-6 rounded-3xl bg-[#0f121a] border border-zinc-800 space-y-4 font-mono">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4 text-amber-400" /> Real-time System Diagnostics & Logs
            </h3>
            <button
              onClick={() => addLog('Diagnostics ping triggered.', 'info')}
              className="text-[11px] text-amber-400 hover:underline"
            >
              Trigger Ping
            </button>
          </div>

          <div className="bg-black/80 rounded-2xl p-4 border border-zinc-800/80 space-y-2 max-h-72 overflow-y-auto text-xs">
            {systemLogs.map((log, index) => (
              <div key={index} className="flex items-start gap-2.5">
                <span className="text-zinc-500 shrink-0">[{log.timestamp}]</span>
                <span
                  className={`font-bold shrink-0 ${
                    log.level === 'success' ? 'text-emerald-400' : log.level === 'warn' ? 'text-rose-400' : 'text-sky-400'
                  }`}
                >
                  [{log.level.toUpperCase()}]
                </span>
                <span className="text-zinc-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
            </main>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* EDIT LINK MODAL (ADMIN ONLY) */}
      {/* ========================================================= */}
      {editingLink && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#10141d] border border-amber-500/40 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Edit className="w-4 h-4 text-amber-400" /> Edit Custom Link
              </h3>
              <button
                onClick={() => setEditingLink(null)}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditLink} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Link Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Destination URL</label>
                <input
                  type="text"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-medium"
                  >
                    <option value="Streaming">🎬 Streaming</option>
                    <option value="Download">📥 Download</option>
                    <option value="ZipPack">ZipPack</option>
                    <option value="SingleEpisode">SingleEpisode</option>
                    <option value="Subtitles">🌐 Subtitles</option>
                    <option value="Discussion">💬 Discussion</option>
                    <option value="Review">📝 Review</option>
                    <option value="Official">🏛️ Official</option>
                    <option value="Recent">⚡ Recent</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Quality</label>
                  <input
                    type="text"
                    placeholder="e.g. 2160p 4K, 1080p"
                    value={editQuality}
                    onChange={(e) => setEditQuality(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Audio Dub</label>
                  <input
                    type="text"
                    placeholder="e.g. Hindi + English"
                    value={editAudio}
                    onChange={(e) => setEditAudio(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Size</label>
                  <input
                    type="text"
                    placeholder="e.g. 16.8 GB"
                    value={editSize}
                    onChange={(e) => setEditSize(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-zinc-800/80">
                <div>
                  <label className="text-[11px] font-semibold text-zinc-300 block mb-1">Container</label>
                  <select
                    value={editContainer}
                    onChange={(e) => setEditContainer(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Auto Detect</option>
                    <option value="MKV">MKV (Video)</option>
                    <option value="ZIP">ZIP (Archive)</option>
                    <option value="MP4">MP4 (Video)</option>
                    <option value="RAR">RAR (Archive)</option>
                    <option value="7Z">7Z (Archive)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-300 block mb-1">Dynamic Range</label>
                  <select
                    value={editDynamicRange}
                    onChange={(e) => setEditDynamicRange(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Auto (Filename)</option>
                    <option value="None">None (No Badge)</option>
                    <option value="SDR">SDR</option>
                    <option value="HDR">HDR</option>
                    <option value="DV HDR">DV HDR</option>
                    <option value="Conflict">Conflict (Review)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-300 block mb-1">Codec</label>
                  <select
                    value={editCodec}
                    onChange={(e) => setEditCodec(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Auto Detect</option>
                    <option value="H.265">H.265 / HEVC</option>
                    <option value="H.264">H.264 / AVC</option>
                    <option value="AV1">AV1</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-300 block mb-1">Resolution</label>
                  <select
                    value={editResolution}
                    onChange={(e) => setEditResolution(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Auto Detect</option>
                    <option value="2160p">2160p (4K)</option>
                    <option value="1080p">1080p (FHD)</option>
                    <option value="720p">720p (HD)</option>
                    <option value="480p">480p (SD)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingLink(null)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Fulfill Link Request Modal (Single, Bulk Auto-Detector, & Episode Grid) */}
      {fulfillingRequest && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-[#0f131d] border border-blue-500/40 rounded-3xl p-5 sm:p-7 max-w-4xl w-full space-y-4 shadow-2xl animate-scaleIn my-6 max-h-[92vh] overflow-y-auto">
            {/* Header with Title & 3 Mode Switcher Pills */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 font-black">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider ${fulfillingRequest.mediaType === 'tv' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                      {fulfillingRequest.mediaType === 'tv' ? 'TV SERIES' : 'MOVIE'}
                    </span>
                    {fulfillingRequest.releaseYear && (
                      <span className="text-xs text-zinc-400 font-mono">({fulfillingRequest.releaseYear})</span>
                    )}
                  </div>
                  <h4 className="text-base sm:text-lg font-black text-white leading-tight">
                    Fulfill Request: <span className="text-blue-400">{fulfillingRequest.title}</span>
                  </h4>
                </div>
              </div>

              {/* 3 Link Mode Tabs (Single, Bulk, Grid) */}
              <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-2xl border border-zinc-800 self-start md:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setFulfillMode('single')}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                    fulfillMode === 'single'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" /> Single Link
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillMode('bulk')}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all ${
                    fulfillMode === 'bulk'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-md shadow-amber-500/20'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 fill-current" /> Bulk Auto-Detector
                </button>
                {fulfillingRequest.mediaType === 'tv' && (
                  <button
                    type="button"
                    onClick={() => {
                      setFulfillMode('grid');
                      if (fulfillGridEpisodes.length === 0) {
                        syncFulfillGridSlots(
                          fulfillGridEpisodeCount,
                          fulfillGridSeason,
                          fulfillGridBasePattern,
                          fulfillGridQuality,
                          fulfillGridAudio,
                          fulfillGridSize,
                          fulfillingRequest.title
                        );
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all ${
                      fulfillMode === 'grid'
                        ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> Episode Grid ({fulfillGridEpisodeCount} EPs)
                  </button>
                )}
                <button
                  onClick={() => setFulfillingRequest(null)}
                  className="text-zinc-400 hover:text-white text-xs font-bold px-2 py-1.5 ml-1 rounded-lg hover:bg-zinc-800"
                  title="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Request Summary Card */}
            <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400">Requested Quality:</span>
                    <span className="text-blue-400 font-bold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                      {fulfillingRequest.quality || 'Any Quality'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400">Requested Audio:</span>
                    <span className="text-purple-400 font-bold px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                      {fulfillingRequest.audioLanguage || 'Any Audio'}
                    </span>
                  </div>
                  {fulfillingRequest.mediaType === 'tv' && (fulfillingRequest.seasonNumber || fulfillingRequest.episodeNumber) && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-400">Target Season/EP:</span>
                      <span className="text-amber-400 font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                        {fulfillingRequest.seasonNumber ? `S${fulfillingRequest.seasonNumber}` : ''}
                        {fulfillingRequest.episodeNumber ? `E${fulfillingRequest.episodeNumber}` : ' (Full Pack)'}
                      </span>
                    </div>
                  )}
                </div>
                {fulfillingRequest.userContact && (
                  <span className="text-[11px] text-zinc-400 font-mono">
                    User Contact: <strong className="text-blue-400">{fulfillingRequest.userContact}</strong>
                  </span>
                )}
              </div>
              {fulfillingRequest.notes && (
                <div className="pt-1.5 border-t border-zinc-800/60 text-zinc-300 italic">
                  &ldquo;{fulfillingRequest.notes}&rdquo;
                </div>
              )}
            </div>

            {fulfillSuccessMsg ? (
              <div className="p-6 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center font-bold space-y-2 animate-fadeIn">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-sm font-bold text-white">{fulfillSuccessMsg}</p>
              </div>
            ) : (
              <>
                {/* ----------------- MODE 1: SINGLE LINK ----------------- */}
                {fulfillMode === 'single' && (
                  <form onSubmit={handleFulfillSubmit} className="space-y-4 pt-1 animate-fadeIn">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="lg:col-span-2">
                        <label className="text-[11px] font-semibold text-zinc-300 block mb-1">
                          Link Title / Release Label *
                        </label>
                        <input
                          type="text"
                          value={fulfillTitle}
                          onChange={(e) => setFulfillTitle(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-medium"
                          required
                        />
                      </div>

                      <div className="lg:col-span-2">
                        <label className="text-[11px] font-semibold text-zinc-300 block mb-1">
                          Download / Streaming Destination URL *
                        </label>
                        <input
                          type="text"
                          placeholder="https://hubcloud.club/... or GDFlix / Google Drive URL"
                          value={fulfillUrl}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFulfillUrl(val);
                            if (val.trim() && isPackMedia(fulfillTitle, val)) {
                              setFulfillCategory('ZipPack');
                            }
                          }}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-blue-500"
                          required
                          autoFocus
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Category / Type</label>
                        <select
                          value={fulfillCategory}
                          onChange={(e) => setFulfillCategory(e.target.value as CustomLink['category'])}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
                        >
                          <option value="Download">📥 Direct Download</option>
                          <option value="Streaming">🎬 Streaming & OTT</option>
                          <option value="SingleEpisode">📺 Single Episode</option>
                          <option value="ZipPack">🗜️ Season Zip / Batch Pack</option>
                          <option value="Subtitles">🌐 Subtitles</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Quality</label>
                        <input
                          type="text"
                          placeholder="e.g. 1080p, 4K"
                          value={fulfillQuality}
                          onChange={(e) => setFulfillQuality(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Audio / Dub</label>
                        <input
                          type="text"
                          placeholder="e.g. Hindi + English"
                          value={fulfillAudio}
                          onChange={(e) => setFulfillAudio(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-zinc-400 block mb-1">File Size</label>
                        <input
                          type="text"
                          placeholder="e.g. 2.4 GB"
                          value={fulfillSize}
                          onChange={(e) => setFulfillSize(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setFulfillingRequest(null)}
                        disabled={isFulfillingSubmit}
                        className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isFulfillingSubmit}
                        className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-blue-500/25 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{isFulfillingSubmit ? 'Publishing Link...' : 'Publish Link & Fulfill'}</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* ----------------- MODE 2: BULK AUTO-DETECTOR ----------------- */}
                {fulfillMode === 'bulk' && (
                  <div className="space-y-4 pt-1 animate-fadeIn">
                    {/* Bulk Target Format Switcher */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-300">Bulk Target Format:</span>
                        <div className="inline-flex rounded-xl p-1 bg-zinc-900 border border-zinc-700/80 gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setFulfillBulkMediaType('movie');
                              if (fulfillBulkRawText.trim()) {
                                const parsed = parseBulkLinksInput(fulfillBulkRawText, 1, 'movie', fulfillBulkMovieCategory);
                                setFulfillBulkParsedItems(parsed);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                              fulfillBulkMediaType === 'movie'
                                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            <Film className="w-3.5 h-3.5" /> Movie Releases Mode
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFulfillBulkMediaType('tv');
                              if (fulfillBulkRawText.trim()) {
                                const parsed = parseBulkLinksInput(fulfillBulkRawText, fulfillingRequest.seasonNumber || 1, 'tv', 'SingleEpisode');
                                setFulfillBulkParsedItems(parsed);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                              fulfillBulkMediaType === 'tv'
                                ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            <Tv className="w-3.5 h-3.5" /> TV Episodes & Packs
                          </button>
                        </div>
                      </div>

                      {fulfillBulkMediaType === 'movie' && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-zinc-400">Default Category:</span>
                          <select
                            value={fulfillBulkMovieCategory}
                            onChange={(e) => {
                              const cat = e.target.value as CustomLink['category'];
                              setFulfillBulkMovieCategory(cat);
                              handleFulfillSetAllBulkCategory(cat);
                            }}
                            className="bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                          >
                            <option value="Download">📥 Direct Download</option>
                            <option value="Streaming">🎬 Streaming & OTT</option>
                            <option value="Subtitles">🌐 Subtitles</option>
                            <option value="Recent">⚡ Recent Release</option>
                            <option value="Official">🏛️ Official Website</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Textarea */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-300 block flex items-center justify-between">
                        <span>
                          {fulfillBulkMediaType === 'movie'
                            ? `Paste Multiple Movie Release Lines / URLs for "${fulfillingRequest.title}":`
                            : `Paste Multiple Episode & Zip Pack Lines for "${fulfillingRequest.title}":`}
                        </span>
                        <span className="text-[10px] text-amber-400 font-mono">
                          {fulfillBulkMediaType === 'movie'
                            ? 'Auto-detects 4K UHD, 1080p, 720p, HDR, Dubs, and Sizes'
                            : 'Auto-detects S01/S02, Zip Packs vs Single EPs, Qualities, and Dubs'}
                        </span>
                      </label>
                      <textarea
                        rows={5}
                        placeholder={
                          fulfillBulkMediaType === 'movie'
                            ? `Paste multiple movie release lines or download URLs at once! Examples:\n${fulfillingRequest.title} 2160p UHD BluRay HEVC TrueHD Atmos 7.1 [Hindi DDP 5.1 + English] [24.5 GB] - https://hubcloud.cx/drive/movie4k\n${fulfillingRequest.title} 1080p FHD BluRay x264 [Hindi + English 5.1] [10.2 GB] - https://gdflix.dev/file/movie1080\n${fulfillingRequest.title} 720p HD WEB-DL [Hindi Dubbed] [2.1 GB] - https://mnmcloud.fun/files/movie720`
                            : `Paste multiple release lines or download URLs at once! Examples:\n${fulfillingRequest.title} S01E01 2160p WEB-DL Hindi DDP 5.1 [6.36 GB] - https://hubcloud.foo/video/1...\n${fulfillingRequest.title} S01E02 2160p WEB-DL Hindi DDP 5.1 [6.28 GB] - https://hubcloud.foo/video/2...\n${fulfillingRequest.title} S01 Complete 2160p UHD BluRay DV HDR [Hindi DDP 5.1 + English Atmos].zip https://mega.nz/file/3...`
                        }
                        value={fulfillBulkRawText}
                        onChange={(e) => setFulfillBulkRawText(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-2xl p-3.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-amber-500 leading-relaxed shadow-inner"
                        autoFocus
                      />
                    </div>

                    {/* Real-time Parsed Results Preview */}
                    {fulfillBulkParsedItems.length > 0 && (
                      <div className="space-y-3 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-400" />
                            <span className="text-xs font-black text-white">
                              {fulfillBulkParsedItems.length} {fulfillBulkMediaType === 'movie' ? 'Movie Releases' : 'Links'} Auto-Detected:
                            </span>
                            {fulfillBulkMediaType === 'movie' ? (
                              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-bold text-[10px]">
                                🎬 {fulfillBulkParsedItems.length} Movie Releases
                              </span>
                            ) : (
                              <>
                                <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 font-bold text-[10px]">
                                  📥 {fulfillBulkParsedItems.filter((i) => i.linkType === 'single_episode').length} Episodes
                                </span>
                                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-bold text-[10px]">
                                  🗜️ {fulfillBulkParsedItems.filter((i) => i.linkType === 'zip_pack').length} Zip Packs
                                </span>
                              </>
                            )}
                          </div>

                          {/* Quick Bulk Convert Controls */}
                          <div className="flex items-center gap-2">
                            {fulfillBulkMediaType === 'movie' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleFulfillSetAllBulkCategory('Download')}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-bold transition-colors"
                                  title="Set all movie items to Download"
                                >
                                  📥 Set All Download
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleFulfillSetAllBulkCategory('Streaming')}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px] font-bold transition-colors"
                                  title="Set all movie items to Streaming"
                                >
                                  🎬 Set All Streaming
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleFulfillSetAllBulkType('single_episode')}
                                  className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 text-[10px] font-bold transition-colors"
                                  title="Convert all items to Single Episodes"
                                >
                                  📥 Set All as Episodes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleFulfillSetAllBulkType('zip_pack')}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px] font-bold transition-colors"
                                  title="Convert all items to Zip Packs"
                                >
                                  🗜️ Set All as Zip Packs
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                          {fulfillBulkParsedItems.map((item) => (
                            <div
                              key={item.id}
                              className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="overflow-hidden space-y-1 flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {fulfillBulkMediaType === 'movie' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextCat: CustomLink['category'] =
                                          item.category === 'Download' ? 'Streaming' : item.category === 'Streaming' ? 'Subtitles' : 'Download';
                                        setFulfillBulkParsedItems((prev) =>
                                          prev.map((i) => (i.id === item.id ? { ...i, category: nextCat } : i))
                                        );
                                      }}
                                      className="px-2 py-0.5 rounded font-black text-[9px] font-mono transition-all hover:scale-105 bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                      title="Click to toggle category (Download / Streaming / Subtitles)"
                                    >
                                      {item.category === 'Download' ? '📥 DOWNLOAD' : item.category === 'Subtitles' ? '🌐 SUBTITLES' : '🎬 STREAMING'}
                                    </button>
                                  ) : (
                                    <>
                                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-black text-[9px] font-mono">
                                        S0{item.seasonNumber}
                                      </span>

                                      <button
                                        type="button"
                                        onClick={() => handleFulfillToggleBulkItemType(item.id)}
                                        className={`px-2 py-0.5 rounded font-black text-[9px] font-mono transition-all hover:scale-105 ${
                                          item.linkType === 'zip_pack'
                                            ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40'
                                            : 'bg-sky-500/30 text-sky-200 border border-sky-500/40'
                                        }`}
                                        title="Click to toggle between Episode and Zip Pack"
                                      >
                                        {item.linkType === 'zip_pack'
                                          ? '🗜️ ZIP PACK (Click to switch)'
                                          : `📥 EP ${item.episodeNumber ? (item.episodeNumber < 10 ? '0' + item.episodeNumber : item.episodeNumber) : '?'} (Click to switch)`}
                                      </button>
                                    </>
                                  )}
                                </div>
                                <p className="font-bold text-white truncate text-[11px]">{item.title}</p>
                                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                                  <span className="font-semibold text-amber-400/90">{item.quality}</span>
                                  {item.audioLanguage && <span>• {item.audioLanguage}</span>}
                                  {item.size && <span className="text-zinc-500 font-mono">• {item.size}</span>}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setFulfillBulkParsedItems((prev) => prev.filter((i) => i.id !== item.id))}
                                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                                title="Remove"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setFulfillingRequest(null)}
                        disabled={isFulfillingSubmit}
                        className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleFulfillBulkSubmit}
                        disabled={isFulfillingSubmit || fulfillBulkParsedItems.length === 0}
                        className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs shadow-lg shadow-amber-500/25 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                      >
                        <ListPlus className="w-4 h-4" />
                        <span>{isFulfillingSubmit ? 'Importing Links...' : `🚀 Fulfill & Import All (${fulfillBulkParsedItems.length}) Links`}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* ----------------- MODE 3: EPISODE GRID ----------------- */}
                {fulfillMode === 'grid' && (
                  <div className="space-y-4 pt-1 animate-fadeIn">
                    {/* Season & Episode Count Selector */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-zinc-900/90 p-4 rounded-2xl border border-zinc-800/80">
                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">Target Season:</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={fulfillGridSeason}
                          onChange={(e) => {
                            const s = Math.max(1, parseInt(e.target.value) || 1);
                            setFulfillGridSeason(s);
                            syncFulfillGridSlots(fulfillGridEpisodeCount, s, fulfillGridBasePattern, fulfillGridQuality, fulfillGridAudio, fulfillGridSize);
                          }}
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          Episode Count <span className="text-sky-400">({fulfillGridEpisodeCount} Containers)</span>:
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={fulfillGridEpisodeCount}
                            onChange={(e) => {
                              const c = Math.max(1, parseInt(e.target.value) || 1);
                              setFulfillGridEpisodeCount(c);
                              syncFulfillGridSlots(c, fulfillGridSeason, fulfillGridBasePattern, fulfillGridQuality, fulfillGridAudio, fulfillGridSize);
                            }}
                            className="w-20 bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-sky-500"
                          />
                          <div className="flex flex-wrap items-center gap-1">
                            {[6, 8, 10, 12, 16, 24].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => {
                                  setFulfillGridEpisodeCount(n);
                                  syncFulfillGridSlots(n, fulfillGridSeason, fulfillGridBasePattern, fulfillGridQuality, fulfillGridAudio, fulfillGridSize);
                                }}
                                className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                                  fulfillGridEpisodeCount === n
                                    ? 'bg-sky-500 text-black shadow-md'
                                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">Default Quality:</label>
                        <input
                          type="text"
                          value={fulfillGridQuality}
                          onChange={(e) => setFulfillGridQuality(e.target.value)}
                          placeholder="e.g. 2160p 4K, 1080p WEB-DL"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">Default Audio:</label>
                        <input
                          type="text"
                          value={fulfillGridAudio}
                          onChange={(e) => setFulfillGridAudio(e.target.value)}
                          placeholder="e.g. Hindi + English 5.1"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    {/* Base Pattern Template & URL Distributor */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-zinc-300 block">
                            Title Pattern Template <span className="text-zinc-500 font-normal">(Tokens: {'{title}'}, {'{season}'}, {'{ep}'}, {'{quality}'}, {'{audio}'})</span>:
                          </label>
                          <button
                            type="button"
                            onClick={handleFulfillApplyPatternToAll}
                            className="text-[10px] text-sky-400 hover:text-sky-300 font-bold bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/30 transition-colors"
                          >
                            ⚡ Apply Pattern to All Titles
                          </button>
                        </div>
                        <input
                          type="text"
                          value={fulfillGridBasePattern}
                          onChange={(e) => setFulfillGridBasePattern(e.target.value)}
                          placeholder="{title} S{season}E{ep} {quality} [{audio}]"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-zinc-300 block">
                            Paste Multiple URLs to Auto-Distribute into Containers:
                          </label>
                          <span className="text-[10px] text-zinc-500">1 URL per line</span>
                        </div>
                        <textarea
                          rows={2}
                          value={fulfillGridBulkLinksText}
                          onChange={(e) => handleFulfillDistributeGridUrls(e.target.value)}
                          placeholder="Paste up to 8+ links here (one per line) — auto-fills into Link containers below!"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono resize-none shadow-inner"
                        />
                      </div>
                    </div>

                    {/* The N Title and N Link Containers Grid */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                          Episode Containers ({fulfillGridEpisodes.length} Episodes):
                        </span>
                        <span className="text-[11px] text-zinc-400 font-mono">
                          Filled: <strong className="text-sky-400">{fulfillGridEpisodes.filter((e) => e.url.trim()).length}</strong> / {fulfillGridEpisodes.length} Links
                        </span>
                      </div>

                      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                        {fulfillGridEpisodes.map((ep) => (
                          <div
                            key={ep.episodeNumber}
                            className={`p-3.5 rounded-2xl border transition-all ${
                              ep.url.trim()
                                ? 'bg-zinc-900/90 border-sky-500/40 shadow-sm'
                                : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                              {/* Badge */}
                              <div className="md:col-span-2 flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-xl bg-sky-500/20 text-sky-300 font-black text-xs font-mono border border-sky-500/30 whitespace-nowrap">
                                  EP {ep.episodeNumber < 10 ? `0${ep.episodeNumber}` : ep.episodeNumber}
                                </span>
                              </div>

                              {/* Title Input */}
                              <div className="md:col-span-5">
                                <input
                                  type="text"
                                  value={ep.title}
                                  onChange={(e) => handleFulfillUpdateGridSlot(ep.episodeNumber, 'title', e.target.value)}
                                  placeholder="Episode Title..."
                                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-medium"
                                />
                              </div>

                              {/* URL Input */}
                              <div className="md:col-span-5">
                                <input
                                  type="text"
                                  value={ep.url}
                                  onChange={(e) => handleFulfillUpdateGridSlot(ep.episodeNumber, 'url', e.target.value)}
                                  placeholder="https://hubcloud.foo/video/... or GDFlix URL"
                                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-sky-500"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setFulfillingRequest(null)}
                        disabled={isFulfillingSubmit}
                        className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleFulfillGridSubmit}
                        disabled={isFulfillingSubmit || fulfillGridEpisodes.filter((e) => e.url.trim()).length === 0}
                        className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-sky-500/25 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                      >
                        <Zap className="w-4 h-4" />
                        <span>{isFulfillingSubmit ? 'Saving Episodes...' : `🚀 Fulfill & Save All (${fulfillGridEpisodes.filter((e) => e.url.trim()).length}) Episode Containers`}</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 2. Admin Replace Defective Link Modal with Title Mismatch & Editable URL Controls */}
      {fixingReport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div
            className="relative w-full max-w-lg bg-[#0d111a] border border-rose-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setFixingReport(null)}
              className="absolute top-5 right-5 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-3.5 pr-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 text-black flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/20 font-black">
                <Wrench className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 uppercase">
                    {fixingReport.issueLabel}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${replaceTargetMediaType === 'tv' ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'}`}>
                    {replaceTargetMediaType === 'tv' ? 'TV SERIES' : 'MOVIE'}
                  </span>
                </div>
                <h3 className="text-lg font-black text-white leading-tight">
                  Replace Defective Link
                </h3>
                <p className="text-xs text-zinc-400">
                  Target: <strong className="text-white">{replaceTargetTitle || fixingReport.mediaTitle}</strong> (ID: {replaceTargetMovieId || fixingReport.movieId})
                </p>
              </div>
            </div>

            {fixSuccessMsg ? (
              <div className="p-6 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-sm font-bold text-white">{fixSuccessMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitFixReplacement} className="space-y-3.5 text-left">
                {/* Title Mismatch / Reassign Media Box (Addresses "this is a movie not a tv series") */}
                <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-700/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                      <span>Title Mismatch?</span>
                      <span className="text-[11px] text-amber-400 font-normal">
                        ({replaceTargetMediaType === 'tv' ? 'Reported as TV Series' : 'Reported as Movie'})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsChangingTarget(!isChangingTarget)}
                      className="text-xs text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
                    >
                      {isChangingTarget ? '✕ Close Reassign' : '⇄ Fix Mismatch / Reassign'}
                    </button>
                  </div>

                  {isChangingTarget && (
                    <div className="pt-2 border-t border-zinc-800 space-y-2.5 animate-fadeIn">
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        If this title was mistakenly reported or uploaded as a TV series instead of a Movie (or vice versa), switch type and reassign below:
                      </p>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-400 font-semibold">Change Media Type:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setReplaceTargetMediaType('movie');
                            // Clean release title: strip Season/Episode if converting to movie
                            setReplaceTitle((prev) =>
                              prev
                                .replace(/Season\s*\d+\s*Episode\s*\d+/gi, '')
                                .replace(/S\d+E\d+/gi, '')
                                .trim()
                            );
                          }}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                            replaceTargetMediaType === 'movie'
                              ? 'bg-amber-500 text-black shadow-md'
                              : 'bg-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          🎬 Movie
                        </button>
                        <button
                          type="button"
                          onClick={() => setReplaceTargetMediaType('tv')}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                            replaceTargetMediaType === 'tv'
                              ? 'bg-sky-500 text-black shadow-md'
                              : 'bg-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          📺 TV Series
                        </button>
                      </div>

                      {/* Live TMDB Reassign Search */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-zinc-400 block">
                          Search Correct Title or enter TMDB ID:
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="e.g. War (2019) or enter TMDB ID 585268..."
                            value={reassignSearchQuery}
                            onChange={(e) => setReassignSearchQuery(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 font-mono"
                          />
                          {isSearchingReassign && (
                            <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                          )}
                        </div>

                        {/* Search results dropdown for reassign */}
                        {reassignSearchResults.length > 0 && (
                          <div className="max-h-36 overflow-y-auto divide-y divide-zinc-800 bg-black/80 rounded-xl border border-zinc-700 mt-1">
                            {reassignSearchResults.map((t) => {
                              const title = t.title || t.name || 'Untitled';
                              const year = (t.release_date || t.first_air_date || '').split('-')[0];
                              const type = (t.media_type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';

                              return (
                                <button
                                  key={`${type}-${t.id}`}
                                  type="button"
                                  onClick={() => {
                                    setReplaceTargetTitle(title);
                                    setReplaceTargetMovieId(t.id);
                                    setReplaceTargetMediaType(type);
                                    if (type === 'movie') {
                                      setReplaceTitle((prev) =>
                                        prev
                                          .replace(/Season\s*\d+\s*Episode\s*\d+/gi, '')
                                          .replace(/S\d+E\d+/gi, '')
                                          .trim()
                                      );
                                    }
                                    setReassignSearchQuery('');
                                    setReassignSearchResults([]);
                                    setIsChangingTarget(false);
                                  }}
                                  className="w-full text-left p-2 hover:bg-zinc-800 flex items-center justify-between text-xs transition-colors"
                                >
                                  <div className="truncate">
                                    <span className="font-bold text-white">{title}</span>
                                    {year && <span className="text-zinc-400 ml-1.5 font-mono">({year})</span>}
                                  </div>
                                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.2 rounded font-bold shrink-0 ml-2 ${
                                    type === 'tv' ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'
                                  }`}>
                                    {type} • ID: {t.id}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Current Defective URL Info with 1-Click "Edit / Copy" and "Test Link" */}
                <div className="p-3.5 rounded-2xl bg-black/60 border border-zinc-800 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Current Defective URL:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReplaceUrl(fixingReport.reportedUrl)}
                        className="text-[11px] px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 font-bold transition-colors flex items-center gap-1 cursor-pointer"
                        title="Load this defective URL into the input field below to fix typos or modify it directly"
                      >
                        <Edit className="w-3 h-3" /> Edit / Copy to Input
                      </button>
                      <a
                        href={fixingReport.reportedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] px-2.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 transition-colors flex items-center gap-1"
                        title="Test whether this link opens or 404s"
                      >
                        <ExternalLink className="w-3 h-3" /> Test Link ↗
                      </a>
                    </div>
                  </div>
                  <div
                    className="font-mono text-zinc-300 text-[11px] break-all bg-black/40 p-2 rounded-xl border border-white/5 select-all"
                    title={fixingReport.reportedUrl}
                  >
                    {fixingReport.reportedUrl}
                  </div>
                </div>

                {/* Working Link URL Input (Pre-filled so admin can edit directly or replace) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                    <span>Working Link / Replacement URL *</span>
                    <span className="text-[10px] text-emerald-400 font-mono">Direct / Mirror CDN</span>
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://hubcloud.club/drive/... or https://gdflix..."
                    value={replaceUrl}
                    onChange={(e) => setReplaceUrl(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-rose-400 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none transition-all"
                    autoFocus
                  />
                  <p className="text-[10px] text-zinc-500">
                    💡 You can edit the URL directly above to fix typos, or replace it with a fresh working mirror.
                  </p>
                </div>

                {/* Link Title */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-300">Link Title / Release Tag</label>
                  <input
                    type="text"
                    value={replaceTitle}
                    onChange={(e) => setReplaceTitle(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-rose-400 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono"
                  />
                </div>

                {/* Quality, Audio, Size */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Quality</label>
                    <input
                      type="text"
                      placeholder="e.g. 1080p, 4K"
                      value={replaceQuality}
                      onChange={(e) => setReplaceQuality(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Audio</label>
                    <input
                      type="text"
                      placeholder="e.g. Hindi + Eng"
                      value={replaceAudio}
                      onChange={(e) => setReplaceAudio(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Size</label>
                    <input
                      type="text"
                      placeholder="e.g. 2.4 GB"
                      value={replaceSize}
                      onChange={(e) => setReplaceSize(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                {/* Admin Note */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-300">Resolution Note</label>
                  <input
                    type="text"
                    value={replaceAdminNote}
                    onChange={(e) => setReplaceAdminNote(e.target.value)}
                    placeholder="e.g. Fixed with clean 1080p GDFlix mirror."
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-rose-400 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>

                {/* Database update toggle */}
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateDbWithReplacement}
                    onChange={(e) => setUpdateDbWithReplacement(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 accent-rose-500"
                  />
                  <span>
                    Auto-update in live database so visitors get the new working link immediately.
                  </span>
                </label>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setFixingReport(null)}
                    disabled={isFixingSubmit}
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isFixingSubmit}
                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500 hover:from-rose-400 hover:to-amber-400 text-black font-black text-xs shadow-lg shadow-rose-500/25 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>{isFixingSubmit ? 'Applying Replacement...' : 'Save & Mark as Fixed'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Admin Reply Modal (for Requests & Reports) */}
      {adminReplyTarget && (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-[#0f131d] border border-amber-500/40 rounded-3xl p-5 sm:p-7 max-w-lg w-full space-y-4 shadow-2xl animate-scaleIn my-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">
                    Reply to {adminReplyTarget.type === 'request' ? 'Request' : 'Report'}
                  </h4>
                  <p className="text-xs text-zinc-400 truncate max-w-[260px] sm:max-w-xs font-semibold">
                    {adminReplyTarget.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminReplyTarget(null)}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {adminReplyTarget.userEmail && (
              <div className="text-xs text-zinc-400 flex items-center gap-1.5 bg-zinc-900/60 px-3 py-2 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 font-semibold">Recipient:</span>
                <span className="text-amber-400 font-mono font-medium">{adminReplyTarget.userEmail}</span>
              </div>
            )}

            <form onSubmit={handleSendAdminReply} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                  <span>Your Admin Message</span>
                  <span className="text-[10px] text-zinc-500 font-normal">Notifies user on site &amp; Telegram</span>
                </label>
                <textarea
                  value={adminReplyText}
                  onChange={(e) => setAdminReplyText(e.target.value)}
                  placeholder="Type your message to the user here..."
                  rows={4}
                  required
                  className="w-full p-3 rounded-2xl bg-zinc-900 border border-zinc-700 focus:border-amber-500 text-sm text-white placeholder-zinc-500 focus:outline-none transition-colors resize-none"
                />
              </div>

              {/* Quick suggestion template chips */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Quick Templates:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Uploaded in 1080p Dual Audio! Enjoy watching.',
                    'Link verified and replaced with a high-speed working mirror.',
                    'Digital/OTT release expected soon. Added to priority queue.',
                    'Could not find clean audio copy yet. Staying monitored.',
                  ].map((tmpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAdminReplyText(tmpl)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 text-[11px] text-zinc-300 hover:text-white transition-colors text-left"
                    >
                      {tmpl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setAdminReplyTarget(null)}
                  disabled={isSendingReply}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingReply || !adminReplyText.trim()}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs shadow-lg shadow-amber-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{isSendingReply ? 'Sending Reply...' : 'Send Reply & Notify'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Manual Custom Title Creation Modal (For titles not found on TMDB) */}
      {isManualTitleModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div
            className="relative w-full max-w-md bg-[#0d111a] border border-amber-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Create Custom Title
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsManualTitleModalOpen(false)}
                className="text-zinc-400 hover:text-white text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              If TMDB catalog does not have your title, create a custom entry here to manage and attach links directly:
            </p>

            <form onSubmit={handleCreateManualTitle} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-semibold text-zinc-300 block mb-1">
                  Title Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. War (2019) or Mirzapur Season 3"
                  value={manualTitleName}
                  onChange={(e) => setManualTitleName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-zinc-300 block mb-1">Media Type *</label>
                  <select
                    value={manualMediaType}
                    onChange={(e) => setManualMediaType(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-semibold"
                  >
                    <option value="movie">🎬 Movie</option>
                    <option value="tv">📺 TV Series</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-300 block mb-1">Release Year</label>
                  <input
                    type="text"
                    placeholder="e.g. 2024"
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-300 block mb-1">
                  Poster Image URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://... (image url or leave blank)"
                  value={manualPoster}
                  onChange={(e) => setManualPoster(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsManualTitleModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-xs hover:scale-105 transition-all shadow-md cursor-pointer"
                >
                  Save & Select Title ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. DEDICATED TITLE MANAGER & WHOLE LINK REPLACEMENT MODAL */}
      {/* ========================================================= */}
      {titleManagerModalOpen && managingTitle && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={handleCloseTitleManager}
        >
          <div
            className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#0b0e17] border border-amber-500/30 rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                {/* Short Poster Thumbnail with Fallback */}
                <div className="w-14 h-20 sm:w-16 sm:h-22 rounded-xl bg-zinc-800 relative overflow-hidden shrink-0 border border-white/10 shadow-lg">
                  <img
                    src={getImageURL(managingTitle.poster_path, 'w200')}
                    alt={managingTitle.title}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/placeholder-poster.svg';
                    }}
                    className="w-full h-full object-cover"
                  />
                  <div className={`absolute top-1 left-1 px-1.5 py-0.2 rounded text-[9px] font-black font-mono shadow ${
                    managingTitle.media_type === 'tv' ? 'bg-sky-500 text-black' : 'bg-amber-400 text-black'
                  }`}>
                    {managingTitle.media_type === 'tv' ? 'TV' : 'MOVIE'}
                  </div>
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-white truncate max-w-md">
                      {managingTitle.title}
                    </h3>
                    {managingTitle.year && (
                      <span className="text-xs text-zinc-400 font-mono">({managingTitle.year})</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30 font-mono text-[11px]">
                      🔥 {managingTitleLinks.length} Active Link{managingTitleLinks.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-zinc-500 font-mono text-[11px]">
                      TMDB ID: {managingTitle.id}
                    </span>
                    <a
                      href={`/${managingTitle.media_type}/${managingTitle.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> View on Cinefuel
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setTitleManagerTab('edit_title')}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    titleManagerTab === 'edit_title'
                      ? 'bg-purple-500 text-white border-purple-400 shadow-md shadow-purple-500/30'
                      : 'bg-purple-500/15 hover:bg-purple-500/25 border-purple-500/30 text-purple-300'
                  }`}
                  title="Fix / Edit title name, release year, ID, and poster without TMDB search"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Fix Title & ID</span>
                </button>

                <button
                  type="button"
                  onClick={handleCloseTitleManager}
                  className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center gap-1 px-5 pt-3 border-b border-zinc-800 bg-zinc-950/40 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setTitleManagerTab('view')}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  titleManagerTab === 'view'
                    ? 'border-amber-400 text-amber-300 bg-zinc-900/80'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Current Links</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 font-mono">
                  {managingTitleLinks.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTitleManagerTab('edit_title')}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  titleManagerTab === 'edit_title'
                    ? 'border-purple-400 text-purple-300 bg-zinc-900/80 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Edit className="w-3.5 h-3.5 text-purple-400" />
                <span>✏️ Fix / Edit Title & ID</span>
              </button>

              <button
                type="button"
                onClick={() => setTitleManagerTab('replace')}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  titleManagerTab === 'replace'
                    ? 'border-cyan-400 text-cyan-300 bg-zinc-900/80 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>⚡ Change Whole Links (Batch Replace)</span>
              </button>

              <button
                type="button"
                onClick={() => setTitleManagerTab('add')}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  titleManagerTab === 'add'
                    ? 'border-emerald-400 text-emerald-300 bg-zinc-900/80'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Single Link</span>
              </button>

              <button
                type="button"
                onClick={() => setTitleManagerTab('domain')}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  titleManagerTab === 'domain'
                    ? 'border-purple-400 text-purple-300 bg-zinc-900/80'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Migrate Domain</span>
              </button>

              {managingTitle.media_type === 'tv' && (
                <button
                  type="button"
                  onClick={() => setTitleManagerTab('trakt_episodes')}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2 cursor-pointer ${
                    titleManagerTab === 'trakt_episodes'
                      ? 'border-indigo-400 text-indigo-300 bg-zinc-900/80 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5 text-indigo-400" />
                  <span>📺 Trakt Episode Titles</span>
                </button>
              )}
            </div>

            {/* Modal Body with Scrolling */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              {/* TAB 1: VIEW / CURRENT LINKS */}
              {titleManagerTab === 'view' && (
                <div className="space-y-4">
                  {/* Filter & Refresh Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-64">
                      <input
                        type="text"
                        placeholder="Filter links, episodes, quality..."
                        value={titleLinksSearch}
                        onChange={(e) => setTitleLinksSearch(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                      />
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      {titleLinksSearch && (
                        <button
                          type="button"
                          onClick={() => setTitleLinksSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => fetchTitleLinks(managingTitle.id)}
                        disabled={isLoadingManagingLinks}
                        className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingManagingLinks ? 'animate-spin text-amber-400' : ''}`} />
                        <span>Refresh Links</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTitleManagerTab('replace')}
                        className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Change Whole Set</span>
                      </button>
                    </div>
                  </div>

                  {/* Links Loading */}
                  {isLoadingManagingLinks && (
                    <div className="py-8 flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
                      <span className="text-xs text-zinc-400 font-mono">Fetching links for {managingTitle.title}...</span>
                    </div>
                  )}

                  {/* Empty Links State */}
                  {!isLoadingManagingLinks && managingTitleLinks.length === 0 && (
                    <div className="py-12 text-center space-y-3 bg-zinc-900/40 rounded-2xl border border-zinc-800">
                      <Link2 className="w-8 h-8 text-zinc-600 mx-auto" />
                      <p className="text-xs text-zinc-400">No custom links currently saved for this title.</p>
                      <button
                        type="button"
                        onClick={() => setTitleManagerTab('replace')}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xs hover:scale-105 transition-all shadow-md cursor-pointer"
                      >
                        ⚡ Paste & Replace Links Now
                      </button>
                    </div>
                  )}

                  {/* List of Links */}
                  {!isLoadingManagingLinks && managingTitleLinks.length > 0 && (
                    <div className="space-y-2">
                      {managingTitleLinks
                        .filter((l) => {
                          if (!titleLinksSearch.trim()) return true;
                          const q = titleLinksSearch.trim().toLowerCase();
                          return (
                            (l.title || '').toLowerCase().includes(q) ||
                            (l.quality || '').toLowerCase().includes(q) ||
                            (l.audioLanguage || '').toLowerCase().includes(q) ||
                            (l.url || '').toLowerCase().includes(q) ||
                            (typeof l.episodeNumber === 'number' && String(l.episodeNumber).includes(q))
                          );
                        })
                        .map((link, idx) => (
                          <div
                            key={link.id || idx}
                            className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors"
                          >
                            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                              <span className="font-mono text-zinc-500 text-[10px] w-6 shrink-0 text-right">
                                #{idx + 1}
                              </span>

                              {managingTitle.media_type === 'tv' && (
                                <span className="px-2 py-0.5 rounded-lg bg-sky-500/20 text-sky-300 font-mono font-bold text-[10px] shrink-0 border border-sky-500/30">
                                  S{link.seasonNumber || 1}E{link.episodeNumber || 1}
                                </span>
                              )}

                              <div className="min-w-0 space-y-0.5 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-white block truncate" title={link.title}>
                                    {link.title}
                                  </span>
                                  {link.episodeTitle && (
                                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold border border-indigo-500/30">
                                      ✨ {link.episodeTitle}
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-[11px] text-zinc-400 truncate block max-w-md" title={link.url}>
                                  {link.url}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                              {managingTitle.media_type === 'tv' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTraktSeason(link.seasonNumber || 1);
                                    setTraktEpisode(link.episodeNumber || 1);
                                    setTitleManagerTab('trakt_episodes');
                                    handleFetchTraktEpisode(link.seasonNumber || 1, link.episodeNumber || 1);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Fetch or Edit episode title with Trakt"
                                >
                                  <Tv className="w-3 h-3" />
                                  <span>Trakt</span>
                                </button>
                              )}

                              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-mono font-bold text-[10px] border border-amber-500/20">
                                {link.quality || '1080p'}
                              </span>

                              <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-[10px]">
                                {link.audioLanguage || 'Hindi'}
                              </span>

                              <button
                                type="button"
                                onClick={() => setInspectingLink(link)}
                                className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                                title="Inspect link metadata & diagnostics"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              <a
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                                title="Test link in new tab"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>

                              <button
                                type="button"
                                disabled={deletingLinkId === link.id}
                                onClick={() => setLinkToDelete({ id: link.id, title: link.title, url: link.url, movieId: managingTitle.id })}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete this link"
                              >
                                {deletingLinkId === link.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Danger Zone: Delete Entire Title */}
                  <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">
                      Need to permanently delete this movie/series title and its links?
                    </span>
                    <button
                      type="button"
                      disabled={isDeletingAllLinks}
                      onClick={() => {
                        setTitleToDelete(managingTitle);
                        setDeleteTitleConfirmChecked(false);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeletingAllLinks ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      <span>Delete Entire Title ({managingTitleLinks.length} Links)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: CHANGE WHOLE LINKS (BATCH REPLACE / OVERWRITE) */}
              {titleManagerTab === 'replace' && (
                <div className="space-y-4">
                  {/* Instructions Banner */}
                  <div className="p-4 rounded-2xl bg-cyan-950/25 border border-cyan-500/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-black text-cyan-300 uppercase tracking-wider">
                        Batch Overhaul & Whole Link Replacement Engine
                      </h4>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      Easily replace or overhaul every link for <strong className="text-white">{managingTitle.title}</strong> at once.
                      Paste your complete list of new links below in any format (e.g., pipe separated, S01E01 notation, or plain URLs).
                    </p>
                  </div>

                  {/* Mode Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      onClick={() => setReplaceLinksMode('replace')}
                      className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                        replaceLinksMode === 'replace'
                          ? 'bg-cyan-500/10 border-cyan-500 text-white shadow-md'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="replace_mode"
                        checked={replaceLinksMode === 'replace'}
                        onChange={() => setReplaceLinksMode('replace')}
                        className="mt-0.5 accent-cyan-400"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-black text-cyan-300 block">
                          ⚡ Overwrite / Replace All Links (Recommended)
                        </span>
                        <span className="text-[11px] text-zinc-400 block leading-tight">
                          All {managingTitleLinks.length} existing link(s) will be wiped and replaced with the new list.
                        </span>
                      </div>
                    </label>

                    <label
                      onClick={() => setReplaceLinksMode('append')}
                      className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                        replaceLinksMode === 'append'
                          ? 'bg-amber-500/10 border-amber-500 text-white shadow-md'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="replace_mode"
                        checked={replaceLinksMode === 'append'}
                        onChange={() => setReplaceLinksMode('append')}
                        className="mt-0.5 accent-amber-400"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-black text-amber-300 block">
                          ➕ Append to Existing Links
                        </span>
                        <span className="text-[11px] text-zinc-400 block leading-tight">
                          Preserve the current {managingTitleLinks.length} link(s) and append new ones to the bottom.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Raw Textarea */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-300">
                        Paste Raw Links * (Any format: Title | URL | Quality, S01E01 notation, or plain URLs)
                      </label>
                      {replaceRawLinksText && (
                        <button
                          type="button"
                          onClick={() => setReplaceRawLinksText('')}
                          className="text-[11px] text-zinc-500 hover:text-zinc-300"
                        >
                          Clear Input
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={7}
                      value={replaceRawLinksText}
                      onChange={(e) => setReplaceRawLinksText(e.target.value)}
                      placeholder={`Format Examples:
1. Title | URL | Quality | Audio
   ${managingTitle.title} Episode 01 | https://faststream.to/e01 | 1080p | Hindi + English
   ${managingTitle.title} Episode 02 | https://faststream.to/e02 | 1080p | Hindi + English

2. S01E01: URL
   S01E01: https://faststream.to/s1e1
   S01E02: https://faststream.to/s1e2

3. Plain URLs (one per line):
   https://faststream.to/link1
   https://faststream.to/link2`}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-3.5 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 resize-y leading-relaxed"
                    />
                  </div>

                  {/* Live Parsed Preview */}
                  {replaceParsedItems.length > 0 && (
                    <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-cyan-400" />
                          Parsed {replaceParsedItems.length} Link{replaceParsedItems.length !== 1 ? 's' : ''} Ready to Insert
                        </span>
                        <span className="text-[11px] text-zinc-400 font-mono">
                          {replaceLinksMode === 'replace' ? 'Will replace entire link set' : 'Will append to existing'}
                        </span>
                      </div>

                      <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                        {replaceParsedItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-zinc-500 text-[10px]">#{idx + 1}</span>
                              {item.seasonNumber && item.episodeNumber && (
                                <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-mono font-bold text-[10px]">
                                  S{item.seasonNumber}E{item.episodeNumber}
                                </span>
                              )}
                              <span className="font-semibold text-white truncate max-w-xs">{item.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px]">
                                {item.quality}
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 text-[10px]">
                                {item.audioLanguage}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feedback Messages */}
                  {replaceSuccessMsg && (
                    <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{replaceSuccessMsg}</span>
                    </div>
                  )}
                  {replaceErrorMsg && (
                    <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{replaceErrorMsg}</span>
                    </div>
                  )}

                  {/* Big Overwrite / Execute Button */}
                  <button
                    type="button"
                    onClick={handleExecuteWholeLinkReplacement}
                    disabled={isReplacingLinks || replaceParsedItems.length === 0}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
                  >
                    {isReplacingLinks ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Updating Links in MongoDB & Cloud Database...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-amber-300" />
                        <span>
                          {replaceLinksMode === 'replace'
                            ? `⚡ Overwrite All Links for "${managingTitle.title}" (${replaceParsedItems.length} Links)`
                            : `➕ Append ${replaceParsedItems.length} Links to "${managingTitle.title}"`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* TAB 3: ADD SINGLE LINK */}
              {titleManagerTab === 'add' && (
                <form onSubmit={handleAddSingleTitleLink} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-300">Link Title *</label>
                    <input
                      type="text"
                      required
                      value={titleAddLinkTitle}
                      onChange={(e) => setTitleAddLinkTitle(e.target.value)}
                      placeholder="e.g. S01E01 or 1080p WEB-DL"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-300">Target URL / Stream Link *</label>
                    <input
                      type="url"
                      required
                      value={titleAddLinkUrl}
                      onChange={(e) => setTitleAddLinkUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Quality</label>
                      <select
                        value={titleAddLinkQuality}
                        onChange={(e) => setTitleAddLinkQuality(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="4K">4K 2160p</option>
                        <option value="1080p">1080p FHD</option>
                        <option value="720p">720p HD</option>
                        <option value="480p">480p SD</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Audio</label>
                      <input
                        type="text"
                        value={titleAddLinkAudio}
                        onChange={(e) => setTitleAddLinkAudio(e.target.value)}
                        placeholder="e.g. Hindi + English"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {managingTitle.media_type === 'tv' && (
                      <>
                        <div>
                          <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Season #</label>
                          <input
                            type="number"
                            min={1}
                            value={titleAddLinkSeason}
                            onChange={(e) => setTitleAddLinkSeason(Number(e.target.value))}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Episode #</label>
                          <input
                            type="number"
                            min={1}
                            value={titleAddLinkEpisode}
                            onChange={(e) => setTitleAddLinkEpisode(Number(e.target.value))}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isAddingSingleTitleLink}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs hover:scale-105 transition-all shadow-md disabled:opacity-50 cursor-pointer"
                    >
                      {isAddingSingleTitleLink ? 'Adding Link...' : '+ Add Link to Title'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 4: MIGRATE DOMAIN */}
              {titleManagerTab === 'domain' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-purple-950/25 border border-purple-500/30 space-y-1">
                    <h4 className="text-xs font-bold text-purple-300">
                      Title-Specific Domain Migration
                    </h4>
                    <p className="text-xs text-zinc-400">
                      Migrate links matching an old domain exclusively for <strong className="text-white">{managingTitle.title}</strong> without altering other titles in your database.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-300">Old Domain *</label>
                      <input
                        type="text"
                        placeholder="e.g. faststream.to"
                        value={titleOldDomain}
                        onChange={(e) => setTitleOldDomain(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-300">New Domain *</label>
                      <input
                        type="text"
                        placeholder="e.g. streamwish.to"
                        value={titleNewDomain}
                        onChange={(e) => setTitleNewDomain(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400"
                      />
                    </div>
                  </div>

                  {titleDomainMsg && (
                    <p className="text-xs font-mono font-bold text-purple-300 bg-purple-500/10 p-3 rounded-xl border border-purple-500/20">
                      {titleDomainMsg}
                    </p>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleReplaceTitleDomain}
                      disabled={isMigratingTitleDomain || !titleOldDomain.trim() || !titleNewDomain.trim()}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold text-xs hover:scale-105 transition-all shadow-md disabled:opacity-40 cursor-pointer"
                    >
                      {isMigratingTitleDomain ? 'Migrating Domain...' : 'Migrate Domain for this Title ➔'}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 5: FIX / EDIT TITLE & REASSIGN LINKS (WITH TMDB SEARCH & SELECTIVE REASSIGNMENT) */}
              {titleManagerTab === 'edit_title' && (
                <div className="space-y-6">
                  {/* TMDB Interactive Search Section */}
                  <div className="bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-purple-950/40 border border-purple-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
                        <Search className="w-4 h-4 text-purple-400" />
                        <span>Search TMDB to Fix Title & Reassign Links</span>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        Authoritative Metadata & Canonical IDs
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={tmdbSearchQuery}
                          onChange={(e) => setTmdbSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSearchTmdbForTitle();
                            }
                          }}
                          placeholder={managingTitle?.title || 'Search movie or TV series on TMDB...'}
                          className="w-full bg-zinc-900/90 border border-purple-500/30 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400"
                        />
                        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSearchTmdbForTitle()}
                        disabled={isSearchingTmdb}
                        className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isSearchingTmdb ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        <span>{isSearchingTmdb ? 'Searching...' : 'Search TMDB'}</span>
                      </button>
                    </div>

                    {tmdbSearchError && (
                      <p className="text-[11px] text-amber-400 font-mono bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                        {tmdbSearchError}
                      </p>
                    )}

                    {/* Candidate Results */}
                    {tmdbSearchResults.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <p className="text-[11px] font-bold text-zinc-300">Matching TMDB Titles:</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                          {tmdbSearchResults.map((candidate) => {
                            const isSelected = proposedTmdbCandidate?.id === candidate.id;
                            const year = (candidate.release_date || candidate.first_air_date || '').slice(0, 4);
                            return (
                              <div
                                key={candidate.id}
                                onClick={() => handleSelectTmdbCandidate(candidate)}
                                className={`p-2 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-purple-900/40 border-purple-400 shadow-md ring-1 ring-purple-400'
                                    : 'bg-zinc-900/70 border-zinc-800 hover:border-purple-500/50'
                                }`}
                              >
                                <div className="w-10 h-14 rounded-lg bg-zinc-800 overflow-hidden shrink-0 border border-white/10">
                                  <img
                                    src={getImageURL(candidate.poster_path, 'w200')}
                                    alt={candidate.title || candidate.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).src = '/placeholder-poster.svg';
                                    }}
                                  />
                                </div>
                                <div className="min-w-0 flex-1 space-y-0.5 text-left">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-white text-xs truncate max-w-[150px]">
                                      {candidate.title || candidate.name}
                                    </span>
                                    {year && <span className="text-[10px] text-zinc-400 font-mono">({year})</span>}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px]">
                                    <span className={`px-1.5 py-0.2 rounded font-black font-mono ${
                                      candidate.media_type === 'tv' ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'
                                    }`}>
                                      {candidate.media_type === 'tv' ? 'TV' : 'MOVIE'}
                                    </span>
                                    <span className="text-zinc-500 font-mono">ID: {candidate.id}</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 ${
                                    isSelected ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-300'
                                  }`}
                                >
                                  {isSelected ? '✓ Selected' : 'Select'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Proposed Mapping Preview & Selective Reassignment */}
                    {proposedTmdbCandidate && (
                      <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/40 space-y-3 pt-3">
                        <div className="flex items-center justify-between text-xs font-bold text-purple-300">
                          <span>Mapping Preview: Current vs Proposed</span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {managingTitleLinks.length} total links available
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 space-y-1">
                            <span className="text-[10px] text-zinc-500 uppercase font-black">Current Title Record</span>
                            <p className="font-bold text-white truncate">{managingTitle.title}</p>
                            <p className="font-mono text-[11px] text-zinc-400">
                              ID: {managingTitle.id} • Type: {managingTitle.media_type.toUpperCase()}
                            </p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-purple-900/30 border border-purple-500/40 space-y-1">
                            <span className="text-[10px] text-purple-400 uppercase font-black">Proposed TMDB Target</span>
                            <p className="font-bold text-purple-200 truncate">
                              {proposedTmdbCandidate.title || proposedTmdbCandidate.name}
                            </p>
                            <p className="font-mono text-[11px] text-purple-300">
                              ID: {proposedTmdbCandidate.id} • Type: {(proposedTmdbCandidate.media_type || 'movie').toUpperCase()}
                            </p>
                          </div>
                        </div>

                        {/* Selective Links Checkboxes */}
                        <div className="space-y-2 pt-2 border-t border-purple-500/20">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-200">
                              Choose which links to reassign ({selectedReassignLinkIds.length} of {managingTitleLinks.length} selected):
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedReassignLinkIds(managingTitleLinks.map(l => l.id))}
                                className="text-[10px] text-purple-400 hover:underline font-bold cursor-pointer"
                              >
                                Select All
                              </button>
                              <span className="text-zinc-600">|</span>
                              <button
                                type="button"
                                onClick={() => setSelectedReassignLinkIds([])}
                                className="text-[10px] text-zinc-400 hover:underline font-bold cursor-pointer"
                              >
                                Deselect All
                              </button>
                            </div>
                          </div>

                          <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                            {managingTitleLinks.map((link) => {
                              const isChecked = selectedReassignLinkIds.includes(link.id);
                              return (
                                <label
                                  key={link.id}
                                  className={`p-2 rounded-lg border flex items-center justify-between gap-2 text-[11px] cursor-pointer transition-colors ${
                                    isChecked
                                      ? 'bg-purple-950/40 border-purple-500/50 text-white'
                                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedReassignLinkIds(prev => [...prev, link.id]);
                                        } else {
                                          setSelectedReassignLinkIds(prev => prev.filter(id => id !== link.id));
                                        }
                                      }}
                                      className="rounded border-zinc-700 text-purple-600 focus:ring-0"
                                    />
                                    <span className="font-bold truncate">{link.title}</span>
                                    <span className="text-[10px] font-mono text-amber-300">[{link.quality || '1080p'}]</span>
                                  </div>
                                  <span className="font-mono text-[10px] text-zinc-500 truncate max-w-[150px] shrink-0">
                                    {link.url}
                                  </span>
                                </label>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={handleReassignSelectedLinks}
                            disabled={isReassigningLinks || selectedReassignLinkIds.length === 0}
                            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isReassigningLinks ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {isReassigningLinks
                                ? 'Reassigning Links...'
                                : `Reassign ${selectedReassignLinkIds.length} Selected Link(s) to ${proposedTmdbCandidate.title || proposedTmdbCandidate.name}`}
                            </span>
                          </button>

                          {reassignMsg && (
                            <p className="text-xs font-mono font-bold text-emerald-300 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                              {reassignMsg}
                            </p>
                          )}
                          {reassignError && (
                            <p className="text-xs font-mono font-bold text-rose-300 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                              {reassignError}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Manual Title Details Form (Preserved for direct edits) */}
                  <form onSubmit={handleSaveTitleMetadata} className="space-y-4 pt-2 border-t border-zinc-800">
                    <div className="bg-purple-950/20 border border-purple-800/40 rounded-2xl p-3.5 text-xs text-purple-200/90 leading-relaxed space-y-1">
                      <p className="font-bold flex items-center gap-1.5 text-purple-300">
                        <Edit className="w-3.5 h-3.5 text-purple-400" />
                        Manual Title Fields & Fallback Customization
                      </p>
                      <p className="text-zinc-400 text-[11px]">
                        You can also fine-tune any field directly below (title name, poster URL, media type, release year) and save.
                      </p>
                    </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Title Name */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-zinc-300">Title Name *</label>
                      <input
                        type="text"
                        required
                        value={editTitleName}
                        onChange={(e) => setEditTitleName(e.target.value)}
                        placeholder="e.g. Special Ops 1.5: The Himmat Story"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400 font-semibold"
                      />
                    </div>

                    {/* Release Year */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-300">Release Year</label>
                      <input
                        type="text"
                        value={editTitleYear}
                        onChange={(e) => setEditTitleYear(e.target.value)}
                        placeholder="e.g. 2021"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400 font-mono"
                      />
                    </div>

                    {/* Media Type */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-300">Media Type *</label>
                      <select
                        value={editTitleMediaType}
                        onChange={(e) => setEditTitleMediaType(e.target.value as 'movie' | 'tv')}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-400"
                      >
                        <option value="tv">TV Series / Web Series (tv)</option>
                        <option value="movie">Movie / Cinema Feature (movie)</option>
                      </select>
                    </div>

                    {/* Movie / Series ID */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                        <span>TMDB / IMDb ID (Current: {managingTitle.id}) *</span>
                        <span className="text-[10px] text-amber-400 font-normal">
                          ⚠️ Changing this remaps all {managingTitleLinks.length} links to the new ID
                        </span>
                      </label>
                      <input
                        type="text"
                        required
                        value={editTitleId}
                        onChange={(e) => setEditTitleId(e.target.value)}
                        placeholder="e.g. 13623632 or tt15849884"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400 font-mono font-bold"
                      />
                    </div>

                    {/* Poster Path / URL */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-zinc-300">Poster Image URL / TMDB Path</label>
                      <div className="flex gap-3 items-center">
                        <div className="w-14 h-20 bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden shrink-0 relative flex items-center justify-center">
                          {editTitlePoster ? (
                            <img
                              src={getImageURL(editTitlePoster, 'w200')}
                              alt="Poster Preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/placeholder-poster.svg';
                              }}
                            />
                          ) : (
                            <Film className="w-5 h-5 text-zinc-600" />
                          )}
                        </div>
                        <div className="flex-1 space-y-1">
                          <input
                            type="text"
                            value={editTitlePoster}
                            onChange={(e) => setEditTitlePoster(e.target.value)}
                            placeholder="e.g. /path.jpg or https://image.tmdb.org/t/p/w500/... or external image URL"
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400 font-mono text-[11px]"
                          />
                          <p className="text-[10px] text-zinc-500">
                            Enter a TMDB poster path (`/abc.jpg`) or any direct image URL (`https://...`).
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Backdrop Path / URL */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-zinc-300">Backdrop Banner URL / TMDB Path (Optional)</label>
                      <input
                        type="text"
                        value={editTitleBackdrop}
                        onChange={(e) => setEditTitleBackdrop(e.target.value)}
                        placeholder="e.g. /backdrop.jpg or https://..."
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400 font-mono text-[11px]"
                      />
                    </div>

                    {/* Overview / Synopsis */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-zinc-300">Plot Summary / Overview (Optional)</label>
                      <textarea
                        rows={3}
                        value={editTitleOverview}
                        onChange={(e) => setEditTitleOverview(e.target.value)}
                        placeholder="Enter title plot synopsis or description..."
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400"
                      />
                    </div>
                  </div>

                  {titleMetaMsg && (
                    <p className="text-xs font-mono font-bold text-emerald-300 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                      {titleMetaMsg}
                    </p>
                  )}

                  {titleMetaError && (
                    <p className="text-xs font-mono font-bold text-rose-300 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                      {titleMetaError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setTitleManagerTab('view')}
                      className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingTitleMeta || !editTitleName.trim() || !editTitleId.trim()}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-bold text-xs shadow-lg shadow-purple-500/20 hover:scale-105 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>{isSavingTitleMeta ? 'Saving Changes...' : 'Save Title Changes'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

              {/* TAB 6: TRAKT TV EPISODE TITLES */}
              {titleManagerTab === 'trakt_episodes' && managingTitle && (
                <div className="space-y-6 animate-fade-in">
                  {/* Info Card */}
                  <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300">
                          <Tv className="w-4 h-4" />
                        </span>
                        <h4 className="text-sm font-bold text-white">Trakt TV Episode Title Lookup & Review</h4>
                      </div>
                      <p className="text-xs text-zinc-300">
                        Retrieve official episode titles via Trakt API v2 and store them cleanly. Existing destination links (URLs) remain strictly intact and protected.
                      </p>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-bold flex items-center gap-1.5 shrink-0">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>URLs 100% Protected</span>
                    </div>
                  </div>

                  {/* Mode Selector */}
                  <div className="flex items-center gap-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800 w-fit">
                    <button
                      type="button"
                      onClick={() => setTraktViewMode('single')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        traktViewMode === 'single'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span>Single Episode Lookup</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTraktViewMode('batch');
                        if (batchEpisodeDiff.length === 0) {
                          handleFetchBatchEpisodeDiff(batchTargetSeason);
                        }
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        traktViewMode === 'batch'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Batch Audit & Auto-Sync (All Episodes)</span>
                    </button>
                  </div>

                  {traktViewMode === 'single' && (
                    <div className="space-y-6">
                  <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* TMDB / Trakt Show ID */}
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          Series TMDB / Show ID
                        </label>
                        <input
                          type="text"
                          value={traktShowId}
                          onChange={(e) => setTraktShowId(e.target.value)}
                          placeholder="e.g. 63351 or tt0903747"
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>

                      {/* Season Number */}
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          Season Number
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={traktSeason}
                          onChange={(e) => setTraktSeason(Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>

                      {/* Episode Number */}
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          Episode Number
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={traktEpisode}
                          onChange={(e) => setTraktEpisode(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleFetchTraktEpisode()}
                        disabled={isTraktLoading}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        {isTraktLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Tv className="w-3.5 h-3.5" />}
                        <span>Fetch Episode Title</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleFetchTraktSeason()}
                        disabled={isTraktLoading}
                        className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs border border-zinc-700 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Fetch All Season {traktSeason} Titles</span>
                      </button>
                    </div>
                  </div>

                  {/* Messages & Alerts */}
                  {traktMsg && (
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{traktMsg}</span>
                    </div>
                  )}

                  {traktError && (
                    <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-semibold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{traktError}</span>
                    </div>
                  )}

                  {/* Review & Manual Correction Workspace */}
                  <div className="p-5 rounded-2xl bg-zinc-900/90 border border-indigo-500/30 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono font-bold text-xs border border-indigo-500/30">
                          S{String(traktSeason).padStart(2, '0')}E{String(traktEpisode).padStart(2, '0')}
                        </span>
                        <h4 className="text-sm font-bold text-white">
                          Episode Title Review & Correction
                        </h4>
                      </div>
                      {traktShowTitle && (
                        <span className="text-xs text-zinc-400 font-medium">
                          Show: {traktShowTitle}
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center justify-between">
                        <span>Verified Episode Title (Editable before saving)</span>
                        <span className="text-[11px] text-zinc-500 font-normal">
                          Manual corrections allowed if lookup fails
                        </span>
                      </label>
                      <input
                        type="text"
                        value={traktFetchedTitle}
                        onChange={(e) => setTraktFetchedTitle(e.target.value)}
                        placeholder="e.g. Pilot, La Gran Mentira, etc."
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-medium shadow-inner"
                      />
                    </div>

                    {traktOverview && (
                      <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-400 space-y-1">
                        <span className="font-bold text-zinc-300 block text-[11px]">Episode Overview:</span>
                        <p className="line-clamp-3 leading-relaxed">{traktOverview}</p>
                      </div>
                    )}

                    {/* Target Episode Links Preview */}
                    <div className="space-y-2 pt-2">
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                        Existing Links for S{traktSeason}E{traktEpisode} ({
                          managingTitleLinks.filter(
                            (l) => Number(l.seasonNumber) === traktSeason && Number(l.episodeNumber) === traktEpisode
                          ).length
                        } found)
                      </span>

                      {managingTitleLinks.filter(
                        (l) => Number(l.seasonNumber) === traktSeason && Number(l.episodeNumber) === traktEpisode
                      ).length === 0 ? (
                        <p className="text-xs text-zinc-500 italic py-1">
                          No existing links found for Season {traktSeason} Episode {traktEpisode} yet. Saving this title will still record it for future episode additions.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {managingTitleLinks
                            .filter(
                              (l) => Number(l.seasonNumber) === traktSeason && Number(l.episodeNumber) === traktEpisode
                            )
                            .map((link) => (
                              <div
                                key={link.id}
                                className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="min-w-0 space-y-0.5 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-zinc-200 truncate">
                                      {link.title}
                                    </span>
                                    {link.episodeTitle && (
                                      <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold border border-indigo-500/30">
                                        ✨ {link.episodeTitle}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono text-[10px] text-zinc-500 truncate block">
                                    {link.url}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono text-[10px]">
                                    {link.quality || '1080p'}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold flex items-center gap-1 border border-emerald-500/20">
                                    <Lock className="w-2.5 h-2.5" /> URL Protected
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                      <button
                        type="button"
                        onClick={() => handleSaveTraktEpisodeTitle()}
                        disabled={isTraktSaving || !traktFetchedTitle.trim()}
                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                      >
                        {isTraktSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Save Episode Title to Database</span>
                      </button>
                    </div>
                  </div>

                  {/* Season-wide episode grid (if retrieved) */}
                  {traktSeasonEpisodes.length > 0 && (
                    <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Layers className="w-4 h-4 text-indigo-400" />
                          <span>Season {traktSeason} Episodes ({traktSeasonEpisodes.length})</span>
                        </h4>
                        <span className="text-xs text-zinc-400">Click any episode to inspect or save</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                        {traktSeasonEpisodes.map((ep) => (
                          <div
                            key={ep.episodeNumber}
                            className={`p-3 rounded-xl border transition-all text-xs flex flex-col justify-between gap-2 ${
                              traktEpisode === ep.episodeNumber
                                ? 'bg-indigo-500/15 border-indigo-500/40'
                                : 'bg-zinc-900/70 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="px-2 py-0.5 rounded bg-zinc-800 text-indigo-300 font-mono font-bold text-[10px] shrink-0">
                                E{ep.episodeNumber}
                              </span>
                              <span className="font-bold text-white truncate flex-1 text-left">
                                {ep.title}
                              </span>
                            </div>
                            {ep.overview && (
                              <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                                {ep.overview}
                              </p>
                            )}
                            <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800/60">
                              <button
                                type="button"
                                onClick={() => {
                                  setTraktEpisode(ep.episodeNumber);
                                  setTraktFetchedTitle(ep.title);
                                  setTraktOverview(ep.overview || '');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold transition-colors cursor-pointer"
                              >
                                Review
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setTraktEpisode(ep.episodeNumber);
                                  setTraktFetchedTitle(ep.title);
                                  setTraktOverview(ep.overview || '');
                                  handleSaveTraktEpisodeTitle(ep.title, traktSeason, ep.episodeNumber);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Quick Save
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

                  {/* BATCH AUDIT & CLEANUP VIEW */}
                  {traktViewMode === 'batch' && (
                    <div className="space-y-5 animate-fade-in">
                      {/* Control Bar: Target Season & Run Audit Button */}
                      <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3 flex-1">
                          <div className="min-w-[140px]">
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                              Target Season
                            </label>
                            <select
                              value={batchTargetSeason}
                              onChange={(e) => {
                                const val = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
                                setBatchTargetSeason(val);
                                handleFetchBatchEpisodeDiff(val);
                              }}
                              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                            >
                              <option value="all">All Seasons</option>
                              {Array.from({ length: 15 }, (_, i) => i + 1).map((s) => (
                                <option key={s} value={s}>
                                  Season {s}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                              Series Show ID / TMDB ID
                            </label>
                            <input
                              type="text"
                              value={traktShowId}
                              onChange={(e) => setTraktShowId(e.target.value)}
                              placeholder={`Default: ${managingTitle.id}`}
                              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                          <button
                            type="button"
                            onClick={() => handleFetchBatchEpisodeDiff(batchTargetSeason)}
                            disabled={isBatchVerifying}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                          >
                            {isBatchVerifying ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            <span>Run Audit & Preview Diff</span>
                          </button>
                        </div>
                      </div>

                      {/* Messages */}
                      {batchApplySuccessMsg && (
                        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{batchApplySuccessMsg}</span>
                        </div>
                      )}

                      {batchApplyErrorMsg && (
                        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-semibold flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>{batchApplyErrorMsg}</span>
                        </div>
                      )}

                      {/* Stats Overview */}
                      {batchEpisodeDiff.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-0.5">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                              Total Episodes
                            </span>
                            <p className="text-lg font-mono font-bold text-white">
                              {batchEpisodeDiff.length}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-0.5">
                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                              Needs Cleanup
                            </span>
                            <p className="text-lg font-mono font-bold text-amber-300">
                              {batchEpisodeDiff.filter((i) => i.status === 'needs_update').length}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-0.5">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                              Already Clean
                            </span>
                            <p className="text-lg font-mono font-bold text-emerald-300">
                              {batchEpisodeDiff.filter((i) => i.status === 'clean').length}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-0.5">
                            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">
                              Unverified
                            </span>
                            <p className="text-lg font-mono font-bold text-rose-300">
                              {batchEpisodeDiff.filter((i) => i.status === 'unverified').length}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Filter & Action Toolbar */}
                      {batchEpisodeDiff.length > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setBatchFilterStatus('all')}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                batchFilterStatus === 'all'
                                  ? 'bg-zinc-800 text-white'
                                  : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              All ({batchEpisodeDiff.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setBatchFilterStatus('needs_update')}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                batchFilterStatus === 'needs_update'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              Needs Update ({batchEpisodeDiff.filter((i) => i.status === 'needs_update').length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setBatchFilterStatus('unverified')}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                batchFilterStatus === 'unverified'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              Unverified ({batchEpisodeDiff.filter((i) => i.status === 'unverified').length})
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <label
                              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer select-none bg-zinc-900/80 px-2.5 py-1.5 rounded-xl border border-zinc-800 hover:border-zinc-700"
                              title="When unchecked, episodes with verified manual title corrections are protected from automatic bulk overwrites."
                            >
                              <input
                                type="checkbox"
                                checked={batchForceOverwrite}
                                onChange={(e) => {
                                  const nextVal = e.target.checked;
                                  setBatchForceOverwrite(nextVal);
                                  handleFetchBatchEpisodeDiff(batchTargetSeason, nextVal);
                                }}
                                className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/40"
                              />
                              <span>Overwrite Manual Corrections</span>
                            </label>

                            <button
                              type="button"
                              onClick={() => handleApplyBatchEpisodeTitles()}
                              disabled={
                                isBatchApplying ||
                                batchEpisodeDiff.filter((i) => i.status === 'needs_update' || i.isVerified).length === 0
                              }
                              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                            >
                              {isBatchApplying ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              <span>
                                Apply Verified Titles ({
                                  batchEpisodeDiff.filter((i) => i.status === 'needs_update' || i.isVerified).length
                                })
                              </span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Diff Items Table */}
                      {batchEpisodeDiff.length > 0 && (
                        <div className="rounded-2xl border border-zinc-800 overflow-hidden bg-zinc-950/80">
                          <div className="overflow-x-auto max-h-[500px]">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-zinc-800 bg-zinc-900/80 text-[10px] font-bold text-zinc-400 uppercase tracking-wider sticky top-0 z-10 backdrop-blur-sm">
                                  <th className="p-3">Episode</th>
                                  <th className="p-3">Current Raw / Stored</th>
                                  <th className="p-3">Proposed Official Title</th>
                                  <th className="p-3">Source</th>
                                  <th className="p-3">Destination URLs</th>
                                  <th className="p-3">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800/60 font-mono">
                                {batchEpisodeDiff
                                  .filter((item) => {
                                    if (batchFilterStatus === 'needs_update') return item.status === 'needs_update';
                                    if (batchFilterStatus === 'unverified') return item.status === 'unverified';
                                    return true;
                                  })
                                  .map((item) => {
                                    const sTag = `S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')}`;
                                    return (
                                      <tr
                                        key={`${item.seasonNumber}-${item.episodeNumber}`}
                                        className="hover:bg-zinc-900/50 transition-colors"
                                      >
                                        <td className="p-3 font-bold text-indigo-300 whitespace-nowrap">
                                          {sTag}
                                        </td>
                                        <td className="p-3 text-zinc-400 max-w-xs truncate" title={item.currentEpisodeTitle || item.sampleReleaseTitle}>
                                          {item.currentEpisodeTitle ? (
                                            <span className="text-zinc-200">{item.currentEpisodeTitle}</span>
                                          ) : (
                                            <span className="text-zinc-500 font-sans italic text-[11px] truncate block">
                                              {item.sampleReleaseTitle}
                                            </span>
                                          )}
                                        </td>
                                        <td className="p-3 min-w-[200px]">
                                          <input
                                            type="text"
                                            value={item.proposedOfficialTitle}
                                            onChange={(e) => {
                                              const newTitle = e.target.value;
                                              setBatchEpisodeDiff((prev) =>
                                                prev.map((it) =>
                                                  it.seasonNumber === item.seasonNumber &&
                                                  it.episodeNumber === item.episodeNumber
                                                    ? {
                                                        ...it,
                                                        proposedOfficialTitle: newTitle,
                                                        proposedHeading: `${sTag} · ${newTitle}`,
                                                        source: 'manual',
                                                        manualTitleVerified: true,
                                                        isVerified: Boolean(newTitle.trim()),
                                                        status: newTitle.trim() ? 'needs_update' : 'unverified',
                                                      }
                                                    : it
                                                )
                                              );
                                            }}
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans font-medium"
                                          />
                                        </td>
                                        <td className="p-3 whitespace-nowrap">
                                          <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                              item.source === 'imdb'
                                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                                : item.source === 'tvmaze'
                                                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                                : item.source === 'tmdb'
                                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                                : item.source === 'trakt'
                                                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                                : item.source === 'manual'
                                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                                : item.source === 'stored'
                                                ? 'bg-zinc-700/50 text-zinc-300 border border-zinc-600/50'
                                                : 'bg-zinc-800 text-zinc-500'
                                            }`}
                                          >
                                            {item.source.toUpperCase()}
                                          </span>
                                        </td>
                                        <td className="p-3 whitespace-nowrap">
                                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-bold flex items-center gap-1 border border-emerald-500/20 w-fit">
                                            <Lock className="w-2.5 h-2.5" />
                                            <span>{item.linkCount} URLs Safe</span>
                                          </span>
                                        </td>
                                        <td className="p-3 whitespace-nowrap">
                                          {item.status === 'clean' ? (
                                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                                              Clean
                                            </span>
                                          ) : item.status === 'needs_update' ? (
                                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-bold">
                                              Needs Update
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 text-[10px] font-bold">
                                              Unverified
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ========================================================= */}
      {/* 5. LINK INSPECTION MODAL (PHASE 3 / PHASE 4)              */}
      {/* ========================================================= */}
      {inspectingLink && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => setInspectingLink(null)}
        >
          <div
            className="relative w-full max-w-2xl bg-[#0b0e17] border border-cyan-500/30 rounded-3xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Eye className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">Link Record Inspection</h3>
                  <p className="text-[11px] text-zinc-400 font-mono">ID: {inspectingLink.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingLink(null)}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase font-black">Release Title</span>
                <p className="font-bold text-white break-words">{inspectingLink.title}</p>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase font-black">Destination URL</span>
                <a
                  href={inspectingLink.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-cyan-400 hover:underline break-all block"
                >
                  {inspectingLink.url}
                </a>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">Quality</span>
                  <span className="font-bold text-amber-300 font-mono">{inspectingLink.quality || '1080p'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">Resolution</span>
                  <span className="font-bold text-zinc-200 font-mono">{inspectingLink.resolution || inspectingLink.quality || '1080p'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">Dynamic Range</span>
                  <span className="font-bold text-purple-300 font-mono">{inspectingLink.dynamicRange || 'SDR'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">Codec</span>
                  <span className="font-bold text-zinc-200 font-mono">{inspectingLink.codec || 'x264/x265'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">Audio</span>
                  <span className="font-bold text-zinc-200 truncate block">{inspectingLink.audioLanguage || 'Dual Audio'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">File Size</span>
                  <span className="font-bold text-zinc-200 font-mono">{inspectingLink.size || 'N/A'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">Server Provider</span>
                  <span className="font-bold text-cyan-300">{inspectingLink.serverName || inspectingLink.provider || 'Direct'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">Linked Media ID</span>
                  <span className="font-bold text-zinc-300 font-mono">{(inspectingLink as any).movieId || managingTitle?.id}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">Media Type</span>
                  <span className="font-bold text-zinc-300 uppercase">{inspectingLink.mediaType || managingTitle?.media_type}</span>
                </div>
              </div>

              {/* Telegram Ingestion Diagnostics */}
              {(inspectingLink.telegramMessageId || inspectingLink.telegramSender || inspectingLink.matchingDecision) && (
                <div className="p-3.5 rounded-xl bg-sky-950/20 border border-sky-500/25 space-y-2">
                  <div className="flex items-center gap-1.5 text-sky-400 font-bold text-[11px] uppercase tracking-wider">
                    <Send className="w-3.5 h-3.5" />
                    <span>Telegram Ingestion Diagnostics</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Post Message ID:</span>
                      <span className="font-mono text-zinc-200">#{inspectingLink.telegramMessageId || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Telegram Sender:</span>
                      <span className="font-mono text-zinc-200">@{inspectingLink.telegramSender || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Matching Decision:</span>
                      <span className="font-mono text-emerald-400">{inspectingLink.matchingDecision || 'auto_matched'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Matching Confidence:</span>
                      <span className="font-mono text-cyan-400">{inspectingLink.matchingConfidence || 'verified'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingLink(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. INDIVIDUAL LINK DELETION CONFIRMATION MODAL (PHASE 4A)  */}
      {/* ========================================================= */}
      {linkToDelete && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => setLinkToDelete(null)}
        >
          <div
            className="relative w-full max-w-lg bg-[#0b0e17] border border-rose-500/30 rounded-3xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Individual Link</h3>
                <p className="text-xs text-zinc-400">This action permanently removes only this specific link.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2 text-xs">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase font-black block">Link Display Title</span>
                <span className="font-bold text-white break-words">{linkToDelete.title}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase font-black block">Exact Destination URL</span>
                <span className="font-mono text-zinc-300 break-all text-[11px]">{linkToDelete.url}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1 border-t border-zinc-800/80">
                <span>Link ID: {linkToDelete.id}</span>
                <span>Title ID: {linkToDelete.movieId}</span>
              </div>
            </div>

            <p className="text-xs text-zinc-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 text-rose-200">
              ⚠️ Only this link record will be deleted. The parent title record and all other destination links will remain completely intact.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setLinkToDelete(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingLinkId === linkToDelete.id}
                onClick={handleConfirmDeleteSingleLink}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-500/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {deletingLinkId === linkToDelete.id ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{deletingLinkId === linkToDelete.id ? 'Deleting...' : 'Delete This Link'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. ENTIRE TITLE DELETION DUAL-CONFIRMATION MODAL (PHASE 4B)*/}
      {/* ========================================================= */}
      {titleToDelete && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => {
            setTitleToDelete(null);
            setDeleteTitleConfirmChecked(false);
          }}
        >
          <div
            className="relative w-full max-w-xl bg-[#0b0e17] border border-rose-500/40 rounded-3xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Permanently Delete Entire Title</h3>
                <p className="text-xs text-rose-300">Permanent deletion with pre-delete audit snapshot</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase font-black">Title Name</span>
                <span className="font-bold text-white text-sm">{titleToDelete.title}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-zinc-500">Canonical ID:</span>
                <span className="text-zinc-300">{titleToDelete.id}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-zinc-500">Media Type:</span>
                <span className="text-amber-300 font-bold uppercase">{titleToDelete.media_type}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-zinc-500">Associated Links to Wipe:</span>
                <span className="text-rose-400 font-bold">{managingTitleLinks.length} Links</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-purple-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-purple-300">
                <Lock className="w-3.5 h-3.5" />
                <span>Pre-Delete Audit Protection</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                All {managingTitleLinks.length} destination records will be archived into the system audit log collection before deletion for safety and recovery.
              </p>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 cursor-pointer text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={deleteTitleConfirmChecked}
                onChange={(e) => setDeleteTitleConfirmChecked(e.target.checked)}
                className="mt-0.5 rounded border-zinc-700 text-rose-600 focus:ring-0"
              />
              <span>
                I confirm that I want to permanently delete <strong className="text-white">"{titleToDelete.title}"</strong> and all its {managingTitleLinks.length} links.
              </span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTitleToDelete(null);
                  setDeleteTitleConfirmChecked(false);
                }}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingAllLinks || !deleteTitleConfirmChecked}
                onClick={handleConfirmDeleteEntireTitle}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-500/25 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingAllLinks ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isDeletingAllLinks ? 'Deleting Title...' : 'Permanently Delete Entire Title'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
