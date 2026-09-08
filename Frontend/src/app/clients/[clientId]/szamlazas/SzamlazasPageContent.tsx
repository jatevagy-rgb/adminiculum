"use client";

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, getCurrentUser } from '@/lib/api';
import {
  createBillingPreparation,
  listBillingPreparations,
  type BillingPreparationSummary,
} from '@/lib/billingPreparationsApi';
import { formatNetAmount, formatMinutes } from '@/lib/billingPreparationPresentation';
import { rateToday } from '@/lib/hourlyRatePresentation';

/** Default period: previous calendar month, computed in the Europe/Budapest calendar. */
function defaultPeriod(): { start: string; end: string } {
  const today = rateToday();
  const first = new Date(`${today.slice(0, 8)}01T00:00:00.000Z`);
  first.setUTCMonth(first.getUTCMonth() - 1);
  const start = first.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export default function SzamlazasPageContent({ clientId }: { clientId: string }) {
  const prefix = useId();
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preparations, setPreparations] = useState<BillingPreparationSummary[]>([]);
  const defaults = defaultPeriod();
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const user = await getCurrentUser();
      if (!['ADMIN', 'PARTNER'].includes(user.role)) { setForbidden(true); return; }
      setPreparations(await listBillingPreparations(clientId));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) setForbidden(true);
      else setError('A számlázási adatok most nem tölthetők be.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createBillingPreparation({ clientId, periodStart, periodEnd });
      router.push(`/clients/${encodeURIComponent(clientId)}/szamlazas/${encodeURIComponent(result.preparation.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Az előkészítés létrehozása nem sikerült.');
      setCreating(false);
    }
  }

  if (loading) return <main className="p-6 text-sm text-[var(--adm-text-muted)]">Betöltés…</main>;
  if (forbidden) return <main className="p-6 text-sm">A számlázási előkészítés megtekintéséhez adminisztrátor vagy partner jogosultság szükséges.</main>;

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Számlázás előkészítése</h1>
        <Link href={`/clients/${encodeURIComponent(clientId)}`} className="text-xs text-[var(--adm-ochre-600)]">← Ügyfél adatlap</Link>
      </div>

      <section className="rounded-lg border border-[var(--adm-border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Új előkészítés időszakra</h2>
        <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
          A kiválasztott időszak (munkanapok szerint, határok bezárva) munkaóra-tételeiből felülvizsgálati munkafelület készül.
          Egy időszakhoz egyszerre egy nyitott előkészítés tartozhat.
        </p>
        <form onSubmit={create} className="mt-3 flex flex-wrap items-end gap-3">
          <label htmlFor={`${prefix}-start`} className="text-xs">Kezdő nap
            <input id={`${prefix}-start`} type="date" required value={periodStart} disabled={creating}
              onChange={e => setPeriodStart(e.target.value)}
              className="mt-1 block rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm" />
          </label>
          <label htmlFor={`${prefix}-end`} className="text-xs">Záró nap
            <input id={`${prefix}-end`} type="date" required min={periodStart} value={periodEnd} disabled={creating}
              onChange={e => setPeriodEnd(e.target.value)}
              className="mt-1 block rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm" />
          </label>
          <button type="submit" disabled={creating}
            className="rounded border border-[var(--adm-border)] px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 disabled:opacity-50">
            {creating ? 'Készül…' : 'Előkészítés megnyitása'}
          </button>
        </form>
        {error && <div role="alert" className="mt-2 text-sm text-red-700">{error}</div>}
      </section>

      <section className="rounded-lg border border-[var(--adm-border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Korábbi előkészítések</h2>
        {preparations.length === 0 && <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Még nincs előkészítés ehhez az ügyfélhez.</p>}
        <ul className="mt-2 divide-y divide-[var(--adm-border)]">
          {preparations.map(prep => (
            <li key={prep.id}>
              <Link href={`/clients/${encodeURIComponent(clientId)}/szamlazas/${encodeURIComponent(prep.id)}`}
                className="flex items-center justify-between py-2 text-sm group">
                <span>{prep.periodStart} – {prep.periodEnd}</span>
                <span className="flex items-center gap-3 text-xs text-[var(--adm-text-muted)]">
                  <span>{prep.status === 'OPEN' ? 'Nyitott' : 'Lezárt'}</span>
                  {typeof prep.itemCount === 'number' && <span>{prep.itemCount} sor</span>}
                  {prep.includedNetAmount && <span>{formatNetAmount(prep.includedNetAmount)}</span>}
                  <span className="text-[var(--adm-ochre-600)] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
