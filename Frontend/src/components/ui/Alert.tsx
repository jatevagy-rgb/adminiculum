"use client";

import React, { type HTMLAttributes, type ReactNode } from "react";

export type AlertVariant = "success" | "warning" | "error" | "info";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<
  AlertVariant,
  { container: string; icon: string; title: string; defaultIcon: ReactNode }
> = {
  success: {
    container: "border-[#BCE4CE] bg-[#E8F5EE] text-[#0F3D32]",
    icon: "text-[#1E7E51]",
    title: "text-[#0F3D32]",
    defaultIcon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  warning: {
    container: "border-[#FDE68A] bg-[#FEF3C7] text-[#92400E]",
    icon: "text-[#D97706]",
    title: "text-[#92400E]",
    defaultIcon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  error: {
    container: "border-[#FECACA] bg-[#FEE2E2] text-[#991B1B]",
    icon: "text-[#DC2626]",
    title: "text-[#991B1B]",
    defaultIcon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  info: {
    container: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1E40AF]",
    icon: "text-[#2563EB]",
    title: "text-[#1E40AF]",
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
  children,
  className = "",
  ...props
}: AlertProps) {
  const styles = variantStyles[variant];
  const role = variant === "error" || variant === "warning" ? "alert" : "status";

  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-[8px] border p-3.5 text-xs ${styles.container} ${className}`}
      {...props}
    >
      <div className={`shrink-0 mt-0.5 ${styles.icon}`}>{styles.defaultIcon}</div>
      <div className="flex-1 min-w-0">
        {title && <h4 className={`font-semibold text-sm mb-0.5 ${styles.title}`}>{title}</h4>}
        <div className="leading-relaxed">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
