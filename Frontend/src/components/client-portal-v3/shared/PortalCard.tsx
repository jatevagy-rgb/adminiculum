import type { ReactNode } from "react";

export type PortalCardAccent = "none" | "green" | "subtle";

interface PortalCardProps {
  children: ReactNode;
  accent?: PortalCardAccent;
  className?: string;
  testid?: string;
}

const ACCENT_CLASSES: Record<PortalCardAccent, string> = {
  none: "",
  green: "border-l-4 border-l-[var(--adm-brand-green)]",
  subtle: "border-l-4 border-l-[var(--adm-border-canonical)]",
};

/**
 * Standard content container card for V3 portal surfaces.
 * Light surface, canonical borders, subtle depth.
 */
export function PortalCard({
  children,
  accent = "none",
  className = "",
  testid,
}: PortalCardProps) {
  return (
    <div
      data-testid={testid}
      className={`overflow-hidden rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] shadow-sm transition-shadow hover:shadow-md ${ACCENT_CLASSES[accent]} ${className}`}
    >
      {children}
    </div>
  );
}
