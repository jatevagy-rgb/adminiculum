"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";
import { CasePortalIdentityGrant } from "@/components/documents/publication/CasePortalIdentityGrant";
import { MilestonePublicationPanel } from "@/components/documents/publication/MilestonePublicationPanel";
import { ClientRequestComposer } from "@/components/client-portal/ClientRequestComposer";
import { ClientInteractionInternalActions } from "@/components/client-portal/ClientInteractionInternalActions";
import {
  approveClientActionRequest,
  createClientActionRequestDraft,
  createClientPortalGrant,
  createClientSafeUpdateDraft,
  createDocumentPublicationDraft,
  createMatterPublicationDraft,
  getClientPublicationOverview,
  transitionClientPortalGrant,
  transitionClientSafeUpdate,
  transitionDocumentPublication,
  transitionMatterPublication,
  type ClientPublicationOverviewDTO,
  type PublicationStatus,
} from "@/lib/clientPublicationApi";
import { workforceInteractionApi, type InternalInteractionRow } from "@/lib/clientInteractionApi";

type VersionOption = { id: string; versionNumber: number; isCurrent: boolean; originalFileName?: string | null; size?: number | null };

const STATUS_LABELS: Record<PublicationStatus | string, string> = {
  DRAFT: "Tervezet",
  READY_FOR_APPROVAL: "Jóváhagyásra vár",
  APPROVED: "Jóváhagyva",
  PUBLISHED: "Publikálva",
  REVOKED: "Visszavonva",
  SUPERSEDED: "Felülírva",
};

