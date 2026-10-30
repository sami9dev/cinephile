'use client';

export interface ReportModalData {
  linkId?: string;
  movieId: number | string;
  mediaTitle: string;
  mediaType: 'movie' | 'tv';
  posterPath?: string | null;
  linkTitle?: string;
  reportedUrl?: string;
  quality?: string | null;
  server?: string;
}

export default function ReportBrokenLinkModal() {
  return null;
}
