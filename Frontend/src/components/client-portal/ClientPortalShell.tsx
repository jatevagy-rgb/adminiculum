"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { customerApiScopes, customerTenantId, pickAccountByTenant } from '@/lib/authConfig';
import { ApiError, getAuthToken, setAuthToken } from '@/lib/api';
import { useCustomerAuth } from '@/lib/customerAuth';
import { clientSafeError, customerInteractionApi, localizedInteractionStatus, type ClientRequestFieldDTO, type CustomerQuestionThreadDTO, type CustomerRequestDTO, type CustomerSubmissionDTO } from '@/lib/clientInteractionApi';
import {
  getPortalActionRequest,
  getPortalDocument,
  getPortalHome,
  getPortalMatter,
  portalDownloadUrl,
  type PortalActionRequest,
  type PortalDocument,
  type PortalHome,
  type PortalMatter,
  type PortalSafeUpdate,
} from '@/lib/clientPortalApi';

type PortalView = 'home' | 'matter' | 'document' | 'action';

type Props = { view: PortalView; resourceId?: string };

type LoadState =
  | { status: 'loading' }
  | { status: 'login' }
  | { status: 'denied'; message: string }
  | { status: 'disabled' }
  | { status: 'ready'; home: PortalHome; matter?: PortalMatter & { documents: PortalDocument[]; actionRequests: PortalActionRequest[]; updates: PortalSafeUpdate[] }; document?: PortalDocument; action?: PortalActionRequest };

function formatDate(value?: string | null) {
  if (!value) return 'Nincs megadva';
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

function deadlineText(deadline: { label?: string; dueAt?: string }) {
  return [deadline.label, deadline.dueAt ? formatDate(deadline.dueAt) : null].filter(Boolean).join(' · ');
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('A fájl nem olvasható.'));
    reader.readAsDataURL(file);
  });
}


function EmptyState() {
  return <div className="rounded-3xl border border-stone-200 bg-white p-8 text-stone-600 shadow-sm">Jelenleg nincs az Ön számára közzétett aktív ügy.</div>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}

