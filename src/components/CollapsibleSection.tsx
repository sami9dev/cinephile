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
      className={`bg-[#121420]/95 border border-white/10 rounded-2xl sm:rounded-3xl shadow-xl transition-all duration-200 overflow-hidden w-full max-w-full min-w-0 ${className}`}
    >
      {/* Clickable Accordion Header */}
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full p-3.5 sm:p-5 sm:px-6 cursor-pointer select-none hover:bg-zinc-900/40 transition-colors ${
          isOpen ? 'border-b border-white/10' : ''
        } ${headerClassName}`}
      >
        <div className="flex flex-col gap-2.5 min-w-0">
          {/* Main Header Row: Title & Icon on Left; Controls on Right */}
          <div className="flex items-center justify-between gap-2.5 sm:gap-3 min-w-0">
            {/* Left Side: Icon, Title, Subtitle */}
            <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
              {icon && (
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                  {icon}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm sm:text-base font-bold text-white tracking-tight flex flex-wrap items-center gap-1.5 sm:gap-2 break-words min-w-0">
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
                <span className="px-2.5 py-1 rounded-full bg-[#1c2132] text-zinc-300 text-xs font-semibold tracking-wider uppercase border border-white/5 pointer-events-none whitespace-nowrap">
                  {badge}
                </span>
              )}
              <div className="w-7 h-7 flex items-center justify-center text-zinc-400">
                <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {/* Mobile Top Right: Badge & Chevron */}
            <div className="flex sm:hidden items-center gap-2 shrink-0">
              {badge && (
                <span className="px-2 py-0.5 rounded-full bg-[#1c2132] text-zinc-300 text-[11px] font-semibold tracking-wider uppercase border border-white/5 pointer-events-none whitespace-nowrap">
                  {badge}
                </span>
              )}
              <div className="w-6 h-6 flex items-center justify-center text-zinc-400">
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
              </div>
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
