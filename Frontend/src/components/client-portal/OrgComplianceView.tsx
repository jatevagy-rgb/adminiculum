"use client";

import Link from "next/link";
import * as React from "react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getPortalCompliance,
  getPortalComplianceRequests,
  answerPortalCompanyProfileQuestion,
  getPortalCompanyProfileDiscovery,
  portalDownloadUrl,
  type PortalComplianceReadModel,
  type PortalComplianceTopic,
  type PortalComplianceMissingInfo,
  type PortalComplianceDocument,
  type PortalComplianceControlSummary,
  type PortalComplianceRequest,
  type PortalComplianceRequestState,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { companyProfileCompletion } from "@/lib/companyProfileCompletion";
import { OperationalPageHeader, CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { AdminSectionHeader, AdminPanel, AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { formatDate } from "./MatterWorkspace";

// Canonical Adminiculum operational styling. No route-local palette, no
// oversized marketing cards — thin borders, compact radius, semantic tokens.
const card = "min-w-0 rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4 sm:p-5";
const inputClass =
  "w-full rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-2 text-sm text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none focus:ring-2 focus:ring-[var(--adm-green-800)]/20 disabled:bg-[var(--adm-surface)] disabled:text-[var(--adm-text-muted)]";

type ComplianceBucket = "CUSTOMER_ACTION" | "IN_PROGRESS" | "LAWYER_REVIEW" | "NO_ACTION";

const bucketLabels: Record<ComplianceBucket, string> = {
  CUSTOMER_ACTION: "Teendő szükséges",
  IN_PROGRESS: "Folyamatban",
  LAWYER_REVIEW: "Ügyvédi vizsgálat",
  NO_ACTION: "Nincs jelenlegi teendő",
};

// Canonical semantic tones for the shared status primitive. The route keeps the
// business classification but no longer owns bespoke status colours.
const bucketTone: Record<ComplianceBucket, "amber" | "gold" | "green"> = {
  CUSTOMER_ACTION: "amber",
  IN_PROGRESS: "gold",
  LAWYER_REVIEW: "gold",
  NO_ACTION: "green",
};

/**
 * Safe, customer-facing Hungarian labels for the client-safe control
 * implementation status. Raw enum keys must never reach the customer, so an
 * unknown or absent status degrades to a neutral "not assessed" label instead
 * of echoing the internal token.
 */
const controlStatusLabels: Record<string, string> = {
  NOT_ASSESSED: "Nincs felmérve",
  PLANNED: "Tervezett",
  IMPLEMENTING: "Bevezetés alatt",
  IMPLEMENTED: "Bevezetve",
  PARTIAL: "Részben bevezetve",
  NOT_IMPLEMENTED: "Nincs bevezetve",
};

export function controlStatusLabel(status: string | null | undefined): string {
  if (!status) return "Nincs felmérve";
  return controlStatusLabels[status] ?? "Nincs felmérve";
}

/**
 * True only when the customer can execute portal input RIGHT NOW: the missing
 * item is portal-answerable AND carries a resolvable canonical questionKey.
 * A missing item that is not answerable through the portal must never produce
 * a customer CTA, so it is deliberately excluded here.
 */
export function hasPortalAnswerableMissingInformation(topic: PortalComplianceTopic): boolean {
  return topic.missingInformation.some(
    (info) => info.portalAnswerable === true && typeof info.questionKey === "string" && info.questionKey.trim().length > 0,
  );
}

/**
 * Assigns each topic to exactly one bucket so the summary tiles never
 * double-count. The immediate next actor decides the PRIMARY customer-facing
 * bucket; the raw backend state is preserved as secondary truthful context.
 */
export function classifyTopic(topic: PortalComplianceTopic): ComplianceBucket {
  if (hasPortalAnswerableMissingInformation(topic)) return "CUSTOMER_ACTION";
  if (topic.state === "LAWYER_REVIEW_REQUIRED") return "LAWYER_REVIEW";
  if (topic.state === "ACTION_IN_PROGRESS") return "IN_PROGRESS";
  if (topic.state === "MORE_INFORMATION_NEEDED" || topic.state === "REVIEW_RECOMMENDED" || topic.missingInformation.length > 0) {
    return "CUSTOMER_ACTION";
  }
  if (topic.state === "RESOLVED" && topic.missingInformation.length === 0) return "NO_ACTION";
  return "CUSTOMER_ACTION";
}

/** Primary badge text for a topic: the bucket label, refined when the customer owes portal-answerable data. */
export function primaryBadgeLabel(topic: PortalComplianceTopic, bucket: ComplianceBucket): string {
  if (bucket === "CUSTOMER_ACTION" && hasPortalAnswerableMissingInformation(topic)) {
    return "Adatra várunk Öntől";
  }
  return bucketLabels[bucket];
}

/** Secondary, non-contradictory context when the backend state is lawyer review but the customer is the next actor. */
export function secondaryStateNote(topic: PortalComplianceTopic, bucket: ComplianceBucket): string | null {
  if (bucket === "CUSTOMER_ACTION" && topic.state === "LAWYER_REVIEW_REQUIRED") {
    return "Emellett ügyvédi vizsgálat is folyamatban van.";
  }
  return null;
}

/** The next step shown to the customer. */
export function nextActionFor(topic: PortalComplianceTopic, bucket: ComplianceBucket): string | null {
  if (bucket === "CUSTOMER_ACTION" && topic.state === "LAWYER_REVIEW_REQUIRED" && hasPortalAnswerableMissingInformation(topic)) {
    return "Kérjük, adja meg az alábbi hiányzó adatokat a portálon.";
  }
  return topic.nextAction;
}

/** Real counts derived only from the returned topic collection. */
export function summarizeTopics(topics: PortalComplianceTopic[]): Record<ComplianceBucket, number> {
  const counts: Record<ComplianceBucket, number> = { CUSTOMER_ACTION: 0, IN_PROGRESS: 0, LAWYER_REVIEW: 0, NO_ACTION: 0 };
  for (const topic of topics) counts[classifyTopic(topic)] += 1;
  return counts;
}

/**
 * Three truthful overview numbers derived only from the shared primary buckets.
 * The categories are mutually exclusive and partition every topic; no score,
 * ratio or percentage is derived here.
 */
export function summaryGroups(topics: PortalComplianceTopic[]): {
  customerAction: number;
  atOffice: number;
  noAction: number;
} {
  const counts = summarizeTopics(topics);
  return {
    customerAction: counts.CUSTOMER_ACTION,
    atOffice: counts.IN_PROGRESS + counts.LAWYER_REVIEW,
    noAction: counts.NO_ACTION,
  };
}

/** CUSTOMER next-action dimension only. Never describes office processing. */
export function customerActionNote(topic: PortalComplianceTopic): string {
  const answerable = topic.missingInformation.filter(
    (info) => info.portalAnswerable === true && typeof info.questionKey === "string" && info.questionKey.trim().length > 0,
  ).length;
  if (answerable > 0) return `Öntől szükséges: ${answerable} adat megadása`;
  if (classifyTopic(topic) === "CUSTOMER_ACTION") return "Öntől szükséges: a terület áttekintése";
  return "Öntől jelenleg nincs várt adatmegadási teendő.";
}

/** OFFICE processing dimension, derived only from the safe client-facing topic state. */
export function officeProcessingNote(topic: PortalComplianceTopic): string {
  switch (topic.state) {
    case "LAWYER_REVIEW_REQUIRED":
      return "Irodai feldolgozás: ügyvédi vizsgálat folyamatban";
    case "ACTION_IN_PROGRESS":
      return "Irodai feldolgozás: feldolgozás folyamatban";
    case "MORE_INFORMATION_NEEDED":
      return "Irodai feldolgozás: a beérkezett adatok ellenőrzése folyamatban";
    case "REVIEW_RECOMMENDED":
      return "Irodai feldolgozás: belső áttekintés előkészítés alatt";
    case "RESOLVED":
      return topic.missingInformation.length === 0
        ? "Irodai feldolgozás: nincs nyitott lépés"
        : "Irodai feldolgozás: további egyeztetés szükséges";
    default:
      return "Irodai feldolgozás: folyamatban";
  }
}

/** Local, frontend-only search + status filter over already loaded topics. */
export function filterTopics(
  topics: PortalComplianceTopic[],
  search: string,
  statusFilter: ComplianceBucket | "ALL",
): PortalComplianceTopic[] {
  const query = search.trim().toLowerCase();
  return topics.filter((topic) => {
    if (statusFilter !== "ALL" && classifyTopic(topic) !== statusFilter) return false;
    if (!query) return true;
    return `${topic.topicLabel} ${topic.shortExplanation}`.toLowerCase().includes(query);
  });
}

/** Control/checkpoint progress from the already-returned client-safe controlsSummary projection. */
export function controlProgressFor(
  topic: PortalComplianceTopic,
  controlsSummary: PortalComplianceControlSummary[] | undefined,
): { done: number; total: number; nextReviewAt: string | null } | null {
  const entry = (controlsSummary ?? []).find((candidate) => candidate.requirementTitle === topic.topicLabel);
  if (!entry || entry.controls.length === 0) return null;
  const done = entry.controls.filter((control) => control.implementationStatus === "IMPLEMENTED").length;
  const nextReviewAt = entry.controls
    .map((control) => control.nextReviewAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  return { done, total: entry.controls.length, nextReviewAt };
}

/** The raw client-safe control rows for a topic, matched by the same safe portal label. */
export function controlsFor(
  topic: PortalComplianceTopic,
  controlsSummary: PortalComplianceControlSummary[] | undefined,
): PortalComplianceControlSummary["controls"] {
  const entry = (controlsSummary ?? []).find((candidate) => candidate.requirementTitle === topic.topicLabel);
  return entry?.controls ?? [];
}

export type PortalAnswerPayload = {
  status: "ANSWERED";
  booleanValue?: boolean;
  numberValue?: number;
  enumValue?: string;
  dateValue?: string;
  stringValue?: string;
};

/** Builds the canonical typed answer payload for a portal-answerable missing item. */
export function buildAnswerPayload(info: PortalComplianceMissingInfo, answerInput: string): PortalAnswerPayload | null {
  if (!info.questionKey) return null;
  const trimmed = answerInput.trim();
  if (info.valueType !== "BOOLEAN" && !trimmed) return null;
  if (info.valueType === "BOOLEAN") {
    if (answerInput === "true" || answerInput === "false") {
      return { status: "ANSWERED", booleanValue: answerInput === "true" };
    }
    return null;
  }
  if (info.valueType === "NUMBER") {
    const numberValue = Number(trimmed);
    if (!Number.isFinite(numberValue) || (info.integerOnly && !Number.isInteger(numberValue))) return null;
    return { status: "ANSWERED", numberValue };
  }
  if (info.valueType === "ENUM") {
    if (info.options?.includes(trimmed)) return { status: "ANSWERED", enumValue: trimmed };
    return null;
  }
  if (info.valueType === "DATE") return { status: "ANSWERED", dateValue: trimmed };
  return { status: "ANSWERED", stringValue: trimmed };
}

/** After a successful inline profile answer both the compliance map and the profile completion refresh. */
export async function refreshAfterProfileAnswer(deps: {
  refreshCompliance: () => Promise<void>;
  refreshProfileCompletion: () => Promise<void>;
}): Promise<void> {
  await Promise.all([deps.refreshCompliance(), deps.refreshProfileCompletion()]);
}

export function topicStateLabel(topic: PortalComplianceTopic): string {
  switch (topic.state) {
    case "LAWYER_REVIEW_REQUIRED":
      return "Ügyvédi vizsgálat alatt";
    case "ACTION_IN_PROGRESS":
      return "Folyamatban";
    case "MORE_INFORMATION_NEEDED":
    case "REVIEW_RECOMMENDED":
      return "Teendőt igényel";
    case "RESOLVED":
      return "Jelenleg nincs Öntől várt teendő";
    default:
      return "Vizsgálat alatt";
  }
}

// ---------------------------------------------------------------------------
// Company-level requested documents / open questions (safe projection)
// ---------------------------------------------------------------------------

const requestStateLabels: Record<PortalComplianceRequestState, string> = {
  AWAITING_CUSTOMER: "Válaszra vár Öntől",
  OFFICE_PROCESSING: "Irodai feldolgozás alatt",
  CLOSED: "Lezárt",
};

const requestStateTone: Record<PortalComplianceRequestState, "amber" | "gold" | "green"> = {
  AWAITING_CUSTOMER: "amber",
  OFFICE_PROCESSING: "gold",
  CLOSED: "green",
};

/** Customer-facing label for a projected request state. Never a raw internal enum. */
export function requestStateLabel(state: PortalComplianceRequestState): string {
  return requestStateLabels[state] ?? "Irodai feldolgozás alatt";
}

/** Groups the company projection into the three truthful customer states. */
export function groupComplianceRequests(items: PortalComplianceRequest[]): {
  awaiting: PortalComplianceRequest[];
  office: PortalComplianceRequest[];
  closed: PortalComplianceRequest[];
} {
  return {
    awaiting: items.filter((item) => item.state === "AWAITING_CUSTOMER"),
    office: items.filter((item) => item.state === "OFFICE_PROCESSING"),
    closed: items.filter((item) => item.state === "CLOSED"),
  };
}

/**
 * Canonical customer request detail route. Mirrors the shared helper used by
 * the matter task surface without importing it (avoids a module cycle).
 */
function requestDetailHref(caseId: string | null, requestId: string): string {
  if (!caseId) return "/portal/ugyek";
  return `/portal/matters/${encodeURIComponent(caseId)}/requests/${encodeURIComponent(requestId)}`;
}

type ComplianceSection = "ATTEKINTES" | "TEENDOK" | "DOKUMENTUMOK" | "KERDESEK" | "ALLAPOTOK";

const sectionNav: Array<{ id: ComplianceSection; label: string }> = [
  { id: "ATTEKINTES", label: "Áttekintés" },
  { id: "TEENDOK", label: "Teendők" },
  { id: "DOKUMENTUMOK", label: "Dokumentumok" },
  { id: "KERDESEK", label: "Kérdések és kérések" },
  { id: "ALLAPOTOK", label: "Állapotok" },
];

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

type IconKind = "shield" | "megaphone" | "lock" | "helmet" | "bank" | "doc";

function iconKind(topicId: string): IconKind {
  const id = topicId.toLowerCase();
  if (id.includes("whistle")) return "megaphone";
  if (id.includes("nis2") || id.includes("cyber") || id.includes("security")) return "lock";
  if (id.includes("labor") || id.includes("safety") || id.includes("workplace") || id.includes("occupational")) return "helmet";
  if (id.includes("money") || id.includes("aml") || id.includes("laundering")) return "bank";
  if (id.includes("gdpr") || id.includes("data") || id.includes("privacy")) return "shield";
  return "doc";
}

function TopicGlyph({ kind }: { kind: IconKind }) {
  const cls = "h-4 w-4";
  const common = { className: cls, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "shield":
      return <svg {...common}><path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6l7-3z" /></svg>;
    case "megaphone":
      return <svg {...common}><path d="M4 10v4h3l6 4V6L7 10H4z" /><path d="M17 9a4 4 0 0 1 0 6" /></svg>;
    case "lock":
      return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case "helmet":
      return <svg {...common}><path d="M4 15a8 8 0 0 1 16 0" /><path d="M10 7h4v8h-4z" /><path d="M3 15h18" /></svg>;
    case "bank":
      return <svg {...common}><path d="M4 10h16M5 10V7l7-3 7 3v3M6 10v8m4-8v8m4-8v8m4-8v8M4 18h16" /></svg>;
    default:
      return <svg {...common}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>;
  }
}

/** Published customer documents only. Renders nothing when the safe projection is empty. */
export function TopicDocuments({ documents }: { documents: PortalComplianceDocument[] }) {
  if (documents.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Közzétett dokumentumok</p>
      <ul className="mt-2 space-y-2">
        {documents.map((doc) => (
          <li key={doc.publicationId} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white p-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-green-800)]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>
              </span>
              <div className="min-w-0">
                <p className="font-medium text-[var(--adm-text)]">{doc.title}</p>
                <p className="mt-0.5 text-xs text-[var(--adm-text-muted)]">
                  {doc.versionLabel}
                  {doc.publishedAt ? ` · Közzétéve: ${formatDate(doc.publishedAt)}` : ""}
                </p>
                {doc.downloadAvailable ? (
                  <a
                    href={portalDownloadUrl(doc.publicationId)}
                    className="mt-2 inline-block rounded-[var(--adm-radius-sm)] border border-[var(--adm-terracotta-700)] px-3 py-1 text-xs font-semibold text-[var(--adm-terracotta-700)] hover:bg-[var(--adm-terracotta-100)]"
                  >
                    Letöltés
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusCard({ label, count, hint }: { label: string; count: number; hint: string }) {
  return (
    <AdminPanel className="p-4">
      <span className="block text-[26px] font-semibold text-[var(--adm-text)]">{count}</span>
      <span className="mt-1 block text-[12px] font-semibold text-[var(--adm-green-900)]">{label}</span>
      <span className="mt-1 block text-[11px] text-[var(--adm-text-muted)]">{hint}</span>
    </AdminPanel>
  );
}

function WorklistRow({ item }: { item: WorklistItem }) {
  return (
    <li className="border-t border-[var(--adm-border)] px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[var(--adm-text)]">{item.title}</p>
          {item.context ? <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">Adatforrás: {item.context}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <AdminStatusPill tone={item.tone}>{item.stateLabel}</AdminStatusPill>
            {item.dueAt ? <span className="text-[11px] text-[var(--adm-text-muted)]">Határidő: {formatDate(item.dueAt)}</span> : null}
          </div>
        </div>
        <Link href={item.href} className="shrink-0 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">
          {item.ctaLabel}
        </Link>
      </div>
    </li>
  );
}

/**
 * Groups the customer-answerable missing facts for a topic. Portal-answerable
 * items keep the canonical typed answer mechanism; everything else is routed to
 * office coordination instead of offering a fake CTA.
 */
function TopicMissingInformation({
  topic,
  activeQuestionKey,
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
    <li key={`${info.questionKey ?? info.label}-${idx}`} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-[var(--adm-text)]">{info.label}</span>
        {info.portalAnswerable && info.questionKey ? (
          activeQuestionKey === info.questionKey ? null : (
            <AdminButton size="xs" variant="primary" onClick={() => onStart(info.questionKey!)}>
              Adat megadása →
            </AdminButton>
          )
        ) : (
          <span className="text-xs text-[var(--adm-text-muted)]">Irodai egyeztetés szükséges</span>
        )}
      </div>

      {info.portalAnswerable && info.questionKey && activeQuestionKey === info.questionKey ? (
        <div className="mt-2 space-y-2">
          {info.valueType === "BOOLEAN" ? (
            <select className={inputClass} value={answerInput} onChange={(e) => onAnswerChange(e.target.value)} disabled={saving}>
              <option value="">Válasszon</option>
              <option value="true">Igen</option>
              <option value="false">Nem</option>
            </select>
          ) : info.valueType === "ENUM" ? (
            <select className={inputClass} value={answerInput} onChange={(e) => onAnswerChange(e.target.value)} disabled={saving}>
              <option value="">Válasszon</option>
              {(info.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : (
            <input
              type={info.valueType === "NUMBER" ? "number" : info.valueType === "DATE" ? "date" : "text"}
              step={info.valueType === "NUMBER" ? (info.integerOnly ? 1 : "any") : undefined}
              className={inputClass}
              placeholder="Érték megadása..."
              value={answerInput}
              onChange={(e) => onAnswerChange(e.target.value)}
              disabled={saving}
            />
          )}
          {actionError ? <p className="text-xs text-[var(--adm-terracotta-700)]">{actionError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <AdminButton size="xs" variant="primary" onClick={() => onSave(info)} disabled={saving || !answerInput.trim()}>
              {saving ? "Mentés…" : "Mentés"}
            </AdminButton>
            <AdminButton size="xs" variant="neutral" onClick={() => onMarkUnknown(info.questionKey!)} disabled={saving}>
              Nem ismertként jelölés
            </AdminButton>
            <AdminButton size="xs" variant="ghost" onClick={onCancel}>
              Mégse
            </AdminButton>
          </div>
        </div>
      ) : null}
    </li>
  );

  if (topic.missingInformation.length === 0) {
    return <CompactState title="Jelenleg nincs Öntől várt hiányzó adat ehhez a területhez." />;
  }

  return (
    <div className="space-y-4">
      {answerable.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Ön által megadható adatok</p>
          <ul className="mt-2 space-y-2">{answerable.map(renderItem)}</ul>
        </div>
      ) : null}
      {officeOnly.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Irodai egyeztetést igénylő adatok</p>
          <ul className="mt-2 space-y-2">{officeOnly.map(renderItem)}</ul>
        </div>
      ) : null}
    </div>
  );
}

/** Compact control/checkpoint rows derived exclusively from controlsSummary. */
function TopicControls({
  topic,
  controlsSummary,
}: {
  topic: PortalComplianceTopic;
  controlsSummary: PortalComplianceControlSummary[] | undefined;
}) {
  const controls = controlsFor(topic, controlsSummary);
  if (controls.length === 0) {
    return <CompactState title="Ehhez a területhez még nem érhető el intézkedési összegzés." />;
  }
  return (
    <ul className="space-y-2">
      {controls.map((control, idx) => (
        <li key={`${control.title}-${idx}`} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-[var(--adm-text)]">{control.title}</span>
            <AdminStatusPill tone="neutral" dot={false}>
              {controlStatusLabel(control.implementationStatus)}
            </AdminStatusPill>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--adm-text-muted)]">
            <span>Érvényes, elfogadott bizonyíték: <b>{control.evidence.acceptedCurrent}</b></span>
            {control.evidence.stale > 0 ? <span>Lejárt bizonyíték: <b>{control.evidence.stale}</b></span> : null}
            {control.evidence.missing ? <span>Nincs érvényes bizonyíték</span> : null}
            {control.lastReviewedAt ? <span>Utolsó felülvizsgálat: {formatDate(control.lastReviewedAt)}</span> : null}
            {control.nextReviewAt ? <span>Következő felülvizsgálat: {formatDate(control.nextReviewAt)}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Truthful, non-technical description of how the map is produced. */
function HowMapIsBuilt() {
  const steps: Array<{ title: string; body: string }> = [
    { title: "1. Rögzített tények", body: "A vállalat profiljában megadott strukturált adatok (pl. létszám, tevékenységek, rendszerek)." },
    { title: "2. Dokumentumok", body: "Érvényes belső szabályzatok, szerződések, adatkezelési tájékoztatók és jegyzőkönyvek megléte." },
    { title: "3. Ügyvédi vizsgálat", body: "A jogi szakértők által elvégzett átvilágítási megállapítások és jóváhagyott lépések." },
  ];
  return (
    <AdminPanel className="overflow-hidden">
      <AdminSectionHeader
        title="Hogyan készül a compliance térkép?"
        subtitle="Az Adminiculum a jogi és megfelelési állapotot kizárólag ellenőrizhető tényekre alapozza."
      />
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {steps.map((step) => (
          <div key={step.title} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
            <p className="text-[12px] font-semibold text-[var(--adm-text)]">{step.title}</p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--adm-text-muted)]">{step.body}</p>
          </div>
        ))}
      </div>
    </AdminPanel>
  );
}

/** Focused topic-detail surface built from the SAME client-safe topic DTO. */
export function TopicDetailView({
  topic,
  bucket,
  controlsSummary,
  onBack,
  missingInformationSection,
  showHowMap = true,
}: {
  topic: PortalComplianceTopic;
  bucket: ComplianceBucket;
  controlsSummary: PortalComplianceControlSummary[] | undefined;
  onBack: () => void;
  missingInformationSection: ReactNode;
  showHowMap?: boolean;
}) {
  const nextAction = nextActionFor(topic, bucket);
  const progress = controlProgressFor(topic, controlsSummary);
  return (
    <div className="space-y-4" data-testid="org-compliance-topic-detail">
      <AdminPanel className="overflow-hidden">
        <div className="border-b border-[var(--adm-border)] p-4 sm:p-5">
          <AdminButton size="xs" variant="ghost" onClick={onBack}>
            ← Vissza az áttekintéshez
          </AdminButton>
          <p className="mt-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Megfelelési terület</p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <h1 className="font-serif text-[26px] font-medium leading-tight text-[var(--adm-text)]">{topic.topicLabel}</h1>
              <p className="mt-2 text-[12px] leading-5 text-[var(--adm-text-muted)]">{topic.shortExplanation}</p>
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <AdminStatusPill tone={bucketTone[bucket]}>{primaryBadgeLabel(topic, bucket)}</AdminStatusPill>
              <span className="text-[11px] font-semibold text-[var(--adm-text)]">{customerActionNote(topic)}</span>
              <span className="text-[11px] text-[var(--adm-text-muted)]">{officeProcessingNote(topic)}</span>
            </div>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminSectionHeader title="Miért érinti a céget?" />
        <p className="p-4 text-[12px] leading-5 text-[var(--adm-text)]">{topic.shortExplanation}</p>
      </AdminPanel>

      <AdminPanel>
        <AdminSectionHeader title="Következő lépés" />
        <div className="p-4">
          {nextAction ? (
            <p className="text-[12px] text-[var(--adm-terracotta-700)]">{nextAction}</p>
          ) : (
            <p className="text-[12px] text-[var(--adm-text-muted)]">Jelenleg nincs Ön felé mutató következő lépés ezen a területen.</p>
          )}
        </div>
      </AdminPanel>

      <AdminPanel data-testid="org-compliance-missing-information">
        <AdminSectionHeader title="Hiányzó információk" subtitle="A portálon megválaszolható adatokat itt tudja rögzíteni. A többi adathoz irodai egyeztetés szükséges." />
        <div className="p-4">{missingInformationSection}</div>
      </AdminPanel>

      <AdminPanel data-testid="org-compliance-documents">
        <AdminSectionHeader title="Dokumentumok" />
        <div className="p-4">
          {topic.documents.length > 0 ? (
            <TopicDocuments documents={topic.documents} />
          ) : (
            <CompactState title="Ehhez a területhez még nem tettek közzé ügyfélnek szánt dokumentumot." />
          )}
        </div>
      </AdminPanel>

      <AdminPanel data-testid="org-compliance-controls">
        <AdminSectionHeader title="Intézkedések és ellenőrzési pontok" subtitle="Az iroda által rögzített intézkedések és felülvizsgálati pontok összegzése." />
        <div className="p-4">
          <TopicControls topic={topic} controlsSummary={controlsSummary} />
          {progress ? (
            <p className="mt-3 text-[11px] text-[var(--adm-text-muted)]">
              Implementált kontrollok: <b>{progress.done} / {progress.total}</b>
              {progress.nextReviewAt ? ` · Következő felülvizsgálat: ${formatDate(progress.nextReviewAt)}` : ""}
            </p>
          ) : null}
        </div>
      </AdminPanel>

      {showHowMap ? <HowMapIsBuilt /> : null}
    </div>
  );
}

/** Customer-safe URL query parameter that selects a topic detail. */
export const COMPLIANCE_TOPIC_QUERY_PARAM = "topic";

/** Reads the selected customer-safe topic id from a location search string. */
export function readTopicParam(search: string): string | null {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const value = params.get(COMPLIANCE_TOPIC_QUERY_PARAM);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

/** Returns a location search string with the topic parameter set or removed. */
export function withTopicParam(search: string, topicId: string | null): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (topicId && topicId.trim()) params.set(COMPLIANCE_TOPIC_QUERY_PARAM, topicId);
  else params.delete(COMPLIANCE_TOPIC_QUERY_PARAM);
  const next = params.toString();
  return next ? `?${next}` : "";
}

function PublishedDocumentsPanel({ topics }: { topics: PortalComplianceTopic[] }) {
  const documents = topics.flatMap((topic) => topic.documents);
  return (
    <AdminPanel>
      <AdminSectionHeader
        title="Már megadott / elérhető"
        subtitle="Az iroda által közzétett, Önnek szánt dokumentumok."
        action={<AdminStatusPill tone="neutral" dot={false}>{documents.length} dokumentum</AdminStatusPill>}
      />
      <div className="p-4">
        {documents.length > 0 ? (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li key={doc.publicationId} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white p-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--adm-text)]">{doc.title}</p>
                  <p className="text-[11px] text-[var(--adm-text-muted)]">
                    {doc.versionLabel}
                    {doc.publishedAt ? ` · Közzétéve: ${formatDate(doc.publishedAt)}` : ""}
                  </p>
                </div>
                {doc.downloadAvailable ? (
                  <a href={portalDownloadUrl(doc.publicationId)} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">
                    Letöltés
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <CompactState title="Jelenleg nincs közzétett, Önnek szánt dokumentum." />
        )}
      </div>
    </AdminPanel>
  );
}

function RequestedDocumentsPanel({ requests }: { requests: PortalComplianceRequest[] }) {
  const items = requests.filter((item) => item.category === "DOCUMENT");
  return (
    <AdminPanel>
      <AdminSectionHeader
        title="Bekért dokumentumok"
        subtitle="Kizárólag az iroda által benyújtásra kért dokumentumok jelennek meg itt."
        action={<AdminStatusPill tone="neutral" dot={false}>{items.length} bekérés</AdminStatusPill>}
      />
      <div className="p-4">
        {items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--adm-text)]">{item.title}</p>
                    {item.contextLabel ? <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">Adatforrás: {item.contextLabel}</p> : null}
                    {item.instructions ? <p className="mt-1 text-[11px] leading-5 text-[var(--adm-text-muted)]">{item.instructions}</p> : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <AdminStatusPill tone={requestStateTone[item.state]}>{requestStateLabel(item.state)}</AdminStatusPill>
                      {item.dueAt ? <span className="text-[11px] text-[var(--adm-text-muted)]">Határidő: {formatDate(item.dueAt)}</span> : null}
                    </div>
                  </div>
                  <Link href={requestDetailHref(item.caseId, item.id)} className="shrink-0 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">
                    {item.canUpload ? "Feltöltés" : "Megnyitás"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <CompactState title="Jelenleg nincs Öntől bekért dokumentum." />
        )}
      </div>
    </AdminPanel>
  );
}

function RequestGroup({ title, items }: { title: string; items: PortalComplianceRequest[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{title}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--adm-text)]">{item.title}</p>
                {item.contextLabel ? <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">Adatforrás: {item.contextLabel}</p> : null}
                {item.instructions ? <p className="mt-1 text-[11px] leading-5 text-[var(--adm-text-muted)]">{item.instructions}</p> : null}
                {item.dueAt ? <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Határidő: {formatDate(item.dueAt)}</p> : null}
              </div>
              <Link href={requestDetailHref(item.caseId, item.id)} className="shrink-0 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">
                Megnyitás
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrgComplianceView() {
  const [data, setData] = useState<PortalComplianceReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileCompletion, setProfileCompletion] = useState<{ answered: number; total: number } | null>(null);

  const [requests, setRequests] = useState<PortalComplianceRequest[] | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  // Inline answering state for portal-answerable missing info
  const [activeQuestionKey, setActiveQuestionKey] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplianceBucket | "ALL">("ALL");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [section, setSection] = useState<ComplianceSection>("ATTEKINTES");

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
      // Canonical completion: only ANSWERED facts count (UNKNOWN does not), over
      // the facts reachable through the current adaptive screens.
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
  }, [load, loadProfile, loadRequests]);

  // URL-backed, refresh-safe topic selection. `popstate` keeps back/forward in sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSelectedTopicId(readTopicParam(window.location.search));
    const onPopState = () => setSelectedTopicId(readTopicParam(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const topics = useMemo(() => data?.topics || [], [data]);

  const bucketFor = useMemo(() => {
    const map = new Map<string, ComplianceBucket>();
    for (const topic of topics) map.set(topic.topicId, classifyTopic(topic));
    return map;
  }, [topics]);

  const groups = useMemo(() => summaryGroups(topics), [topics]);

  const visibleTopics = useMemo(() => filterTopics(topics, search, statusFilter), [topics, search, statusFilter]);

  const requestGroups = useMemo(() => groupComplianceRequests(requests ?? []), [requests]);

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
        href: requestDetailHref(request.caseId, request.id),
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
        href: withTopicParam("", topic.topicId),
        ctaLabel: "Adat megadása →",
      });
    }
    return items;
  }, [requestGroups, topics]);

  // A stale or unknown ?topic= value safely falls back to the overview.
  useEffect(() => {
    if (!data || !selectedTopicId) return;
    if (topics.some((topic) => topic.topicId === selectedTopicId)) return;
    setSelectedTopicId(null);
    if (typeof window !== "undefined") {
      const nextSearch = withTopicParam(window.location.search, null);
      window.history.replaceState({}, "", `${window.location.pathname}${nextSearch}${window.location.hash}`);
    }
  }, [data, topics, selectedTopicId]);

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
      await answerPortalCompanyProfileQuestion(questionKey, {
        status: "UNKNOWN",
      });
      setActionSuccess("Jelezve az iroda felé, hogy az adat nem ismert.");
      setActiveQuestionKey(null);
      setAnswerInput("");
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

  const applyTopicSelection = useCallback((topicId: string | null) => {
    setSelectedTopicId(topicId);
    setActiveQuestionKey(null);
    setAnswerInput("");
    setActionError(null);
    setActionSuccess(null);
    if (typeof window === "undefined") return;
    const nextSearch = withTopicParam(window.location.search, topicId);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const next = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    if (next !== current) window.history.pushState({}, "", next);
  }, []);

  const openTopic = (topicId: string) => applyTopicSelection(topicId);
  const closeTopic = () => applyTopicSelection(null);

  if (loading) return <section className={card}>Megfelelési áttekintés betöltése…</section>;
  if (error) return <section className={card}>{error}</section>;

  const selectedTopic = selectedTopicId ? topics.find((topic) => topic.topicId === selectedTopicId) ?? null : null;

  if (selectedTopic) {
    const bucket = bucketFor.get(selectedTopic.topicId) ?? classifyTopic(selectedTopic);
    return (
      <div className="space-y-4" data-testid="org-compliance-view">
        {actionSuccess ? <CompactState title={actionSuccess} /> : null}
        <TopicDetailView
          topic={selectedTopic}
          bucket={bucket}
          controlsSummary={data?.controlsSummary}
          onBack={closeTopic}
          missingInformationSection={
            <TopicMissingInformation
              topic={selectedTopic}
              activeQuestionKey={activeQuestionKey}
              answerInput={answerInput}
              saving={saving}
              actionError={actionError}
              onStart={(questionKey) => {
                setActiveQuestionKey(questionKey);
                setAnswerInput("");
                setActionError(null);
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
      <OperationalPageHeader
        title="Megfelelés"
        subtitle="A vállalkozás érintett megfelelési területei, az Öntől várt lépések, a bekérések és az iroda állapotai egy helyen."
        secondaryActions={
          <Link href="/portal/vallalat" className="rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">
            Vállalati profil
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2" data-testid="compliance-section-nav">
        {sectionNav.map((entry) => (
          <AdminButton
            key={entry.id}
            size="xs"
            variant={section === entry.id ? "primary" : "neutral"}
            aria-pressed={section === entry.id}
            onClick={() => setSection(entry.id)}
          >
            {entry.label}
          </AdminButton>
        ))}
      </div>

      {actionSuccess ? <CompactState title={actionSuccess} /> : null}

      {section === "ATTEKINTES" ? (
        <div className="space-y-4">
          <AdminPanel>
            <AdminSectionHeader title="Áttekintés" subtitle="Valós darabszámok. Nincs pontszám és nincs százalékos minősítés." />
            <div className="grid gap-3 p-4 sm:grid-cols-3">
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
                label="Jelenleg nincs ügyfélteendő"
                count={groups.noAction + requestGroups.closed.length}
                hint="Ezen a területen jelenleg nincs nyitott ügyféllépés."
              />
            </div>
            <div className="space-y-1 border-t border-[var(--adm-border)] px-4 py-3 text-[11px] text-[var(--adm-text-muted)]">
              <p>Vállalati profil · {profileHint}</p>
              <p>A megjelenített megfelelési állapotok nem jelentenek felelősségkizáró abszolút garanciát vagy 100%-os minősítést.</p>
            </div>
          </AdminPanel>

          <AdminPanel>
            <AdminSectionHeader title="Mit kell most tennem?" subtitle="Az Ön következő lépései." />
            {worklist.length > 0 ? (
              <ul>{worklist.slice(0, 4).map((item) => <WorklistRow key={item.key} item={item} />)}</ul>
            ) : (
              <div className="p-4">
                <CompactState title="Jelenleg nincs Öntől várt teendő." detail="Ha az iroda új kérést tesz közzé, az itt jelenik meg." />
              </div>
            )}
            {worklist.length > 4 ? (
              <div className="border-t border-[var(--adm-border)] px-4 py-2">
                <AdminButton size="xs" variant="ghost" onClick={() => setSection("TEENDOK")}>
                  Összes teendő ({worklist.length}) →
                </AdminButton>
              </div>
            ) : null}
          </AdminPanel>

          <AdminPanel>
            <AdminSectionHeader title="Mi van az irodánál?" subtitle="Az iroda által feldolgozás alatt tartott kérések." />
            <div className="p-4">
              {requestGroups.office.length > 0 ? (
                <RequestGroup title="Irodai feldolgozás alatt" items={requestGroups.office} />
              ) : (
                <CompactState title="Jelenleg nincs irodai feldolgozás alatt lévő kérése." />
              )}
            </div>
          </AdminPanel>
        </div>
      ) : null}

      {section === "TEENDOK" ? (
        <AdminPanel>
          <AdminSectionHeader title="Teendők" subtitle="Egységes ügyfél-teendőlista: adatmegadás, dokumentumbekérés és kérdés." />
          {worklist.length > 0 ? (
            <ul>{worklist.map((item) => <WorklistRow key={item.key} item={item} />)}</ul>
          ) : (
            <div className="p-4">
              <CompactState title="Jelenleg nincs Öntől várt teendő." detail="Ha az iroda új kérést tesz közzé, az itt jelenik meg." />
            </div>
          )}
        </AdminPanel>
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
        <AdminPanel>
          <AdminSectionHeader title="Kérdések és kérések" subtitle="Az iroda által közzétett, Önnek szánt megkeresések." />
          <div className="space-y-4 p-4">
            {requestsError ? (
              <div role="alert">
                <SafePanelError detail="A kérdések és kérések betöltése nem sikerült." onRetry={() => void loadRequests()} />
              </div>
            ) : requestGroups.awaiting.filter((item) => item.category === "QUESTION").length === 0 &&
              requestGroups.office.filter((item) => item.category === "QUESTION").length === 0 &&
              requestGroups.closed.filter((item) => item.category === "QUESTION").length === 0 ? (
              <CompactState title="Jelenleg nincs Önnek szóló kérdés vagy kérés." />
            ) : (
              <>
                <RequestGroup title="Válaszra vár Öntől" items={requestGroups.awaiting.filter((item) => item.category === "QUESTION")} />
                <RequestGroup title="Irodai feldolgozás alatt" items={requestGroups.office.filter((item) => item.category === "QUESTION")} />
                <RequestGroup title="Lezárt" items={requestGroups.closed.filter((item) => item.category === "QUESTION")} />
              </>
            )}
          </div>
        </AdminPanel>
      ) : null}

      {section === "ALLAPOTOK" ? (
        <AdminPanel>
          <AdminSectionHeader
            title="Állapotok"
            subtitle="Az Ön következő lépése és az irodai feldolgozás külön dimenzióban jelenik meg."
            action={<AdminStatusPill tone="neutral" dot={false}>{visibleTopics.length} megjelenített terület</AdminStatusPill>}
          />
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--adm-border)] px-4 py-3">
            <input
              type="search"
              className={`${inputClass} sm:w-64`}
              placeholder="Terület keresése…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className={`${inputClass} sm:w-52`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ComplianceBucket | "ALL")}>
              <option value="ALL">Minden állapot</option>
              {(["CUSTOMER_ACTION", "IN_PROGRESS", "LAWYER_REVIEW", "NO_ACTION"] as ComplianceBucket[]).map((bucket) => (
                <option key={bucket} value={bucket}>{bucketLabels[bucket]}</option>
              ))}
            </select>
          </div>

          {topics.length === 0 ? (
            <div className="p-4">
              <CompactState title="Ehhez a vállalkozáshoz még nem készült megfelelési értékelés." />
            </div>
          ) : visibleTopics.length === 0 ? (
            <div className="p-4">
              <CompactState title="Nincs a keresésnek vagy a szűrőnek megfelelő terület." />
            </div>
          ) : (
            <ul>
              {visibleTopics.map((topic) => {
                const bucket = bucketFor.get(topic.topicId) ?? "CUSTOMER_ACTION";
                const progress = controlProgressFor(topic, data?.controlsSummary);
                const nextAction = nextActionFor(topic, bucket);
                return (
                  <li key={topic.topicId} className="border-t border-[var(--adm-border)] px-4 py-3 first:border-t-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 max-w-2xl">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-green-800)]">
                            <TopicGlyph kind={iconKind(topic.topicId)} />
                          </span>
                          <h3 className="text-[14px] font-semibold text-[var(--adm-text)]">{topic.topicLabel}</h3>
                        </div>
                        <p className="mt-1 text-[12px] text-[var(--adm-text-muted)]">{topic.shortExplanation}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <AdminStatusPill tone={bucketTone[bucket]}>{primaryBadgeLabel(topic, bucket)}</AdminStatusPill>
                          <span className="text-[11px] font-semibold text-[var(--adm-text)]">{customerActionNote(topic)}</span>
                          <span className="text-[11px] text-[var(--adm-text-muted)]">{officeProcessingNote(topic)}</span>
                        </div>
                        {nextAction ? <p className="mt-1.5 text-[11px] text-[var(--adm-terracotta-700)]">Következő lépés: {nextAction}</p> : null}
                        {topic.documents.length > 0 ? (
                          <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{`Közzétett ügyfél-dokumentum: ${topic.documents.length}`}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        {progress ? (
                          <span className="text-[11px] text-[var(--adm-text-muted)]">
                            Implementált kontrollok: <b>{progress.done} / {progress.total}</b>
                            {progress.nextReviewAt ? ` · Következő felülvizsgálat: ${formatDate(progress.nextReviewAt)}` : ""}
                          </span>
                        ) : null}
                        <AdminButton size="xs" variant="neutral" onClick={() => openTopic(topic.topicId)}>
                          Részletek megnyitása →
                        </AdminButton>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </AdminPanel>
      ) : null}

      {section === "ALLAPOTOK" ? <HowMapIsBuilt /> : null}
    </div>
  );
}