function MatterCard({ matter }: { matter: PortalMatter }) {
  return (
    <Link className="block min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-[#b99b45] focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" href={`/portal/matters/${encodeURIComponent(matter.id)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9b7b25]">Aktív ügy</p>
          <h3 className="mt-2 break-words text-xl font-semibold text-stone-950">{matter.title}</h3>
        </div>
        <span className="rounded-full bg-[#f3ead2] px-3 py-1 text-sm text-[#6f5514]">{matter.attentionCount ? 'Teendője van' : matter.statusLabel}</span>
      </div>
      <p className="mt-4 break-words text-stone-700">{matter.nextStepLabel || 'A következő közzétett lépés itt fog megjelenni.'}</p>
      <div className="mt-4 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
        <span>Felelős: {matter.responsibleLawyerDisplay || 'Közzététel szerint'}</span>
        <span>Dokumentumok: {matter.documentCount || 0}</span>
      </div>
    </Link>
  );
}

function ActionCard({ action }: { action: PortalActionRequest }) {
  return (
    <Link className="block rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" href={`/portal/action-requests/${encodeURIComponent(action.id)}`}>
      <p className="text-sm font-semibold text-[#7a5f18]">{action.typeLabel}</p>
      <h3 className="mt-1 break-words text-lg font-semibold text-stone-950">{action.title}</h3>
      <p className="mt-2 text-sm text-stone-700">Határidő: {formatDate(action.dueAt)}</p>
    </Link>
  );
}

function UpdateCard({ update }: { update: PortalSafeUpdate }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{update.categoryLabel} · {formatDate(update.publishedAt)}</p>
      <h3 className="mt-2 break-words text-lg font-semibold text-stone-950">{update.title}</h3>
      <p className="mt-2 break-words text-stone-700">{update.body}</p>
    </div>
  );
}

function DocumentCard({ document }: { document: PortalDocument }) {
  return (
    <Link className="block rounded-2xl border border-stone-200 bg-white p-4 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" href={`/portal/documents/${encodeURIComponent(document.id)}`}>
      <p className="text-sm font-semibold text-[#7a5f18]">{document.stateLabel}</p>
      <h3 className="mt-1 break-words text-lg font-semibold text-stone-950">{document.title}</h3>
      <p className="mt-2 text-sm text-stone-600">{document.versionLabel} · {formatDate(document.publishedAt)}</p>
    </Link>
  );
}

function HomeView({ home }: { home: PortalHome }) {
  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-white to-[#f7f1e2]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#9b7b25]">Adminiculum ügyfélportál</p>
        <h1 className="mt-3 break-words text-3xl font-semibold text-stone-950 sm:text-4xl">Üdvözöljük</h1>
        <p className="mt-3 max-w-2xl text-stone-700">Csak az ügyvédi iroda által kifejezetten közzétett, ügyfélbiztos információk jelennek meg.</p>
      </Card>
      <Card>
        <h2 className="text-2xl font-semibold text-stone-950">Figyelmet igényel</h2>
        <div className="mt-4 grid gap-3">{home.attention.length ? home.attention.map((action) => <ActionCard key={action.id} action={action} />) : <p className="text-stone-600">Nincs aktuális közzétett teendő.</p>}</div>
      </Card>
      <section className="grid gap-4 lg:grid-cols-2">{home.matters.length ? home.matters.map((matter) => <MatterCard key={matter.id} matter={matter} />) : <EmptyState />}</section>
      <Card>
        <h2 className="text-2xl font-semibold text-stone-950">Legutóbbi frissítések</h2>
        <div className="mt-4 grid gap-3">{home.updates.length ? home.updates.map((update) => <UpdateCard key={update.id} update={update} />) : <p className="text-stone-600">Nincs közzétett frissítés.</p>}</div>
      </Card>
    </div>
  );
}

function MatterView({ matter }: { matter: PortalMatter & { documents: PortalDocument[]; actionRequests: PortalActionRequest[]; updates: PortalSafeUpdate[] } }) {
  return (
    <div className="space-y-6">
      <Card>
        <p className="text-sm font-semibold text-[#7a5f18]">Közzétett ügy</p>
        <h1 className="mt-2 break-words text-3xl font-semibold text-stone-950">{matter.title}</h1>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Most itt tartunk</p>
            <p className="mt-2 break-words text-stone-800">{matter.currentSummary || matter.statusLabel}</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Mire várunk?</p>
            <p className="mt-2 font-semibold text-stone-900">{matter.waitingOnLabel || 'Nincs közzétett ügyféloldali teendő'}</p>
            <p className="mt-1 break-words text-sm text-stone-700">{matter.waitingDescription || 'Az iroda frissíti a portált, ha új lépés következik.'}</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{matter.nextStepTitle || 'Következő lépés'}</p>
            <p className="mt-2 break-words text-stone-800">{matter.nextStepDescription || matter.nextStepLabel || 'Nincs közzétett következő lépés.'}</p>
            {matter.estimatedTiming ? <p className="mt-2 text-sm text-stone-600">Várható időzítés: {matter.estimatedTiming}</p> : null}
          </div>
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Kapcsolattartó</p>
            <p className="mt-2 text-stone-800">{matter.responsibleLawyerDisplay || 'Közzététel szerint'}</p>
            {matter.responsibleLawyerContactSafe ? <p className="mt-1 text-sm text-stone-600">{matter.responsibleLawyerContactSafe}</p> : null}
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
          <span>Közzétéve: {formatDate(matter.publishedAt)}</span>
          <span>Utolsó ügyféloldali frissítés: {formatDate(matter.lastClientVisibleUpdateAt || matter.latestUpdateAt)}</span>
        </div>
        {matter.publicDeadlines?.length ? <ul className="mt-4 list-disc space-y-1 pl-5 text-stone-700">{matter.publicDeadlines.map((deadline, index) => <li key={index}>{deadlineText(deadline)}</li>)}</ul> : null}
      </Card>
      <Card><h2 className="text-2xl font-semibold">Dokumentumok</h2><div className="mt-4 grid gap-3">{matter.documents.map((doc) => <DocumentCard key={doc.id} document={doc} />)}</div></Card>
      <Card><h2 className="text-2xl font-semibold">Teendők</h2><div className="mt-4 grid gap-3">{matter.actionRequests.map((action) => <ActionCard key={action.id} action={action} />)}</div></Card>
      <CustomerInteractionCard caseId={matter.caseId} />
      <Card><h2 className="text-2xl font-semibold">Frissítések</h2><div className="mt-4 grid gap-3">{matter.updates.map((update) => <UpdateCard key={update.id} update={update} />)}</div></Card>
    </div>
  );
}

function DocumentView({ document }: { document: PortalDocument }) {
  const token = getAuthToken('customer');
  const onDownload = useCallback(async () => {
    const response = await fetch(portalDownloadUrl(document.id), { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    if (!response.ok) throw new Error('A dokumentum jelenleg nem tölthető le.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${document.title}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [document.id, document.title, token]);

  return <Card><p className="text-sm font-semibold text-[#7a5f18]">{document.stateLabel}</p><h1 className="mt-2 break-words text-3xl font-semibold text-stone-950">{document.title}</h1><p className="mt-3 break-words text-stone-700">{document.explanation || 'Nincs külön ügyfélmagyarázat.'}</p><dl className="mt-5 grid gap-3 text-sm text-stone-700 sm:grid-cols-2"><div><dt className="font-semibold">Változat</dt><dd>{document.versionLabel}</dd></div><div><dt className="font-semibold">Közzétéve</dt><dd>{formatDate(document.publishedAt)}</dd></div><div><dt className="font-semibold">Ügy</dt><dd>{document.matterTitle || 'Közzétett ügy'}</dd></div></dl>{document.downloadAvailable ? <button className="mt-6 rounded-full bg-stone-950 px-5 py-3 text-white focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" onClick={onDownload}>Dokumentum letöltése</button> : <p className="mt-6 rounded-2xl bg-stone-100 p-4 text-stone-700">A dokumentum már nem elérhető letöltésre.</p>}</Card>;
}

function fieldOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((option) => (typeof option === 'string' ? option : option && typeof option === 'object' ? String((option as { label?: unknown; value?: unknown }).label ?? (option as { value?: unknown }).value ?? '') : ''))
    .filter((option) => option.length > 0);
}

function FieldInput({ field, value, onChange }: { field: ClientRequestFieldDTO; value: string; onChange: (value: string) => void }) {
  const common = "mt-1 w-full rounded-xl border border-stone-300 px-3 py-2";
  if (field.type === 'LONG_TEXT' || field.type === 'ADDRESS') return <textarea value={value} onChange={(event) => onChange(event.target.value)} maxLength={field.maxLength || 2000} className={`${common} min-h-24`} />;
  if (field.type === 'YES_NO') return <select value={value} onChange={(event) => onChange(event.target.value)} className={common}><option value="">Válasszon</option><option value="igen">Igen</option><option value="nem">Nem</option></select>;
  if (field.type === 'SINGLE_CHOICE') {
    const options = fieldOptions(field.options);
    return <select value={value} onChange={(event) => onChange(event.target.value)} className={common}><option value="">Válasszon</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  }
  if (field.type === 'MULTIPLE_CHOICE') {
    const options = fieldOptions(field.options);
    const selected = new Set(value.split('|').map((entry) => entry.trim()).filter(Boolean));
    const toggle = (option: string) => {
      const next = new Set(selected);
      if (next.has(option)) next.delete(option); else next.add(option);
      onChange(Array.from(next).join(' | '));
    };
    return <div className="mt-1 space-y-1">{options.map((option) => <label key={option} className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={selected.has(option)} onChange={() => toggle(option)} />{option}</label>)}</div>;
  }
  if (field.type === 'DATE') return <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className={common} />;
  if (field.type === 'NUMBER') return <input type="number" value={value} onChange={(event) => onChange(event.target.value)} className={common} />;
  if (field.type === 'EMAIL') return <input type="email" value={value} onChange={(event) => onChange(event.target.value)} maxLength={field.maxLength || 320} className={common} />;
  if (field.type === 'PHONE') return <input type="tel" value={value} onChange={(event) => onChange(event.target.value)} maxLength={field.maxLength || 80} className={common} />;
  return <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={field.maxLength || 500} className={common} />;
}

function RequestResponseCard({
  request,
  submission,
  busy,
  answers,
  note,
  onAnswer,
  onNote,
  onSubmit,
}: {
  request: CustomerRequestDTO;
  submission?: CustomerSubmissionDTO;
  busy: boolean;
  answers: Record<string, string>;
  note: string;
  onAnswer: (fieldId: string, value: string) => void;
  onNote: (value: string) => void;
  onSubmit: (request: CustomerRequestDTO, files: File[]) => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const canRespond = !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(request.status);
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{request.title}</p>
          <p className="mt-1 text-sm text-stone-600">{localizedInteractionStatus(request.status)} · Határidő: {formatDate(request.dueAt)}</p>
        </div>
        {submission ? <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-700">{localizedInteractionStatus(submission.status)}</span> : null}
      </div>
      {request.instructions ? <p className="mt-2 break-words text-sm text-stone-700">{request.instructions}</p> : null}
      {request.fields.length ? <div className="mt-3 space-y-3">{request.fields.map((field) => <label key={field.id} className="block text-sm text-stone-700"><span className="font-medium">{field.label}{field.required ? ' *' : ''}</span>{field.helpText ? <span className="block text-xs text-stone-500">{field.helpText}</span> : null}<FieldInput field={field} value={answers[field.id] || ''} onChange={(value) => onAnswer(field.id, value)} /></label>)}</div> : null}
      <label className="mt-3 block text-sm text-stone-700">
        <span className="font-medium">Dokumentum feltöltése</span>
        <span className="block text-xs text-stone-500">PDF, JPEG vagy PNG; telefonon kamerából is választható.</span>
        <input type="file" multiple accept="application/pdf,image/jpeg,image/png" capture="environment" className="mt-1 block w-full text-sm" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
      </label>
      <textarea value={note} onChange={(event) => onNote(event.target.value)} maxLength={1000} className="mt-3 min-h-20 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" placeholder="Megjegyzés az irodának (opcionális)" />
      <button className="mt-3 rounded-full bg-stone-950 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy || !canRespond || (!files.length && !request.fields.some((field) => (answers[field.id] || '').trim()))} onClick={() => void onSubmit(request, files)}>Válasz beküldése</button>
      <p className="mt-2 text-xs text-stone-500">A fájl csak ellenőrzés után kerülhet be az ügy iratai közé.</p>
    </div>
  );
}

function QuestionThreadRow({ caseId, thread }: { caseId: string; thread: CustomerQuestionThreadDTO }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CustomerQuestionThreadDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      try { setDetail(await customerInteractionApi.getThread(caseId, thread.id)); }
      catch (err) { setError(clientSafeError(err)); }
    }
  };
  const messages = detail?.messages || [];
  return (
    <div className="rounded-xl bg-stone-50 p-3 text-sm">
      <button className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open} onClick={toggle}>
        <span className="font-medium text-stone-800">{thread.subject}</span>
        <span className="text-xs text-stone-600">{localizedInteractionStatus(thread.status)}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-2">
          {error ? <p className="text-stone-600">{error}</p> : null}
          {!error && !detail ? <p className="text-stone-500">Betöltés…</p> : null}
          {messages.length ? messages.map((msg) => (
            <div key={msg.id} className={`rounded-lg p-2 ${msg.authorType === 'INTERNAL' ? 'bg-[#f3ead2] text-[#5c470f]' : 'bg-white text-stone-800'}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide">{msg.authorType === 'INTERNAL' ? 'Ügyvédi iroda' : 'Ön'} · {formatDate(msg.sentAt)}</p>
              <p className="mt-1 break-words">{msg.body}</p>
            </div>
          )) : (!error && detail ? <p className="text-stone-600">Erre a kérdésre még nem érkezett elküldött válasz.</p> : null)}
        </div>
      ) : null}
    </div>
  );
}

