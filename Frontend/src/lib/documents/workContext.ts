/**
 * Canonical document work-context view model (CONTRACT-WS-WORK-CONTEXT-HEADER-1).
 *
 * One normaliser and one label/accent mapping, shared by every surface that
 * shows a document's legal work context — the matter cockpit work card, the
 * work-context editor and the Contract Workspace header. Three components must
 * never grow three divergent display mappings; they all derive from here.
 *
 * This module is deliberately React-free and dependency-light so it can be unit
 * tested directly.
 */
export type Accent = "petrol" | "terracotta" | "green" | "ochre" | "navy" | "neutral";

/**
 * Human Hungarian labels for the logical document work statuses — the single
 * source for the whole app. `@/lib/api` re-exports this so existing importers
 * keep working. Raw enum strings must never reach the UI.
 */
export const DOCUMENT_WORK_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Beérkezett",
  WAITING_FOR_PROCESSING: "Feldolgozásra vár",
  IN_PROGRESS: "Munka alatt",
  INTERNAL_REVIEW: "Belső review",
  CHANGES_REQUESTED: "Javításra visszaadva",
  APPROVED: "Jóváhagyva",
  READY_FOR_CLIENT: "Ügyfélnek kiküldhető",
  SENT: "Kiküldve",
  ARCHIVED: "Archivált",
};

/**
 * Structural shape of the work-context DTO this module needs. Declared locally
 * (not imported from the API layer) so the model stays dependency-free and
 * unit-testable in isolation; the API's DocumentWorkCard is structurally
 * compatible.
 */
export interface WorkContextCardInput {
  id: string;
  title: string | null;
  fileName: string | null;
  documentRole: string | null;
  workStatus: string;
  workInstruction: string | null;
  workInstructionUpdatedAt: string | null;
  workInstructionUpdatedBy: { id: string; name: string } | null;
  responsible: { id: string; name: string } | null;
  reviewer: { id: string; name: string } | null;
  dueDate: string | null;
  workPriority: string | null;
  nextStep: string | null;
  documentType: string | null;
  currentVersion: number | null;
  updatedAt: string | null;
  linkedTasks: Array<{ linkId: string; taskId: string; title: string; status: string; dueDate: string | null; assignee: { id: string; name: string } | null }>;
  source: { communicationId: string; subject: string | null; sender: string | null; receivedAt: string | null } | null;
}

/** Human Hungarian label for a logical work status; raw enums never reach the UI. */
export function workStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return DOCUMENT_WORK_STATUS_LABELS[status] || status;
}

/** Status → accent, so one colour carries one meaning across every surface. */
export function workStatusAccent(status: string | null | undefined): Accent {
  switch (status) {
    case "CHANGES_REQUESTED": return "terracotta";
    case "INTERNAL_REVIEW": return "navy";
    case "IN_PROGRESS":
    case "WAITING_FOR_PROCESSING": return "ochre";
    case "APPROVED":
    case "READY_FOR_CLIENT":
    case "SENT": return "green";
    case "ARCHIVED": return "neutral";
    default: return "petrol";
  }
}

export function formatDocDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("hu-HU");
}

export function priorityLabel(priority: string | null | undefined): string {
  switch (priority) {
    case "LOW": return "Alacsony";
    case "MEDIUM": return "Közepes";
    case "HIGH": return "Magas";
    case "URGENT": return "Sürgős";
    default: return priority || "—";
  }
}

export interface WorkContextPerson {
  id: string;
  name: string;
}

export interface WorkContextLinkedTask {
  linkId: string;
  taskId: string;
  title: string;
  status: string;
  dueDate: string | null;
  assignee: WorkContextPerson | null;
}

/**
 * The normalised, display-ready view the header and card render from.
 * Every consumer reads these fields instead of the raw DTO, so the operational
 * questions ("what / why / what must be done / who / when / which version") are
 * answered the same way everywhere.
 */
