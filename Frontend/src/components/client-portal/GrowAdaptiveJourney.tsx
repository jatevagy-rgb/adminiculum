"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { clientSafeError } from '@/lib/clientInteractionApi';
import { getPortalGrowJourney, getPortalGrowAssessment, getStoredPortalWorkspace, submitPortalGrowAssessment, submitPortalGrowPain, type PortalGrowAssessmentDetail, type PortalGrowAssessmentResult, type PortalGrowAssessmentEvidence, type PortalGrowJourney, type PortalGrowProcess } from '@/lib/clientPortalApi';
import { activeGrowQuestions, growDraftKey, parseGrowDraft, pruneGrowAnswers, type GrowDraft } from '@/lib/growAdaptiveRunner';

const panel = 'rounded-[12px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4 sm:p-6';
const field = 'min-h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-2';
const choice = `${field} text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-brand-green)]`;
type Route = { packKey: string; titleHu: string };
type Step = 'home' | 'pain' | 'routes' | 'process' | 'questions' | 'result';

function Evidence({ items }: { items: PortalGrowAssessmentEvidence[] }) {
  return <details className="mt-3 text-sm"><summary className="min-h-10 cursor-pointer py-2 font-semibold">Mire támaszkodik ez az irány?</summary><ul className="space-y-3">{items.map((e, i) => <li key={i} className="space-y-1"><p className="font-semibold">{e.title}</p><p>{[e.authors, e.year].filter(Boolean).join(' · ')} · {e.strengthLabelHu}</p>{e.boundedClaim ? <p>{e.boundedClaim}</p> : null}{e.limitations ? <p className="text-[var(--adm-text-secondary)]">Korlát: {e.limitations}</p> : null}{e.doi ? <a className="inline-flex min-h-10 items-center underline" href={`https://doi.org/${e.doi.replace(/^https?:\/\/doi.org\//, '')}`} target="_blank" rel="noreferrer">Forrás megnyitása</a> : null}</li>)}</ul></details>;
}

export function GrowAssessmentResult({ result, processName }: { result: PortalGrowAssessmentResult; processName?: string | null }) {
  return <div className="space-y-4" data-testid="grow-v2-result">
    <h2 className="text-2xl font-semibold">Mit látunk a válaszokból?</h2>
    <p className="text-sm text-[var(--adm-text-secondary)]">Ügyfél által megadott információ · {new Date(result.completedAt).toLocaleDateString('hu-HU')}{processName ? ` · ${processName}` : ''}</p>
    <p>{result.summaryHu}</p>
    {result.findings.map((f, i) => <article key={i} className={panel}><h3 className="text-lg font-semibold">{f.titleHu}</h3><p className="mt-2 leading-6">{f.summaryHu}</p>{f.nextCheckHu ? <p className="mt-3 leading-6"><strong>Következő ellenőrzés: </strong>{f.nextCheckHu}</p> : null}{f.evidence?.length ? <Evidence items={f.evidence} /> : null}</article>)}
    {result.unknownAreaCount > 0 ? <p>{result.unknownAreaCount} kérdésnél még nincs elég információ. Ez nem jelent hiányosságot.</p> : null}
    <p className="text-sm leading-6 text-[var(--adm-text-secondary)]">{result.noticeHu}</p>
  </div>;
}

