'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Flame,
  Lock,
  Unlock,
  User,
  Key,
  Eye,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import { getBackdropURL } from '@/lib/tmdb';

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

interface AdminLoginGateProps {
  onLoginSuccess?: (token: string) => void;
  checkingAuth?: boolean;
}

export const AdminLoginGate: React.FC<AdminLoginGateProps> = ({
  onLoginSuccess,
  checkingAuth = false,
}) => {
  const [selectedBackdropTheme, setSelectedBackdropTheme] = useState<string>('spiderman');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const currentTheme = BACKDROP_THEMES[selectedBackdropTheme] || BACKDROP_THEMES.spiderman;
  // Use w300 (18.5 KB) instead of original (1.1 MB) for instant mobile LCP
  const backdropUrl = getBackdropURL(currentTheme.backdropPath, 'w300');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput) {
      setAuthError(true);
      return;
    }
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
        setAuthError(false);
        setPasswordInput('');
        if (onLoginSuccess) {
          onLoginSuccess(data.token);
        }
      } else {
        setAuthError(true);
      }
    } catch {
      setAuthError(true);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full flex flex-col justify-between items-center px-4 py-8 overflow-hidden">
      {/* 1. Full-Screen Cinematic Backdrop Layer (Pseudo-element GPU rendering, no LCP penalty) */}
      <div
        className="admin-theme-backdrop absolute inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#07090e]"
        style={{
          ['--admin-backdrop' as any]: backdropUrl ? `url('${backdropUrl}')` : undefined,
        }}
      >
        {/* Multi-layered cinematic vignette & dark depth gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07090e] via-[#07090e]/75 to-black/70 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07090e]/90 via-transparent to-[#07090e]/90 pointer-events-none" />

        {/* Ambient Cinematic Glow Orbs - GPU Radial Gradients (0 CPU blur convolutions) */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,_rgba(245,158,11,0.12)_0%,_transparent_70%)] pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-96 h-96 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.10)_0%,_transparent_70%)] pointer-events-none" />
        <div className="absolute top-12 right-10 w-96 h-96 rounded-full bg-[radial-gradient(circle,_rgba(225,29,72,0.10)_0%,_transparent_70%)] pointer-events-none" />
      </div>

      {/* 2. Top Floating Glass Navigation Header */}
      <header className="relative z-10 w-full max-w-4xl flex items-center justify-between py-2.5 px-4 sm:px-6 rounded-2xl bg-zinc-950/60 backdrop-blur-md border border-white/10 shadow-xl mb-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-black font-black text-xs shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
            <Flame className="w-4 h-4 fill-black" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black text-white tracking-wider flex items-center gap-1">
              CINE<span className="text-amber-400">FUEL</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-mono">ADMIN</span>
            </span>
          </div>
        </Link>

        {/* Theme Edition Switcher Pills */}
        <div className="hidden sm:flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 text-[11px]">
          {Object.entries(BACKDROP_THEMES).map(([key, t]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedBackdropTheme(key)}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                selectedBackdropTheme === key
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
              title={`Switch backdrop to ${t.name}`}
            >
              {t.name.split(':')[0]}
            </button>
          ))}
        </div>

        <Link
          href="/"
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white transition-all shadow-sm"
        >
          <span>← Website</span>
        </Link>
      </header>

      {/* 3. Center Glassmorphic Master Control Card */}
      <div className="relative z-10 w-full max-w-md my-auto py-4">
        <div className="relative backdrop-blur-md bg-[#0b0e17]/85 border border-white/10 hover:border-amber-500/40 rounded-3xl p-5 sm:p-9 shadow-[0_20px_70px_-10px_rgba(0,0,0,0.95)] space-y-6 transition-all duration-300 overflow-hidden">
          {/* Top Amber Accent Line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

          {/* Glowing Lock Icon */}
          <div className="relative mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
            <div className="absolute inset-0 rounded-2xl bg-amber-400/15 blur-sm -z-10" />
            <Lock className="w-7 h-7" />
          </div>

          {/* Title & Thematic Subtitle */}
          <div className="text-center space-y-1.5">
            <span className="text-[10px] font-mono font-bold tracking-widest text-amber-400 uppercase">
              {currentTheme.editionTag}
            </span>
            <h2 className="text-xl sm:text-3xl font-black text-white tracking-tight drop-shadow-md">
              CiNEPHiLE Master Control
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto">
              Enter Administrator Credentials to access backend catalog, links, and system controls.
            </p>
          </div>

          {/* Login Form or Checking Indicator */}
          {checkingAuth ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono">Verifying secure session...</span>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4 text-left">
              {/* Username Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block">
                  Admin Username
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
                    <User className="w-4 h-4 text-amber-400/80" />
                  </div>
                  <input
                    type="text"
                    placeholder="Enter admin name"
                    value={usernameInput}
                    onChange={(e) => {
                      setUsernameInput(e.target.value);
                      setAuthError(false);
                    }}
                    className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-amber-400 focus:bg-black/60 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all backdrop-blur-md"
                    autoFocus
                    suppressHydrationWarning
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block">
                  Admin Password
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
                    <Key className="w-4 h-4 text-amber-400/80" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter admin password"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setAuthError(false);
                    }}
                    className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-amber-400 focus:bg-black/60 rounded-2xl pl-10 pr-10 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all font-mono backdrop-blur-md"
                    suppressHydrationWarning
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {authError && (
                  <p className="text-xs text-rose-400 mt-2 font-medium flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-3 py-2 rounded-xl">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Invalid credentials. Please verify username and password.</span>
                  </p>
                )}
              </div>

              {/* Unlock Button */}
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 bg-[length:200%_auto] hover:bg-right transition-all duration-500 text-black font-black text-sm shadow-xl shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                suppressHydrationWarning
              >
                <Unlock className="w-4 h-4" />
                <span>{authLoading ? 'Verifying Authorization...' : 'Unlock Admin Panel'}</span>
              </button>
            </form>
          )}

          {/* Thematic Quote & Security Details */}
          <div className="pt-2 text-center space-y-1.5 border-t border-white/5">
            <p className="text-[11px] text-amber-400/90 italic font-medium">
              {currentTheme.quote}
            </p>
            <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-500 font-mono">
              <span>Protected Admin Gate</span>
              <span>•</span>
              <span>256-Bit SSL Encrypted</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Bottom Footer */}
      <footer className="relative z-10 text-center py-2 text-[11px] text-zinc-500 font-mono">
        CiNEPHiLE Platform • Confidential Administrator Environment
      </footer>
    </div>
  );
};

export default AdminLoginGate;
