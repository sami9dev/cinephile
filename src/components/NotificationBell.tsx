'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Film, Tv, Play, ExternalLink, Clock, Wrench, CheckCircle2, Info } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { UserNotification } from '@/types';

function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(isoString).toLocaleDateString();
  } catch {
    return 'Recently';
  }
}

export const NotificationBell: React.FC = () => {
  const router = useRouter();
  const { isLoggedIn, getIdToken } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch unread count badge periodically
  const fetchUnreadCount = async () => {
    if (!isLoggedIn) return;
    try {
      const token = await getIdToken();
      if (!token) return;

      const res = await fetch('/api/notifications?countOnly=true', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch (err) {
      // Quiet background failure
    }
  };

  // Fetch full notification list
  const fetchNotifications = async () => {
    if (!isLoggedIn) return;
    setIsLoading(true);
    try {
      const token = await getIdToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      const res = await fetch('/api/notifications?limit=20', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
        }
        if (typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [isLoggedIn]);

  // When bell is clicked open, fetch latest list
  const handleToggle = () => {
    const willOpen = !isOpen;
    setIsOpen(willOpen);
    if (willOpen && isLoggedIn) {
      fetchNotifications();
    }
  };

  // Mark single notification as read
  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      const token = await getIdToken();
      if (!token) return;

      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, read: true }),
      });
    } catch (err) {
      console.warn('Failed to mark notification as read:', err);
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);

      const token = await getIdToken();
      if (!token) return;

      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch (err) {
      console.warn('Failed to mark all as read:', err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Navigate to profile item or link & mark as read
  const handleActionClick = async (notif: UserNotification) => {
    if (!notif.read) {
      handleMarkAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.requestId) {
      router.push('/profile#my-requests');
    } else if (notif.reportId) {
      router.push('/profile#my-reports');
    } else if (notif.linkUrl) {
      router.push(notif.linkUrl);
    } else {
      router.push('/profile');
    }
  };

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        className={`relative p-2 rounded-xl transition-all border ${
          isOpen
            ? 'bg-amber-500/20 text-amber-400 border-amber-400/40'
            : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white border-zinc-700/60'
        }`}
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-amber-500 to-red-500 text-black font-black text-[10px] flex items-center justify-center shadow-lg shadow-amber-500/30 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Popover Dropdown */}
      {isOpen && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 w-auto sm:w-96 max-w-[calc(100vw-1.5rem)] bg-[#0c0e14]/95 backdrop-blur-2xl border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/40">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isMarkingAll}
                className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-amber-400 transition-colors disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Body Content */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-zinc-800/50">
            {isLoading && notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 space-y-2">
                <div className="inline-block w-5 h-5 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                <p>Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-zinc-800/60 mx-auto flex items-center justify-center text-zinc-500">
                  <Bell className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-zinc-300">No notifications yet</p>
                <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                  When a movie or TV show you requested is added or updated, you will see it right here.
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isReportResolved = notif.type === 'DEFECTIVE_LINK_RESOLVED';
                const isReportDismissed = notif.type === 'DEFECTIVE_LINK_DISMISSED';
                const isReportInProgress = notif.type === 'DEFECTIVE_LINK_IN_PROGRESS';
                const isRequestInProgress = notif.type === 'REQUEST_IN_PROGRESS';
                const isRequestRejected = notif.type === 'REQUEST_REJECTED';
                const isAdminReply = notif.type === 'ADMIN_REPLY';
                const isRequestFulfilled = notif.type === 'REQUEST_FULFILLED' || (!isReportResolved && !isReportDismissed && !isReportInProgress && !isRequestInProgress && !isRequestRejected && !isAdminReply);

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleActionClick(notif)}
                    className={`p-3.5 transition-colors cursor-pointer group flex items-start gap-3 ${
                      notif.read
                        ? 'bg-transparent hover:bg-zinc-800/40 text-zinc-400'
                        : isReportResolved
                        ? 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08] text-zinc-200'
                        : (isRequestInProgress || isReportInProgress)
                        ? 'bg-sky-500/[0.04] hover:bg-sky-500/[0.08] text-zinc-200'
                        : isRequestRejected
                        ? 'bg-rose-500/[0.04] hover:bg-rose-500/[0.08] text-zinc-200'
                        : isAdminReply
                        ? 'bg-purple-500/[0.04] hover:bg-purple-500/[0.08] text-zinc-200'
                        : isReportDismissed
                        ? 'bg-zinc-800/40 hover:bg-zinc-800/60 text-zinc-300'
                        : 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08] text-zinc-200'
                    }`}
                  >
                    {/* Poster / Icon Thumbnail */}
                    <div className="relative w-12 h-16 rounded-lg overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700/60 flex items-center justify-center">
                      {notif.posterPath ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${notif.posterPath}`}
                          alt={notif.mediaTitle}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : isReportResolved ? (
                        <Wrench className="w-5 h-5 text-emerald-400" />
                      ) : (isReportInProgress || isRequestInProgress) ? (
                        <Clock className="w-5 h-5 text-sky-400" />
                      ) : isRequestRejected ? (
                        <Info className="w-5 h-5 text-rose-400" />
                      ) : isReportDismissed ? (
                        <Info className="w-5 h-5 text-blue-400" />
                      ) : notif.mediaType === 'tv' ? (
                        <Tv className="w-5 h-5 text-amber-400" />
                      ) : (
                        <Film className="w-5 h-5 text-amber-400" />
                      )}
                    </div>

                    {/* Notification Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        {isReportResolved ? (
                          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                            {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                            Report Resolved
                          </span>
                        ) : isReportInProgress ? (
                          <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1">
                            {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />}
                            Repair In Progress
                          </span>
                        ) : isRequestInProgress ? (
                          <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1">
                            {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />}
                            Request In Progress
                          </span>
                        ) : isRequestRejected ? (
                          <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                            {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />}
                            Request Rejected
                          </span>
                        ) : isAdminReply ? (
                          <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                            {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />}
                            Staff Reply
                          </span>
                        ) : isReportDismissed ? (
                          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                            {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                            Report Reviewed
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                            {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                            Request Fulfilled
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-500 flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(notif.createdAt)}
                        </span>
                      </div>

                      <h4 className="text-xs font-semibold text-zinc-100 truncate">
                        {notif.mediaTitle}
                      </h4>

                      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>

                      {/* Admin Reply or Resolution Callout */}
                      {notif.adminReply && (
                        <div className="p-2 rounded-lg bg-zinc-900/90 border border-purple-500/20 text-[11px] text-zinc-300">
                          <span className="text-purple-400 font-bold block text-[10px] uppercase">Staff Note:</span>
                          {notif.adminReply}
                        </div>
                      )}

                      {/* Actions Row */}
                      <div className="pt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {notif.replacementUrl && (
                            <a
                              href={notif.replacementUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!notif.read) handleMarkAsRead(notif.id);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[10px] border border-emerald-500/30 transition-all"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Fixed Link
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleActionClick(notif);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-[10px] border border-zinc-700 transition-all"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View in Profile
                          </button>
                        </div>

                        {!notif.read && (
                          <button
                            type="button"
                            onClick={(e) => handleMarkAsRead(notif.id, e)}
                            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                            title="Mark as read"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer View Profile Requests Link */}
          <div className="p-2 border-t border-zinc-800 bg-zinc-900/30 text-center">
            <Link
              href="/profile#my-requests"
              onClick={() => setIsOpen(false)}
              className="text-[11px] font-semibold text-zinc-400 hover:text-amber-400 transition-colors inline-flex items-center gap-1"
            >
              View requests & reports in Profile <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

        </div>
      )}
    </div>
  );
};

export default NotificationBell;
