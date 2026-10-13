'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  X,
  CheckCircle,
  Loader2,
  Link2Off,
  CreditCard,
  VolumeX,
  VideoOff,
  FileQuestion,
  Gauge,
  HelpCircle,
  ExternalLink,
  Lock,
  LogIn,
  UserCheck,
} from 'lucide-react';
import { DefectiveLinkIssueType } from '@/types';
import { isValidHttpUrl, sanitizeSafeUrl } from '@/lib/security';
import { useAuth } from '@/context/AuthContext';
import AuthModal from './AuthModal';

export interface ReportModalData {
  linkId?: string;
  movieId: number;
  mediaTitle: string;
  mediaType?: 'movie' | 'tv';
  posterPath?: string | null;
  linkTitle: string;
  reportedUrl: string;
  quality?: string;
  server?: string;
}

interface ReportBrokenLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ReportModalData | null;
  onReportSubmitted?: () => void;
}

const PROBLEM_TYPES: Array<{
  id: DefectiveLinkIssueType;
  title: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    id: 'dead_link',
    title: 'Dead Link / 404',
    description: 'Link expired, removed, or returns 404...',
    icon: Link2Off,
  },
  {
    id: 'paywall_loop',
    title: 'Bypass / Paywall Loop',
    description: 'Cannot bypass or asks for forced pay...',
    icon: CreditCard,
  },
  {
    id: 'audio_desync',
    title: 'Audio Desync / Missing',
    description: 'Audio out of sync or claimed language...',
    icon: VolumeX,
  },
  {
    id: 'video_glitch',
    title: 'Video Glitch / Corrupted',
    description: 'Pixelated, frozen, or corrupted video...',
    icon: VideoOff,
  },
  {
    id: 'wrong_episode',
    title: 'Wrong Episode / Title',
    description: 'File content does not match title...',
    icon: FileQuestion,
  },
  {
    id: 'slow_timeout',
    title: 'Slow Server / Timeout',
    description: 'Server speed unusable or connection...',
    icon: Gauge,
  },
  {
    id: 'other',
    title: 'Other Issue',
    description: 'Other issue or re-upload request...',
    icon: HelpCircle,
  },
];

