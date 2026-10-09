import type { ComplianceWorkspace, ComplianceWorkspaceArea } from './complianceWorkspaceApi';
import type { Workbench, WorkbenchRow } from './complianceWorkbenchApi';
import { WORKBENCH_OUTCOME_LABELS, workbenchStatusLabel } from './complianceWorkbenchPresentation';

export type ReadState<T> = { status: 'READY'; data: T } | { status: 'UNKNOWN' | 'ACCESS_LIMITED' };
export type TruthEntry = { text: string; source: string };
export type TruthAnswer = { key: string; question: string; status: 'RECORDED' | 'UNKNOWN' | 'ACCESS_LIMITED'; entries: TruthEntry[]; limitation?: string };
export const UNKNOWN_VALUE = 'Nincs rögzítve';

export function recordedDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return UNKNOWN_VALUE;
  return new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

export function scopedWorkbench(clientId: string, state: ReadState<Workbench>): ReadState<Workbench> {
  return state.status === 'READY' && state.data.clientId !== clientId ? { status: 'ACCESS_LIMITED' } : state;
}

export function isOpenAttention(row: WorkbenchRow): boolean {
  return !row.status.startsWith('DECIDED:') && !row.status.split(':').some(s => ['COMPLETED', 'DONE', 'CANCELLED', 'REJECTED', 'SUPERSEDED', 'NO_IMPACT'].includes(s));
}

export function attentionReason(row: WorkbenchRow, now: Date): string {
  if (row.dueAt && Number.isFinite(Date.parse(row.dueAt)) && Date.parse(row.dueAt) < now.getTime()) return 'Lejárt rögzített határidő / érvényesség';
  if (row.kind === 'SOURCE_IMPACT') return 'Emberi jogforrás-felülvizsgálat';
  if (row.kind === 'MISSING_FACT') return 'Hiányzó adat';
  return row.dueAt && Number.isFinite(Date.parse(row.dueAt)) ? 'Rögzített következő dátum' : 'Nincs rögzített határidő';
}

export function orderAttention(rows: WorkbenchRow[], now: Date): WorkbenchRow[] {
  const rank = (r: WorkbenchRow) => {
    if (r.dueAt && Number.isFinite(Date.parse(r.dueAt)) && Date.parse(r.dueAt) < now.getTime()) return 0;
    if (r.kind === 'SOURCE_IMPACT') return 1;
    if (r.kind === 'MISSING_FACT') return 2;
    return 3;
  };
  const date = (r: WorkbenchRow) => r.dueAt && Number.isFinite(Date.parse(r.dueAt)) ? Date.parse(r.dueAt) : Infinity;
  return rows.filter(isOpenAttention).slice().sort((a, b) => rank(a) - rank(b) || (date(a) - date(b) || 0) || a.id.localeCompare(b.id));
}

export function filterRequirements(areas: ComplianceWorkspaceArea[], domain: string, outcome: string, query: string) {
  const q = query.trim().toLocaleLowerCase('hu-HU');
  return areas.filter(a => (!domain || a.domainLabel === domain) && (!outcome || a.outcome === outcome) && (!q || [a.title, a.requirementKey, a.subjectLabel].some(v => v?.toLocaleLowerCase('hu-HU').includes(q))));
}

