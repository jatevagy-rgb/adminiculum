"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { SafePanelError } from "@/components/ui";
import {
  getIntake,
  updateIntake,
  submitIntake,
  withdrawIntake,
  respondToIntake,
  type CustomerIntake,
} from "@/lib/clientIntakeApi";
import {
  buildUpdateIntakePayload,
  intakeErrorMessage,
} from "@/lib/clientIntakeShared";
import {
  formatIntakeDate,
  PortalIntakeAttachments,
  PortalIntakeDraftEditor,
  PortalIntakeInfoRequest,
  PortalIntakeStatusBadge,
} from "./PortalIntakeSections";

/**
 * Client Portal 3.0 intake detail workspace — the /portal/megkeresesek/:intakeId
 * ORGANIZATION body. Handles draft editing, office response inspection,
 * information-request fulfillment, attachment auditing and safe matter cutover.
 */
export function PortalIntakeDetailV3({ intakeId }: { intakeId: string }) {
  const [intake, setIntake] = useState<CustomerIntake | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getIntake(intakeId);
      setIntake(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(intakeErrorMessage(err.code));
      } else {
        setError("A megkeresés jelenleg nem érhető el.");
      }
    } finally {
      setLoading(false);
    }
  }, [intakeId]);

  useEffect(() => {
    void load();
  }, [load, reloadNonce]);

  const runMutation = async (
    fn: () => Promise<CustomerIntake>,
    successMessage: string
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await fn();
      setIntake(updated);
      setNotice(successMessage);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(intakeErrorMessage(err.code));
      } else {
        setError(intakeErrorMessage(undefined));
      }
      await load();
    } finally {
      setBusy(false);
      setConfirmSubmit(false);
      setConfirmWithdraw(false);
    }
  };

  if (loading && !intake) {
    return (
      <div
        data-testid="portal-intake-detail-loading"
        className="space-y-4"
        aria-label="Megkeresés betöltése"
      >
        <div className="h-6 w-48 animate-pulse rounded-[8px] bg-[var(--adm-canvas-subtle)]" />
        <div className="h-40 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
      </div>
    );
  }

  if (error && !intake) {
    return (
      <div data-testid="portal-intake-detail-error" className="space-y-4">
        <Link
          href="/portal/megkeresesek"
          className="inline-flex text-sm text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
        >
          ← Vissza a megkeresésekhez
        </Link>
        <SafePanelError
          detail={error}
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
      </div>
    );
  }

  if (!intake) return null;

  const actions = intake.allowedActions || { update: false, submit: false, withdraw: false, respond: false };
  const statusCode = (intake.status?.code || "").toLowerCase();
  const isLinkedOrConverted =
    statusCode === "linked" ||
    statusCode === "converted" ||
    statusCode === "closed" ||
    statusCode === "linked-to-existing-case" ||
    statusCode === "converted-to-case";

  return (
    <div className="space-y-6" data-testid="portal-intake-detail-v3">
      <div>
        <Link
          href="/portal/megkeresesek"
          className="inline-flex text-sm text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
        >
          ← Vissza a megkeresésekhez
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="break-words font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">
              {intake.subject}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PortalIntakeStatusBadge status={intake.status} />
          </div>
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          className="rounded-[8px] border border-[var(--adm-brand-green)]/30 bg-[var(--adm-brand-green)]/10 p-4 text-sm font-medium text-[var(--adm-brand-green)]"
        >
          {notice}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-[8px] border border-[var(--adm-brand-terracotta)]/30 bg-[var(--adm-brand-terracotta)]/10 p-4 text-sm font-medium text-[var(--adm-brand-terracotta)]"
        >
          {error}
        </div>
      ) : null}

      {/* Linked matter access callout */}
      {isLinkedOrConverted ? (
        <section
          data-testid="portal-intake-linked-matter"
          className="rounded-[8px] border border-[var(--adm-brand-green)]/30 bg-[var(--adm-brand-green)]/5 p-5"
        >
          {intake.linkedMatterPublicationId ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-base font-semibold text-[var(--adm-brand-green)]">
                  Az ügy közzétéve az ügyfélfelületen
                </h2>
                <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">
                  A megkeresés alapján az iroda rögzítette az ügyet és elérhetővé tette a kapcsolódó felületet.
                </p>
              </div>
              <Link
                href={`/portal/matters/${encodeURIComponent(intake.linkedMatterPublicationId)}`}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                Ügy megnyitása →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-[var(--adm-text-secondary)]">
              Az ügyet az iroda rögzítette. Az ügyfélfelületi hozzáférés közzététele folyamatban van.
            </p>
          )}
        </section>
      ) : null}

      {/* Overview Card */}
      <section
        data-testid="portal-intake-overview"
        className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-6"
      >
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-secondary)]">
              Szervezeti egység
            </dt>
            <dd className="mt-1 text-sm font-medium text-[var(--adm-text-primary)]">
              {intake.organizationGroupName || "Nincs megadva"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-secondary)]">
              Beküldve
            </dt>
            <dd className="mt-1 text-sm font-medium text-[var(--adm-text-primary)]">
              {formatIntakeDate(intake.submittedAt) || "Még nincs beküldve"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-secondary)]">
              Frissítve
            </dt>
            <dd className="mt-1 text-sm font-medium text-[var(--adm-text-primary)]">
              {formatIntakeDate(intake.updatedAt) || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-secondary)]">
              Kért határidő
            </dt>
            <dd className="mt-1 text-sm font-medium text-[var(--adm-text-primary)]">
              {formatIntakeDate(intake.requestedDeadline) || "Nincs megadva"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-[var(--adm-border-canonical)] pt-5">
          <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-secondary)]">
            Leírás
          </dt>
          <dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--adm-text-primary)]">
            {intake.description}
          </dd>
        </div>

        {intake.officeResponse ? (
          <div
            data-testid="portal-intake-office-response"
            className="mt-6 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-4"
          >
            <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-secondary)]">
              Az iroda válasza
            </dt>
            <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--adm-text-primary)]">
              {intake.officeResponse}
            </dd>
          </div>
        ) : null}
      </section>

      {/* Attachments */}
      <PortalIntakeAttachments attachments={intake.attachments} />

      {/* Information request from office */}
      {actions.respond && intake.informationRequest ? (
        <PortalIntakeInfoRequest
          infoRequest={intake.informationRequest}
          busy={busy}
          onRespond={(answers) =>
            runMutation(
              () =>
                respondToIntake(
                  intake.reference,
                  intake.informationRequest!.reference,
                  answers
                ),
              "Válaszát megküldtük az irodának."
            )
          }
        />
      ) : null}

      {/* Draft editor when editable */}
      {actions.update ? (
        <PortalIntakeDraftEditor
          intake={intake}
          busy={busy}
          onSave={(payload) =>
            runMutation(
              () =>
                updateIntake(
                  intake.reference,
                  buildUpdateIntakePayload(payload)
                ),
              "A piszkozat módosításait sikeresen elmentettük."
            )
          }
        />
      ) : null}

      {/* Action controls (submit / withdraw) */}
      {actions.submit || actions.withdraw ? (
        <section
          data-testid="portal-intake-actions"
          className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-6"
        >
          <div className="flex flex-wrap items-center gap-3">
            {actions.submit ? (
              confirmSubmit ? (
                <div className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-4">
                  <p className="text-sm text-[var(--adm-text-primary)]">
                    A megkeresést elküldjük az irodának. Ezt követően már nem szerkesztheti szabadon.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      data-testid="portal-intake-confirm-submit-btn"
                      onClick={() =>
                        void runMutation(
                          () => submitIntake(intake.reference, null),
                          "A megkeresést sikeresen beküldtük az irodának."
                        )
                      }
                      className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      {busy ? "Beküldés folyamatban…" : "Beküldés megerősítése"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmSubmit(false)}
                      className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 text-sm font-medium text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
                    >
                      Mégse
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmSubmit(true)}
                  data-testid="portal-intake-submit-btn"
                  className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                >
                  Megkeresés beküldése
                </button>
              )
            ) : null}

            {actions.withdraw ? (
              confirmWithdraw ? (
                <div className="w-full rounded-[8px] border border-[var(--adm-brand-terracotta)]/30 bg-[var(--adm-brand-terracotta)]/10 p-4">
                  <p className="text-sm text-[var(--adm-brand-terracotta)]">
                    Biztosan visszavonja a megkeresést? Visszavonás után az iroda már nem dolgozza fel azt.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      data-testid="portal-intake-confirm-withdraw-btn"
                      onClick={() =>
                        void runMutation(
                          () => withdrawIntake(intake.reference, null),
                          "A megkeresést sikeresen visszavontuk."
                        )
                      }
                      className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-terracotta)] bg-[var(--adm-brand-terracotta)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-terracotta)] focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      {busy ? "Visszavonás folyamatban…" : "Visszavonás megerősítése"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmWithdraw(false)}
                      className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 text-sm font-medium text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
                    >
                      Mégse
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmWithdraw(true)}
                  data-testid="portal-intake-withdraw-btn"
                  className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 text-sm font-medium text-[var(--adm-text-primary)] transition-colors hover:border-[var(--adm-brand-terracotta)] hover:text-[var(--adm-brand-terracotta)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-terracotta)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                >
                  Megkeresés visszavonása
                </button>
              )
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
