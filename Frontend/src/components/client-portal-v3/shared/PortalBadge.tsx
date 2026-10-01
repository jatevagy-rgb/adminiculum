import type { ReactNode } from "react";

export type PortalBadgeVariant = "neutral" | "green" | "warning" | "terracotta" | "subtle";

interface PortalBadgeProps {
  variant?: PortalBadgeVariant;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<PortalBadgeVariant, string> = {
  neutral:
    "border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] text-[var(--adm-text-secondary)]",
  green:
    "border-[var(--adm-brand-green)]/30 bg-[var(--adm-canvas-subtle)] text-[var(--adm-brand-green)]",
  warning:
    "border-[var(--adm-semantic-warning)]/30 bg-[var(--adm-canvas-subtle)] text-[var(--adm-semantic-warning)]",
  terracotta:
    "border-[var(--adm-brand-terracotta)]/30 bg-[var(--adm-canvas-subtle)] text-[var(--adm-brand-terracotta)]",
  subtle:
    "border-transparent bg-[var(--adm-canvas-subtle)] text-[var(--adm-text-secondary)]",
};

/**
 * Shared badge primitive for Client Portal 3.0.
 * Follows canonical typography and design tokens with no raw hex.
 */
export function PortalBadge({
  variant = "neutral",
  children,
  icon,
  className = "",
}: PortalBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${VARIANT_CLASSES[variant]} ${className}`}
      data-testid="portal-badge"
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}
