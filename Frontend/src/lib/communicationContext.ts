/**
 * Communication Context — schema-free composition + safety contract (Phase 2).
 *
 * Turns canonical Communication API data into safe, human-facing context rows
 * and a read-only detail view used by Client- and Case-scoped communication
 * surfaces. Enforces the product invariants: real relations only, no provider/
 * storage identifiers, no sync jargon, no fake unread/thread/counter. No
 * persistence, no schema.
 */
import type { CommunicationItem, CommunicationDetail, TaskListItem, Client, CaseListItem } from "./api";

export type CommunicationContextState =
  | "REQUIRES_ATTENTION" // triage NEEDS_ASSIGNMENT: needs a case/client
  | "NO_CASE" // has content but no linked case
  | "NO_CLIENT" // no linked client
  | "LINKED" // has a real case
  | "PROCESSED"; // ignored / already handled

export const COMMUNICATION_CONTEXT_STATE_LABEL: Record<CommunicationContextState, string> = {
  REQUIRES_ATTENTION: "Feldolgozásra vár",
  NO_CASE: "Nincs ügyhöz kapcsolva",
  NO_CLIENT: "Nincs ügyfél",
  LINKED: "Ügyhöz kapcsolva",
  PROCESSED: "Feldolgozva",
};

export interface CommunicationContextRow {
  id: string;
  sender: string;
  subject: string | null;
  receivedAt: string | null;
  preview: string | null;
  attachmentCount: number;
  taskCount: number;
  state: CommunicationContextState;
  clientId: string | null;
  caseId: string | null;
  clientName: string | null;
  caseNumber: string | null;
  caseTitle: string | null;
  canOpenCase: boolean;
}

export interface SafeContextAttachment {
  fileName: string;
  fileType: string | null;
  description: string | null;
}

export interface CommunicationContextDetailView {
  id: string;
  subject: string | null;
  content: string | null;
  sender: string;
  receivedAt: string | null;
  clientName: string | null;
  caseNumber: string | null;
  caseTitle: string | null;
  relatedTaskTitle: string | null;
  attachments: SafeContextAttachment[];
  canOpenCase: boolean;
}

function senderLabel(item: CommunicationItem): string {
  return item.senderName || item.senderEmail || item.recipientName || "Ismeretlen feladó";
}

export function communicationContextState(item: CommunicationItem): CommunicationContextState {
  if (item.triage === "IGNORED" || item.triage === "DUPLICATE_OR_ERROR") return "PROCESSED";
  if (item.caseId) return "LINKED";
  if (item.triage === "NEEDS_ASSIGNMENT") return "REQUIRES_ATTENTION";
  if (!item.clientId) return "NO_CLIENT";
  return "NO_CASE";
}

export function buildCommunicationContextRow(
  item: CommunicationItem,
  lookups: { clientName?: string | null; caseNumber?: string | null; caseTitle?: string | null } = {},
): CommunicationContextRow {
  return {
    id: item.id,
    sender: senderLabel(item),
    subject: item.subject,
    receivedAt: item.receivedAt || item.createdAt,
    preview: item.summary || item.contentPreview,
    attachmentCount: item.attachmentCount,
    taskCount: item.sourceTaskCount,
    state: communicationContextState(item),
    clientId: item.clientId,
    caseId: item.caseId,
    clientName: lookups.clientName ?? null,
    caseNumber: lookups.caseNumber ?? null,
    caseTitle: lookups.caseTitle ?? null,
    canOpenCase: Boolean(item.caseId),
  };
}

export function canOpenCase(item: Pick<CommunicationItem, "caseId">): boolean {
  return Boolean(item.caseId);
}

export function buildCommunicationContextDetail(
  detail: CommunicationDetail,
  lookups: { client?: Client | null; caseRecord?: CaseListItem | null } = {},
): CommunicationContextDetailView {
  const client = lookups.client ?? detail.client;
  const caseRecord = lookups.caseRecord ?? detail.case;
  const firstTask: TaskListItem | null = detail.relatedTasks?.[0] ?? null;
  const attachments: SafeContextAttachment[] = (detail.attachments || []).map((attachment) => ({
    fileName: attachment.fileName,
    fileType: attachment.fileType,
    description: attachment.description,
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
