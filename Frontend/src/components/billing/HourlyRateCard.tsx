"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, getCurrentUser } from '@/lib/api';
import { appendHourlyRate, getHourlyRates, type RateHistory, type RateMode, type RateScope } from '@/lib/hourlyRatesApi';
import { formatHourlyRate, rateSourceLabel, rateToday } from '@/lib/hourlyRatePresentation';

export function HourlyRateCard(scope: RateScope) {
  // Reset editor and pending read state when the dossier/case changes.
  return <RateCardContent key={`${scope.clientId}:${scope.caseId || ''}`} {...scope} />;
}

function RateCardContent({ clientId, caseId }: RateScope) {
  const prefix = useId();
  const mounted = useRef(true);
  const [data, setData] = useState<RateHistory | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState<RateMode | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(rateToday);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setError(null);
    void (async () => {
      try {
        const user = await getCurrentUser();
        if (!active) return;
        if (!['ADMIN', 'PARTNER'].includes(user.role)) { setHidden(true); return; }
        const result = await getHourlyRates({ clientId, caseId });
        if (active) { setHidden(false); setData(result); }
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 403) { setData(null); setHidden(true); }
        else setError('Az óradíj adatai most nem tölthetők be.');
      }
    })();
    return () => { active = false; };
  }, [clientId, caseId, revision]);

  function edit(nextMode: RateMode) {
    setMode(nextMode); setDate(rateToday()); setAmount(''); setNotice(''); setError(null);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!mode || saving) return;
    setSaving(true); setError(null);
    try {
      await appendHourlyRate({ clientId, caseId }, { effectiveFrom: date, currency: 'HUF', mode,
        hourlyRate: mode === 'INHERIT_CLIENT' ? null : amount.trim().replace(',', '.') });
      if (!mounted.current) return;
      setMode(null); setNotice('Az új óradíjverzió mentve.'); setRevision(value => value + 1);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Az óradíj mentése nem sikerült.');
    } finally { if (mounted.current) setSaving(false); }
  }

  if (hidden || (!data && !error)) return null;
  const button = 'rounded border border-[var(--adm-border)] px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';
  const input = 'mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm';
  return <section aria-label={caseId ? 'Ügy óradíja' : 'Óradíj'} className="rounded-lg border border-[var(--adm-border)] bg-white p-4">
    <h3 className="text-sm font-semibold">{caseId ? 'Ügy óradíja' : 'Óradíj'}</h3>
    {data && <>
      <p className="mt-2 font-semibold">{formatHourlyRate(data.effective.hourlyRate)}</p>
      <p className="text-xs text-[var(--adm-text-muted)]">{rateSourceLabel(data.effective)}{data.effective.effectiveFrom ? ` · Érvényes: ${data.effective.effectiveFrom}` : ''}</p>
      {data.next && <p className="mt-2 text-xs">Következő ütemezett állapot: {data.next.date} · {formatHourlyRate(data.next.effective.hourlyRate)} · {rateSourceLabel(data.next.effective)}</p>}
      {!mode && data.canManage && <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => edit('EXPLICIT_RATE')}>{caseId ? 'Egyedi óradíj beállítása' : 'Óradíj módosítása'}</button>
        {caseId && <button type="button" className={button} onClick={() => edit('INHERIT_CLIENT')}>Visszaállítás ügyfél alap óradíjára</button>}
      </div>}
      {data.history.length > 0 && !mode && <details className="mt-3 text-xs"><summary className="cursor-pointer">Óradíjtörténet ({data.history.length})</summary>
        <ul className="mt-2 max-h-48 space-y-2 overflow-auto">{data.history.map(row => <li key={row.id}>
          {row.effectiveFrom} · {row.mode === 'INHERIT_CLIENT' ? 'Ügyfél alap óradíja' : formatHourlyRate(row.hourlyRate)}
        </li>)}</ul>
      </details>}
    </>}
    {mode && <form onSubmit={save} className="mt-3 space-y-3">
      <p className="text-xs">Új, dátumtól érvényes verzió készül. A korábbi napok díja nem változik. Egy naphoz egy verzió rögzíthető.</p>
      <label htmlFor={`${prefix}-date`} className="block text-xs">Érvényesség kezdete (budapesti nap)
        <input id={`${prefix}-date`} type="date" min={rateToday()} required value={date} disabled={saving} onChange={e => setDate(e.target.value)} className={input} />
      </label>
      {mode === 'EXPLICIT_RATE' ? <label htmlFor={`${prefix}-amount`} className="block text-xs">Óradíj (HUF/óra)
        <input id={`${prefix}-amount`} type="text" inputMode="decimal" required pattern="[0-9]{1,15}([.,][0-9]{1,4})?" value={amount} disabled={saving} onChange={e => setAmount(e.target.value)} className={input} />
      </label> : <p className="text-sm">A kiválasztott naptól az ügyfél adott munkanapon érvényes alapdíja lesz alkalmazható.</p>}
      <div className="flex gap-2"><button type="submit" className={button} disabled={saving}>{saving ? 'Mentés…' : 'Új verzió mentése'}</button>
        <button type="button" className={button} disabled={saving} onClick={() => setMode(null)}>Mégse</button></div>
    </form>}
    {notice && <p role="status" className="mt-2 text-xs">{notice}</p>}
    {error && <div role="alert" className="mt-2 text-sm text-red-700">{error}{!mode && <button className={`${button} ml-2`} onClick={() => setRevision(value => value + 1)}>Újrapróbálás</button>}</div>}
  </section>;
}
