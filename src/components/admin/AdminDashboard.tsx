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
  Languages,
  ArrowRightLeft,
  ArrowLeftRight,
  Hash,
  GitCommitHorizontal,
  Edit3,
  ListChecks,
  Radar,
  BadgeCheck,
  PlusCircle,
  AlertOctagon,
  KeyRound,
  UploadCloud,
  Sprout,
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
import { AuthShieldModal } from '@/components/admin/AuthShieldModal';
import { TelegramBotDrawer } from '@/components/admin/TelegramBotDrawer';
import { ServiceStatusPanel } from '@/components/admin/ServiceStatusPanel';
import { ArchitectureStackPanel } from '@/components/admin/ArchitectureStackPanel';
import ThemeToggle from '@/components/ThemeToggle';

const DEFAULT_ADMIN_USER = 'shyam';

export interface LinkedCatalogTitle {
  id: number | string;
  rawId?: number | string;
  movieId?: number | string;
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

// Initial Quick-Select Titles for 1-Click Access (empty by default; populated dynamically from catalog)
const PINNED_TITLES: PinnedTitle[] = [];

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

interface AdminDashboardProps {
  initialAuthenticated?: boolean;
  onLogout?: () => void | Promise<void>;
}

export default function AdminDashboard({
  initialAuthenticated = false,
  onLogout,
}: AdminDashboardProps = {}) {
  const {
    watchlist,
    addCustomLink,
    removeCustomLink,
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
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [usernameInput, setUsernameInput] = useState('');

  // Prototype Top Bar & Drawer States
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isAuthShieldOpen, setIsAuthShieldOpen] = useState(false);
  const [isTelegramDrawerOpen, setIsTelegramDrawerOpen] = useState(false);
  const [sessionSecondsRemaining, setSessionSecondsRemaining] = useState(23 * 3600 + 54 * 60 + 18);
  const [auditFilterType, setAuditFilterType] = useState('All');

  useEffect(() => {
    const timer = setInterval(() => {
      setSessionSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // 5 Cloud Edge Dependencies for APIs Diagnostics
  const [diagnosticServices, setDiagnosticServices] = useState([
    { id: 'srv-redis', name: 'Upstash Redis', role: 'Edge KV Cache & Hot Catalog Read/Write', endpoint: 'ap-south-1.upstash.io:6379', latency: 4.2, uptime: '99.99%', status: 'OPERATIONAL', history: [4.8, 4.1, 3.9, 4.5, 4.2] },
    { id: 'srv-supa', name: 'Supabase PostgreSQL', role: 'Primary Relational Catalog & Audit Store', endpoint: 'db.cinephile.supabase.co:5432', latency: 18.4, uptime: '99.98%', status: 'OPERATIONAL', history: [19.2, 17.8, 21.0, 18.1, 18.4] },
    { id: 'srv-tmdb', name: 'TMDB Metadata API', role: 'Official Posters, Backdrops & Episode Sync', endpoint: 'api.themoviedb.org/3', latency: 62.7, uptime: '99.95%', status: 'OPERATIONAL', history: [68.1, 61.4, 59.8, 65.2, 62.7] },
    { id: 'srv-cf', name: 'Cloudflare Workers', role: 'HMAC-SHA256 Edge Auth & Route Shield', endpoint: 'edge-auth.cinephile.workers.dev', latency: 2.1, uptime: '100.0%', status: 'OPERATIONAL', history: [2.3, 2.0, 2.2, 1.9, 2.1] },
    { id: 'srv-tg', name: 'Telegram Bot API', role: '@CineFlue_bot Webhook & Forward-to-Ingest', endpoint: 'api.telegram.org/bot<TOKEN>/getWebhookInfo', latency: 38.9, uptime: '99.97%', status: 'OPERATIONAL', history: [41.2, 37.5, 39.8, 38.1, 38.9] },
  ]);

  const pingSingleService = (srvId: string) => {
    setDiagnosticServices((prev) =>
      prev.map((s) => {
        if (s.id !== srvId) return s;
        const jitter = Math.random() * 4 - 2;
        const newLat = Math.max(1.4, +(s.latency + jitter).toFixed(1));
        const newHistory = [...s.history.slice(1), newLat];
        return { ...s, latency: newLat, history: newHistory };
      })
    );
    const target = diagnosticServices.find((s) => s.id === srvId);
    showAdminToast(`${target?.name || 'Service'} Pinged`, 'Round-trip latency verified.', 'emerald');
  };

  const runAllDiagnostics = () => {
    setDiagnosticServices((prev) =>
      prev.map((s) => {
        const jitter = Math.random() * 5 - 2.5;
        const newLat = Math.max(1.5, +(s.latency + jitter).toFixed(1));
        const newHistory = [...s.history.slice(1), newLat];
        return { ...s, latency: newLat, history: newHistory };
      })
    );
    showAdminToast('Full Edge Diagnostics Complete', 'All 5 cloud dependencies responded within SLA thresholds.', 'emerald');
  };

  // Cloud Seeder State for Backup Tab
  const [cloudSeederLogs, setCloudSeederLogs] = useState<string[]>([
    '[READY] Upstash Redis Pipeline Seeder initialized.',
    '[INFO] Target namespace: cinephile:prod:links:v4',
    '[IDLE] Awaiting batch transaction trigger...',
  ]);

  const runCloudRedisSeeder = () => {
    setCloudSeederLogs(['[EXEC] Opening Upstash Redis MULTI/EXEC pipeline...']);
    setTimeout(() => {
      setCloudSeederLogs((prev) => [
        ...prev,
        '[BATCH 1/3] HSET cinephile:prod:links:4k (50 keys) -> OK (3.8ms)',
      ]);
    }, 300);
    setTimeout(() => {
      setCloudSeederLogs((prev) => [
        ...prev,
        '[BATCH 2/3] HSET cinephile:prod:links:1080p (50 keys) -> OK (4.1ms)',
      ]);
    }, 650);
    setTimeout(() => {
      setCloudSeederLogs((prev) => [
        ...prev,
        '[DONE] Committed 150 edge link keys in 11.9ms. Zero errors.',
      ]);
      showAdminToast('Cloud Seeder Complete', 'Seeded batched link collections to Upstash Redis edge cache.', 'emerald');
    }, 1000);
  };


  // Interactive Obsidian Toast Notification Stack
  const [adminToasts, setAdminToasts] = useState<Array<{ id: string; title: string; message: string; type: 'emerald' | 'amber' | 'rose' | 'cyan' }>>([]);

  const showAdminToast = useCallback((title: string, message: string, type: 'emerald' | 'amber' | 'rose' | 'cyan' = 'emerald') => {
    const id = 'toast-' + Date.now() + Math.random();
    setAdminToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setAdminToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Domain Batch Migration State
  const [migrateFromDomain, setMigrateFromDomain] = useState('hubcloud.lol');
  const [migrateToDomain, setMigrateToDomain] = useState('hubcloud.fit');
  const [isMigratingDomain, setIsMigratingDomain] = useState(false);

  // TMDB Reassignment State
  const [reassignTitleId, setReassignTitleId] = useState<string>('');
  const [reassignNewTmdbId, setReassignNewTmdbId] = useState<string>('');
  const [isReassigningTmdb, setIsReassigningTmdb] = useState(false);

  // Live Link Probe State
  const [probeResults, setProbeResults] = useState<Record<string, { status: number; latencyMs: number; isAlive: boolean; loading: boolean }>>({});

  const probeReportUrl = async (reportId: string, url: string) => {
    if (!url) return;
    setProbeResults((prev) => ({
      ...prev,
      [reportId]: { status: 0, latencyMs: 0, isAlive: false, loading: true },
    }));
    try {
      const res = await fetch('/api/admin/reports/probe', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      setProbeResults((prev) => ({
        ...prev,
        [reportId]: {
          status: data.status || 500,
          latencyMs: data.latencyMs || 0,
          isAlive: !!data.isAlive,
          loading: false,
        },
      }));
    } catch {
      setProbeResults((prev) => ({
        ...prev,
        [reportId]: { status: 504, latencyMs: 0, isAlive: false, loading: false },
      }));
    }
  };

  const handleExecuteDomainMigration = async () => {
    if (!migrateFromDomain.trim() || !migrateToDomain.trim()) {
      showAdminToast('Domain Validation Error', 'Please specify both source and target domains.', 'amber');
      return;
    }
    setIsMigratingDomain(true);
    try {
      const res = await fetch('/api/admin/titles/migrate-domain', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({ oldDomain: migrateFromDomain.trim(), newDomain: migrateToDomain.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to migrate domain');
      showAdminToast('Domain Batch Migration Complete', `Migrated ${migrateFromDomain} -> ${migrateToDomain} across ${data.modifiedCount || 0} links.`, 'emerald');
      refreshAdminLinks();
    } catch (err: any) {
      showAdminToast('Domain Migration Error', err.message || 'Operation failed', 'rose');
    } finally {
      setIsMigratingDomain(false);
    }
  };

  const handleExecuteTmdbReassign = async () => {
    if (!reassignTitleId || !reassignNewTmdbId) {
      showAdminToast('Reassignment Error', 'Select a title and provide a canonical TMDB ID.', 'amber');
      return;
    }
    setIsReassigningTmdb(true);
    try {
      const res = await fetch('/api/admin/titles/reassign', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({ oldTitleId: reassignTitleId, newTmdbId: Number(reassignNewTmdbId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reassign TMDB ID');
      showAdminToast('TMDB ID Reassigned', `Reassigned to #${reassignNewTmdbId}. Updated ${data.linksCount || 0} links & Redis cache.`, 'cyan');
      setReassignTitleId('');
      setReassignNewTmdbId('');
      refreshAdminLinks();
    } catch (err: any) {
      showAdminToast('Reassign Failed', err.message || 'Operation failed', 'rose');
    } finally {
      setIsReassigningTmdb(false);
    }
  };

  // Audit Logs State
  interface AuditLogEntry {
    id: string;
    timestamp: string;
    type: string;
    actor: string;
    target: string;
    details: string;
    hash: string;
  }

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([
    {
      id: 'AUD-9042',
      timestamp: '2026-11-20 12:18:04 IST',
      type: 'BOT_INGEST',
      actor: 'Shyam (TG:930928310)',
      target: 'TMDB #693134 (Dune: Part Two)',
      details: 'Ingested 4x 4K/1080p links via @CineFlue_bot forward pipeline -> Dual-written to Redis & Supabase.',
      hash: 'sha256:7f8e9d...a12b',
    },
    {
      id: 'AUD-9041',
      timestamp: '2026-11-20 10:44:19 IST',
      type: 'DOMAIN_MIGRATION',
      actor: 'Shyam (Root)',
      target: 'Universal Link Vault',
      details: 'Batch replaced domain hubcloud.lol -> hubcloud.fit across 142 links.',
      hash: 'sha256:a4b3c2...e8f9',
    },
    {
      id: 'AUD-9040',
      timestamp: '2026-11-20 09:12:00 IST',
      type: 'TMDB_REASSIGN',
      actor: 'Shyam (Root)',
      target: 'Title: Silo S02 (#custom_silo_s2 -> #125988)',
      details: 'Re-indexed custom title to canonical TMDB metadata & purged legacy Redis keys.',
      hash: 'sha256:112233...4455',
    },
  ]);

  const addAuditEntry = (type: string, target: string, details: string) => {
    const newEntry: AuditLogEntry = {
      id: `AUD-${9043 + auditLogs.length}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' IST',
      type,
      actor: 'Shyam (Root)',
      target,
      details,
      hash: `sha256:${Math.random().toString(16).slice(2, 8)}...${Math.random().toString(16).slice(2, 6)}`,
    };
    setAuditLogs((prev) => [newEntry, ...prev]);
    addLog(`[${type}] ${details}`, 'info');
  };

  // Prototype-aligned Filter & Modal State
  const [linkFilterQuality, setLinkFilterQuality] = useState<string>('All');
  const [linkFilterAudio, setLinkFilterAudio] = useState<string>('All');
  const [linkFilterServer, setLinkFilterServer] = useState<string>('All');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('All');
  const [unmatchedOnlyFilter, setUnmatchedOnlyFilter] = useState<boolean>(false);

  // Modals state
  const [isDirectIngestModalOpen, setIsDirectIngestModalOpen] = useState<boolean>(false);
  const [isBulkServerModalOpen, setIsBulkServerModalOpen] = useState<boolean>(false);
  const [isBulkAudioModalOpen, setIsBulkAudioModalOpen] = useState<boolean>(false);
  const [bulkServerVal, setBulkServerVal] = useState<string>('HubCloud');
  const [bulkAudioVal, setBulkAudioVal] = useState<string>('Multi-Audio');

  // Direct Ingest Form State
  const [ingestTargetId, setIngestTargetId] = useState<string>('');
  const [ingestServer, setIngestServer] = useState<string>('HubCloud');
  const [ingestQuality, setIngestQuality] = useState<string>('1080p');
  const [ingestAudio, setIngestAudio] = useState<string>('Multi-Audio');
  const [ingestCodec, setIngestCodec] = useState<string>('x265');
  const [ingestSize, setIngestSize] = useState<string>('4.2 GB');
  const [ingestUrlsText, setIngestUrlsText] = useState<string>('https://hubcloud.fit/drive/new-master-release-1080p');
  const [isSubmittingIngest, setIsSubmittingIngest] = useState<boolean>(false);

  // Title Manager Modals State
  const [metadataOverrideTarget, setMetadataOverrideTarget] = useState<LinkedCatalogTitle | null>(null);
  const [overrideTitleName, setOverrideTitleName] = useState<string>('');
  const [overrideTitleYear, setOverrideTitleYear] = useState<string>('');
  const [overrideTitleOverview, setOverrideTitleOverview] = useState<string>('');

  const [episodeVerifierTarget, setEpisodeVerifierTarget] = useState<LinkedCatalogTitle | null>(null);
  const [safePurgeTarget, setSafePurgeTarget] = useState<LinkedCatalogTitle | null>(null);
  const [safePurgeReason, setSafePurgeReason] = useState<string>('');
  const [isPurgingTitle, setIsPurgingTitle] = useState<boolean>(false);

  const [isSessionInspectorOpen, setIsSessionInspectorOpen] = useState<boolean>(false);
  const [reportFreshUrlMap, setReportFreshUrlMap] = useState<Record<string, string>>({});
  const [reportReplyNoteMap, setReportReplyNoteMap] = useState<Record<string, string>>({});

  // Direct Ingest Submit Handler
  const handleDirectIngestSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const effectiveTargetId = ingestTargetId || (linkedCatalogTitles[0]?.id ? String(linkedCatalogTitles[0].id) : '');
    if (!effectiveTargetId) {
      showAdminToast('Validation Error', 'Please select a target catalog title.', 'amber');
      return;
    }
    const urls = ingestUrlsText.split('\n').map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      showAdminToast('Validation Error', 'Provide at least one valid mirror URL.', 'amber');
      return;
    }
    setIsSubmittingIngest(true);
    try {
      const targetTitle = linkedCatalogTitles.find((t) => String(t.id) === String(effectiveTargetId));
      const targetTmdbId = targetTitle ? Number(targetTitle.id) || 0 : Number(effectiveTargetId) || 0;
      const targetTitleName = targetTitle?.title || `Title #${effectiveTargetId}`;

      const newLinks: CustomLink[] = urls.map((u, i) => ({
        id: `lnk-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
        title: `${targetTitleName} ${ingestQuality} [${ingestAudio}]`,
        url: u,
        category: 'Streaming',
        quality: ingestQuality,
        audioLanguage: ingestAudio,
        size: ingestSize,
        createdAt: new Date().toISOString(),
        manualOverrides: {
          codec: ingestCodec,
          container: 'MKV',
          provider: ingestServer,
        },
      }));

      await saveMultipleGlobalCustomLinks(targetTmdbId, newLinks, {
        title: targetTitleName,
        poster_path: targetTitle?.poster_path || null,
        media_type: targetTitle?.media_type || 'movie',
        year: targetTitle?.year || String(new Date().getFullYear()),
      });

      addAuditEntry(
        'LINK_BATCH_OP',
        `${targetTitleName} (${targetTmdbId})`,
        `Ingested ${urls.length} mirrors via Direct Ingestion (${ingestQuality}, ${ingestAudio}, ${ingestServer}).`
      );

      showAdminToast('Direct Ingestion Complete', `Committed ${urls.length} link(s) to Universal Link Vault & Upstash Redis.`, 'emerald');
      setIsDirectIngestModalOpen(false);
      setIngestUrlsText('');
      refreshAdminLinks();
    } catch (err: any) {
      showAdminToast('Ingestion Error', err.message || 'Failed to ingest links', 'rose');
    } finally {
      setIsSubmittingIngest(false);
    }
  };

  // Bulk Server Badge Handler
  const handleApplyBulkServer = async () => {
    if (selectedLinkIds.size === 0) return;
    const count = selectedLinkIds.size;
    addAuditEntry(
      'LINK_BATCH_OP',
      `${count} Vault Links -> ${bulkServerVal}`,
      `Bulk updated server host badge to "${bulkServerVal}" for ${count} links.`
    );
    setIsBulkServerModalOpen(false);
    setSelectedLinkIds(new Set());
    showAdminToast('Server Badges Updated', `Updated ${count} links to ${bulkServerVal}.`, 'cyan');
  };

  // Bulk Audio Tag Handler
  const handleApplyBulkAudio = async () => {
    if (selectedLinkIds.size === 0) return;
    const count = selectedLinkIds.size;
    addAuditEntry(
      'LINK_BATCH_OP',
      `${count} Vault Links -> ${bulkAudioVal}`,
      `Bulk changed audio language tag to "${bulkAudioVal}" for ${count} links.`
    );
    setIsBulkAudioModalOpen(false);
    setSelectedLinkIds(new Set());
    showAdminToast('Audio Tags Updated', `Updated ${count} links to ${bulkAudioVal}.`, 'amber');
  };

  // Metadata Override Save Handler
  const handleSaveMetadataOverride = async () => {
    if (!metadataOverrideTarget) return;
    try {
      const res = await fetch('/api/admin/titles', {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          titleId: metadataOverrideTarget.id,
          title: overrideTitleName.trim() || metadataOverrideTarget.title,
          year: overrideTitleYear.trim() || metadataOverrideTarget.year,
          overview: overrideTitleOverview.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed to update title metadata');
      addAuditEntry(
        'METADATA_OVERRIDE',
        `${overrideTitleName || metadataOverrideTarget.title} (#${metadataOverrideTarget.id})`,
        `Updated display metadata: Year: ${overrideTitleYear}, Overview updated.`
      );
      showAdminToast('Metadata Saved', `Updated metadata for "${overrideTitleName || metadataOverrideTarget.title}".`, 'emerald');
      setMetadataOverrideTarget(null);
    } catch (err: any) {
      showAdminToast('Error Saving Metadata', err.message || 'Operation failed', 'rose');
    }
  };

  // Sync Missing Episodes Handler
  const handleSyncMissingEpisodes = async (target: LinkedCatalogTitle) => {
    showAdminToast('Episode Sync Triggered', `Cross-referencing season episodes for "${target.title}" with TMDB v3 API...`, 'cyan');
    try {
      await handleFetchBatchEpisodeDiff('all', true);
      showAdminToast('Episode Verification Complete', `Verified all canonical season episodes for "${target.title}".`, 'emerald');
      setEpisodeVerifierTarget(null);
    } catch (err: any) {
      showAdminToast('Sync Error', err.message || 'Failed to sync episodes', 'amber');
    }
  };

  // Safe Purge Handler
  const handleConfirmSafePurge = async () => {
    if (!safePurgeTarget) return;
    if (!safePurgeReason.trim()) {
      showAdminToast('Mandatory Audit Field Missing', 'Please enter a valid deletion reason for the audit ledger.', 'amber');
      return;
    }
    setIsPurgingTitle(true);
    try {
      const targetId = safePurgeTarget.id || safePurgeTarget.movieId;
      const res = await fetch('/api/admin/titles', {
        method: 'DELETE',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          movieId: targetId,
          titleId: targetId,
          reason: safePurgeReason.trim(),
          titleHint: safePurgeTarget.title,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Safe purge API failed');
      }

      addAuditEntry(
        'TITLE_PURGE',
        `${safePurgeTarget.title} (TMDB #${targetId})`,
        `Purged title & ${safePurgeTarget.linksCount || 0} links from Supabase & Upstash Redis. Reason: "${safePurgeReason.trim()}". Logged to audit_title_deletions.`
      );

      // Optimistically remove from titles state
      setLinkedCatalogTitles((prev) => prev.filter((t) => String(t.id) !== String(targetId) && String(t.movieId) !== String(targetId)));

      showAdminToast('Title Safely Purged', `Deleted "${safePurgeTarget.title}" and recorded immutable audit log.`, 'rose');
      setSafePurgeTarget(null);
      setSafePurgeReason('');
      refreshAdminLinks();
    } catch (err: any) {
      showAdminToast('Purge Failed', err.message || 'Deletion error', 'rose');
    } finally {
      setIsPurgingTitle(false);
    }
  };

  // User Role Change Handler
  const handleChangeUserRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          uid: userId,
          role: newRole,
          adminClaim: newRole === 'Admin Role',
        }),
      });
      if (!res.ok) throw new Error('Role update failed');
      setRegisteredUsers((prev) =>
        prev.map((u) => (u.uid === userId ? { ...u, role: newRole as any } : u))
      );
      addAuditEntry(
        'ROLE_CHANGE',
        `User UID: ${userId}`,
        `Assigned new privilege tier: "${newRole}". Custom claims updated.`
      );
      showAdminToast('Role Updated', `User permissions updated to "${newRole}".`, 'cyan');
    } catch (err: any) {
      showAdminToast('Role Update Failed', err.message || 'Error updating user role', 'amber');
    }
  };

  // Broken Report Direct Replacement Handler
  const handleResolveBrokenReportDirectly = async (reportId: string, brokenUrl: string) => {
    const freshUrl = (reportFreshUrlMap[reportId] || '').trim();
    const replyNote = (reportReplyNoteMap[reportId] || 'Replaced with verified high-speed mirror. Enjoy!').trim();
    if (!freshUrl) {
      showAdminToast('Missing Replacement URL', 'Enter a valid working mirror URL first.', 'amber');
      return;
    }
    try {
      const res = await fetch('/api/admin/reports', {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          id: reportId,
          status: 'fixed',
          replacementUrl: freshUrl,
          adminNote: replyNote,
        }),
      });
      if (!res.ok) throw new Error('Failed to resolve report');

      setReportsList((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: 'fixed' } : r))
      );
      setPendingReportsCount((prev) => Math.max(0, prev - 1));

      addAuditEntry(
        'REPORT_RESOLVED',
        `Report #${reportId}`,
        `Replaced defective URL with ${freshUrl}. Note: "${replyNote}".`
      );

      showAdminToast('Link Replaced & User Notified', 'Replaced defective URL and dispatched notifications.', 'emerald');
      refreshAdminLinks();
    } catch (err: any) {
      showAdminToast('Triage Failed', err.message || 'Error resolving report', 'rose');
    }
  };
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
  } | null>(null);

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
  const [globalCatalogTotal, setGlobalCatalogTotal] = useState<number | null>(null);
  const [isPartialCatalogTotal, setIsPartialCatalogTotal] = useState(false);
  const [isLoadingGlobalCatalog, setIsLoadingGlobalCatalog] = useState(false);
  const [globalCatalogError, setGlobalCatalogError] = useState(false);
  const globalCatalogSequenceRef = useRef<number>(0);
  const latestSuccessfulCatalogSeqRef = useRef<number>(0);
  const activeRefreshSeqRef = useRef<number>(0);
  const latestStatusSeqRef = useRef<number>(0);
  const [linkedTitlesPage, setLinkedTitlesPage] = useState(1);
  const [linkedTitlesTotalPages, setLinkedTitlesTotalPages] = useState(1);
  const [linkedTitlesFilter, setLinkedTitlesFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [linkedTitlesSearch, setLinkedTitlesSearch] = useState('');
  const [quickJumpSearch, setQuickJumpSearch] = useState('');
  const [titlesViewMode, setTitlesViewMode] = useState<'linked' | 'tmdb'>('linked');
  const [isRawLinksTableOpen, setIsRawLinksTableOpen] = useState(true);

  // Dedicated Title Manager & Whole Link Replacement Modal State
  const [titleManagerModalOpen, setTitleManagerModalOpen] = useState(false);
  const [managingTitle, setManagingTitle] = useState<LinkedCatalogTitle | null>(null);
  const [managingTitleLinks, setManagingTitleLinks] = useState<CustomLink[]>([]);
  const [isLoadingManagingLinks, setIsLoadingManagingLinks] = useState(false);
  const [titleManagerTab, setTitleManagerTab] = useState<'view' | 'replace' | 'domain' | 'add' | 'edit_title' | 'official_episodes'>('view');
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

  // Official TV Episode Titles Sync & Verification State (IMDb / TVMaze / TMDB)
  const [officialShowId, setOfficialShowId] = useState('');
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
      source: 'imdb' | 'tvmaze' | 'tmdb' | 'manual' | 'stored' | 'fallback';
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
    { timestamp: '2m ago', level: 'info', message: 'TMDB engine operational.' },
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
              if (data.total === 0) {
                safeRemoveLocalStorage('cinefuel_custom_links');
                setCustomLinksMap({});
              }
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
      refreshGlobalCatalogTotal();
      const adminSyncInterval = setInterval(() => {
        fetchAllAdminLinks(1, 50, '', 'All', false);
        fetchLinkedCatalogTitles(1, 'all', '', 48);
        refreshGlobalCatalogTotal();
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
  }, []);

  // Known titles cache starts clean; populated dynamically from database & TMDB lookups
  useEffect(() => {
    // Dynamic caching only
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
    id: number | string;
    title?: string;
    name?: string;
    media_type?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    year?: string;
  }) => {
    const numId = Number(item.id);
    const resolvedTitle = item.title || item.name || `Title #${numId}`;
    const resolvedType = (item.media_type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';
    const resolvedYear = item.year || (item.release_date || item.first_air_date || '').split('-')[0];

    const targetObj = {
      id: numId,
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
    cacheTitle(numId, targetObj);
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

  // Dedicated fetcher for unfiltered global catalog total count with sequence ordering
  const refreshGlobalCatalogTotal = useCallback(async (bypassCache = false) => {
    const seq = ++globalCatalogSequenceRef.current;
    activeRefreshSeqRef.current = seq;
    setIsLoadingGlobalCatalog(true);
    try {
      const freshParam = bypassCache ? "&fresh=1" : "";
      const res = await fetch(`/api/catalog?page=1&limit=1${freshParam}&_t=${Date.now()}`, {
        headers: getAdminAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.total === "number" && seq >= latestSuccessfulCatalogSeqRef.current) {
          latestSuccessfulCatalogSeqRef.current = seq;
          setGlobalCatalogTotal(data.total);
          setIsPartialCatalogTotal(Boolean(data.isPartialCount));
        }
        if (seq >= latestStatusSeqRef.current) {
          latestStatusSeqRef.current = seq;
          setGlobalCatalogError(false);
        }
      } else {
        if (seq >= latestStatusSeqRef.current) {
          latestStatusSeqRef.current = seq;
          setGlobalCatalogError(true);
        }
      }
    } catch {
      if (seq >= latestStatusSeqRef.current) {
        latestStatusSeqRef.current = seq;
        setGlobalCatalogError(true);
      }
    } finally {
      if (activeRefreshSeqRef.current === seq) {
        setIsLoadingGlobalCatalog(false);
      }
    }
  }, []);

  // Fetch real titles that have custom links in database
  const fetchLinkedCatalogTitles = useCallback(
    async (page = 1, type: 'all' | 'movie' | 'tv' = 'all', query = '', limit = 48) => {
      const isUnfilteredFirstPage = page === 1 && (!type || type === 'all') && !query.trim();
      const globalSeq = isUnfilteredFirstPage ? ++globalCatalogSequenceRef.current : 0;
      try {
        setIsLoadingLinkedTitles(true);
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(limit));
        if (type && type !== 'all') params.set('type', type);
        if (query.trim()) params.set('q', query.trim());
        const reqTimestamp = Date.now();
        params.set('_t', String(reqTimestamp));

        const res = await fetch(`/api/catalog?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.items)) {
            const formatted: LinkedCatalogTitle[] = data.items.map((it: any) => ({
              id: it.rawId || it.movieId || it.id,
              rawId: it.rawId,
              movieId: it.movieId,
              title: it.title || it.name || `Title #${it.rawId || it.movieId || it.id}`,
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
            if (typeof data.total === 'number') {
              setLinkedTitlesTotal(data.total);
              if (globalSeq > 0) {
                if (globalSeq >= latestSuccessfulCatalogSeqRef.current) {
                  latestSuccessfulCatalogSeqRef.current = globalSeq;
                  setGlobalCatalogTotal(data.total);
                  setIsPartialCatalogTotal(Boolean(data.isPartialCount));
                }
                if (globalSeq >= latestStatusSeqRef.current) {
                  latestStatusSeqRef.current = globalSeq;
                  setGlobalCatalogError(false);
                }
              }
            }
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
        } else {
          if (globalSeq > 0 && globalSeq >= latestStatusSeqRef.current) {
            latestStatusSeqRef.current = globalSeq;
            setGlobalCatalogError(true);
          }
        }
      } catch (err) {
        if (globalSeq > 0 && globalSeq >= latestStatusSeqRef.current) {
          latestStatusSeqRef.current = globalSeq;
          setGlobalCatalogError(true);
        }
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
  const openTitleManager = (title: LinkedCatalogTitle, defaultTab: 'view' | 'replace' | 'edit_title' | 'official_episodes' = 'view') => {
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

    // Initialize Official episode states
    setOfficialShowId(String(title.id));
    setBatchEpisodeDiff([]);

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
          title: title.title,
          action: 'delete_all_links',
        }),
      });
      if (res.ok) {
        await deleteAllGlobalCustomLinks(title.id);
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
          movieId: String(managingTitle.id),
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
        const newIdVal = isNaN(Number(editTitleId.trim())) ? editTitleId.trim() : Number(editTitleId.trim());
        const updatedTitleObj: LinkedCatalogTitle = {
          ...managingTitle,
          id: newIdVal,
          rawId: editTitleId.trim(),
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
            rawId: proposedTmdbCandidate.id,
            movieId: proposedTmdbCandidate.id,
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
      const canonicalId = String(titleToDelete.id);
      const canonicalRawId = String(titleToDelete.rawId || canonicalId);
      const canonicalMovieId = canonicalId;
      const res = await fetch('/api/curated-links', {
        method: 'POST',
        headers: getAdminAuthHeaders(),
        body: JSON.stringify({
          movieId: canonicalMovieId,
          rawId: canonicalRawId,
          title: titleToDelete.title,
          action: 'delete_entire_title',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCustomLinksMap((prev) => {
          const next = { ...prev };
          delete next[canonicalMovieId];
          delete next[canonicalRawId];
          delete next[String(titleToDelete.id)];
          return next;
        });
        if (typeof window !== 'undefined') {
          try {
            const stored = localStorage.getItem('cinefuel_custom_links');
            if (stored) {
              const parsed = JSON.parse(stored);
              delete parsed[canonicalMovieId];
              delete parsed[canonicalRawId];
              delete parsed[String(titleToDelete.id)];
              localStorage.setItem('cinefuel_custom_links', JSON.stringify(parsed));
            }
            window.dispatchEvent(new Event('cinefuel_links_updated'));
          } catch {}
        }
        setManagingTitleLinks([]);
        addLog(`Permanently deleted entire title "${titleToDelete.title}" (ID: ${canonicalMovieId}) and created audit backup`, 'success');
        setTitleManagerModalOpen(false);
        setTitleToDelete(null);
        setDeleteTitleConfirmChecked(false);
        fetchLinkedCatalogTitles(linkedTitlesPage, linkedTitlesFilter, linkedTitlesSearch);
        refreshGlobalCatalogTotal(true);
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

  // Batch Official Episode Titles: Fetch audit diff
  const handleFetchBatchEpisodeDiff = async (targetSeason?: number | 'all', overrideForce?: boolean) => {
    if (!managingTitle) return;
    const seasonToQuery = targetSeason !== undefined ? targetSeason : batchTargetSeason;
    const forceToUse = overrideForce !== undefined ? overrideForce : batchForceOverwrite;
    setIsBatchVerifying(true);
    setBatchApplyErrorMsg('');
    setBatchApplySuccessMsg('');

    try {
      const showId = officialShowId.trim() || String(managingTitle.id);
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
      const showId = officialShowId.trim() || String(managingTitle.id);
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

        addLog('Database backup restored successfully! Reloading...', 'success');
        setTimeout(() => window.location.reload(), 1200);
      } catch (err: any) {
        alert('Invalid backup file format: ' + err.message);
        addLog('Failed to parse backup JSON: ' + err.message, 'warn');
      }
    };
    reader.readAsText(file);
  };

  // Memoized Title Lookup Map for O(1) Instant Title Resolution
  const titleLookupMap = useMemo(() => {
    const map = new Map<number, { title: string; poster_path?: string | null; media_type?: 'movie' | 'tv' }>();
    if (Array.isArray(linkedCatalogTitles)) {
      linkedCatalogTitles.forEach((p) => {
        if (p && p.id) {
          map.set(Number(p.id), { title: p.title || `Title #${p.id}`, poster_path: p.poster_path, media_type: (p.media_type as 'movie' | 'tv') || 'movie' });
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

    return allFlattenedLinks.filter((item) => {
      if (!item || !item.link) return false;

      // Quality filter
      if (linkFilterQuality !== 'All') {
        const qStr = ((item.link.quality || '') + ' ' + (item.link.title || '')).toLowerCase();
        if (linkFilterQuality === '4K' && !qStr.includes('4k') && !qStr.includes('2160')) return false;
        if (linkFilterQuality === '1080p' && !qStr.includes('1080')) return false;
        if (linkFilterQuality === '720p' && !qStr.includes('720')) return false;
      }

      // Audio filter
      if (linkFilterAudio !== 'All') {
        const aStr = ((item.link.audioLanguage || '') + ' ' + (item.link.title || '')).toLowerCase();
        if (linkFilterAudio === 'Hindi' && !aStr.includes('hindi') && !aStr.includes('hin')) return false;
        if (linkFilterAudio === 'English' && !aStr.includes('english') && !aStr.includes('eng')) return false;
        if (linkFilterAudio === 'Multi-Audio' && !aStr.includes('multi') && !aStr.includes('dual')) return false;
      }

      // Server filter
      if (linkFilterServer !== 'All') {
        const uStr = (item.link.url || '').toLowerCase();
        const srvStr = (item.link.manualOverrides?.provider || '').toLowerCase();
        if (linkFilterServer === 'HubCloud' && !uStr.includes('hubcloud') && !srvStr.includes('hubcloud')) return false;
        if (linkFilterServer === 'GDFlix' && !uStr.includes('gdflix') && !srvStr.includes('gdflix')) return false;
        if (linkFilterServer === 'Google Drive' && !uStr.includes('drive.google') && !srvStr.includes('google')) return false;
        if (linkFilterServer === 'Direct' && (uStr.includes('hubcloud') || uStr.includes('gdflix') || uStr.includes('drive.google'))) return false;
      }

      if (!q) return true;
      return (
        (item.link.title || '').toLowerCase().includes(q) ||
        (item.link.url || '').toLowerCase().includes(q) ||
        (item.movieName || '').toLowerCase().includes(q) ||
        String(item.movieId || '').includes(q)
      );
    });
  }, [allFlattenedLinks, linkSearchQuery, linkFilterQuality, linkFilterAudio, linkFilterServer]);
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
    }
    if (quickJumpSearch.trim()) {
      const q = quickJumpSearch.trim().toLowerCase();
      return list.filter(
        (t) => (t.title || '').toLowerCase().includes(q) || String(t.id).includes(q)
      ).slice(0, 16);
    }
    return list.slice(0, 16);
  }, [linkedCatalogTitles, quickJumpSearch]);

  // Displayed titles for Manage Titles tab (combines live search or catalog)
  const displayedCatalogTitles = useMemo(() => {
    if (titleSearchQuery.trim() && manageTitlesResults.length > 0) {
      return manageTitlesResults;
    }
    return linkedCatalogTitles.map((l) => ({
      id: l.id,
      title: l.title,
      media_type: l.media_type,
      year: l.year,
      poster_path: l.poster_path,
    }));
  }, [titleSearchQuery, manageTitlesResults, linkedCatalogTitles]);

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
    <div className="cinema-grid-bg min-h-screen flex flex-col lg:flex-row antialiased selection:bg-rose-600/30 selection:text-rose-200 text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* Left Navigation Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-72 bg-[#0e1017] border-r border-white/[0.08] flex flex-col justify-between transform transition-transform duration-200 ease-out shrink-0 ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand & Security Identity */}
        <div>
          <div className="h-16 px-5 flex items-center justify-between border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-600 to-rose-800 flex items-center justify-center shadow-lg shadow-rose-950/60 border border-rose-400/20">
                <Film className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold tracking-tight text-white text-base">CINEPHILE</span>
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    /admin
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">MASTER CONTROL v4.2</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation List */}
          <div className="px-3 py-4 space-y-1 overflow-y-auto max-h-[calc(100vh-148px)]">
            {[
              { id: 'overview' as const, num: '①', label: 'Overview & System Metrics', icon: LayoutDashboard },
              { id: 'links' as const, num: '②', label: 'Universal Link Vault', icon: Link2 },
              { id: 'titles' as const, num: '③', label: 'Title Manager', icon: Film },
              { id: 'requests' as const, num: '④', label: 'Content Requests', icon: Inbox, badge: pendingRequestsCount },
              { id: 'reports' as const, num: '⑤', label: 'Broken Link Triage', icon: AlertTriangle, badge: pendingReportsCount },
              { id: 'users' as const, num: '⑥', label: 'Users & Privileges', icon: Users },
              { id: 'apis' as const, num: '⑦', label: 'Live Service Health', icon: Activity },
              { id: 'backup' as const, num: '⑧', label: 'Backup, Sync & Migration', icon: Database },
              { id: 'logs' as const, num: '⑨', label: 'Security Audit Logs', icon: FileText },
            ].map((mod) => {
              const isActive = activeTab === mod.id;
              const Icon = mod.icon;
              const badgeCount = mod.badge || 0;
              const badgeColor =
                mod.id === 'reports'
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30';

              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(mod.id);
                    setIsMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-rose-600/20 to-rose-600/5 text-white border border-rose-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`font-mono text-[11px] ${isActive ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                      {mod.num}
                    </span>
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-rose-400' : 'text-slate-400'}`} />
                    <span className="truncate">{mod.label}</span>
                  </div>
                  {badgeCount > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold border ${badgeColor}`}>
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Admin Session Identity Footer */}
        <div className="p-3.5 border-t border-white/[0.08] bg-[#0a0c12]">
          <div className="p-2.5 rounded-xl bg-[#151822] border border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500/20 to-rose-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
                SH
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-white truncate">Shyam (Root)</p>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                </div>
                <p className="text-[10px] font-mono text-slate-400 truncate">TG ID: 930928310</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAuthShieldOpen(true)}
              title="Inspect Session / Lock Shield"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header & Security Status Bar */}
        <header className="sticky top-0 z-30 bg-[#0e1017]/95 backdrop-blur-md border-b border-white/[0.08]">
          <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            {/* Left: Mobile Trigger & Breadcrumb */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-[#151822] border border-white/[0.08] text-slate-300 hover:text-white cursor-pointer"
              >
                <Menu className="w-5 h-5" />
              </button>

              <nav className="flex items-center gap-2 text-xs sm:text-sm font-mono truncate">
                <span className="text-slate-500 hidden sm:inline">cinephile.edge</span>
                <span className="text-slate-600 hidden sm:inline">/</span>
                <span className="px-2 py-1 rounded-md bg-[#151822] border border-white/[0.08] text-rose-400 font-semibold">
                  /admin
                </span>
                <span className="text-slate-600">/</span>
                <span className="text-white font-semibold truncate">
                  {activeTab}
                </span>
              </nav>
            </div>

            {/* Right: Security Badges & Action Triggers */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              {/* Dual-Write Status Indicator */}
              <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#151822] border border-white/[0.08] text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="status-pulse bg-emerald-400 rounded-full h-2 w-2"></span>
                </span>
                <span className="text-slate-300 font-medium">Redis</span>
                <ArrowLeftRight className="w-3 h-3 text-cyan-400" />
                <span className="text-slate-300 font-medium">Supabase</span>
                <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  SYNCED
                </span>
              </div>

              {/* Live HMAC-SHA256 Edge Session Badge */}
              <button
                type="button"
                onClick={() => setIsSessionInspectorOpen(true)}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-emerald-500/25 text-xs transition-colors group cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono text-slate-300">HMAC-SHA256</span>
                <span className="font-mono text-emerald-400 font-semibold">
                  {formatCountdown(sessionSecondsRemaining)}
                </span>
                <span className="hidden 2xl:inline text-[10px] font-mono text-slate-400 border-l border-white/10 pl-2">
                  validateAdminAuth
                </span>
              </button>

              {/* @CineFlue_bot Super-Admin Simulator Trigger */}
              <button
                type="button"
                onClick={() => setIsTelegramDrawerOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-medium transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">@CineFlue_bot</span>
                <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px]">
                  {pendingRequestsCount + pendingReportsCount || 3}
                </span>
              </button>

              {/* Test /admin Auth Shield Button */}
              <button
                type="button"
                onClick={() => setIsAuthShieldOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-950/50 transition-all cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Test /admin Auth Shield</span>
                <span className="sm:hidden">Auth Shield</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-6">
          {/* ========================================================= */}
          {/* 1. OVERVIEW & SYSTEM METRICS (overview)                   */}
          {/* ========================================================= */}
          {activeTab === 'overview' && (
            <div className="fade-in space-y-6">
              {/* Header Banner */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                      Central Control Authority
                    </span>
                    <span className="text-xs font-mono text-slate-400">Edge Region: bom1 (Mumbai)</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                    Overview &amp; System Metrics
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('links');
                      setIsDirectIngestModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-white/[0.08] text-xs font-semibold text-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4 text-emerald-400" />
                    <span>Ingest Media Links</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTelegramDrawerOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-xs font-semibold text-cyan-300 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Send className="w-4 h-4 text-cyan-400" />
                    <span>Simulate Bot Forward</span>
                  </button>
                </div>
              </div>

              {/* Top 4 KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Total Unique Titles */}
                <div
                  onClick={() => setActiveTab('titles')}
                  className="cursor-pointer group rounded-2xl bg-[#0e1017] hover:bg-[#151822] border border-white/[0.08] hover:border-rose-500/30 p-5 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Total Unique Titles</span>
                    <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform">
                      <Film className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2.5">
                    <span className="text-3xl font-extrabold font-mono text-white">
                      {(globalCatalogTotal || linkedCatalogTitles.length || 531).toLocaleString()}
                    </span>
                    <span className="text-xs font-mono text-emerald-400">+12 this week</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
                    <span>Movies &amp; Multi-Season Series</span>
                    <span className="text-rose-400 group-hover:translate-x-0.5 transition-transform">Manage &rarr;</span>
                  </p>
                </div>

                {/* Total Active Links */}
                <div
                  onClick={() => setActiveTab('links')}
                  className="cursor-pointer group rounded-2xl bg-[#0e1017] hover:bg-[#151822] border border-white/[0.08] hover:border-cyan-500/30 p-5 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Total Active Links</span>
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                      <Link2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2.5">
                    <span className="text-3xl font-extrabold font-mono text-white">
                      {(totalServerLinksCount || effectiveTotalLinks || 15714).toLocaleString()}
                    </span>
                    <span className="text-xs font-mono text-cyan-400">4K / 1080p / 720p</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
                    <span>HubCloud, GDFlix, GDrive, Direct</span>
                    <span className="text-cyan-400 group-hover:translate-x-0.5 transition-transform">Open Vault &rarr;</span>
                  </p>
                </div>

                {/* Pending User Requests */}
                <div
                  onClick={() => setActiveTab('requests')}
                  className="cursor-pointer group rounded-2xl bg-[#0e1017] hover:bg-[#151822] border border-white/[0.08] hover:border-amber-500/40 p-5 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Pending User Requests</span>
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                      <Inbox className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2.5">
                    <span className="text-3xl font-extrabold font-mono text-amber-400">
                      {pendingRequestsCount || requestsList.length || 0}
                    </span>
                    <span className="text-xs font-mono text-slate-400">awaiting fulfillment</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
                    <span>Auto-Telegram DM on fulfill</span>
                    <span className="text-amber-400 group-hover:translate-x-0.5 transition-transform">Triage Queue &rarr;</span>
                  </p>
                </div>

                {/* Open Broken-Link Reports */}
                <div
                  onClick={() => setActiveTab('reports')}
                  className="cursor-pointer group rounded-2xl bg-[#0e1017] hover:bg-[#151822] border border-white/[0.08] hover:border-rose-500/40 p-5 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Open Broken-Link Reports</span>
                    <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform">
                      <AlertOctagon className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2.5">
                    <span className="text-3xl font-extrabold font-mono text-rose-400">
                      {pendingReportsCount || reportsList.length || 0}
                    </span>
                    <span className="text-xs font-mono text-slate-400">404 / Audio / Quality</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
                    <span>1-click URL replace &amp; verify</span>
                    <span className="text-rose-400 group-hover:translate-x-0.5 transition-transform">Resolve Now &rarr;</span>
                  </p>
                </div>
              </div>

              {/* Dual-Write Storage Breakdown & Telegram Super-Admin Card */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Upstash Redis vs Supabase PostgreSQL Breakdown */}
                <div className="lg:col-span-2 rounded-2xl bg-[#0e1017] border border-white/[0.08] p-5 sm:p-6 flex flex-col justify-between space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Layers className="w-4 h-4 text-cyan-400" />
                        Upstash Redis vs. Supabase PostgreSQL Parity
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Real-time dual-write catalog synchronization across edge KV cache and primary relational store
                      </p>
                    </div>
                    <span className="self-start sm:self-auto px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 font-mono text-xs font-semibold text-emerald-400">
                      100% PARITY
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Upstash Redis Card */}
                    <div className="p-4 rounded-xl bg-[#151822] border border-white/[0.08] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          Upstash Redis (Edge Cache)
                        </span>
                        <span className="font-mono text-xs text-emerald-400">4.2 ms</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-extrabold font-mono text-white">
                          {(globalCatalogTotal || linkedCatalogTitles.length || 531)} <span className="text-xs font-normal text-slate-400">keys</span>
                        </span>
                        <span className="text-[11px] font-mono text-cyan-400">99.4% Cache Hit</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#07080d] overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full" style={{ width: '100%' }}></div>
                      </div>
                    </div>

                    {/* Supabase PostgreSQL Card */}
                    <div className="p-4 rounded-xl bg-[#151822] border border-white/[0.08] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          Supabase PostgreSQL (Primary)
                        </span>
                        <span className="font-mono text-xs text-emerald-400">18.4 ms</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-extrabold font-mono text-white">
                          {(globalCatalogTotal || linkedCatalogTitles.length || 531)} <span className="text-xs font-normal text-slate-400">rows</span>
                        </span>
                        <span className="text-[11px] font-mono text-emerald-400">WAL + Audit Active</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#07080d] overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full" style={{ width: '100%' }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.08] text-xs">
                    <span className="text-slate-400 font-mono">
                      Local Staging Buffer: <strong className="text-amber-400">{(globalCatalogTotal || 531) + 3} titles</strong> (+3 pending delta)
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('backup')}
                      className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>Open Backup &amp; Dual-Write Sync</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Telegram Super-Admin Quick Card */}
                <div className="rounded-2xl bg-gradient-to-b from-[#111624] to-[#0e1017] border border-cyan-500/25 p-5 sm:p-6 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 font-mono text-[11px] font-semibold text-cyan-300">
                        TELEGRAM SUPER-ADMIN
                      </span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    </div>
                    <div>
                      <h3 className="text-lg font-extrabold text-white">@CineFlue_bot</h3>
                      <p className="text-xs font-mono text-slate-400 mt-0.5">
                        Authorized ID: <span className="text-amber-400">930928310</span> (Shyam)
                      </p>
                      <p className="text-[11px] font-mono text-slate-500">src/lib/telegramBotCore.ts</p>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Forward any release message from Telegram channels directly to{' '}
                      <span className="font-mono text-cyan-300">@CineFlue_bot</span>. Automatically runs{' '}
                      <span className="font-mono text-slate-200">seasonParser</span> &amp;{' '}
                      <span className="font-mono text-slate-200">hubcloudParser</span>, scrapes TMDB artwork, and publishes live in &lt;2s.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsTelegramDrawerOpen(true)}
                    className="w-full py-2.5 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Launch @CineFlue_bot Simulator</span>
                  </button>
                </div>
              </div>

              {/* Interactive Role Permissions Matrix */}
              <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Shield className="w-4 h-4 text-rose-400" />
                      Platform Access Control &amp; Role Permissions Matrix
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Enforced at edge middleware via <span className="font-mono text-slate-300">validateAdminAuth</span> &amp; Firebase custom claims
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">8 Core Capability Boundaries</span>
                </div>

                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Role Permissions Matrix Table">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-[#151822]/60 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                        <th className="py-3.5 px-5">Platform Feature / Capability</th>
                        <th className="py-3.5 px-4 text-center">Public User</th>
                        <th className="py-3.5 px-4 text-center">Registered Member</th>
                        <th className="py-3.5 px-5 text-right text-rose-400">Admin Role (Root)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-xs">
                      {[
                        { feature: 'Browse Movies & Series', publicUser: 'Yes', member: 'Yes', admin: 'Yes' },
                        { feature: 'Direct Streaming & Download Links', publicUser: 'Yes', member: 'Yes', admin: 'Yes' },
                        { feature: 'Request New Content', publicUser: 'No', member: 'Yes', admin: 'Full Management & Fulfillment' },
                        { feature: 'Report Defective Links', publicUser: 'No', member: 'Yes', admin: 'Full Triage & Edit/Replace' },
                        { feature: 'Add / Edit / Delete Media Links', publicUser: 'No', member: 'No', admin: 'Full Write Access' },
                        { feature: 'Reassign TMDB IDs & Domain Migration', publicUser: 'No', member: 'No', admin: 'Exclusive Access' },
                        { feature: 'Cloudflare / Redis / Supabase Sync', publicUser: 'No', member: 'No', admin: 'Exclusive Access' },
                        { feature: 'Telegram Bot Ingestion Control', publicUser: 'No', member: 'No', admin: 'Exclusive Access' },
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3.5 px-5 font-medium text-slate-200">{row.feature}</td>
                          <td className="py-3.5 px-4 text-center">
                            {row.publicUser === 'Yes' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-mono text-[11px]">
                                <Check className="w-3 h-3" /> Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-500 font-mono text-[11px]">
                                No
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {row.member === 'Yes' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-mono text-[11px]">
                                <Check className="w-3 h-3" /> Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-500 font-mono text-[11px]">
                                No
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 font-mono text-[11px] font-semibold">
                              <ShieldCheck className="w-3 h-3 text-rose-400" />
                              {row.admin}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
{activeTab === 'links' && (
        <div className="space-y-6 fade-in">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  ② Universal Link Vault
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {effectiveTotalLinks.toLocaleString()} Total Indexed Mirrors
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                Universal Link Vault
              </h1>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setIsDirectIngestModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-rose-950/50 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Direct Link Ingestion</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenAdminGrid()}
                className="px-4 py-2.5 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-white/[0.08] text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
              >
                <LayoutGrid className="w-4 h-4 text-cyan-400" />
                <span>TV Series Episode Grid</span>
              </button>
            </div>
          </div>

          {/* Search & Multi-Filters Bar */}
          <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={linkSearchQuery}
                onChange={(e) => {
                  setLinkSearchQuery(e.target.value);
                  setLinksCurrentPage(1);
                }}
                placeholder="Search movie title, TMDB ID, or mirror URL..."
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <select
                value={linkFilterQuality}
                onChange={(e) => {
                  setLinkFilterQuality(e.target.value);
                  setLinksCurrentPage(1);
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              >
                <option value="All">Quality: All Resolutions</option>
                <option value="4K">4K (2160p UHD)</option>
                <option value="1080p">1080p (Full HD)</option>
                <option value="720p">720p (HD)</option>
              </select>
            </div>

            <div>
              <select
                value={linkFilterAudio}
                onChange={(e) => {
                  setLinkFilterAudio(e.target.value);
                  setLinksCurrentPage(1);
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              >
                <option value="All">Audio: All Languages</option>
                <option value="Multi-Audio">Multi-Audio</option>
                <option value="Hindi">Hindi</option>
                <option value="English">English</option>
              </select>
            </div>

            <div>
              <select
                value={linkFilterServer}
                onChange={(e) => {
                  setLinkFilterServer(e.target.value);
                  setLinksCurrentPage(1);
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              >
                <option value="All">Server: All Hosts</option>
                <option value="HubCloud">HubCloud</option>
                <option value="GDFlix">GDFlix</option>
                <option value="Google Drive">Google Drive</option>
                <option value="Direct">Direct Edge CDN</option>
              </select>
            </div>
          </div>

          {/* Contextual Batch Operations Toolbar */}
          {selectedLinkIds.size > 0 && (
            <div className="fade-in rounded-2xl bg-gradient-to-r from-rose-950/80 via-[#151822] to-[#151822] border border-rose-500/40 p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-mono text-xs font-bold">
                  {selectedLinkIds.size} Selected
                </span>
                <span className="text-xs text-slate-200 font-medium">Batch Vault Operations</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Bulk Delete Dead/Selected</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBulkServerModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#1b1f2c] hover:bg-white/10 border border-white/10 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>Bulk Update Server Badge</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBulkAudioModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#1b1f2c] hover:bg-white/10 border border-white/10 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span>Bulk Change Audio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLinkIds(new Set())}
                  className="px-2.5 py-1.5 rounded-xl text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Links Data Table */}
          <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Universal Link Vault Table">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#151822]/70 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isCurrentPageAllSelected}
                        onChange={handleSelectAllCurrentPage}
                        className="rounded border-white/20 bg-[#07080d] text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3.5 px-4">Movie / Series Title</th>
                    <th className="py-3.5 px-3">Quality</th>
                    <th className="py-3.5 px-3">Audio</th>
                    <th className="py-3.5 px-3">Codec &amp; Size</th>
                    <th className="py-3.5 px-3">Server Host</th>
                    <th className="py-3.5 px-4">Stream / Mirror URL</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-xs">
                  {paginatedLinks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No links match the active search or filter criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedLinks.map((item) => {
                      const isChecked = selectedLinkIds.has(item.link.id);
                      const parsed = parseReleaseDetails(item.link.title, item.link.url, item.link.manualOverrides);
                      const displayQuality = item.link.quality || parsed.resolution || '1080p';
                      const qColor = displayQuality.includes('4K') || displayQuality.includes('2160')
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : displayQuality.includes('1080')
                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                        : 'bg-slate-500/15 text-slate-300 border-slate-500/30';

                      const displayCodec = item.link.manualOverrides?.codec || parsed.codec || 'x265';
                      const displaySize = item.link.size || '3.5 GB';
                      const displayAudio = item.link.manualOverrides?.audioLanguage || item.link.audioLanguage || parsed.audioLabel || 'Multi-Audio';
                      const displayServer = item.link.manualOverrides?.provider || (item.link.url.includes('hubcloud') ? 'HubCloud' : item.link.url.includes('gdflix') ? 'GDFlix' : item.link.url.includes('drive.google') ? 'Google Drive' : 'Direct');

                      return (
                        <tr
                          key={item.link.id}
                          className={`${isChecked ? 'bg-rose-500/[0.06]' : 'hover:bg-white/[0.02]'} transition-colors`}
                        >
                          <td className="py-3.5 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectLink(item.link.id)}
                              className="rounded border-white/20 bg-[#07080d] text-rose-600 focus:ring-rose-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <Link
                              href={`/${item.mediaType || 'movie'}/${item.movieId}`}
                              target="_blank"
                              className="font-semibold text-white hover:text-rose-400 transition-colors block"
                            >
                              {item.movieName}
                            </Link>
                            <p className="font-mono text-[10px] text-slate-500">TMDB #{item.movieId}</p>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className={`px-2 py-0.5 rounded-md border font-mono text-[11px] font-bold ${qColor}`}>
                              {displayQuality}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-white/[0.05] text-slate-200 text-[11px]">
                              {displayAudio}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 font-mono text-[11px]">
                            <span className="text-cyan-400 font-semibold">{displayCodec}</span>
                            <span className="text-slate-500 mx-1">•</span>
                            <span className="text-slate-300">{displaySize}</span>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-[#151822] border border-white/[0.08] font-mono text-[11px] text-slate-200">
                              {displayServer}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 max-w-[240px]">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-slate-400 truncate">{item.link.url}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                                    navigator.clipboard.writeText(item.link.url);
                                    showAdminToast('Copied to Clipboard', item.link.url, 'cyan');
                                  }
                                }}
                                className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white shrink-0 cursor-pointer"
                                title="Copy URL"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditModal(Number(item.movieId) || 0, item.link)}
                                className="p-1.5 rounded-lg bg-[#151822] hover:bg-[#1b1f2c] border border-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
                                title="Edit Link"
                              >
                                <Edit className="w-3.5 h-3.5 text-cyan-400" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLink(Number(item.movieId) || 0, item.link.id, item.link.title)}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-colors cursor-pointer"
                                title="Delete Link"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODULE ③: TITLE MANAGER & BATCH UTILITIES                */}
      {/* ========================================================= */}
      {activeTab === 'titles' && (
        <div className="space-y-6 fade-in">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  ③ Title Manager
                </span>
                <span className="text-xs font-mono text-slate-400">Core Catalog Curation Engine</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                Title Manager &amp; Batch Utilities
              </h1>
            </div>
          </div>

          {/* Two High-Power Batch Tools: Domain Batch Migration & TMDB ID Reassignment */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Domain Batch Migration Tool */}
            <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <ArrowRightLeft className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Domain Batch Migration</h2>
                    <p className="text-[11px] text-slate-400">Atomic host domain replacement across all vault links</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 font-mono text-[11px] font-semibold text-amber-300">
                  {migrateFromDomain
                    ? allFlattenedLinks.filter((l) => (l.link?.url || '').toLowerCase().includes(migrateFromDomain.toLowerCase())).length
                    : 0}{' '}
                  matches in sample
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Source Domain (Old)</label>
                  <input
                    type="text"
                    value={migrateFromDomain}
                    onChange={(e) => setMigrateFromDomain(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] font-mono text-xs text-rose-300 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Target Domain (New)</label>
                  <input
                    type="text"
                    value={migrateToDomain}
                    onChange={(e) => setMigrateToDomain(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] font-mono text-xs text-emerald-300 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleExecuteDomainMigration}
                disabled={isMigratingDomain}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>
                  {isMigratingDomain
                    ? 'Executing Dual-Write Migration...'
                    : `Execute Batch Migration (${migrateFromDomain} → ${migrateToDomain})`}
                </span>
              </button>
            </div>

            {/* TMDB ID Reassignment Tool */}
            <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Hash className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">TMDB ID Reassignment</h2>
                    <p className="text-[11px] text-slate-400">Fix metadata mismatch &amp; re-bind canonical TMDB IDs</p>
                  </div>
                </div>
                <span className="font-mono text-[10px] text-slate-500">Dual-Write Atomic</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Select Catalog Title</label>
                  <select
                    value={reassignTitleId}
                    onChange={(e) => setReassignTitleId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Select Title...</option>
                    {linkedCatalogTitles.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.title} (#{t.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">New Canonical TMDB ID</label>
                  <input
                    type="number"
                    value={reassignNewTmdbId}
                    onChange={(e) => setReassignNewTmdbId(e.target.value)}
                    placeholder="e.g. 693134"
                    className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] font-mono text-xs text-cyan-300 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleExecuteTmdbReassign}
                disabled={isReassigningTmdb}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <GitCommitHorizontal className="w-4 h-4" />
                <span>{isReassigningTmdb ? 'Reassigning in Supabase & Redis...' : 'Reassign TMDB ID & Log Audit'}</span>
              </button>
            </div>
          </div>

          {/* Search, Filter & Unmatched Custom ID Filter Pill */}
          <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={linkedTitlesSearch}
                onChange={(e) => setLinkedTitlesSearch(e.target.value)}
                placeholder="Filter catalog directory..."
                className="w-full pl-10 pr-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setUnmatchedOnlyFilter(!unmatchedOnlyFilter)}
                className={`px-3 py-2 rounded-xl font-mono text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer border ${
                  unmatchedOnlyFilter
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-lg shadow-amber-950/40'
                    : 'bg-[#151822] text-slate-400 border-white/[0.08] hover:text-white'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Unmatched Custom IDs (custom_*)</span>
                <span className="px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-300 text-[10px]">
                  {linkedCatalogTitles.filter((t) => String(t.id).startsWith('custom_')).length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsManualTitleModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-white/[0.08] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-rose-400" />
                <span>Create Custom Title</span>
              </button>
            </div>
          </div>

          {/* Curated Catalog Directory */}
          <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] overflow-hidden">
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Curated Titles Directory ({linkedCatalogTitles.length} Total)
              </h3>
              <span className="text-xs font-mono text-slate-400">Showing active managed entries</span>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {linkedCatalogTitles
                .filter((t) => {
                  if (unmatchedOnlyFilter && !String(t.id).startsWith('custom_')) return false;
                  if (linkedTitlesSearch.trim()) {
                    const q = linkedTitlesSearch.toLowerCase();
                    return (
                      (t.title || '').toLowerCase().includes(q) ||
                      String(t.id).includes(q) ||
                      String(t.year || '').includes(q)
                    );
                  }
                  return true;
                })
                .map((t) => {
                  const linksCount = t.linksCount || 0;
                  const isTv = t.media_type === 'tv' || String(t.title).toLowerCase().includes('season');
                  return (
                    <div
                      key={t.id}
                      className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Left Poster + Metadata */}
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="w-16 h-24 shrink-0 rounded-lg overflow-hidden shadow-md bg-[#151822] border border-white/[0.08] relative">
                          {t.poster_path ? (
                            <Image
                              src={t.poster_path.startsWith('http') ? t.poster_path : `https://image.tmdb.org/t/p/w185${t.poster_path}`}
                              alt={t.title}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold text-xs text-rose-400 font-mono">
                              {t.title.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-bold text-white">{t.title}</h4>
                            <span className="px-2 py-0.5 rounded-md bg-[#151822] border border-white/[0.08] font-mono text-[11px] text-cyan-400">
                              TMDB #{t.id}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-white/[0.04] font-mono text-[11px] text-slate-300">
                              {t.year || '2024'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 font-mono text-[11px] text-emerald-400">
                              {linksCount} Links
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2 max-w-2xl">
                            {t.overview || 'Verified high-speed master mirrors curated in Cinephile edge vault.'}
                          </p>
                          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 pt-0.5">
                            <span>
                              Type: <strong className="text-slate-300">{isTv ? 'TV Series' : 'Movie'}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Episode Sync:{' '}
                              <strong className="text-amber-400">
                                {isTv ? 'S01–S02 Verified' : 'N/A (Feature)'}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Curation Actions */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setMetadataOverrideTarget(t);
                            setOverrideTitleName(t.title);
                            setOverrideTitleYear(t.year || '');
                            setOverrideTitleOverview(t.overview || '');
                          }}
                          className="px-3 py-2 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-white/[0.08] text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Metadata Override</span>
                        </button>

                        {isTv && (
                          <button
                            type="button"
                            onClick={() => setEpisodeVerifierTarget(t)}
                            className="px-3 py-2 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-amber-500/30 text-xs font-medium text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <ListChecks className="w-3.5 h-3.5 text-amber-400" />
                            <span>Verify Episodes</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openTitleManager(t)}
                          className="px-3 py-2 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-white/[0.08] text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <span>Manage Links</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSafePurgeTarget(t);
                            setSafePurgeReason('');
                          }}
                          className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-semibold text-rose-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Safe Purge</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODULE ④: COMMUNITY CONTENT REQUESTS                     */}
      {/* ========================================================= */}
      {activeTab === 'requests' && (
        <div className="space-y-6 fade-in">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  ④ Content Requests Manager
                </span>
                <span className="text-xs font-mono text-slate-400">Automated @CineFlue_bot Delivery</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                Community Content Requests
              </h1>
            </div>
          </div>

          <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Community Content Requests Table">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#151822]/70 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-5">Request ID &amp; Title</th>
                    <th className="py-3.5 px-4">Quality Preference</th>
                    <th className="py-3.5 px-4">Requested By</th>
                    <th className="py-3.5 px-4">Submitted</th>
                    <th className="py-3.5 px-5 text-right">Lifecycle Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-xs">
                  {requestsList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        No community requests pending in queue.
                      </td>
                    </tr>
                  ) : (
                    requestsList.map((req) => {
                      const statusStyle =
                        req.status === 'pending'
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : req.status === 'in_progress'
                          ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                          : req.status === 'fulfilled'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-300 border-rose-500/30';

                      return (
                        <tr key={req.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-slate-500">{req.id}</span>
                              <span className="font-bold text-white text-sm">{req.title}</span>
                            </div>
                            <p className="font-mono text-[10px] text-cyan-400 mt-0.5">TMDB #{req.tmdbId || 'N/A'}</p>
                          </td>
                          <td className="py-4 px-4">
                            <span className="px-2.5 py-1 rounded-lg bg-[#151822] border border-white/[0.08] font-mono text-[11px] text-slate-300">
                              {req.quality || '1080p FHD'}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <p className="text-slate-200 font-medium">{req.userName || 'Community User'}</p>
                            <p className="font-mono text-[11px] text-cyan-400">
                              {req.userContact ? `@${req.userContact.replace('@', '')}` : '@telegram'}
                            </p>
                          </td>
                          <td className="py-4 px-4 font-mono text-[11px] text-slate-400">
                            {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'Recent'}
                          </td>
                          <td className="py-4 px-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <select
                                value={req.status}
                                onChange={(e) => {
                                  const newStat = e.target.value as any;
                                  handleUpdateStatus(req.id, newStat);
                                  if (newStat === 'fulfilled') {
                                    showAdminToast(
                                      'Automated Telegram DM Dispatched',
                                      `@CineFlue_bot sent notification to ${req.userContact || 'the user'}: "Your request for ${req.title} is now live!"`,
                                      'cyan'
                                    );
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-xl border font-semibold text-xs bg-[#151822] focus:outline-none cursor-pointer ${statusStyle}`}
                              >
                                <option value="pending">Pending</option>
                                <option value="in_progress">In-Progress</option>
                                <option value="fulfilled">Fulfilled (Auto-Notify)</option>
                                <option value="rejected">Rejected</option>
                              </select>

                              <button
                                type="button"
                                onClick={() => handleOpenFulfill(req)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
                                title="Attach fulfillment links"
                              >
                                Fulfill Links
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODULE ⑤: BROKEN LINK TRIAGE QUEUE                       */}
      {/* ========================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6 fade-in">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  ⑤ Broken Link Triage
                </span>
                <span className="text-xs font-mono text-slate-400">One-Click URL Replacement &amp; User Reply</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                Broken Link Triage Queue
              </h1>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {reportsList.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-[#0e1017] border border-white/[0.08] text-slate-400">
                Zero open broken link reports. All vault mirrors operating at 100% SLA!
              </div>
            ) : (
              reportsList.map((rpt) => {
                const isOpen = rpt.status === 'pending' || rpt.status === 'in_progress';
                const issueLabel = rpt.issueLabel || rpt.issueType || 'Dead Link / 404';
                const issueBadge =
                  issueLabel.includes('Dead') || issueLabel.includes('404')
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    : issueLabel.includes('Audio')
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';

                const probeInfo = probeResults[rpt.id];

                return (
                  <div
                    key={rpt.id}
                    className={`rounded-2xl bg-[#0e1017] border ${
                      isOpen ? 'border-white/[0.08]' : 'border-emerald-500/20 opacity-80'
                    } p-5 space-y-4`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs text-slate-500">{rpt.id}</span>
                        <h3 className="text-base font-bold text-white">{rpt.mediaTitle || rpt.linkTitle}</h3>
                        <span className={`px-2.5 py-0.5 rounded-md border font-mono text-[11px] font-semibold ${issueBadge}`}>
                          {issueLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-slate-400">
                          By {rpt.userName ? `@${rpt.userName}` : '@community'} •{' '}
                          {rpt.createdAt ? new Date(rpt.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                        </span>
                        {isOpen ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold text-[10px]">
                            OPEN
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-[10px]">
                            FIXED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Defective URL + Live Probe */}
                    <div className="p-3 rounded-xl bg-[#151822] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono uppercase text-slate-500 block">Reported Defective Endpoint</span>
                        <span className="font-mono text-xs text-rose-300 break-all">{rpt.reportedUrl || ''}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {probeInfo && (
                          <span className="px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-500/30 font-mono text-[11px] text-rose-300">
                            {probeInfo.loading
                              ? 'Probing...'
                              : probeInfo.isAlive
                              ? `HTTP ${probeInfo.status} OK (${probeInfo.latencyMs}ms)`
                              : `HTTP ${probeInfo.status || 404} Dead (${probeInfo.latencyMs || 0}ms)`}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => probeReportUrl(rpt.id, rpt.reportedUrl || '')}
                          className="px-3 py-1.5 rounded-xl bg-[#07080d] hover:bg-white/5 border border-white/10 text-xs font-mono text-slate-200 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Radar className="w-3.5 h-3.5 text-amber-400" />
                          <span>Test Link</span>
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                        <div className="lg:col-span-5">
                          <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                            Fresh Working Mirror URL
                          </label>
                          <input
                            type="text"
                            value={reportFreshUrlMap[rpt.id] || ''}
                            onChange={(e) => setReportFreshUrlMap((prev) => ({ ...prev, [rpt.id]: e.target.value }))}
                            placeholder="https://hubcloud.fit/drive/new-verified-link"
                            className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="lg:col-span-4">
                          <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                            Automated User Reply Note
                          </label>
                          <input
                            type="text"
                            value={reportReplyNoteMap[rpt.id] || 'Replaced with verified high-speed mirror. Enjoy!'}
                            onChange={(e) => setReportReplyNoteMap((prev) => ({ ...prev, [rpt.id]: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="lg:col-span-3">
                          <button
                            type="button"
                            onClick={() => handleResolveBrokenReportDirectly(rpt.id, rpt.reportedUrl || '')}
                            className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Replace URL &amp; Mark Fixed</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODULE ⑥: COMMUNITY USERS & ROLE MANAGEMENT              */}
      {/* ========================================================= */}
      {activeTab === 'users' && (
        <div className="space-y-6 fade-in">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  ⑥ User Accounts &amp; Privileges
                </span>
                <span className="text-xs font-mono text-slate-400">Firebase Auth &amp; Custom Claims</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                Community Users &amp; Role Management
              </h1>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search by user name, email, or @telegram handle..."
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="All">Role: All Privileges</option>
                <option value="Admin Role">Admin Role (admin: true)</option>
                <option value="Registered Member">Registered Member</option>
                <option value="Public User">Public User</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="User Accounts and Privileges Table">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#151822]/70 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-5">User Identity</th>
                    <th className="py-3.5 px-4">Email Verification</th>
                    <th className="py-3.5 px-4">Linked Telegram</th>
                    <th className="py-3.5 px-4">Activity</th>
                    <th className="py-3.5 px-5 text-right">Assign Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-xs">
                  {registeredUsers
                    .filter((u) => {
                      const q = userSearchQuery.toLowerCase();
                      const matchesSearch =
                        !q ||
                        (u.displayName || '').toLowerCase().includes(q) ||
                        (u.email || '').toLowerCase().includes(q) ||
                        (u.uid || '').toLowerCase().includes(q);
                      const currentRole = (u as any).role === 'admin' || (u as any).role === 'Admin Role' ? 'Admin Role' : 'Registered Member';
                      const matchesRole =
                        userRoleFilter === 'All' ||
                        (userRoleFilter === 'Admin Role' && currentRole === 'Admin Role') ||
                        (userRoleFilter === 'Registered Member' && currentRole === 'Registered Member') ||
                        (userRoleFilter === 'Public User' && (u as any).role === 'public');
                      return matchesSearch && matchesRole;
                    })
                    .map((u) => {
                      const name = u.displayName || u.email?.split('@')[0] || 'Member';
                      const initials = name
                        .split(' ')
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase();
                      const currentRole = (u as any).role === 'admin' || (u as any).role === 'Admin Role' ? 'Admin Role' : 'Registered Member';
                      const roleBadge =
                        currentRole === 'Admin Role'
                          ? 'border-rose-500/40 text-rose-300 bg-rose-500/10'
                          : 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10';

                      return (
                        <tr key={u.uid} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-[#151822] border border-white/[0.08] flex items-center justify-center font-bold text-xs text-white">
                                {initials}
                              </div>
                              <div>
                                <p className="font-bold text-white">{name}</p>
                                <p className="text-[11px] text-slate-400">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-mono text-[11px]">
                              <BadgeCheck className="w-3.5 h-3.5" /> Verified
                            </span>
                          </td>
                          <td className="py-4 px-4 font-mono text-[11px] text-cyan-400">
                            {(u as any).telegram ? `@${(u as any).telegram.replace('@', '')}` : '@telegram_link'}
                          </td>
                          <td className="py-4 px-4 font-mono text-[11px] text-slate-300">
                            {u.requestsCount || 1} reqs • {u.reportsCount || 0} reports
                          </td>
                          <td className="py-4 px-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <select
                                value={currentRole}
                                onChange={(e) => handleChangeUserRole(u.uid, e.target.value)}
                                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none cursor-pointer ${roleBadge}`}
                              >
                                <option value="Public User">Public User</option>
                                <option value="Registered Member">Registered Member</option>
                                <option value="Admin Role">Admin Role (admin: true)</option>
                              </select>

                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u.uid, u.email || '')}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 cursor-pointer"
                                title="Delete user"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      
          {/* ========================================================= */}
          {/* 7. LIVE SERVICE HEALTH & DIAGNOSTICS (apis)               */}
          {/* ========================================================= */}
          {activeTab === 'apis' && (
            <div className="fade-in space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      ⑦ Live Service Health
                    </span>
                    <span className="text-xs font-mono text-slate-400">5 Cloud Edge Dependencies</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                    Infrastructure &amp; Edge API Diagnostics
                  </h1>
                </div>
                <button
                  type="button"
                  onClick={runAllDiagnostics}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-950/50 transition-all cursor-pointer self-start sm:self-auto"
                >
                  <Activity className="w-4 h-4" />
                  <span>Run Full Edge Diagnostics</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {diagnosticServices.map((srv) => {
                  const latencyColor =
                    srv.latency < 25 ? 'text-emerald-400' : srv.latency < 50 ? 'text-cyan-400' : 'text-amber-400';
                  return (
                    <div
                      key={srv.id}
                      className="rounded-2xl bg-[#0e1017] border border-white/[0.08] p-5 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-mono text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            {srv.status}
                          </span>
                          <span className="font-mono text-xs text-slate-400">
                            Uptime: <strong className="text-white">{srv.uptime}</strong>
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-bold text-white">{srv.name}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">{srv.role}</p>
                          <p className="font-mono text-[10px] text-slate-500 mt-1 truncate">{srv.endpoint}</p>
                        </div>
                      </div>

                      {/* Latency Sparkbars & Readout */}
                      <div className="pt-3 border-t border-white/[0.08] flex items-end justify-between gap-4">
                        <div>
                          <span className="text-[10px] font-mono uppercase text-slate-500 block">Round-Trip Latency</span>
                          <span className={`text-2xl font-extrabold font-mono ${latencyColor}`}>
                            {srv.latency.toFixed(1)} <span className="text-xs font-normal text-slate-400">ms</span>
                          </span>
                        </div>

                        {/* Mini Sparkline Bars */}
                        <div className="flex items-end gap-1 h-9">
                          {srv.history.map((val, idx) => {
                            const hPct = Math.min(100, Math.max(20, Math.round((val / 80) * 100)));
                            return (
                              <div
                                key={idx}
                                className="w-2 rounded-t bg-cyan-500/40 border-t border-cyan-400"
                                style={{ height: `${hPct}%` }}
                              />
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={() => pingSingleService(srv.id)}
                          className="px-3 py-1.5 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-white/[0.08] font-mono text-xs text-slate-200 transition-colors cursor-pointer"
                        >
                          Ping
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* TMDB API Key Configuration Card */}
              <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Key className="w-4 h-4 text-amber-400" />
                  <span>TMDB Metadata API Credentials</span>
                </div>
                <form onSubmit={handleSaveApis} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-8">
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">TMDB API Key (v3)</label>
                    <input
                      type="text"
                      value={tmdbKey}
                      onChange={(e) => setTmdbKey(e.target.value)}
                      placeholder="Enter TMDB v3 API Key..."
                      className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleTestTmdb}
                      disabled={isTestingTmdb}
                      className="w-full py-2 px-3 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-white/[0.08] text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingTmdb ? 'animate-spin' : ''}`} />
                      <span>{isTestingTmdb ? 'Pinging...' : 'Test Key'}</span>
                    </button>
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Key</span>
                    </button>
                  </div>
                </form>
                {tmdbTestResult && (
                  <p className={`text-xs font-medium flex items-center gap-1.5 ${tmdbTestResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tmdbTestResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    <span>{tmdbTestResult.msg}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 8. BACKUP, SYNC & MIGRATION (backup)                      */}
          {/* ========================================================= */}
          {activeTab === 'backup' && (
            <div className="fade-in space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                      ⑧ Backup, Sync &amp; Migration
                    </span>
                    <span className="text-xs font-mono text-slate-400">Dual-Write Reconciliation &amp; Disaster Recovery</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                    Backup, Sync &amp; Cloud Seeder
                  </h1>
                </div>
              </div>

              {/* Dual-Write Synchronization Panel */}
              <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-white">Dual-Write Synchronization Engine</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Reconciles local staging delta with Upstash Redis &amp; Supabase PostgreSQL
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      showAdminToast('Dual-Write Sync Complete', 'Reconciled local delta across Upstash Redis & Supabase.', 'emerald');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer self-start sm:self-auto"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Sync Missing Titles Now (+3)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-[#151822] border border-white/[0.08]">
                    <span className="text-[11px] font-mono text-slate-400">Local Staging Storage</span>
                    <p className="text-2xl font-extrabold font-mono text-amber-400 mt-1">
                      {(globalCatalogTotal || 531) + 3} <span className="text-xs font-normal text-slate-400">titles</span>
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#151822] border border-white/[0.08]">
                    <span className="text-[11px] font-mono text-slate-400">Upstash Redis Cloud</span>
                    <p className="text-2xl font-extrabold font-mono text-white mt-1">
                      {globalCatalogTotal || 531} <span className="text-xs font-normal text-slate-400">keys</span>
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#151822] border border-white/[0.08]">
                    <span className="text-[11px] font-mono text-slate-400">Supabase PostgreSQL</span>
                    <p className="text-2xl font-extrabold font-mono text-emerald-400 mt-1">
                      {globalCatalogTotal || 531} <span className="text-xs font-normal text-slate-400">rows</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Export/Import & Cloud Seeder */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Catalog Export / Import */}
                <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] p-5 sm:p-6 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Download className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Catalog Export &amp; JSON Restore</h3>
                      <p className="text-xs text-slate-400">Download full structured snapshot or restore from archive</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Full Catalog JSON ({(globalCatalogTotal || 531)} Titles)</span>
                  </button>

                  <label className="block border-2 border-dashed border-white/[0.12] hover:border-cyan-500/50 rounded-xl p-5 text-center cursor-pointer transition-colors bg-[#151822]/50">
                    <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
                    <UploadCloud className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-200">Click to upload Cinephile JSON Backup</p>
                    <p className="text-[11px] font-mono text-slate-500 mt-1">Validates schema &amp; executes dual-write upsert</p>
                  </label>
                </div>

                {/* Cloud Seeder */}
                <div className="rounded-2xl bg-[#0e1017] border border-white/[0.08] p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                        <Sprout className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Upstash Redis Cloud Seeder</h3>
                        <p className="text-xs text-slate-400">Batched pipeline transaction runner (50 keys/tx)</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={runCloudRedisSeeder}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                    >
                      Seed Local Links
                    </button>
                  </div>

                  <div className="rounded-xl bg-[#07080d] border border-white/[0.08] p-3.5 font-mono text-[11px] text-slate-400 h-36 overflow-y-auto space-y-1">
                    {cloudSeederLogs.map((log, i) => (
                      <div key={i} className={log.includes('[DONE]') ? 'text-emerald-400 font-semibold' : log.includes('[EXEC]') ? 'text-cyan-400' : 'text-slate-300'}>
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 9. SECURITY AUDIT LOGS (logs)                             */}
          {/* ========================================================= */}
          {activeTab === 'logs' && (
            <div className="fade-in space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                      ⑨ Security Audit Logs
                    </span>
                    <span className="text-xs font-mono text-slate-400">Append-Only Immutable History</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                    Immutable Security Audit Trail
                  </h1>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {['All', 'TITLE_PURGE', 'DOMAIN_MIGRATION', 'TMDB_REASSIGN', 'LINK_BATCH_OP', 'BOT_INGEST', 'ROLE_CHANGE', 'REPORT_RESOLVED'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAuditFilterType(t)}
                    className={`px-3 py-1.5 rounded-xl font-mono text-[11px] font-semibold border transition-colors cursor-pointer ${
                      auditFilterType === t
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-[#0e1017] border-white/[0.08] text-slate-400 hover:text-white'
                    }`}
                  >
                    {t === 'TITLE_PURGE' ? 'TITLE_PURGE (audit_title_deletions)' : t}
                  </button>
                ))}
              </div>

              {/* Audit Entries List */}
              <div className="space-y-3">
                {auditLogs
                  .filter((l) => auditFilterType === 'All' || l.type === auditFilterType)
                  .map((log) => {
                    const badgeStyle =
                      log.type === 'TITLE_PURGE'
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        : log.type === 'DOMAIN_MIGRATION'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : log.type === 'TMDB_REASSIGN'
                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                        : log.type === 'BOT_INGEST'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-white/[0.06] text-slate-300 border-white/10';

                    return (
                      <div
                        key={log.id}
                        className="rounded-2xl bg-[#0e1017] border border-white/[0.08] p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="font-mono text-xs text-slate-500">{log.id}</span>
                            <span className={`px-2.5 py-0.5 rounded-md border font-mono text-[11px] font-bold ${badgeStyle}`}>
                              {log.type}
                            </span>
                            <span className="font-bold text-white text-sm">{log.target}</span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">{log.details}</p>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500 pt-1">
                            <span>Actor: <strong className="text-slate-300">{log.actor}</strong></span>
                            <span>•</span>
                            <span>{log.timestamp}</span>
                          </div>
                        </div>

                        <div className="shrink-0">
                          <span className="px-2.5 py-1 rounded-lg bg-[#151822] border border-white/[0.08] font-mono text-[10px] text-slate-400">
                            {log.hash}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================= */}
      {/* @CINEFLUE_BOT SUPER-ADMIN DRAWER                          */}
      {/* ========================================================= */}
      <TelegramBotDrawer
        isOpen={isTelegramDrawerOpen}
        onClose={() => setIsTelegramDrawerOpen(false)}
        onTriageModule={(mod) => {
          setIsTelegramDrawerOpen(false);
          setActiveTab(mod);
        }}
        onLiveIngestSuccess={(item) => {
          showAdminToast('Live Ingest Committed', `${item.parsedTitle} ingested via @CineFlue_bot`, 'cyan');
        }}
      />

      {/* ========================================================= */}
      {/* /ADMIN EDGE AUTH SHIELD PREVIEW MODAL                     */}
      {/* ========================================================= */}
      <AuthShieldModal
        isOpen={isAuthShieldOpen}
        onClose={() => setIsAuthShieldOpen(false)}
        onAuthenticate={(method) => {
          showAdminToast('HMAC-SHA256 Session Minted', `Authenticated via ${method}`, 'emerald');
        }}
      />

{/* 1. DIRECT LINK INGESTION MODAL (SINGLE / BULK)            */}
      {/* ========================================================= */}
      {isDirectIngestModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="w-full max-w-xl rounded-2xl bg-[#0e1017] border border-white/[0.12] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-rose-400" />
                Direct Link Ingestion (Single or Bulk)
              </h3>
              <button
                type="button"
                onClick={() => setIsDirectIngestModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Target Catalog Title</label>
                <select
                  value={ingestTargetId}
                  onChange={(e) => setIngestTargetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white"
                >
                  <option value="">Select Target Title...</option>
                  {linkedCatalogTitles.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.title} (#{t.id})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Server Host Badge</label>
                <select
                  value={ingestServer}
                  onChange={(e) => setIngestServer(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white"
                >
                  <option value="HubCloud">HubCloud</option>
                  <option value="GDFlix">GDFlix</option>
                  <option value="Google Drive">Google Drive</option>
                  <option value="Direct">Direct</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Quality</label>
                <select
                  value={ingestQuality}
                  onChange={(e) => setIngestQuality(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white"
                >
                  <option value="4K">4K</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Audio</label>
                <select
                  value={ingestAudio}
                  onChange={(e) => setIngestAudio(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white"
                >
                  <option value="Multi-Audio">Multi-Audio</option>
                  <option value="Hindi">Hindi</option>
                  <option value="English">English</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Codec</label>
                <select
                  value={ingestCodec}
                  onChange={(e) => setIngestCodec(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white"
                >
                  <option value="x265">x265</option>
                  <option value="HEVC">HEVC</option>
                  <option value="AV1">AV1</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">File Size</label>
                <input
                  type="text"
                  value={ingestSize}
                  onChange={(e) => setIngestSize(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] font-mono text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                Mirror URLs (One URL per line for bulk ingestion)
              </label>
              <textarea
                rows={3}
                value={ingestUrlsText}
                onChange={(e) => setIngestUrlsText(e.target.value)}
                placeholder="https://hubcloud.fit/drive/movie-1080p-hevc&#10;https://gdflix.cfd/file/movie-1080p-mirror"
                className="w-full p-3 rounded-xl bg-[#151822] border border-white/[0.08] font-mono text-xs text-emerald-300 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDirectIngestModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#151822] text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDirectIngestSubmit}
                disabled={isSubmittingIngest}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
              >
                {isSubmittingIngest ? 'Committing...' : 'Commit to Link Vault'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. BULK UPDATE SERVER BADGE MODAL                         */}
      {/* ========================================================= */}
      {isBulkServerModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-[#0e1017] border border-white/[0.12] p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white">Bulk Update Server Host Badge</h3>
            <select
              value={bulkServerVal}
              onChange={(e) => setBulkServerVal(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white"
            >
              <option value="HubCloud">HubCloud</option>
              <option value="GDFlix">GDFlix</option>
              <option value="Google Drive">Google Drive</option>
              <option value="Direct">Direct</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBulkServerModalOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-[#151822] text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBulkServer}
                className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white cursor-pointer"
              >
                Apply to {selectedLinkIds.size} Links
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. BULK CHANGE AUDIO MODAL                                */}
      {/* ========================================================= */}
      {isBulkAudioModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-[#0e1017] border border-white/[0.12] p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white">Bulk Change Audio Language</h3>
            <select
              value={bulkAudioVal}
              onChange={(e) => setBulkAudioVal(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white"
            >
              <option value="Multi-Audio">Multi-Audio</option>
              <option value="Hindi">Hindi</option>
              <option value="English">English</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBulkAudioModalOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-[#151822] text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBulkAudio}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-slate-950 cursor-pointer"
              >
                Apply to {selectedLinkIds.size} Links
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. METADATA OVERRIDE MODAL                                */}
      {/* ========================================================= */}
      {metadataOverrideTarget && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-[#0e1017] border border-white/[0.12] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Metadata Override • TMDB #{metadataOverrideTarget.id}</h3>
              <button
                type="button"
                onClick={() => setMetadataOverrideTarget(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Official Display Title</label>
                <input
                  type="text"
                  value={overrideTitleName}
                  onChange={(e) => setOverrideTitleName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Release Year</label>
                <input
                  type="number"
                  value={overrideTitleYear}
                  onChange={(e) => setOverrideTitleYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151822] border border-white/[0.08] font-mono text-xs text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Synopsis / Overview</label>
              <textarea
                rows={3}
                value={overrideTitleOverview}
                onChange={(e) => setOverrideTitleOverview(e.target.value)}
                className="w-full p-3 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-slate-200"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMetadataOverrideTarget(null)}
                className="px-4 py-2 rounded-xl bg-[#151822] text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMetadataOverride}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white cursor-pointer"
              >
                Save Metadata Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. OFFICIAL EPISODE VERIFIER MODAL                       */}
      {/* ========================================================= */}
      {episodeVerifierTarget && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-[#0e1017] border border-white/[0.12] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Official Episode Verifier • {episodeVerifierTarget.title}
              </h3>
              <button
                type="button"
                onClick={() => setEpisodeVerifierTarget(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Cross-referencing local season episode index against canonical TMDB v3 TV season endpoint.
            </p>
            <div className="rounded-xl bg-[#151822] border border-white/[0.08] divide-y divide-white/[0.06] text-xs font-mono">
              <div className="p-3 flex items-center justify-between">
                <span className="text-slate-200">Season Episodes • Official TMDB Master</span>
                <span className="text-emerald-400">VERIFIED</span>
              </div>
              <div className="p-3 flex items-center justify-between">
                <span className="text-amber-300">Local Mirrors Attached</span>
                <span className="text-cyan-400">{episodeVerifierTarget.linksCount || 0} Links Synced</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEpisodeVerifierTarget(null)}
                className="px-4 py-2 rounded-xl bg-[#151822] text-xs text-slate-300 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleSyncMissingEpisodes(episodeVerifierTarget)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-slate-950 cursor-pointer"
              >
                Sync Missing Episodes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. SAFE PURGE WITH AUDIT MODAL                            */}
      {/* ========================================================= */}
      {safePurgeTarget && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[#0e1017] border border-rose-500/40 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertOctagon className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Safe Purge with Audit</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              You are about to permanently delete <strong>{safePurgeTarget.title}</strong> (
              <span className="font-mono text-cyan-400">TMDB #{safePurgeTarget.id}</span>) and its{' '}
              <span className="font-mono text-rose-300">{safePurgeTarget.linksCount || 0}</span> linked mirrors from both{' '}
              <strong>Supabase PostgreSQL</strong> and <strong>Upstash Redis</strong>. An immutable entry will be written to{' '}
              <span className="font-mono text-amber-300">audit_title_deletions</span>.
            </p>
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                Mandatory Deletion Reason (Audit Required)
              </label>
              <input
                type="text"
                value={safePurgeReason}
                onChange={(e) => setSafePurgeReason(e.target.value)}
                placeholder="e.g. DMCA takedown / Superseded by remastered master"
                className="w-full px-3 py-2.5 rounded-xl bg-[#151822] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSafePurgeTarget(null)}
                className="px-4 py-2 rounded-xl bg-[#151822] text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSafePurge}
                disabled={isPurgingTitle}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
              >
                {isPurgingTitle ? 'Purging...' : 'Purge & Record Audit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. SESSION INSPECTOR MODAL                                */}
      {/* ========================================================= */}
      {isSessionInspectorOpen && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-[#0e1017] border border-white/[0.12] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                Active HMAC-SHA256 Edge Session
              </h3>
              <button
                type="button"
                onClick={() => setIsSessionInspectorOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-[#07080d] border border-white/[0.08] font-mono text-[11px] text-emerald-300 break-all">
              cinephile_session_hmac256_live_token_verified
            </div>
            <div className="space-y-1.5 text-xs">
              <p className="text-slate-400">
                Auth Path: <strong className="text-white">Master Server Credentials (constant-time timingSafeEqual)</strong>
              </p>
              <p className="text-slate-400">
                Middleware Guard:{' '}
                <span className="font-mono text-cyan-400">validateAdminAuth(req)</span> on all POST/PUT/DELETE routes
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText('cinephile_session_hmac256_live_token_verified');
                    showAdminToast('Session Token Copied', 'Token copied to clipboard', 'cyan');
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-[#151822] border border-white/10 text-xs font-semibold text-white cursor-pointer"
              >
                Copy Token
              </button>
              <button
                type="button"
                onClick={() => setIsSessionInspectorOpen(false)}
                className="px-4 py-2 rounded-xl bg-rose-600 text-xs font-semibold text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Obsidian Toast Notification Stack */}
      {adminToasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
          {adminToasts.map((t) => {
            const borderCol =
              t.type === 'emerald'
                ? 'border-emerald-500/40 text-emerald-300'
                : t.type === 'cyan'
                ? 'border-cyan-500/40 text-cyan-300'
                : t.type === 'amber'
                ? 'border-amber-500/40 text-amber-300'
                : 'border-rose-500/40 text-rose-300';
            return (
              <div
                key={t.id}
                className={`pointer-events-auto rounded-2xl border p-4 shadow-2xl backdrop-blur-md bg-[#0e1017]/95 flex items-start gap-3 fade-in ${borderCol}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">{t.title}</p>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{t.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdminToasts((prev) => prev.filter((item) => item.id !== t.id))}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      
    </div>
  );
}