function CustomerInteractionCard({ caseId }: { caseId: string }) {
  const [requests, setRequests] = useState<CustomerRequestDTO[]>([]);
  const [questions, setQuestions] = useState<CustomerQuestionThreadDTO[]>([]);
  const [submissions, setSubmissions] = useState<CustomerSubmissionDTO[]>([]);
  const [answersByRequest, setAnswersByRequest] = useState<Record<string, Record<string, string>>>({});
  const [notesByRequest, setNotesByRequest] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [requestPage, questionPage, submissionPage] = await Promise.all([
      customerInteractionApi.listRequests(caseId),
      customerInteractionApi.listQuestions(caseId),
      customerInteractionApi.listSubmissions(caseId),
    ]);
    setRequests(requestPage.items || []);
    setQuestions(questionPage.items || []);
    setSubmissions(submissionPage.items || []);
  }, [caseId]);

  useEffect(() => { void load().catch(() => setMessage('Az interakciók jelenleg nem érhetők el.')); }, [load]);

  const sendQuestion = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await customerInteractionApi.createQuestion(caseId, { subject, bodySafe: body });
      setSubject('');
      setBody('');
      setMessage('A kérdés beküldve. Az iroda válasza itt fog megjelenni.');
      await load();
    } catch (error) {
      setMessage(clientSafeError(error));
    } finally {
      setBusy(false);
    }
  };

  const submitRequest = async (request: CustomerRequestDTO, files: File[]) => {
    setBusy(true);
    setMessage(null);
    try {
      const submission = await customerInteractionApi.createSubmission(caseId, request.id);
      const answers = request.fields
        .map((field) => ({ label: field.label, value: (answersByRequest[request.id]?.[field.id] || '').trim() }))
        .filter((answer) => answer.value);
      if (answers.length) await customerInteractionApi.submitAnswers(caseId, submission.id, answers);
      for (const file of files) {
        await customerInteractionApi.uploadFile(caseId, submission.id, {
          originalFileName: file.name,
          declaredMimeType: file.type || 'application/octet-stream',
          base64: await fileToBase64(file),
        });
      }
      await customerInteractionApi.submitSubmission(caseId, submission.id, notesByRequest[request.id]);
      setAnswersByRequest((current) => ({ ...current, [request.id]: {} }));
      setNotesByRequest((current) => ({ ...current, [request.id]: '' }));
      setMessage('A válasz beküldve. Az iroda ellenőrzés után frissíti az ügy állapotát.');
      await load();
    } catch (error) {
      setMessage(clientSafeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="text-2xl font-semibold">Kérdések és bekérések</h2>
      <p className="mt-2 text-sm text-stone-600">Csak ehhez a kifejezetten megosztott ügyhöz kapcsolódó ügyfélportál-műveletek jelennek meg.</p>
      {message ? <p className="mt-3 rounded-2xl bg-stone-100 p-3 text-sm text-stone-700">{message}</p> : null}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 p-4">
          <h3 className="font-semibold">Ügyvédi bekérések</h3>
          <div className="mt-3 space-y-3">{requests.length ? requests.map((request) => <RequestResponseCard key={request.id} request={request} submission={submissions.find((submission) => submission.requestId === request.id)} busy={busy} answers={answersByRequest[request.id] || {}} note={notesByRequest[request.id] || ''} onAnswer={(fieldId, value) => setAnswersByRequest((current) => ({ ...current, [request.id]: { ...(current[request.id] || {}), [fieldId]: value } }))} onNote={(value) => setNotesByRequest((current) => ({ ...current, [request.id]: value }))} onSubmit={submitRequest} />) : <p className="text-sm text-stone-600">Nincs aktív dokumentum- vagy adatbekérés.</p>}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 p-4">
          <h3 className="font-semibold">Kérdés küldése</h3>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} className="mt-3 w-full rounded-xl border border-stone-300 px-3 py-2" placeholder="Tárgy" />
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} className="mt-2 min-h-28 w-full rounded-xl border border-stone-300 px-3 py-2" placeholder="Kérdés szövege" />
          <button className="mt-2 rounded-full bg-stone-950 px-4 py-2 text-white disabled:opacity-50" disabled={busy || !subject.trim() || !body.trim()} onClick={sendQuestion}>Kérdés beküldése</button>
          <div className="mt-4 space-y-2">{questions.length ? questions.map((thread) => <QuestionThreadRow key={thread.id} caseId={caseId} thread={thread} />) : <p className="text-sm text-stone-600">Még nincs kérdésszál.</p>}</div>
        </div>
      </div>
    </Card>
  );
}

