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
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('cinefuel_theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}else{document.documentElement.classList.remove('light');document.documentElement.classList.add('dark');}}catch(e){}})();`,
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
        className="font-ui bg-[#08090c] text-zinc-100 min-h-screen w-full max-w-full overflow-x-hidden flex flex-col antialiased selection:bg-amber-500 selection:text-black"
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
