'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Server,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  HelpCircle,
  Clock,
  Activity,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  ServiceStatusReport,
  ServiceCheckItem,
  ServiceHealthState,
  ServiceCategoryGroup,
} from '@/lib/serviceStatus';

interface ServiceStatusPanelProps {
  getAuthHeaders: () => Record<string, string>;
  isCollapsed?: boolean;
}

const GROUP_ORDER: ServiceCategoryGroup[] = [
  'APIs',
  'Database & Cache',
  'Hosting & Deployment',
  'Bots & Automation',
];

function getStatusStyles(status: ServiceHealthState) {
  switch (status) {
    case 'Operational':
      return {
        dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
        badge:
          'text-emerald-300 bg-emerald-950/80 border-emerald-500/40',
        text: 'text-emerald-400',
        icon: CheckCircle2,
      };
    case 'Degraded':
      return {
        dot: 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]',
        badge: 'text-amber-300 bg-amber-950/80 border-amber-500/40',
        text: 'text-amber-400',
        icon: AlertTriangle,
      };
    case 'Offline':
      return {
        dot: 'bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.7)]',
        badge: 'text-rose-300 bg-rose-950/80 border-rose-500/40',
        text: 'text-rose-400',
        icon: XCircle,
      };
    case 'Not Configured':
      return {
        dot: 'bg-zinc-500',
        badge: 'text-zinc-400 bg-zinc-900/90 border-zinc-700/60',
        text: 'text-zinc-400',
        icon: MinusCircle,
      };
    case 'Unknown':
    default:
      return {
        dot: 'bg-slate-400',
        badge: 'text-slate-300 bg-slate-900/90 border-slate-700/60',
        text: 'text-slate-400',
        icon: HelpCircle,
      };
  }
}

function formatShortTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const ServiceStatusPanel: React.FC<ServiceStatusPanelProps> = ({
  getAuthHeaders,
  isCollapsed = false,
}) => {
  const [report, setReport] = useState<ServiceStatusReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isExpandedInSidebar, setIsExpandedInSidebar] = useState<boolean>(true);

  const loadReport = useCallback(
    async (forceRefresh: boolean) => {
      try {
        const url = forceRefresh
          ? '/api/admin/service-status?refresh=true'
          : '/api/admin/service-status';
        const res = await fetch(url, {
          headers: getAuthHeaders(),
          cache: 'no-store',
        });

        if (!res.ok) {
          if (res.status === 401) {
            setError('Admin session required');
          } else {
            setError(`Status check failed (HTTP ${res.status})`);
          }
          return;
        }

        const data: ServiceStatusReport = await res.json();
        if (data && Array.isArray(data.services)) {
          setReport(data);
          setError(null);
        } else {
          setError('Invalid status response');
        }
      } catch {
        setError('Unable to reach status endpoint');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getAuthHeaders]
  );

  const fetchStatus = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      await loadReport(forceRefresh);
    },
    [loadReport]
  );

  // Fetch once on mount; do not run on every render
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/service-status', {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(
            res.status === 401
              ? 'Admin session required'
              : `Status check failed (HTTP ${res.status})`
          );
          return;
        }
        const data: ServiceStatusReport = await res.json();
        if (cancelled) return;
        if (data && Array.isArray(data.services)) {
          setReport(data);
          setError(null);
        } else {
          setError('Invalid status response');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Unable to reach status endpoint');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getAuthHeaders]);

  // Exclude unconfigured optional services (Firebase Auth) from cluttering UI
  const UNCONFIGURED_OPTIONAL_SERVICE_IDS = React.useMemo(() => new Set(['firebase_auth']), []);

  const visibleServices = React.useMemo(() => {
    if (!report?.services) return [];
    return report.services.filter(
      (svc) => !(UNCONFIGURED_OPTIONAL_SERVICE_IDS.has(svc.id) && svc.status === 'Not Configured')
    );
  }, [report, UNCONFIGURED_OPTIONAL_SERVICE_IDS]);

  const visibleSummary = React.useMemo(() => {
    return {
      total: visibleServices.length,
      operational: visibleServices.filter((s) => s.status === 'Operational').length,
      degraded: visibleServices.filter((s) => s.status === 'Degraded').length,
      offline: visibleServices.filter((s) => s.status === 'Offline').length,
      notConfigured: visibleServices.filter((s) => s.status === 'Not Configured').length,
      unknown: visibleServices.filter((s) => s.status === 'Unknown').length,
    };
  }, [visibleServices]);

  const groupedServices = React.useMemo(() => {
    const map: Record<ServiceCategoryGroup, ServiceCheckItem[]> = {
      APIs: [],
      'Database & Cache': [],
      'Hosting & Deployment': [],
      'Bots & Automation': [],
    };
    for (const svc of visibleServices) {
      if (map[svc.group]) {
        map[svc.group].push(svc);
      }
    }
    return map;
  }, [visibleServices]);

  const overallStatus: ServiceHealthState = report?.overallStatus || 'Unknown';
  const overallStyles = getStatusStyles(overallStatus);

  // Collapsed Sidebar Icon View
  if (isCollapsed) {
    return (
      <>
        <div
          onClick={() => setIsModalOpen(true)}
          className="w-10 h-10 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-cyan-300 hover:text-white flex items-center justify-center relative cursor-pointer group shadow-md"
          title={`Service Status: ${overallStatus} (Click for full details)`}
        >
          <Server className="w-4 h-4 text-cyan-400" />
          <span
            className={`w-2 h-2 rounded-full absolute top-1.5 right-1.5 ${
              loading ? 'bg-cyan-400 animate-ping' : overallStyles.dot
            }`}
          />
          {/* Hover Floating Status Card */}
          <div className="pointer-events-none absolute left-full ml-3 bottom-0 z-50 whitespace-nowrap rounded-2xl bg-[#090d18] border border-cyan-500/40 p-3 text-xs text-white shadow-2xl opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all space-y-2 min-w-[250px]">
            <div className="font-black text-cyan-400 uppercase text-[10px] tracking-wider border-b border-cyan-500/20 pb-1.5 flex items-center justify-between gap-4">
              <span>Service Status</span>
              <span className={`font-mono ${overallStyles.text}`}>
                {loading ? 'Checking...' : overallStatus}
              </span>
            </div>
            {report ? (
              <div className="space-y-1.5">
                {visibleServices.slice(0, 6).map((svc) => {
                  const st = getStatusStyles(svc.status);
                  return (
                    <div
                      key={svc.id}
                      className="text-slate-300 text-[11px] flex items-center justify-between gap-3"
                    >
                      <span className="flex items-center gap-1.5 font-medium truncate">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                        {svc.name}
                      </span>
                      <span
                        className={`text-[9px] font-bold border px-1.5 py-0.5 rounded font-mono shrink-0 ${st.badge}`}
                      >
                        {svc.status}
                      </span>
                    </div>
                  );
                })}
                <div className="pt-1 border-t border-white/10 text-[10px] text-cyan-400 flex items-center justify-between">
                  <span>Checked: {formatShortTime(report.checkedAt)}</span>
                  <span>Click for all {visibleServices.length} services →</span>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400">
                {error || 'Running diagnostics...'}
              </div>
            )}
          </div>
        </div>

        {isModalOpen && (
          <ServiceStatusModal
            report={report}
            summary={visibleSummary}
            loading={loading}
            refreshing={refreshing}
            error={error}
            groupedServices={groupedServices}
            onRefresh={() => fetchStatus(true)}
            onClose={() => setIsModalOpen(false)}
          />
        )}
      </>
    );
  }

  // Expanded Sidebar Panel View
  return (
    <>
      <div className="p-2.5 rounded-2xl bg-black/70 border border-cyan-500/25 space-y-2 text-[11px] shadow-inner">
        {/* Header Row */}
        <div className="flex items-center justify-between text-cyan-400 font-bold uppercase tracking-wider text-[10px] border-b border-cyan-500/15 pb-1.5">
          <button
            type="button"
            onClick={() => setIsExpandedInSidebar((prev) => !prev)}
            className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer text-left"
            title="Toggle service list"
          >
            <Server className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span>Service Status</span>
            {isExpandedInSidebar ? (
              <ChevronUp className="w-3 h-3 text-slate-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            )}
          </button>

          <div className="flex items-center gap-1.5">
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${overallStyles.badge}`}
            >
              {loading && !report ? 'Checking' : overallStatus}
            </span>
            <button
              type="button"
              onClick={() => fetchStatus(true)}
              disabled={refreshing || loading}
              className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              title="Run live health check"
              aria-label="Refresh service status"
            >
              <RefreshCw
                className={`w-3 h-3 ${refreshing || loading ? 'animate-spin text-cyan-400' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-2 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-[10px] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && !report && !error && (
          <div className="py-3 text-center text-[10px] text-slate-400 font-mono flex items-center justify-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>Checking configured services...</span>
          </div>
        )}

        {/* Grouped Services List */}
        {report && isExpandedInSidebar && (
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
            {GROUP_ORDER.map((groupName) => {
              const items = groupedServices[groupName];
              if (!items || items.length === 0) return null;
              return (
                <div key={groupName} className="space-y-1">
                  <div className="text-[9px] font-black uppercase tracking-wider text-red-400/90 flex items-center gap-1 pt-0.5">
                    <span className="w-1 h-1 rounded-full bg-red-500" />
                    <span>{groupName}</span>
                  </div>
                  <div className="space-y-1">
                    {items.map((svc) => {
                      const st = getStatusStyles(svc.status);
                      return (
                        <div
                          key={svc.id}
                          className="p-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-white/5 transition-colors space-y-0.5"
                          title={`${svc.name} — ${svc.purpose}\nStatus: ${svc.status}\nDetail: ${svc.message}\nLast checked: ${formatShortTime(svc.checkedAt)}`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="flex items-center gap-1.5 font-semibold text-slate-200 truncate text-[11px]">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                              <span className="truncate">{svc.name}</span>
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold font-mono border shrink-0 ${st.badge}`}
                            >
                              {svc.status}
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-400 truncate pl-3.5">
                            {svc.purpose}
                          </div>
                          <div className="text-[9px] text-cyan-300/80 font-mono truncate pl-3.5">
                            {svc.message}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Meta & Full Details Trigger */}
        {report && (
          <div className="pt-1.5 border-t border-cyan-500/15 flex items-center justify-between text-[9px] text-slate-400">
            <span className="flex items-center gap-1 font-mono" title="Last checked time">
              <Clock className="w-2.5 h-2.5 text-cyan-400" />
              {formatShortTime(report.checkedAt)}
            </span>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="text-cyan-400 hover:text-cyan-300 font-bold hover:underline cursor-pointer flex items-center gap-1"
            >
              <Activity className="w-2.5 h-2.5" />
              <span>Full Diagnostics ({visibleSummary.operational}/{visibleSummary.total})</span>
            </button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <ServiceStatusModal
          report={report}
          summary={visibleSummary}
          loading={loading}
          refreshing={refreshing}
          error={error}
          groupedServices={groupedServices}
          onRefresh={() => fetchStatus(true)}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
};

interface ServiceStatusModalProps {
  report: ServiceStatusReport | null;
  summary: {
    total: number;
    operational: number;
    degraded: number;
    offline: number;
    notConfigured: number;
    unknown: number;
  };
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  groupedServices: Record<ServiceCategoryGroup, ServiceCheckItem[]>;
  onRefresh: () => void;
  onClose: () => void;
}

const ServiceStatusModal: React.FC<ServiceStatusModalProps> = ({
  report,
  summary,
  loading,
  refreshing,
  error,
  groupedServices,
  onRefresh,
  onClose,
}) => {
  const overallStatus = report?.overallStatus || 'Unknown';
  const overallStyles = getStatusStyles(overallStatus);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-3xl bg-[#090d18] border border-cyan-500/40 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-slate-950 via-[#0d1324] to-slate-950 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3 sm:gap-4 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-400 shadow-md shrink-0">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-white tracking-wide uppercase">
                  System & Service Status Diagnostics
                </h3>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${overallStyles.badge}`}
                >
                  {overallStatus}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Real-time server-side health checks across all configured Cinephile integrations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing || loading}
              className="px-3 sm:px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Checking...' : 'Run Check'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Summary Counters */}
        {report && (
          <div className="px-4 sm:px-6 py-2.5 sm:py-3 bg-black/50 border-b border-white/5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 text-xs shrink-0">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                {summary.operational} Operational
              </span>
              {summary.degraded > 0 && (
                <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  {summary.degraded} Degraded
                </span>
              )}
              {summary.offline > 0 && (
                <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  {summary.offline} Offline
                </span>
              )}
              {summary.notConfigured > 0 && (
                <span className="flex items-center gap-1.5 text-zinc-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-zinc-500" />
                  {summary.notConfigured} Not Configured
                </span>
              )}
              {summary.unknown > 0 && (
                <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  {summary.unknown} Unknown
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 font-mono flex flex-wrap items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Last Checked: {formatShortTime(report.checkedAt)}</span>
              {report.cached && (
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px]">
                  Cached (60s TTL)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6 flex-1">
          {error && (
            <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {report &&
            GROUP_ORDER.map((groupName) => {
              const items = groupedServices[groupName];
              if (!items || items.length === 0) return null;
              return (
                <div key={groupName} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-white/10 pb-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-red-400">
                      {groupName}
                    </h4>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({items.length})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map((svc) => {
                      const st = getStatusStyles(svc.status);
                      const StatusIcon = st.icon;
                      return (
                        <div
                          key={svc.id}
                          className="p-3.5 rounded-2xl bg-slate-900/70 border border-white/10 hover:border-cyan-500/30 transition-all flex flex-col justify-between gap-2"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} />
                                <span className="font-bold text-sm text-white truncate">
                                  {svc.name}
                                </span>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border flex items-center gap-1 shrink-0 ${st.badge}`}
                              >
                                <StatusIcon className="w-3 h-3" />
                                {svc.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">{svc.purpose}</p>
                          </div>

                          <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                            <span className="text-cyan-300 truncate max-w-full">
                              {svc.message}
                            </span>
                            <span className="text-slate-500 shrink-0">
                              {svc.lastOperationalAt
                                ? `Verified ${formatShortTime(svc.lastOperationalAt)}`
                                : `Checked ${formatShortTime(svc.checkedAt)}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default ServiceStatusPanel;
