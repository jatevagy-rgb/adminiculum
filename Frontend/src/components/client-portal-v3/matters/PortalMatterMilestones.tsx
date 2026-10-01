import { PortalEmptyInline } from "../shared/PortalEmptyInline";

export type PublishedMilestone = {
  reference?: string;
  title?: string;
  description?: string | null;
  state?: string;
  displayOrder?: number;
  completedAt?: string | null;
};

function milestoneStateLabel(state: string | undefined): string {
  switch (state) {
    case "COMPLETED":
      return "Teljesítve";
    case "IN_PROGRESS":
      return "Folyamatban";
    default:
      return "Tervezett";
  }
}

function milestoneToneClass(state: string | undefined): string {
  switch (state) {
    case "COMPLETED":
      return "text-[var(--adm-brand-green)]";
    case "IN_PROGRESS":
      return "text-[var(--adm-semantic-warning)]";
    default:
      return "text-[var(--adm-text-secondary)]";
  }
}

/**
 * Published milestones + canonical progress. The percentage meter renders ONLY
 * when the backend published an explicit progressPercentage; it is never
 * computed from milestone counts.
 */
export function PortalMatterMilestones({ milestones, progressPercentage }: { milestones: PublishedMilestone[]; progressPercentage: number | null }) {
  const ordered = (milestones ?? [])
    .slice()
    .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0));
  return (
    <section data-testid="portal-matter-milestones" className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--adm-border-canonical)] px-4 py-3">
        <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Közzétett mérföldkövek</h2>
        {progressPercentage !== null && progressPercentage !== undefined ? (
          <span className="text-sm font-semibold text-[var(--adm-brand-green)]" data-testid="portal-matter-progress">{progressPercentage}%</span>
        ) : null}
      </div>
      {progressPercentage !== null && progressPercentage !== undefined ? (
        <div className="px-4 pt-4" role="progressbar" aria-valuenow={progressPercentage} aria-valuemin={0} aria-valuemax={100} aria-label="Közzétett előrehaladás">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--adm-canvas-subtle)]">
            <div className="h-full rounded-full bg-[var(--adm-brand-green)]" style={{ width: `${Math.min(100, Math.max(0, progressPercentage))}%` }} />
          </div>
        </div>
      ) : null}
      {ordered.length ? (
        <ol className="px-4 py-3">
          {ordered.map((milestone) => (
            <li key={milestone.reference || `${milestone.title}-${milestone.displayOrder}`} className="border-b border-[var(--adm-border-canonical)] py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-medium text-[var(--adm-text-primary)]">{milestone.title || "Mérföldkő"}</p>
                <span className={`text-xs font-semibold ${milestoneToneClass(milestone.state)}`}>{milestoneStateLabel(milestone.state)}</span>
              </div>
              {milestone.description ? <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">{milestone.description}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="px-4 py-3">
          <PortalEmptyInline>Az iroda még nem tett közzé mérföldkövet ehhez az ügyhöz.</PortalEmptyInline>
        </div>
      )}
    </section>
  );
}
