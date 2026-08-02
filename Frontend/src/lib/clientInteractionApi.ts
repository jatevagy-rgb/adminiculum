import { ApiError, fetchApi } from "./api";

type Page<T> = { items: T[]; total?: number; limit?: number; offset?: number };

export type ClientRequestType =
  | "DOCUMENT_UPLOAD"
  | "INFORMATION_REQUEST"
  | "DATA_FORM"
  | "QUESTION_RESPONSE"
  | "CORRECTION_REQUEST"
  | "MISSING_DOCUMENT_REQUEST";

export type ClientFieldType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "DATE"
  | "NUMBER"
  | "EMAIL"
  | "PHONE"
  | "ADDRESS"
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "YES_NO";

export interface ClientRequestFieldDTO {
  id: string;
  label: string;
  helpText: string | null;
  type: ClientFieldType;
  required: boolean;
  maxLength: number | null;
  options: unknown;
  order: number;
}

export interface CustomerRequestDTO {
  id: string;
  caseId: string;
  type: ClientRequestType;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  required: boolean;
  status: string;
  documentSpec: unknown;
  publishedAt: string | null;
  fields: ClientRequestFieldDTO[];
}

export interface CustomerQuestionThreadDTO {
  id: string;
  subject: string;
  status: string;
  updatedAt?: string;
  messages?: Array<{ id: string; authorType: "CLIENT" | "INTERNAL"; body: string; sentAt: string }>;
}

export interface CustomerSubmissionDTO {
  id: string;
  requestId: string;
  status: string;
  customerNote: string | null;
  submittedAt: string | null;
  correctionReason: string | null;
  files: Array<{ id: string; fileName: string; sizeBytes: number | null; pageOrSideLabel: string | null; state: string }>;
  fields: Array<{ label: string; value: string | null }>;
}

export interface InternalInteractionRow {
  id: string;
  caseId: string;
  clientId?: string;
  status: string;
  type?: string;
  subject?: string;
  clientSafeTitle?: string;
  createdAt?: string;
  updatedAt?: string;
  revision?: number;
  attemptCount?: number;
  lastErrorCodeSafe?: string | null;
}

export interface InternalClientRequestDTO extends InternalInteractionRow {
  clientId: string;
  type: ClientRequestType;
  clientSafeTitle: string;
  clientSafeInstructions: string | null;
  required: boolean;
  dueAt: string | null;
  revision: number;
  fields?: ClientRequestFieldDTO[];
  documentSpec?: Record<string, unknown> | null;
}

export interface CreateClientRequestDraftInput {
  clientId?: string;
  caseId: string;
  type: ClientRequestType;
  clientSafeTitle: string;
  clientSafeInstructions?: string;
  required?: boolean;
  dueAt?: string | null;
  documentSpec?: Record<string, unknown>;
  fields?: Array<{
    label: string;
    helpText?: string;
    type: ClientFieldType;
    required?: boolean;
    maxLength?: number | null;
    options?: string[];
    order?: number;
  }>;
}

function qs(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : "";
}

export function localizedInteractionStatus(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: "Tervezet",
    READY_TO_PUBLISH: "Publikálásra előkészítve",
    PUBLISHED: "Közzétéve",
    PARTIALLY_SUBMITTED: "Részben beküldve",
    SUBMITTED: "Beküldve",
    UNDER_INTERNAL_REVIEW: "Irodai feldolgozás alatt",
    CORRECTION_REQUESTED: "Javítás / új feltöltés szükséges",
    COMPLETED: "Lezárva",
    CANCELLED: "Visszavonva",
    EXPIRED: "Lejárt",
    OPEN: "Nyitott",
    INTERNAL_REVIEW: "Ügyvédi válasz készül",
    ANSWERED: "Megválaszolva",
    CLOSED: "Lezárva",
    PENDING: "Küldésre vár",
    FAILED_RETRYABLE: "Sikertelen, újrapróbálható",
    FAILED_FINAL: "Sikertelen",
  };
  return labels[status] || "Ismeretlen állapot";
}

export function clientSafeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "A művelet nem sikerült. Kérjük, próbálja újra később.";
  if (error.status === 403 && error.code?.includes("DISABLED")) return "Ez a funkció jelenleg nincs bekapcsolva.";
  if ([401, 403, 404].includes(error.status)) return "Ehhez az ügyfélportál művelethez nincs aktív jogosultság.";
  return "A művelet jelenleg nem érhető el. Kérjük, próbálja újra később.";
}

