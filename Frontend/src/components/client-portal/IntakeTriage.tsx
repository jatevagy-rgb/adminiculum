"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { AuthenticatedApp } from '@/components/AuthenticatedApp';
import {
  approvedConversion,
  approveRequesterAccess,
  closeIntake,
  convertNewCase,
  declineIntake,
  getIntakeDetail,
  IntakeQueueItem,
  IntakeTriageDetail,
  linkExistingCase,
  listIntakeQueue,
  publishInitialSnapshot,
  requestMoreInformation,
  startTriage,
} from '@/lib/clientIntakeAdminApi';
import { intakeErrorMessage } from '@/lib/clientIntakeShared';

const REQUESTER_PERMISSIONS = [
  'MATTER_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'UPDATE_READ',
  'MESSAGE_READ', 'MESSAGE_SEND', 'DOCUMENT_UPLOAD', 'CLIENT_TIMELINE_READ',
];
const DEFAULT_REQUESTER_PERMISSIONS = ['MATTER_READ', 'DOCUMENT_READ', 'UPDATE_READ'];

function fmt(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('hu-HU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function msg(error: unknown): string {
  if (error instanceof ApiError) return intakeErrorMessage(error.code, error.message || 'A művelet nem sikerült.');
  return 'A művelet nem sikerült. Kérjük, frissítsen és próbálja újra.';
}

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Beküldve', TRIAGE_IN_PROGRESS: 'Feldolgozás alatt', MORE_INFORMATION_REQUIRED: 'Információ bekérve',
  LINKED_TO_EXISTING_CASE: 'Meglévő ügyhöz kapcsolva', CONVERTED_TO_CASE: 'Üggyé alakítva', DECLINED: 'Elutasítva',
  CLOSED: 'Lezárva', WITHDRAWN: 'Visszavonva', DRAFT: 'Piszkozat',
};

/* -------------------------------------------------------------------------- */
/* Queue                                                                        */
/* -------------------------------------------------------------------------- */

