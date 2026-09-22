"use client";

import React, { type ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  badge?: ReactNode;
  kicker?: string;
  subtitle?: string;
  children?: ReactNode;
  actions?: ReactNode;
  primaryAction?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  badge,
  kicker,
  subtitle,
  children,
  actions,
  primaryAction,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`flex flex-col gap-3 pb-4 border-b border-[#E5E7E6] sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {kicker && (
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">
            {kicker}
          </p>
        )}
        <div className="flex flex-wrap items-baseline gap-2.5 mt-0.5">
          <h1 className="font-serif text-[28px] font-semibold leading-tight text-[#1F2937]">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#6B7280]">
            {subtitle}
          </p>
        )}
        {children}
      </div>
      {(actions || primaryAction) && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {actions}
          {primaryAction}
        </div>
      )}
    </header>
  );
}