/** Client-scoped presentation only: never title-join evidence, infer owners, or compute applicability. */
export function professionalAnswers(clientId: string, workspace: ReadState<ComplianceWorkspace>, input: ReadState<Workbench>): TruthAnswer[] {
  const workbench = scopedWorkbench(clientId, input);
  const areas = workspace.status === 'READY' ? workspace.data.areas : [];
  const rows = workbench.status === 'READY' ? workbench.data.rows.filter(r => r.clientId === clientId) : [];
  const src = (a: ComplianceWorkspaceArea) => `RequirementApplicability:${a.applicabilityId} · RequirementVersion:${a.requirementVersionId}`;
  const rowSrc = (r: WorkbenchRow) => `${r.kind}:${r.sourceId}`;
  const entry = (text: string, source: string): TruthEntry => ({ text, source });
  const answer = (key: string, question: string, state: ReadState<unknown>, entries: TruthEntry[], limitation?: string): TruthAnswer => ({ key, question, status: state.status === 'ACCESS_LIMITED' ? 'ACCESS_LIMITED' : entries.length ? 'RECORDED' : 'UNKNOWN', entries, limitation });
  const sourceRows = rows.filter(r => r.source);
  const openRows = rows.filter(isOpenAttention);
  return [
    answer('applies', 'Mi alkalmazandó?', workspace, areas.map(a => entry(`${a.title}: ${WORKBENCH_OUTCOME_LABELS[a.outcome] || 'Ismeretlen állapot'}`, src(a)))),
    answer('why', 'Miért?', workspace, areas.map(a => entry(`${a.title} · Követelmény: ${a.normativeStatement || UNKNOWN_VALUE} · Szabályverzió: ${a.ruleVersionKey || UNKNOWN_VALUE} · Forrástámogatás: ${a.sourceSupportState || UNKNOWN_VALUE}`, src(a))), 'A rögzített értékelés bemutatása; nincs új jogi következtetés.'),
    answer('facts', 'Mely tények alapján?', workspace, areas.flatMap(a => a.usedFacts.map(f => entry(`${a.title} · ${f.label || f.factKey}: ${f.value ?? UNKNOWN_VALUE}`, `${src(a)} · FactKey:${f.factKey}`)))),
    answer('unknowns', 'Mi ismeretlen?', workspace, areas.flatMap(a => a.missingFacts.map(f => entry(`${a.title} · ${f.label || f.factKey}`, `${src(a)} · FactKey:${f.factKey}`))), 'Az üres látható lista nem bizonyítja az adatok teljességét.'),
    answer('evidence', 'Milyen bizonyíték látható?', workbench, rows.filter(r => r.kind === 'STALE_EVIDENCE').map(r => entry(`${r.title} · ${workbenchStatusLabel(r)}`, rowSrc(r))), 'Csak a munkalistában látható, felülvizsgálandó bizonyítékok. Nem a teljes bizonyítéktár; az érvényesség nem jogi megfelelőség.'),
    answer('version', 'Melyik pontos dokumentumverzió?', { status: 'UNKNOWN' }, [], 'Ez az összesítés nem tartalmaz dokumentum–verzió azonosítópárt. A dokumentumtárban ellenőrizendő; nincs legfrissebb verzióra helyettesítés.'),
    answer('missing', 'Mi hiányzik?', workspace, areas.flatMap(a => a.missingFacts.map(f => entry(`${a.title}: ${f.label || f.factKey}`, src(a)))), 'A bizonyítékhiány és a követelmény–kontroll lefedettség ebből a vetületből nem állapítható meg.'),
    answer('stale', 'Mi elavult?', workbench, rows.filter(r => r.status.startsWith('STALE:')).map(r => entry(`${r.title} · Érvényesség: ${recordedDate(r.dueAt)}`, rowSrc(r))), 'A bizonyíték érvényességi jelzése különbözik a jogi alkalmasságtól. Az értékelési frissesség a követelménykártyákon látható.'),
    answer('review', 'Mi igényel emberi felülvizsgálatot?', workbench, openRows.filter(r => r.kind !== 'MISSING_FACT').map(r => entry(`${r.title} · ${workbenchStatusLabel(r)}`, rowSrc(r))), 'A kontrollok felülvizsgálati dátumai a kontrollnyilvántartásban ellenőrizendők.'),
    answer('change', 'Mely jogforrás változását rögzítették?', workbench, sourceRows.map(r => entry(`${r.source!.sourceKey} · ${r.source!.event} · ${r.source!.versionKey}`, `LegalSourceObservation:${r.source!.observationId} · LegalSourceVersion:${r.source!.legalSourceVersionId}`)), 'A monitorozás eredményessége itt nem ismert. A lista hiánya nem jelent változatlan jogforrást.'),
    answer('clients', 'Mely ügyfeleket érintheti?', workbench, sourceRows.map(r => entry(`Az aktuális ügyfél (${clientId}) jelöltként kapcsolódik: ${r.source!.sourceKey}`, `LegalSourceObservation:${r.source!.observationId} · Client:${clientId}`)), 'Csak az aktuális ügyfélhez engedélyezett kapcsolat. A jelöltség nem jóváhagyott alkalmazhatóság; más ügyfelek köre itt nem ismert.'),
    answer('owner', 'Kié a következő lépés?', workbench, openRows.map(r => entry(`${r.title}: ${r.ownerId ? r.ownerName || 'Rögzített felelős; név nem elérhető' : UNKNOWN_VALUE}`, rowSrc(r))), 'Tételenként rögzített felelős; nincs általános ügyfélfelelősre helyettesítés.'),
    answer('due', 'Mikor esedékes a következő lépés?', workbench, openRows.map(r => entry(`${r.title}: ${recordedDate(r.dueAt)}`, rowSrc(r))), 'A határidő és a bizonyíték érvényessége a forrástípus szerint értendő. A hiányzó dátum nem a mai nap.'),
    answer('history', 'Mi az előzmény?', workbench, sourceRows.filter(r => r.source!.decision).map(r => entry(`${recordedDate(r.source!.decision!.decidedAt)} · ${r.source!.decision!.note}`, `LegalSourceObservation:${r.source!.observationId} · revision:${r.source!.revision}`)), 'Csak a vetületben szereplő emberi hatásdöntések; nem teljes eseménynapló.'),
  ];
}
