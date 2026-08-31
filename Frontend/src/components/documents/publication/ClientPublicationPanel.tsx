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
  getCasePortalPublicationTargets,
  getClientPublicationOverview,
  publishInternalCaseToPortal,
  transitionClientPortalGrant,
  transitionClientSafeUpdate,
  transitionDocumentPublication,
  transitionMatterPublication,
  type ClientPublicationOverviewDTO,
  type CasePortalPublicationTarget,
  type PublicationStatus,
} from "@/lib/clientPublicationApi";
import { workforceInteractionApi, type InternalInteractionRow } from "@/lib/clientInteractionApi";

type VersionOption = { id: string; versionNumber: number; isCurrent: boolean; originalFileName?: string | null; size?: number | null };

const STATUS_LABELS: Record<PublicationStatus | string, string> = {
  DRAFT: "Tervezet",
  READY_FOR_APPROVAL: "Jóváhagyásra vár",
  APPROVED: "Jóváhagyva",
  PUBLISHED: "Közzétéve",
  REVOKED: "Visszavonva",
  SUPERSEDED: "Frissítés szükséges",
  INVITED: "Meghívva",
  ACTIVE: "Aktív hozzáférés",
  SUSPENDED: "Szüneteltetve",
};

const ACTION_LABELS: Record<"submit" | "approve" | "publish" | "revoke" | "supersede", string> = {
  submit: "Ellenőrzésre küldés",
  approve: "Jóváhagyás",
  publish: "Közzététel az ügyfélnek",
  revoke: "Visszavonás",
  supersede: "Új tervezet készítése",
};

const PERMISSION_LABELS: Record<string, string> = {
  MATTER_READ: "Ügyállapot megtekintése",
  DOCUMENT_READ: "Dokumentum megtekintése",
  DOCUMENT_DOWNLOAD: "Dokumentum letöltése",
  ACTION_REQUEST_READ: "Ügyfélteendők megtekintése",
  UPDATE_READ: "Frissítések megtekintése",
};

function permissionList(permissions: string[]): string {
  return permissions.map((permission) => PERMISSION_LABELS[permission] || permission).join(", ") || "Nincs megadva";
}

function publicationStatusLabel(status: string | null | undefined): string {
  return status ? STATUS_LABELS[status] || status : "Nincs publikálva";
}

