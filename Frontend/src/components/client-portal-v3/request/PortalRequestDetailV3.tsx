"use client";

import Link from "next/link";
import { useState } from "react";
import {
  clientSafeError,
  customerInteractionApi,
  localizedInteractionStatus,
  type CustomerRequestDTO,
  type CustomerSubmissionDTO,
} from "@/lib/clientInteractionApi";
import type { PortalDocument, PortalMatter } from "@/lib/clientPortalApi";
import {
  boundedUnavailableReason,
  canRespondToRequest,
  requestDocumentSpecHints,
  requestStateTone,
  requestTypeLabel,
  splitRequestInstructions,
} from "@/lib/customerRequestDetail";
import { PortalMatterDocumentsSection } from "../matters/PortalMatterSections";
import { PortalInteractionCardV3 } from "../interaction/PortalInteractionCardV3";
import { PortalRequestResponseV3 } from "../interaction/PortalRequestResponseV3";
import { customerRequestTruth } from "@/lib/portalCustomerTruth";

type DetailMatter = PortalMatter & { documents: PortalDocument[] };

function formatDate(value?: string | null): string {
  if (!value) return "Nincs megadva";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function statusPillClass(tone: ReturnType<typeof requestStateTone>): string {
  switch (tone) {
    case "amber":
      return "border-[var(--adm-brand-terracotta)]/30 bg-[var(--adm-brand-terracotta)]/10 text-[var(--adm-brand-terracotta)]";
    case "green":
      return "border-[var(--adm-brand-green)]/30 bg-[var(--adm-semantic-success-soft)] text-[var(--adm-brand-green)]";
    case "red":
      return "border-[var(--adm-brand-terracotta)]/40 bg-[var(--adm-brand-terracotta)]/10 text-[var(--adm-brand-terracotta)]";
    default:
      return "border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] text-[var(--adm-text-primary)]";
  }
}

const CARD =
  "min-w-0 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4 sm:p-5";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-secondary)]";
const MUTED = "text-[var(--adm-text-secondary)]";

