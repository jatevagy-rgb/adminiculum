import Link from "next/link";
import type { PortalActionItem } from "@/lib/clientPortalApi";

const URGENCY_LABELS: Record<PortalActionItem["urgency"], string> = {
  OVERDUE: "Lejárt",
  DUE_SOON: "Hamarosan esedékes",
  NORMAL: "Nyitott",
};

const STATE_LABELS: Record<PortalActionItem["state"], string> = {
  OPEN: "Nyitott",
  IN_PROGRESS: "Folyamatban",
  CORRECTION_REQUIRED: "Javítás szükséges",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function urgencyTextClass(urgency: PortalActionItem["urgency"]): string {
  if (urgency === "OVERDUE") return "text-[var(--adm-brand-terracotta)]";
  if (urgency === "DUE_SOON") return "text-[var(--adm-semantic-warning)]";
  return "text-[var(--adm-text-secondary)]";
}

/**
 * One canonical customer action in the V3 Action Center. Exactly one CTA per
 * row; the href always points to the authoritative existing customer journey.
 */
export function PortalActionRow({ item }: { item: PortalActionItem }) {
  const dueLabel = formatDate(item.dueAt);
  return (
    <li
      data-testid="portal-action-row"
      data-source-type={item.sourceType}
      data-urgency={item.urgency}
      className="flex flex-col gap-3 border-b border-[var(--adm-border-canonical)] px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold text-[var(--adm-text-primary)]">{item.title}</p>
        <p className="mt-1 truncate text-xs text-[var(--adm-text-secondary)]">
          {item.contextLabel ? `${item.contextLabel}${dueLabel ? ` · Határidő: ${dueLabel}` : ""}` : dueLabel ? `Határidő: ${dueLabel}` : ""}
        </p>
        <p className={`mt-1.5 text-xs font-semibold ${urgencyTextClass(item.urgency)}`} aria-live="polite">
          {item.canCompleteInPortal ? `Önre vár · ${URGENCY_LABELS[item.urgency]}` : "Tájékoztatás · Itt nem teljesíthető"}
          {item.state !== "OPEN" ? ` · ${STATE_LABELS[item.state]}` : ""}
        </p>
      </div>
      <Link
        href={item.href}
        data-testid="portal-action-cta"
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-brand-green)] transition-colors hover:bg-[var(--adm-brand-green)] hover:text-[var(--adm-canvas-white)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        {item.canCompleteInPortal ? item.actionLabel : "Részletek megnyitása"}
      </Link>
    </li>
  );
}