export const ReportBrokenLinkModal: React.FC<ReportBrokenLinkModalProps> = ({
  isOpen,
  onClose,
  data,
  onReportSubmitted,
}) => {
  const { userProfile, isLoggedIn } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [selectedIssue, setSelectedIssue] = useState<DefectiveLinkIssueType>('dead_link');
  const [quality, setQuality] = useState(data?.quality || '');
  const [server, setServer] = useState(data?.server || '');
  const [releaseName, setReleaseName] = useState(data?.linkTitle || '');
  const [reportedUrl, setReportedUrl] = useState(data?.reportedUrl || '');
  const [notes, setNotes] = useState('');
  const [userEmail, setUserEmail] = useState(userProfile?.email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Synchronize when data prop changes
  React.useEffect(() => {
    if (data) {
      setQuality(data.quality || '');
      setServer(data.server || '');
      setReleaseName(data.linkTitle || '');
      setReportedUrl(data.reportedUrl || '');
      setSelectedIssue('dead_link');
      setNotes('');
      setUserEmail(userProfile?.email || '');
      setIsSuccess(false);
      setErrorMessage('');
    }
  }, [data, userProfile]);

  if (!isOpen || !data) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      setErrorMessage('Sign-in required: Please sign in to submit a defective link report.');
      setShowAuthModal(true);
      return;
    }
    if (!reportedUrl.trim()) {
      setErrorMessage('Reported URL cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    const currentProblem = PROBLEM_TYPES.find((p) => p.id === selectedIssue);

    try {
      const payload = {
        linkId: data.linkId,
        movieId: data.movieId,
        mediaTitle: data.mediaTitle,
        mediaType: data.mediaType || 'movie',
        posterPath: data.posterPath || null,
        linkTitle: releaseName.trim() || data.linkTitle,
        reportedUrl: reportedUrl.trim(),
        issueType: selectedIssue,
        issueLabel: currentProblem?.title || 'Dead Link / 404',
        quality: quality.trim(),
        server: server.trim(),
        additionalNotes: notes.trim(),
        userEmail: userEmail.trim() || userProfile.email || '',
        userId: userProfile.uid,
        userName: userProfile.displayName,
      };

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();

      if (!res.ok) {
        throw new Error(resData.error || 'Failed to submit report');
      }

      setIsSuccess(true);
      if (onReportSubmitted) onReportSubmitted();

      // Trigger custom window event so any listeners (like admin badges) can update
      window.dispatchEvent(new Event('cinefuel_report_submitted'));

      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 2200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div
        className="relative w-full max-w-2xl bg-[#0d111a] border border-zinc-800 hover:border-amber-500/30 rounded-3xl p-4 sm:p-7 shadow-2xl space-y-5 my-auto max-h-[92vh] overflow-y-auto no-scrollbar transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3 sm:gap-3.5 pr-8">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/10">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0 flex-1">
            <h3 className="text-base sm:text-xl font-black text-white tracking-tight flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span>Report Broken Link</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-semibold border border-zinc-700 truncate max-w-full">
                {data.mediaTitle}
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Help us replace dead or non-working downloads. Our admin will verify and fix it.
            </p>
          </div>
        </div>

        {isSuccess ? (
          <div className="py-12 text-center space-y-3.5 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-black text-white">Report Received!</h4>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
              Thank you for reporting. This link has been flagged in the Admin Defective Links Manager
              for immediate verification and replacement.
            </p>
          </div>
        ) : !isLoggedIn ? (
          <div className="py-6 sm:py-8 text-center space-y-5 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-xl shadow-amber-500/10">
              <Lock className="w-8 h-8" />
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700">
                Sign-In Required
              </span>
              <h3 className="text-xl font-black text-white tracking-tight">
                Please Sign In to Report Broken Links
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                To report dead links, wrong episodes, or broken download files, you must sign in with an active account. Our administrators verify all reports and require authenticated users to prevent abuse and notify you once fixed.
              </p>
            </div>

            <div className="p-3 sm:p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs max-w-sm mx-auto">
              <span className="text-zinc-400">Current Status:</span>
              <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-amber-400 font-bold text-[11px] border border-zinc-700 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Guest Mode (Not Signed In)
              </span>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In / Create Account</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Signed-in user badge */}
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0 truncate">
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-zinc-300 truncate">
                  Reporting as: <strong className="text-white font-bold">{userProfile.displayName || 'Cinephile'}</strong> ({userProfile.email})
                </span>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/20 px-2 py-0.5 rounded shrink-0">
                Verified
              </span>
            </div>

            {/* 1. Problem Selector Grid */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block">
                What seems to be the problem?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PROBLEM_TYPES.map((problem) => {
                  const Icon = problem.icon;
                  const isSelected = selectedIssue === problem.id;

                  return (
                    <button
                      key={problem.id}
                      type="button"
                      onClick={() => setSelectedIssue(problem.id)}
                      className={`text-left p-3 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/80 shadow-md shadow-amber-500/10'
                          : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs ${
                          isSelected
                            ? 'bg-amber-500 text-black font-bold'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="overflow-hidden min-w-0">
                        <div
                          className={`text-xs font-bold leading-tight ${
                            isSelected ? 'text-amber-300' : 'text-zinc-200'
                          }`}
                        >
                          {problem.title}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                          {problem.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Metadata: Quality & Server */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Quality / Version
                </label>
                <input
                  type="text"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  placeholder="e.g. 1080p, 4K HDR"
                  className="w-full bg-zinc-900/80 border border-zinc-800 focus:border-amber-400 focus:bg-zinc-900 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Server / Provider
                </label>
                <input
                  type="text"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  placeholder="e.g. GDFlix, HubCloud"
                  className="w-full bg-zinc-900/80 border border-zinc-800 focus:border-amber-400 focus:bg-zinc-900 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* 3. Filename / Release Name (Optional) */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Filename / Release Name (Optional)
              </label>
              <input
                type="text"
                value={releaseName}
                onChange={(e) => setReleaseName(e.target.value)}
                placeholder="The.Movie.Name.1080p.WEB-DL.mkv"
                className="w-full bg-zinc-900/80 border border-zinc-800 focus:border-amber-400 focus:bg-zinc-900 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none font-mono transition-all"
              />
            </div>

            {/* 4. Reported URL */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Reported URL
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={reportedUrl}
                  onChange={(e) => setReportedUrl(e.target.value)}
                  placeholder="https://..."
                  required
                  className="w-full bg-zinc-900/80 border border-zinc-800 focus:border-amber-400 focus:bg-zinc-900 rounded-xl pl-3 pr-8 py-2 text-xs text-zinc-300 font-mono focus:outline-none transition-all"
                />
                {reportedUrl && isValidHttpUrl(reportedUrl) && (
                  <a
                    href={sanitizeSafeUrl(reportedUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                    title="Open URL"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* 5. Additional Notes (Optional) */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Additional Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Download page opens 404, or Hindi audio track is missing..."
                className="w-full bg-zinc-900/80 border border-zinc-800 focus:border-amber-400 focus:bg-zinc-900 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none resize-none transition-all"
              />
            </div>

            {/* 6. Email (Optional) */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Your Email (Optional)
              </label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="your@email.com (if you'd like a fix notification)"
                className="w-full bg-zinc-900/80 border border-zinc-800 focus:border-amber-400 focus:bg-zinc-900 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none transition-all"
              />
            </div>

            {errorMessage && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 px-3 py-2 rounded-xl">
                {errorMessage}
              </p>
            )}

            {/* Submit Action */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto min-h-[42px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting Report...</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Submit Broken Link Report</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default ReportBrokenLinkModal;
