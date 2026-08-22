"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getOrganizationMap, isOrganizationClient, type OrgMapDTO } from "@/lib/orgMapApi";
import type { OrgMapPersonDTO } from "@/lib/orgMapApi";
import type { OrgFilter } from "@/lib/orgMapGraph";
import { responsibilityTypeLabel } from "@/lib/clientOrganizationApi";
import { OrgTreeCanvas } from "@/components/org-workspace/OrgTreeCanvas";
import { OrgPersonDrawer } from "@/components/org-workspace/OrgPersonDrawer";

function EmptyState({ clientName }: { clientName: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded border border-dashed border-[var(--adm-border)] bg-[var(--adm-surface)] px-6 py-16 text-center">
      <p className="text-sm font-semibold text-[var(--adm-text)]">Nincs rögzített szervezeti adat</p>
      <p className="mt-2 max-w-md text-xs text-[var(--adm-text-muted)]">
        Ehhez az ügyfélhez még nincs szervezeti egység vagy személy rögzítve a szervezeti térképen.
      </p>
    </div>
  );
}

export function SzervezetPageContent({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [map, setMap] = useState<OrgMapDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);

  // filters
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [portalStatus, setPortalStatus] = useState<OrgFilter["portalStatus"]>(null);
  const [responsibilityType, setResponsibilityType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setMap(await getOrganizationMap(clientId));
    } catch {
      setMap(null);
      setLoadError("A szervezeti adatok nem tölthetők be.");
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => map?.groups ?? [], [map]);
  const persons = useMemo(() => map?.persons ?? [], [map]);

  const responsibilityTypes = useMemo(() => {
    const set = new Set<string>();
    for (const p of persons) for (const r of p.responsibilities) set.add(r.type);
    return [...set].sort();
  }, [persons]);

  const directReportsByPerson = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const person of persons) {
      if (person.managerPersonId) {
        const list = m.get(person.managerPersonId) ?? [];
        list.push(person.name);
        m.set(person.managerPersonId, list);
      }
    }
    return m;
  }, [persons]);

  const selectedPerson: OrgMapPersonDTO | null = useMemo(
    () => (selectedId ? persons.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, persons],
  );

  const filter: OrgFilter = useMemo(
    () => ({ query, groupId, portalStatus, responsibilityType }),
    [query, groupId, portalStatus, responsibilityType],
  );

  const resetFilters = useCallback(() => {
    setQuery("");
    setGroupId(null);
    setPortalStatus(null);
    setResponsibilityType(null);
  }, []);

  if (loadError) {
    return (
      <div className="p-6">
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{loadError}</p>
      </div>
    );
  }

  if (!map) {
    return <div className="p-6 text-sm text-[var(--adm-text-muted)]">Betöltés…</div>;
  }

  // INDIVIDUAL client guard: use actual workspace mode, not CSS hiding.
  if (!isOrganizationClient(map)) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-6 py-16 text-center">
          <p className="text-sm font-semibold text-[var(--adm-text)]">A szervezeti térkép nem érhető el</p>
          <p className="mt-2 max-w-md text-xs text-[var(--adm-text-muted)]">
            Ez az ügyfél nem szervezeti (INDIVIDUAL) módban van, ezért nem jelenítjük meg a szervezeti felépítést.
          </p>
        </div>
      </div>
    );
  }

  if (persons.length === 0) {
    return <EmptyState clientName={clientName} />;
  }

  const inputCls = "rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-1.5 text-xs text-[var(--adm-text)]";
  const selectCls = "rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-1.5 text-xs text-[var(--adm-text)]";

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* TOP BAR */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--adm-border)] bg-[var(--adm-surface)] px-4 py-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Személy keresése…"
          aria-label="Személy keresése"
          className={`${inputCls} w-64`}
        />
        <select value={groupId ?? ""} onChange={(e) => setGroupId(e.target.value || null)} aria-label="Szervezeti egység szűrő" className={selectCls}>
          <option value="">Minden egység</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select value={portalStatus ?? ""} onChange={(e) => setPortalStatus((e.target.value || null) as OrgFilter["portalStatus"])} aria-label="Portál-hozzáférés szűrő" className={selectCls}>
          <option value="">Minden portál-státusz</option>
          <option value="ACTIVE">Portál: aktív</option>
          <option value="SUSPENDED">Portál: felfüggesztve</option>
          <option value="NONE">Nincs portál</option>
        </select>
        <select value={responsibilityType ?? ""} onChange={(e) => setResponsibilityType(e.target.value || null)} aria-label="Felelősség szűrő" className={selectCls}>
          <option value="">Minden felelősség</option>
          {responsibilityTypes.map((t) => (
            <option key={t} value={t}>
              {responsibilityTypeLabel(t)}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-[var(--adm-text-muted)]">
          {visibleCount} / {persons.length} személy
        </span>
      </div>

      {/* MAIN CANVAS + RIGHT DRAWER */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <OrgTreeCanvas
            map={map}
            filter={filter}
            selectedId={selectedId}
            onSelectPerson={(id) => setSelectedId(id)}
            onNodeCount={setVisibleCount}
          />
        </div>
        {selectedPerson ? (
          <OrgPersonDrawer person={selectedPerson} directReportNames={directReportsByPerson.get(selectedPerson.id) ?? []} onClose={() => setSelectedId(null)} />
        ) : null}
      </div>
    </div>
  );
}