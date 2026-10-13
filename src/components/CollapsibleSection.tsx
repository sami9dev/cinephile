'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface CollapsibleSectionProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  id?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  subtitle,
  badge,
  action,
  defaultOpen = false,
  children,
  className = '',
  headerClassName = '',
  contentClassName = '',
  id,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);

  return (
    <div
      id={id}
      className={`bg-[#0f121a] border border-zinc-800/80 rounded-2xl sm:rounded-3xl shadow-xl transition-all duration-200 overflow-hidden w-full max-w-full min-w-0 ${className}`}
    >
      {/* Clickable Accordion Header */}
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full p-3.5 sm:p-5 sm:px-6 cursor-pointer select-none hover:bg-zinc-900/40 transition-colors ${
          isOpen ? 'border-b border-zinc-800/80' : ''
        } ${headerClassName}`}
      >
        <div className="flex flex-col gap-2.5 min-w-0">
          {/* Main Header Row: Title & Icon on Left; Controls on Right */}
          <div className="flex items-center justify-between gap-2.5 sm:gap-3 min-w-0">
            {/* Left Side: Icon, Title, Subtitle */}
            <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 flex-1">
              {icon && <div className="shrink-0 text-amber-400">{icon}</div>}
              <div className="min-w-0 flex-1">
                <div className="text-sm sm:text-lg font-bold text-white tracking-tight flex flex-wrap items-center gap-1.5 sm:gap-2 break-words min-w-0">
                  {title}
                </div>
                {subtitle && isOpen && (
                  <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2 sm:line-clamp-1">{subtitle}</p>
                )}
              </div>
            </div>

            {/* Desktop Right Side: Action, Badge, Chevron */}
            <div className="hidden sm:flex items-center gap-3 shrink-0">
              {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
              {badge && (
                <span className="px-3 py-1 rounded-full bg-zinc-900/90 border border-zinc-700/80 text-zinc-300 text-xs font-semibold pointer-events-none">
                  {badge}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen((prev) => !prev);
                }}
                className="w-8 h-8 rounded-full border border-amber-500/50 bg-[#161922] text-amber-400 flex items-center justify-center hover:bg-amber-500/20 hover:border-amber-400 transition-all shadow-md active:scale-95 cursor-pointer"
                aria-label={isOpen ? 'Collapse section' : 'Expand section'}
              >
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {/* Mobile Top Right: Badge & Chevron */}
            <div className="flex sm:hidden items-center gap-1.5 shrink-0">
              {badge && (
                <span className="px-2 py-0.5 rounded-full bg-zinc-900/90 border border-zinc-700/80 text-zinc-300 text-[11px] font-semibold pointer-events-none whitespace-nowrap">
                  {badge}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen((prev) => !prev);
                }}
                className="w-8 h-8 rounded-full border border-amber-500/50 bg-[#161922] text-amber-400 flex items-center justify-center hover:bg-amber-500/20 hover:border-amber-400 transition-all shadow-md active:scale-95 cursor-pointer"
                aria-label={isOpen ? 'Collapse section' : 'Expand section'}
              >
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Mobile Action Row: Dedicated line below Title, with zero overlap */}
          {action && (
            <div
              className="sm:hidden w-full pt-1"
              onClick={(e) => e.stopPropagation()}
            >
              {action}
            </div>
          )}
        </div>
      </div>

      {/* Expandable Content Body */}
      {isOpen && (
        <div className={`p-3.5 sm:p-6 space-y-4 animate-in fade-in-50 duration-200 min-w-0 max-w-full ${contentClassName}`}>
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;
