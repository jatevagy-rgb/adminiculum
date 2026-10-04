type StatusTrackProps = {
  current: string | null;
  waitingOn: string | null;
  nextStep: string | null;
};

const blockClass =
  "rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 py-3";

/**
 * Now / Waiting / Next — the most important matter section. Three clearly
 * differentiated operational blocks from canonical customer-safe values only.
 * A null nextStep renders a quiet truthful absence state; nothing is invented.
 */
export function PortalMatterStatusTrack({ current, waitingOn, nextStep }: StatusTrackProps) {
  return (
    <section aria-label="Az ügy állása" data-testid="portal-matter-status-track" className="grid gap-3 sm:grid-cols-3">
      <div className={blockClass}>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--adm-brand-green)]">Most itt tartunk</p>
        <p className="mt-2 text-sm font-medium text-[var(--adm-text-primary)]">{current || "Nincs közzétett állapotleírás."}</p>
      </div>
      <div className={blockClass}>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--adm-semantic-warning)]">Mire várunk</p>
        <p className="mt-2 text-sm font-medium text-[var(--adm-text-primary)]">{waitingOn || "Nincs közzétett várakozási ok."}</p>
      </div>
      <div className={blockClass}>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--adm-brand-deep)]">Következő lépés</p>
        {nextStep ? (
          <p className="mt-2 text-sm font-medium text-[var(--adm-text-primary)]">{nextStep}</p>
        ) : (
          <p className="mt-2 text-sm text-[var(--adm-text-secondary)]">Nincs közzétett következő lépés.</p>
        )}
      </div>
    </section>
  );
}
