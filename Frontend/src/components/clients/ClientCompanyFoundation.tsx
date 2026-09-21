"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  clientCompanyApi,
  companyFactLabel,
  factSourceKindLabel,
  factVerificationLabel,
  assessmentTypeLabel,
  initiativeStatusLabel,
  assessmentStatusLabel,
  companyMilestoneStatusLabel,
  type CompanyAssessment,
  type CompanyFact,
  type CompanyMilestone,
  type DevelopmentInitiative,
} from "@/lib/clientCompanyApi";

const emptyText = "Nincs megjeleníthető elem.";

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <section className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">{title}</h3>
      <div className="mt-3">{empty ? <p className="text-sm text-[var(--adm-text-muted)]">{emptyText}</p> : children}</div>
    </section>
  );
}

const labelCls = "rounded bg-white border border-[var(--adm-border)] px-2 py-1 text-xs text-[var(--adm-text-muted)]";

/**
 * A ClientFact is current only when it is explicitly NOT superseded. Array order
 * and validFrom are never used to infer current state, and two current facts of
 * the same concept are never silently collapsed.
 */
function isSupersededFact(fact: CompanyFact): boolean {
  return Boolean(fact.supersededAt);
}

function factIdentity(fact: CompanyFact): string {
  return fact.factDefinition?.key || fact.type;
}

