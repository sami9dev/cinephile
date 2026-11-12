import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Bebas_Neue, Manrope } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { WatchlistProvider } from '@/context/WatchlistContext';
import { AuthProvider } from '@/context/AuthContext';
import Header from '@/components/Header';

const hartsinger = localFont({
  src: '../../public/fonts/Hartsinger_Regular.otf',
  variable: '--font-hartsinger',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-bebas-neue',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'Cinephile - Discover Movies & TV, Where to Watch & Track Watchlist',
  description: 'Your ultimate cinema command center. Discover trending movies & TV shows, direct high-speed downloads in 4K UHD & 1080p, and streaming availability.',
  keywords: 'movies, tv shows, streaming india, watchlist, hotstar, jiocinema, netflix, tmdb, imdb ratings, direct download, 4k uhd',
  openGraph: {
    siteName: 'Cinephile',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${spaceGrotesk.variable} ${bebasNeue.variable} ${manrope.variable} ${hartsinger.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#08090c" id="theme-color-meta" />
        {/* Early Zero-Flicker Theme Initialization Script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='cinephile-theme',lk='cinefuel_theme';var s=localStorage.getItem(k)||localStorage.getItem(lk);var t=s;if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var d=t==='dark';var r=document.documentElement;r.classList.remove('dark','light');r.classList.add(d?'dark':'light');r.setAttribute('data-theme',d?'dark':'light');r.style.colorScheme=d?'dark':'light';var m=document.getElementById('theme-color-meta');if(m)m.setAttribute('content',d?'#08090c':'#f8fafc');}catch(e){document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="dns-prefetch" href="https://image.tmdb.org" />
        <link rel="preconnect" href="https://m.media-amazon.com" />
        <link rel="dns-prefetch" href="https://m.media-amazon.com" />
        <link rel="preconnect" href="https://upload.wikimedia.org" />
        <link rel="dns-prefetch" href="https://upload.wikimedia.org" />
      </head>
      <body
        className="font-ui min-h-screen w-full max-w-full overflow-x-hidden flex flex-col antialiased selection:bg-amber-500 selection:text-black transition-colors duration-200"
        suppressHydrationWarning
      >
        <AuthProvider>
          <WatchlistProvider>
            <Header />
            <main className="flex-1 pt-16 w-full max-w-full overflow-x-hidden min-w-0">{children}</main>
          </WatchlistProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
