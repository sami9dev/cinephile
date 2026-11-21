import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cinephile - Admin Master Control Panel',
  description: 'Mission-critical master control panel and system administration console.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#07080d] text-[#f1f5f9] cinema-grid-bg w-full antialiased selection:bg-rose-600/30 selection:text-rose-200">
      {children}
    </div>
  );
}
