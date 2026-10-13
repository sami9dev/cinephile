'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Menu, X, ChevronDown, Film } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/context/AuthContext';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';

const AuthModal = dynamic(() => import('./AuthModal'), { ssr: false });
const RequestLinkModal = dynamic(() => import('./RequestLinkModal'), { ssr: false });

interface NavDropdownItem {
  label: string;
  href: string;
  badge?: string;
}

interface NavItem {
  label: string;
  href?: string;
  children?: NavDropdownItem[];
}

const NAVIGATION_ITEMS: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Explore', href: '/explore' },
  {
    label: 'Movies',
    href: '/movies',
    children: [
      { label: 'All Uploaded Movies', href: '/movies' },
      { label: '4K Ultra HD (2160p)', href: '/movies?quality=4k' },
      { label: '1080p Full HD', href: '/movies?quality=1080p' },
      { label: 'BluRay / REMUX', href: '/movies?quality=remux' },
      { label: 'HDR / Dolby Vision', href: '/movies?quality=hdr' },
      { label: 'Hindi / Dual Audio', href: '/movies?audio=hindi' },
    ],
  },
  {
    label: 'Web Series',
    href: '/tv',
    children: [
      { label: 'All Web Series', href: '/tv' },
      { label: 'Complete Season Packs (Zip)', href: '/tv?category=zippack' },
      { label: '4K / 1080p Web Series', href: '/tv?quality=1080p' },
      { label: 'Hindi Dubbed Series', href: '/tv?audio=hindi' },
      { label: 'English & International', href: '/tv?audio=english' },
    ],
  },
  {
    label: 'OTT',
    children: [
      { label: 'Netflix', href: '/search?ott=netflix', badge: '🔴' },
      { label: 'Amazon Prime Video', href: '/search?ott=prime', badge: '📦' },
      { label: 'Disney+ Hotstar', href: '/search?ott=hotstar', badge: '⭐' },
      { label: 'JioCinema', href: '/search?ott=jiocinema', badge: '🎬' },
      { label: 'SonyLIV', href: '/search?ott=sonyliv', badge: '📺' },
      { label: 'Zee5', href: '/search?ott=zee5', badge: '⚡' },
      { label: 'Apple TV+', href: '/search?ott=appletv', badge: '🍎' },
    ],
  },
  { label: 'Anime', href: '/search?genre=16&name=Anime' },
  { label: '4K HDR', href: '/movies?quality=4k' },
  { label: 'Top IMDb', href: '/search?sort=top_rated' },
];

