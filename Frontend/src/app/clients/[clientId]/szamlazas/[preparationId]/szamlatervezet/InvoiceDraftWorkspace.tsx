"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, getCurrentUser } from '@/lib/api';
import {
  createInvoiceDraft,
  downloadInvoiceDraftPdf,
  patchInvoiceDraft,
  patchInvoiceDraftLine,
  type InvoiceDraft,
  type VatTreatment,
} from '@/lib/invoiceDraftsApi';

const button = 'rounded border border-[var(--adm-border)] px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';
const input = 'mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm';

const VAT_OPTIONS: { value: VatTreatment; label: string }[] = [
  { value: 'NORMAL_VAT', label: 'Normál áfa' },
  { value: 'TAX_EXEMPT', label: 'Adómentes' },
  { value: 'REVERSE_CHARGE', label: 'Fordított adózás' },
  { value: 'OUT_OF_SCOPE', label: 'ÁFA hatályán kívül' },
];

function huf(value: string | null): string {
  if (value === null) return '—';
  const dot = value.lastIndexOf('.');
  const whole = dot < 0 ? value : value.slice(0, dot);
  const fraction = dot < 0 ? '00' : value.slice(dot + 1).padEnd(2, '0').slice(0, 2);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction === '00' ? `${grouped} Ft` : `${grouped},${fraction} Ft`;
}

