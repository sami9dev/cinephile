'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import AdminLoginShell from '@/components/admin/AdminLoginShell';

// Lazy-load the heavy authenticated dashboard so unauthenticated visitors
// download ONLY the lightweight login shell (< 15 KB JS!).
const AdminDashboard = dynamic(
  () => import('@/components/admin/AdminDashboard'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-[#090A0F] flex flex-col items-center justify-center gap-3 text-amber-400">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-zinc-400">Loading Master Control Panel...</span>
      </div>
    ),
  }
);

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const abortController = new AbortController();

    // 1. Purge deprecated legacy credentials from storage
    try {
      localStorage.removeItem('cinefuel_admin_pass');
      localStorage.removeItem('cinefuel_admin_key');
      localStorage.removeItem('cinefuel_admin_user');
      sessionStorage.removeItem('cinefuel_admin_pass');
      sessionStorage.removeItem('cinefuel_admin_auth');
      sessionStorage.removeItem('cinefuel_admin_user');
    } catch {}

    let sessionToken = '';
    try {
      sessionToken =
        sessionStorage.getItem('cinefuel_admin_token') ||
        localStorage.getItem('cinefuel_admin_token') ||
        '';
    } catch {}

    const headers: Record<string, string> = {};
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    // 2. Verify session via cookie or bearer token
    fetch('/api/admin/auth', {
      headers,
      credentials: 'include',
      signal: abortController.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMountedRef.current) return;
        if (data?.authenticated) {
          setIsAuthenticated(true);
        } else {
          try {
            sessionStorage.removeItem('cinefuel_admin_token');
            localStorage.removeItem('cinefuel_admin_token');
          } catch {}
          setIsAuthenticated(false);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (!isMountedRef.current) return;
        setIsAuthenticated(false);
      });

    return () => {
      isMountedRef.current = false;
      abortController.abort();
    };
  }, []);

  if (isAuthenticated === null) {
    return <AdminLoginShell checkingAuth={true} onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  if (!isAuthenticated) {
    return <AdminLoginShell onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <AdminDashboard
      initialAuthenticated={true}
      onLogout={async () => {
        try {
          const res = await fetch('/api/admin/auth/logout', {
            method: 'POST',
            credentials: 'include',
          });
          if (!res.ok) {
            await fetch('/api/admin/auth', { method: 'DELETE', credentials: 'include' });
          }
          try {
            sessionStorage.removeItem('cinefuel_admin_token');
            localStorage.removeItem('cinefuel_admin_token');
          } catch {}
          setIsAuthenticated(false);
        } catch {
          try {
            sessionStorage.removeItem('cinefuel_admin_token');
            localStorage.removeItem('cinefuel_admin_token');
          } catch {}
          setIsAuthenticated(false);
        }
      }}
    />
  );
}
