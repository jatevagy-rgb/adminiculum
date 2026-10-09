"use client";

import { useEffect, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { getOperationalMetrics, OPERATIONAL_METRIC_LABELS, type OperationalMetricsResult } from '@/lib/operationalMetricsApi';
import { BASELINE_CATEGORIES, baselineUnit, makeBaselineRow, MANUAL_STARTER_PACK_STEPS, MANUAL_STARTER_PACK_VERSION, STARTER_PACK_REGISTRIES, type BaselineRow } from '@/lib/manualStarterPack';

const INPUT = 'min-h-10 w-full rounded-lg border border-[var(--adm-border-canonical)] bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--adm-brand-green)]';
const CARD = 'min-w-0 rounded-lg border border-[var(--adm-border-canonical)] bg-white p-4';

function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function monthStart() { return today().slice(0, 8) + '01'; }

function exportWorksheet(data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'adminiculum-manual-baseline-v1.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function OperationalMeasurementPanel({ clientId }: { clientId: string }) {
  // Keyed inner component discards prior-client results and voluntary worksheet on a scope switch.
  return <MeasurementSession key={clientId} clientId={clientId} />;
}

function MeasurementSession({ clientId }: { clientId: string }) {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [request, setRequest] = useState({ from, to, revision: 0 });
  const [data, setData] = useState<OperationalMetricsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<string>(BASELINE_CATEGORIES[0]);
  const [basis, setBasis] = useState<BaselineRow['basis']>('MEASURED');
  const [value, setValue] = useState('');
  const [rows, setRows] = useState<BaselineRow[]>([]);
  const [invalid, setInvalid] = useState(false);
  const [checks, setChecks] = useState<number[]>([]);
  const [refs, setRefs] = useState<Record<string, string>>({});

  useEffect(() => {
    let current = true;
    setLoading(true); setData(null); setError(false);
    getOperationalMetrics(clientId, request.from, request.to).then(result => { if (current) setData(result); }).catch(() => { if (current) setError(true); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [clientId, request]);

  return <section className="space-y-4" aria-label="Mérés és indulás" data-testid="operational-measurement-panel">
    <header><h2 className="font-serif text-xl font-semibold">Mérés és indulás</h2><p className="mt-1 text-sm text-[var(--adm-text-secondary)]">Rögzített források és önkéntes folyamatfelmérés. Az eltelt idő nem munkaidő; nincs munkatársi rangsor.</p></header>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setRequest({ from, to, revision: request.revision + 1 }); }}>
      <label className="min-w-0 flex-1 basis-40 text-sm">Időszak kezdete<input required type="date" className={INPUT} value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label className="min-w-0 flex-1 basis-40 text-sm">Időszak vége<input required type="date" className={INPUT} min={from} value={to} onChange={e => setTo(e.target.value)} /></label>
      <Button type="submit" disabled={loading}>Mutatók lekérdezése</Button>
    </form>
    {loading ? <p role="status">Mutatók betöltése…</p> : error ? <Alert variant="error">A mutatók nem érhetők el. Ellenőrizze az időszakot és a hozzáférést, majd próbálja újra. Ez nem nulla eredmény.</Alert> : data ? <>
      <div className="grid gap-3 md:grid-cols-2">
        {data.items.map(metric => <article key={metric.metricKey} className={CARD}>
          <h3 className="font-semibold">{OPERATIONAL_METRIC_LABELS[metric.metricKey] || metric.metricKey}</h3>
          <p className="mt-2 text-xl font-semibold text-[var(--adm-brand-green)]">{metric.value === null ? 'Nincs rögzített minta' : metric.unit === 'RATIO' ? `${(metric.value * 100).toLocaleString('hu-HU', { maximumFractionDigits: 1 })}%` : `${metric.value.toLocaleString('hu-HU', { maximumFractionDigits: 1 })} ${metric.unit === 'RECORDED_LABOUR_MINUTES' ? 'rögzített munkaperc' : 'eltelt perc'}`}</p>
          <p className="mt-2 text-sm">Minta: {metric.sampleCount} · Kizárt / hiányos: {metric.missingCount}</p>
          <details className="mt-3 text-sm"><summary className="cursor-pointer focus-visible:outline">Definíció és források</summary>
            <p>Definíció: {metric.definitionVersion} · {metric.period.from} – {metric.period.to} ({metric.period.timeZone})</p>
            <p>Alap: {metric.basis === 'RECORDED_TIMESTAMPS' ? 'Rögzített időbélyegek' : metric.basis === 'RECORDED_TIME_ENTRIES' ? 'Rögzített munkaidő-bejegyzések' : 'Nincs rögzített minta'} · Lekérdezve: {metric.freshness.calculatedAt}</p>
            <p>Számláló: {metric.numerator ?? 'Ismeretlen'} · Nevező: {metric.denominator ?? 'Ismeretlen'}</p>
            <ul className="list-disc space-y-1 pl-5">{metric.limitations.map(text => <li key={text}>{text}</li>)}</ul>
            <ul className="mt-2 space-y-1">{metric.sourceRefs.map(ref => <li key={`${ref.type}:${ref.id}`} className="break-all">{ref.type}: {ref.id} · Ügy: {ref.caseId}</li>)}</ul>
          </details>
        </article>)}
      </div>
      <details className={CARD}><summary className="cursor-pointer font-semibold focus-visible:outline">Még nem számítható mutatók</summary><ul className="mt-2 space-y-2 text-sm">{data.unavailable.map(item => <li key={item.metricKey}>{item.reason}</li>)}</ul></details>
    </> : null}
    <details className={CARD}>
      <summary className="cursor-pointer font-semibold focus-visible:outline">Önkéntes folyamat-alapfelmérés</summary>
      <p className="my-3 text-sm">A munkalap csak ebben a megnyitásban él. Exportálja megőrzéshez; nem kerül szerverre és nem módosít munkaidő-bejegyzést. Ne írjon személyes vagy ügytartalmi adatot.</p>
      <p className="my-3 text-sm">Egy sor egy megfigyelt munkafolyamat mintája. Az export időszaka a fent megadott kezdő és záró dátum.</p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); const row = makeBaselineRow(category, basis, value); setInvalid(!row); if (row) { setRows([...rows, row]); setValue(''); } }}>
        <label className="text-sm">Folyamat<select aria-label="Folyamat" className={INPUT} value={category} onChange={e => setCategory(e.target.value)}>{BASELINE_CATEGORIES.map(name => <option key={name}>{name}</option>)}</select></label>
        <label className="text-sm">Mérési alap<select aria-label="Mérési alap" className={INPUT} value={basis} onChange={e => setBasis(e.target.value as BaselineRow['basis'])}><option value="MEASURED">Mért</option><option value="ESTIMATED">Becsült</option></select></label>
        <label className="text-sm">{baselineUnit(category) === 'COUNT' ? 'Körök száma' : baselineUnit(category) === 'ELAPSED_MINUTES' ? 'Eltelt perc' : 'Aktív munka perc'}<input className={INPUT} type="number" min="0" step={baselineUnit(category) === 'COUNT' ? '1' : 'any'} value={value} onChange={e => setValue(e.target.value)} /></label>
        <div className="self-end"><Button type="submit">Sor hozzáadása</Button></div>
      </form>
      {invalid ? <p role="alert" className="mt-2 text-sm">Adjon meg érvényes, nem negatív értéket. Az üres mező nem nulla.</p> : null}
      <ul className="my-3 space-y-2 text-sm">{rows.map((row, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-2"><span>{row.category}: {row.value} {row.unit === 'COUNT' ? 'kör' : row.unit === 'ACTIVE_MINUTES' ? 'aktív perc' : 'eltelt perc'} · {row.basis === 'MEASURED' ? 'Mért' : 'Becsült'}</span><Button size="sm" variant="neutral" onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label={`${index + 1}. sor törlése`}>Törlés</Button></li>)}</ul>
    </details>
    <details className={CARD}>
      <summary className="cursor-pointer font-semibold focus-visible:outline">Manuális indulási munkalap · {MANUAL_STARTER_PACK_VERSION}</summary>
      <p className="my-3 text-sm">Ágazatfüggetlen munkalap. A csomag kiválasztása nem megfelelési döntés. A lépések kézi ellenőrzések; nincs automatikus alkalmazás vagy mentés.</p>
      <ol className="space-y-3">{MANUAL_STARTER_PACK_STEPS.map((step, i) => <li key={step}><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={checks.includes(i)} onChange={e => setChecks(e.target.checked ? [...checks, i] : checks.filter(v => v !== i))} />{i + 1}. {step}</label></li>)}</ol>
      <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold focus-visible:outline">Kiválasztott nyilvántartási hivatkozások</summary><p className="my-2 text-sm">Rögzítse a már ellenőrzött azonosítót és verziót. Az üres érték ismeretlen; a munkalap nem hitelesíti a hivatkozást.</p><div className="grid gap-3 sm:grid-cols-2">{STARTER_PACK_REGISTRIES.map(registry => <label key={registry} className="min-w-0 break-words text-sm">{registry}<input maxLength={200} className={INPUT} value={refs[registry] || ''} onChange={e => setRefs({ ...refs, [registry]: e.target.value })} /></label>)}</div></details>
    </details>
    <Button variant="neutral" onClick={() => exportWorksheet({ version: MANUAL_STARTER_PACK_VERSION, exportedAt: new Date().toISOString(), period: { from, to, timeZone: 'Europe/Budapest' }, basis: 'VOLUNTARY_MANUAL_WORKSHEET', baseline: rows, reviewedStepIndexes: checks, registryReferences: refs, persisted: false, complianceDecision: null })}>Munkalap exportálása</Button>
  </section>;
}
