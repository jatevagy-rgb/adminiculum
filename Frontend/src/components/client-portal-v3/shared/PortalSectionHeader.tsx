import type { ReactNode } from "react";

interface PortalSectionHeaderProps {
  title: string;
  badge?: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Standardized section header for Client Portal 3.0.
 * Organizes titles, counters, and action links in a balanced horizontal row.
 */
export function PortalSectionHeader({
  title,
  badge,
  description,
  action,
  className = "",
}: PortalSectionHeaderProps) {
  return (
    <div
      className={`border-b border-[var(--adm-border-canonical)] px-4 py-3.5 sm:px-5 sm:py-4 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-xl">
            {title}
          </h2>
          {badge}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {description ? (
        <p className="mt-1 text-xs text-[var(--adm-text-secondary)] sm:text-sm">
          {description}
        </p>
      ) : null}
    </div>
  );
}
