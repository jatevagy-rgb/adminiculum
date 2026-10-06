"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SafePanelError } from "@/components/ui";
import { AdminStatusPill } from "@/components/adminiculum/ui";
import {
  answerPortalCompanyProfileQuestion,
  getPortalCompanyProfileDiscovery,
  getPortalCompliance,
  getPortalComplianceRequests,
  portalDownloadUrl,
  type PortalComplianceMissingInfo,
  type PortalComplianceReadModel,
  type PortalComplianceRequest,
  type PortalComplianceRequestState,
  type PortalComplianceTopic,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { companyProfileCompletion } from "@/lib/companyProfileCompletion";
import {
  buildAnswerPayload,
  classifyTopic,
  complianceTargetHref,
  controlProgressFor,
  customerActionNote,
  filterTopics,
  groupComplianceRequests,
  nextActionFor,
  officeProcessingNote,
  primaryBadgeLabel,
  readQuestionParam,
  readTopicParam,
  refreshAfterProfileAnswer,
  requestStateLabel,
  resolvePortalAnswerableQuestionKey,
  summaryGroups,
  TopicDetailView,
  withComplianceTarget,
  withTopicParam,
} from "@/components/client-portal/OrgComplianceView";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

/**
 * Client Portal 3.0 Compliance body — the /portal/megfeleles ORGANIZATION
 * surface. Consumes the canonical customer-safe compliance projections
 * (getPortalCompliance, getPortalComplianceRequests) and the canonical profile
 * question answering mechanism (answerPortalCompanyProfileQuestion). Real
 * counts only: no score percentages and no quality rating are invented; the
 * classification, grouping, topic-detail and answering logic is the SAME
 * exported canonical module the legacy surface uses.
 */

type ComplianceBucket = "CUSTOMER_ACTION" | "IN_PROGRESS" | "LAWYER_REVIEW" | "NO_ACTION";

const bucketLabels: Record<ComplianceBucket, string> = {
  CUSTOMER_ACTION: "Teendő szükséges",
  IN_PROGRESS: "Folyamatban",
  LAWYER_REVIEW: "Ügyvédi vizsgálat",
  NO_ACTION: "Nincs jelenlegi teendő",
};

const bucketTone: Record<ComplianceBucket, "amber" | "gold" | "green"> = {
  CUSTOMER_ACTION: "amber",
  IN_PROGRESS: "gold",
  LAWYER_REVIEW: "gold",
  NO_ACTION: "green",
};

const requestStateTone: Record<PortalComplianceRequestState, "amber" | "gold" | "green"> = {
  AWAITING_CUSTOMER: "amber",
  OFFICE_PROCESSING: "gold",
  CLOSED: "green",
};

type ComplianceSection = "ATTEKINTES" | "TEENDOK" | "DOKUMENTUMOK" | "KERDESEK" | "ALLAPOTOK";

const sectionNav: Array<{ id: ComplianceSection; label: string }> = [
  { id: "ATTEKINTES", label: "Áttekintés" },
  { id: "TEENDOK", label: "Teendők" },
  { id: "DOKUMENTUMOK", label: "Dokumentumok" },
  { id: "KERDESEK", label: "Kérdések és kérések" },
  { id: "ALLAPOTOK", label: "Állapotok" },
];

const CARD =
  "min-w-0 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4 sm:p-5";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-secondary)]";
const MUTED = "text-[var(--adm-text-secondary)]";