export function IntakeTriageQueue() {
  const [page, setPage] = useState<{ items: IntakeQueueItem[]; total: number } | null>(null);
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listIntakeQueue({ status: status || undefined, limit: 25, offset });
      setPage({ items: result.items, total: result.total });
      setError(null);
    } catch (e) { setError(msg(e)); }
  }, [status, offset]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AuthenticatedApp>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Ügyfélportál</p>
            <h1 className="mt-2 text-3xl font-semibold text-stone-950">Ügyfélmegkeresések</h1>
          </div>
          <select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value); }} className="rounded-xl border border-stone-300 px-3 py-2 text-sm">
            <option value="">Minden állapot</option>
            {['SUBMITTED', 'TRIAGE_IN_PROGRESS', 'MORE_INFORMATION_REQUIRED', 'LINKED_TO_EXISTING_CASE', 'CONVERTED_TO_CASE', 'DECLINED', 'CLOSED'].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        {error ? <p role="alert" className="mb-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr><th className="px-4 py-3">Tárgy</th><th className="px-4 py-3">Állapot</th><th className="px-4 py-3">Sürgősség</th><th className="px-4 py-3">Beküldve</th><th className="px-4 py-3">Kiosztva</th></tr>
            </thead>
            <tbody>
              {page?.items.map((item) => (
                <tr key={item.id} className="border-t border-stone-100 hover:bg-stone-50">
                  <td className="px-4 py-3"><Link className="font-medium text-stone-900 hover:underline" href={`/client-portal-admin/megkeresesek/${encodeURIComponent(item.id)}`}>{item.subject}</Link></td>
                  <td className="px-4 py-3">{STATUS_LABEL[item.status] || item.status}</td>
                  <td className="px-4 py-3">{item.urgency}</td>
                  <td className="px-4 py-3">{fmt(item.submittedAt)}</td>
                  <td className="px-4 py-3">{item.triagedByInternalUserId ? 'Igen' : '—'}</td>
                </tr>
              ))}
              {page && page.items.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-500">Nincs megjeleníthető megkeresés.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {page && page.total > 25 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))} className="rounded-full border border-stone-300 px-4 py-2 disabled:opacity-40">Előző</button>
            <span className="text-stone-600">{offset + 1}–{Math.min(offset + 25, page.total)} / {page.total}</span>
            <button disabled={offset + 25 >= page.total} onClick={() => setOffset(offset + 25)} className="rounded-full border border-stone-300 px-4 py-2 disabled:opacity-40">Következő</button>
          </div>
        ) : null}
      </div>
    </AuthenticatedApp>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                       */
/* -------------------------------------------------------------------------- */

export function IntakeTriageDetailView({ intakeId }: { intakeId: string }) {
  const [detail, setDetail] = useState<IntakeTriageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setDetail(await getIntakeDetail(intakeId)); setError(null); }
    catch (e) { setError(msg(e)); }
  }, [intakeId]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, successNotice: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); setNotice(successNotice); setOpen(null); await load(); }
    catch (e) { setError(msg(e)); await load(); }
    finally { setBusy(false); }
  };

  if (error && !detail) return <AuthenticatedApp><div className="mx-auto max-w-4xl px-4 py-8"><p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p></div></AuthenticatedApp>;
  if (!detail) return <AuthenticatedApp><div className="mx-auto max-w-4xl px-4 py-8 text-stone-500">Betöltés…</div></AuthenticatedApp>;

  const can = (t: string) => detail.availableTransitions.includes(t);
  const rev = detail.revision;

  return (
    <AuthenticatedApp>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link href="/client-portal-admin/megkeresesek" className="text-sm text-stone-600 hover:underline">← Vissza a megkeresésekhez</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="break-words text-3xl font-semibold text-stone-950">{detail.subject}</h1>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-700">{STATUS_LABEL[detail.status] || detail.status}</span>
        </div>

        {notice ? <p role="status" className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-stone-500">Ügyfél</dt><dd className="text-stone-800">{detail.workspace?.name || '—'}</dd></div>
            <div><dt className="text-xs uppercase text-stone-500">Szervezeti egység</dt><dd className="text-stone-800">{detail.organizationGroup?.name || '—'}</dd></div>
            <div><dt className="text-xs uppercase text-stone-500">Kérelmező</dt><dd className="text-stone-800">{detail.requester?.displayName || '—'} <span className="text-stone-500">({detail.requester?.normalizedEmail || '—'})</span></dd></div>
            <div><dt className="text-xs uppercase text-stone-500">Beküldve</dt><dd className="text-stone-800">{fmt(detail.submittedAt)}</dd></div>
          </dl>
          <div className="mt-4"><dt className="text-xs uppercase text-stone-500">Leírás</dt><p className="mt-1 whitespace-pre-wrap break-words text-stone-800">{detail.descriptionSafe}</p></div>
          {detail.linkedCase ? <p className="mt-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-700">Kapcsolt ügy: <b>{detail.linkedCase.caseNumber}</b> — {detail.linkedCase.title}</p> : null}
        </section>

        {/* Attachments with scanner state (internal detail) */}
        {detail.attachments.length ? (
          <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Csatolmányok</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {detail.attachments.map((att) => <li key={att.id} className="flex justify-between rounded-xl border border-stone-200 p-3"><span>{att.fileName}</span><span className="text-stone-600">{att.status}</span></li>)}
            </ul>
          </section>
        ) : null}

        {/* History */}
        <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Életciklus</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {detail.history.map((event) => <li key={event.id} className="flex flex-wrap justify-between gap-2 border-b border-stone-100 pb-2"><span className="text-stone-800">{event.action}</span><span className="text-stone-500">{event.fromStatus || '—'} → {event.toStatus || '—'} · {fmt(event.createdAt)}</span></li>)}
          </ol>
        </section>

        {/* Actions driven by availableTransitions (server-authoritative) */}
        <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Műveletek</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {can('start-triage') ? <button disabled={busy} onClick={() => void act(() => startTriage(detail.id, rev), 'Feldolgozás elindítva.')} className="rounded-full bg-[#3e2f29] px-4 py-2 text-sm text-white disabled:opacity-50">Feldolgozás indítása</button> : null}
            {can('request-more-information') ? <button disabled={busy} onClick={() => setOpen('info')} className="rounded-full border border-stone-300 px-4 py-2 text-sm">További információ kérése</button> : null}
            {can('decline') ? <button disabled={busy} onClick={() => setOpen('decline')} className="rounded-full border border-stone-300 px-4 py-2 text-sm">Elutasítás</button> : null}
            {can('link-existing-case') ? <button disabled={busy} onClick={() => setOpen('link')} className="rounded-full border border-stone-300 px-4 py-2 text-sm">Meglévő ügyhöz kapcsolás</button> : null}
            {can('convert-new-case') ? <button disabled={busy} onClick={() => setOpen('convert')} className="rounded-full border border-stone-300 px-4 py-2 text-sm">Új ügy létrehozása</button> : null}
            {can('approve-requester-access') ? <button disabled={busy} onClick={() => setOpen('grant')} className="rounded-full border border-stone-300 px-4 py-2 text-sm">Kérelmezői hozzáférés</button> : null}
            {can('publish-initial-snapshot') ? <button disabled={busy} onClick={() => setOpen('publish')} className="rounded-full border border-stone-300 px-4 py-2 text-sm">Első közzététel</button> : null}
            {can('close') ? <button disabled={busy} onClick={() => void act(() => closeIntake(detail.id, rev), 'A megkeresés lezárva.')} className="rounded-full border border-stone-300 px-4 py-2 text-sm">Megkeresés lezárása</button> : null}
          </div>

          {open === 'info' ? <RequestInfoPanel busy={busy} onCancel={() => setOpen(null)} onSubmit={(body) => act(() => requestMoreInformation(detail.id, { ...body, expectedRevision: rev }), 'Információkérés közzétéve.')} /> : null}
          {open === 'decline' ? <DeclinePanel busy={busy} onCancel={() => setOpen(null)} onSubmit={(body) => act(() => declineIntake(detail.id, { ...body, expectedRevision: rev }), 'A megkeresés elutasítva.')} /> : null}
          {open === 'link' ? <LinkPanel busy={busy} onCancel={() => setOpen(null)} onSubmit={(caseId) => act(() => linkExistingCase(detail.id, { caseId, expectedRevision: rev }), 'A megkeresést ügyhöz kapcsoltuk. A hozzáférés és közzététel külön lépés.')} /> : null}
          {open === 'convert' ? <ConvertPanel busy={busy} onCancel={() => setOpen(null)} onSubmit={(newCase) => act(() => convertNewCase(detail.id, { newCase, expectedRevision: rev }), 'Új ügy létrehozva. A hozzáférés és közzététel külön lépés.')} /> : null}
          {open === 'grant' ? <GrantPanel busy={busy} onCancel={() => setOpen(null)} onSubmit={(permissions) => act(() => approveRequesterAccess(detail.id, permissions), 'Kérelmezői hozzáférés létrehozva.')} /> : null}
          {open === 'publish' ? <PublishPanel busy={busy} onCancel={() => setOpen(null)} onSubmit={(body) => act(() => publishInitialSnapshot(detail.id, body), 'Első közzététel létrehozva.')} /> : null}
        </section>

        {/* Combined atomic action, only meaningful in eligible triage states */}
        {(can('convert-new-case') || can('link-existing-case')) ? (
          <section className="mt-4 rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-5">
            <h2 className="text-lg font-semibold text-[#7a5f18]">Együttes művelet (ügy + hozzáférés + közzététel)</h2>
            <p className="mt-1 text-sm text-stone-700">Atomi művelet: ügy létrehozása/kapcsolása, kérelmezői hozzáférés és első közzététel egyben.</p>
            <button disabled={busy} onClick={() => setOpen('combined')} className="mt-3 rounded-full bg-[#7a5f18] px-4 py-2 text-sm text-white disabled:opacity-50">Együttes művelet előkészítése</button>
            {open === 'combined' ? <CombinedPanel busy={busy} onCancel={() => setOpen(null)} onSubmit={(body) => act(() => approvedConversion(detail.id, { ...body, expectedRevision: rev }), 'Együttes művelet végrehajtva.')} /> : null}
          </section>
        ) : null}
      </div>
    </AuthenticatedApp>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-4 rounded-2xl bg-stone-50 p-4"><h3 className="font-semibold text-stone-900">{title}</h3><div className="mt-3 space-y-3">{children}</div></div>;
}
function Actions({ busy, onCancel, onConfirm, label, disabled }: { busy: boolean; onCancel: () => void; onConfirm: () => void; label: string; disabled?: boolean }) {
  return <div className="flex gap-3"><button disabled={busy || disabled} onClick={onConfirm} className="rounded-full bg-stone-950 px-5 py-2 text-sm text-white disabled:opacity-50">{label}</button><button disabled={busy} onClick={onCancel} className="rounded-full border border-stone-300 px-5 py-2 text-sm">Mégse</button></div>;
}
const input = 'w-full rounded-xl border border-stone-300 px-3 py-2 text-sm';

function RequestInfoPanel({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (b: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  return <Panel title="További információ kérése"><label className="block text-sm"><span className="font-medium">Cím (ügyfélbiztos)</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={input} /></label><label className="block text-sm"><span className="font-medium">Üzenet az ügyfélnek *</span><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} className={`${input} min-h-24`} /></label><p className="text-xs text-stone-500">A piszkozat nem látható az ügyfélnek; a közzététellel válik láthatóvá.</p><Actions busy={busy} disabled={!instructions.trim()} onCancel={onCancel} onConfirm={() => onSubmit({ title: title.trim() || instructions.trim().slice(0, 60), instructions: instructions.trim() })} label="Közzététel" /></Panel>;
}
function DeclinePanel({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (b: Record<string, unknown>) => void }) {
  const [customerResponse, setCustomerResponse] = useState('');
  const [internalNote, setInternalNote] = useState('');
  return <Panel title="Megkeresés elutasítása"><label className="block text-sm"><span className="font-medium">Ügyfélbiztos indoklás *</span><textarea value={customerResponse} onChange={(e) => setCustomerResponse(e.target.value)} className={`${input} min-h-20`} /></label><label className="block text-sm"><span className="font-medium">Belső megjegyzés (nem látható az ügyfélnek)</span><textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} className={`${input} min-h-16`} /></label><Actions busy={busy} disabled={!customerResponse.trim()} onCancel={onCancel} onConfirm={() => onSubmit({ customerResponse: customerResponse.trim(), internalNote: internalNote.trim() || undefined })} label="Elutasítás megerősítése" /></Panel>;
}
function LinkPanel({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (caseId: string) => void }) {
  const [caseId, setCaseId] = useState('');
  return <Panel title="Meglévő ügyhöz kapcsolás"><p className="text-sm text-stone-700">A kapcsolás önmagában nem ad az ügyfélnek hozzáférést és nem hoz létre közzétételt.</p><label className="block text-sm"><span className="font-medium">Ügy azonosító</span><input value={caseId} onChange={(e) => setCaseId(e.target.value)} className={input} placeholder="Case ID" /></label><Actions busy={busy} disabled={!caseId.trim()} onCancel={onCancel} onConfirm={() => onSubmit(caseId.trim())} label="Kapcsolás" /></Panel>;
}
function ConvertPanel({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (n: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState('');
  const [matterType, setMatterType] = useState('EMPLOYMENT');
  return <Panel title="Új ügy létrehozása"><p className="text-sm text-stone-700">Új belső ügy jön létre. A kérelmezői hozzáférés és a közzététel külön, kifejezett lépés.</p><label className="block text-sm"><span className="font-medium">Ügy címe *</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={input} /></label><label className="block text-sm"><span className="font-medium">Ügytípus</span><select value={matterType} onChange={(e) => setMatterType(e.target.value)} className={input}>{['EMPLOYMENT', 'CONTRACT', 'LITIGATION', 'COMPLIANCE', 'CORPORATE', 'REAL_ESTATE', 'IP', 'OTHER'].map((t) => <option key={t} value={t}>{t}</option>)}</select></label><Actions busy={busy} disabled={!title.trim()} onCancel={onCancel} onConfirm={() => onSubmit({ title: title.trim(), matterType })} label="Ügy létrehozása" /></Panel>;
}
function PermissionPicker({ selected, onChange }: { selected: string[]; onChange: (p: string[]) => void }) {
  const toggle = (perm: string) => onChange(selected.includes(perm) ? selected.filter((p) => p !== perm) : [...selected, perm]);
  return <div className="grid grid-cols-2 gap-2 text-sm">{REQUESTER_PERMISSIONS.map((perm) => <label key={perm} className="flex items-center gap-2"><input type="checkbox" checked={selected.includes(perm)} onChange={() => toggle(perm)} />{perm}</label>)}</div>;
}
function GrantPanel({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (p: string[]) => void }) {
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_REQUESTER_PERMISSIONS);
  return <Panel title="Kérelmezői hozzáférés (REQUESTER)"><p className="text-sm text-stone-700">A kérelmező pontosan az alábbi jogosultságokat kapja:</p><PermissionPicker selected={permissions} onChange={setPermissions} /><Actions busy={busy} disabled={permissions.length === 0} onCancel={onCancel} onConfirm={() => onSubmit(permissions)} label="Hozzáférés létrehozása" /></Panel>;
}
function PublishPanel({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (b: Record<string, unknown>) => void }) {
  const [clientSafeTitle, setTitle] = useState('');
  const [clientSafeStatus, setStatus] = useState('Folyamatban');
  const [clientSafeNextStep, setNextStep] = useState('');
  return <Panel title="Első közzététel (immutábilis)"><p className="text-sm text-stone-700">Csak ügyfélbiztos tartalom. A közzététel verziózott és nem módosítható utólag.</p><label className="block text-sm"><span className="font-medium">Publikus cím *</span><input value={clientSafeTitle} onChange={(e) => setTitle(e.target.value)} className={input} /></label><label className="block text-sm"><span className="font-medium">Publikus állapot</span><input value={clientSafeStatus} onChange={(e) => setStatus(e.target.value)} className={input} /></label><label className="block text-sm"><span className="font-medium">Következő lépés</span><input value={clientSafeNextStep} onChange={(e) => setNextStep(e.target.value)} className={input} /></label><Actions busy={busy} disabled={!clientSafeTitle.trim()} onCancel={onCancel} onConfirm={() => onSubmit({ clientSafeTitle: clientSafeTitle.trim(), clientSafeStatus: clientSafeStatus.trim(), clientSafeNextStep: clientSafeNextStep.trim() || undefined })} label="Közzététel" /></Panel>;
}
function CombinedPanel({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (b: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState('');
  const [caseId, setCaseId] = useState('');
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_REQUESTER_PERMISSIONS);
  const [publicTitle, setPublicTitle] = useState('');
  const useExisting = caseId.trim().length > 0;
  return <Panel title="Együttes művelet – minden következmény">
    <p className="text-sm text-stone-700">Létrejön: ügy (kapcsolás vagy új), REQUESTER hozzáférés a megadott jogokkal, és az első közzététel.</p>
    <label className="block text-sm"><span className="font-medium">Meglévő ügy azonosító (vagy hagyja üresen új ügyhöz)</span><input value={caseId} onChange={(e) => setCaseId(e.target.value)} className={input} /></label>
    {!useExisting ? <label className="block text-sm"><span className="font-medium">Új ügy címe</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={input} /></label> : null}
    <div><p className="text-sm font-medium">Jogosultságok</p><PermissionPicker selected={permissions} onChange={setPermissions} /></div>
    <label className="block text-sm"><span className="font-medium">Publikus cím</span><input value={publicTitle} onChange={(e) => setPublicTitle(e.target.value)} className={input} /></label>
    <Actions busy={busy} disabled={permissions.length === 0 || (useExisting ? false : !title.trim()) || !publicTitle.trim()} onCancel={onCancel}
      onConfirm={() => onSubmit({
        ...(useExisting ? { existingCaseId: caseId.trim() } : { newCase: { title: title.trim(), matterType: 'OTHER' } }),
        createRequesterAccess: true,
        participantRole: 'REQUESTER',
        permissions,
        publishInitialSnapshot: true,
        publication: { clientSafeTitle: publicTitle.trim(), clientSafeStatus: 'Folyamatban' },
      })} label="Együttes művelet végrehajtása" />
  </Panel>;
}