export function ClientPublicationPanel({
  caseId,
  clientId,
  documentId,
  selectedVersionId = null,
  versions = [],
}: {
  caseId: string;
  clientId: string | null;
  // Document publication is an optional module. When no document is provided the
  // panel renders as a Case-level customer-portal surface (matter status,
  // milestones, requests, updates) and simply omits the exact-version document
  // publication section. Customer-safe Case progress is a Case concept, not a
  // Document concept, so it must be usable with zero documents.
  documentId?: string;
  selectedVersionId?: string | null;
  versions?: VersionOption[];
}) {
  const [overview, setOverview] = useState<ClientPublicationOverviewDTO | null>(null);
  const [clientUserId, setClientUserId] = useState("");
  const [matterTitle, setMatterTitle] = useState("Ügyfélbiztos állapotfrissítés");
  const [matterStatus, setMatterStatus] = useState("Az ügy előkészítés alatt áll.");
  const [matterWaitingOn, setMatterWaitingOn] = useState("Jelenleg nincs ügyféltől várt teendő.");
  const [matterNextStep, setMatterNextStep] = useState("A felelős ügyvéd közzéteszi a következő biztonságos frissítést.");
  const [matterTargetDate, setMatterTargetDate] = useState("");
  const [responsibleLawyer, setResponsibleLawyer] = useState("Felelős ügyvéd");
  const [documentTitle, setDocumentTitle] = useState("Ügyfélnek megosztható dokumentum");
  const [documentExplanation, setDocumentExplanation] = useState("Ez a dokumentum pontos, jóváhagyott verzióhoz kötött ügyfélpéldány.");
  const [actionTitle, setActionTitle] = useState("Kérjük az adatok megerősítését");
  const [safeUpdateTitle, setSafeUpdateTitle] = useState("Biztonságos ügyfélfrissítés");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<InternalInteractionRow[]>([]);
  const [submissions, setSubmissions] = useState<InternalInteractionRow[]>([]);
  const [notifications, setNotifications] = useState<InternalInteractionRow[]>([]);
  const [portalTargets, setPortalTargets] = useState<CasePortalPublicationTarget[]>([]);
  const [selectedPortalTarget, setSelectedPortalTarget] = useState("");
  const [portalPublicationConfirmation, setPortalPublicationConfirmation] = useState<string | null>(null);

  const selectedVersion = useMemo(() => versions.find((version) => version.id === selectedVersionId) || null, [selectedVersionId, versions]);
  const latestVersion = useMemo(() => versions.reduce<VersionOption | null>((latest, version) => (!latest || version.versionNumber > latest.versionNumber ? version : latest), null), [versions]);
  const documentPublication = overview?.documentPublications[0] || null;
  const matterPublication = overview?.matterPublications[0] || null;
  const activeGrant = overview?.grants.find((grant) => grant.status === "ACTIVE") || null;
  const selectedTarget = portalTargets.find((target) => target.workspaceMembershipId === selectedPortalTarget) || null;
  // clientId may arrive as a prop (document workspace) or be derived from the
  // Case publication overview (Case-level surface with no document context).
  const effectiveClientId = clientId ?? overview?.clientId ?? null;
  const historicalWarning = Boolean(selectedVersion && latestVersion && selectedVersion.versionNumber < latestVersion.versionNumber);

  const load = useCallback(async () => {
    if (!caseId) return;
    const [nextOverview, questionPage, submissionPage, notificationPage, targetPage] = await Promise.all([
      getClientPublicationOverview(caseId, documentId),
      workforceInteractionApi.listQuestions({ caseId, limit: 25 }),
      workforceInteractionApi.listSubmissions({ caseId, limit: 25 }),
      workforceInteractionApi.listNotifications({ caseId, status: "FAILED_RETRYABLE", limit: 25 }),
      getCasePortalPublicationTargets(caseId).catch(() => ({ items: [] as CasePortalPublicationTarget[] })),
    ]);
    setOverview(nextOverview);
    setQuestions(questionPage.items);
    setSubmissions(submissionPage.items);
    setNotifications(notificationPage.items);
    setPortalTargets(targetPage.items);
    setSelectedPortalTarget((current) => current && targetPage.items.some((target) => target.workspaceMembershipId === current) ? current : targetPage.items[0]?.workspaceMembershipId || "");
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
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Ügyfélkapcsolat</p>
          <h3 className="font-serif text-2xl font-semibold text-[var(--adm-text)]">Ügyfélportál közzététel</h3>
          <p className="mt-1 max-w-3xl text-sm text-[#3D4842]">
            Itt állítható össze, hogy az ügyfél mit lát az ügyből. A közzététel továbbra is jóváhagyott, változatlan verzióhoz és kifejezett ügyhozzáféréshez kötött.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/client-portal-admin" className="rounded-full border border-[var(--adm-border)] px-3 py-1 text-xs font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">Teljes portálkezelés</a>
          <AdminBadge tone={overview?.gates.foundationEnabled ? "green" : "neutral"}>{overview?.gates.foundationEnabled ? "Biztonsági alap aktív" : "Biztonsági alap hiányzik"}</AdminBadge>
          <AdminBadge tone={overview?.gates.portalReadEnabled ? "gold" : "neutral"}>{overview?.gates.portalReadEnabled ? "Olvasás engedélyezve" : "Olvasás nincs bekapcsolva"}</AdminBadge>
          <AdminBadge tone={overview?.gates.portalActionsEnabled ? "gold" : "neutral"}>{overview?.gates.portalActionsEnabled ? "Ügyfélműveletek engedélyezve" : "Ügyfélműveletek várakoznak"}</AdminBadge>
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
              <h4 className="font-serif text-xl font-semibold text-[var(--adm-text)]">ÜGYFÉLNEK LÁTHATÓ ÁLLAPOT</h4>
              <AdminBadge tone={matterPublication?.status === "PUBLISHED" ? "green" : "neutral"}>{publicationStatusLabel(matterPublication?.status)}</AdminBadge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input value={matterTitle} onChange={(event) => setMatterTitle(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Ügyfélnek látható cím" />
              <input value={matterStatus} onChange={(event) => setMatterStatus(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Most itt tartunk" />
              <input value={matterWaitingOn} onChange={(event) => setMatterWaitingOn(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Mire várunk?" />
              <input value={matterNextStep} onChange={(event) => setMatterNextStep(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Következő lépés" />
              <input type="date" value={matterTargetDate} onChange={(event) => setMatterTargetDate(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" aria-label="Publikus céldátum" />
              <input value={responsibleLawyer} onChange={(event) => setResponsibleLawyer(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Felelős ügyvéd megjelenített neve" />
            </div>
            <div data-testid="customer-safe-case-preview" className="mt-3 rounded-[12px] bg-[var(--adm-surface)] p-3 text-sm text-[#3D4842]">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Ezt látja az ügyfél</p>
              <p className="mt-2 font-semibold text-[var(--adm-text)]">{matterPublication?.snapshot?.clientSafeTitle || matterTitle}</p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <div><dt className="font-semibold">Most itt tartunk</dt><dd>{matterPublication?.snapshot?.clientSafeCurrentPosition || matterPublication?.snapshot?.clientSafeStatus || matterStatus}</dd></div>
                <div><dt className="font-semibold">Mire várunk?</dt><dd>{matterPublication?.snapshot?.clientSafeWaitingOn || matterWaitingOn}</dd></div>
                <div><dt className="font-semibold">Következő lépés</dt><dd>{matterPublication?.snapshot?.clientSafeNextStep || matterNextStep}</dd></div>
                <div><dt className="font-semibold">Publikus céldátum</dt><dd>{formatGrantDate(matterPublication?.snapshot?.publicTargetDate || matterTargetDate || null)}</dd></div>
                <div><dt className="font-semibold">Felelős</dt><dd>{matterPublication?.snapshot?.responsibleLawyerDisplay || responsibleLawyer}</dd></div>
              </dl>
            </div>
            {!matterPublication ? (
              <div data-testid="internal-case-portal-publication" className="mt-3 rounded-[12px] border border-[rgba(22,32,26,0.12)] p-3">
                <p className="text-xs font-semibold text-[var(--adm-text)]">Megosztás a szervezeti ügyfélportálon</p>
                <p className="mt-1 text-xs text-[var(--adm-text-muted)]">A kiválasztott aktív portáltag kap ehhez az ügyhöz külön hozzáférést. Az ügy más munkaterületen nem jelenik meg.</p>
                <select aria-label="Ügyfélportál cél" value={selectedPortalTarget} onChange={(event) => setSelectedPortalTarget(event.target.value)} className="mt-3 min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm">
                  <option value="">Válassz ügyfélportál-célt</option>
                  {portalTargets.map((target) => <option key={target.workspaceMembershipId} value={target.workspaceMembershipId}>{target.workspaceName} · {target.memberName}</option>)}
                </select>
                <AdminButton className="mt-2 min-w-0 whitespace-normal text-left" variant="primary" disabled={busy || !selectedTarget} onClick={() => run(async () => {
                  await publishInternalCaseToPortal(caseId, {
                    workspaceId: selectedTarget!.workspaceId,
                    workspaceMembershipId: selectedTarget!.workspaceMembershipId,
                    clientSafeTitle: matterTitle,
                    clientSafeStatus: matterStatus,
                    clientSafeCurrentPosition: matterStatus,
                    clientSafeWaitingOn: matterWaitingOn,
                    clientSafeNextStep: matterNextStep,
                    publicTargetDate: matterTargetDate || null,
                    responsibleLawyerDisplay: responsibleLawyer,
                  });
                  setPortalPublicationConfirmation("Az ügyfélbiztos ügyállapot közzététele megtörtént.");
                })}>Megosztás az ügyfélportálon</AdminButton>
                {portalPublicationConfirmation ? <p className="mt-2 text-xs font-semibold text-emerald-700">{portalPublicationConfirmation}</p> : null}
              </div>
            ) : null}
            <ActionRow disabled={busy || !activeGrant} createLabel="Ügyállapot-tervezet létrehozása" onCreate={() => run(() => createMatterPublicationDraft({ caseId, clientSafeTitle: matterTitle, clientSafeStatus: matterStatus, clientSafeCurrentPosition: matterStatus, clientSafeWaitingOn: matterWaitingOn, clientSafeNextStep: matterNextStep, publicTargetDate: matterTargetDate || null, responsibleLawyerDisplay: responsibleLawyer }))} current={matterPublication} nextAction={nextMatterAction} onTransition={(action) => matterPublication ? run(() => transitionMatterPublication(matterPublication.id, action, matterPublication.revision)) : undefined} />
          </div>

          {documentId ? (
            <div className="min-w-0 rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-serif text-xl font-semibold text-[var(--adm-text)]">Dokumentum megosztása</h4>
                <AdminBadge tone={documentPublication?.status === "PUBLISHED" ? "green" : "neutral"}>{publicationStatusLabel(documentPublication?.status)}</AdminBadge>
              </div>
              <p className="mt-2 text-xs text-[var(--adm-text-muted)]">Kiválasztott változat: {selectedVersion ? `v${selectedVersion.versionNumber} · ${selectedVersion.originalFileName || selectedVersion.id.slice(0, 8)}` : "nincs"}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Ügyfélnek látható cím" />
                <input value={documentExplanation} onChange={(event) => setDocumentExplanation(event.target.value)} className="min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Ügyfélnek látható magyarázat" />
              </div>
              <div className="mt-3 rounded-[12px] bg-[var(--adm-surface)] p-3 text-sm text-[#3D4842]">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Ezt látja az ügyfél</p>
                <p className="mt-2 font-semibold text-[var(--adm-text)]">{documentPublication?.clientFacingTitle || documentTitle}</p>
                <p className="mt-1">{documentPublication?.clientFacingExplanation || documentExplanation}</p>
              </div>
              <ActionRow disabled={busy || !activeGrant || !selectedVersion} createLabel="Dokumentum-tervezet létrehozása" onCreate={() => selectedVersion ? run(() => createDocumentPublicationDraft({ documentId, documentVersionId: selectedVersion.id, clientFacingTitle: documentTitle, clientFacingExplanation: documentExplanation })) : undefined} current={documentPublication} nextAction={nextDocumentAction} onTransition={(action) => documentPublication ? run(() => transitionDocumentPublication(documentPublication.id, action, documentPublication.revision)) : undefined} />
            </div>
          ) : (
            <div className="min-w-0 rounded-[14px] border border-dashed border-[rgba(22,32,26,0.18)] p-3 text-xs text-[var(--adm-text-muted)] sm:p-4" data-testid="publication-documents-module-hint">
              A megosztott dokumentumok külön modul. Dokumentum publikálásához nyisd meg a Dokumentumok felületet; az ügyfélbiztos ügyállapot és mérföldkövek dokumentum nélkül is publikálhatók.
            </div>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <div data-testid="publication-audience" className="min-w-0 rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4">
            <h4 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Ki látja ezt az ügyet?</h4>
            <input value={clientUserId} onChange={(event) => setClientUserId(event.target.value)} className="mt-3 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" placeholder="Ügyfélportál felhasználó azonosító" />
            <AdminButton className="mt-2 w-full min-w-0 justify-start whitespace-normal text-left" variant="neutral" disabled={busy || !effectiveClientId || !clientUserId.trim()} onClick={() => run(() => createClientPortalGrant({ caseId, clientId: effectiveClientId!, clientUserId: clientUserId.trim() }))}>Ügyhozzáférés létrehozása</AdminButton>
            <div className="mt-3 space-y-2">
              {overview?.grants.map((grant) => (
                <div key={grant.id} data-testid={`grant-row-${grant.id}`} className="rounded-[10px] bg-[var(--adm-surface)] p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2"><b>Ügyfélhozzáférés</b><AdminBadge tone={grant.status === "ACTIVE" ? "green" : "neutral"}>{STATUS_LABELS[grant.status] || grant.status}</AdminBadge></div>
                  <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Jogosultságok: {permissionList(grant.permissions)}</p>
                  <details className="mt-2 text-[11px] text-[var(--adm-text-muted)]">
                    <summary className="cursor-pointer font-semibold">Technikai adatok / Audit</summary>
                    <dl data-testid="grant-operational-details" className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-2">
                    <div><dt className="font-semibold">Grant ID</dt><dd className="break-all">{grant.id}</dd></div>
                    <div><dt className="font-semibold">Revision</dt><dd>{grant.revision}</dd></div>
                    <div><dt className="font-semibold">Identity</dt><dd className="break-all">{grant.clientPortalIdentityId || "—"}</dd></div>
                    <div><dt className="font-semibold">Client</dt><dd className="break-all">{grant.clientId}</dd></div>
                    <div><dt className="font-semibold">Case</dt><dd className="break-all">{grant.caseId}</dd></div>
                    <div><dt className="font-semibold">Jogosultságok</dt><dd>{permissionList(grant.permissions)}</dd></div>
                    <div><dt className="font-semibold">Érvényes eddig</dt><dd>{formatGrantDate(grant.validUntil)}</dd></div>
                    <div><dt className="font-semibold">Létrehozva</dt><dd>{formatGrantDate(grant.createdAt)}</dd></div>
                    <div><dt className="font-semibold">Módosítva</dt><dd>{formatGrantDate(grant.updatedAt)}</dd></div>
                    {grant.revokedAt ? <div><dt className="font-semibold">Visszavonva</dt><dd>{formatGrantDate(grant.revokedAt)}</dd></div> : null}
                    </dl>
                    <div data-testid="grant-lifecycle-history" className="mt-2 border-t border-[rgba(22,32,26,0.08)] pt-2">
                    <p className="font-semibold">Lifecycle</p>
                    {overview.history.filter((event) => event.grantId === grant.id).map((event) => <p key={event.id}>{event.fromStatus || "—"} → {event.toStatus || "—"} · {event.action} · {formatGrantDate(event.createdAt)}</p>)}
                    </div>
                  </details>
                  {grant.status === "INVITED" ? <AdminButton className="mt-2" size="sm" variant="gold" disabled={busy} onClick={() => run(() => transitionClientPortalGrant(grant.id, "activate", grant.revision))}>Aktiválás</AdminButton> : null}
                  {grant.status === "ACTIVE" ? <div className="mt-2 flex gap-2"><AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => transitionClientPortalGrant(grant.id, "suspend", grant.revision))}>Szüneteltetés</AdminButton><AdminButton size="sm" variant="muted" disabled={busy} onClick={() => run(() => transitionClientPortalGrant(grant.id, "revoke", grant.revision))}>Visszavonás</AdminButton></div> : null}
                </div>
              ))}
            </div>
          </div>

          <CasePortalIdentityGrant caseId={caseId} clientId={effectiveClientId} />

          <div className="min-w-0 rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4">
            <h4 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Ügyfélteendők és frissítések</h4>
            <input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} className="mt-3 min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" />
            <AdminButton className="mt-2 w-full min-w-0 justify-start whitespace-normal text-left" variant="neutral" disabled={busy || !activeGrant} onClick={() => run(async () => { const request = await createClientActionRequestDraft({ caseId, type: "INFORMATION_REQUEST", clientSafeTitle: actionTitle, clientSafeInstructions: "Kérjük, erősítse meg az adatokat." }); await approveClientActionRequest(request.id, request.revision); })}>Teendő közzététele</AdminButton>
            <input value={safeUpdateTitle} onChange={(event) => setSafeUpdateTitle(event.target.value)} className="mt-3 min-w-0 w-full rounded border border-[rgba(22,32,26,0.16)] px-3 py-2 text-sm" />
            <AdminButton className="mt-2 w-full min-w-0 justify-start whitespace-normal text-left" variant="neutral" disabled={busy || !activeGrant} onClick={() => run(async () => { const update = await createClientSafeUpdateDraft({ caseId, title: safeUpdateTitle, body: "Ez kizárólag ügyfélnek szánt, biztonságos frissítés.", category: "GENERAL" }); const approved = await transitionClientSafeUpdate(update.id, "approve", update.revision); await transitionClientSafeUpdate(update.id, "publish", approved.revision); })}>Frissítés közzététele</AdminButton>
          </div>

          <div data-testid="publication-history" className="min-w-0 rounded-[14px] border border-[rgba(22,32,26,0.12)] p-3 sm:p-4">
            <h4 className="font-serif text-lg font-semibold text-[var(--adm-text)]">Audit / közzétételi előzmények</h4>
            <div className="mt-2 max-h-52 space-y-1 overflow-auto text-xs text-[#3D4842]">
              {overview?.history.length ? overview.history.map((event) => <p key={event.id}>{event.action} {event.toStatus ? `→ ${STATUS_LABELS[event.toStatus] || event.toStatus}` : ""}</p>) : <p>Nincs közzétételi esemény.</p>}
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
      {current && nextAction ? <AdminButton className="min-w-0 whitespace-normal text-left" variant={nextAction === "publish" ? "primary" : nextAction === "revoke" ? "muted" : "gold"} disabled={disabled} onClick={() => onTransition(nextAction)}>{ACTION_LABELS[nextAction]}</AdminButton> : null}
      {current?.status === "PUBLISHED" ? <AdminButton className="min-w-0 whitespace-normal text-left" variant="neutral" disabled={disabled} onClick={() => onTransition("supersede")}>{ACTION_LABELS.supersede}</AdminButton> : null}
    </div>
  );
}
