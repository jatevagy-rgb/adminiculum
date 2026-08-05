"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  createIntake,
  CustomerIntake,
  CustomerOrganizationUnit,
  getIntake,
  listMemberUnits,
  listOwnIntakes,
  respondToIntake,
  submitIntake,
  updateIntake,
  withdrawIntake,
} from '@/lib/clientIntakeApi';
import {
  attachmentStateLabel,
  buildCreateIntakePayload,
  buildUpdateIntakePayload,
  INTAKE_URGENCIES,
  intakeErrorMessage,
  intakeStatusTone,
} from '@/lib/clientIntakeShared';
import { useCustomerPortalAuth } from './useCustomerPortalAuth';

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

function Frame({ children }: { children: React.ReactNode }) {
  const auth = useCustomerPortalAuth();
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf8f3] text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/portal" className="font-serif text-2xl font-semibold tracking-tight text-stone-950">Adminiculum</Link>
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="Ügyfélportál navigáció">
            <Link className="rounded-full px-3 py-2 text-stone-700 hover:bg-stone-100" href="/portal">Főoldal</Link>
            <Link className="rounded-full bg-stone-100 px-3 py-2 font-medium text-stone-900" href="/portal/megkeresesek">Megkeresések</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {auth === 'loading' ? <Card>Betöltés…</Card> : null}
        {auth === 'login' ? <Card><h1 className="text-2xl font-semibold">Bejelentkezés szükséges</h1><p className="mt-3 text-stone-700">A megkeresések megtekintéséhez jelentkezzen be.</p><Link href="/portal/login" className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-white">Bejelentkezés</Link></Card> : null}
        {auth === 'error' ? <Card>A portál jelenleg nem érhető el. Kérjük, próbálja újra később.</Card> : null}
        {auth === 'ready' ? children : null}
      </div>
    </main>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm ${className}`}>{children}</section>;
}

function StatusPill({ status }: { status: { code: string; label: string } }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${intakeStatusTone(status.code)}`}>{status.label}</span>;
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="mt-3 rounded-2xl bg-[#fdf3e2] p-3 text-sm text-[#7a5f18]">{message}</p>;
}

function errorMessageFrom(error: unknown): string {
  if (error instanceof ApiError) return intakeErrorMessage(error.code);
  return intakeErrorMessage(undefined);
}

/* -------------------------------------------------------------------------- */
/* List                                                                        */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 20;

