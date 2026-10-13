'use client';

import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Mail,
  Lock,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  LogIn,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface AuthModalProps {
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const { loginWithGoogle, loginWithEmail, signupWithEmail, isLoggedIn, userProfile, logout } = useAuth();
  const [showEmailOptions, setShowEmailOptions] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // 1-Click Pure Google Sign-In: Zero form fields, zero input requirements
  const handleGoogleLogin = async () => {
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const res = await loginWithGoogle();
      setLoading(false);
      if (res.success) {
        setSuccessMessage('Signed in with Google!');
        setTimeout(onClose, 600);
      } else {
        setError(res.error || 'Failed to sign in with Google.');
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Google sign-in error. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    if (isSignUp) {
      if (!password || password.length < 4) {
        setError('Password must be at least 4 characters.');
        setLoading(false);
        return;
      }
      const res = await signupWithEmail(email.trim(), password, displayName.trim());
      setLoading(false);
      if (res.success) {
        setSuccessMessage('Account created and signed in successfully!');
        setTimeout(onClose, 600);
      } else {
        setError(res.error || 'Failed to sign up.');
      }
    } else {
      if (!password) {
        setError('Please enter your password.');
        setLoading(false);
        return;
      }
      const res = await loginWithEmail(email.trim(), password);
      setLoading(false);
      if (res.success) {
        setSuccessMessage('Signed in successfully!');
        setTimeout(onClose, 600);
      } else {
        setError(res.error || 'Failed to sign in.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 animate-fadeIn">
      <div className="bg-[#0e1117] border border-zinc-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="text-sm font-bold text-white tracking-wide truncate">
              {isLoggedIn ? 'Account Profile' : 'Sign In to CiNEPHiLE'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 text-sm">
          {isLoggedIn ? (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-black font-black text-2xl mx-auto shadow-lg shadow-amber-500/20">
                {userProfile.displayName ? userProfile.displayName[0].toUpperCase() : 'U'}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white truncate">{userProfile.displayName}</h3>
                <p className="text-xs text-zinc-400 break-all">{userProfile.email}</p>
              </div>

              <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Account Active & Synced</span>
              </div>

              <div className="pt-2 flex justify-center">
                <button
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status Notifications */}
              {successMessage && (
                <div className="p-3 bg-emerald-950/50 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {error && (
                <div className="p-3 bg-rose-950/50 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-medium flex items-start gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{error}</p>
                </div>
              )}

              {/* Pure 1-Click Continue with Google Button */}
              <div className="space-y-3">
                <p className="text-xs text-zinc-400 text-center leading-relaxed">
                  Sign in with your Google account to bookmark movies, request links, and track downloads.
                </p>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs transition-all shadow-lg shadow-white/10 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-900" />
                      <span>Connecting with Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                        />
                      </svg>
                      <span>Continue with Google</span>
                    </>
                  )}
                </button>
              </div>

              {/* Discreet Email Option Toggle */}
              <div className="pt-2 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setShowEmailOptions(!showEmailOptions)}
                  className="w-full flex items-center justify-center gap-1.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <span>{showEmailOptions ? 'Hide email sign-in' : 'Or sign in with email & password'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showEmailOptions ? 'rotate-180' : ''}`} />
                </button>

                {showEmailOptions && (
                  <form onSubmit={handleSubmit} className="space-y-3 pt-3 animate-fadeIn">
                    {isSignUp && (
                      <div>
                        <label className="text-[11px] font-semibold text-zinc-300 block mb-1">Display Name</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Your Name"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
                          />
                          <UserIcon className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-[11px] font-semibold text-zinc-300 block mb-1">Email Address</label>
                      <div className="relative">
                        <input
                          type="email"
                          required
                          placeholder="name@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
                        />
                        <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-zinc-300 block">Password</label>
                        {isSignUp && <span className="text-[10px] text-zinc-500">Min 4 characters</span>}
                      </div>
                      <div className="relative">
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
                        />
                        <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <LogIn className="w-3.5 h-3.5" />
                          <span>{isSignUp ? 'Create Account' : 'Sign In with Email'}</span>
                        </>
                      )}
                    </button>

                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSignUp(!isSignUp);
                          setError('');
                        }}
                        className="text-amber-400 hover:underline text-[11px]"
                      >
                        {isSignUp ? 'Have an account? Sign In' : 'Need an account? Register'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
