"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  clientOrganizationApi,
  personStatusLabel,
  responsibilityTypeLabel,
  type OrgGroupDTO,
  type OrgPersonDTO,
  type ResponsibilityGaps,
} from "@/lib/clientOrganizationApi";

const pill = "rounded-full border border-[var(--adm-border)] bg-white px-2.5 py-1 text-xs text-[var(--adm-text-muted)]";

function Section({ title, children, empty }: { title: string; children: ReactNode; empty?: boolean }) {
  return (
    <section className="adm-board-panel p-5">
      <h2 className="text-sm font-semibold text-[var(--adm-text)]">{title}</h2>
      {empty ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs rögzített adat.</p> : <div className="mt-4">{children}</div>}
    </section>
  );
}

function portalRoleLabel(role: string | null | undefined): string {
  const labels: Record<string, string> = { MEMBER: "Tag", REPRESENTATIVE: "Képviselő", APPROVER: "Jóváhagyó" };
  return role ? labels[role] || "Portálfelhasználó" : "Van aktív portálkapcsolat";
}

function groupPath(groups: OrgGroupDTO[], groupId: string | null): string {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const names: string[] = [];
  let current = groupId ? byId.get(groupId) : undefined;
  while (current) {
    names.unshift(current.name);
    current = current.parentGroupId ? byId.get(current.parentGroupId) : undefined;
  }
  return names.join(" / ");
}