/** Both portal surfaces use this runner. The server owns all questions/rules. */
export function GrowAdaptiveJourney({ processes, onDetailed, onNext, onFocusChange }: { processes: PortalGrowProcess[]; onDetailed: () => void; onNext: () => void; onFocusChange?: (active: boolean) => void }) {
  const [journey, setJourney] = useState<PortalGrowJourney | null>(null);
  const [step, setStep] = useState<Step>('home');
  const [detail, setDetail] = useState<PortalGrowAssessmentDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [processId, setProcessId] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [result, setResult] = useState<PortalGrowAssessmentResult | null>(null);
  const [resultProcess, setResultProcess] = useState<string | null>(null);
  const [draft, setDraft] = useState<GrowDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidScope, setInvalidScope] = useState(false);
  const [reload, setReload] = useState(0);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const busyRef = useRef(false);
  const key = useRef('');
  const painKey = useRef('');
  const workspace = useRef<string | null>(null);
  const heading = useRef<HTMLDivElement>(null);
  const questions = detail ? activeGrowQuestions(detail.definition.questions, answers) : [];
  const question = questions[index];

  useEffect(() => {
    mounted.current = true;
    workspace.current = getStoredPortalWorkspace();
    const token = ++epoch.current;
    setJourney(null); setError(null);
    void getPortalGrowJourney().then(j => {
      if (!mounted.current || token !== epoch.current || workspace.current !== getStoredPortalWorkspace()) return;
      setJourney(j);
      try { setDraft(parseGrowDraft(sessionStorage.getItem(growDraftKey(j.resumeScope)), j.resumeScope)); } catch { /* Browser storage may be unavailable. */ }
    }).catch(e => { if (mounted.current && token === epoch.current) setError(clientSafeError(e)); });
    const invalidate = () => { if (workspace.current !== getStoredPortalWorkspace()) { ++epoch.current; setInvalidScope(true); setJourney(null); setAnswers({}); setDetail(null); setResult(null); setDraft(null); } };
    window.addEventListener('storage', invalidate);
    return () => { mounted.current = false; ++epoch.current; window.removeEventListener('storage', invalidate); };
  }, [reload]);

  useEffect(() => { onFocusChange?.(step !== 'home'); return () => onFocusChange?.(false); }, [step, onFocusChange]);
  useEffect(() => { if (step !== 'home') { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); } }, [step, index]);
  useEffect(() => {
    if (!journey || !detail || invalidScope || !['process', 'questions'].includes(step) || workspace.current !== getStoredPortalWorkspace()) return;
    const next: GrowDraft = { scope: journey.resumeScope, packKey: detail.definition.packKey, version: detail.definition.version, answers, index, processId, idempotencyKey: key.current };
    setDraft(next);
    try { sessionStorage.setItem(growDraftKey(journey.resumeScope), JSON.stringify(next)); } catch { /* Continue without persistence. */ }
  }, [journey, detail, answers, index, processId, step, invalidScope]);

  async function run(action: (current: () => boolean) => Promise<void>) {
    if (busyRef.current || !journey || invalidScope) return;
    busyRef.current = true; setBusy(true); setError(null);
    const token = ++epoch.current;
    const current = () => mounted.current && token === epoch.current && workspace.current === getStoredPortalWorkspace();
    try {
      // Refresh authorization before mutation/resume; account or workspace changes
      // cannot replay a previous person's browser draft into the new scope.
      const authorized = await getPortalGrowJourney();
      if (!current()) return;
      if (authorized.resumeScope !== journey.resumeScope) { setInvalidScope(true); setJourney(null); return; }
      await action(current);
    } catch (e) { if (current()) setError(clientSafeError(e)); }
    finally { busyRef.current = false; if (mounted.current && token === epoch.current) setBusy(false); }
  }

  const start = (packKey: string, saved?: GrowDraft) => run(async current => {
    const d = await getPortalGrowAssessment(packKey);
    if (!current()) return;
    if (saved && saved.version !== d.definition.version) throw new Error('A mentett felmérés verziója megváltozott. Kezdjen új kitöltést.');
    const retained = pruneGrowAnswers(d.definition.questions, saved?.answers || {});
    const savedProcess = saved?.processId && processes.some(p => p.id === saved.processId) ? saved.processId : '';
    key.current = saved?.idempotencyKey || crypto.randomUUID();
    setDetail(d); setAnswers(retained); setProcessId(savedProcess); setIndex(Math.min(saved?.index || 0, activeGrowQuestions(d.definition.questions, retained).length - 1));
    setStep(d.definition.allowsProcessReference && processes.length > 0 && !savedProcess ? 'process' : 'questions');
  });

  const submitPain = () => run(async current => {
    if (!painKey.current) painKey.current = crypto.randomUUID();
    const response = await submitPortalGrowPain({ categories, freeText: freeText.trim() || undefined, idempotencyKey: painKey.current });
    if (!current()) return;
    setRoutes(response.routes); setStep('routes');
  });

  const finish = () => run(async current => {
    if (!detail) return;
    const response = await submitPortalGrowAssessment(detail.definition.packKey, { packVersion: detail.definition.version, answers: questions.map(q => ({ questionKey: q.questionKey, answer: answers[q.questionKey] })), processId: processId || undefined, idempotencyKey: key.current });
    if (!current()) return;
    setResult(response.result); setResultProcess(processes.find(p => p.id === processId)?.name || null); setStep('result'); setDraft(null);
    try { sessionStorage.removeItem(growDraftKey(journey!.resumeScope)); } catch { /* no storage */ }
    const fresh = await getPortalGrowJourney();
    if (current() && fresh.resumeScope === journey!.resumeScope) setJourney(fresh);
  });

  if (invalidScope) return <section className={panel} role="alert">A munkaterület vagy a bejelentkezés megváltozott. A folytatáshoz töltse újra az oldalt.<Button onClick={() => window.location.reload()}>Újratöltés</Button></section>;
  return <section id="grow-adaptive-journey" className={`${panel} font-sans text-[var(--adm-text-primary)]`} data-testid="grow-v2-journey" aria-busy={busy}>
    <div ref={heading} tabIndex={-1} className="mx-auto max-w-2xl scroll-mt-36 space-y-4 outline-none">
      {error ? <div role="alert" className="rounded-[8px] border border-[var(--adm-border-canonical)] p-3"><p>{error}</p>{!journey ? <Button onClick={() => setReload(n => n + 1)}>Újrapróbálás</Button> : null}</div> : null}
      {!journey ? (!error ? <p role="status">A rövid felmérés betöltése…</p> : null) : <>
        {step !== 'home' ? <Button variant="ghost" disabled={busy} onClick={() => setStep('home')}>Vissza az áttekintéshez</Button> : null}
        {step === 'home' ? <>
          <p className="text-sm text-[var(--adm-text-secondary)]">Önkéntes működési visszajelzés</p><h2 className="text-2xl font-semibold">Mondd el, hol fáj</h2>
          <p className="leading-6">Válasszon egy témát a mindennapi munkából. Néhány rövid kérdés után megmutatjuk, mit érdemes közösen megvizsgálni.</p>
          <div className="flex flex-wrap gap-3"><Button variant="primary" disabled={busy} onClick={() => { setCategories([]); setFreeText(''); painKey.current = ''; setStep('pain'); }}>Elmondom, hol akad el a munka</Button><Button variant="secondary" disabled={busy} onClick={() => void start('QUICK_SCAN_V2')}>Gyors állapotfelmérés</Button></div>
          <p className="text-sm text-[var(--adm-text-secondary)]">A gyors felmérés 6 kérdés. Akkor is elkezdheti, ha még nem tudja pontosan, mi okozza az elakadást.</p>
          {draft ? <div className="flex flex-wrap items-center gap-2"><Button disabled={busy} onClick={() => void start(draft.packKey, draft)}>Félbehagyott felmérés folytatása</Button><Button variant="ghost" onClick={() => { try { sessionStorage.removeItem(growDraftKey(journey.resumeScope)); } catch {} setDraft(null); }}>Vázlat elvetése</Button></div> : null}
          <Button variant="ghost" disabled={busy} onClick={onDetailed}>Részletes felmérések és korábbi V1-eredmények</Button>
          {journey.history.length ? <details><summary className="min-h-10 cursor-pointer py-2 font-semibold">Korábbi rövid felmérések ({journey.history.length})</summary><ul className="space-y-2">{journey.history.map((h, i) => <li key={i}>{h.result ? <button type="button" disabled={busy} className={`${choice} underline`} onClick={() => { setResult(h.result); setResultProcess(h.processName); setStep('result'); }}>{h.result.titleHu} · {h.processName || 'Szervezeti visszajelzés'} · {new Date(h.result.completedAt).toLocaleDateString('hu-HU')}</button> : <p>A korábbi kitöltés eredménye jelenleg nem jeleníthető meg.</p>}</li>)}</ul></details> : null}
        </> : null}
        {step === 'pain' ? <>
          <h2 className="text-2xl font-semibold">Hol akad el a munka?</h2><p>Válasszon 1–3 témát. A szöveges kiegészítés nem kötelező.</p>
          <fieldset className="space-y-2"><legend className="sr-only">Működési témák</legend>{journey.categories.map(c => <label key={c.value} className={`${choice} flex items-start gap-3 ${categories.includes(c.value) ? 'border-[var(--adm-brand-green)]' : ''}`}><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--adm-brand-green)]" checked={categories.includes(c.value)} disabled={busy || (!categories.includes(c.value) && categories.length === 3)} onChange={() => { painKey.current = ''; setCategories(a => a.includes(c.value) ? a.filter(v => v !== c.value) : [...a, c.value]); }} /><span>{c.labelHu}</span></label>)}</fieldset>
          <label className="block space-y-2"><span>Kiegészítés (nem kötelező)</span><textarea disabled={busy} className={field} rows={3} maxLength={4000} value={freeText} onChange={e => { painKey.current = ''; setFreeText(e.target.value); }} /></label>
          <p className="text-sm text-[var(--adm-text-secondary)]">A kiválasztott témákat és a megadott kiegészítést mentjük a visszajelzéséhez, majd megmutatjuk a következő témákat. Ebből nem jön létre automatikusan feladat vagy fejlesztési kezdeményezés.</p>
          <Button variant="primary" disabled={busy || categories.length === 0} onClick={() => void submitPain()}>{busy ? 'Mentés…' : 'Mentés és folytatás'}</Button>
        </> : null}
        {step === 'routes' ? <><h2 className="text-2xl font-semibold">Melyik témával kezdjük?</h2><p>Most egy témát járunk körül. A többi jelzést is rögzítettük.</p><div className="space-y-2">{routes.map(r => <button key={r.packKey} type="button" className={choice} disabled={busy} onClick={() => void start(r.packKey)}>{r.titleHu} →</button>)}</div><Button variant="ghost" disabled={busy} onClick={() => setStep('pain')}>Vissza a témákhoz</Button></> : null}
        {step === 'process' ? <><h2 className="text-2xl font-semibold">Melyik folyamatban jelentkezik ez leginkább?</h2><label className="block space-y-2"><span id="grow-v2-process-label">Folyamat</span><select aria-labelledby="grow-v2-process-label" className={field} value={processId} onChange={e => { setProcessId(e.target.value); key.current = crypto.randomUUID(); }}><option value="">Válasszon folyamatot</option>{processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><Button variant="primary" disabled={!processId} onClick={() => setStep('questions')}>Kérdések indítása</Button></> : null}
        {step === 'questions' && question && detail ? <>
          <p className="text-sm text-[var(--adm-text-secondary)]">{detail.definition.titleHu}{processId ? ` · ${processes.find(p => p.id === processId)?.name || ''}` : ''}</p>
          <p role="status" data-testid="grow-v2-progress">{index + 1} / {questions.length} kérdés{detail.definition.questions.some(q => q.when) ? ' · A kérdések száma a válaszoktól függ.' : ''}</p><div role="progressbar" aria-valuenow={index + 1} aria-valuemin={0} aria-valuemax={questions.length} aria-label="Felmérés előrehaladása" className="h-2 w-full rounded bg-[var(--adm-border-canonical)]"><div className="h-2 rounded bg-[var(--adm-brand-green)]" style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
          <fieldset className="space-y-3" disabled={busy}><legend className="mb-4 text-xl font-semibold leading-7" data-testid="grow-v2-question">{question.promptHu}</legend>{question.helpTextHu ? <p className="text-sm">{question.helpTextHu}</p> : null}{question.options.map(o => <label key={o.value} className={`${choice} flex items-start gap-3 ${answers[question.questionKey] === o.value ? 'border-[var(--adm-brand-green)]' : ''}`}><input className="mt-1 h-5 w-5 shrink-0 accent-[var(--adm-brand-green)]" type="radio" name={question.questionKey} value={o.value} checked={answers[question.questionKey] === o.value} onChange={() => { key.current = crypto.randomUUID(); setAnswers(a => pruneGrowAnswers(detail.definition.questions, { ...a, [question.questionKey]: o.value })); }} /><span>{o.labelHu}</span></label>)}</fieldset>
          <div className="flex flex-wrap justify-between gap-3"><Button variant="secondary" disabled={busy || (index === 0 && !(detail.definition.allowsProcessReference && processes.length))} onClick={() => index ? setIndex(i => i - 1) : setStep('process')}>Vissza</Button><Button variant="primary" disabled={busy || !answers[question.questionKey]} onClick={() => index < questions.length - 1 ? setIndex(i => i + 1) : void finish()}>{busy ? 'Mentés…' : index < questions.length - 1 ? 'Tovább' : 'Eredmény megtekintése'}</Button></div>
          <p className="text-sm text-[var(--adm-text-secondary)]">A félbehagyott kitöltés ebben a böngészőlapban folytatható, ha a böngésző engedélyezi a mentést.</p>
        </> : null}
        {step === 'result' && result ? <><GrowAssessmentResult result={result} processName={resultProcess} />{result.routingOptions !== undefined ? <div className="space-y-2"><h3 className="font-semibold">Válasszon egy következő témát</h3>{!result.routingOptions.length ? <p>Nincs erős irányjelzés. Ha szeretné, választhat egy további témát.</p> : null}{(result.routingOptions.length ? result.routingOptions : journey.branches).map(r => <button type="button" key={r.packKey} className={choice} disabled={busy} onClick={() => void start(r.packKey)}>{r.titleHu} →</button>)}</div> : <div className="space-y-3"><h3 className="font-semibold">Mi történik ezután?</h3><p>A következő lépés a működési adatok áttekintése és a szakmai egyeztetés. Fejlesztési kezdeményezésről ezután, emberi döntéssel határozunk.</p><Button onClick={() => { setStep('home'); onNext(); }}>Fejlesztési irányok megnyitása</Button></div>}</> : null}
      </>}
    </div>
  </section>;
}
