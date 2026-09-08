"use client";

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { ApiError, getCurrentUser } from '@/lib/api';
import {
  getBillingPreparation,
  patchBillingItem,
  refreshBillingPreparation,
  resyncBillingItem,
  setBillingPreparationStatus,
  type BillingItem,
  type BillingWorkspace,
} from '@/lib/billingPreparationsApi';
import {
  formatMinutes,
  formatNetAmount,
  formatRate,
  groupByOrganizationGroup,
  rateScopeLabel,
  reviewStatusLabel,
} from '@/lib/billingPreparationPresentation';

const button = 'rounded border border-[var(--adm-border)] px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';
const input = 'mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm';

export default function BillingReviewWorkspace({ clientId, preparationId }: { clientId: string; preparationId: string }) {
  const [workspace, setWorkspace] = useState<BillingWorkspace | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const user = await getCurrentUser();
      if (!['ADMIN', 'PARTNER'].includes(user.role)) { setForbidden(true); setLoading(false); return; }
      setWorkspace(await getBillingPreparation(preparationId));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) setForbidden(true);
      else if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError('A számlázási előkészítés most nem tölthető be.');
    } finally {
      setLoading(false);
    }
  }, [preparationId]);

  useEffect(() => { void load(); }, [load]);

  function replaceItem(updated: BillingItem) {
    setWorkspace(ws => ws ? { ...ws, items: ws.items.map(item => item.id === updated.id ? updated : item) } : ws);
  }

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setNotice('');
    try {
      const result = await refreshBillingPreparation(preparationId);
      setNotice(`Frissítve: ${result.resynced} sor szinkronizálva, ${result.added} új sor hozzáadva${result.stillMissing ? `, ${result.stillMissing} sor forrása hiányzik` : ''}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A frissítés nem sikerült.');
    } finally {
      setRefreshing(false);
    }
  }

  async function toggleStatus(next: 'OPEN' | 'CLOSED') {
    try {
      await setBillingPreparationStatus(preparationId, next);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Az állapot módosítása nem sikerült.');
    }
  }

  if (loading) return <main className="p-6 text-sm text-[var(--adm-text-muted)]">Betöltés…</main>;
  if (forbidden) return <main className="p-6 text-sm">A számlázási előkészítés megtekintéséhez adminisztrátor vagy partner jogosultság szükséges.</main>;
  if (notFound) return <main className="p-6 text-sm">A számlázási előkészítés nem található. <Link className="text-[var(--adm-ochre-600)]" href={`/clients/${encodeURIComponent(clientId)}/szamlazas`}>Vissza a számlázáshoz</Link></main>;
  if (!workspace) return <main className="p-6 text-sm text-red-700" role="alert">{error ?? 'Ismeretlen hiba.'}</main>;

  const prep = workspace.preparation;
  const summary = workspace.summary;
  const open = prep.status === 'OPEN';
  const groups = groupByOrganizationGroup(workspace.items);

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Számlázás előkészítése — {prep.clientName ?? ''}</h1>
          <p className="text-xs text-[var(--adm-text-muted)]">
            Időszak: {prep.periodStart} – {prep.periodEnd} · {prep.currency} · {open ? 'Nyitott' : 'Lezárt'}
          </p>
        </div>
        <Link href={`/clients/${encodeURIComponent(clientId)}/szamlazas`} className="text-xs text-[var(--adm-ochre-600)]">← Számlázás</Link>
      </div>

      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--adm-border)] bg-white p-4 text-sm">
        <span><strong>Számlázandó:</strong> {formatMinutes(summary.includedMinutes)} óra · {formatNetAmount(summary.includedNetAmount)}</span>
        <span className="text-[var(--adm-text-muted)]">Kizárt: {formatMinutes(summary.excludedMinutes)} óra</span>
        {summary.reviewRequiredCount > 0 && <span className="text-amber-700">{summary.reviewRequiredCount} sor felülvizsgálatot igényel</span>}
        {summary.noRateCount > 0 && <span className="text-red-700">{summary.noRateCount} sorhoz nincs óradíj</span>}
        {summary.staleCount > 0 && <span className="text-amber-700">{summary.staleCount} sor forrása megváltozott</span>}
        <span className="ml-auto flex gap-2">
          {open && <>
            <button type="button" className={button} disabled={refreshing} onClick={refresh}>{refreshing ? 'Frissítés…' : 'Frissítés a forrásokból'}</button>
            <button type="button" className={button} onClick={() => toggleStatus('CLOSED')}>Előkészítés lezárása</button>
          </>}
          {!open && <button type="button" className={button} onClick={() => toggleStatus('OPEN')}>Újranyitás</button>}
        </span>
      </section>
      {notice && <p role="status" className="text-xs">{notice}</p>}
      {error && <div role="alert" className="text-sm text-red-700">{error}</div>}

      {workspace.items.length === 0 && (
        <p className="rounded-lg border border-[var(--adm-border)] bg-white p-4 text-sm text-[var(--adm-text-muted)]">
          Nincs munkaóra-tétel ebben az időszakban ehhez az ügyfélhez.
        </p>
      )}

      {groups.map(group => (
        <section key={group.name} className="rounded-lg border border-[var(--adm-border)] bg-white">
          <h2 className="border-b border-[var(--adm-border)] px-4 py-2 text-xs font-semibold uppercase tracking-wide">{group.name}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--adm-text-muted)]">
                <th className="px-3 py-2">Számlázandó</th>
                <th className="px-3 py-2">Dátum</th>
                <th className="px-3 py-2">Munka</th>
                <th className="px-3 py-2">Kérelmező</th>
                <th className="px-3 py-2">Közreműködő</th>
                <th className="px-3 py-2">Idő</th>
                <th className="px-3 py-2">Óradíj</th>
                <th className="px-3 py-2">Nettó</th>
                <th className="px-3 py-2">Állapot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--adm-border)]">
              {group.items.map(item => (
                <ItemRow key={item.id} item={item} preparationId={preparationId} open={open} onChange={replaceItem} />
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}

function ItemRow({ item, preparationId, open, onChange }: {
  item: BillingItem;
  preparationId: string;
  open: boolean;
  onChange: (item: BillingItem) => void;
}) {
  const prefix = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(String(item.billing.billingMinutes));
  const [invoiceText, setInvoiceText] = useState(item.billing.invoiceDescription ?? '');
  const [overrideRate, setOverrideRate] = useState(item.billing.rateOverride ?? '');
  const [overrideReason, setOverrideReason] = useState(item.billing.rateOverrideReason ?? '');
  const [reason, setReason] = useState(item.billing.adjustmentReason ?? '');

  const mutable = open && item.reviewStatus !== 'SOURCE_MISSING';
  const needsAck = item.reviewStatus === 'REVIEW_REQUIRED' || item.reviewStatus === 'NON_BILLABLE';
  const dimmed = !item.billing.included;

  async function save(patch: Parameters<typeof patchBillingItem>[2]) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      onChange(await patchBillingItem(preparationId, item.id, patch));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A sor mentése nem sikerült.');
    } finally {
      setSaving(false);
    }
  }

  function saveForm(event: React.FormEvent) {
    event.preventDefault();
    const parsedMinutes = Number(minutes);
    void save({
      billingMinutes: Number.isInteger(parsedMinutes) ? parsedMinutes : item.billing.billingMinutes,
      invoiceDescription: invoiceText,
      rateOverride: overrideRate.trim() === '' ? null : overrideRate.trim().replace(',', '.'),
      rateOverrideReason: overrideReason,
      adjustmentReason: reason,
    });
  }

  return (
    <>
      <tr className={dimmed ? 'opacity-60' : undefined}>
        <td className="px-3 py-2">
          <input type="checkbox" checked={item.billing.included} disabled={!open || saving}
            aria-label={`Sor számlázása ${item.source.workDate}`}
            onChange={e => void save({ included: e.target.checked })} />
        </td>
        <td className="px-3 py-2 whitespace-nowrap">{item.source.workDate}</td>
        <td className="px-3 py-2">{item.billing.invoiceDescription ?? item.source.description ?? '—'}</td>
        <td className="px-3 py-2">{item.source.requester?.name ?? '—'}</td>
        <td className="px-3 py-2">{item.source.worker.name ?? '—'}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          {formatMinutes(item.billing.billingMinutes)}{item.billing.billingMinutes !== item.source.minutes ? ` / ${formatMinutes(item.source.minutes)}` : ''}
        </td>
        <td className="px-3 py-2 whitespace-nowrap" title={rateScopeLabel(item)}>
          {formatRate(item.billing.effectiveHourlyRate)}
        </td>
        <td className="px-3 py-2 whitespace-nowrap font-semibold">{formatNetAmount(item.billing.netAmount)}</td>
        <td className="px-3 py-2">
          <span className={`text-xs ${item.reviewStatus === 'OK' ? 'text-[var(--adm-text-muted)]' : 'text-amber-700'}`}>
            {reviewStatusLabel[item.reviewStatus]}
          </span>
        </td>
      </tr>
      <tr>
        <td colSpan={9} className="px-3 pb-3">
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--adm-text-muted)]">Részletek és módosítás</summary>
            <div className="mt-2 grid gap-3 rounded border border-[var(--adm-border)] p-3 md:grid-cols-2">
              <dl className="space-y-1">
                <div><dt className="inline font-semibold">Ügy: </dt><dd className="inline">{item.source.case ? `${item.source.case.caseNumber ?? ''} ${item.source.case.title ?? ''}` : '—'}</dd></div>
                <div><dt className="inline font-semibold">Feladat: </dt><dd className="inline">{item.source.task?.title ?? '—'}</dd></div>
                <div><dt className="inline font-semibold">Munkatípus: </dt><dd className="inline">{item.source.workType}</dd></div>
                <div><dt className="inline font-semibold">Belső osztály: </dt><dd className="inline">{item.source.department?.name ?? '—'}</dd></div>
                <div><dt className="inline font-semibold">Hozzárendelés: </dt><dd className="inline">{item.attributionKind}</dd></div>
                <div><dt className="inline font-semibold">Díj forrása: </dt><dd className="inline">{rateScopeLabel(item)}{item.rate.rateVersionId ? ` · ${item.rate.rateVersionId.slice(0, 8)}` : ''}</dd></div>
                <div><dt className="inline font-semibold">Rögzített: </dt><dd className="inline">{formatMinutes(item.source.minutes)} óra · {item.source.billable ? 'számlázható' : 'nem számlázható'}</dd></div>
                {item.billing.reviewedAt && <div><dt className="inline font-semibold">Ellenőrizve: </dt><dd className="inline">{item.billing.reviewedAt.slice(0, 10)}</dd></div>}
              </dl>
              {mutable ? (
                <form onSubmit={saveForm} className="space-y-2">
                  <label className="block">Számlázási szöveg
                    <input value={invoiceText} disabled={saving} onChange={e => setInvoiceText(e.target.value)} className={input} />
                  </label>
                  <div className="flex gap-2">
                    <label className="block flex-1">Számlázott perc (legfeljebb {item.source.minutes})
                      <input type="number" min={0} max={item.source.minutes} value={minutes} disabled={saving}
                        onChange={e => setMinutes(e.target.value)} className={input} />
                    </label>
                    <label className="block flex-1">Egyedi számlázási óradíj (HUF/óra)
                      <input inputMode="decimal" value={overrideRate} disabled={saving} placeholder={item.rate.hourlyRate ?? 'nincs'}
                        onChange={e => setOverrideRate(e.target.value)} className={input} />
                    </label>
                  </div>
                  <label className="block">Indoklás (időcsökkentéshez / egyedi díjhoz kötelező)
                    <input value={reason} disabled={saving} onChange={e => setReason(e.target.value)} className={input} />
                  </label>
                  {overrideRate.trim() !== '' && (
                    <label className="block">Egyedi díj indoklása
                      <input value={overrideReason} disabled={saving} onChange={e => setOverrideReason(e.target.value)} className={input} />
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className={button} disabled={saving}>{saving ? 'Mentés…' : 'Sor mentése'}</button>
                    {needsAck && <button type="button" className={button} disabled={saving} onClick={() => void save({ markReviewed: true })}>Felülvizsgálva</button>}
                    {item.reviewStatus === 'STALE' && (
                      <button type="button" className={button} disabled={saving}
                        onClick={async () => {
                          setSaving(true); setError(null);
                          try {
                            const result = await resyncBillingItem(preparationId, item.id);
                            onChange(result.item);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : 'A frissítés nem sikerült.');
                          } finally { setSaving(false); }
                        }}>
                        Frissítés a forrásból
                      </button>
                    )}
                  </div>
                  {error && <div role="alert" className="text-sm text-red-700">{error}</div>}
                </form>
              ) : (
                <p className="text-[var(--adm-text-muted)]">{open ? 'A forrás törölve — a sor nem módosítható, csak kizárható.' : 'A lezárt előkészítés nem módosítható.'}</p>
              )}
            </div>
          </details>
        </td>
      </tr>
    </>
  );
}
