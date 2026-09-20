"use client";

import Link from 'next/link';
import { useState } from 'react';
import { customerInteractionApi, localizedInteractionStatus, clientSafeError, type CustomerRequestDTO, type CustomerSubmissionDTO } from '@/lib/clientInteractionApi';
import type { PortalDocument, PortalMatter } from '@/lib/clientPortalApi';
import {
  boundedUnavailableReason,
  canRespondToRequest,
  requestDocumentSpecHints,
  requestStateTone,
  requestTypeLabel,
  splitRequestInstructions,
} from '@/lib/customerRequestDetail';
import { Card, DocumentCard, formatDate } from './MatterWorkspace';
import { CustomerInteractionCard, RequestResponseCard } from './CustomerInteractionCard';

type DetailMatter = PortalMatter & { documents: PortalDocument[] };

function UnavailableDeclarationPanel({
  caseId,
  request,
  submission,
  onChanged,
}: {
  caseId: string;
  request: CustomerRequestDTO;
  submission?: CustomerSubmissionDTO;
  onChanged: () => Promise<void>;
}) {
  const declaredAt = submission?.unavailableDeclaredAt || null;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const declare = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await customerInteractionApi.declareUnavailable(caseId, request.id, boundedUnavailableReason(reason));
      setReason('');
      setOpen(false);
      setMessage('Jelzését rögzítettük és elküldtük az irodának. Az iroda az ellenőrzési sorban látja, és ellenőrzés után dönt a további lépésekről.');
      await onChanged();
    } catch (error) {
      setMessage(clientSafeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="cp-card-heading">Nem tudom teljesíteni?</h2>
      <p className="cp-subtitle mt-2 text-sm">
        Ha a kért dokumentum vagy adat nem áll rendelkezésére, jelzéssel rögzítheti az irodánál. A jelzés a beküldés része, ezért az iroda az ellenőrzési sorban látja; a bekérést nem zárja le automatikusan.
      </p>
      {declaredAt ? (
        <div className="mt-3 rounded-2xl bg-[var(--adm-ivory-100)] p-3 text-sm text-[var(--adm-text-muted)]" data-testid="unavailable-declaration-state">
          <p className="font-semibold text-[var(--adm-text)]">Jelezte, hogy a kért dokumentum vagy adat nem áll rendelkezésre.</p>
          <p className="mt-1">Rögzítve: {formatDate(declaredAt)}</p>
          {submission?.unavailableReason ? <p className="mt-1 break-words">Megjegyzés: {submission.unavailableReason}</p> : null}
          <p className="mt-2">Ha időközben mégis elérhetővé válik, a fenti feltöltéssel vagy válasszal beküldheti.</p>
        </div>
      ) : null}
      {message ? <p className="mt-3 rounded-2xl bg-[var(--adm-ivory-100)] p-3 text-sm text-[var(--adm-text-muted)]" role="status">{message}</p> : null}
      {!declaredAt && open ? (
        <div className="mt-4">
          <label className="block text-sm font-medium text-[var(--adm-text)]">
            Megjegyzés az irodának (opcionális)
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} className="mt-1 min-h-24 w-full rounded-xl border border-[var(--adm-border-strong)] bg-white px-3 py-2 text-sm text-[var(--adm-text)]" placeholder="Például: a dokumentum a másik hatóságnál van, várhatóan jövő héten elérhető." />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-full bg-[var(--adm-blue-950)] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void declare()}>Jelzem, hogy nem áll rendelkezésre</button>
            <button className="rounded-full border border-[var(--adm-border)] px-4 py-2 text-sm text-[var(--adm-text-muted)]" disabled={busy} onClick={() => setOpen(false)}>Mégsem</button>
          </div>
        </div>
      ) : null}
      {!declaredAt && !open ? (
        <button className="mt-4 rounded-full border border-[var(--adm-border-strong)] px-4 py-2 text-sm font-semibold text-[var(--adm-text)]" onClick={() => setOpen(true)}>Jelzem, hogy nem áll rendelkezésre</button>
      ) : null}
    </Card>
  );
}

