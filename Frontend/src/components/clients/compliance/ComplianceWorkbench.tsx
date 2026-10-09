"use client";
import { useEffect, useRef, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { complianceWorkbenchApi, type Workbench, type AcceptanceTarget, type WorkbenchRow, type ImpactDecisionInput } from '@/lib/complianceWorkbenchApi';
import { complianceCenterApi, type LegalSourceObservationDetail } from '@/lib/complianceCenterApi';
import { complianceOverviewApi } from '@/lib/complianceOverviewApi';
import {
  IMPACT_DECISION_LABELS,
  impactDecisionLabel,
  workbenchKindLabel,
  workbenchStatusLabel,
} from '@/lib/complianceWorkbenchPresentation';

const button = 'rounded border px-3 py-2 text-sm disabled:opacity-50';
type RequirementTarget = { applicabilityId: string; factKey: string };

export function ComplianceWorkbench({ clientId, focusRowId, onNavigate, onChanged }: { clientId: string; focusRowId?: string; onNavigate: (view: 'requirements' | 'controls' | 'findings', target?: RequirementTarget) => void; onChanged: () => void }) {
  const [data, setData] = useState<Workbench | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  async function reload() {
    const run = ++generation.current;
    try { const next = await complianceWorkbenchApi.get(clientId); if (mounted.current && run === generation.current) { setData(next); setError(''); } }
    catch { if (mounted.current && run === generation.current) setError('A munkalista nem tölthető be. Frissítsen vagy ellenőrizze a jogosultságot.'); }
  }
  useEffect(() => { mounted.current = true; setData(null); void reload(); return () => { mounted.current = false; generation.current++; }; }, [clientId]); // parent keys by client
  useEffect(() => {
    if (!focusRowId || data?.clientId !== clientId || !data.rows.some(row => row.id === focusRowId)) return;
    const element = document.getElementById(`compliance-work-${encodeURIComponent(focusRowId)}`);
    element?.focus();
    element?.scrollIntoView({ block: 'nearest' });
  }, [clientId, data, focusRowId]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); if (mounted.current) { await reload(); onChanged(); } }
    catch { if (mounted.current) setError('A művelet nem sikerült. A forrás vagy a jogosultság változhatott; frissítsen az új döntés előtt.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section aria-label="Belső Compliance munkalista" className="space-y-3 rounded border p-4">
    <div className="flex items-center justify-between"><h2 className="font-semibold">Döntési munkalista</h2><button className={button} disabled={busy} onClick={() => void reload()}>Frissítés</button></div>
    <p className="text-sm">A meglévő nyilvántartásokból összeállított belső teendők. A jogforráshatás nem jelent meg nem felelést; ügyfélközzététel külön döntés.</p>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Betöltés…</p>}
    {data && Object.values(data.truncated).some(Boolean) && <p role="status">Forrásonként legfeljebb 50 sor látható. A teljes listát a kapcsolódó nyilvántartásban ellenőrizze.</p>}
    {data && !data.rows.length && <p>Nincs rögzített döntési teendő.</p>}
    {data?.clientId === clientId && focusRowId && !data.rows.some(row => row.id === focusRowId) && <p role="status">A kijelölt munkatétel nem látható ebben a friss munkalistában. Más tétel nem lett kiválasztva.</p>}
    {data?.clientId === clientId && data.rows.map(row => <article key={row.id} id={`compliance-work-${encodeURIComponent(row.id)}`} tabIndex={-1} className="space-y-2 rounded border p-3 focus:outline-2 focus:outline-[var(--adm-brand-green)]">
      <h3 className="font-medium">{workbenchKindLabel(row.kind)} · {row.title}</h3>
      <p className="text-sm">Állapot: {workbenchStatusLabel(row)}{row.subject ? ` · ${row.subject}` : ''}</p>
      <p className="text-xs">{row.since ? `Rögzítve / értékelve: ${new Date(row.since).toLocaleString('hu-HU')}` : ''}{row.dueAt ? ` · Határidő / érvényesség: ${new Date(row.dueAt).toLocaleDateString('hu-HU')}` : ''}{row.ownerName ? ` · Felelős: ${row.ownerName}` : row.ownerId ? ' · Felelős: nincs megjeleníthető név' : row.kind === 'PROPOSAL' ? ' · Felelős: nincs megadva' : ''}</p>
      {row.caseId && <a className="underline" href={`/cases/${encodeURIComponent(row.caseId)}`}>Kapcsolódó ügy megnyitása</a>}
      {row.readOnly && <p>Csak olvasható: {row.reason === 'AWAITING_CUSTOMER_CORRECTION' ? 'Ügyféljavításra vár.' : 'A döntés már rögzítve van.'}</p>}
      {row.action === 'REQUIREMENTS' && <button className={button} onClick={() => {
        if (!row.target || row.clientId !== clientId) { setError('A kijelölt követelmény nem érhető el ennél az ügyfélnél.'); return; }
        onNavigate('requirements', row.target);
      }}>Követelmény és adatbekérés megnyitása</button>}
      {row.action === 'PROPOSAL_REVIEW' && <button className={button} onClick={() => onNavigate('findings')}>Javaslat / intézkedés megnyitása</button>}
      {row.action === 'EVIDENCE_REVIEW' && <><button className={button} onClick={() => onNavigate('controls')}>Kontroll és bizonyíték megnyitása</button><button className={button} disabled={busy || row.readOnly} onClick={() => void run(() => complianceOverviewApi.reviewEvidenceRecord(clientId, row.sourceId, { status: 'UNDER_REVIEW' }))}>Felülvizsgálatra jelölés</button><button className={button} disabled={busy || row.readOnly} onClick={() => void run(() => complianceOverviewApi.reviewEvidenceRecord(clientId, row.sourceId, { status: 'REJECTED' }))}>Bizonyíték elutasítása</button></>}
      {row.action === 'SUBMISSION_REVIEW' && !row.readOnly && <SubmissionDecision row={row} busy={busy} run={run} targets={data.acceptanceTargets || []} />}
      {row.source && <details className="text-xs"><summary className="cursor-pointer">Forrás technikai adatai</summary><p className="mt-1">Forrás: {row.source.sourceKey} · Változat: {row.source.versionKey} · Azonosító: {row.source.legalSourceVersionId} · Esemény: {row.source.event}</p></details>}
      {row.source && <div className="text-sm"><p>Forrásfelülvizsgálat: {row.source.reviewedNote || 'Még nincs rögzített indok.'}</p><ul>{row.source.requirementVersions.map(v => <li key={v.id}>{v.title}</li>)}</ul></div>}
      {row.action === 'SOURCE_REVIEW' && <SourceReview row={row} busy={busy} run={run} />}
      {row.action === 'IMPACT_DECISION' && row.source && (row.source.decision ? <p>{impactDecisionLabel(row.source.decision.kind)} · {row.source.decision.note}{row.source.decision.result?.caseId && <a className="block underline" href={`/cases/${encodeURIComponent(row.source.decision.result.caseId)}`}>Létrehozott ügy megnyitása</a>}{row.source.decision.result?.taskId && <a className="block underline" href={`/tasks?taskId=${encodeURIComponent(row.source.decision.result.taskId)}`}>Létrehozott feladat megnyitása</a>}{row.source.decision.result?.requirementVersionId && <span className="block">Felülvizsgálati tervezet készült (jóváhagyásra vár).</span>}</p> : <ImpactDecision row={row} busy={busy} run={run} />)}
    </article>)}
  </section>;
}

type ActionProps = { row: WorkbenchRow; busy: boolean; run: (action: () => Promise<unknown>) => Promise<void> };
function SourceReview({ row, busy, run }: ActionProps) {
  const [note, setNote] = useState('');
  const [detail, setDetail] = useState<LegalSourceObservationDetail | null>(null);
  return <div className="space-y-2"><a href="/compliance" className="underline">Forrásnyilvántartás és teljes felülvizsgálat</a><button className={button} disabled={busy} onClick={() => void run(async () => setDetail(await complianceCenterApi.getLegalSourceObservation(row.sourceId)))}>Esemény részleteinek ellenőrzése</button>{detail && <p>{detail.kind} · {detail.relatedIdentifier} · {detail.capturedAt}</p>}<label className="block">Felülvizsgálati indok<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} /></label>
    {row.status === 'NEW' ? <button className={button} disabled={busy} onClick={() => void run(() => complianceCenterApi.startLegalSourceObservationReview(row.sourceId))}>Felülvizsgálat indítása</button> : <button className={button} disabled={busy || !detail || !note.trim()} onClick={() => void run(() => complianceCenterApi.decideLegalSourceObservationReview(row.sourceId, 'IMPACT_CONFIRMED', note))}>Hatásvizsgálat szükséges</button>}
    {row.status === 'IN_REVIEW' && <>{(['NO_IMPACT', 'REJECTED'] as const).map(decision => <button key={decision} className={button} disabled={busy || !detail || !note.trim()} onClick={() => void run(() => complianceCenterApi.decideLegalSourceObservationReview(row.sourceId, decision, note))}>{decision === 'NO_IMPACT' ? 'Nincs további hatásvizsgálat' : 'Esemény elutasítása'}</button>)}</>}
  </div>;
}
function ImpactDecision({ row, busy, run }: ActionProps) {
  const [kind, setKind] = useState<ImpactDecisionInput['kind']>('NO_ACTION');
  const [note, setNote] = useState(''); const [target, setTarget] = useState('');
  const [draft, setDraft] = useState({ versionKey: '', title: '', normativeStatement: '', effectiveFrom: '' });
  const source = row.source!;
  return <form className="space-y-2" onSubmit={e => { e.preventDefault(); void run(() => complianceWorkbenchApi.decide(row.clientId, row.sourceId, { sourceRevision: source.revision, kind, note, ...(kind === 'REMEDIATION' ? { proposalId: target } : {}), ...(kind === 'RULE_REVIEW' ? { requirementVersionId: target, draft } : {}) })); }}>
    <label className="block">Operátori döntés<select value={kind} onChange={e => { setKind(e.target.value as typeof kind); setTarget(''); }}>{Object.entries(IMPACT_DECISION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {(kind === 'REMEDIATION' || kind === 'RULE_REVIEW') && <label className="block">Érintett meglévő tétel<select required value={target} onChange={e => setTarget(e.target.value)}><option value="">Válasszon…</option>{(kind === 'REMEDIATION' ? source.proposals : source.requirementVersions).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
    {kind === 'REMEDIATION' && !source.proposals.length && <p>Előbb hozzon létre javaslatot az érintett megállapítás meglévő intézkedési felületén.</p>}
    {kind === 'RULE_REVIEW' && <fieldset><legend>Új felülvizsgálati tervezet — nincs jóváhagyás</legend>{(['versionKey', 'title', 'normativeStatement', 'effectiveFrom'] as const).map(key => <label className="block" key={key}>{{ versionKey: 'Verzió neve', title: 'Cím', normativeStatement: 'Követelmény szövege', effectiveFrom: 'Tervezett hatálykezdet' }[key]}<input required type={key === 'effectiveFrom' ? 'date' : 'text'} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}</fieldset>}
    <label className="block">Döntési indok<textarea required maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
    <button className={button} disabled={busy || row.readOnly || !note.trim()}>Döntés rögzítése</button>
  </form>;
}

type Submission = { revision: number; status: string; files: Array<{ id: string; originalFileNameSafe: string; status: string }>; fields: Array<{ id: string; labelSnapshot: string; valueSafe: string }> };
function SubmissionDecision({ row, busy, run, targets }: ActionProps & { targets: AcceptanceTarget[] }) {
  const [targetId, setTargetId] = useState(''); const [fieldId, setFieldId] = useState(''); const [value, setValue] = useState(''); const [validFrom, setValidFrom] = useState('');
  const target = targets.find(t => t.id === targetId);
  const [detail, setDetail] = useState<Submission | null>(null); const [fileId, setFileId] = useState(''); const [reason, setReason] = useState('');
  const base = `/internal/client-interaction/submissions/${encodeURIComponent(row.sourceId)}`;
  const post = (path: string, body: unknown) => fetchApi(`${base}/${path}`, { method: 'POST', body: JSON.stringify(body), authContext: 'workforce' });
  return <div className="space-y-2"><button className={button} disabled={busy} onClick={() => void run(async () => setDetail(await fetchApi<Submission>(base, { authContext: 'workforce' })))}>Beküldés ellenőrzése</button>
    {detail && <><ul>{detail.fields.map(f => <li key={f.id}>{f.labelSnapshot}: {f.valueSafe}</li>)}</ul><label className="block">Bizonyítékként elfogadandó fájl<select value={fileId} onChange={e => setFileId(e.target.value)}><option value="">Válasszon…</option>{detail.files.map(f => <option key={f.id} value={f.id} disabled={!['CLEAN', 'ACCEPTED'].includes(f.status)}>{f.originalFileNameSafe} · {f.status}</option>)}</select></label>
    <label className="block">Indok<textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label>
    <button className={button} disabled={busy || !fileId || !reason.trim() || !['SUBMITTED', 'UNDER_INTERNAL_REVIEW', 'ACCEPTED_INTO_MATTER'].includes(detail.status)} onClick={() => void run(() => post('accept-compliance', { outcome: 'ACCEPT_EVIDENCE', expectedRevision: detail.revision, fileId, reason }))}>Elfogadás Compliance bizonyítékként</button>
    {targets.length > 0 && <fieldset className="space-y-2"><legend>Beküldött adat elfogadása a hiányzó vállalati tényhez</legend>
      <label className="block">Forrásválasz<select value={fieldId} onChange={e => setFieldId(e.target.value)}><option value="">Válasszon…</option>{detail.fields.map(f => <option key={f.id} value={f.id}>{f.labelSnapshot}: {f.valueSafe}</option>)}</select></label>
      <label className="block">Hiányzó adat<select value={targetId} onChange={e => { setTargetId(e.target.value); setValue(''); }}><option value="">Válasszon…</option>{targets.map(t => <option key={t.id} value={t.id}>{t.key}</option>)}</select></label>
      <label className="block">Ellenőrzött érték{target?.valueType === 'BOOLEAN' ? <select value={value} onChange={e => setValue(e.target.value)}><option value="">Válasszon…</option><option value="true">Igen</option><option value="false">Nem</option></select> : <input type={target?.valueType === 'NUMBER' ? 'number' : 'text'} value={value} onChange={e => setValue(e.target.value)} />}</label>
      <label className="block">Érvényes ettől<input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} /></label>
      <button className={button} disabled={busy || !target || !fieldId || !value.trim() || !validFrom || !reason.trim() || !['SUBMITTED', 'UNDER_INTERNAL_REVIEW', 'ACCEPTED_INTO_MATTER'].includes(detail.status)} onClick={() => void run(() => post('accept-compliance', { outcome: 'ACCEPT_FACT', expectedRevision: detail.revision, reason, fieldId, factDefinitionId: target!.id, fact: { scopeType: 'COMPANY', validFrom: new Date(validFrom).toISOString(), ...(target!.valueType === 'BOOLEAN' ? { booleanValue: value === 'true' } : target!.valueType === 'NUMBER' ? { numberValue: Number(value) } : { stringValue: value }) } }))}>Elfogadás ellenőrzött tényként</button>
    </fieldset>}
    <button className={button} disabled={busy || !reason.trim()} onClick={() => void run(() => post('request-correction', { expectedRevision: detail.revision, reasonSafe: reason }))}>Javítás kérése</button>
    </>}
  </div>;
}