export function CustomerIntakeList() {
  const [page, setPage] = useState<{ items: CustomerIntake[]; total: number; offset: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listOwnIntakes(PAGE_SIZE, offset);
      setPage({ items: result.items, total: result.total, offset: result.offset });
      setError(null);
    } catch (e) {
      setError(errorMessageFrom(e));
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Frame>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Megkeresések</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-950">Megkereséseim</h1>
        </div>
        <Link href="/portal/megkeresesek/uj" className="rounded-full bg-[#3e2f29] px-5 py-3 font-semibold text-white transition hover:bg-[#b85f4b] focus:outline-none focus:ring-4 focus:ring-[#d99b8e]/50">Új megkeresés</Link>
      </div>
      <ErrorNote message={error} />
      {loading && !page ? <Card>Betöltés…</Card> : null}
      {page && page.items.length === 0 ? <Card>Még nincs megkeresése. Indítson egy újat az „Új megkeresés” gombbal.</Card> : null}
      <div className="grid gap-3">
        {page?.items.map((intake) => (
          <Link key={intake.reference} href={`/portal/megkeresesek/${encodeURIComponent(intake.reference)}`} className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-[#b99b45] focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words text-lg font-semibold text-stone-950">{intake.subject}</h3>
                <p className="mt-1 text-sm text-stone-600">{intake.organizationGroupName ? `${intake.organizationGroupName} · ` : ''}Frissítve: {fmtDate(intake.updatedAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusPill status={intake.status} />
                {intake.status.code === 'more-information-required' ? <span className="text-xs text-[#8a3f1f]">Válaszát várjuk</span> : null}
                {intake.linkedPublicCaseReference ? <span className="text-xs text-emerald-700">Ügy elérhető</span> : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {page && page.total > PAGE_SIZE ? (
        <div className="mt-6 flex items-center justify-between text-sm">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="rounded-full border border-stone-300 px-4 py-2 disabled:opacity-40">Előző</button>
          <span className="text-stone-600">{offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} / {page.total}</span>
          <button disabled={offset + PAGE_SIZE >= page.total} onClick={() => setOffset(offset + PAGE_SIZE)} className="rounded-full border border-stone-300 px-4 py-2 disabled:opacity-40">Következő</button>
        </div>
      ) : null}
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Create                                                                      */
/* -------------------------------------------------------------------------- */

export function CustomerIntakeCreate() {
  const router = useRouter();
  const [units, setUnits] = useState<CustomerOrganizationUnit[]>([]);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [unitId, setUnitId] = useState('');
  const [urgency, setUrgency] = useState('NORMAL');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void listMemberUnits().then((r) => setUnits(r.items)).catch(() => setUnits([])); }, []);

  const canSubmit = subject.trim().length > 0 && description.trim().length > 0 && !busy;

  const create = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const payload = buildCreateIntakePayload({ subject, description, organizationGroupId: unitId || null, urgency, requestedDeadline: deadline || null });
      const created = await createIntake(payload);
      router.push(`/portal/megkeresesek/${encodeURIComponent(created.reference)}`);
    } catch (e) {
      setError(errorMessageFrom(e));
      setBusy(false);
    }
  };

  return (
    <Frame>
      <div className="mb-6">
        <Link href="/portal/megkeresesek" className="text-sm text-stone-600 hover:underline">← Vissza a megkeresésekhez</Link>
        <h1 className="mt-2 text-3xl font-semibold text-stone-950">Új megkeresés</h1>
        <p className="mt-2 text-stone-700">Írja le röviden, miben kéri az iroda segítségét. A megkeresést az iroda dolgozza fel.</p>
      </div>
      <Card>
        <div className="grid gap-4">
          <label className="block text-sm">
            <span className="font-medium text-stone-800">Tárgy *</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={240} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-stone-800">Leírás *</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={6000} className="mt-1 min-h-32 w-full rounded-xl border border-stone-300 px-3 py-2" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-stone-800">Szervezeti egység</span>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2">
                <option value="">Nincs megadva</option>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-stone-800">Sürgősség</span>
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2">
                {INTAKE_URGENCIES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-stone-800">Kért határidő</span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 sm:w-64" />
          </label>
          <ErrorNote message={error} />
          <div className="flex flex-wrap gap-3">
            <button disabled={!canSubmit} onClick={create} className="rounded-full bg-stone-950 px-5 py-3 text-white disabled:opacity-50">Piszkozat mentése</button>
            <Link href="/portal/megkeresesek" className="rounded-full border border-stone-300 px-5 py-3">Mégse</Link>
          </div>
          <p className="text-xs text-stone-500">A mentés után a megkeresés piszkozatként jön létre; a beküldés külön, megerősítéssel történik.</p>
        </div>
      </Card>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                       */
/* -------------------------------------------------------------------------- */

export function CustomerIntakeDetail({ intakeId }: { intakeId: string }) {
  const [intake, setIntake] = useState<CustomerIntake | null>(null);
  const [revision] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setIntake(await getIntake(intakeId));
      setError(null);
    } catch (e) {
      setError(errorMessageFrom(e));
    }
  }, [intakeId]);

  useEffect(() => { void load(); }, [load]);

  const runMutation = async (fn: () => Promise<CustomerIntake>, successNotice?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await fn();
      setIntake(updated);
      if (successNotice) setNotice(successNotice);
    } catch (e) {
      setError(errorMessageFrom(e));
      await load();
    } finally {
      setBusy(false);
      setConfirmSubmit(false);
      setConfirmWithdraw(false);
    }
  };

  if (error && !intake) {
    return <Frame><Card><ErrorNote message={error} /><Link href="/portal/megkeresesek" className="mt-4 inline-block text-sm text-stone-600 hover:underline">← Vissza</Link></Card></Frame>;
  }
  if (!intake) return <Frame><Card>Betöltés…</Card></Frame>;

  const a = intake.allowedActions;
  const infoRequest = intake.informationRequest;

  return (
    <Frame>
      <div className="mb-6">
        <Link href="/portal/megkeresesek" className="text-sm text-stone-600 hover:underline">← Vissza a megkeresésekhez</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="break-words text-3xl font-semibold text-stone-950">{intake.subject}</h1>
          <StatusPill status={intake.status} />
        </div>
      </div>

      {notice ? <p role="status" className="mb-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
      <ErrorNote message={error} />

      <Card className="mb-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Szervezeti egység</dt><dd className="mt-1 text-stone-800">{intake.organizationGroupName || 'Nincs megadva'}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Beküldve</dt><dd className="mt-1 text-stone-800">{fmtDate(intake.submittedAt)}</dd></div>
        </dl>
        <div className="mt-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Leírás</dt>
          <p className="mt-1 whitespace-pre-wrap break-words text-stone-800">{intake.description}</p>
        </div>
        {intake.officeResponse ? <div className="mt-4 rounded-2xl bg-stone-50 p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Az iroda üzenete</dt><p className="mt-1 whitespace-pre-wrap break-words text-stone-800">{intake.officeResponse}</p></div> : null}
      </Card>

      {/* Attachments */}
      {intake.attachments.length ? (
        <Card className="mb-4">
          <h2 className="text-lg font-semibold text-stone-950">Csatolmányok</h2>
          <ul className="mt-3 space-y-2">
            {intake.attachments.map((att) => (
              <li key={att.reference} className="flex items-center justify-between rounded-xl border border-stone-200 p-3 text-sm">
                <span className="truncate text-stone-800">{att.fileName}</span>
                <span className="text-xs text-stone-600">{attachmentStateLabel(att.state)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">A fájl csak sikeres biztonsági ellenőrzés után használható fel az ügyben.</p>
        </Card>
      ) : null}

      {/* Edit (draft only) */}
      {a.update ? <DraftEditor intake={intake} busy={busy} onSaved={(u) => { setIntake(u); setNotice('A piszkozat elmentve.'); }} onError={(m) => setError(m)} /> : null}

      {/* More-information response */}
      {a.respond && infoRequest ? (
        <Card className="mb-4">
          <h2 className="text-lg font-semibold text-[#8a3f1f]">További információ szükséges</h2>
          <p className="mt-1 font-medium text-stone-900">{infoRequest.title}</p>
          {infoRequest.instructions ? <p className="mt-1 text-sm text-stone-700">{infoRequest.instructions}</p> : null}
          <div className="mt-4 space-y-3">
            {infoRequest.fields.map((field) => (
              <label key={field.reference} className="block text-sm">
                <span className="font-medium text-stone-800">{field.label}{field.required ? ' *' : ''}</span>
                {field.helpText ? <span className="block text-xs text-stone-500">{field.helpText}</span> : null}
                <input value={answers[field.reference] || ''} onChange={(e) => setAnswers((prev) => ({ ...prev, [field.reference]: e.target.value }))} maxLength={field.maxLength || 2000} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2" />
              </label>
            ))}
          </div>
          <button
            disabled={busy}
            onClick={() => void runMutation(() => respondToIntake(intake.reference, infoRequest.reference, infoRequest.fields.map((f) => ({ label: f.label, value: (answers[f.reference] || '').trim() })).filter((x) => x.value)), 'Válaszát megküldtük az irodának.')}
            className="mt-4 rounded-full bg-stone-950 px-5 py-3 text-white disabled:opacity-50"
          >Válasz beküldése</button>
        </Card>
      ) : null}

      {/* Result: Case link only when backend confirms grant+publication */}
      {['linked', 'converted', 'closed'].includes(intake.status.code) ? (
        <Card className="mb-4">
          {intake.linkedPublicCaseReference ? (
            <>
              <h2 className="text-lg font-semibold text-emerald-800">Az ügyfélfelületi hozzáférés közzétéve</h2>
              <Link href={`/portal/megkeresesek/../org/${encodeURIComponent(intake.linkedPublicCaseReference)}`} className="mt-3 inline-flex rounded-full bg-emerald-700 px-5 py-3 font-semibold text-white">Ügy megnyitása</Link>
            </>
          ) : (
            <p className="text-stone-700">Az ügyet az iroda rögzítette. Az ügyfélfelületi hozzáférés még nincs közzétéve.</p>
          )}
        </Card>
      ) : null}

      {/* Actions: submit / withdraw */}
      {(a.submit || a.withdraw) ? (
        <Card>
          <div className="flex flex-wrap gap-3">
            {a.submit ? (
              confirmSubmit ? (
                <div className="w-full rounded-2xl bg-stone-50 p-4">
                  <p className="text-sm text-stone-800">A megkeresést elküldjük az irodának. Ezt követően már nem szerkesztheti szabadon, és az iroda további információt kérhet.</p>
                  <div className="mt-3 flex gap-3">
                    <button disabled={busy} onClick={() => void runMutation(() => submitIntake(intake.reference, revision), 'A megkeresést beküldtük.')} className="rounded-full bg-stone-950 px-5 py-2 text-white disabled:opacity-50">Beküldés megerősítése</button>
                    <button disabled={busy} onClick={() => setConfirmSubmit(false)} className="rounded-full border border-stone-300 px-5 py-2">Mégse</button>
                  </div>
                </div>
              ) : <button onClick={() => setConfirmSubmit(true)} className="rounded-full bg-[#3e2f29] px-5 py-3 font-semibold text-white hover:bg-[#b85f4b]">Megkeresés beküldése</button>
            ) : null}
            {a.withdraw ? (
              confirmWithdraw ? (
                <div className="w-full rounded-2xl bg-stone-50 p-4">
                  <p className="text-sm text-stone-800">Biztosan visszavonja a megkeresést? Visszavonás után az iroda már nem dolgozza fel.</p>
                  <div className="mt-3 flex gap-3">
                    <button disabled={busy} onClick={() => void runMutation(() => withdrawIntake(intake.reference, revision), 'A megkeresést visszavontuk.')} className="rounded-full bg-stone-800 px-5 py-2 text-white disabled:opacity-50">Visszavonás megerősítése</button>
                    <button disabled={busy} onClick={() => setConfirmWithdraw(false)} className="rounded-full border border-stone-300 px-5 py-2">Mégse</button>
                  </div>
                </div>
              ) : <button onClick={() => setConfirmWithdraw(true)} className="rounded-full border border-stone-300 px-5 py-3">Megkeresés visszavonása</button>
            ) : null}
          </div>
        </Card>
      ) : null}
    </Frame>
  );
}

function DraftEditor({ intake, busy, onSaved, onError }: { intake: CustomerIntake; busy: boolean; onSaved: (u: CustomerIntake) => void; onError: (m: string) => void }) {
  const [subject, setSubject] = useState(intake.subject);
  const [description, setDescription] = useState(intake.description);
  const [saving, setSaving] = useState(false);
  const dirty = subject !== intake.subject || description !== intake.description;

  const save = async () => {
    setSaving(true);
    try {
      const payload = buildUpdateIntakePayload({ subject, description });
      onSaved(await updateIntake(intake.reference, payload));
    } catch (e) {
      onError(e instanceof ApiError ? errorMessageFrom(e) : intakeErrorMessage(undefined));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-4">
      <h2 className="text-lg font-semibold text-stone-950">Piszkozat szerkesztése</h2>
      <div className="mt-3 grid gap-4">
        <label className="block text-sm"><span className="font-medium text-stone-800">Tárgy</span><input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={240} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2" /></label>
        <label className="block text-sm"><span className="font-medium text-stone-800">Leírás</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={6000} className="mt-1 min-h-28 w-full rounded-xl border border-stone-300 px-3 py-2" /></label>
        <div><button disabled={busy || saving || !dirty} onClick={save} className="rounded-full bg-stone-950 px-5 py-2 text-white disabled:opacity-50">Módosítások mentése</button></div>
      </div>
    </Card>
  );
}
