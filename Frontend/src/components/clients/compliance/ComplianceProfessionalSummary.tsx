"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { QuietLink } from '@/components/ui/QuietLink';
import { ApiError } from '@/lib/api';
import { complianceWorkspaceApi, type ComplianceWorkspace } from '@/lib/complianceWorkspaceApi';
import { complianceWorkbenchApi, type Workbench } from '@/lib/complianceWorkbenchApi';
import { WORKBENCH_OUTCOME_LABELS, workbenchKindLabel, workbenchStatusLabel } from '@/lib/complianceWorkbenchPresentation';
import { attentionReason, filterRequirements, orderAttention, professionalAnswers, recordedDate, scopedWorkbench, UNKNOWN_VALUE, type ReadState } from '@/lib/complianceProfessionalTruth';

type View = 'requirements' | 'documents' | 'controls' | 'findings' | 'workbench';
type Snapshot = { clientId: string; workspace: ReadState<ComplianceWorkspace>; workbench: ReadState<Workbench> };
const inputClass = 'min-w-0 w-full rounded border border-stone-300 bg-white p-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--adm-brand-green)]';
const unknown: ReadState<never> = { status: 'UNKNOWN' };
const outcomeLabel = (outcome: string) => WORKBENCH_OUTCOME_LABELS[outcome] || 'Ismeretlen / nem rögzített állapot';
const failure = (reason: unknown): ReadState<never> => reason instanceof ApiError && [401, 403, 404].includes(reason.status) ? { status: 'ACCESS_LIMITED' } : unknown;