export interface WorkContextView {
  documentId: string;
  // Identity
  humanTitle: string;
  titleIsFallback: boolean;
  originalFilename: string | null;
  role: string | null;
  description: string | null;
  documentType: string | null;
  // Status
  workStatus: string;
  workStatusLabel: string;
  workStatusAccent: Accent;
  // Work instruction
  workInstruction: string | null;
  hasWorkInstruction: boolean;
  workInstructionUpdatedBy: WorkContextPerson | null;
  workInstructionUpdatedAt: string | null;
  // Responsibility & timing
  owner: WorkContextPerson | null;
  reviewer: WorkContextPerson | null;
  dueDate: string | null;
  dueDateLabel: string;
  priority: string | null;
  priorityLabel: string | null;
  // Work relationship
  nextStep: string | null;
  linkedTasks: WorkContextLinkedTask[];
  communicationProvenance: string | null;
  // Version identity — selected is never silently conflated with current.
  currentVersion: number | null;
  selectedVersion: number | null;
  isHistoricalVersion: boolean;
  // Coarse states used to choose fully / partially / no-context rendering.
  hasWorkContext: boolean;
  updatedAt: string | null;
}

/**
 * Build a fallback title from the filename, dropping only a trailing extension.
 * Used only when no human title was ever entered (legacy records).
 */
function fallbackTitleFromFilename(fileName: string | null): string {
  if (!fileName) return "Névtelen dokumentum";
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf(".");
  return dot > 0 ? trimmed.slice(0, dot) : trimmed;
}

function personOf(p: { id: string; name: string } | null | undefined): WorkContextPerson | null {
  return p && p.name ? { id: p.id, name: p.name } : null;
}

/**
 * Normalise a raw work-context DTO into the shared view.
 *
 * `selectedVersion` is the immutable version currently in view; when omitted it
 * defaults to the current version (no historical selection). `isHistoricalVersion`
 * is true only when a strictly-older version is selected — the two identities are
 * kept explicitly distinct.
 */
export function toWorkContextView(
  card: WorkContextCardInput,
  opts?: { selectedVersion?: number | null; currentVersion?: number | null },
): WorkContextView {
  const rawTitle = (card.title || "").trim();
  const titleIsFallback = rawTitle.length === 0;
  const humanTitle = titleIsFallback ? fallbackTitleFromFilename(card.fileName) : rawTitle;

  const workInstruction = (card.workInstruction || "").trim() || null;
  const owner = personOf(card.responsible);
  const reviewer = personOf(card.reviewer);
  const nextStep = (card.nextStep || "").trim() || null;
  const role = (card.documentRole || "").trim() || null;

  const currentVersion = opts?.currentVersion ?? card.currentVersion ?? null;
  const selectedVersion = opts?.selectedVersion ?? currentVersion;
  const isHistoricalVersion =
    selectedVersion != null && currentVersion != null && selectedVersion < currentVersion;

  const communicationProvenance = card.source
    ? [card.source.subject || "Kommunikáció", card.source.sender].filter(Boolean).join(" · ")
    : null;

  // "Has work context" means a human has actually set operational intent —
  // an untouched RECEIVED record with nothing else is the no-context state.
  const hasWorkContext = Boolean(
    workInstruction || owner || reviewer || card.dueDate || nextStep || role ||
    (card.workStatus && card.workStatus !== "RECEIVED") ||
    (card.linkedTasks && card.linkedTasks.length > 0),
  );

  return {
    documentId: card.id,
    humanTitle,
    titleIsFallback,
    originalFilename: card.fileName || null,
    role,
    description: null,
    documentType: card.documentType || null,
    workStatus: card.workStatus,
    workStatusLabel: workStatusLabel(card.workStatus),
    workStatusAccent: workStatusAccent(card.workStatus),
    workInstruction,
    hasWorkInstruction: Boolean(workInstruction),
    workInstructionUpdatedBy: personOf(card.workInstructionUpdatedBy),
    workInstructionUpdatedAt: card.workInstructionUpdatedAt || null,
    owner,
    reviewer,
    dueDate: card.dueDate || null,
    dueDateLabel: formatDocDate(card.dueDate),
    priority: card.workPriority || null,
    priorityLabel: card.workPriority ? priorityLabel(card.workPriority) : null,
    nextStep,
    linkedTasks: card.linkedTasks || [],
    communicationProvenance,
    currentVersion,
    selectedVersion,
    isHistoricalVersion,
    hasWorkContext,
    updatedAt: card.updatedAt || null,
  };
}
