"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getPortalCompliance,
  answerPortalCompanyProfileQuestion,
  getPortalCompanyProfileDiscovery,
  portalDownloadUrl,
  type PortalComplianceReadModel,
  type PortalComplianceTopic,
  type PortalComplianceMissingInfo,
  type PortalComplianceDocument,
  type PortalComplianceControlSummary,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { companyProfileCompletion } from "@/lib/companyProfileCompletion";
import { formatDate } from "./MatterWorkspace";

const card = "min-w-0 rounded-3xl border border-[#eadfbf] bg-white p-5 shadow-sm sm:p-6";
const inputClass =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-[#b95e4b] focus:outline-none focus:ring-2 focus:ring-[#b95e4b]/25 disabled:bg-stone-50 disabled:text-stone-500";

type ComplianceBucket = "CUSTOMER_ACTION" | "IN_PROGRESS" | "LAWYER_REVIEW" | "NO_ACTION";

const bucketLabels: Record<ComplianceBucket, string> = {
  CUSTOMER_ACTION: "Teendő tőletek",
  IN_PROGRESS: "Folyamatban",
  LAWYER_REVIEW: "Ügyvédi vizsgálat",
  NO_ACTION: "Nincs jelenlegi teendő",
};

const bucketBadge: Record<ComplianceBucket, string> = {
  CUSTOMER_ACTION: "bg-[#fbeae6] text-[#8a4536] border-[#e3b7ab]",
  IN_PROGRESS: "bg-[#f7f1e2] text-[#7a5f18] border-[#d7c48a]",
  LAWYER_REVIEW: "bg-[#f3ead2] text-[#6f5514] border-[#d7c48a]",
  NO_ACTION: "bg-emerald-100 text-emerald-900 border-emerald-300",
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
 * double-count.
 *
 * The immediate next actor decides the PRIMARY customer-facing bucket. When the
 * customer has executable portal input outstanding, that is CUSTOMER_ACTION even
 * if the backend raw state also says LAWYER_REVIEW_REQUIRED — the customer is
 * simply the next actor. The raw backend state is never erased: it stays
 * available through `topicStateLabel`/`secondaryStateNote` as secondary truthful
 * context, and only becomes the primary bucket once no customer input is
 * outstanding. Review-recommended and in-progress keep their canonical meaning.
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

/**
 * Primary badge text for a topic: the bucket label, refined when the customer
 * specifically owes portal-answerable data. It is always derived from the same
 * bucket the summary tiles count, so badge and tile can never contradict.
 */
export function primaryBadgeLabel(topic: PortalComplianceTopic, bucket: ComplianceBucket): string {
  if (bucket === "CUSTOMER_ACTION" && hasPortalAnswerableMissingInformation(topic)) {
    return "Adatra várunk Öntől";
  }
  return bucketLabels[bucket];
}

/**
 * Secondary, non-contradictory context for the case where the backend raw state
 * is lawyer review but the immediate next actor is the customer. The raw state
 * is preserved as subordinate text, never as the primary badge.
 */
export function secondaryStateNote(topic: PortalComplianceTopic, bucket: ComplianceBucket): string | null {
  if (bucket === "CUSTOMER_ACTION" && topic.state === "LAWYER_REVIEW_REQUIRED") {
    return "Emellett ügyvédi vizsgálat is folyamatban van.";
  }
  return null;
}

/**
 * The next step shown to the customer. When the raw state is lawyer review but
 * the customer still owes executable data, the lawyer-oriented backend
 * `nextAction` must not be presented as the customer's next step; the immediate
 * step is supplying the data. Every other case keeps the canonical backend text.
 */
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
 * The three categories are mutually exclusive and partition every topic, so the
 * overview can never double-count or contradict an individual topic card:
 *
 * - customerAction: the customer is the immediate next actor.
 * - atOffice: the office is processing/reviewing; no immediate customer action.
 * - noAction: nothing is open on either side.
 *
 * No score, ratio or percentage is derived here.
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

/**
 * CUSTOMER next-action dimension only. "Öntől szükséges" always means the
 * customer is the immediate next actor; it never describes office processing.
 * The two dimensions are intentionally kept visually separate so a topic can be
 * "Öntől szükséges" and simultaneously under office review without either label
 * reading as a contradiction.
 */
export function customerActionNote(topic: PortalComplianceTopic): string {
  const answerable = topic.missingInformation.filter(
    (info) => info.portalAnswerable === true && typeof info.questionKey === "string" && info.questionKey.trim().length > 0,
  ).length;
  if (answerable > 0) return `Öntől szükséges: ${answerable} adat megadása`;
  if (classifyTopic(topic) === "CUSTOMER_ACTION") return "Öntől szükséges: a terület áttekintése";
  return "Öntől jelenleg nincs várt adatmegadási teendő.";
}

/**
 * OFFICE processing dimension, derived only from the safe client-facing topic
 * state. It is deliberately labeled "Irodai feldolgozás" and never as the topic
 * "state", so it can sit next to the customer dimension without implying that
 * the two are the same value.
 */
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

/**
 * Control/checkpoint progress from the already-returned client-safe
 * controlsSummary projection (matched by the topic's safe portal label).
 * Returns null when no authoritative projection exists for the topic.
 */
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

/**
 * The raw client-safe control rows for a topic, matched by the same safe portal
 * label used by `controlProgressFor`. When no authoritative projection exists
 * the caller receives an empty list and must show a truthful empty state — no
 * control/evidence row is ever invented.
 */
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

/**
 * Builds the canonical typed answer payload for a portal-answerable missing
 * item, exactly as the company-profile answer endpoint expects it. Returns null
 * for an unusable input so the caller performs no request. Kept as a pure,
 * testable function so the answering contract is proven without a DOM harness.
 */
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

/**
 * After a successful inline company-profile answer BOTH the compliance read
 * model and the canonical company-profile discovery (completion) must refresh,
 * so the hero's X/Y count never goes stale. Extracted so the orchestration is
 * testable without a DOM harness, and deliberately narrow: it does not touch
 * any global loading/unmount state.
 */
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
  const cls = "h-5 w-5";
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

/**
 * Published customer documents only. The DTO already guarantees these are
 * explicitly published CLIENT_POLICY publications, so this component renders
 * whatever the safe projection returned and invents nothing when it is empty.
 */
export function TopicDocuments({ documents }: { documents: PortalComplianceDocument[] }) {
  if (documents.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Közzétett dokumentumok</p>
      <ul className="mt-2 space-y-2">
        {documents.map((doc) => (
          <li key={doc.publicationId} className="rounded-xl border border-stone-200 bg-white p-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#eadfbf] bg-[#fffdf8] text-[#8a4536]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>
              </span>
              <div className="min-w-0">
                <p className="font-medium text-stone-800">{doc.title}</p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {doc.versionLabel}
                  {doc.publishedAt ? ` · Közzétéve: ${formatDate(doc.publishedAt)}` : ""}
                </p>
                {doc.downloadAvailable ? (
                  <a
                    href={portalDownloadUrl(doc.publicationId)}
                    className="mt-2 inline-block rounded-full border border-[#b95e4b] px-3 py-1 text-xs font-semibold text-[#b95e4b] hover:bg-[#fbeae6]"
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

function StatusCard({
  label,
  count,
  hint,
  tone,
}: {
  label: string;
  count: number;
  hint: string;
  tone: "action" | "progress" | "clear";
}) {
  const tones = {
    action: "border-[#e3b7ab] bg-[#fbeae6]/60",
    progress: "border-[#d7c48a] bg-[#f7f1e2]/70",
    clear: "border-emerald-300 bg-emerald-50/70",
  } as const;
  return (
    <div className={`min-w-0 rounded-2xl border p-4 ${tones[tone]}`}>
      <span className="block text-3xl font-semibold text-stone-900">{count}</span>
      <span className="mt-1 block text-sm font-semibold text-[#1f3a2e]">{label}</span>
      <span className="mt-1 block text-xs text-stone-600">{hint}</span>
    </div>
  );
}

/**
 * Grouped missing-information list built from the client-safe DTO. Portal
 * answerable items keep the canonical typed answer mechanism; everything else
 * is explicitly routed to office coordination instead of offering a fake CTA.
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
    <li key={`${info.questionKey ?? info.label}-${idx}`} className="rounded-xl border border-stone-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-stone-800">{info.label}</span>
        {info.portalAnswerable && info.questionKey ? (
          activeQuestionKey === info.questionKey ? null : (
            <button
              type="button"
              onClick={() => onStart(info.questionKey!)}
              className="rounded-lg bg-[#b95e4b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a54f3f]"
            >
              Adat megadása →
            </button>
          )
        ) : (
          <span className="text-xs text-stone-500">Irodai egyeztetés szükséges</span>
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
          {actionError ? <p className="text-xs text-rose-600">{actionError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSave(info)}
              disabled={saving || !answerInput.trim()}
              className="rounded-lg bg-[#b95e4b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a54f3f] disabled:opacity-50"
            >
              {saving ? "Mentés…" : "Mentés"}
            </button>
            <button
              type="button"
              onClick={() => onMarkUnknown(info.questionKey!)}
              disabled={saving}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Nem ismertként jelölés
            </button>
            <button type="button" onClick={onCancel} className="text-xs text-stone-500 hover:underline">
              Mégse
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );

  if (topic.missingInformation.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">
        Jelenleg nincs Öntől várt hiányzó adat ehhez a területhez.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {answerable.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Ön által megadható adatok</p>
          <ul className="mt-2 space-y-2">{answerable.map(renderItem)}</ul>
        </div>
      ) : null}
      {officeOnly.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Irodai egyeztetést igénylő adatok</p>
          <ul className="mt-2 space-y-2">{officeOnly.map(renderItem)}</ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Compact control/checkpoint rows derived exclusively from controlsSummary.
 * Implementation status is translated to a safe customer label and the evidence
 * line reports the already-computed accepted/stale counts without overclaiming.
 */
function TopicControls({
  topic,
  controlsSummary,
}: {
  topic: PortalComplianceTopic;
  controlsSummary: PortalComplianceControlSummary[] | undefined;
}) {
  const controls = controlsFor(topic, controlsSummary);
  if (controls.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">
        Ehhez a területhez még nem érhető el intézkedési összegzés.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {controls.map((control, idx) => (
        <li key={`${control.title}-${idx}`} className="rounded-xl border border-stone-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-stone-800">{control.title}</span>
            <span className="rounded-full border border-[#eadfbf] bg-[#fffdf8] px-2.5 py-0.5 text-xs font-semibold text-[#8a4536]">
              {controlStatusLabel(control.implementationStatus)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
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

/**
 * Truthful, non-technical description of how the map is produced. It explicitly
 * avoids any AI or certainty claim.
 */
function HowMapIsBuilt() {
  return (
    <section className="rounded-3xl border border-[#eadfbf] bg-[#fffdf8] p-6 text-stone-800">
      <h3 className="font-serif text-xl font-semibold text-[#1f3a2e]">Hogyan készül a compliance térkép?</h3>
      <p className="mt-2 text-sm leading-6 text-stone-700">
        Az Adminiculum a jogi és megfelelési állapotot kizárólag ellenőrizhető tényekre alapozza:
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-xs">
          <p className="font-semibold text-stone-950 text-sm">1. Rögzített tények</p>
          <p className="mt-1 text-xs text-stone-600">A vállalat profiljában megadott strukturált adatok (pl. létszám, tevékenységek, rendszerek).</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-xs">
          <p className="font-semibold text-stone-950 text-sm">2. Dokumentumok</p>
          <p className="mt-1 text-xs text-stone-600">Érvényes belső szabályzatok, szerződések, adatkezelési tájékoztatók és jegyzőkönyvek megléte.</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-xs">
          <p className="font-semibold text-stone-950 text-sm">3. Ügyvédi vizsgálat</p>
          <p className="mt-1 text-xs text-stone-600">A jogi szakértők által elvégzett átvilágítási megállapítások és jóváhagyott lépések.</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-stone-500">
        A jelölések nem jelentenek felelősségkizáró abszolút garanciát vagy 100%-os minősítést. Kérdése van a
        megállapításokkal kapcsolatban? Forduljon bizalommal az eljáró ügyvédhez a portál üzenetküldő felületén.
      </p>
    </section>
  );
}

/**
 * Focused topic-detail surface built from the SAME client-safe topic DTO. Every
 * section reuses existing safe fields only; the interactive missing-information
 * section is injected so the answering contract stays owned by the parent view.
 */
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
    <div className="space-y-6" data-testid="org-compliance-topic-detail">
      {/* HEADER */}
      <section className="min-w-0 rounded-3xl border border-[#eadfbf] bg-[#fffdf8] p-6 shadow-sm sm:p-8">
        <button type="button" onClick={onBack} className="text-sm font-semibold text-[#8a4536] hover:underline">
          ← Vissza az áttekintéshez
        </button>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9b7b25]">Megfelelési terület</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <h1 className="font-serif text-3xl font-semibold text-[#1f3a2e] sm:text-4xl">{topic.topicLabel}</h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">{topic.shortExplanation}</p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${bucketBadge[bucket]}`}>
              {primaryBadgeLabel(topic, bucket)}
            </span>
            <span className="text-xs font-semibold text-stone-700">{customerActionNote(topic)}</span>
            <span className="text-xs text-stone-500">{officeProcessingNote(topic)}</span>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className={card}>
        <h2 className="font-serif text-xl font-semibold text-[#1f3a2e]">Miért érinti a céget?</h2>
        <p className="mt-2 text-sm leading-6 text-stone-700">{topic.shortExplanation}</p>
      </section>

      {/* NEXT STEP */}
      <section className={card}>
        <h2 className="font-serif text-xl font-semibold text-[#1f3a2e]">Következő lépés</h2>
        {nextAction ? (
          <div className="mt-3 rounded-xl bg-[#fff8f6] p-3 text-sm text-[#8a4536]">{nextAction}</div>
        ) : (
          <p className="mt-2 text-sm text-stone-600">Jelenleg nincs Ön felé mutató következő lépés ezen a területen.</p>
        )}
      </section>

      {/* MISSING INFORMATION */}
      <section className={card} data-testid="org-compliance-missing-information">
        <h2 className="font-serif text-xl font-semibold text-[#1f3a2e]">Hiányzó információk</h2>
        <p className="mt-1 text-xs text-stone-500">A portálon megválaszolható adatokat itt tudja rögzíteni. A többi adathoz irodai egyeztetés szükséges.</p>
        <div className="mt-3">{missingInformationSection}</div>
      </section>

      {/* DOCUMENTS */}
      <section className={card} data-testid="org-compliance-documents">
        <h2 className="font-serif text-xl font-semibold text-[#1f3a2e]">Dokumentumok</h2>
        <div className="mt-3">
          {topic.documents.length > 0 ? (
            <TopicDocuments documents={topic.documents} />
          ) : (
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">
              Ehhez a területhez még nem tettek közzé ügyfélnek szánt dokumentumot.
            </div>
          )}
        </div>
      </section>

      {/* CONTROLS */}
      <section className={card} data-testid="org-compliance-controls">
        <h2 className="font-serif text-xl font-semibold text-[#1f3a2e]">Intézkedések és ellenőrzési pontok</h2>
        <p className="mt-1 text-xs text-stone-500">Az iroda által rögzített intézkedések és felülvizsgálati pontok összegzése.</p>
        <div className="mt-3">
          <TopicControls topic={topic} controlsSummary={controlsSummary} />
        </div>
        {progress ? (
          <p className="mt-3 text-xs text-stone-500">
            Implementált kontrollok: <b>{progress.done} / {progress.total}</b>
            {progress.nextReviewAt ? ` · Következő felülvizsgálat: ${formatDate(progress.nextReviewAt)}` : ""}
          </p>
        ) : null}
      </section>

      {showHowMap ? <HowMapIsBuilt /> : null}
    </div>
  );
}

/** Customer-safe URL query parameter that selects a topic detail. */
export const COMPLIANCE_TOPIC_QUERY_PARAM = "topic";

/**
 * Reads the selected customer-safe topic id from a location search string.
 * Returns null for a missing, empty or malformed value so an invalid or
 * nonexistent id safely falls back to the overview.
 */
export function readTopicParam(search: string): string | null {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const value = params.get(COMPLIANCE_TOPIC_QUERY_PARAM);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

/**
 * Returns a location search string with the topic parameter set or removed,
 * preserving any other query parameters. The topic id is already customer-safe
 * (the DTO's opaque `topicId`), so it is safe to keep in the URL.
 */
export function withTopicParam(search: string, topicId: string | null): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (topicId && topicId.trim()) params.set(COMPLIANCE_TOPIC_QUERY_PARAM, topicId);
  else params.delete(COMPLIANCE_TOPIC_QUERY_PARAM);
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function OrgComplianceView() {
  const [data, setData] = useState<PortalComplianceReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileCompletion, setProfileCompletion] = useState<{ answered: number; total: number } | null>(null);

  // Inline answering state for portal-answerable missing info
  const [activeQuestionKey, setActiveQuestionKey] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplianceBucket | "ALL">("ALL");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

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
      // Non-fatal: the profile card falls back to a plain link.
      setProfileCompletion(null);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadProfile();
  }, [load, loadProfile]);

  // URL-backed, customer-safe topic selection: deep-linkable and refresh-safe.
  // `popstate` keeps browser back/forward in sync with the selected topic.
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

  // A stale or unknown ?topic= value safely falls back to the overview and is
  // removed from the URL without adding a history entry.
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
      <div className="space-y-6" data-testid="org-compliance-view">
        {actionSuccess ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionSuccess}</div>
        ) : null}
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

  return (
    <div className="space-y-6" data-testid="org-compliance-view">
      {/* HERO */}
      <section className="min-w-0 rounded-3xl border border-[#eadfbf] bg-[#fffdf8] p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9b7b25]">Megfelelés és szabályozás</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-[#1f3a2e] sm:text-4xl">Compliance térkép</h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Ez a térkép a vállalkozás érintett megfelelési területeit, a nyitott teendőket, az ügyvédi vizsgálat
              állapotát és az iroda által közzétett dokumentumokat mutatja. Az állapot kizárólag rögzített tények,
              dokumentumok és ügyvédi elemzés alapján kerül kimutatásra — nem tartalmaz szintetikus pontszámot.
            </p>
          </div>
          <div className="w-full max-w-xs rounded-2xl border border-[#eadfbf] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Vállalati profil</p>
            {profileCompletion && profileCompletion.total > 0 ? (
              <p className="mt-1 text-sm text-stone-800">
                <span className="text-lg font-semibold text-stone-900">{profileCompletion.answered}</span>
                {" / "}
                {profileCompletion.total} adat megadva
              </p>
            ) : (
              <p className="mt-1 text-sm text-stone-600">A megfelelési térkép a vállalati profil adataira épül.</p>
            )}
            <Link href="/portal/vallalat" className="mt-3 inline-block text-sm font-semibold text-[#8a4536] hover:underline">
              Vállalati profil megnyitása →
            </Link>
          </div>
        </div>

        {actionSuccess ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{actionSuccess}</div>
        ) : null}
      </section>

      {/* STATUS SUMMARY */}
      <section className={card} data-testid="org-compliance-status-summary">
        <h2 className="font-serif text-xl font-semibold text-[#1f3a2e]">Áttekintés</h2>
        <p className="mt-1 text-xs text-stone-500">
          Az összesítő három, egymást kizáró kategóriát mutat, és kizárólag az Ön következő lépését jelzi. Nem
          tartalmaz pontszámot vagy százalékos minősítést.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatusCard
            label="Öntől szükséges"
            count={groups.customerAction}
            tone="action"
            hint="Az Ön a következő szereplő: adatmegadás vagy áttekintés szükséges."
          />
          <StatusCard
            label="Irodánál van"
            count={groups.atOffice}
            tone="progress"
            hint="Az iroda dolgozik rajta (feldolgozás vagy ügyvédi vizsgálat); most nincs azonnali ügyféllépés."
          />
          <StatusCard
            label="Jelenleg nincs ügyfélteendő"
            count={groups.noAction}
            tone="clear"
            hint="Ezen a területen jelenleg egyik oldalon sincs nyitott lépés."
          />
        </div>
        <p className="mt-3 text-xs text-stone-500">
          Az irodai feldolgozás állapotát az egyes területek külön, „Irodai feldolgozás” jelöléssel mutatják — ez nem
          ugyanaz a dimenzió, mint az Ön következő lépése.
        </p>
      </section>

      {/* TOPIC LIST */}
      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-[#1f3a2e]">Megfelelési területek</h2>
            <p className="mt-1 text-xs text-stone-500">{visibleTopics.length} megjelenített terület</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
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
        </div>

        {topics.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">
            Ehhez a vállalkozáshoz még nem készült megfelelési értékelés.
          </div>
        ) : visibleTopics.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">
            Nincs a keresésnek vagy a szűrőnek megfelelő terület.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {visibleTopics.map((topic) => {
              const bucket = bucketFor.get(topic.topicId) ?? "CUSTOMER_ACTION";
              const progress = controlProgressFor(topic, data?.controlsSummary);
              const nextAction = nextActionFor(topic, bucket);
              const answerableCount = topic.missingInformation.filter((info) => info.portalAnswerable && info.questionKey).length;
              const officeCount = topic.missingInformation.length - answerableCount;
              return (
                <article key={topic.topicId} className="rounded-2xl border border-[#eadfbf] bg-white p-4 shadow-xs sm:p-5">
                  <div className="grid gap-4 lg:grid-cols-12">
                    {/* LEFT — what this area is */}
                    <div className="lg:col-span-5">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#eadfbf] bg-[#fffdf8] text-[#8a4536]">
                          <TopicGlyph kind={iconKind(topic.topicId)} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold text-[#1f3a2e]">{topic.topicLabel}</h3>
                          <p className="mt-1 text-sm text-stone-700">{topic.shortExplanation}</p>
                        </div>
                      </div>
                    </div>

                    {/* MIDDLE — primary state and the immediate customer step */}
                    <div className="lg:col-span-4">
                      <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${bucketBadge[bucket]}`}>
                        {primaryBadgeLabel(topic, bucket)}
                      </span>

                      {/* Two explicitly separate dimensions: customer next step vs office processing. */}
                      <p className="mt-2 text-xs font-semibold text-stone-700">{customerActionNote(topic)}</p>
                      <p className="mt-1 text-xs text-stone-500">{officeProcessingNote(topic)}</p>

                      {nextAction ? (
                        <div className="mt-3 rounded-xl bg-[#fff8f6] p-3 text-xs text-[#8a4536]">
                          <strong>Következő lépés:</strong> {nextAction}
                        </div>
                      ) : null}

                      {topic.missingInformation.length > 0 ? (
                        <p className="mt-3 text-xs text-stone-600">
                          {`Hiányzó adat: ${topic.missingInformation.length}${answerableCount > 0 ? ` · ebből Önnek megválaszolható: ${answerableCount}` : ""}${officeCount > 0 ? ` · irodai egyeztetéssel: ${officeCount}` : ""}`}
                        </p>
                      ) : null}
                    </div>

                    {/* RIGHT — authoritative control progress + published documents + detail */}
                    <div className="lg:col-span-3">
                      {progress ? (
                        <div className="mb-3 rounded-xl bg-[#fffdf8] p-3 text-xs text-stone-700">
                          Implementált kontrollok: <b>{progress.done} / {progress.total}</b>
                          {progress.nextReviewAt ? ` · Következő felülvizsgálat: ${formatDate(progress.nextReviewAt)}` : ""}
                        </div>
                      ) : null}
                      {topic.documents.length > 0 ? (
                        <p className="text-xs text-stone-600">{`Közzétett ügyfél-dokumentum: ${topic.documents.length}`}</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openTopic(topic.topicId)}
                        className="mt-3 inline-block rounded-full bg-[#b95e4b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a54f3f]"
                      >
                        Részletek megnyitása →
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <HowMapIsBuilt />
    </div>
  );
}
