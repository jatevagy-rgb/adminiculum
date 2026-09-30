"use client";

import React, { type HTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";

export type MetricTileTone = "neutral" | "primary" | "success" | "warning" | "danger";

export interface MetricTileBaseProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: MetricTileTone;
  icon?: ReactNode;
  badge?: ReactNode;
  /**
   * Convenience shorthand: when true, maps tone to "danger" for overdue warnings.
   */
  overdue?: boolean;
}

export interface MetricTileStaticProps extends MetricTileBaseProps, HTMLAttributes<HTMLDivElement> {
  onClick?: never;
  selected?: never;
}

export interface MetricTileInteractiveProps extends MetricTileBaseProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  onClick: () => void;
  selected?: boolean;
}

export type MetricTileProps = MetricTileStaticProps | MetricTileInteractiveProps;

const toneStyles: Record<
  MetricTileTone,
  {
    container: string;
    label: string;
    value: string;
    hint: string;
  }
> = {
  neutral: {
    container: "border-[var(--adm-border-canonical,#E5E7E6)] bg-white text-[var(--adm-text-primary,#1F2937)]",
    label: "text-[var(--adm-text-secondary,#6B7280)]",
    value: "text-[var(--adm-text-primary,#1F2937)]",
    hint: "text-[var(--adm-text-secondary,#6B7280)]",
  },
  primary: {
    container: "border-[var(--adm-border-canonical,#E5E7E6)] bg-[var(--adm-canvas-subtle,#F8FAF9)] text-[var(--adm-brand-green,#0F3D32)]",
    label: "text-[var(--adm-text-secondary,#6B7280)]",
    value: "text-[var(--adm-brand-green,#0F3D32)]",
    hint: "text-[var(--adm-text-secondary,#6B7280)]",
  },
  success: {
    container: "border-emerald-200 bg-emerald-50/50 text-emerald-950",
    label: "text-emerald-800",
    value: "text-emerald-950",
    hint: "text-emerald-700",
  },
  warning: {
    container: "border-amber-200 bg-amber-50/50 text-amber-950",
    label: "text-amber-800",
    value: "text-amber-950",
    hint: "text-amber-700",
  },
  danger: {
    container: "border-red-200 bg-red-50/40 text-[var(--adm-brand-terracotta,#B85C4B)]",
    label: "text-[var(--adm-brand-terracotta,#B85C4B)]",
    value: "text-[var(--adm-brand-terracotta,#B85C4B)]",
    hint: "text-red-700",
  },
};

/**
 * MetricTile - Canonical summary statistic / KPI tile for Adminiculum workspaces.
 *
 * Supports:
 * - Semantic label / value pairing with optional hint and badge/icon
 * - Five canonical semantic tones (neutral, primary, success, warning, danger)
 * - Static mode (div container) or interactive mode (accessible button with aria-pressed)
 * - Safe CSS custom property fallbacks without arbitrary new hex classes
 */
export function MetricTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  badge,
  overdue = false,
  className = "",
  ...props
}: MetricTileProps) {
  const resolvedTone: MetricTileTone = overdue ? "danger" : tone;
  const styles = toneStyles[resolvedTone];

  if ("onClick" in props && typeof props.onClick === "function") {
    const { onClick, selected = false, disabled = false, ...btnProps } = props as MetricTileInteractiveProps;
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        className={`flex flex-col justify-between p-4 text-left rounded-[8px] border transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green,#0F3D32)] focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${styles.container} ${selected ? "ring-1 ring-[var(--adm-brand-green,#0F3D32)]" : "hover:bg-[var(--adm-canvas-subtle,#F8FAF9)]"} ${className}`}
        {...btnProps}
      >
        <div className="flex items-center justify-between gap-2 w-full">
          <span className={`text-xs font-semibold uppercase tracking-[0.12em] ${styles.label}`}>
            {label}
          </span>
          {badge ?? icon}
        </div>
        <div className={`mt-2 text-xl font-semibold ${styles.value}`}>
          {value}
        </div>
        {hint ? <div className={`mt-1 text-xs ${styles.hint}`}>{hint}</div> : null}
      </button>
    );
  }

  const { onClick: _o, selected: _s, ...divProps } = props as MetricTileStaticProps;
  return (
    <div
      className={`p-4 rounded-[8px] border ${styles.container} ${className}`}
      {...divProps}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${styles.label}`}>
          {label}
        </p>
        {badge ?? icon}
      </div>
      <p className={`mt-2 text-xl font-semibold ${styles.value}`}>
        {value}
      </p>
      {hint ? <p className={`mt-1 text-xs ${styles.hint}`}>{hint}</p> : null}
    </div>
  );
}
