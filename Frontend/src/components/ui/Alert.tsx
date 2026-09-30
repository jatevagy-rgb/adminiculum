"use client";

import React, { type HTMLAttributes, type ReactNode } from "react";

export type AlertVariant = "success" | "warning" | "error" | "info";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  action?: ReactNode;
  /**
   * Optional dismiss callback. When provided, renders an accessible dismiss button.
   */
  onDismiss?: () => void;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<
  AlertVariant,
  { container: string; icon: string; title: string; defaultIcon: ReactNode }
> = {
  success: {
    container: "border-emerald-200 bg-emerald-50 text-emerald-950",
    icon: "text-emerald-700",
    title: "text-emerald-950",
    defaultIcon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  warning: {
    container: "border-amber-200 bg-amber-50 text-amber-950",
    icon: "text-amber-700",
    title: "text-amber-950",
    defaultIcon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  error: {
    container: "border-red-200 bg-red-50 text-red-950",
    icon: "text-red-700",
    title: "text-red-950",
    defaultIcon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  info: {
    container: "border-blue-200 bg-blue-50 text-blue-950",
    icon: "text-blue-700",
    title: "text-blue-950",
    defaultIcon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

export function Alert({
  variant = "info",
  title,
  action,
  onDismiss,
  children,
  className = "",
  ...props
}: AlertProps) {
  const styles = variantStyles[variant];
  const role = variant === "error" || variant === "warning" ? "alert" : "status";
  const ariaLive = variant === "error" ? "assertive" : "polite";

  return (
    <div
      role={role}
      aria-live={ariaLive}
      className={`flex items-start gap-3 rounded-[8px] border p-3.5 text-xs ${styles.container} ${className}`}
      {...props}
    >
      <div className={`shrink-0 mt-0.5 ${styles.icon}`}>{styles.defaultIcon}</div>
      <div className="flex-1 min-w-0">
        {title && <h4 className={`font-semibold text-sm mb-0.5 ${styles.title}`}>{title}</h4>}
        <div className="leading-relaxed">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Értesítés bezárása"
          className="shrink-0 -mr-1 -mt-1 p-1 rounded-[4px] hover:bg-black/5 text-current opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current transition-opacity min-w-[32px] min-h-[32px] inline-flex items-center justify-center"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
