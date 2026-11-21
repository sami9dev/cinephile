'use client';

import React, { useState, useEffect } from 'react';
import { Bot, Send, X, Zap, BellRing, ArrowRight, CheckCircle2, ShieldCheck, Terminal } from 'lucide-react';

interface TelegramBotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  openReports?: Array<{ id: string; title: string; issueType: string; telegram: string; submittedAt: string }>;
  pendingRequests?: Array<{ id: string; title: string; qualityPref: string; telegram: string }>;
  onTriageModule?: (moduleId: 'requests' | 'reports') => void;
  onLiveIngestSuccess?: (item: any) => void;
}

const TELEGRAM_PRESETS = [
  {
    raw: `🎬 Nosferatu.2024.IMAX.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR10.x265-CineFlue\nAudio: Hindi DDP 5.1 + English Atmos [Multi-Audio]\nSize: 18.4 GB\n🔗 https://hubcloud.lol/drive/nosf2024-4k-hevc\n🔗 https://gdflix.cfd/file/nosf2024-4k-mirror`,
    parsedTitle: 'Nosferatu',
    year: 2024,
    tmdbId: 426063,
    type: 'Movie',
    accent: '#e11d48',
    links: [
      { quality: '4K', audio: 'Multi-Audio', codec: 'x265', size: '18.4 GB', server: 'HubCloud', url: 'https://hubcloud.lol/drive/nosf2024-4k-hevc' },
      { quality: '4K', audio: 'Multi-Audio', codec: 'HEVC', size: '18.4 GB', server: 'GDFlix', url: 'https://gdflix.cfd/file/nosf2024-4k-mirror' },
    ],
  },
  {
    raw: `📺 Silo.S02E01-E10.COMPLETE.1080p.ATVP.WEB-DL.x265.10bit-CineFlue\nAudio: Hindi + English + Tamil [Multi-Audio]\nBatch Size: 14.2 GB (10 Episodes)\n🔗 https://hubcloud.lol/drive/silo-s02-pack-1080p\n🔗 https://drive.google.com/file/d/1SiloS02CompletePack/view`,
    parsedTitle: 'Silo (Season 2)',
    year: 2024,
    tmdbId: 125988,
    type: 'TV Series',
    accent: '#06b6d4',
    links: [
      { quality: '1080p', audio: 'Multi-Audio', codec: 'x265', size: '14.2 GB', server: 'HubCloud', url: 'https://hubcloud.lol/drive/silo-s02-pack-1080p' },
      { quality: '1080p', audio: 'Multi-Audio', codec: 'HEVC', size: '14.2 GB', server: 'Google Drive', url: 'https://drive.google.com/file/d/1SiloS02CompletePack/view' },
    ],
  },
  {
    raw: `🎬 Interstellar.2014.IMAX.Remastered.2160p.UHD.BluRay.x265.HDR10\nAudio: English DTS-HD MA 5.1 + Hindi\nSize: 24.8 GB\n🔗 https://hubcloud.fit/drive/interstellar-imax-4k\n🔗 https://cdn.cinephile.edge/direct/interstellar-4k.mkv`,
    parsedTitle: 'Interstellar',
    year: 2014,
    tmdbId: 157336,
    type: 'Movie',
    accent: '#f59e0b',
    links: [
      { quality: '4K', audio: 'Multi-Audio', codec: 'x265', size: '24.8 GB', server: 'HubCloud', url: 'https://hubcloud.fit/drive/interstellar-imax-4k' },
      { quality: '4K', audio: 'English', codec: 'HEVC', size: '24.8 GB', server: 'Direct', url: 'https://cdn.cinephile.edge/direct/interstellar-4k.mkv' },
    ],
  },
];

