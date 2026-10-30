'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Menu, X, ChevronDown } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);

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
      setSearchQuery('');
    }
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
          isScrolled
            ? 'bg-[#08090c]/90 backdrop-blur-md border-b border-white/5 py-3 shadow-2xl'
            : 'bg-transparent py-4'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <span className="text-black font-black text-xl tracking-tighter">C</span>
            </div>
            <span className="text-xl font-black tracking-tight text-white group-hover:text-amber-400 transition-colors">
              CINE<span className="text-amber-400">FUEL</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
            {NAVIGATION_ITEMS.map((item) => {
              if (item.children) {
                return (
                  <div key={item.label} className="relative group/menu py-2">
                    <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors">
                      <span>{item.label}</span>
                      <ChevronDown className="w-3.5 h-3.5 opacity-60 group-hover/menu:rotate-180 transition-transform" />
                    </button>
                    <div className="absolute top-full left-0 w-56 p-2 rounded-2xl bg-[#0f1117] border border-white/10 shadow-2xl opacity-0 translate-y-2 pointer-events-none group-hover/menu:opacity-100 group-hover/menu:translate-y-0 group-hover/menu:pointer-events-auto transition-all duration-200 z-50">
                      {item.children.map((child) => (
                        <Link
                          key={child.label}
                          href={child.href}
                          className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <span>{child.label}</span>
                          {child.badge && <span>{child.badge}</span>}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              }

              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href || '/'}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-400/10 text-amber-400 font-semibold'
                      : 'text-zinc-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Desktop Search Button */}
            <Link
              href="/search"
              className="p-2 sm:px-3 sm:py-1.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
              title="Search titles, actors, directors (Press / or Ctrl+K)"
            >
              <Search className="w-4 h-4 text-zinc-400" />
              <span className="hidden md:inline text-zinc-400">Search catalog...</span>
              <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 rounded border border-zinc-700">
                /
              </kbd>
            </Link>

            {/* Mobile Search Button */}
            <Link
              href="/search"
              className="md:hidden p-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </Link>

            {/* Theme Toggle Button */}
            <ThemeToggle />

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
              />
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
            </form>

            {NAVIGATION_ITEMS.map((item) => {
              if (item.children) {
                const isExpanded = mobileExpanded === item.label;
                return (
                  <div key={item.label} className="space-y-1">
                    <button
                      onClick={() => setMobileExpanded(isExpanded ? null : item.label)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800"
                    >
                      <span>{item.label}</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="pl-4 space-y-1">
                        {item.children.map((child) => (
                          <Link
                            key={child.label}
                            href={child.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                          >
                            <span>{child.label}</span>
                            {child.badge && <span>{child.badge}</span>}
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
          </div>
        )}
      </header>
    </>
  );
};

export default Header;
