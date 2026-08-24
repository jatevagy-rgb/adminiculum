"use client";

type PersonHeaderProps = {
  identity: { displayName: string; email: string; jobTitle?: string | null; organizationUnitName?: string | null };
};

export function PortalPersonHeader({ identity }: PersonHeaderProps) {
  const { displayName, email, jobTitle, organizationUnitName } = identity;
  return (
    <div>
      <p className="text-sm font-semibold text-stone-950">{displayName || email}</p>
      {jobTitle ? <p className="mt-1 text-sm text-stone-700">Pozíció: {jobTitle}</p> : null}
      {organizationUnitName ? <p className="mt-1 text-sm text-stone-600">{organizationUnitName}</p> : null}
      <p className="mt-1 text-xs text-stone-500">{email}</p>
    </div>
  );
}

export function PortalProfileCard({
  completed,
  total,
  unknown,
  available = true,
  onContinue,
}: {
  completed?: number;
  total?: number;
  unknown?: number;
  available?: boolean;
  onContinue?: () => void;
}) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm" aria-labelledby="portal-profile-heading">
      <p className="cp-kicker">Vállalati profil</p>
      <h2 id="portal-profile-heading" className="cp-card-heading mt-1">Vállalati profil</h2>
      {available && completed != null && total != null ? (
        <>
          <p className="mt-3 text-sm text-stone-700">{completed} / {total} adat rögzítve</p>
          {unknown ? <p className="mt-1 text-xs text-stone-500">Ebből {unknown} „Nem tudom” válasz.</p> : null}
          {onContinue ? <button type="button" onClick={onContinue} className="mt-4 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40">Folytatom</button> : null}
        </>
      ) : <p className="mt-3 text-sm text-stone-600">A vállalati profil még nem érhető el.</p>}
    </section>
  );
}

export function ClientSafeResultCard({
  topicLabel,
  stateLabel,
  explanation,
  nextAction,
  missingInformation,
}: {
  topicLabel: string;
  stateLabel: string;
  explanation: string;
  nextAction: string;
  missingInformation?: string | null;
}) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm" aria-labelledby="client-safe-result-heading">
      <p className="cp-kicker">Közzétett tájékoztató</p>
      <h2 id="client-safe-result-heading" className="cp-card-heading mt-1">{topicLabel}</h2>
      <p className="mt-3 text-sm font-semibold text-stone-950">{stateLabel}</p>
      <p className="mt-1 text-sm leading-6 text-stone-700">{explanation}</p>
      {missingInformation ? <p className="mt-2 text-xs text-stone-500">Hiányzó információ: {missingInformation}</p> : null}
      <p className="mt-3 text-sm text-stone-700"><span className="font-semibold">Következő lépés:</span> {nextAction}</p>
    </section>
  );
}

export function DemoContentBanner({ enabled, children = "A bemutatott jogi tartalom demonstrációs; a munkafolyamat maga valós." }: { enabled: boolean; children?: string }) {
  if (!enabled) return null;
  return <aside className="rounded-2xl border border-[#d8c99b] bg-[#fffaf0] px-4 py-3 text-sm text-stone-700" role="note">{children}</aside>;
}
