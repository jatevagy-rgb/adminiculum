"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clientOrganizationApi,
  personStatusLabel,
  responsibilityTypeLabel,
  contractOwnerStatusLabel,
  obligationOwnerStatusLabel,
  type OrgGroupDTO,
  type OrgPersonDTO,
  type ResponsibilityGaps,
} from "@/lib/clientOrganizationApi";

const emptyText = "Nincs megjeleníthető elem.";
const labelCls = "rounded bg-white border border-[var(--adm-border)] px-2 py-1 text-xs text-[var(--adm-text-muted)]";

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <section className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">{title}</h3>
      <div className="mt-3">{empty ? <p className="text-sm text-[var(--adm-text-muted)]">{emptyText}</p> : children}</div>
    </section>
  );
}

export function ClientOrganization({ clientId }: { clientId: string }) {
  const [groups, setGroups] = useState<OrgGroupDTO[]>([]);
  const [persons, setPersons] = useState<OrgPersonDTO[]>([]);
  const [gaps, setGaps] = useState<ResponsibilityGaps | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgPersonDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [groupsResult, personsResult, gapsResult] = await Promise.all([
        clientOrganizationApi.listGroups(clientId),
        clientOrganizationApi.listPersons(clientId),
        clientOrganizationApi.responsibilityGaps(clientId),
      ]);
      setGroups(groupsResult.items);
      setPersons(personsResult.items);
      setGaps(gapsResult);
    } catch {
      setError("A szervezeti adatok nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const groupName = (id: string | null): string => {
    if (!id) return "—";
    const group = groups.find((g) => g.id === id);
    return group ? group.name : "—";
  };

  const openPerson = async (personId: string) => {
    setSelectedId(personId);
    setDetail(null);
    try {
      setDetail(await clientOrganizationApi.getPerson(personId));
    } catch {
      setDetail(null);
      setError("A személy részletei nem tölthetők be.");
    }
  };

  const roots = groups.filter((g) => !g.parentGroupId);

  return (
    <div className="space-y-4" data-testid="client-organization">
      <div className="rounded border border-[#DCCCA6] bg-[var(--adm-sand-100)] p-3">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)] mb-1">Szervezet</h3>
        <p className="text-[10px] text-[var(--adm-text-muted)]">Szervezeti egységek, felelősök, vezetői kapcsolatok és felelősségi hiányosságok.</p>
      </div>
      {loading ? <p className="text-sm text-[var(--adm-text-muted)]">Betöltés…</p> : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {!loading && !error ? (
        <>
          <Section title="Szervezeti felépítés" empty={!groups.length}>
            <div className="grid gap-1">
              {roots.map((root) => {
                const children = groups.filter((g) => g.parentGroupId === root.id);
                return (
                  <div key={root.id} className="rounded bg-white border border-[var(--adm-border)] p-2 text-sm">
                    <b className="text-[var(--adm-text)]">{root.name}</b>
                    {children.length ? (
                      <div className="mt-1 grid gap-1 pl-3">
                        {children.map((child) => (
                          <p key={child.id} className="rounded bg-[var(--adm-ivory-100)] p-1.5 text-xs text-[var(--adm-text)]">{child.name}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Emberek" empty={!persons.length}>
            <div className="grid gap-2">
              {persons.map((person) => (
                <button key={person.id} className="rounded bg-white border border-[var(--adm-border)] p-2 text-left text-sm" onClick={() => void openPerson(person.id)} aria-expanded={selectedId === person.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <b className="text-[var(--adm-text)]">{person.name}</b>
                      {person.jobTitle ? <span className="ml-2 text-xs text-[var(--adm-text-muted)]">{person.jobTitle}</span> : null}
                    </div>
                    <span className={labelCls}>{personStatusLabel(person.employmentStatus)}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Egység: {groupName(person.organizationGroupId)}{person.managerName ? ` · Vezető: ${person.managerName}` : ""}{person.deputyName ? ` · Helyettes: ${person.deputyName}` : ""}</p>
                </button>
              ))}
            </div>
          </Section>

          {selectedId && detail ? (
            <Section title={`Személy: ${detail.name}`}>
              <div className="grid gap-2 text-xs text-[var(--adm-text-muted)] sm:grid-cols-2">
                <span>Munkakör: {detail.jobTitle || "—"}</span>
                <span>Egység: {groupName(detail.organizationGroupId)}</span>
                <span>Vezető: {detail.managerName || "—"}</span>
                <span>Helyettes: {detail.deputyName || "—"}</span>
                <span>Státusz: {personStatusLabel(detail.employmentStatus)}</span>
              </div>
              {detail.responsibilities?.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Felelősségek</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {detail.responsibilities.map((responsibility) => (
                      <span key={responsibility.id} className={labelCls}>{responsibilityTypeLabel(responsibility.type)} — {responsibility.label}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {detail.ownedContracts?.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Saját szerződések</p>
                  <div className="mt-1 grid gap-1">
                    {detail.ownedContracts.map((contract) => (
                      <p key={contract.id} className="rounded bg-[var(--adm-ivory-100)] p-2 text-xs">{contract.title} <span className={labelCls}>{contractOwnerStatusLabel(contract.status)}</span></p>
                    ))}
                  </div>
                </div>
              ) : null}
              {detail.ownedObligations?.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Saját kötelezettségek</p>
                  <div className="mt-1 grid gap-1">
                    {detail.ownedObligations.map((obligation) => (
                      <p key={obligation.id} className="rounded bg-[var(--adm-ivory-100)] p-2 text-xs">{obligation.title} <span className={labelCls}>{obligationOwnerStatusLabel(obligation.status)}</span></p>
                    ))}
                  </div>
                </div>
              ) : null}
              {detail.ownedInitiatives?.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Fejlesztési programok</p>
                  <div className="mt-1 grid gap-1">
                    {detail.ownedInitiatives.map((initiative) => (
                      <p key={initiative.id} className="rounded bg-[var(--adm-ivory-100)] p-2 text-xs">{initiative.title}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </Section>
          ) : null}

          {gaps && (gaps.contractsWithoutOwner.length || gaps.obligationsWithoutOwner.length || gaps.ownerPersonsInactive.length) ? (
            <Section title="Felelősségi hiányosságok">
              <div className="grid gap-2 text-xs text-[var(--adm-text-muted)]">
                {gaps.contractsWithoutOwner.map((contract) => <p key={contract.id}>· Szerződés üzleti felelős nélkül: {contract.title}</p>)}
                {gaps.obligationsWithoutOwner.map((obligation) => <p key={obligation.id}>· Kötelezettség felelős nélkül: {obligation.title}</p>)}
                {gaps.ownerPersonsInactive.map((person) => <p key={person.id}>· Inaktív/lejárt felelős személy: {person.name}</p>)}
              </div>
            </Section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