export const customerInteractionApi = {
  listRequests: (caseId: string) =>
    fetchApi<Page<CustomerRequestDTO>>(`/client-interaction/cases/${encodeURIComponent(caseId)}/requests`, { authContext: "customer" }),
  listQuestions: (caseId: string) =>
    fetchApi<Page<CustomerQuestionThreadDTO>>(`/client-interaction/cases/${encodeURIComponent(caseId)}/questions`, { authContext: "customer" }),
  getThread: (caseId: string, threadId: string) =>
    fetchApi<CustomerQuestionThreadDTO>(`/client-interaction/cases/${encodeURIComponent(caseId)}/questions/${encodeURIComponent(threadId)}`, { authContext: "customer" }),
  createQuestion: (caseId: string, payload: { subject: string; bodySafe: string }) =>
    fetchApi<CustomerQuestionThreadDTO>(`/client-interaction/cases/${encodeURIComponent(caseId)}/questions`, { method: "POST", body: JSON.stringify(payload), authContext: "customer" }),
  createSubmission: (caseId: string, requestId: string) =>
    fetchApi<CustomerSubmissionDTO>(`/client-interaction/cases/${encodeURIComponent(caseId)}/requests/${encodeURIComponent(requestId)}/submissions`, { method: "POST", body: JSON.stringify({}), authContext: "customer" }),
  submitAnswers: (caseId: string, submissionId: string, answers: Array<{ label: string; value: string }>) =>
    fetchApi<{ count: number }>(`/client-interaction/cases/${encodeURIComponent(caseId)}/submissions/${encodeURIComponent(submissionId)}/answers`, { method: "POST", body: JSON.stringify({ answers }), authContext: "customer" }),
  uploadFile: (caseId: string, submissionId: string, payload: { originalFileName: string; declaredMimeType: string; base64: string; pageOrSideLabel?: string }) =>
    fetchApi<{ id: string; state: string; codeSafe?: string }>(`/client-interaction/cases/${encodeURIComponent(caseId)}/submissions/${encodeURIComponent(submissionId)}/files`, { method: "POST", body: JSON.stringify(payload), authContext: "customer" }),
  submitSubmission: (caseId: string, submissionId: string, customerNote?: string) =>
    fetchApi<CustomerSubmissionDTO>(`/client-interaction/cases/${encodeURIComponent(caseId)}/submissions/${encodeURIComponent(submissionId)}/submit`, { method: "POST", body: JSON.stringify({ customerNote }), authContext: "customer" }),
  listSubmissions: (caseId: string, requestId?: string) =>
    fetchApi<Page<CustomerSubmissionDTO>>(`/client-interaction/cases/${encodeURIComponent(caseId)}/submissions${qs({ requestId })}`, { authContext: "customer" }),
};

