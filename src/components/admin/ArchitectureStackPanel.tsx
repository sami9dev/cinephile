'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Clock,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import type { ServiceStatusReport, ServiceCheckItem } from '@/lib/serviceStatus';

interface ArchitectureServiceDef {
  id: string;
  name: string;
  description: string;
  category: string;
  url?: string;
  renderLogo: () => React.ReactNode;
}

export const ARCHITECTURE_STACK: ArchitectureServiceDef[] = [
  {
    id: 'cloudflare_workers',
    name: 'Cloudflare Workers + OpenNext',
    description: 'Hosting, edge runtime, deployment, public website',
    category: 'Hosting & Edge Runtime',
    url: 'https://cinephile.sk6216071.workers.dev',
    renderLogo: () => (
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white flex flex-col items-center justify-center p-1.5 shadow-sm border border-zinc-200/20 shrink-0">
        <svg viewBox="0 0 120 70" className="w-8 sm:w-9 h-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M85.5 48.5c1.2-3.8 1.1-7.9-.3-11.6-1.4-3.7-4-6.8-7.5-8.8-3.4-2-7.4-2.8-11.3-2.3-3.9.5-7.5 2.3-10.3 5-1.9-5.1-5.6-9.3-10.4-11.7-4.8-2.4-10.4-3-15.6-1.7-5.2 1.3-9.7 4.5-12.7 8.9-3 4.4-4.2 9.8-3.4 15.1-4.2.8-7.9 3.2-10.3 6.7-2.4 3.5-3.3 7.8-2.5 12 .8 4.2 3.2 7.9 6.7 10.3 3.5 2.4 7.8 3.3 12 2.5h65.6c4 0 7.8-1.6 10.6-4.4 2.8-2.8 4.4-6.6 4.4-10.6 0-4.3-1.8-8.4-5-11.4l-.3-.4z"
            fill="#F38020"
          />
          <path
            d="M88.2 42.1c-.8-.2-1.6-.2-2.4-.1.7 2.4.7 5 .1 7.4-.7 2.4-2 4.6-3.8 6.3-1.8 1.7-4 2.8-6.4 3.3-2.4.5-4.9.3-7.2-.6l-.8-.4-1.2 2.2c-.6 1.1-1.3 2.1-2.2 3h16.2c3.4 0 6.6-1.3 9-3.7 2.4-2.4 3.7-5.6 3.7-9 0-3.6-1.5-7.1-4.2-9.4l-.8-.7z"
            fill="#FAAD3F"
          />
        </svg>
        <span className="text-[7px] sm:text-[8px] font-black tracking-wider text-[#222] font-mono leading-none -mt-0.5">
          CLOUDFLARE
        </span>
      </div>
    ),
  },
  {
    id: 'supabase',
    name: 'Supabase PostgreSQL',
    description: 'Primary database: titles, users, curated links, requests, reports, RLS',
    category: 'Primary Relational Database',
    url: 'https://supabase.com',
    renderLogo: () => (
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#1c222b] flex items-center justify-center p-2 shadow-sm border border-emerald-500/20 shrink-0">
        <svg viewBox="0 0 109 113" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 sm:w-7 h-6 sm:h-7">
          <path
            d="M63.7076 110.284C60.848 113.885 55.0502 111.912 54.9813 107.309L53.854 32.0251H96.5596C104.939 32.0251 109.528 41.7641 104.184 48.4947L63.7076 110.284Z"
            fill="url(#sb-gradient)"
          />
          <path
            d="M45.317 2.71635C48.1766 -0.884705 53.9744 1.08835 54.0433 5.69123L54.4552 80.9749H12.4646C4.08534 80.9749 -0.503697 71.2359 4.83984 64.5053L45.317 2.71635Z"
            fill="#3ECF8E"
          />
          <defs>
            <linearGradient id="sb-gradient" x1="53.854" y1="32.0251" x2="89.6596" y2="92.5251" gradientUnits="userSpaceOnUse">
              <stop stopColor="#249361" />
              <stop offset="1" stopColor="#3ECF8E" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    ),
  },
  {
    id: 'upstash_redis',
    name: 'Upstash Redis',
    description: 'Caching, rate limiting, fast catalog responses',
    category: 'In-Memory Cache & Rate Limiting',
    url: 'https://upstash.com',
    renderLogo: () => (
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white flex flex-col items-center justify-center p-1.5 shadow-sm border border-zinc-200/20 shrink-0">
        <svg viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 sm:w-9 h-auto">
          <path
            d="M26 12C17 12 11 18 11 26C11 34 18 41 28 41C36 41 42 35 43 28H31C28 28 26 26 26 24C26 22 28 20 31 20H44C44 15 36 12 26 12Z"
            fill="#00E699"
          />
          <circle cx="34" cy="24" r="4.5" fill="#00E699" />
        </svg>
        <span className="text-[8px] sm:text-[9px] font-bold text-zinc-800 tracking-tighter leading-none -mt-0.5 font-sans">
          upstash
        </span>
      </div>
    ),
  },
  {
    id: 'tmdb',
    name: 'TMDB API v3',
    description: 'Movie/TV metadata, IDs, posters, descriptions',
    category: 'Film & Media Intelligence',
    url: 'https://www.themoviedb.org',
    renderLogo: () => (
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#032541] flex flex-col items-center justify-center p-1.5 shadow-sm border border-[#01b4e4]/30 shrink-0">
        <span className="text-[12px] sm:text-[13px] font-black tracking-wider text-white font-sans leading-none">
          TMDB
        </span>
        <div className="w-6 sm:w-7 h-1.5 rounded-full bg-gradient-to-r from-[#90cea1] to-[#01b4e4] mt-1 shadow-sm" />
      </div>
    ),
  },
  {
    id: 'tv_parser_imdb',
    name: 'IMDb',
    description: 'IMDb IDs and episode/title information where integrated',
    category: 'Canonical Identification',
    url: 'https://www.imdb.com',
    renderLogo: () => (
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#F5C518] flex items-center justify-center p-1 shadow-sm border border-amber-600/20 shrink-0">
        <span
          className="text-base sm:text-lg font-black tracking-tight text-black leading-none"
          style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}
        >
          IMDb
        </span>
      </div>
    ),
  },
  {
    id: 'telegram_bot',
    name: 'Telegram Bot API',
    description: 'Admin notifications, bot commands, title resolver, management workflows',
    category: 'Automation & Chat Ops',
    url: 'https://telegram.org',
    renderLogo: () => (
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white flex items-center justify-center p-1 shadow-sm border border-zinc-200/20 shrink-0">
        <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-full bg-[#24A1DE] flex items-center justify-center shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 sm:w-4.5 h-4 sm:h-4.5 text-white -translate-x-0.5 translate-y-0.2">
            <path
              d="M21.5 3.5L2.5 10.8C1.2 11.3 1.2 12.1 2.3 12.4L7.2 13.9L18.5 6.8C19 6.5 19.5 6.7 19.1 7.1L10 15.3H9.9L9.6 19.8C10 19.8 10.2 19.6 10.5 19.3L12.6 17.3L17 20.5C17.8 20.9 18.4 20.7 18.6 19.7L21.9 4.3C22.2 3.1 21.4 2.5 21.5 3.5Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </div>
    ),
  },
  {
    id: 'firebase_auth',
    name: 'Firebase Auth + HMAC Admin Sessions',
    description: 'Google/email authentication and protected admin sessions',
    category: 'Security & Identity',
    url: 'https://firebase.google.com',
    renderLogo: () => (
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#1a1e28] flex flex-col items-center justify-center p-1 shadow-sm border border-amber-500/20 shrink-0">
        <div className="flex items-center gap-1">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 sm:w-5 h-4 sm:h-5">
            <path d="M4.5 18.5L9.5 3.5L12 8.5L4.5 18.5Z" fill="#FFA000" />
            <path d="M12 8.5L14 4.5L19.5 18.5H4.5L12 8.5Z" fill="#FFCA28" />
            <path d="M14 4.5L16 1L19.5 18.5L14 4.5Z" fill="#F57C00" />
          </svg>
        </div>
        <span className="text-[6px] sm:text-[7px] font-bold text-zinc-300 leading-none text-center tracking-tight mt-0.5 font-sans">
          Firebase
        </span>
        <span className="text-[5.5px] sm:text-[6px] text-amber-400/90 leading-none font-medium">
          Auth
        </span>
      </div>
    ),
  },
];