function ActionView({ action }: { action: PortalActionRequest }) {
  return <Card><p className="text-sm font-semibold text-[#7a5f18]">{action.typeLabel}</p><h1 className="mt-2 break-words text-3xl font-semibold text-stone-950">{action.title}</h1><p className="mt-3 break-words text-stone-700">{action.instructions || 'Nincs további közzétett instrukció.'}</p><p className="mt-4 text-stone-700">Határidő: {formatDate(action.dueAt)}</p><p className="mt-6 rounded-2xl bg-stone-100 p-4 text-stone-700">{action.readOnlyNote}</p></Card>;
}

export function ClientPortalShell({ view, resourceId }: Props) {
  const { instance, accounts, inProgress } = useMsal();
  const account = pickAccountByTenant(accounts, customerTenantId);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // Canonical customer-auth layer: single MSAL instance, one logout config.
  const { logoutCustomer } = useCustomerAuth();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!account) {
        setState({ status: 'login' });
        return;
      }
      if (inProgress !== InteractionStatus.None) return;
      try {
        const token = await instance.acquireTokenSilent({ account, scopes: customerApiScopes });
        setAuthToken(token.accessToken, 'customer');
        const home = await getPortalHome();
        let detail = {};
        if (view === 'matter' && resourceId) detail = { matter: await getPortalMatter(resourceId) };
        if (view === 'document' && resourceId) detail = { document: await getPortalDocument(resourceId) };
        if (view === 'action' && resourceId) detail = { action: await getPortalActionRequest(resourceId) };
        if (!cancelled) setState({ status: 'ready', home, ...detail });
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          await instance.acquireTokenRedirect({ account, scopes: customerApiScopes });
          return;
        }
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 503) setState({ status: 'disabled' });
          else if (error instanceof ApiError && [401, 403, 404].includes(error.status)) setState({ status: 'denied', message: 'A portálhozzáférés jelenleg nem aktív. Kérjük, vegye fel a kapcsolatot az irodával.' });
          else setState({ status: 'denied', message: 'A portál jelenleg nem érhető el. Kérjük, próbálja újra később.' });
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [account, inProgress, instance, resourceId, view]);

  const nav = useMemo(() => [
    ['Főoldal', '/portal'],
    ['Ügyeim', '/portal#ugyeim'],
    ['Dokumentumok', '/portal#dokumentumok'],
    ['Teendők', '/portal#teendok'],
  ], []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf8f3] text-stone-900" data-testid="client-portal-shell">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/portal" className="font-serif text-2xl font-semibold tracking-tight text-stone-950 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40">Adminiculum</Link>
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="Ügyfélportál navigáció">{nav.map(([label, href]) => <Link className="rounded-full px-3 py-2 text-stone-700 hover:bg-stone-100 focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40" key={label} href={href}>{label}</Link>)}</nav>
          {state.status === 'ready' ? <button className="rounded-full border border-stone-300 px-3 py-2 text-sm" onClick={logoutCustomer}>Kijelentkezés</button> : null}
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {state.status === 'loading' ? <Card>Betöltés...</Card> : null}
        {state.status === 'login' ? <Card><h1 className="text-3xl font-semibold">Ügyfélportál belépés</h1><p className="mt-3 text-stone-700">Jelentkezzen be e-mail címmel és jelszóval a közzétett ügyfélanyagok megtekintéséhez.</p><Link href="/portal/login" className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-white">Bejelentkezés</Link></Card> : null}
        {state.status === 'disabled' ? <Card>A client portal olvasási hozzáférése ebben a környezetben még nincs bekapcsolva.</Card> : null}
        {state.status === 'denied' ? <Card>{state.message}</Card> : null}
        {state.status === 'ready' && view === 'home' ? <HomeView home={state.home} /> : null}
        {state.status === 'ready' && view === 'matter' && state.matter ? <MatterView matter={state.matter} /> : null}
        {state.status === 'ready' && view === 'document' && state.document ? <DocumentView document={state.document} /> : null}
        {state.status === 'ready' && view === 'action' && state.action ? <ActionView action={state.action} /> : null}

      </div>
    </main>
  );
}