export function ClientOrganization({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const [groups, setGroups] = useState<OrgGroupDTO[]>([]);
  const [persons, setPersons] = useState<OrgPersonDTO[]>([]);
  const [gaps, setGaps] = useState<ResponsibilityGaps | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgPersonDTO | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState("");

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

  const filteredPersons = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("hu-HU");
    if (!needle) return persons;
    return persons.filter((person) => [
      person.name,
      person.jobTitle || "",
      person.organizationGroupName || "",
      ...(person.responsibilities || []).map((item) => item.label),
    ].join(" ").toLocaleLowerCase("hu-HU").includes(needle));
  }, [persons, query]);

  const personsByGroup = useMemo(() => {
    const result = new Map<string | null, OrgPersonDTO[]>();
    filteredPersons.forEach((person) => {
      const current = result.get(person.organizationGroupId) || [];
      current.push(person);
      result.set(person.organizationGroupId, current);
    });
    return result;
  }, [filteredPersons]);

  const openPerson = async (personId: string) => {
    setSelectedId(personId);
    setDetailLoading(true);
    setError(null);
    try {
      const person = await clientOrganizationApi.getPerson(personId);
      setDetail(person);
      setEditTitle(person.jobTitle || "");
    } catch {
      setError("A személy részletei nem tölthetők be.");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveTitle = async () => {
    if (!detail || saving) return;
    setSaving(true);
    try {
      const updated = await clientOrganizationApi.updatePerson(detail.id, { jobTitle: editTitle.trim() || null });
      setDetail(updated);
      setPersons((current) => current.map((person) => person.id === updated.id ? { ...person, jobTitle: updated.jobTitle } : person));
    } catch {
      setError("A pozíció mentése nem sikerült.");
    } finally {
      setSaving(false);
    }
  };

  const roots = groups.filter((group) => !group.parentGroupId);
  const renderGroup = (group: OrgGroupDTO, depth = 0): ReactNode => {
    const children = groups.filter((candidate) => candidate.parentGroupId === group.id);
    const members = personsByGroup.get(group.id) || [];
    return (
      <div key={group.id} className={depth ? "mt-3 border-l border-[var(--adm-border)] pl-4" : ""}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-serif text-lg text-[var(--adm-text)]">{group.name}</h3>
            {group.descriptionSafe ? <p className="text-xs text-[var(--adm-text-muted)]">{group.descriptionSafe}</p> : null}
          </div>
          <span className={pill}>{members.length} személy</span>
        </div>
        {members.length ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {members.map((person) => (
              <button key={person.id} type="button" onClick={() => void openPerson(person.id)} aria-expanded={selectedId === person.id} className="rounded-xl border border-[var(--adm-border)] bg-white p-3 text-left transition hover:border-[var(--adm-green-500)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-green-700)]">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-[var(--adm-text)]">{person.name}</span>
                  <span className={pill}>{personStatusLabel(person.employmentStatus)}</span>
                </div>
                <p className="mt-1 text-sm text-[var(--adm-text-muted)]">{person.jobTitle || "Pozíció nincs megadva"}</p>
                <p className="mt-2 text-xs text-[var(--adm-text-muted)]">{person.managerName ? `Vezető: ${person.managerName}` : "Nincs vezető megadva"}{person.deputyName ? ` · Helyettes: ${person.deputyName}` : ""}</p>
              </button>
            ))}
          </div>
        ) : null}
        {children.map((child) => renderGroup(child, depth + 1))}
      </div>
    );
  };

  const ungrouped = personsByGroup.get(null) || [];
  const activePortalPeople = persons.filter((person) => Boolean(person.portalMembershipId));
  const responsibilityPeople = persons.filter((person) => Boolean(person.responsibilities?.length));
  const hasGaps = Boolean(gaps && (gaps.contractsWithoutOwner.length || gaps.obligationsWithoutOwner.length || gaps.ownerPersonsInactive.length));

  return (
    <div className="space-y-5" data-testid="client-organization">
      <section className="adm-board-hero p-5 lg:p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Szervezet</p>
        <h1 className="mt-1 font-serif text-3xl text-[var(--adm-text)]">{clientName ? `${clientName} — szervezet` : "Személyek és szervezeti felépítés"}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--adm-text-muted)]">A pozíció, a felelősség és a portál-hozzáférés külön kezelt szervezeti információk.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[["Személy", persons.length], ["Szervezeti egység", groups.length], ["Felelősséggel rendelkező", responsibilityPeople.length], ["Portál-hozzáférés", activePortalPeople.length]].map(([label, value]) => <div key={String(label)} className="adm-board-strip p-3"><p className="font-serif text-2xl text-[var(--adm-text)]">{value}</p><p className="text-[10px] uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">{label}</p></div>)}
        </div>
      </section>

      {loading ? <div className="adm-board-panel p-5 text-sm text-[var(--adm-text-muted)]">Szervezeti adatok betöltése…</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><div className="flex flex-wrap items-center justify-between gap-3"><span>{error}</span><button type="button" onClick={() => void load()} className="font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Újrapróbálom</button></div></div> : null}

      {!loading && !error ? (
        <>
          <Section title="Szervezeti hierarchia" empty={!groups.length && !ungrouped.length}>
            <div className="space-y-5">
              {roots.map((root) => renderGroup(root))}
              {ungrouped.length ? <div className="border-t border-[var(--adm-border)] pt-4"><h3 className="font-serif text-lg text-[var(--adm-text)]">Nincs szervezeti egységhez rendelve</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{ungrouped.map((person) => <button key={person.id} type="button" onClick={() => void openPerson(person.id)} className="rounded-xl border border-dashed border-[var(--adm-border)] bg-white p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--adm-green-700)]"><b>{person.name}</b><span className="mt-1 block text-sm text-[var(--adm-text-muted)]">{person.jobTitle || "Pozíció nincs megadva"}</span></button>)}</div></div> : null}
            </div>
          </Section>

          <Section title="Személyek keresése" empty={!persons.length}>
            <label className="block max-w-xl text-sm font-semibold text-[var(--adm-text)]"><span className="sr-only">Keresés név, egység, pozíció vagy felelősség szerint</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Név, szervezeti egység, pozíció vagy felelősség" className="w-full rounded-xl border border-[var(--adm-border)] bg-white px-3 py-2 font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-green-700)]" /></label>
            {query && !filteredPersons.length ? <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs a keresésnek megfelelő személy.</p> : null}
          </Section>

          {detailLoading ? <Section title="Személy részletei"><p className="text-sm text-[var(--adm-text-muted)]">Részletek betöltése…</p></Section> : null}
          {detail ? <Section title={`Személy: ${detail.name}`}>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><p className="text-xs uppercase tracking-wide text-[var(--adm-text-muted)]">Pozíció</p><div className="mt-1 flex gap-2"><input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[var(--adm-border)] px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--adm-green-700)]" /><button type="button" onClick={() => void saveTitle()} disabled={saving} className="rounded-lg bg-[var(--adm-green-800)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{saving ? "Mentés…" : "Mentés"}</button></div></div>
              <div><p className="text-xs uppercase tracking-wide text-[var(--adm-text-muted)]">Szervezeti egység</p><p className="mt-1 text-[var(--adm-text)]">{groupPath(groups, detail.organizationGroupId) || "Nincs megadva"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-[var(--adm-text-muted)]">Vezető</p><p className="mt-1 text-[var(--adm-text)]">{detail.managerName || "Nincs megadva"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-[var(--adm-text-muted)]">Helyettes</p><p className="mt-1 text-[var(--adm-text)]">{detail.deputyName || "Nincs megadva"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-[var(--adm-text-muted)]">Foglalkoztatási státusz</p><p className="mt-1 text-[var(--adm-text)]">{personStatusLabel(detail.employmentStatus)}</p></div>
            </div>
            <div className="mt-5 grid gap-4 border-t border-[var(--adm-border)] pt-4 md:grid-cols-2">
              <div><h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--adm-text-muted)]">Felelősségek</h3>{detail.responsibilities?.length ? <ul className="mt-2 space-y-2">{detail.responsibilities.map((item) => <li key={item.id} className="rounded-lg bg-[var(--adm-ivory-100)] p-2 text-sm"><b>{item.label}</b><span className="ml-2 text-xs text-[var(--adm-text-muted)]">{responsibilityTypeLabel(item.type)}</span></li>)}</ul> : <p className="mt-2 text-sm text-[var(--adm-text-muted)]">Nincs külön rögzített felelősség.</p>}</div>
              <div><h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--adm-text-muted)]">Portál-hozzáférés</h3>{detail.portalMembershipId ? <p className="mt-2 rounded-lg bg-[var(--adm-ivory-100)] p-2 text-sm text-[var(--adm-text)]">{portalRoleLabel(detail.portalMembershipRole)}</p> : <p className="mt-2 text-sm text-[var(--adm-text-muted)]">Nincs portál-hozzáférés</p>}</div>
            </div>
          </Section> : null}

          {hasGaps ? <Section title="Felelősségi hiányosságok"><div className="space-y-1 text-sm text-[var(--adm-text-muted)]">{gaps?.contractsWithoutOwner.map((item) => <p key={item.id}>Szerződés felelős nélkül: {item.title}</p>)}{gaps?.obligationsWithoutOwner.map((item) => <p key={item.id}>Kötelezettség felelős nélkül: {item.title}</p>)}{gaps?.ownerPersonsInactive.map((item) => <p key={item.id}>Inaktív felelős: {item.name}</p>)}</div></Section> : null}
        </>
      ) : null}
    </div>
  );
}