export function CustomerRequestDetail({
  caseId,
  publicationId,
  request,
  submission,
  matter,
  canSendMessages,
  onChanged,
}: {
  caseId: string;
  publicationId: string;
  request: CustomerRequestDTO;
  submission?: CustomerSubmissionDTO;
  matter: DetailMatter;
  canSendMessages: boolean;
  onChanged: () => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const { steps, why } = splitRequestInstructions(request.instructions);
  const specHints = requestDocumentSpecHints(request.documentSpec);
  const canRespond = canRespondToRequest(request.status);
  const relatedDocuments = matter.documents || [];

  return (
    <div className="space-y-6">
      <Link className="inline-flex text-sm font-semibold text-[var(--adm-blue-700)] hover:underline" href={`/portal/matters/${encodeURIComponent(publicationId)}`}>← Vissza az ügyhöz</Link>

      <section className="cp-hero" data-testid="customer-request-detail">
        <div className="cp-hero-inner p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="cp-kicker">Ügyféli teendő · {requestTypeLabel(request.type)}</p>
              <h1 className="cp-title mt-3 break-words text-3xl sm:text-4xl">{request.title}</h1>
            </div>
            <span className="cp-pill shrink-0" data-tone={requestStateTone(request.status)}>{localizedInteractionStatus(request.status)}</span>
          </div>
          <dl className="mt-5 grid gap-3 text-sm text-[var(--adm-text-muted)] sm:grid-cols-3">
            <div>
              <dt className="font-semibold text-[var(--adm-text)]">Határidő</dt>
              <dd>{formatDate(request.dueAt)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--adm-text)]">Kapcsolódó ügy</dt>
              <dd><Link className="font-semibold text-[var(--adm-blue-700)] hover:underline" href={`/portal/matters/${encodeURIComponent(publicationId)}`}>{matter.title}</Link></dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--adm-text)]">Beküldés állapota</dt>
              <dd>{submission ? localizedInteractionStatus(submission.status) : 'Még nincs beküldés'}</dd>
            </div>
          </dl>
        </div>
      </section>

      <Card>
        <h2 className="cp-card-heading">Miért kérjük ezt?</h2>
        {why ? <p className="mt-3 break-words text-[var(--adm-text)]">{why}</p> : <p className="cp-empty mt-3">Az iroda ehhez a bekéréshez nem adott meg külön indoklást.</p>}
      </Card>

      <Card>
        <h2 className="cp-card-heading">Amit meg kell tennie</h2>
        {steps.length ? (
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-[var(--adm-text)]">
            {steps.map((step, index) => <li key={`${index}-${step}`} className="break-words">{step}</li>)}
          </ol>
        ) : (
          <p className="cp-empty mt-3">Az iroda nem rögzített külön lépéseket ehhez a bekéréshez.</p>
        )}
        {specHints.length ? (
          <ul className="mt-4 space-y-1 border-t border-[var(--adm-border)] pt-4 text-sm text-[var(--adm-text-muted)]">
            {specHints.map((hint) => <li key={hint}>· {hint}</li>)}
          </ul>
        ) : null}
      </Card>

      <Card>
        <h2 className="cp-card-heading">Válasz beküldése</h2>
        <p className="cp-subtitle mt-2 text-sm">Csatolhatja a kért dokumentumot, vagy megválaszolhatja az adatbekérést. A beküldés után az iroda ellenőrzi a beérkezett anyagot.</p>
        <div className="mt-4">
          {canRespond ? (
            <RequestResponseCard
              caseId={caseId}
              request={request}
              submission={submission}
              answers={answers}
              note={note}
              onAnswer={(fieldId, value) => setAnswers((current) => ({ ...current, [fieldId]: value }))}
              onNote={setNote}
              onReload={onChanged}
            />
          ) : (
            <p className="cp-empty">Ez a bekérés lezárult, további beküldés nem lehetséges.</p>
          )}
        </div>
      </Card>

      {canRespond ? <UnavailableDeclarationPanel caseId={caseId} request={request} submission={submission} onChanged={onChanged} /> : null}

      <Card>
        <h2 className="cp-card-heading">Kapcsolódó közzétett dokumentumok</h2>
        <p className="cp-subtitle mt-2 text-sm">Az iroda által ehhez az ügyhöz közzétett anyagok.</p>
        <div className="mt-4 grid gap-3">
          {relatedDocuments.length ? relatedDocuments.map((document) => <DocumentCard key={document.id} document={document} />) : <p className="cp-empty">Ehhez az ügyhöz még nincs közzétett dokumentum.</p>}
        </div>
      </Card>

      <div className="space-y-2">
        {matter.responsibleLawyerDisplay ? (
          <p className="text-sm text-[var(--adm-text-muted)]">
            Kapcsolattartó: <b className="font-semibold text-[var(--adm-text)]">{matter.responsibleLawyerDisplay}</b>
            {matter.responsibleLawyerContactSafe ? <span> · {matter.responsibleLawyerContactSafe}</span> : null}
          </p>
        ) : null}
        <CustomerInteractionCard caseId={caseId} allowAsk={canSendMessages} scope="questions" heading="Kapcsolat és segítség" />
      </div>
    </div>
  );
}
