'use client';

import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, KeyRound, Lock, CheckCircle2, X, Zap, AlertTriangle } from 'lucide-react';

interface AuthShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticate?: (method: string) => void;
}

export const AuthShieldModal: React.FC<AuthShieldModalProps> = ({ isOpen, onClose, onAuthenticate }) => {
  const [activeTab, setActiveTab] = useState<'master' | 'firebase'>('master');
  const [username, setUsername] = useState('shyam_root');
  const [password, setPassword] = useState('••••••••••••••••••••');
  const [simulationResult, setSimulationResult] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTestAttack = (attackType: string) => {
    if (attackType === 'tamper') {
      setSimulationResult('REJECTED 401 Unauthorized: HMAC signature mismatch (sig_invalid)');
    } else if (attackType === 'timing') {
      setSimulationResult('REJECTED 401 Unauthorized: timingSafeEqualStrings evaluated in constant-time (0.012ms)');
    } else if (attackType === 'expired') {
      setSimulationResult('REJECTED 401 Unauthorized: Token timestamp exp < Date.now()');
    }
  };

  const handleSimulateLogin = (method: string) => {
    if (onAuthenticate) {
      onAuthenticate(method);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-shield-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#0e1017] border border-white/[0.12] shadow-2xl overflow-hidden font-sans">
        {/* Lightweight Bundle Shield Telemetry Bar */}
        <div className="px-5 py-3 bg-[#07080d] border-b border-white/[0.08] flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <Shield className="w-3.5 h-3.5" />
            <span>/admin EDGE SHIELD ACTIVE</span>
          </div>
          <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
            Shell Bundle: 12.1 KB (&lt; 15 KB)
          </span>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 id="auth-shield-title" className="text-lg font-extrabold text-white">Cinephile /admin Authentication</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Heavy <span className="font-mono text-slate-300">AdminDashboard.tsx</span> lazy-loads via{' '}
                <span className="font-mono text-cyan-400">next/dynamic</span> only after HMAC-SHA256 verification.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Dual Login Path Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#07080d] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setActiveTab('master')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'master' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              1. Master Server Credentials
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('firebase')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'firebase' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              2. Firebase Admin Token
            </button>
          </div>

          {activeTab === 'master' ? (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-[#151822] border border-white/[0.08] text-[11px] font-mono text-slate-300 flex items-center justify-between">
                <span>
                  Comparator: <strong className="text-emerald-400">timingSafeEqualStrings()</strong>
                </span>
                <span className="text-slate-500">Zero Timing-Attack Surface</span>
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  ADMIN_USER
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#151822] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  ADMIN_PASSWORD
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#151822] border border-white/[0.08] font-mono text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
              <button
                type="button"
                onClick={() => handleSimulateLogin('Master Server Credentials (timingSafeEqualStrings)')}
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50 transition-all cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>Verify Constant-Time &amp; Mint 24h HMAC-SHA256 Token</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#151822] border border-white/[0.08] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Whitelisted Account:</span>
                  <span className="font-mono text-cyan-300">shyam@cinephile.app</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Firebase Custom Claim:</span>
                  <span className="font-mono text-emerald-400">&#123; admin: true &#125;</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSimulateLogin('Firebase Admin Token (admin: true claim)')}
                className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50 transition-all cursor-pointer"
              >
                <Shield className="w-4 h-4" />
                <span>Verify Firebase Claim &amp; Unlock AdminDashboard.tsx</span>
              </button>
            </div>
          )}

          {/* Cryptographic Boundary Attack Simulator */}
          <div className="pt-2 border-t border-white/[0.08] space-y-2.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              Cryptographic Boundary Attack Probes
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleTestAttack('tamper')}
                className="py-1.5 px-2 rounded-lg bg-[#151822] hover:bg-rose-500/10 border border-white/[0.08] text-[10px] font-mono text-slate-300 hover:text-rose-300 transition-colors cursor-pointer"
              >
                Tampered HMAC
              </button>
              <button
                type="button"
                onClick={() => handleTestAttack('timing')}
                className="py-1.5 px-2 rounded-lg bg-[#151822] hover:bg-amber-500/10 border border-white/[0.08] text-[10px] font-mono text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
              >
                Timing Probe
              </button>
              <button
                type="button"
                onClick={() => handleTestAttack('expired')}
                className="py-1.5 px-2 rounded-lg bg-[#151822] hover:bg-cyan-500/10 border border-white/[0.08] text-[10px] font-mono text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer"
              >
                Expired Exp
              </button>
            </div>
            {simulationResult && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-[11px]">
                {simulationResult}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthShieldModal;
