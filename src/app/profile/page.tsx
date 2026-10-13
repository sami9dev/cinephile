'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  User as UserIcon,
  Mail,
  Edit3,
  Check,
  Star,
  Clock,
  Eye,
  Bookmark,
  Heart,
  Layers,
  Sparkles,
  ShieldCheck,
  LogOut,
  LogIn,
  Film,
  Tv,
  CheckCircle2,
  XCircle,
  Clock3,
  Play,
  RefreshCw,
  Send,
  Bell,
  Wrench,
  ExternalLink,
  Copy,
  Check as CheckIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useWatchlist } from '@/context/WatchlistContext';
import AuthModal from '@/components/AuthModal';
import RequestLinkModal from '@/components/RequestLinkModal';
import { UserRequest, DefectiveLinkReport, TelegramLink } from '@/types';

export default function ProfilePage() {
  const { userProfile, updateProfileData, isLoggedIn, logout, getIdToken } = useAuth();
  const { stats, watchlist } = useWatchlist();

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(userProfile.displayName || '');
  const [bio, setBio] = useState(userProfile.bio || '');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  // My Requests state
  const [myRequests, setMyRequests] = useState<UserRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestFilter, setRequestFilter] = useState<'all' | 'pending' | 'in_progress' | 'fulfilled' | 'rejected'>('all');

  // Telegram Notifications state
  const [telegramStatus, setTelegramStatus] = useState<{
    isLinked: boolean;
    link: TelegramLink | null;
    botUsername: string;
  }>({
    isLinked: false,
    link: null,
    botUsername: 'CineFlue_bot',
  });
  const [isLoadingTelegram, setIsLoadingTelegram] = useState(false);
  const [linkingData, setLinkingData] = useState<{
    token: string;
    expiresAt: string;
    botUsername: string;
    telegramUrl: string;
  } | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isUpdatingPrefs, setIsUpdatingPrefs] = useState(false);

  // My Reports state
  const [myReports, setMyReports] = useState<DefectiveLinkReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'in_progress' | 'fixed' | 'dismissed'>('all');

  // In-App Website Notification Settings state
  const [inAppRequests, setInAppRequests] = useState(true);
  const [inAppReports, setInAppReports] = useState(true);
  const [isUpdatingInAppPrefs, setIsUpdatingInAppPrefs] = useState(false);

  useEffect(() => {
    if (userProfile && (userProfile as any).notificationPreferences) {
      const prefs = (userProfile as any).notificationPreferences;
      if (typeof prefs.inAppRequests === 'boolean') setInAppRequests(prefs.inAppRequests);
      if (typeof prefs.inAppReports === 'boolean') setInAppReports(prefs.inAppReports);
    }
  }, [userProfile]);

  const handleToggleInAppPreference = async (category: 'requests' | 'reports', val: boolean) => {
    if (category === 'requests') setInAppRequests(val);
    else setInAppReports(val);

    try {
      setIsUpdatingInAppPrefs(true);
      const token = await getIdToken();
      if (!token) return;
      await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          notificationPreferences: {
            inAppRequests: category === 'requests' ? val : inAppRequests,
            inAppReports: category === 'reports' ? val : inAppReports,
          },
        }),
      });
    } catch (e) {
      console.warn('Failed to update in-app notification preferences:', e);
    } finally {
      setIsUpdatingInAppPrefs(false);
    }
  };

  const fetchTelegramStatus = async () => {
    if (!isLoggedIn) return;
    setIsLoadingTelegram(true);
    try {
      const token = await getIdToken();
      if (!token) {
        setIsLoadingTelegram(false);
        return;
      }
      const res = await fetch(`/api/telegram/link-token?_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setTelegramStatus({
          isLinked: !!data.isLinked,
          link: data.link || null,
          botUsername: data.botUsername || 'CineFlue_bot',
        });
        if (data.isLinked) {
          setLinkingData(null);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch Telegram status:', err);
    } finally {
      setIsLoadingTelegram(false);
    }
  };

  const handleGenerateTelegramLink = async () => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }
    setIsGeneratingToken(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/telegram/link-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          setLinkingData({
            token: data.token,
            expiresAt: data.expiresAt,
            botUsername: data.botUsername,
            telegramUrl: data.telegramUrl,
          });
        }
      }
    } catch (err) {
      console.warn('Failed to generate Telegram linking token:', err);
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const handleTogglePreference = async (pref: 'requestNotifications' | 'reportNotifications', value: boolean) => {
    if (!isLoggedIn || !telegramStatus.link) return;
    setIsUpdatingPrefs(true);
    try {
      const token = await getIdToken();
      if (!token) return;

      // Optimistic update
      setTelegramStatus((prev) => ({
        ...prev,
        link: prev.link ? { ...prev.link, [pref]: value } : null,
      }));

      await fetch('/api/telegram/link-token', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [pref]: value }),
      });
    } catch (err) {
      console.warn('Failed to update Telegram preferences:', err);
      fetchTelegramStatus();
    } finally {
      setIsUpdatingPrefs(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    if (!isLoggedIn) return;
    setIsLoadingTelegram(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/telegram/link-token', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTelegramStatus((prev) => ({ ...prev, isLinked: false, link: null }));
        setLinkingData(null);
      }
    } catch (err) {
      console.warn('Failed to disconnect Telegram:', err);
    } finally {
      setIsLoadingTelegram(false);
    }
  };

  const fetchMyReports = async () => {
    if (!isLoggedIn) {
      setMyReports([]);
      return;
    }
    setIsLoadingReports(true);
    try {
      const token = await getIdToken();
      if (!token) {
        setIsLoadingReports(false);
        return;
      }
      const res = await fetch(`/api/reports?my=true&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.reports)) {
          setMyReports(data.reports);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch personal reports:', err);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const fetchMyRequests = async () => {
    if (!isLoggedIn) {
      setMyRequests([]);
      return;
    }
    setIsLoadingRequests(true);
    try {
      const token = await getIdToken();
      if (!token) {
        setIsLoadingRequests(false);
        return;
      }
      const res = await fetch(`/api/requests?my=true&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.requests)) {
          setMyRequests(data.requests);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch personal requests:', err);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchMyRequests();
      fetchMyReports();
      fetchTelegramStatus();
    } else {
      setMyRequests([]);
      setMyReports([]);
      setTelegramStatus({ isLinked: false, link: null, botUsername: 'CineFlue_bot' });
      setLinkingData(null);
    }
  }, [isLoggedIn]);

  // Sync state whenever userProfile changes
  React.useEffect(() => {
    setDisplayName(userProfile.displayName || '');
    setBio(userProfile.bio || '');
  }, [userProfile]);

  // Compute Rating Distribution (1★ to 10★)
  const ratingDistribution = Array.from({ length: 10 }, (_, i) => i + 1).map((star) => {
    const count = watchlist.filter((item) => Math.round(item.personalRating || 0) === star).length;
    return { star, count };
  });

  const maxRatingCount = Math.max(...ratingDistribution.map((r) => r.count), 1);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfileData({
      displayName: displayName.trim(),
      bio: bio.trim(),
    });
    setIsEditing(false);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* 1. Account / Authentication Header Card */}
      {!isLoggedIn ? (
        <div className="bg-[#0f121a] border border-amber-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-black font-black text-2xl mx-auto shadow-lg shadow-amber-500/20">
            <LogIn className="w-8 h-8" />
          </div>

          <div className="space-y-2 max-w-lg mx-auto">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Connect Your Google Account
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Sign in with your Google account to easily submit custom download requests, report defective links, and receive instant Telegram upload notifications. Once signed in, you won&apos;t have to log in repeatedly.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl bg-white hover:bg-zinc-100 text-zinc-900 font-black text-sm shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer w-full sm:w-auto"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
        </div>
      ) : (
        /* Real Connected Google Account Card */
        <div className="bg-[#0f121a] border border-zinc-800 rounded-3xl p-4 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
            <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0 w-full sm:w-auto">
              <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-gradient-to-tr from-amber-500 via-orange-500 to-red-600 p-0.5 shadow-lg shrink-0">
                <div className="w-full h-full bg-[#090b0e] rounded-full overflow-hidden flex items-center justify-center text-white font-black text-xl sm:text-2xl">
                  {userProfile.photoURL ? (
                    <img
                      src={userProfile.photoURL}
                      alt={userProfile.displayName || 'Profile'}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{(userProfile.displayName || userProfile.email || 'U')[0].toUpperCase()}</span>
                  )}
                </div>
              </div>

              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-white break-words">
                    {userProfile.displayName || userProfile.name || 'Connected User'}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 font-mono">
                    <ShieldCheck className="w-3 h-3" /> Signed In
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-bold font-mono">
                    Google Account
                  </span>
                </div>
                <p className="text-xs text-zinc-400 font-mono flex items-center gap-1.5 min-w-0">
                  <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="break-all">{userProfile.email}</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1 text-xs text-zinc-400 font-mono">
                  <span>Requests: <strong className="text-white">{myRequests.length}</strong></span>
                  <span>•</span>
                  <span>Reports: <strong className="text-white">{myReports.length}</strong></span>
                  <span>•</span>
                  <span>Telegram: <strong className={telegramStatus.isLinked ? 'text-emerald-400' : 'text-zinc-500'}>{telegramStatus.isLinked ? 'Linked' : 'Not Linked'}</strong></span>
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-rose-400 border border-zinc-700 text-xs font-semibold transition-colors cursor-pointer self-start sm:self-center shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* 4a. Website In-App Notifications Preferences */}
      <section id="website-notifications" className="bg-[#0f121a] border border-zinc-800 rounded-3xl p-4 sm:p-8 space-y-6 shadow-xl scroll-mt-24">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Bell className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-white">Website Notifications Settings</h2>
            </div>
            <p className="text-xs text-zinc-400">
              Control notifications shown in your notification bell when our team fulfills your requests or fixes broken links.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <label className="flex items-center justify-between p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 cursor-pointer transition-all">
            <div className="space-y-0.5 pr-3">
              <span className="text-xs font-bold text-zinc-200 block">Movie & TV Requests</span>
              <span className="text-[11px] text-zinc-400 block">Get bell alerts when requested titles are added or replied to</span>
            </div>
            <input
              type="checkbox"
              checked={inAppRequests}
              onChange={(e) => handleToggleInAppPreference('requests', e.target.checked)}
              disabled={isUpdatingInAppPrefs || !isLoggedIn}
              className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-amber-500 shrink-0 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 cursor-pointer transition-all">
            <div className="space-y-0.5 pr-3">
              <span className="text-xs font-bold text-zinc-200 block">Broken Link Reports</span>
              <span className="text-[11px] text-zinc-400 block">Get bell alerts when defective links are fixed or replied to</span>
            </div>
            <input
              type="checkbox"
              checked={inAppReports}
              onChange={(e) => handleToggleInAppPreference('reports', e.target.checked)}
              disabled={isUpdatingInAppPrefs || !isLoggedIn}
              className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-amber-500 shrink-0 cursor-pointer"
            />
          </label>
        </div>
      </section>

      {/* 4b. Telegram Notifications Section */}
      <section id="telegram-notifications" className="bg-[#0f121a] border border-zinc-800 rounded-3xl p-4 sm:p-8 space-y-6 shadow-xl scroll-mt-24">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                <Send className="w-4 h-4 -rotate-12" />
              </div>
              <h2 className="text-lg font-bold text-white">Telegram Instant Alerts</h2>
              {telegramStatus.isLinked && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Receive direct Telegram messages the second your requested titles are uploaded or reported links are resolved.
            </p>
          </div>

          {isLoggedIn && (
            <button
              type="button"
              onClick={fetchTelegramStatus}
              disabled={isLoadingTelegram}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 text-xs transition-colors disabled:opacity-50"
              title="Refresh Telegram Status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTelegram ? 'animate-spin text-sky-400' : ''}`} />
            </button>
          )}
        </div>

        {!isLoggedIn ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-xs text-zinc-400">
              Sign in to connect your Telegram account and receive instant request fulfillment alerts.
            </p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-xs"
            >
              <LogIn className="w-3.5 h-3.5" /> Sign In Now
            </button>
          </div>
        ) : telegramStatus.isLinked ? (
          /* Connected State */
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-zinc-950/70 border border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm font-bold text-zinc-100">
                    Linked to @{telegramStatus.botUsername}
                  </span>
                  {telegramStatus.link?.telegramUsername && (
                    <span className="text-xs text-zinc-400 font-medium">
                      (@{telegramStatus.link.telegramUsername})
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">
                  Your CiNEPHiLE account is receiving real-time alerts on Telegram.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDisconnectTelegram}
                disabled={isLoadingTelegram}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-900/60 text-xs font-semibold transition-all disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>

            {/* Notification Preference Toggles */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Notification Preferences
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950/50 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="space-y-0.5 pr-3">
                    <span className="text-xs font-semibold text-zinc-200 block">
                      Movie & TV Requests
                    </span>
                    <span className="text-[11px] text-zinc-400 block">
                      Notify me when my requested titles are added
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={telegramStatus.link?.requestNotifications !== false}
                    onChange={(e) => handleTogglePreference('requestNotifications', e.target.checked)}
                    disabled={isUpdatingPrefs}
                    className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-amber-500 shrink-0"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950/50 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="space-y-0.5 pr-3">
                    <span className="text-xs font-semibold text-zinc-200 block">
                      Broken Link Reports
                    </span>
                    <span className="text-[11px] text-zinc-400 block">
                      Notify me when reported links are fixed
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={telegramStatus.link?.reportNotifications !== false}
                    onChange={(e) => handleTogglePreference('reportNotifications', e.target.checked)}
                    disabled={isUpdatingPrefs}
                    className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-amber-500 shrink-0"
                  />
                </label>
              </div>
            </div>
          </div>
        ) : (
          /* Not Connected State */
          <div className="space-y-5">
            {!linkingData ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-zinc-950/60 border border-zinc-800">
                <div className="space-y-1 max-w-lg">
                  <h4 className="text-sm font-bold text-white">Connect Your Telegram</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Link your Telegram to get notified as soon as a movie or TV request is fulfilled or a reported broken link is fixed. No bots will spam you.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateTelegramLink}
                  disabled={isGeneratingToken}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 shrink-0"
                >
                  <Send className="w-3.5 h-3.5 -rotate-12" />
                  {isGeneratingToken ? 'Generating Link...' : 'Connect Telegram'}
                </button>
              </div>
            ) : (
              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-sky-500/30 space-y-4 animate-fadeIn">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                      One-Time Secure Telegram Connection
                    </h4>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Expires in 10 minutes
                  </span>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">
                  Open the official CiNEPHiLE bot in Telegram and start it with your secure link code:
                </p>

                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <a
                    href={linkingData.telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/25 transition-all"
                  >
                    <Send className="w-3.5 h-3.5 -rotate-12" />
                    Open @{linkingData.botUsername} in Telegram
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`/start ${linkingData.token}`);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2500);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-semibold transition-colors"
                  >
                    {copiedToken ? (
                      <>
                        <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied Command</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Command
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={fetchTelegramStatus}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-sky-400 border border-sky-500/30 text-xs font-semibold transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    I Connected, Verify Now
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 font-mono text-[11px] text-zinc-400 flex flex-wrap items-center justify-between gap-2 min-w-0">
                  <span className="break-all">/start {linkingData.token}</span>
                  <span className="text-[10px] text-zinc-600">Send to @{linkingData.botUsername}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 5. My Movie & TV Requests Section */}
      <section id="my-requests" className="bg-[#0f121a] border border-zinc-800 rounded-3xl p-4 sm:p-8 space-y-6 shadow-xl scroll-mt-24">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Film className="w-5 h-5 text-amber-400 shrink-0" />
              <h2 className="text-lg font-bold text-white">My Movie & TV Requests</h2>
              {myRequests.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-semibold">
                  {myRequests.length}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Track the live fulfillment status of movies and web series you requested on CiNEPHiLE.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto max-w-full">
            {isLoggedIn && (
              <>
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>+ New Request</span>
                </button>
                <button
                  type="button"
                  onClick={fetchMyRequests}
                  disabled={isLoadingRequests}
                  className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 text-xs transition-colors disabled:opacity-50"
                  title="Refresh Requests"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRequests ? 'animate-spin text-amber-400' : ''}`} />
                </button>
              </>
            )}

            {/* Status Filter Tabs */}
            <div className="flex items-center p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs overflow-x-auto max-w-full no-scrollbar">
              {(['all', 'pending', 'in_progress', 'fulfilled', 'rejected'] as const).map((filter) => {
                const count =
                  filter === 'all'
                    ? myRequests.length
                    : myRequests.filter((r) => r.status === filter).length;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setRequestFilter(filter)}
                    className={`px-2.5 py-1 rounded-lg font-semibold capitalize whitespace-nowrap transition-all ${
                      requestFilter === filter
                        ? 'bg-amber-500 text-black shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {filter === 'in_progress' ? 'In Progress' : filter} {count > 0 ? `(${count})` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Request List Content */}
        {!isLoggedIn ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-xs text-zinc-400">
              Sign in with your account to view and track all your movie and TV requests.
            </p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-xs"
            >
              <LogIn className="w-3.5 h-3.5" /> Sign In Now
            </button>
          </div>
        ) : isLoadingRequests && myRequests.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500 space-y-2">
            <div className="inline-block w-5 h-5 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
            <p>Loading your requests...</p>
          </div>
        ) : myRequests.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 mx-auto flex items-center justify-center text-zinc-500">
              <Film className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-zinc-300">No requests submitted yet</p>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Looking for a movie or TV show not yet in our catalog? Submit a request and our curators will add it.
            </p>
            <Link
              href="/search"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 text-xs font-semibold transition-colors"
            >
              Explore Titles & Request
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myRequests
              .filter((req) => (requestFilter === 'all' ? true : req.status === requestFilter))
              .map((req) => {
                const isFulfilled = req.status === 'fulfilled';
                const isInProgress = req.status === 'in_progress';
                const isPending = req.status === 'pending';
                const isRejected = req.status === 'rejected';

                const targetWatchUrl = req.tmdbId
                  ? `/${req.mediaType === 'tv' ? 'tv' : 'movie'}/${req.tmdbId}`
                  : req.fulfilledLinkUrl || null;

                return (
                  <div
                    key={req.id}
                    className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Poster / Thumbnail */}
                      <div className="relative w-12 h-16 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0 flex items-center justify-center">
                        {req.posterPath ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${req.posterPath}`}
                            alt={req.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : req.mediaType === 'tv' ? (
                          <Tv className="w-5 h-5 text-amber-400" />
                        ) : (
                          <Film className="w-5 h-5 text-amber-400" />
                        )}
                      </div>

                      {/* Details */}
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                            {req.title}
                          </h4>
                          {req.releaseYear && (
                            <span className="text-[11px] text-zinc-500 font-medium">
                              ({req.releaseYear})
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-zinc-800 text-zinc-400">
                            {req.mediaType}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                          {req.quality && <span>Quality: <span className="text-zinc-300 font-medium">{req.quality}</span></span>}
                          {req.audioLanguage && <span>Audio: <span className="text-zinc-300 font-medium">{req.audioLanguage}</span></span>}
                          <span className="text-zinc-500 flex items-center gap-1">
                            <Clock3 className="w-3 h-3" />
                            {new Date(req.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {req.adminNote && (
                          <p className="text-[11px] text-zinc-400 italic pt-0.5">
                            Admin Note: &ldquo;{req.adminNote}&rdquo;
                          </p>
                        )}

                        {req.adminReplies && req.adminReplies.length > 0 && (
                          <div className="pt-1.5 space-y-1 max-w-lg">
                            {req.adminReplies.map((r, ri) => (
                              <div key={ri} className="text-[11px] bg-zinc-900/90 border border-amber-500/20 rounded-xl p-2.5 text-zinc-200">
                                <span className="text-amber-400 font-bold block text-[10px] uppercase tracking-wider mb-0.5">Staff Reply:</span>
                                {r.message}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status & Action */}
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      {isFulfilled && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Available Now
                          </span>

                          {targetWatchUrl && (
                            <Link
                              href={targetWatchUrl}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold text-xs shadow-md shadow-amber-500/20 transition-all"
                            >
                              <Play className="w-3.5 h-3.5 fill-black" />
                              Watch Now
                            </Link>
                          )}
                        </div>
                      )}

                      {isInProgress && (
                        <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                          In Progress
                        </span>
                      )}

                      {isPending && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          Under Review
                        </span>
                      )}

                      {isRejected && (
                        <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Closed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* 6. My Broken Link Reports Section */}
      <section id="my-reports" className="bg-[#0f121a] border border-zinc-800 rounded-3xl p-4 sm:p-8 space-y-6 shadow-xl scroll-mt-24">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Wrench className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2 className="text-lg font-bold text-white">My Broken Link Reports</h2>
              {myReports.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-semibold">
                  {myReports.length}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Track the review and repair status of broken or defective stream/download links you reported.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto max-w-full">
            {isLoggedIn && (
              <button
                type="button"
                onClick={fetchMyReports}
                disabled={isLoadingReports}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 text-xs transition-colors disabled:opacity-50"
                title="Refresh Reports"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReports ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            )}

            {/* Status Filter Tabs */}
            <div className="flex items-center p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs overflow-x-auto max-w-full no-scrollbar">
              {(['all', 'pending', 'in_progress', 'fixed', 'dismissed'] as const).map((filter) => {
                const count =
                  filter === 'all'
                    ? myReports.length
                    : myReports.filter((r) => r.status === filter).length;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setReportFilter(filter)}
                    className={`px-2.5 py-1 rounded-lg font-semibold capitalize whitespace-nowrap transition-all ${
                      reportFilter === filter
                        ? 'bg-emerald-500 text-black shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {filter === 'fixed' ? 'Resolved' : filter === 'in_progress' ? 'In Progress' : filter} {count > 0 ? `(${count})` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Reports List Content */}
        {!isLoggedIn ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-xs text-zinc-400">
              Sign in with your account to view and track all your submitted link defect reports.
            </p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-xs"
            >
              <LogIn className="w-3.5 h-3.5" /> Sign In Now
            </button>
          </div>
        ) : isLoadingReports && myReports.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500 space-y-2">
            <div className="inline-block w-5 h-5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <p>Loading your reports...</p>
          </div>
        ) : myReports.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-zinc-800/60 mx-auto flex items-center justify-center text-zinc-500">
              <Wrench className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-zinc-300">No link reports submitted</p>
            <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
              If you encounter a dead link, audio desync, or playback error while watching, use the Report button on that title.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {myReports
              .filter((rep) => (reportFilter === 'all' ? true : rep.status === reportFilter))
              .map((rep) => {
                const isFixed = rep.status === 'fixed';
                const isInProgress = rep.status === 'in_progress';
                const isPending = rep.status === 'pending';
                const isDismissed = rep.status === 'dismissed';

                const targetWatchUrl = rep.movieId
                  ? `/${rep.mediaType === 'tv' ? 'tv' : 'movie'}/${rep.movieId}`
                  : null;

                return (
                  <div
                    key={rep.id}
                    className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Poster / Thumbnail */}
                      <div className="relative w-12 h-16 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0 flex items-center justify-center">
                        {rep.posterPath ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${rep.posterPath}`}
                            alt={rep.mediaTitle}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Wrench className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>

                      {/* Details */}
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                            {rep.mediaTitle}
                          </h4>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            {rep.issueLabel || 'Defective Link'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                          {rep.quality && <span>Quality: <span className="text-zinc-300 font-medium">{rep.quality}</span></span>}
                          {rep.server && <span>Server: <span className="text-zinc-300 font-medium">{rep.server}</span></span>}
                          <span className="text-zinc-500 flex items-center gap-1">
                            <Clock3 className="w-3 h-3" />
                            {new Date(rep.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {rep.adminNote && (
                          <p className="text-[11px] text-zinc-400 italic pt-0.5">
                            Curator Response: &ldquo;{rep.adminNote}&rdquo;
                          </p>
                        )}

                        {rep.adminReplies && rep.adminReplies.length > 0 && (
                          <div className="pt-1.5 space-y-1 max-w-lg">
                            {rep.adminReplies.map((r, ri) => (
                              <div key={ri} className="text-[11px] bg-zinc-900/90 border border-rose-500/20 rounded-xl p-2.5 text-zinc-200">
                                <span className="text-rose-400 font-bold block text-[10px] uppercase tracking-wider mb-0.5">Staff Reply:</span>
                                {r.message}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status & Action */}
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      {isFixed && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Resolved / Fixed
                          </span>

                          {rep.replacementUrl && (
                            <a
                              href={rep.replacementUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs border border-emerald-500/30 transition-all"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Fixed Link
                            </a>
                          )}

                          {targetWatchUrl && (
                            <Link
                              href={targetWatchUrl}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold text-xs shadow-md shadow-emerald-500/20 transition-all"
                            >
                              <Play className="w-3.5 h-3.5 fill-black" />
                              Open Title
                            </Link>
                          )}
                        </div>
                      )}

                      {isInProgress && (
                        <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                          Repair In Progress
                        </span>
                      )}

                      {isPending && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          Investigating
                        </span>
                      )}

                      {isDismissed && (
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" /> Reviewed
                          </span>

                          {targetWatchUrl && (
                            <Link
                              href={targetWatchUrl}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs border border-zinc-700 transition-all"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open Title
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* Auth Modal */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      {/* Submit New Request Modal */}
      {isRequestModalOpen && (
        <RequestLinkModal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          onSuccess={() => fetchMyRequests()}
        />
      )}
    </div>
  );
}
