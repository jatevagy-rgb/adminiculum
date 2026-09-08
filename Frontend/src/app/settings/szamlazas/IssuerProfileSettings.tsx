"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, getCurrentUser } from '@/lib/api';
import { getIssuerProfile, putIssuerProfile, type IssuerProfile, type VatTreatment } from '@/lib/invoiceDraftsApi';

const input = 'mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-3 py-2 text-sm';
const button = 'rounded border border-[var(--adm-border)] px-3 py-1.5 text-xs disabled:opacity-50';

const VAT_OPTIONS: { value: VatTreatment; label: string }[] = [
  { value: 'NORMAL_VAT', label: 'Normál áfa' },
  { value: 'TAX_EXEMPT', label: 'Adómentes' },
  { value: 'REVERSE_CHARGE', label: 'Fordított adózás' },
  { value: 'OUT_OF_SCOPE', label: 'ÁFA hatályán kívül' },
];

const TEXT_FIELDS: { key: keyof IssuerProfile; label: string }[] = [
  { key: 'legalName', label: 'Szállító neve (jogi név)' },
  { key: 'address', label: 'Szállító címe' },
  { key: 'taxNumber', label: 'Adószám' },
  { key: 'euVatNumber', label: 'Közösségi adószám' },
  { key: 'registrationNumber', label: 'Cégjegyzékszám / nyilvántartási szám' },
  { key: 'bankName', label: 'Bank neve' },
  { key: 'bankAccountNumber', label: 'Bankszámlaszám' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefon' },
  { key: 'logoPath', label: 'Logó fájl elérési útja (opcionális)' },
];

/** Számlázó (kiállító) profil — a számlatervezetek szállítói pillanatképének forrása. ADMIN csak. */
export default function IssuerProfileSettings() {
  const [profile, setProfile] = useState<IssuerProfile | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      if (user.role !== 'ADMIN') { setForbidden(true); setLoading(false); return; }
      const result = await getIssuerProfile();
      setProfile(result.profile);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setForbidden(true);
      else setError('A számlázói profil most nem tölthető be.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!profile || saving) return;
    setSaving(true);
    setError(null);
    setNotice('');
    try {
      const result = await putIssuerProfile(profile);
      setProfile(result.profile);
      setNotice('Számlázói profil mentve.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'A mentés nem sikerült.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="p-6 text-sm text-[var(--adm-text-muted)]">Betöltés…</main>;
  if (forbidden) return <main className="p-6 text-sm">A számlázói profil beállításához adminisztrátori jogosultság szükséges.</main>;
  if (!profile) return <main className="p-6 text-sm text-red-700" role="alert">{error ?? 'Ismeretlen hiba.'}</main>;

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Számlázói profil</h1>
        <Link href="/settings" className="text-xs text-[var(--adm-ochre-600)]">← Beállítások</Link>
      </div>
      <p className="text-xs text-[var(--adm-text-muted)]">
        Ezeket az adatokat a számlatervezetek a létrehozáskor pillanatképként rögzítik — a későbbi módosítás a már kész tervezeteket nem érinti.
      </p>
      <section className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--adm-border)] bg-white p-4">
        {TEXT_FIELDS.map(({ key, label }) => (
          <label key={key} className="text-xs">
            {label}
            <input
              className={input}
              value={(profile[key] as string | null) ?? ''}
              onChange={(e) => setProfile({ ...profile, [key]: e.target.value || null })}
            />
          </label>
        ))}
        <label className="text-xs">Alapértelmezett áfa-kezelés
          <select className={input} value={profile.defaultVatTreatment}
            onChange={(e) => setProfile({ ...profile, defaultVatTreatment: e.target.value as VatTreatment })}>
            {VAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-xs">Alapértelmezett áfa-kulcs (%)
          <input className={input} value={profile.defaultVatRate ?? ''}
            onChange={(e) => setProfile({ ...profile, defaultVatRate: e.target.value || null })} />
        </label>
        <label className="text-xs">Alapértelmezett fizetési mód
          <input className={input} value={profile.defaultPaymentMethod ?? ''}
            onChange={(e) => setProfile({ ...profile, defaultPaymentMethod: e.target.value || null })} />
        </label>
        <label className="text-xs">Alapértelmezett fizetési határidő (nap)
          <input className={input} type="number" min={0} value={profile.defaultPaymentTermDays ?? ''}
            onChange={(e) => setProfile({ ...profile, defaultPaymentTermDays: e.target.value === '' ? null : Number(e.target.value) })} />
        </label>
      </section>
      <button type="button" className={button} disabled={saving} onClick={save}>{saving ? 'Mentés…' : 'Mentés'}</button>
      {notice && <p role="status" className="text-xs text-[var(--adm-text-muted)]">{notice}</p>}
      {error && <div role="alert" className="text-sm text-red-700">{error}</div>}
    </main>
  );
}