function PortalUnavailableDeclarationV3({
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
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const declare = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await customerInteractionApi.declareUnavailable(caseId, request.id, boundedUnavailableReason(reason));
      setReason("");
      setOpen(false);
      setMessage("Jelzését rögzítettük és elküldtük az irodának. Az iroda az ellenőrzési sorban látja, és ellenőrzés után dönt a további lépésekről.");
      await onChanged();
    } catch (error) {
      setMessage(clientSafeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={CARD} data-testid="portal-unavailable-declaration">
      <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Nem tudom teljesíteni?</h2>
      <p className={`mt-2 text-sm ${MUTED}`}>
        Ha a kért dokumentum vagy adat nem áll rendelkezésére, jelzéssel rögzítheti az irodánál. A jelzés a beküldés része,
        ezért az iroda az ellenőrzési sorban látja; a bekérést nem zárja le automatikusan.
      </p>
      {declaredAt ? (
        <div
          className="mt-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm"
          data-testid="unavailable-declaration-state"
        >
          <p className="font-semibold text-[var(--adm-text-primary)]">Jelezte, hogy a kért dokumentum vagy adat nem áll rendelkezésre.</p>
          <p className="mt-1 text-[var(--adm-text-secondary)]">Rögzítve: {formatDate(declaredAt)}</p>
          {submission?.unavailableReason ? (
            <p className="mt-1 break-words text-[var(--adm-text-secondary)]">Megjegyzés: {submission.unavailableReason}</p>
          ) : null}
          <p className="mt-2 text-[var(--adm-text-secondary)]">
            Ha időközben mégis elérhetővé válik, a fenti feltöltéssel vagy válasszal beküldheti.
          </p>
        </div>
      ) : null}
      {message ? (
        <p className="mt-3 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm text-[var(--adm-text-secondary)]" role="status">
          {message}
        </p>
      ) : null}
      {!declaredAt && open ? (
        <div className="mt-4">
          <label className="block text-sm font-medium text-[var(--adm-text-primary)]">
            Megjegyzés az irodának (opcionális)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              className="mt-1 min-h-24 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-2 text-sm text-[var(--adm-text-primary)] focus:border-[var(--adm-brand-green)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
              placeholder="Például: a dokumentum a másik hatóságnál van, várhatóan jövő héten elérhető."
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-50"
              disabled={busy}
              onClick={() => void declare()}
              data-testid="portal-unavailable-confirm"
            >
              Jelzem, hogy nem áll rendelkezésre
            </button>
            <button
              className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 text-sm font-medium text-[var(--adm-text-primary)] transition-colors hover:bg-[var(--adm-canvas-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Mégsem
            </button>
          </div>
        </div>
      ) : null}
      {!declaredAt && !open ? (
        <button
          className="mt-4 inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 text-sm font-semibold text-[var(--adm-text-primary)] transition-colors hover:bg-[var(--adm-canvas-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2"
          onClick={() => setOpen(true)}
        >
          Jelzem, hogy nem áll rendelkezésre
        </button>
      ) : null}
    </section>
  );
}

/**
 * Client Portal 3.0 request detail — the ORGANIZATION replacement of the
 * legacy CustomerRequestDetail. Exact request and matter identity, the same
 * canonical customerInteractionApi contracts, and the same write flows
 * (response composer with partial-success-preserving submission pipeline,
 * unavailable declaration, question threads). Published matter documents stay
 * distinct from customer submissions.
 */
export function PortalRequestDetailV3({
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
  const [note, setNote] = useState("");
  const { steps, why } = splitRequestInstructions(request.instructions);
  const specHints = requestDocumentSpecHints(request.documentSpec);
  const canRespond = canRespondToRequest(request.status);
  const relatedDocuments = matter.documents || [];
  const customerState = customerRequestTruth(request.status, submission?.status);

  return (
    <div className="space-y-4" data-testid="portal-request-detail">
      <div>
        <Link
          className="inline-flex text-sm font-semibold text-[var(--adm-brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
          href={`/portal/matters/${encodeURIComponent(publicationId)}`}
        >
          ← Vissza az ügyhöz
        </Link>
      </div>

      <header className={CARD} data-testid="portal-request-detail-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={EYEBROW}>Ügyféli teendő · {requestTypeLabel(request.type)}</p>
            <h1 className="mt-2 break-words font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">
              {request.title}
            </h1>
          </div>
          <span
            data-testid="portal-request-detail-status"
            className={`shrink-0 rounded-[6px] border px-2.5 py-0.5 text-xs font-semibold ${statusPillClass(requestStateTone(request.status))}`}
          >
            {localizedInteractionStatus(request.status)}
          </span>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className={`font-semibold ${EYEBROW}`}>Határidő</dt>
            <dd className={`mt-0.5 ${MUTED}`}>{formatDate(request.dueAt)}</dd>
          </div>
          <div>
            <dt className={`font-semibold ${EYEBROW}`}>Kapcsolódó ügy</dt>
            <dd className="mt-0.5">
              <Link
                className="font-semibold text-[var(--adm-brand-green)] hover:underline"
                href={`/portal/matters/${encodeURIComponent(publicationId)}`}
              >
                {matter.title}
              </Link>
            </dd>
          </div>
          <div>
            <dt className={`font-semibold ${EYEBROW}`}>Beküldés állapota</dt>
            <dd className={`mt-0.5 ${MUTED}`}>
              {submission ? localizedInteractionStatus(submission.status) : "Még nincs beküldés"}
            </dd>
          </div>
        </dl>
      </header>

      <section className={CARD} aria-label="Ügyfélállapot" data-testid="portal-customer-truth">
        <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">{customerState.label}</h2>
        <p className={`mt-2 text-sm ${MUTED}`}>{customerState.explanation}</p>
      </section>

      <section className={CARD}>
        <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Miért kérjük ezt?</h2>
        {why ? (
          <p className={`mt-2 break-words text-sm leading-6 ${MUTED}`}>{why}</p>
        ) : (
          <p className={`mt-2 text-sm ${MUTED}`}>Az iroda ehhez a bekéréshez nem adott meg külön indoklást.</p>
        )}
      </section>

      <section className={CARD}>
        <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Amit meg kell tennie</h2>
        {steps.length ? (
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--adm-text-primary)]">
            {steps.map((step, index) => (
              <li key={`${index}-${step}`} className="break-words">
                {step}
              </li>
            ))}
          </ol>
        ) : (
          <p className={`mt-2 text-sm ${MUTED}`}>Az iroda nem rögzített külön lépéseket ehhez a bekéréshez.</p>
        )}
        {specHints.length ? (
          <ul className="mt-4 space-y-1 border-t border-[var(--adm-border-canonical)] pt-4 text-sm text-[var(--adm-text-secondary)]">
            {specHints.map((hint) => (
              <li key={hint}>· {hint}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={CARD}>
        <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Válasz beküldése</h2>
        <p className={`mt-2 text-sm ${MUTED}`}>
          Csatolhatja a kért dokumentumot, vagy megválaszolhatja az adatbekérést. A beküldés után az iroda ellenőrzi a
          beérkezett anyagot.
        </p>
        <div className="mt-4">
          {canRespond ? (
            <PortalRequestResponseV3
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
            <p className={`text-sm ${MUTED}`}>Ez a bekérés lezárult, további beküldés nem lehetséges.</p>
          )}
        </div>
      </section>

      {canRespond ? (
        <PortalUnavailableDeclarationV3 caseId={caseId} request={request} submission={submission} onChanged={onChanged} />
      ) : null}

      <div data-testid="portal-request-detail-documents">
        <h2 className="mb-3 font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Kapcsolódó közzétett dokumentumok</h2>
        {relatedDocuments.length ? (
          <PortalMatterDocumentsSection documents={relatedDocuments} />
        ) : (
          <p className={`text-sm ${MUTED}`}>Ehhez az ügyhöz még nincs közzétett dokumentum.</p>
        )}
      </div>

      <div className="space-y-2">
        {matter.responsibleLawyerDisplay ? (
          <p className={`text-sm ${MUTED}`}>
            Kapcsolattartó: <b className="font-semibold text-[var(--adm-text-primary)]">{matter.responsibleLawyerDisplay}</b>
            {matter.responsibleLawyerContactSafe ? <span> · {matter.responsibleLawyerContactSafe}</span> : null}
          </p>
        ) : null}
        <section className={CARD}>
          <h2 className="mb-3 font-serif text-lg font-semibold text-[var(--adm-text-primary)]">Kapcsolat és segítség</h2>
          <PortalInteractionCardV3 caseId={caseId} allowAsk={canSendMessages} scope="questions" />
        </section>
      </div>
    </div>
  );
}
