'use client';

import React, { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global root error caught:', error);

    // Auto-recover from chunk load errors caused by new Vercel deployments
    const isChunkLoadError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Load failed');

    if (isChunkLoadError && typeof window !== 'undefined') {
      const lastReload = Number(sessionStorage.getItem('last_global_chunk_reload') || '0');
      if (Date.now() - lastReload > 10000) {
        sessionStorage.setItem('last_global_chunk_reload', String(Date.now()));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <html lang="en" className="dark" data-theme="dark">
      <body className="bg-black text-zinc-100 min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#0a0a0d] border border-zinc-800 shadow-2xl text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Application Update Detected
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
              A new version of CineFuel has been deployed. Please reload the page to load the latest features and links.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                } else {
                  reset();
                }
              }}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer"
            >
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
