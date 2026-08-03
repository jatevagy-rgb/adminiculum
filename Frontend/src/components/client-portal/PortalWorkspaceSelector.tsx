import type { PortalWorkspaceSummary } from '@/lib/clientPortalApi';

const modeLabels: Record<PortalWorkspaceSummary['mode'], string> = {
  INDIVIDUAL: 'Magánügyfél',
  ORGANIZATION: 'Szervezeti ügyfél',
  CASE_RELAY: 'Ügyátvezető',
};

const roleLabels: Record<PortalWorkspaceSummary['membershipRole'], string> = {
  MEMBER: 'Tag',
  REPRESENTATIVE: 'Képviselő',
  APPROVER: 'Jóváhagyó',
};

export function PortalWorkspaceSelector({ workspaces, onSelect }: { workspaces: PortalWorkspaceSummary[]; onSelect: (publicReference: string) => void }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6" data-testid="portal-workspace-selector">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b85f4b]">Munkatérválasztás</p>
      <h1 className="mt-3 font-serif text-4xl font-semibold">Melyik munkatérbe szeretne belépni?</h1>
      <p className="mt-3 text-stone-700">Csak az aktív, az iroda által jóváhagyott munkaterei jelennek meg.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {workspaces.map((workspace) => (
          <article key={workspace.publicReference} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-[#b85f4b]">{modeLabels[workspace.mode]}</p>
            <h2 className="mt-2 text-2xl font-semibold">{workspace.name}</h2>
            <p className="mt-2 text-stone-700">{workspace.clientDisplayName}</p>
            <p className="mt-4 text-sm text-stone-600">Szerepkör: {roleLabels[workspace.membershipRole]} · Elérhető</p>
            <button type="button" onClick={() => onSelect(workspace.publicReference)} className="mt-6 rounded-full bg-[#3e2f29] px-5 py-3 font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#d99b8e]/50">Belépés</button>
          </article>
        ))}
      </div>
    </section>
  );
}