export const workforceInteractionApi = {
  listRequests: (params: { caseId?: string; status?: string; limit?: number; offset?: number } = {}) =>
    fetchApi<Page<InternalInteractionRow>>(`/internal/client-interaction/requests${qs(params)}`, { authContext: "workforce" }),
  createRequestDraft: (payload: CreateClientRequestDraftInput) =>
    fetchApi<InternalClientRequestDTO>("/internal/client-interaction/requests", { method: "POST", body: JSON.stringify(payload), authContext: "workforce" }),
  updateRequestDraft: (requestId: string, payload: Partial<CreateClientRequestDraftInput> & { expectedRevision: number; status?: "READY_TO_PUBLISH" }) =>
    fetchApi<InternalClientRequestDTO>(`/internal/client-interaction/requests/${encodeURIComponent(requestId)}`, { method: "PATCH", body: JSON.stringify(payload), authContext: "workforce" }),
  publishRequest: (requestId: string, expectedRevision: number) =>
    fetchApi<InternalClientRequestDTO>(`/internal/client-interaction/requests/${encodeURIComponent(requestId)}/publish`, { method: "POST", body: JSON.stringify({ expectedRevision }), authContext: "workforce" }),
  cancelRequest: (requestId: string, expectedRevision: number) =>
    fetchApi<InternalClientRequestDTO>(`/internal/client-interaction/requests/${encodeURIComponent(requestId)}/cancel`, { method: "POST", body: JSON.stringify({ expectedRevision }), authContext: "workforce" }),
  listQuestions: (params: { caseId?: string; status?: string; limit?: number; offset?: number } = {}) =>
    fetchApi<Page<InternalInteractionRow>>(`/internal/client-interaction/questions${qs(params)}`, { authContext: "workforce" }),
  listSubmissions: (params: { caseId?: string; requestId?: string; status?: string; limit?: number; offset?: number } = {}) =>
    fetchApi<Page<InternalInteractionRow>>(`/internal/client-interaction/submissions${qs(params)}`, { authContext: "workforce" }),
  listNotifications: (params: { caseId?: string; status?: string; limit?: number; offset?: number } = {}) =>
    fetchApi<Page<InternalInteractionRow>>(`/internal/client-interaction/notifications${qs(params)}`, { authContext: "workforce" }),
  retryNotification: (deliveryId: string) =>
    fetchApi<{ status: string; codeSafe?: string }>(`/internal/client-interaction/notifications/${encodeURIComponent(deliveryId)}/retry`, { method: "POST", body: JSON.stringify({}), authContext: "workforce" }),

  // --- internal question workflow (draft hidden until explicit send) ---
  getQuestion: (threadId: string) =>
    fetchApi<InternalQuestionThreadDTO>(`/internal/client-interaction/questions/${encodeURIComponent(threadId)}`, { authContext: "workforce" }),
  draftAnswer: (threadId: string, bodySafe: string) =>
    fetchApi<{ id: string }>(`/internal/client-interaction/questions/${encodeURIComponent(threadId)}/answer`, { method: "POST", body: JSON.stringify({ bodySafe }), authContext: "workforce" }),
  sendAnswer: (threadId: string, messageId: string, sendNotification: boolean) =>
    fetchApi<{ status: string }>(`/internal/client-interaction/questions/${encodeURIComponent(threadId)}/answer/${encodeURIComponent(messageId)}/send`, { method: "POST", body: JSON.stringify({ sendNotification }), authContext: "workforce" }),
  closeQuestion: (threadId: string) =>
    fetchApi<{ status: string }>(`/internal/client-interaction/questions/${encodeURIComponent(threadId)}/close`, { method: "POST", body: JSON.stringify({}), authContext: "workforce" }),

  // --- internal submission review (accept gated on CLEAN server-side) ---
  getSubmission: (submissionId: string) =>
    fetchApi<InternalSubmissionDTO>(`/internal/client-interaction/submissions/${encodeURIComponent(submissionId)}`, { authContext: "workforce" }),
  acceptFile: (submissionId: string, fileId: string, payload: { documentName?: string; documentId?: string } = {}) =>
    fetchApi<{ documentVersionId?: string }>(`/internal/client-interaction/submissions/${encodeURIComponent(submissionId)}/files/${encodeURIComponent(fileId)}/accept`, { method: "POST", body: JSON.stringify(payload), authContext: "workforce" }),
  requestCorrection: (submissionId: string, reasonSafe: string) =>
    fetchApi<{ status: string }>(`/internal/client-interaction/submissions/${encodeURIComponent(submissionId)}/request-correction`, { method: "POST", body: JSON.stringify({ reasonSafe }), authContext: "workforce" }),
  rejectSubmission: (submissionId: string, reasonSafe: string) =>
    fetchApi<{ status: string }>(`/internal/client-interaction/submissions/${encodeURIComponent(submissionId)}/reject`, { method: "POST", body: JSON.stringify({ reasonSafe }), authContext: "workforce" }),
};

export interface InternalQuestionMessageDTO {
  id: string;
  authorType: "CLIENT" | "INTERNAL";
  visibility: string; // 'DRAFT' (hidden from customer) | 'SENT'
  bodySafe: string;
  sentAt: string | null;
  createdAt: string;
}

export interface InternalQuestionThreadDTO {
  thread: { id: string; subjectSafe?: string; subject?: string; status: string; caseId: string };
  messages: InternalQuestionMessageDTO[];
}

export interface InternalSubmissionFileDTO {
  id: string;
  originalFileNameSafe: string;
  sizeBytes: number | null;
  declaredMimeType: string | null;
  detectedMimeType: string | null;
  checksum: string | null;
  status: string; // ClientSubmissionFileStatus; acceptance requires 'CLEAN'
  scanCodeSafe: string | null;
  pageOrSideLabel: string | null;
}

export interface InternalSubmissionDTO {
  id: string;
  requestId: string;
  caseId: string;
  status: string;
  customerNoteSafe?: string | null;
  acceptedDocumentVersionId: string | null;
  files: InternalSubmissionFileDTO[];
  fields: Array<{ labelSafe?: string; label?: string; valueSafe?: string | null; value?: string | null }>;
}

// A file may be accepted into the official matter only when its scan status is
// CLEAN; the button is disabled otherwise and the server re-checks regardless.
export function isFileAcceptable(status: string): boolean {
  return status === "CLEAN";
}