function FactCard({ fact, historical, reviewRequired }: { fact: CompanyFact; historical?: boolean; reviewRequired?: boolean }) {
  return (
    <div className="rounded bg-white border border-[var(--adm-border)] p-2 text-sm" data-testid={historical ? "fact-history-entry" : "fact-current-entry"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-[var(--adm-text)]">{companyFactLabel(fact)}</b>
        <span className={labelCls}>{factVerificationLabel(fact.verificationStatus)}</span>
      </div>
      <p className="mt-1 break-words text-[var(--adm-text)]">{fact.value}</p>
      <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
        Érvényesség: {new Date(fact.validFrom).toLocaleDateString("hu-HU")}
        {fact.validTo ? ` – ${new Date(fact.validTo).toLocaleDateString("hu-HU")}` : ""}
        {historical ? " · Korábbi rögzített érték" : ""}
      </p>
      <p className="mt-0.5 text-xs text-[var(--adm-text-muted)]">Forrás: {factSourceKindLabel(fact.sourceKind)}</p>
      {reviewRequired ? (
        <p className="mt-1 text-xs font-semibold text-[var(--adm-amber-950)]" data-testid="fact-review-required">
          Ugyanahhoz a fogalomhoz több érvényes érték tartozik — felülvizsgálat szükséges. A rendszer nem jelöl ki automatikus elsőbbséget.
        </p>
      ) : null}
    </div>
  );
}

export function ClientCompanyFoundation({ clientId }: { clientId: string }) {
  const [profile, setProfile] = useState<{ summary: string | null; status: string | null } | null>(null);
  const [facts, setFacts] = useState<CompanyFact[]>([]);
  const [milestones, setMilestones] = useState<CompanyMilestone[]>([]);
  const [assessments, setAssessments] = useState<CompanyAssessment[]>([]);
  const [initiatives, setInitiatives] = useState<DevelopmentInitiative[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileResult, factsResult, milestonesResult, assessmentsResult, initiativesResult] = await Promise.all([
        clientCompanyApi.getProfile(clientId),
        clientCompanyApi.listFacts(clientId),
        clientCompanyApi.listMilestones(clientId),
        clientCompanyApi.listAssessments(clientId),
        clientCompanyApi.listInitiatives(clientId),
      ]);
      setProfile(profileResult);
      setFacts(factsResult.items);
      setMilestones(milestonesResult.items);
      setAssessments(assessmentsResult.items);
      setInitiatives(initiativesResult.items);
    } catch {
      setError("A vállalati működés adatai nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  // History is preserved, never deleted; only its presentation is separated.
  const currentFacts = facts.filter((fact) => !isSupersededFact(fact));
  const historicalFacts = facts.filter(isSupersededFact);
  const currentIdentityCounts = new Map<string, number>();
  for (const fact of currentFacts) {
    const identity = factIdentity(fact);
    currentIdentityCounts.set(identity, (currentIdentityCounts.get(identity) ?? 0) + 1);
  }

  return (
    <div className="space-y-4" data-testid="client-company-foundation">
      <div className="rounded border border-[#DCCCA6] bg-[var(--adm-sand-100)] p-3">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)] mb-1">Vállalati működés</h3>
        <p className="text-[10px] text-[var(--adm-text-muted)]">
          Cégprofil, ügyfél-tények, felmérések és a fejlődési terv.
        </p>
      </div>
      {loading ? <p className="text-sm text-[var(--adm-text-muted)]">Betöltés…</p> : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {!loading && !error ? (
        <>
          <Section title="Profil" empty={!profile && !facts.length}>
            {profile?.summary ? <p className="text-sm text-[var(--adm-text)]">{profile.summary}</p> : profile ? null : null}
            {currentFacts.length ? (
              <div className="mt-3 grid gap-2" data-testid="company-fact-current">
                {currentFacts.map((fact) => (
                  <FactCard key={fact.id} fact={fact} reviewRequired={(currentIdentityCounts.get(factIdentity(fact)) ?? 0) > 1} />
                ))}
              </div>
            ) : null}
            {historicalFacts.length ? (
              <details className="mt-3" data-testid="company-fact-history">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
                  Korábbi tények ({historicalFacts.length})
                </summary>
                <p className="mt-2 text-xs text-[var(--adm-text-muted)]">
                  Korábban rögzített értékek. Nem aktuális, versengő tények, és nem jelölnek ki automatikus elsőbbséget.
                </p>
                <div className="mt-2 grid gap-2">
                  {historicalFacts.map((fact) => (
                    <FactCard key={fact.id} fact={fact} historical />
                  ))}
                </div>
              </details>
            ) : null}
          </Section>

          <Section title="Felmérések" empty={!assessments.length}>
            <p className="mb-2 text-xs text-[var(--adm-text-muted)]">
              Belső értékelési megállapítások; nem igazolt jogi kötelezettségek.
            </p>
            <div className="grid gap-2">
              {assessments.map((assessment) => {
                return (
                  <div key={assessment.id} className="rounded bg-white border border-[var(--adm-border)] p-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <b className="text-[var(--adm-text)]">{assessment.title}</b>
                        <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{assessmentTypeLabel(assessment.type)}</span>
                      </div>
                      <span className={labelCls}>{assessmentStatusLabel(assessment.status)}</span>
                    </div>
                    {assessment.itemCount != null ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Tételek: {assessment.itemCount}</p> : null}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Compliance áttekintés">
            <p className="text-sm text-[var(--adm-text-muted)]">A teljes belső compliance áttekintés a vállalati működés munkaterületén érhető el.</p>
            <Link href={`/clients/${clientId}/vallalati-mukodes`} className="mt-2 inline-block text-xs text-[var(--adm-ochre-500)] hover:underline">Compliance áttekintés megnyitása →</Link>
          </Section>

          <Section title="Fejlődési terv" empty={!initiatives.length && !milestones.length}>
            {initiatives.length ? (
              <div className="grid gap-2">
                {initiatives.map((initiative) => (
                  <div key={initiative.id} className="rounded bg-white border border-[var(--adm-border)] p-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="text-[var(--adm-text)]">{initiative.title}</b>
                      <span className={labelCls}>{initiativeStatusLabel(initiative.status)}</span>
                    </div>
                    {initiative.targetState ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Célállapot: {initiative.targetState}</p> : null}
                    {initiative.caseId ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Kapcsolt ügy</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {milestones.length ? (
              <div className="mt-3 grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Vállalati mérföldkövek</p>
                {milestones.map((milestone) => (
                  <div key={milestone.id} className="rounded bg-white border border-[var(--adm-border)] p-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="text-[var(--adm-text)]">{milestone.title}</b>
                      <span className={labelCls}>{companyMilestoneStatusLabel(milestone.status)}</span>
                    </div>
                    {milestone.targetDate ? <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Cél: {new Date(milestone.targetDate).toLocaleDateString("hu-HU")}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </Section>
        </>
      ) : null}
    </div>
  );
}