export const TelegramBotDrawer: React.FC<TelegramBotDrawerProps> = ({
  isOpen,
  onClose,
  openReports = [],
  pendingRequests = [],
  onTriageModule,
  onLiveIngestSuccess,
}) => {
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0);
  const [rawMessage, setRawMessage] = useState(TELEGRAM_PRESETS[0].raw);
  const [isSimulating, setIsSimulating] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  useEffect(() => {
    setRawMessage(TELEGRAM_PRESETS[selectedPresetIdx].raw);
    setTerminalLogs([]);
  }, [selectedPresetIdx]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const runSimulation = () => {
    const preset = TELEGRAM_PRESETS[selectedPresetIdx];
    setIsSimulating(true);
    setTerminalLogs(['[1/4] Verified sender ID 930928310 (Shyam Super-Admin)...']);

    setTimeout(() => {
      setTerminalLogs((prev) => [
        ...prev,
        `[2/4] seasonParser & hubcloudParser -> Title: "${preset.parsedTitle}" (${preset.year}), ${preset.links.length} mirrors extracted.`,
      ]);
    }, 350);

    setTimeout(() => {
      setTerminalLogs((prev) => [
        ...prev,
        `[3/4] TMDB API resolved canonical ID #${preset.tmdbId} + official artwork.`,
      ]);
    }, 700);

    setTimeout(() => {
      setTerminalLogs((prev) => [
        ...prev,
        `[4/4] Dual-write committed! "${preset.parsedTitle}" is LIVE on Cinephile.`,
      ]);
      setIsSimulating(false);

      if (onLiveIngestSuccess) {
        onLiveIngestSuccess(preset);
      }
    }, 1100);
  };

  const defaultAlerts = [
    {
      badge: 'BROKEN LINK',
      badgeColor: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
      title: 'Dune: Part Two (Audio Mismatch)',
      sub: 'Reported by @rohan_k99 • 4 hours ago',
      actionModule: 'reports' as const,
    },
    {
      badge: 'USER REQUEST',
      badgeColor: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
      title: 'Gladiator II (2024)',
      sub: 'Requested by @meera_watches • 4K IMAX',
      actionModule: 'requests' as const,
    },
    {
      badge: 'USER REQUEST',
      badgeColor: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
      title: 'Silo Season 2 (Episodes 9-10)',
      sub: 'Requested by @arjun_cine • 1080p HEVC',
      actionModule: 'requests' as const,
    },
  ];

  return (
    <>
      {/* Drawer Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 animate-fadeIn"
      />

      {/* Slide-Over Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Telegram Super-Admin Drawer"
        className="fixed top-0 right-0 z-50 h-screen w-full max-w-lg bg-[#0e1017] border-l border-white/[0.08] shadow-2xl flex flex-col font-sans animate-slideLeft"
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#0a0c12]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-white text-sm">@CineFlue_bot Super-Admin</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  WEBHOOK LIVE
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400">
                Auth ID: <span className="text-cyan-400">930928310</span> • src/lib/telegramBotCore.ts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-[#151822] text-slate-400 hover:text-white border border-white/[0.08] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Forward-to-Ingest Simulator */}
          <div className="rounded-2xl bg-[#151822] border border-white/[0.08] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Forward-to-Ingest Pipeline</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">Zero-Dashboard Ingest</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Simulate forwarding a release post to <span className="font-mono text-cyan-400">@CineFlue_bot</span> from Telegram ID{' '}
              <span className="font-mono text-amber-400">930928310</span>. Executes <span className="font-mono text-slate-200">seasonParser</span> +{' '}
              <span className="font-mono text-slate-200">hubcloudParser</span>, queries TMDB, and dual-writes live to Redis &amp; Supabase.
            </p>

            {/* Preset Sample Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Select Forwarded Channel Post Preset
              </label>
              <select
                value={selectedPresetIdx}
                onChange={(e) => setSelectedPresetIdx(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl bg-[#07080d] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value={0}>🎬 Nosferatu (2024) 2160p WEB-DL TrueHD Atmos x265 [Hindi + English]</option>
                <option value={1}>📺 Silo S02E01-E10 Complete Season Pack 1080p HEVC [Multi-Audio]</option>
                <option value={2}>🎬 Interstellar (2014) IMAX Remastered 4K HDR10 x265 [English + Hindi]</option>
              </select>
            </div>

            {/* Forwarded Raw Message Box */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Raw Telegram Forward Payload
              </label>
              <textarea
                rows={5}
                value={rawMessage}
                onChange={(e) => setRawMessage(e.target.value)}
                className="w-full p-3 rounded-xl bg-[#07080d] border border-white/[0.08] font-mono text-[11px] text-emerald-300 focus:outline-none focus:border-cyan-500 leading-relaxed"
              />
            </div>

            <button
              type="button"
              onClick={runSimulation}
              disabled={isSimulating}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50 transition-all cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>Forward Message to @CineFlue_bot &amp; Ingest Live</span>
            </button>

            {/* Live Parser & Dual-Write Terminal Output */}
            {terminalLogs.length > 0 && (
              <div className="rounded-xl bg-[#07080d] border border-cyan-500/30 p-3.5 font-mono text-[11px] space-y-1.5">
                {terminalLogs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      i === terminalLogs.length - 1 && log.includes('[4/4]')
                        ? 'text-emerald-400 font-bold'
                        : i === 2
                        ? 'text-amber-300'
                        : 'text-slate-300'
                    }
                  >
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instant Admin Alerts Feed (Pushed to Shyam's Phone) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <BellRing className="w-3.5 h-3.5 text-amber-400" />
                Instant Admin Alerts (Shyam&apos;s Mobile)
              </h3>
              <span className="text-[10px] font-mono text-slate-500">Real-time Push</span>
            </div>

            <div className="space-y-2.5">
              {defaultAlerts.map((alert, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-[#151822] border border-white/[0.08] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <span className={`px-1.5 py-0.5 rounded border font-mono text-[9px] font-bold ${alert.badgeColor}`}>
                      {alert.badge}
                    </span>
                    <p className="text-xs font-bold text-white truncate mt-1">{alert.title}</p>
                    <p className="text-[11px] text-slate-400 truncate">{alert.sub}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onTriageModule) onTriageModule(alert.actionModule);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#07080d] hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-cyan-300 shrink-0 cursor-pointer"
                  >
                    Triage
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default TelegramBotDrawer;