export default function InvoiceDraftWorkspace({ clientId, preparationId }: { clientId: string; preparationId: string }) {
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState('');
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [lineText, setLineText] = useState('');
  const [form, setForm] = useState({
    performanceDate: '', paymentDueDate: '', paymentMethod: '',
    vatTreatment: 'NORMAL_VAT' as VatTreatment, vatRate: '', note: '',
    customerName: '', customerAddress: '', customerTaxNumber: '', customerVatNumber: '',
  });

  const applyDraft = useCallback((next: InvoiceDraft) => {
    setDraft(next);
    setForm({
      performanceDate: next.performanceDate ?? '',
      paymentDueDate: next.paymentDueDate ?? '',
      paymentMethod: next.paymentMethod ?? '',
      vatTreatment: next.vatTreatment,
      vatRate: next.vatRate ?? '',
      note: next.note ?? '',
      customerName: next.customer.name ?? '',
      customerAddress: next.customer.address ?? '',
      customerTaxNumber: next.customer.taxNumber ?? '',
      customerVatNumber: next.customer.vatNumber ?? '',
    });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const user = await getCurrentUser();
      if (!['ADMIN', 'PARTNER'].includes(user.role)) { setForbidden(true); setLoading(false); return; }
      // Creating a draft is idempotent per preparation: returns the existing one.
      const result = await createInvoiceDraft({ billingPreparationId: preparationId });
      applyDraft(result.draft);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) setForbidden(true);
      else if (e instanceof ApiError && (e.status === 404 || e.status === 409)) { setNotFound(true); setError(e.message); }
      else setError(e instanceof ApiError ? e.message : 'A számlatervezet most nem tölthető be.');
    } finally {
      setLoading(false);
    }
  }, [preparationId, applyDraft]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    setNotice('');
    try {
      const result = await patchInvoiceDraft(draft.id, {
        performanceDate: form.performanceDate || null,
        paymentDueDate: form.paymentDueDate || null,
        paymentMethod: form.paymentMethod || null,
        vatTreatment: form.vatTreatment,
        vatRate: form.vatRate || null,
        note: form.note || null,
        customerName: form.customerName || null,
        customerAddress: form.customerAddress || null,
        customerTaxNumber: form.customerTaxNumber || null,
        customerVatNumber: form.customerVatNumber || null,
      });
      applyDraft(result.draft);
      setNotice('Tervezet mentve.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'A mentés nem sikerült.');
    } finally {
      setSaving(false);
    }
  }

  async function saveLine(lineId: string) {
    if (!draft) return;
    try {
      const result = await patchInvoiceDraftLine(draft.id, lineId, lineText);
      applyDraft(result.draft);
      setEditingLine(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'A sor mentése nem sikerült.');
    }
  }

  async function downloadPdf() {
    if (!draft || downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const { blob, filename } = await downloadInvoiceDraftPdf(draft.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'szamlatervezet.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'A számlatervezet PDF letöltése nem sikerült.');
      if (e instanceof ApiError && e.code === 'INVOICE_DRAFT_INCOMPLETE') await load();
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <main className="p-6 text-sm text-[var(--adm-text-muted)]">Betöltés…</main>;
  if (forbidden) return <main className="p-6 text-sm">A számlatervezet megtekintéséhez adminisztrátor vagy partner jogosultság szükséges.</main>;
  if (notFound || !draft) return <main className="p-6 text-sm" role="alert">{error ?? 'A számlatervezet nem készíthető el ehhez az előkészítéshez.'} <Link className="text-[var(--adm-ochre-600)]" href={`/clients/${encodeURIComponent(clientId)}/szamlazas/${encodeURIComponent(preparationId)}`}>Vissza az előkészítéshez</Link></main>;

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Számlatervezet — {draft.customer.name ?? ''}</h1>
          <p className="text-xs text-[var(--adm-text-muted)]">
            NEM SZÁMLA — a tervezet a lezárt számlázási előkészítés pillanatképéből készült; későbbi tétel- vagy ügyfélmódosítás nem változtatja meg.
          </p>
        </div>
        <Link href={`/clients/${encodeURIComponent(clientId)}/szamlazas/${encodeURIComponent(preparationId)}`} className="text-xs text-[var(--adm-ochre-600)]">← Számlázási előkészítés</Link>
      </div>

      {draft.missing.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">A számlatervezethez még hiányzik:</p>
          <ul className="mt-1 list-disc pl-5">
            {draft.missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      <section className="rounded-lg border border-[var(--adm-border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Szállító (rögzített pillanatkép)</h2>
        <p className="mt-1 text-sm">{draft.issuer.legalName ?? '—'}</p>
        <p className="text-xs text-[var(--adm-text-muted)]">
          {[draft.issuer.address, draft.issuer.taxNumber ? `Adószám: ${draft.issuer.taxNumber}` : null, draft.issuer.bankAccountNumber ? `Bankszámla: ${draft.issuer.bankAccountNumber}` : null].filter(Boolean).join(' · ') || '—'}
        </p>
        <Link href="/settings/szamlazas" className="mt-1 inline-block text-xs text-[var(--adm-ochre-600)]">Számlázói profil módosítása a beállításokban</Link>
      </section>

      <section className="rounded-lg border border-[var(--adm-border)] bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold">Vevő (pillanatkép — szerkeszthető)</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs">Név
            <input className={input} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          </label>
          <label className="text-xs">Adószám
            <input className={input} value={form.customerTaxNumber} onChange={(e) => setForm({ ...form, customerTaxNumber: e.target.value })} />
          </label>
          <label className="text-xs">Cím
            <input className={input} value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} />
          </label>
          <label className="text-xs">Közösségi adószám
            <input className={input} value={form.customerVatNumber} onChange={(e) => setForm({ ...form, customerVatNumber: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--adm-border)] bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold">Tervezet adatai</h2>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs">Teljesítés dátuma
            <input type="date" className={input} value={form.performanceDate} onChange={(e) => setForm({ ...form, performanceDate: e.target.value })} />
          </label>
          <label className="text-xs">Fizetési határidő
            <input type="date" className={input} value={form.paymentDueDate} onChange={(e) => setForm({ ...form, paymentDueDate: e.target.value })} />
          </label>
          <label className="text-xs">Fizetési mód
            <input className={input} value={form.paymentMethod} placeholder="pl. átutalás" onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} />
          </label>
          <label className="text-xs">ÁFA-kezelés
            <select className={input} value={form.vatTreatment} onChange={(e) => setForm({ ...form, vatTreatment: e.target.value as VatTreatment })}>
              {VAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {form.vatTreatment === 'NORMAL_VAT' && (
            <label className="text-xs">ÁFA kulcs (%)
              <input className={input} value={form.vatRate} placeholder="pl. 27" onChange={(e) => setForm({ ...form, vatRate: e.target.value })} />
            </label>
          )}
          <label className="text-xs">Pénznem
            <input className={input} value={draft.currency} disabled />
          </label>
        </div>
        <label className="block text-xs">Megjegyzés
          <input className={input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
      </section>

      <section className="rounded-lg border border-[var(--adm-border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Tételsorok (a lezárt előkészítésből)</h2>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--adm-border)] text-left text-[var(--adm-text-muted)]">
              <th className="py-1 pr-2">Megnevezés</th>
              <th className="py-1 pr-2 text-right">Mennyiség</th>
              <th className="py-1 pr-2">Egység</th>
              <th className="py-1 pr-2 text-right">Nettó</th>
              <th className="py-1 pr-2 text-right">ÁFA</th>
              <th className="py-1 text-right">Bruttó</th>
            </tr>
          </thead>
          <tbody>
            {draft.lines.map((line) => (
              <tr key={line.id} className="border-b border-[var(--adm-border)]">
                <td className="py-1 pr-2">
                  {editingLine === line.id ? (
                    <input
                      className={input}
                      value={lineText}
                      autoFocus
                      onChange={(e) => setLineText(e.target.value)}
                      onBlur={() => void saveLine(line.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void saveLine(line.id); if (e.key === 'Escape') setEditingLine(null); }}
                    />
                  ) : (
                    <button type="button" className="text-left underline decoration-dotted" title="Megnevezés szerkesztése"
                      onClick={() => { setEditingLine(line.id); setLineText(line.description); }}>
                      {line.description}
                    </button>
                  )}
                </td>
                <td className="py-1 pr-2 text-right">{line.quantity}</td>
                <td className="py-1 pr-2">{line.unit}</td>
                <td className="py-1 pr-2 text-right">{huf(line.netAmount)}</td>
                <td className="py-1 pr-2 text-right">{huf(line.vatAmount)}</td>
                <td className="py-1 text-right">{huf(line.grossAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-right text-sm">
          <p>Nettó összesen: <strong>{huf(draft.totals.netAmount)}</strong></p>
          <p>ÁFA összesen: <strong>{huf(draft.totals.vatAmount)}</strong></p>
          <p>Bruttó végösszeg: <strong>{huf(draft.totals.grossAmount)}</strong></p>
        </div>
      </section>

      <div className="flex gap-2">
        <button type="button" className={button} disabled={saving} onClick={save}>{saving ? 'Mentés…' : 'Tervezet mentése'}</button>
        <button type="button" className={button} disabled={downloading} onClick={downloadPdf}>{downloading ? 'PDF készítése…' : 'Számlatervezet PDF'}</button>
      </div>
      {notice && <p role="status" className="text-xs text-[var(--adm-text-muted)]">{notice}</p>}
      {error && <div role="alert" className="text-sm text-red-700">{error}</div>}
    </main>
  );
}
