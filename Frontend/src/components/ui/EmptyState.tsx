"use client";

import React, { type ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 rounded-[12px] border border-[#E5E7E6] bg-white ${className}`}
    >
      {icon && (
        <div className="mb-3 text-[#6B7280] flex items-center justify-center" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="font-serif text-base font-semibold text-[#1F2937]">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs text-[#6B7280] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