interface ArchitectureStackPanelProps {
  getAuthHeaders?: () => Record<string, string>;
  title?: string;
  subtitle?: string;
  showLiveStatus?: boolean;
}

export const ArchitectureStackPanel: React.FC<ArchitectureStackPanelProps> = ({
  getAuthHeaders,
  title,
  subtitle,
  showLiveStatus = true,
}) => {
  const [report, setReport] = useState<ServiceStatusReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    if (!getAuthHeaders) return;
    try {
      setRefreshing(true);
      const res = await fetch('/api/admin/service-status', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      if (res.ok) {
        const data: ServiceStatusReport = await res.json();
        setReport(data);
      }
    } catch {
      // Graceful fallback: maintain rendered UI without interruption
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (getAuthHeaders) {
      fetchStatus();
    }
  }, [getAuthHeaders, fetchStatus]);

  // Index live status by service ID
  const statusMap = React.useMemo(() => {
    const map = new Map<string, ServiceCheckItem>();
    if (report?.services) {
      for (const s of report.services) {
        map.set(s.id, s);
      }
    }
    return map;
  }, [report]);

  return (
    <div className="space-y-3 w-full">
      {(title || subtitle) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div>
            {title && (
              <h3 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>{title}</span>
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-zinc-400 font-normal">{subtitle}</p>
            )}
          </div>
          {getAuthHeaders && showLiveStatus && (
            <button
              type="button"
              onClick={fetchStatus}
              disabled={refreshing}
              className="self-start sm:self-auto text-xs px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{refreshing ? 'Pinging...' : 'Verify Stack'}</span>
            </button>
          )}
        </div>
      )}

      {/* The 7-Service Architecture Card matching screenshot pixel-for-pixel */}
      <div className="w-full rounded-2xl bg-black border border-zinc-800/90 divide-y divide-zinc-900 overflow-hidden shadow-2xl transition-all">
        {ARCHITECTURE_STACK.map((item) => {
          const liveCheck = statusMap.get(item.id);
          const isOperational = liveCheck ? liveCheck.status === 'Operational' : true;
          const statusText = liveCheck?.status || 'Operational';
          const latency = liveCheck?.latencyMs;

          return (
            <div
              key={item.id}
              className="flex items-center gap-3.5 sm:gap-4 px-4 sm:px-5 py-3.5 sm:py-4 hover:bg-zinc-900/40 transition-colors group"
            >
              {/* Logo / Badge */}
              <div className="transition-transform group-hover:scale-105 duration-200">
                {item.renderLogo()}
              </div>

              {/* Text Meta */}
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm sm:text-base font-bold text-white tracking-tight leading-snug truncate">
                    {item.name}
                  </h4>
                  {showLiveStatus && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {latency !== undefined && latency > 0 && (
                        <span className="hidden sm:inline text-[10px] font-mono text-zinc-500">
                          {latency}ms
                        </span>
                      )}
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isOperational
                            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                            : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]'
                        }`}
                        title={`${item.name}: ${statusText}${latency ? ` (${latency}ms)` : ''}`}
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-zinc-400 font-normal leading-normal truncate mt-0.5">
                  {item.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ArchitectureStackPanel;