function formatDate(value?: string | null) {
  if (!value) return "Nincs megadva";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

/**
 * Canonical customer request detail route. The route segment is the published
 * MATTER identity (matterPublicationId), never the internal Case id: the
 * /portal/matters/:matterPublicationId route resolves against the published
 * matter publication, and an internal caseId would fail closed there. The
 * compliance requests projection is ORGANIZATION-only, so the internal-id
 * form has no valid consumer. When the matter publication is unavailable, the
 * truthful fallback is the matter list.
 */
function requestDetailHref(matterPublicationId: string | null, _caseId: string | null, requestId: string): string {
  if (matterPublicationId) {
    return `/portal/matters/${encodeURIComponent(matterPublicationId)}/requests/${encodeURIComponent(requestId)}`;
  }
  return "/portal/ugyek";
}

type WorklistItem = {
  key: string;
  kind: "PROFILE_INFORMATION" | "DOCUMENT_REQUEST" | "INFORMATION_REQUEST" | "QUESTION" | "CORRECTION_REQUEST";
  title: string;
  context: string | null;
  stateLabel: string;
  tone: "amber" | "gold" | "green";
  dueAt: string | null;
  href: string;
  ctaLabel: string;
};

function requestWorkKind(item: PortalComplianceRequest): WorklistItem["kind"] {
  if (item.category === "DOCUMENT") return "DOCUMENT_REQUEST";
  if (item.type === "CORRECTION_REQUEST") return "CORRECTION_REQUEST";
  if (item.type === "INFORMATION_REQUEST" || item.type === "DATA_FORM") return "INFORMATION_REQUEST";
  return "QUESTION";
}

function WorklistRow({ item }: { item: WorklistItem }) {
  return (
    <li className="border-t border-[var(--adm-border-canonical)] px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--adm-text-primary)]">{item.title}</p>
          {item.context ? <p className={`mt-0.5 text-xs ${MUTED}`}>Adatforrás: {item.context}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <AdminStatusPill tone={item.tone}>{item.stateLabel}</AdminStatusPill>
            {item.dueAt ? <span className={`text-xs ${MUTED}`}>Határidő: {formatDate(item.dueAt)}</span> : null}
          </div>
        </div>
        <Link
          href={item.href}
          className="shrink-0 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-1.5 text-xs font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
        >
          {item.ctaLabel}
        </Link>
      </div>
    </li>
  );
}

function StatusCard({ label, count, hint }: { label: string; count: number; hint: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4">
      <span className="block text-[26px] font-semibold text-[var(--adm-text-primary)]">{count}</span>
      <span className="mt-1 block text-xs font-semibold text-[var(--adm-brand-green)]">{label}</span>
      <span className={`mt-1 block text-xs ${MUTED}`}>{hint}</span>
    </div>
  );
}

function RequestGroup({ title, items }: { title: string; items: PortalComplianceRequest[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={EYEBROW}>{title}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--adm-text-primary)]">{item.title}</p>
                {item.contextLabel ? <p className={`mt-0.5 text-xs ${MUTED}`}>Adatforrás: {item.contextLabel}</p> : null}
                {item.instructions ? <p className={`mt-1 text-xs leading-5 ${MUTED}`}>{item.instructions}</p> : null}
                {item.dueAt ? <p className={`mt-1 text-xs ${MUTED}`}>Határidő: {formatDate(item.dueAt)}</p> : null}
              </div>
              <Link
                href={requestDetailHref(item.matterPublicationId ?? null, item.caseId, item.id)}
                className="shrink-0 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-1.5 text-xs font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
              >
                Megnyitás
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestedDocumentsPanel({ requests }: { requests: PortalComplianceRequest[] }) {
  const items = requests.filter((item) => item.category === "DOCUMENT");
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Bekért dokumentumok</h2>
          <p className={`mt-1 text-sm ${MUTED}`}>Kizárólag az iroda által benyújtásra kért dokumentumok jelennek meg itt.</p>
        </div>
        <AdminStatusPill tone="neutral" dot={false}>
          {items.length} bekérés
        </AdminStatusPill>
      </div>
      <div className="mt-4">
        {items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--adm-text-primary)]">{item.title}</p>
                    {item.contextLabel ? <p className={`mt-0.5 text-xs ${MUTED}`}>Adatforrás: {item.contextLabel}</p> : null}
                    {item.instructions ? <p className={`mt-1 text-xs leading-5 ${MUTED}`}>{item.instructions}</p> : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <AdminStatusPill tone={requestStateTone[item.state]}>{requestStateLabel(item.state)}</AdminStatusPill>
                      {item.dueAt ? <span className={`text-xs ${MUTED}`}>Határidő: {formatDate(item.dueAt)}</span> : null}
                    </div>
                  </div>
                  <Link
                    href={requestDetailHref(item.matterPublicationId ?? null, item.caseId, item.id)}
                    className="shrink-0 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-1.5 text-xs font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
                  >
                    {item.canUpload ? "Feltöltés" : "Megnyitás"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <PortalEmptyInline>Jelenleg nincs Öntől bekért dokumentum.</PortalEmptyInline>
        )}
      </div>
    </section>
  );
}

function PublishedDocumentsPanel({ topics }: { topics: PortalComplianceTopic[] }) {
  const entries = topics.flatMap((topic) =>
    (topic.documents ?? []).map((doc) => ({ doc, topicLabel: topic.topicLabel })),
  );
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Már megadott / elérhető</h2>
          <p className={`mt-1 text-sm ${MUTED}`}>Az iroda által közzétett, Önnek szánt dokumentumok — mindegyik a hozzá tartozó megfelelési területtel.</p>
        </div>
        <AdminStatusPill tone="neutral" dot={false}>
          {entries.length} dokumentum
        </AdminStatusPill>
      </div>
      <div className="mt-4">
        {entries.length > 0 ? (
          <ul className="space-y-2">
            {entries.map(({ doc, topicLabel }) => (
              <li key={doc.publicationId} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--adm-text-primary)]">{doc.title}</p>
                  <p className={`text-xs ${MUTED}`}>
                    <span className="font-semibold text-[var(--adm-text-primary)]">{topicLabel}</span>
                    {doc.versionLabel ? ` · ${doc.versionLabel}` : ""}
                    {doc.publishedAt ? ` · Közzétéve: ${formatDate(doc.publishedAt)}` : ""}
                  </p>
                </div>
                {doc.downloadAvailable ? (
                  <a
                    href={portalDownloadUrl(doc.publicationId)}
                    className="rounded-[8px] border border-[var(--adm-brand-terracotta)] px-3 py-1.5 text-xs font-semibold text-[var(--adm-brand-terracotta)] hover:bg-[var(--adm-canvas-subtle)]"
                  >
                    Letöltés
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <PortalEmptyInline>Jelenleg nincs közzétett, Önnek szánt dokumentum.</PortalEmptyInline>
        )}
      </div>
    </section>
  );
}

function TopicMissingInformation({
  topic,
  activeQuestionKey,
  focusQuestionKey,
  answerInput,
  saving,
  actionError,
  onStart,
  onAnswerChange,
  onSave,
  onMarkUnknown,
  onCancel,
}: {
  topic: PortalComplianceTopic;
  activeQuestionKey: string | null;
  /** URL-targeted question whose control should receive focus when opened. */
  focusQuestionKey?: string | null;
  answerInput: string;
  saving: boolean;
  actionError: string | null;
  onStart: (questionKey: string) => void;
  onAnswerChange: (value: string) => void;
  onSave: (info: PortalComplianceMissingInfo) => void;
  onMarkUnknown: (questionKey: string) => void;
  onCancel: () => void;
}) {
  const answerable = topic.missingInformation.filter(
    (info) => info.portalAnswerable === true && typeof info.questionKey === "string" && info.questionKey.trim().length > 0,
  );
  const officeOnly = topic.missingInformation.filter((info) => !answerable.includes(info));

  const renderItem = (info: PortalComplianceMissingInfo, idx: number) => (
    <li key={`${info.questionKey ?? info.label}-${idx}`} className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words font-medium text-[var(--adm-text-primary)]">{info.label}</span>
        {info.portalAnswerable && info.questionKey ? (
          activeQuestionKey === info.questionKey ? null : (
            <button
              type="button"
              onClick={() => onStart(info.questionKey!)}
              className="rounded-[8px] bg-[var(--adm-brand-green)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--adm-brand-deep)]"
            >
              Adat megadása →
            </button>
          )
        ) : (
          <span className={`text-xs ${MUTED}`}>Irodai egyeztetés szükséges</span>
        )}
      </div>

      {info.portalAnswerable && info.questionKey && activeQuestionKey === info.questionKey ? (
        <div className="mt-2 space-y-2">
          {info.valueType === "BOOLEAN" ? (
            <select
              data-testid="portal-compliance-answer-control"
              data-question-key={info.questionKey}
              autoFocus={focusQuestionKey === info.questionKey}
              className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-2 text-sm focus:border-[var(--adm-brand-green)] focus:outline-none"
              value={answerInput}
              onChange={(e) => onAnswerChange(e.target.value)}
              disabled={saving}
            >
              <option value="">Válasszon</option>
              <option value="true">Igen</option>
              <option value="false">Nem</option>
            </select>
          ) : info.valueType === "ENUM" ? (
            <select
              data-testid="portal-compliance-answer-control"
              data-question-key={info.questionKey}
              autoFocus={focusQuestionKey === info.questionKey}
              className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-2 text-sm focus:border-[var(--adm-brand-green)] focus:outline-none"
              value={answerInput}
              onChange={(e) => onAnswerChange(e.target.value)}
              disabled={saving}
            >
              <option value="">Válasszon</option>
              {(info.options ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              data-testid="portal-compliance-answer-control"
              data-question-key={info.questionKey}
              autoFocus={focusQuestionKey === info.questionKey}
              type={info.valueType === "NUMBER" ? "number" : info.valueType === "DATE" ? "date" : "text"}
              step={info.valueType === "NUMBER" ? (info.integerOnly ? 1 : "any") : undefined}
              className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-2 text-sm focus:border-[var(--adm-brand-green)] focus:outline-none"
              placeholder="Érték megadása..."
              value={answerInput}
              onChange={(e) => onAnswerChange(e.target.value)}
              disabled={saving}
            />
          )}
          {actionError ? <p className="text-xs text-[var(--adm-brand-terracotta)]">{actionError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSave(info)}
              disabled={saving || !answerInput.trim()}
              className="rounded-[8px] bg-[var(--adm-brand-green)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--adm-brand-deep)] disabled:opacity-50"
            >
              {saving ? "Mentés…" : "Mentés"}
            </button>
            <button
              type="button"
              onClick={() => onMarkUnknown(info.questionKey!)}
              disabled={saving}
              className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-2.5 py-1 text-xs font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)] disabled:opacity-50"
            >
              Nem ismertként jelölés
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[8px] px-2.5 py-1 text-xs font-semibold text-[var(--adm-text-secondary)] hover:bg-[var(--adm-canvas-subtle)]"
            >
              Mégse
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );

  if (topic.missingInformation.length === 0) {
    return <PortalEmptyInline>Jelenleg nincs Öntől várt hiányzó adat ehhez a területhez.</PortalEmptyInline>;
  }

  return (
    <div className="space-y-4">
      {answerable.length > 0 ? (
        <div>
          <p className={EYEBROW}>Ön által megadható adatok</p>
          <ul className="mt-2 space-y-2">{answerable.map(renderItem)}</ul>
        </div>
      ) : null}
      {officeOnly.length > 0 ? (
        <div>
          <p className={EYEBROW}>Irodai egyeztetést igénylő adatok</p>
          <ul className="mt-2 space-y-2">{officeOnly.map(renderItem)}</ul>
        </div>
      ) : null}
    </div>
  );
}

export function PortalComplianceV3() {
  const [data, setData] = useState<PortalComplianceReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [profileCompletion, setProfileCompletion] = useState<{ answered: number; total: number } | null>(null);

  const [requests, setRequests] = useState<PortalComplianceRequest[] | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [activeQuestionKey, setActiveQuestionKey] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplianceBucket | "ALL">("ALL");
  const [section, setSection] = useState<ComplianceSection>("ATTEKINTES");

  // The framework router/search params are the single source of truth for the
  // selected topic and exact question target. This keeps initial load, same-route
  // link navigation, Back and Forward in sync without custom history drift.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();
  const selectedTopicId = readTopicParam(searchString);
  const requestedQuestionKey = readQuestionParam(searchString);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const res = await getPortalCompliance();
      setData(res);
    } catch (e) {
      setError(clientSafeError(e));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const discovery = await getPortalCompanyProfileDiscovery();
      const progress = companyProfileCompletion(discovery.questions, discovery.screens);
      setProfileCompletion({ answered: progress.answered, total: progress.total });
    } catch {
      setProfileCompletion(null);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const res = await getPortalComplianceRequests();
      setRequests(res.items);
      setRequestsError(null);
    } catch (e) {
      setRequests(null);
      setRequestsError(clientSafeError(e));
    }
  }, []);

  useEffect(() => {
    void load();
    void loadProfile();
    void loadRequests();
  }, [load, loadProfile, loadRequests, reloadNonce]);

  const topics = useMemo(() => data?.topics || [], [data]);

  const bucketFor = useMemo(() => {
    const map = new Map<string, ComplianceBucket>();
    for (const topic of topics) map.set(topic.topicId, classifyTopic(topic));
    return map;
  }, [topics]);

  const groups = useMemo(() => summaryGroups(topics), [topics]);

  const visibleTopics = useMemo(() => filterTopics(topics, search, statusFilter), [topics, search, statusFilter]);

  const requestGroups = useMemo(() => groupComplianceRequests(requests ?? []), [requests]);

  const selectedTopic = useMemo(
    () => (selectedTopicId ? topics.find((topic) => topic.topicId === selectedTopicId) ?? null : null),
    [selectedTopicId, topics],
  );
  // The exact portal-answerable question the URL points at, or null when the
  // URL carries no question / a question this topic cannot answer.
  const matchedQuestionKey = selectedTopic
    ? resolvePortalAnswerableQuestionKey(selectedTopic, requestedQuestionKey)
    : null;
  const requestedQuestionUnavailable = Boolean(selectedTopic && requestedQuestionKey && !matchedQuestionKey);

  // Every URL-driven topic/question change starts from a clean answer state. The
  // typed answer mechanism stays local and nothing is ever saved automatically.
  useEffect(() => {
    setActiveQuestionKey(null);
    setAnswerInput("");
    setActionError(null);
  }, [selectedTopicId, requestedQuestionKey]);

  // A topic change also dismisses the previous action confirmation.
  useEffect(() => {
    setActionSuccess(null);
  }, [selectedTopicId]);

  // A valid topic + question target from the URL opens the existing answer
  // control for exactly that canonical question. A stale or unavailable
  // question never falls back to a different question.
  useEffect(() => {
    if (!matchedQuestionKey) return;
    setActiveQuestionKey((current) => (current === matchedQuestionKey ? current : matchedQuestionKey));
  }, [matchedQuestionKey]);

  const worklist = useMemo<WorklistItem[]>(() => {
    const items: WorklistItem[] = [];
    for (const request of requestGroups.awaiting) {
      items.push({
        key: `request-${request.id}`,
        kind: requestWorkKind(request),
        title: request.title,
        context: request.contextLabel,
        stateLabel: requestStateLabel(request.state),
        tone: requestStateTone[request.state],
        dueAt: request.dueAt,
        href: requestDetailHref(request.matterPublicationId ?? null, request.caseId, request.id),
        ctaLabel: request.canUpload ? "Feltöltés" : "Megnyitás",
      });
    }
    for (const topic of topics) {
      const answerable = topic.missingInformation.filter(
        (info) => info.portalAnswerable === true && typeof info.questionKey === "string" && info.questionKey.trim().length > 0,
      );
      if (answerable.length === 0) continue;
      items.push({
        key: `profile-${topic.topicId}`,
        kind: "PROFILE_INFORMATION",
        title: `${topic.topicLabel}: ${answerable.length} adat megadása`,
        context: topic.topicLabel,
        stateLabel: "Adatra várunk Öntől",
        tone: "amber",
        dueAt: null,
        href: complianceTargetHref(topic.topicId, answerable[0]?.questionKey),
        ctaLabel: "Adat megadása →",
      });
    }
    return items;
  }, [requestGroups, topics]);

  // A stale or unknown ?topic= value safely falls back to the overview. The
  // browser URL is corrected through the framework router so Back/Forward stay
  // consistent with what is rendered.
  useEffect(() => {
    if (!data || !selectedTopicId) return;
    if (topics.some((topic) => topic.topicId === selectedTopicId)) return;
    router.replace(`${pathname}${withTopicParam(searchString, null)}`, { scroll: false });
  }, [data, topics, selectedTopicId, router, pathname, searchString]);

  // After a successful answer the URL must stop pointing at the answered
  // question, so the resolved state stays truthful without a history entry.
  const clearQuestionTarget = useCallback(() => {
    if (!requestedQuestionKey) return;
    router.replace(`${pathname}${withComplianceTarget(searchString, selectedTopicId, null)}`, { scroll: false });
  }, [router, pathname, searchString, selectedTopicId, requestedQuestionKey]);

  const handleSaveAnswer = async (info: PortalComplianceMissingInfo) => {
    if (!info.questionKey) return;
    const payload = buildAnswerPayload(info, answerInput);
    if (!payload) return;
    setSaving(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await answerPortalCompanyProfileQuestion(info.questionKey, payload);
      setActionSuccess("Adat sikeresen rögzítve.");
      setActiveQuestionKey(null);
      setAnswerInput("");
      clearQuestionTarget();
      await refreshAfterProfileAnswer({
        refreshCompliance: () => load({ silent: true }),
        refreshProfileCompletion: loadProfile,
      });
    } catch (err) {
      setActionError(clientSafeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkUnknown = async (questionKey: string) => {
    setSaving(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await answerPortalCompanyProfileQuestion(questionKey, { status: "UNKNOWN" });
      setActionSuccess("Jelezve az iroda felé, hogy az adat nem ismert.");
      setActiveQuestionKey(null);
      setAnswerInput("");
      clearQuestionTarget();
      await refreshAfterProfileAnswer({
        refreshCompliance: () => load({ silent: true }),
        refreshProfileCompletion: loadProfile,
      });
    } catch (err) {
      setActionError(clientSafeError(err));
    } finally {
      setSaving(false);
    }
  };

  // Topic detail selection is a real framework navigation: same-route links,
  // Back and Forward all flow through the router and re-render from search params.
  const applyTopicSelection = useCallback((topicId: string | null) => {
    const nextSearch = withComplianceTarget(searchString, topicId, null);
    const next = `${pathname}${nextSearch}`;
    const current = `${pathname}${searchString ? `?${searchString}` : ""}`;
    if (next !== current) router.push(next, { scroll: false });
  }, [pathname, router, searchString]);

  // Selecting an existing portal-answerable question inside the current topic is
  // a real framework navigation: the canonical `question` search param becomes
  // the selected question while the current topic is preserved. The rendered
  // question and the URL identity stay in sync, so refresh, Back and Forward all
  // resolve the same question. Nothing is answered or submitted here.
  const applyQuestionSelection = useCallback((questionKey: string) => {
    if (!selectedTopicId) return;
    const nextSearch = withComplianceTarget(searchString, selectedTopicId, questionKey);
    const next = `${pathname}${nextSearch}`;
    const current = `${pathname}${searchString ? `?${searchString}` : ""}`;
    if (next !== current) router.push(next, { scroll: false });
  }, [pathname, router, searchString, selectedTopicId]);

  if (loading) {
    return (
      <div aria-label="Megfelelés betöltése" data-testid="portal-compliance-loading" className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-24 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="portal-compliance-v3">
        <SafePanelError detail={error} onRetry={() => setReloadNonce((value) => value + 1)} />
      </div>
    );
  }

  if (selectedTopic) {
    const bucket = bucketFor.get(selectedTopic.topicId) ?? classifyTopic(selectedTopic);
    return (
      <div className="space-y-4" data-testid="org-compliance-view">
        {actionSuccess ? (
          <div className="rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-semantic-success-soft)] p-3 text-sm font-medium text-[var(--adm-brand-green)]">
            {actionSuccess}
          </div>
        ) : null}
        {requestedQuestionUnavailable ? (
          <div
            role="status"
            data-testid="portal-compliance-question-unavailable"
            className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm text-[var(--adm-text-secondary)]"
          >
            A hivatkozott kérdés ezen a területen jelenleg nem érhető el, vagy időközben megválaszolták. Válassza ki az
            alábbi hiányzó adatok közül, amelyiket meg kívánja adni.
          </div>
        ) : null}
        <TopicDetailView
          topic={selectedTopic}
          bucket={bucket}
          controlsSummary={data?.controlsSummary}
          onBack={() => applyTopicSelection(null)}
          missingInformationSection={
            <TopicMissingInformation
              topic={selectedTopic}
              activeQuestionKey={activeQuestionKey}
              focusQuestionKey={requestedQuestionKey}
              answerInput={answerInput}
              saving={saving}
              actionError={actionError}
              onStart={(questionKey) => {
                setActiveQuestionKey(questionKey);
                setAnswerInput("");
                setActionError(null);
                applyQuestionSelection(questionKey);
              }}
              onAnswerChange={setAnswerInput}
              onSave={handleSaveAnswer}
              onMarkUnknown={handleMarkUnknown}
              onCancel={() => {
                setActiveQuestionKey(null);
                setAnswerInput("");
                setActionError(null);
              }}
            />
          }
        />
      </div>
    );
  }

  const profileHint =
    profileCompletion && profileCompletion.total > 0
      ? `${profileCompletion.answered} / ${profileCompletion.total} adat megadva`
      : "A megfelelési térkép a vállalati profil adataira épül.";

  return (
    <div className="space-y-4" data-testid="org-compliance-view">
      <header className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">
              Megfelelés
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--adm-text-secondary)]">
              A vállalkozás érintett megfelelési területei, az Öntől várt lépések, a bekérések és az iroda állapotai egy
              helyen.
            </p>
          </div>
          <Link
            href="/portal/vallalat"
            className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-1.5 text-xs font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
          >
            Vállalati profil
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-2" data-testid="compliance-section-nav">
        {sectionNav.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={section === entry.id}
            onClick={() => setSection(entry.id)}
            className={`rounded-[8px] px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] ${
              section === entry.id
                ? "bg-[var(--adm-brand-green)] text-white"
                : "text-[var(--adm-text-secondary)] hover:bg-[var(--adm-canvas-subtle)] hover:text-[var(--adm-text-primary)]"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {actionSuccess ? (
        <div className="rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-semantic-success-soft)] p-3 text-sm font-medium text-[var(--adm-brand-green)]">
          {actionSuccess}
        </div>
      ) : null}

      {section === "ATTEKINTES" ? (
        <div className="space-y-4">
          <section className={CARD}>
            <h2 className="font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Áttekintés</h2>
            <p className={`mt-1 text-sm ${MUTED}`}>Valós darabszámok. Nincs pontszám és nincs százalékos minősítés.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatusCard
                label="Öntől szükséges"
                count={groups.customerAction + requestGroups.awaiting.length}
                hint="Az Ön a következő szereplő: adatmegadás, dokumentumbekérés vagy válasz szükséges."
              />
              <StatusCard
                label="Irodánál van"
                count={groups.atOffice + requestGroups.office.length}
                hint="Az iroda dolgozik rajta; most nincs azonnali ügyféllépés."
              />
              <StatusCard
                label="Lezárt / elkészült"
                count={requestGroups.closed.length}
                hint="Az iroda lezárta; ehhez nincs további ügyféllépés."
              />
              <StatusCard
                label="Jelenleg nincs ügyfélteendő"
                count={groups.noAction}
                hint="Nyitott terület, de jelenleg nincs Öntől várt lépés."
              />
            </div>
            <div className="mt-4 space-y-1 border-t border-[var(--adm-border-canonical)] pt-3 text-xs text-[var(--adm-text-secondary)]">
              <p>Vállalati profil · {profileHint}</p>
              <p>A megjelenített megfelelési állapotok nem jelentenek felelősségkizáró abszolút garanciát vagy 100%-os minősítést.</p>
            </div>
          </section>

          <section className={CARD}>
            <h2 className="font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Mit kell most tennem?</h2>
            <p className={`mt-1 text-sm ${MUTED}`}>Az Ön következő lépései.</p>
            {worklist.length > 0 ? (
              <ul className="mt-3">
                {worklist.slice(0, 4).map((item) => (
                  <WorklistRow key={item.key} item={item} />
                ))}
              </ul>
            ) : (
              <div className="mt-3">
                <PortalEmptyInline>
                  Jelenleg nincs Öntől várt teendő. Ha az iroda új kérést tesz közzé, az itt jelenik meg.
                </PortalEmptyInline>
              </div>
            )}
            {worklist.length > 4 ? (
              <div className="mt-3 border-t border-[var(--adm-border-canonical)] pt-2">
                <button
                  type="button"
                  onClick={() => setSection("TEENDOK")}
                  className="text-sm font-semibold text-[var(--adm-brand-green)] hover:underline"
                >
                  Összes teendő ({worklist.length}) →
                </button>
              </div>
            ) : null}
          </section>

          <section className={CARD}>
            <h2 className="font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Mi van az irodánál?</h2>
            <p className={`mt-1 text-sm ${MUTED}`}>Az iroda által feldolgozás alatt tartott kérések.</p>
            <div className="mt-4">
              {requestGroups.office.length > 0 ? (
                <RequestGroup title="Irodai feldolgozás alatt" items={requestGroups.office} />
              ) : (
                <PortalEmptyInline>Jelenleg nincs irodai feldolgozás alatt lévő kérése.</PortalEmptyInline>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {section === "TEENDOK" ? (
        <section className={CARD}>
          <h2 className="font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Teendők</h2>
          <p className={`mt-1 text-sm ${MUTED}`}>Egységes ügyfél-teendőlista: adatmegadás, dokumentumbekérés és kérdés.</p>
          {worklist.length > 0 ? (
            <ul className="mt-3">
              {worklist.map((item) => (
                <WorklistRow key={item.key} item={item} />
              ))}
            </ul>
          ) : (
            <div className="mt-3">
              <PortalEmptyInline>
                Jelenleg nincs Öntől várt teendő. Ha az iroda új kérést tesz közzé, az itt jelenik meg.
              </PortalEmptyInline>
            </div>
          )}
        </section>
      ) : null}

      {section === "DOKUMENTUMOK" ? (
        <div className="space-y-4">
          {requestsError ? (
            <div role="alert">
              <SafePanelError detail="A bekért dokumentumok betöltése nem sikerült." onRetry={() => void loadRequests()} />
            </div>
          ) : (
            <RequestedDocumentsPanel requests={requests ?? []} />
          )}
          <PublishedDocumentsPanel topics={topics} />
        </div>
      ) : null}

      {section === "KERDESEK" ? (
        <section className={CARD}>
          <h2 className="font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Kérdések és kérések</h2>
          <p className={`mt-1 text-sm ${MUTED}`}>Az iroda által közzétett, Önnek szánt megkeresések.</p>
          <div className="mt-4 space-y-4">
            {requestsError ? (
              <div role="alert">
                <SafePanelError detail="A kérdések és kérések betöltése nem sikerült." onRetry={() => void loadRequests()} />
              </div>
            ) : requestGroups.awaiting.filter((item) => item.category === "QUESTION").length === 0 &&
              requestGroups.office.filter((item) => item.category === "QUESTION").length === 0 &&
              requestGroups.closed.filter((item) => item.category === "QUESTION").length === 0 ? (
              <PortalEmptyInline>Jelenleg nincs Önnek szóló kérdés vagy kérés.</PortalEmptyInline>
            ) : (
              <>
                <RequestGroup title="Válaszra vár Öntől" items={requestGroups.awaiting.filter((item) => item.category === "QUESTION")} />
                <RequestGroup title="Irodai feldolgozás alatt" items={requestGroups.office.filter((item) => item.category === "QUESTION")} />
                <RequestGroup title="Lezárt" items={requestGroups.closed.filter((item) => item.category === "QUESTION")} />
              </>
            )}
          </div>
        </section>
      ) : null}

      {section === "ALLAPOTOK" ? (
        <>
          <section className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Állapotok</h2>
                <p className={`mt-1 text-sm ${MUTED}`}>
                  Az Ön következő lépése és az irodai feldolgozás külön dimenzióban jelenik meg.
                </p>
              </div>
              <AdminStatusPill tone="neutral" dot={false}>
                {visibleTopics.length} megjelenített terület
              </AdminStatusPill>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="search"
                className="w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-1.5 text-sm text-[var(--adm-text-primary)] focus:border-[var(--adm-brand-green)] focus:outline-none sm:w-64"
                placeholder="Terület keresése…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 py-1.5 text-sm text-[var(--adm-text-primary)] focus:border-[var(--adm-brand-green)] focus:outline-none sm:w-52"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as ComplianceBucket | "ALL")}
              >
                <option value="ALL">Minden állapot</option>
                {(["CUSTOMER_ACTION", "IN_PROGRESS", "LAWYER_REVIEW", "NO_ACTION"] as ComplianceBucket[]).map((bucket) => (
                  <option key={bucket} value={bucket}>
                    {bucketLabels[bucket]}
                  </option>
                ))}
              </select>
            </div>

            {topics.length === 0 ? (
              <div className="mt-4">
                <PortalEmptyInline>Ehhez a vállalkozáshoz még nem készült megfelelési értékelés.</PortalEmptyInline>
              </div>
            ) : visibleTopics.length === 0 ? (
              <div className="mt-4">
                <PortalEmptyInline>Nincs a keresésnek vagy a szűrőnek megfelelő terület.</PortalEmptyInline>
              </div>
            ) : (
              <ul className="mt-4">
                {visibleTopics.map((topic) => {
                  const bucket = bucketFor.get(topic.topicId) ?? "CUSTOMER_ACTION";
                  const progress = controlProgressFor(topic, data?.controlsSummary);
                  const nextAction = nextActionFor(topic, bucket);
                  return (
                    <li key={topic.topicId} className="border-t border-[var(--adm-border-canonical)] py-3 first:border-t-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 max-w-2xl">
                          <h3 className="text-sm font-semibold text-[var(--adm-text-primary)]">{topic.topicLabel}</h3>
                          <p className={`mt-1 text-xs ${MUTED}`}>{topic.shortExplanation}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <AdminStatusPill tone={bucketTone[bucket]}>{primaryBadgeLabel(topic, bucket)}</AdminStatusPill>
                            <span className="text-xs font-semibold text-[var(--adm-text-primary)]">
                              {customerActionNote(topic)}
                            </span>
                            <span className={`text-xs ${MUTED}`}>{officeProcessingNote(topic)}</span>
                          </div>
                          {nextAction ? (
                            <p className="mt-1.5 text-xs text-[var(--adm-brand-terracotta)]">Következő lépés: {nextAction}</p>
                          ) : null}
                          {topic.documents.length > 0 ? (
                            <p className={`mt-1 text-xs ${MUTED}`}>{`Közzétett ügyfél-dokumentum: ${topic.documents.length}`}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-start gap-2">
                          {progress ? (
                            <span className={`text-xs ${MUTED}`}>
                              Implementált kontrollok: <b>{progress.done} / {progress.total}</b>
                              {progress.nextReviewAt ? ` · Következő felülvizsgálat: ${formatDate(progress.nextReviewAt)}` : ""}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => applyTopicSelection(topic.topicId)}
                            className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-2.5 py-1 text-xs font-semibold text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)]"
                          >
                            Részletek megnyitása →
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={CARD}>
            <h2 className="font-serif text-xl font-semibold text-[var(--adm-text-primary)]">Hogyan készül a compliance térkép?</h2>
            <p className={`mt-1 text-sm ${MUTED}`}>
              Az Adminiculum a jogi és megfelelési állapotot kizárólag ellenőrizhető tényekre alapozza.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                {
                  title: "1. Rögzített tények",
                  body: "A vállalat profiljában megadott strukturált adatok (pl. létszám, tevékenységek, rendszerek).",
                },
                {
                  title: "2. Dokumentumok",
                  body: "Érvényes belső szabályzatok, szerződések, adatkezelési tájékoztatók és jegyzőkönyvek megléte.",
                },
                {
                  title: "3. Ügyvédi vizsgálat",
                  body: "A jogi szakértők által elvégzett átvilágítási megállapítások és jóváhagyott lépések.",
                },
              ].map((step) => (
                <div key={step.title} className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3">
                  <p className="text-xs font-semibold text-[var(--adm-text-primary)]">{step.title}</p>
                  <p className={`mt-1 text-xs leading-5 ${MUTED}`}>{step.body}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
