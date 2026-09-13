"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getPortalOrgGrow, type PortalOrgGrow } from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";

const card = "min-w-0 rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm";
const compactState = "min-w-0 rounded-2xl border border-stone-200 bg-white px-4 py-3";

function formatDate(value?: string | null) {
  if (!value) return "Nincs megadva";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function Section({
  kicker,
  title,
  children,
  empty,
  emptyText,
}: {
  kicker?: string;
  title: string;
  children?: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
}) {
  if (empty) {
    return (
      <section className={compactState}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-stone-800">{title}</p>
          <p className="text-sm text-stone-500">{emptyText || "Nincs megjeleníthető elem."}</p>
        </div>
      </section>
    );
  }
  return (
    <section className={card}>
      {kicker ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a5f18]">{kicker}</p> : null}
      <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-950">{title}</h2>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

export function OrgGrowView() {
  const [data, setData] = useState<PortalOrgGrow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPortalOrgGrow();
      setData(res);
    } catch (err) {
      setError(clientSafeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className={card}>
        <p className="text-stone-600">Fejlesztési adatok betöltése…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={card}>
        <p className="font-semibold text-stone-950">A fejlesztési adatok nem tölthetők be</p>
        <p className="mt-2 text-sm text-stone-600">{error}</p>
        <button
          onClick={() => void load()}
          className="mt-4 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
        >
          Újrapróbálás
        </button>
      </section>
    );
  }

  const processes = data?.processes || [];
  const initiatives = data?.initiatives || [];
  const measuredOutcomes = data?.outcomes.measured || [];
  const estimatedOutcomes = data?.outcomes.calculatedOrEstimated || [];

  return (
    <div className="space-y-6" data-testid="org-grow-view">
      {/* Header Banner */}
      <section className={`${card} bg-gradient-to-br from-white to-[#fcf9f2]`}>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#7a5f18]">
          Grow With Us · Vállalatfejlesztés
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950 sm:text-4xl">
          Fejlesztési Áttekintés
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-700">
          Az Adminiculum és vállalata közös fejlesztési programjai, feltérképezett üzleti folyamatai és
          mért eredményei.
        </p>
      </section>

      {/* Section 1: Hol érdemes javítani? (Truthful deferred state per Correction 2) */}
      <Section
        kicker="Feltárás"
        title="Hol érdemes javítani?"
        empty={true}
        emptyText="Jelenleg nincs ügyféloldalra jóváhagyott fejlesztési lehetőség közzétéve. Az iroda elemzései az aktív kezdeményezésekben jelennek meg."
      />

      {/* Section 2: Min dolgozunk? (Active Initiatives) */}
      <Section
        kicker="Kezdeményezések"
        title="Min dolgozunk jelenleg?"
        empty={!initiatives.length}
        emptyText="Jelenleg nincs aktív fejlesztési kezdeményezés rögzítve."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {initiatives.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs transition hover:border-[#b99b45]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="break-words font-semibold text-stone-950">{item.title}</h3>
                <span className="rounded-full bg-[#f3ead2] px-3 py-1 text-xs font-semibold text-[#6f5514]">
                  {item.statusLabel}
                </span>
              </div>

              {item.targetState ? (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Célállapot</p>
                  <p className="mt-0.5 text-sm text-stone-700">{item.targetState}</p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-500">
                {item.targetAt ? <span>Célhatáridő: {formatDate(item.targetAt)}</span> : <span />}
                {item.hasRelatedMatter ? (
                  <Link
                    href={`/portal/ugyek`}
                    className="font-medium text-[#7a5f18] hover:underline"
                  >
                    Kapcsolódó ügy →
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Section 3: Üzleti folyamatok és rendszerek (Process Visibility) */}
      <Section
        kicker="Folyamatok és Rendszerek"
        title="Feltérképezett üzleti folyamatok"
        empty={!processes.length}
        emptyText="Ehhez a szervezethez még nincsenek üzleti folyamatok rögzítve."
      >
        <div className="grid gap-5">
          {processes.map((proc) => (
            <div key={proc.id} className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    {proc.category} {proc.organizationGroupName ? `· ${proc.organizationGroupName}` : ''}
                  </span>
                  <h3 className="text-lg font-semibold text-stone-950">{proc.name}</h3>
                </div>
                <div className="flex gap-2">
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">
                    Gyakoriság: {proc.frequency}
                  </span>
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">
                    Kritikusság: {proc.criticality}
                  </span>
                </div>
              </div>

              {proc.steps.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Folyamat lépései
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {proc.steps.map((step) => (
                      <div
                        key={step.id}
                        className="flex flex-col justify-between rounded-xl border border-stone-100 bg-stone-50/70 p-3 text-sm"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-stone-500">
                            <span>{step.position}. lépés</span>
                            {step.isApproval ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                Jóváhagyás
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 font-medium text-stone-900">{step.name}</p>
                        </div>
                        {step.systemName ? (
                          <p className="mt-2 text-xs text-stone-600">
                            Rendszer: <span className="font-semibold">{step.systemName}</span>
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      {/* Section 4: Mit értünk el? (Outcomes) */}
      <Section
        kicker="Eredmények"
        title="Mit értünk el?"
        empty={!measuredOutcomes.length && !estimatedOutcomes.length}
        emptyText="Jelenleg nincs lezárt mérési eredmény rögzítve."
      >
        {measuredOutcomes.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              Mért eredmények
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {measuredOutcomes.map((item) => (
                <div key={item.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    {item.basisLabel}
                  </span>
                  {item.initiativeTitle ? (
                    <p className="mt-2 text-xs text-stone-500">Kezdeményezés: {item.initiativeTitle}</p>
                  ) : null}
                  {item.processName ? (
                    <p className="mt-1 text-xs text-stone-500">Érintett folyamat: {item.processName}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {estimatedOutcomes.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              Számított / becsült kapacitás és hatások
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {estimatedOutcomes.map((item) => (
                <div key={item.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-700">
                    {item.basisLabel}
                  </span>
                  {item.initiativeTitle ? (
                    <p className="mt-2 text-xs text-stone-500">Kezdeményezés: {item.initiativeTitle}</p>
                  ) : null}
                  {item.processName ? (
                    <p className="mt-1 text-xs text-stone-500">Érintett folyamat: {item.processName}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