export function ComplianceProfessionalSummary({ clientId, clientName, onNavigate }: { clientId: string; clientName: string; onNavigate: (view: View, rowId?: string) => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [domain, setDomain] = useState('');
  const [outcome, setOutcome] = useState('');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    const run = ++generation.current;
    setSnapshot(null); setLoading(true); setDomain(''); setOutcome(''); setQuery(''); setOwner('');
    void Promise.allSettled([complianceWorkspaceApi.getWorkspace(clientId), complianceWorkbenchApi.get(clientId)]).then(([workspace, workbench]) => {
      if (run !== generation.current) return;
      setSnapshot({ clientId, workspace: workspace.status === 'fulfilled' ? { status: 'READY', data: workspace.value } : failure(workspace.reason), workbench: workbench.status === 'fulfilled' ? scopedWorkbench(clientId, { status: 'READY', data: workbench.value }) : failure(workbench.reason) });
      setLoading(false);
    });
    return () => { generation.current++; };
  }, [clientId, refresh]);
  const current = snapshot?.clientId === clientId ? snapshot : null;
  const workspace = current?.workspace ?? unknown;
  const workbench = current?.workbench ?? unknown;
  const areas = workspace.status === 'READY' ? workspace.data.areas : [];
  const rows = workbench.status === 'READY' ? workbench.data.rows.filter(row => row.clientId === clientId) : [];
  const answers = professionalAnswers(clientId, workspace, workbench);
  const now = useMemo(() => new Date(), [current]);
  const attention = orderAttention(rows, now).filter(row => !owner || (owner === '__unknown' ? !row.ownerId : row.ownerId === owner));
  const owners = [...new Map(rows.filter(row => row.ownerId).map(row => [row.ownerId!, row.ownerName || 'Rögzített felelős; név nem elérhető'])).entries()];
  const filtered = filterRequirements(areas, domain, outcome, query);
  return <section aria-label="Szakmai Compliance áttekintés" className="min-w-0 space-y-5 rounded-xl border border-stone-200 bg-white p-4 text-stone-800 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-medium text-[var(--adm-terracotta-700)]">Ügyfélhez kötött szakmai munkatér</p><h2 className="break-words text-xl font-semibold">{clientName}</h2><p className="mt-1 text-sm">Rögzített alkalmazhatóság, tisztázandó adatok és következő emberi lépések.</p></div>
      <QuietLink onClick={() => setRefresh(value => value + 1)} disabled={loading}>Áttekintés frissítése</QuietLink>
    </header>
    <p className="text-sm">A jogforrás változása vizsgálati jelzés. A szakmai jóváhagyás és az ügyfélközzététel külön döntés.</p>
    {loading ? <p role="status">Szakmai források betöltése…</p> : <>
      {(workspace.status !== 'READY' || workbench.status !== 'READY') && <p role="alert" className="rounded border border-stone-300 p-3">Az áttekintés részleges. {workspace.status === 'ACCESS_LIMITED' || workbench.status === 'ACCESS_LIMITED' ? 'Egyes források nem hozzáférhetők (ACCESS_LIMITED).' : 'Egyes források jelenleg nem tölthetők be (UNKNOWN).'} A hiányzó adat nem üres vagy teljesített állapot.</p>}
      {workbench.status === 'READY' && Object.values(workbench.data.truncated).some(Boolean) && <p role="status" className="text-sm">Részleges munkalista: forrásonként legfeljebb 50 tétel. A látható sorok nem teljes ügyfélállományt jelentenek.</p>}
      <section aria-label="Következő rögzített lépések" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Következő rögzített lépések</h3><QuietLink onClick={() => onNavigate('workbench')}>Döntési munkalista megnyitása</QuietLink></div>
        <label className="block max-w-sm text-sm">Rögzített felelős<select className={inputClass} value={owner} onChange={e => setOwner(e.target.value)}><option value="">Minden látható tétel</option><option value="__unknown">Nincs rögzített felelős</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <p className="text-xs">Rendezés: lejárt rögzített dátum, jogforrás-felülvizsgálat, hiányzó tény, következő dátum, forrásazonosító. A jelzés megnyitása nem hoz létre feladatot.</p>
        {workbench.status === 'READY' && !attention.length && <p>Nincs látható nyitott tétel a kiválasztott szűrőben. Ez nem megfelelőségi igazolás.</p>}
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{attention.map(row => <li key={row.id} className="min-w-0 space-y-2 rounded border border-stone-200 p-3">
          <h4 className="break-words font-medium">{row.title}</h4><p className="text-sm">{workbenchKindLabel(row.kind)} · {workbenchStatusLabel(row)}</p><p className="text-xs font-medium text-[var(--adm-terracotta-700)]">{attentionReason(row, now)}</p><p className="text-sm">Felelős: {row.ownerId ? row.ownerName || 'Név nem elérhető' : UNKNOWN_VALUE}<br />Dátum: {recordedDate(row.dueAt)}</p>
          <details><summary className="cursor-pointer text-xs focus-visible:outline-2">Forrás és előzmény</summary><p className="break-all text-xs">{row.kind}:{row.sourceId} · Rögzítve: {recordedDate(row.since)}</p></details>
          <QuietLink onClick={() => onNavigate('workbench', row.id)}>Pontos munkatétel megnyitása</QuietLink>
        </li>)}</ul>
      </section>
      <section aria-label="Alkalmazhatósági profil" className="space-y-3 border-t border-stone-200 pt-4">
        <h3 className="font-semibold">Alkalmazhatósági profil</h3>
        <div className="grid gap-3 md:grid-cols-3"><label className="text-sm">Rögzített témakör<select className={inputClass} value={domain} onChange={e => setDomain(e.target.value)}><option value="">Minden témakör</option>{[...new Set(areas.flatMap(a => a.domainLabel ? [a.domainLabel] : []))].sort().map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm">Rögzített állapot<select className={inputClass} value={outcome} onChange={e => setOutcome(e.target.value)}><option value="">Minden állapot</option>{[...new Set(areas.map(a => a.outcome))].map(value => <option key={value} value={value}>{outcomeLabel(value)}</option>)}</select></label><label className="text-sm">Keresés a látható címben<input className={inputClass} value={query} onChange={e => setQuery(e.target.value)} /></label></div>
        {workspace.status === 'READY' && <p className="text-xs">{filtered.length} látható követelmény a szűrőben. Ez nem megfelelőségi százalék.</p>}
        {workspace.status === 'READY' && !filtered.length && <p>Nincs látható értékelés a kiválasztott szűrőben.</p>}
        <ul className="space-y-2">{filtered.map(area => <li key={area.applicabilityId} className="rounded border border-stone-200 p-3"><details><summary className="cursor-pointer break-words font-medium focus-visible:outline-2">{area.title} · {outcomeLabel(area.outcome)}</summary><div className="mt-3 space-y-2 text-sm">
          <p>Értékelve: {recordedDate(area.evaluationAt)} · {area.evaluationFreshness === 'STALE' ? 'Az értékelés elavult' : area.evaluationFreshness === 'RECORDED' ? 'Rögzített értékelés' : 'Frissesség nem ismert'}</p><p>Miért: {area.normativeStatement || UNKNOWN_VALUE}</p><p>Követelményverzió: {area.requirementVersionKey || UNKNOWN_VALUE} · Szabályverzió: {area.ruleVersionKey || UNKNOWN_VALUE}</p>
          <h4 className="font-medium">Felhasznált tények</h4>{area.usedFacts.length ? <ul>{area.usedFacts.map((fact, index) => <li key={`${fact.factKey}:${index}`}>{fact.label || fact.factKey}: {fact.value ?? UNKNOWN_VALUE}</li>)}</ul> : <p>Nincs látható tényhivatkozás.</p>}
          <h4 className="font-medium">Tisztázandó</h4>{area.missingFacts.length ? <ul>{area.missingFacts.map((fact, index) => <li key={`${fact.factKey}:${index}`}>{fact.label || fact.factKey}</li>)}</ul> : <p>Nincs rögzített hiányzó tény; ez nem teljességi állítás.</p>}
          <h4 className="font-medium">Forrás és verzió</h4>{area.citations.length ? <ul>{area.citations.map((citation, index) => <li key={index}>{citation.sourceTitle || citation.canonicalCitation || UNKNOWN_VALUE} · {citation.versionLabel || 'Verzió nincs rögzítve'} · {citation.locator || citation.article || 'Hely nincs rögzítve'}</li>)}</ul> : <p>Nincs látható jogforráshivatkozás.</p>}
          <p className="break-all text-xs">RequirementApplicability:{area.applicabilityId} · RequirementVersion:{area.requirementVersionId}</p><p>Következő szereplő: nincs ezen a követelményen rögzítve. A kapcsolódó munkatétel felelőse külön adat.</p><QuietLink onClick={() => onNavigate('requirements')}>Követelmények és adatbekérés</QuietLink>
        </div></details></li>)}</ul>
      </section>
      <section aria-label="Tizennégy szakmai kérdés" className="space-y-3 border-t border-stone-200 pt-4"><h3 className="font-semibold">14 szakmai kérdés — forrás vagy ismert korlát</h3><p className="text-xs">Ügyfélszintű, engedélyezett források. Az UNKNOWN nem jelent nem alkalmazandó állapotot; az ACCESS_LIMITED nem bizonyít adathiányt.</p><div className="grid gap-2 md:grid-cols-2">{answers.map(answer => <details key={answer.key} className="min-w-0 rounded border border-stone-200 p-3"><summary className="cursor-pointer text-sm font-medium focus-visible:outline-2">{answer.question} · {answer.status === 'RECORDED' ? 'Rögzített forrás' : answer.status}</summary>{answer.limitation && <p className="mt-2 text-sm">{answer.limitation}</p>}{answer.entries.length ? <ul className="mt-2 space-y-2">{answer.entries.map((entry, index) => <li key={index} className="break-words text-sm">{entry.text}<span className="block break-all text-xs text-stone-600">Forrás: {entry.source}</span></li>)}</ul> : <p className="mt-2 text-sm">{answer.status === 'ACCESS_LIMITED' ? 'A forrás nem hozzáférhető.' : 'Nincs elegendő rögzített adat ebben a vetületben.'}</p>}</details>)}</div></section>
      <nav aria-label="Kapcsolódó szakmai források" className="flex flex-wrap gap-4 border-t border-stone-200 pt-4"><QuietLink onClick={() => onNavigate('documents')}>Dokumentumok és verziók</QuietLink><QuietLink onClick={() => onNavigate('controls')}>Kontrollok és látható bizonyítékok</QuietLink><QuietLink href="/compliance">Irodai portfólió és jogforrásfigyelés</QuietLink></nav>
    </>}
  </section>;
}