export function ClientPublicationPanel({
  caseId,
  clientId,
  documentId,
  selectedVersionId,
  versions,
}: {
  caseId: string;
  clientId: string | null;
  documentId: string;
  selectedVersionId: string | null;
  versions: VersionOption[];
}) {
  const [overview, setOverview] = useState<ClientPublicationOverviewDTO | null>(null);
  const [clientUserId, setClientUserId] = useState("");
  const [matterTitle, setMatterTitle] = useState("Ügyfélbiztos állapotfrissítés");
  const [matterStatus, setMatterStatus] = useState("Az irat belső review után ügyfélközlésre előkészítve.");
  const [documentTitle, setDocumentTitle] = useState("Ügyfélnek megosztható dokumentum");
  const [documentExplanation, setDocumentExplanation] = useState("Ez a dokumentum pontos, jóváhagyott verzióhoz kötött ügyfélpéldány.");
  const [actionTitle, setActionTitle] = useState("Kérjük az adatok megerősítését");
  const [safeUpdateTitle, setSafeUpdateTitle] = useState("Biztonságos ügyfélfrissítés");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<InternalInteractionRow[]>([]);
  const [submissions, setSubmissions] = useState<InternalInteractionRow[]>([]);
  const [notifications, setNotifications] = useState<InternalInteractionRow[]>([]);

  const selectedVersion = useMemo(() => versions.find((version) => version.id === selectedVersionId) || null, [selectedVersionId, versions]);
  const latestVersion = useMemo(() => versions.reduce<VersionOption | null>((latest, version) => (!latest || version.versionNumber > latest.versionNumber ? version : latest), null), [versions]);
  const documentPublication = overview?.documentPublications[0] || null;
  const matterPublication = overview?.matterPublications[0] || null;
  const activeGrant = overview?.grants.find((grant) => grant.status === "ACTIVE") || null;
  const historicalWarning = Boolean(selectedVersion && latestVersion && selectedVersion.versionNumber < latestVersion.versionNumber);

  const load = useCallback(async () => {
    if (!caseId) return;
    const [nextOverview, questionPage, submissionPage, notificationPage] = await Promise.all([
      getClientPublicationOverview(caseId, documentId),
      workforceInteractionApi.listQuestions({ caseId, limit: 25 }),
      workforceInteractionApi.listSubmissions({ caseId, limit: 25 }),
      workforceInteractionApi.listNotifications({ caseId, status: "FAILED_RETRYABLE", limit: 25 }),
    ]);
    setOverview(nextOverview);
    setQuestions(questionPage.items);
    setSubmissions(submissionPage.items);
    setNotifications(notificationPage.items);
  }, [caseId, documentId]);

  useEffect(() => { void load().catch(() => undefined); }, [load]);

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A publication művelet nem sikerült.");
    } finally {
      setBusy(false);
    }
  };

  const nextMatterAction = matterPublication ? nextAction(matterPublication.status) : null;
  const nextDocumentAction = documentPublication ? nextAction(documentPublication.status) : null;

  return (
    <section data-testid="client-publication-panel" className="min-w-0 w-full space-y-4 overflow-hidden rounded-[18px] border border-[rgba(22,32,26,0.12)] bg-white p-3 shadow-sm [overflow-wrap:anywhere] sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Publication mód · belső kontrollpont</p>
          <h3 className="font-serif text-2xl font-semibold text-[var(--adm-text)]">Client Publication Foundation</h3>
          <p className="mt-1 max-w-3xl text-sm text-[#3D4842]">
            Explicit grant, exact immutable verzió, client-safe snapshot és audit. Külső portál olvasás/művelet továbbra is kikapcsolva.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/client-portal-admin" className="rounded-full border border-[var(--adm-border)] px-3 py-1 text-xs font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">Teljes portálkezelés</a>
          <AdminBadge tone={overview?.gates.foundationEnabled ? "green" : "neutral"}>Foundation {overview?.gates.foundationEnabled ? "ON" : "OFF"}</AdminBadge>
          <AdminBadge tone={overview?.gates.portalReadEnabled ? "gold" : "neutral"}>Portal read OFF</AdminBadge>
          <AdminBadge tone={overview?.gates.portalActionsEnabled ? "gold" : "neutral"}>Portal actions OFF</AdminBadge>
        </div>
      </div>

      {error ? <p className="rounded-[12px] border border-[#F2DAD6] bg-[var(--adm-terracotta-100)] p-3 text-sm font-semibold text-[var(--adm-terracotta-700)]">{error}</p> : null}

      <div data-testid="publication-warnings" data-warning-code={activeGrant ? "ACTIVE_AUDIENCE_GRANT" : "NO_ACTIVE_AUDIENCE_GRANT"} className="grid gap-2 md:grid-cols-3">
        {(overview?.warnings.length ? overview.warnings : [{ level: "INFO", code: "SAFE_BOUNDARY", message: "Nincs automatikus publikáció review, annotáció vagy comparison alapján." }]).map((warning) => (
          <div key={`${warning.code}-${warning.message}`} className="rounded-[12px] border border-[rgba(22,32,26,0.12)] bg-[var(--adm-surface)] p-3">
            <AdminBadge tone={warning.level === "BLOCKING" ? "amber" : warning.level === "ACK_REQUIRED" ? "gold" : "neutral"}>{warning.level}</AdminBadge>
            <p className="mt-2 text-xs font-semibold text-[#3D4842]">{warning.message}</p>
          </div>
        ))}
        {historicalWarning ? (
          <div className="rounded-[12px] border border-[#E7D7A0] bg-[#FFF8E1] p-3">
            <AdminBadge tone="gold">ACK_REQUIRED</AdminBadge>
            <p className="mt-2 text-xs font-semibold text-[#3D4842]">A kiválasztott v{selectedVersion?.versionNumber} nem a legújabb v{latestVersion?.versionNumber}; publikáció csak explicit elfogadással.</p>
          </div>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div data-testid="publication-preview" className="min-w-0 space-y-4">
          <div className="min-w-0 rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Matter client preview</h4>
              <AdminBadge tone={matterPublication?.status === "PUBLISHED" ? "green" : "neutral"}>{STATUS_LABELS[matterPublication?.status || "DRAFT"]}</AdminBadge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input value={matterTitle} onChange={(event) => setMatterTitle(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Client-safe cím" />
              <input value={matterStatus} onChange={(event) => setMatterStatus(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Client-safe státusz" />
            </div>
            <p className="mt-3 rounded-[12px] bg-[var(--adm-surface)] p-3 text-sm text-[#3D4842]">{matterPublication?.snapshot?.clientSafeStatus || matterStatus}</p>
            <ActionRow disabled={busy || !activeGrant} createLabel="Matter draft" onCreate={() => run(() => createMatterPublicationDraft({ caseId, clientSafeTitle: matterTitle, clientSafeStatus: matterStatus, clientSafeNextStep: "Következő ügyvédi lépés megosztása.", responsibleLawyerDisplay: "Felelős ügyvéd" }))} current={matterPublication} nextAction={nextMatterAction} onTransition={(action) => matterPublication ? run(() => transitionMatterPublication(matterPublication.id, action, matterPublication.revision)) : undefined} />
          </div>

          <div className="min-w-0 rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Document exact-version preview</h4>
              <AdminBadge tone={documentPublication?.status === "PUBLISHED" ? "green" : "neutral"}>{STATUS_LABELS[documentPublication?.status || "DRAFT"]}</AdminBadge>
            </div>
            <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Kiválasztott immutable verzió: {selectedVersion ? `v${selectedVersion.versionNumber} · ${selectedVersion.originalFileName || selectedVersion.id.slice(0, 8)}` : "nincs"}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Client-facing cím" />
              <input value={documentExplanation} onChange={(event) => setDocumentExplanation(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Client-facing magyarázat" />
            </div>
            <p className="mt-3 rounded-[12px] bg-[var(--adm-surface)] p-3 text-sm text-[#3D4842]">{documentPublication?.clientFacingExplanation || documentExplanation}</p>
            <ActionRow disabled={busy || !activeGrant || !selectedVersion} createLabel="Document draft" onCreate={() => selectedVersion ? run(() => createDocumentPublicationDraft({ documentId, documentVersionId: selectedVersion.id, clientFacingTitle: documentTitle, clientFacingExplanation: documentExplanation })) : undefined} current={documentPublication} nextAction={nextDocumentAction} onTransition={(action) => documentPublication ? run(() => transitionDocumentPublication(documentPublication.id, action, documentPublication.revision)) : undefined} />
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <div data-testid="publication-audience" className="min-w-0 rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4">
            <h4 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Audience / grant</h4>
            <input value={clientUserId} onChange={(event) => setClientUserId(event.target.value)} className="mt-3 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="CLIENT felhasználó ID" />
            <AdminButton className="mt-2 w-full min-w-0 justify-start whitespace-normal text-left" variant="neutral" disabled={busy || !clientId || !clientUserId.trim()} onClick={() => run(() => createClientPortalGrant({ caseId, clientId: clientId!, clientUserId: clientUserId.trim() }))}>Grant létrehozása</AdminButton>
            <div className="mt-3 space-y-2">
              {overview?.grants.map((grant) => (
                <div key={grant.id} data-testid={`grant-row-${grant.id}`} className="rounded-[10px] bg-[var(--adm-surface)] p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2"><b>Grant: {grant.id}</b><AdminBadge tone={grant.status === "ACTIVE" ? "green" : "neutral"}>{grant.status}</AdminBadge></div>
                  <dl data-testid="grant-operational-details" className="mt-2 grid gap-x-3 gap-y-1 text-[11px] text-[var(--adm-text-muted)] sm:grid-cols-2">
                    <div><dt className="font-semibold">Revision</dt><dd>{grant.revision}</dd></div>
                    <div><dt className="font-semibold">Identity</dt><dd className="break-all">{grant.clientPortalIdentityId || "—"}</dd></div>
                    <div><dt className="font-semibold">Client</dt><dd className="break-all">{grant.clientId}</dd></div>
                    <div><dt className="font-semibold">Case</dt><dd className="break-all">{grant.caseId}</dd></div>
                    <div><dt className="font-semibold">Permissions</dt><dd>{grant.permissions.join(", ") || "—"}</dd></div>
                    <div><dt className="font-semibold">Érvényes eddig</dt><dd>{formatGrantDate(grant.validUntil)}</dd></div>
                    <div><dt className="font-semibold">Létrehozva</dt><dd>{formatGrantDate(grant.createdAt)}</dd></div>
                    <div><dt className="font-semibold">Módosítva</dt><dd>{formatGrantDate(grant.updatedAt)}</dd></div>
                    {grant.revokedAt ? <div><dt className="font-semibold">Visszavonva</dt><dd>{formatGrantDate(grant.revokedAt)}</dd></div> : null}
                  </dl>
                  <div data-testid="grant-lifecycle-history" className="mt-2 border-t border-[rgba(22,32,26,0.08)] pt-2">
                    <p className="font-semibold">Lifecycle</p>
                    {overview.history.filter((event) => event.grantId === grant.id).map((event) => <p key={event.id}>{event.fromStatus || "—"} → {event.toStatus || "—"} · {event.action} · {formatGrantDate(event.createdAt)}</p>)}
                  </div>
                  {grant.status === "INVITED" ? <AdminButton className="mt-2" size="sm" variant="gold" disabled={busy} onClick={() => run(() => transitionClientPortalGrant(grant.id, "activate", grant.revision))}>Aktiválás</AdminButton> : null}
                  {grant.status === "ACTIVE" ? <div className="mt-2 flex gap-2"><AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => transitionClientPortalGrant(grant.id, "suspend", grant.revision))}>Suspend</AdminButton><AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => transitionClientPortalGrant(grant.id, "revoke", grant.revision))}>Revoke</AdminButton></div> : null}
                </div>
              ))}
            </div>
          </div>

          <CasePortalIdentityGrant caseId={caseId} clientId={clientId} />

          <div className="min-w-0 rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4">
            <h4 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Action request & safe update</h4>
            <input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} className="mt-3 min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" />
            <AdminButton className="mt-2 w-full min-w-0 justify-start whitespace-normal text-left" variant="neutral" disabled={busy || !activeGrant} onClick={() => run(async () => { const request = await createClientActionRequestDraft({ caseId, type: "INFORMATION_REQUEST", clientSafeTitle: actionTitle, clientSafeInstructions: "Kérjük, erősítse meg az adatokat." }); await approveClientActionRequest(request.id, request.revision); })}>Action request publish</AdminButton>
            <input value={safeUpdateTitle} onChange={(event) => setSafeUpdateTitle(event.target.value)} className="mt-3 min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" />
            <AdminButton className="mt-2 w-full min-w-0 justify-start whitespace-normal text-left" variant="neutral" disabled={busy || !activeGrant} onClick={() => run(async () => { const update = await createClientSafeUpdateDraft({ caseId, title: safeUpdateTitle, body: "Ez kizárólag client-safe frissítés, nem belső audit feed.", category: "GENERAL" }); const approved = await transitionClientSafeUpdate(update.id, "approve", update.revision); await transitionClientSafeUpdate(update.id, "publish", approved.revision); })}>Safe update publish</AdminButton>
          </div>

          <div data-testid="publication-history" className="min-w-0 rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4">
            <h4 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Immutable history</h4>
            <div className="mt-2 max-h-52 space-y-1 overflow-auto text-xs text-[#3D4842]">
              {overview?.history.length ? overview.history.map((event) => <p key={event.id}>{event.action} {event.toStatus ? `→ ${event.toStatus}` : ""}</p>) : <p>Nincs publication event.</p>}
            </div>
          </div>
        </aside>
      </div>
      <MilestonePublicationPanel caseId={caseId} />
      <section className="rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4" data-testid="case-client-interaction-workflow">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Case szintű ügyfélworkflow</p><h4 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Kérések, válaszok és elbírálás</h4><p className="mt-1 text-xs text-[var(--adm-text-muted)]">A tervezet rejtve marad; minden ügyfél felé látható művelet explicit közzétételhez kötött.</p></div><ClientRequestComposer initialCaseId={caseId} onChanged={load} /></div>
        <div className="mt-4"><ClientInteractionInternalActions questions={questions} submissions={submissions} notifications={notifications} onDone={load} /></div>
      </section>
    </section>
  );
}

function formatGrantDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("hu-HU") : "—";
}

function nextAction(status: PublicationStatus | string): "submit" | "approve" | "publish" | "revoke" | "supersede" | null {
  if (status === "DRAFT") return "submit";
  if (status === "READY_FOR_APPROVAL") return "approve";
  if (status === "APPROVED") return "publish";
  if (status === "PUBLISHED") return "revoke";
  if (status === "REVOKED") return "supersede";
  return null;
}

function ActionRow({
  current,
  createLabel,
  disabled,
  nextAction,
  onCreate,
  onTransition,
}: {
  current: { status: string; revision: number } | null;
  createLabel: string;
  disabled?: boolean;
  nextAction: "submit" | "approve" | "publish" | "revoke" | "supersede" | null;
  onCreate: () => void;
  onTransition: (action: "submit" | "approve" | "publish" | "revoke" | "supersede") => void;
}) {
  return (
    <div className="mt-3 flex min-w-0 flex-wrap gap-2">
      {!current ? <AdminButton className="min-w-0 whitespace-normal text-left" variant="primary" disabled={disabled} onClick={onCreate}>{createLabel}</AdminButton> : null}
      {current && nextAction ? <AdminButton className="min-w-0 whitespace-normal text-left" variant={nextAction === "publish" ? "primary" : nextAction === "revoke" ? "muted" : "gold"} disabled={disabled} onClick={() => onTransition(nextAction)}>{nextAction}</AdminButton> : null}
      {current?.status === "PUBLISHED" ? <AdminButton className="min-w-0 whitespace-normal text-left" variant="neutral" disabled={disabled} onClick={() => onTransition("supersede")}>supersede</AdminButton> : null}
    </div>
  );
}