export const Header: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, isLoggedIn } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  useEffect(() => {
    if (pathname?.startsWith('/admin')) return;
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname]);

  // Hotkey listener for '/' or 'Ctrl+K'
  useEffect(() => {
    if (pathname?.startsWith('/admin')) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        router.push('/search');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pathname, router]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Do not render public website header on admin routes
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-[#08090c]/90 backdrop-blur-md border-b border-white/10 shadow-2xl py-3'
            : 'bg-gradient-to-b from-[#08090c]/95 via-[#08090c]/60 to-transparent py-4'
        }`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo */}
          <Link href="/" className="inline-flex items-center group shrink-0 min-w-0" aria-label="Cinephile Home">
            <span className="font-logo text-[22px] sm:text-[30px] leading-none tracking-[0.06em] text-[#9d8ec2] group-hover:text-[#bcaedb] transition-colors drop-shadow-sm select-none">
              Cinephile
            </span>
          </Link>

          {/* Centered Modern Search Bar */}
          <div className="relative flex-1 max-w-md mx-2 sm:mx-6 hidden sm:block">
            <form onSubmit={handleSearchSubmit} className="relative w-full">
              <input
                type="text"
                placeholder="Search movies, series, collections... (Press /)"
                aria-label="Search movies and TV shows"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#14121f] hover:bg-[#1a1728] focus:bg-[#1a1728] text-xs font-medium text-zinc-100 placeholder:text-zinc-500 rounded-xl pl-9 pr-9 py-2 border border-[#2b2542] focus:border-purple-500/60 focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all shadow-inner"
                suppressHydrationWarning
              />
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <kbd className="hidden md:inline-flex items-center absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] text-zinc-400 bg-zinc-800/80 rounded border border-zinc-700/60">
                /
              </kbd>
            </form>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Mobile Search Button */}
            <Link
              href="/search"
              className="sm:hidden min-w-[38px] min-h-[38px] p-2 rounded-xl bg-zinc-850 text-zinc-300 hover:text-white border border-zinc-750 inline-flex items-center justify-center"
              aria-label="Search catalog"
              suppressHydrationWarning
            >
              <Search className="w-4 h-4" />
            </Link>

            {/* Quick Request Button */}
            <button
              type="button"
              onClick={() => setIsRequestModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 hover:text-amber-300 font-bold text-xs transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0"
              title="Request a movie or web series link"
            >
              <Film className="w-3.5 h-3.5" />
              <span>Request</span>
            </button>

            {/* Theme Toggle Button */}
            <ThemeToggle />

            {/* User Notifications Bell */}
            <NotificationBell />

            {/* User Profile / Auth Button */}
            {!isLoggedIn ? (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 min-h-[36px] rounded-full bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-[11px] sm:text-xs shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
                title="Connect your Google Account"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Sign In</span>
              </button>
            ) : (
              <Link
                href="/profile"
                className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 min-w-[38px] min-h-[38px] justify-center rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition-all hover:border-amber-400/50"
                title={`Signed in as ${userProfile.displayName || userProfile.name || 'User'} (${userProfile.email})`}
                aria-label={`User profile for ${userProfile.displayName || userProfile.name || 'User'}`}
              >
                <div className="w-6 h-6 rounded-full overflow-hidden bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-black font-black text-xs shrink-0">
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
                <span className="hidden md:inline text-xs font-semibold max-w-[90px] truncate">
                  {userProfile.displayName || userProfile.name || 'Account'}
                </span>
              </Link>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden min-w-[38px] min-h-[38px] p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white inline-flex items-center justify-center"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              suppressHydrationWarning
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#0e1117] border-b border-white/10 px-3 sm:px-4 py-4 space-y-2.5 max-h-[82vh] overflow-y-auto animate-fadeIn">
            {/* Inline Mobile Search Form */}
            <form
              onSubmit={(e) => {
                handleSearchSubmit(e);
                setMobileMenuOpen(false);
              }}
              className="relative w-full sm:hidden"
            >
              <input
                type="text"
                placeholder="Search movies, web series, 4K..."
                aria-label="Search movies and TV shows"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#14121f] text-xs font-medium text-zinc-100 placeholder:text-zinc-500 rounded-xl pl-9 pr-3 py-2.5 border border-[#2b2542] focus:border-purple-500/60 focus:outline-none"
                suppressHydrationWarning
              />
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </form>

            {/* Quick Mobile Request Button */}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setIsRequestModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 min-h-[42px] rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:text-amber-300 font-bold text-xs transition-all active:scale-98"
            >
              <Film className="w-4 h-4 text-amber-400" />
              <span>Request Movie or TV Series</span>
            </button>

            {NAVIGATION_ITEMS.map((item) => {
              if (item.children) {
                const isExpanded = mobileExpanded === item.label;
                return (
                  <div key={item.label} className="space-y-1">
                    <button
                      onClick={() => setMobileExpanded(isExpanded ? null : item.label)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-zinc-200 hover:bg-zinc-800 transition-colors"
                    >
                      <span>{item.label}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-zinc-400 transition-transform ${
                          isExpanded ? 'rotate-180 text-amber-400' : ''
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="pl-3 space-y-1 border-l border-zinc-800 ml-3">
                        {item.children.map((sub) => (
                          <Link
                            key={sub.label}
                            href={sub.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`block px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between ${
                              pathname === sub.href
                                ? 'bg-amber-400/10 text-amber-400 font-bold'
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                            }`}
                          >
                            <span>{sub.label}</span>
                            {sub.badge && <span className="text-[10px]">{sub.badge}</span>}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href || '/'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive ? 'bg-amber-400/10 text-amber-400 font-semibold' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* Mobile Auth Button */}
            <div className="pt-3 border-t border-zinc-800">
              {!isLoggedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setIsAuthOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-black text-xs shadow-md transition-all active:scale-98 cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Sign In with Google</span>
                </button>
              ) : (
                <Link
                  href="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200"
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-black font-black text-xs shrink-0">
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
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-white block truncate">
                      {userProfile.displayName || userProfile.name || 'Account'}
                    </span>
                    <span className="text-[11px] text-zinc-500 block truncate font-mono">
                      {userProfile.email}
                    </span>
                  </div>
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Auth Modal */}
      {isAuthOpen && <AuthModal onClose={() => setIsAuthOpen(false)} />}

      {/* General User Request Modal */}
      {isRequestModalOpen && (
        <RequestLinkModal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
        />
      )}
    </>
  );
};

export default Header;
