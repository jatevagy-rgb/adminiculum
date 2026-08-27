/**
 * Communication Workspace — canonical composition + safety contract (schema-free).
 *
 * This module is the SINGLE source of truth for how the operational inbox turns
 * canonical Communication API data into safe, human-facing UI. It exists so
 * that list/detail composition, filters, relation resolution and the
 * "no fake unread / no provider-id leak / no fake open-case" invariants are
 * unit-testable and reused by the workforce inbox. No persistence, no schema.
 */
import type { CommunicationItem, CommunicationDetail, TaskListItem, Client, CaseListItem } from "./api";

/** Provider/technical identifiers that must never reach normal workforce UI. */
const HIDDEN_PROVIDER_KEYS = ["providerConversationId", "spItemId", "syncStatus"] as const;

export type CommunicationListState =
  | "REQUIRES_ATTENTION" // triage NEEDS_ASSIGNMENT: needs a case/client
  | "NO_CASE" // has content but no linked case
  | "NO_CLIENT" // no linked client
  | "LINKED" // has a real case
  | "PROCESSED"; // ignored / already handled

export const COMMUNICATION_STATE_LABEL: Record<CommunicationListState, string> = {
  REQUIRES_ATTENTION: "Feldolgozásra vár",
  NO_CASE: "Nincs ügyhöz kapcsolva",
  NO_CLIENT: "Nincs ügyfél",
  LINKED: "Ügyhöz kapcsolva",
  PROCESSED: "Feldolgozva",
};

export interface CommunicationListRow {
  id: string;
  sender: string;
  subject: string | null;
  clientId: string | null;
  caseId: string | null;
  clientName: string | null;
  caseNumber: string | null;
  receivedAt: string | null;
  attachmentCount: number;
  taskCount: number;
  state: CommunicationListState;
}

export interface SafeAttachment {
  fileName: string;
  fileType: string | null;
  description: string | null;
}

export interface CommunicationDetailView {
  id: string;
  subject: string | null;
  content: string | null;
  sender: string;
  receivedAt: string | null;
  clientName: string | null;
  caseNumber: string | null;
  caseTitle: string | null;
  relatedTaskTitle: string | null;
  attachments: SafeAttachment[];
  canOpenCase: boolean;
}

export type CommunicationListFilter =
  | "all"
  | "requires-attention"
  | "without-case"
  | "without-client"
  | "with-case"
  | "processed";

function senderLabel(item: CommunicationItem): string {
  return item.senderName || item.senderEmail || item.recipientName || "Ismeretlen feladó";
}

export function communicationState(item: CommunicationItem): CommunicationListState {
  if (item.triage === "IGNORED" || item.triage === "DUPLICATE_OR_ERROR") return "PROCESSED";
  if (item.caseId) return "LINKED";
  if (item.triage === "NEEDS_ASSIGNMENT") return "REQUIRES_ATTENTION";
  if (!item.clientId) return "NO_CLIENT";
  return "NO_CASE";
}

/**
 * Build a safe list row. HIDDEN_PROVIDER_KEYS are deliberately never included.
 */
export function buildCommunicationListRow(
  item: CommunicationItem,
  lookups: { clientName?: string | null; caseNumber?: string | null } = {},
): CommunicationListRow {
  return {
    id: item.id,
    sender: senderLabel(item),
    subject: item.subject,
    clientId: item.clientId,
    caseId: item.caseId,
    clientName: lookups.clientName ?? null,
    caseNumber: lookups.caseNumber ?? null,
    receivedAt: item.receivedAt || item.createdAt,
    attachmentCount: item.attachmentCount,
    taskCount: item.sourceTaskCount,
    state: communicationState(item),
  };
}

/**
 * Real, backend-field-based filters only. No simulated unread, no thread state.
 */
export function filterCommunications(
  rows: CommunicationListRow[],
  filter: CommunicationListFilter,
): CommunicationListRow[] {
  switch (filter) {
    case "requires-attention":
      return rows.filter((row) => row.state === "REQUIRES_ATTENTION");
    case "without-case":
      return rows.filter((row) => !row.caseId);
    case "without-client":
      return rows.filter((row) => !row.clientId);
    case "with-case":
      return rows.filter((row) => Boolean(row.caseId));
    case "processed":
      return rows.filter((row) => row.state === "PROCESSED");
    case "all":
    default:
      return rows;
  }
}

/** A case can be opened only when a genuine case relation exists. */
export function canOpenCase(row: Pick<CommunicationListRow, "caseId">): boolean {
  return Boolean(row.caseId);
}

/**
 * Build a safe detail view from the canonical detail payload. Attachments are
 * reduced to metadata (fileName/type/description); provider/storage ids and raw
 * url are stripped. Related client/case/task resolved from real relations only.
 */
export function buildCommunicationDetailView(
  detail: CommunicationDetail,
  lookups: { client?: Client | null; caseRecord?: CaseListItem | null } = {},
): CommunicationDetailView {
  const client = lookups.client || detail.client;
  const caseRecord = lookups.caseRecord || detail.case;
  const firstTask: TaskListItem | null = detail.relatedTasks?.[0] ?? null;
  const attachments: SafeAttachment[] = (detail.attachments || []).map((a) => ({
    fileName: a.fileName,
    fileType: a.fileType,
    description: a.description,
  }));
  return {
    id: detail.id,
    subject: detail.subject,
    content: detail.content,
    sender: senderLabel(detail),
    receivedAt: detail.receivedAt || detail.createdAt,
    clientName: client?.name ?? null,
    caseNumber: caseRecord?.caseNumber ?? null,
    caseTitle: caseRecord?.title ?? null,
    relatedTaskTitle: firstTask?.title ?? null,
    attachments,
    canOpenCase: Boolean(caseRecord?.id || detail.caseId),
  };
}

export { HIDDEN_PROVIDER_KEYS };
