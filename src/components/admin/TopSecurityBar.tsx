'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  KeyRound,
  ArrowLeftRight,
  Send,
  RefreshCw,
  ExternalLink,
  Lock,
  Menu,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

interface TopSecurityBarProps {
  adminUser?: string;
  initialTtlSeconds?: number;
  activeModule?: string;
  onToggleMobileSidebar?: () => void;
  dualWriteSync?: {
    status: 'synchronized' | 'divergent' | 'syncing';
    redisTitles: number;
    supabaseTitles: number;
  };
  openAlertsCount?: number;
  onOpenAuthShieldModal: () => void;
  onOpenTelegramBotDrawer: () => void;
  onRefreshData: () => void;
  onLogout: () => void;
  isRefreshing?: boolean;
}

export const TopSecurityBar: React.FC<TopSecurityBarProps> = ({
  adminUser = 'Shyam',
  initialTtlSeconds = 86400,
  activeModule = 'overview',
  onToggleMobileSidebar,
  dualWriteSync = { status: 'synchronized', redisTitles: 531, supabaseTitles: 531 },
  openAlertsCount = 3,
  onOpenAuthShieldModal,
  onOpenTelegramBotDrawer,
  onRefreshData,
  onLogout,
  isRefreshing = false,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(initialTtlSeconds);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const isDivergent = dualWriteSync.status === 'divergent';

  return (
    <header className="sticky top-0 z-30 bg-[#0e1017]/95 backdrop-blur-md border-b border-white/[0.08] mb-6">
      <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Left: Mobile Trigger & Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          {onToggleMobileSidebar && (
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              className="lg:hidden p-2 rounded-xl bg-[#151822] border border-white/[0.08] text-slate-300 hover:text-white cursor-pointer"
              aria-label="Toggle navigation sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <nav className="flex items-center gap-2 text-xs sm:text-sm font-mono truncate">
            <span className="text-slate-500 hidden sm:inline">cinephile.edge</span>
            <span className="text-slate-600 hidden sm:inline">/</span>
            <span className="px-2 py-1 rounded-md bg-[#151822] border border-white/[0.08] text-rose-400 font-semibold">
              /admin
            </span>
            <span className="text-slate-600">/</span>
            <span className="text-white font-semibold truncate">
              {activeModule}
            </span>
          </nav>
        </div>

        {/* Right: Security Badges & Action Triggers */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Dual-Write Status Indicator */}
          <div
            className={`hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#151822] border border-white/[0.08] text-xs font-mono ${
              isDivergent ? 'text-amber-300' : 'text-slate-300'
            }`}
            title={`Upstash Redis: ${dualWriteSync.redisTitles} keys | Supabase: ${dualWriteSync.supabaseTitles} rows`}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`rounded-full h-2 w-2 ${
                  isDivergent ? 'bg-amber-400 animate-ping' : 'status-pulse bg-emerald-400'
                }`}
              />
            </span>
            <span className="font-medium">Redis</span>
            <ArrowLeftRight className="w-3 h-3 text-cyan-400" />
            <span className="font-medium">Supabase</span>
            <span
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                isDivergent
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                  : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              }`}
            >
              {isDivergent ? 'DIVERGENT' : 'SYNCED'}
            </span>
          </div>

          {/* Live HMAC-SHA256 Edge Session Badge */}
          <button
            type="button"
            onClick={onOpenAuthShieldModal}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-emerald-500/25 text-xs transition-colors group cursor-pointer"
            title="HMAC-SHA256 24h Edge Session Token (Click to inspect security shield)"
          >
            <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono text-slate-300">HMAC-SHA256</span>
            <span className="font-mono text-emerald-400 font-semibold">
              {formatCountdown(secondsRemaining)}
            </span>
            <span className="hidden 2xl:inline text-[10px] font-mono text-slate-400 border-l border-white/10 pl-2">
              validateAdminAuth
            </span>
          </button>

          {/* @CineFlue_bot Super-Admin Simulator Trigger */}
          <button
            type="button"
            onClick={onOpenTelegramBotDrawer}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-medium transition-all cursor-pointer"
            title="Open @CineFlue_bot Super-Admin Pipeline Simulator"
          >
            <Send className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">@CineFlue_bot</span>
            {openAlertsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px]">
                {openAlertsCount}
              </span>
            )}
          </button>

          {/* Test /admin Auth Shield Button */}
          <button
            type="button"
            onClick={onOpenAuthShieldModal}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-950/50 transition-all cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Test /admin Auth Shield</span>
            <span className="sm:hidden">Auth Shield</span>
          </button>

          {/* Refresh Data Sync Button */}
          <button
            type="button"
            onClick={onRefreshData}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Catalog Sync"
            aria-label="Refresh Catalog Sync"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Public Site Link */}
          <Link
            href="/"
            className="p-2 rounded-xl bg-[#151822] hover:bg-[#1b1f2c] border border-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="View Public Site"
            aria-label="View Public Site"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400 hover:text-cyan-400" />
          </Link>

          {/* Lock / Logout Session */}
          <button
            type="button"
            onClick={onLogout}
            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-colors cursor-pointer"
            title="Lock Session / Sign Out"
            aria-label="Lock Session / Sign Out"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopSecurityBar;
