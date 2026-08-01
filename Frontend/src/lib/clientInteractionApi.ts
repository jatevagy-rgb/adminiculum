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
  attemptCount?: number;
  lastErrorCodeSafe?: string | null;
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
  listQuestions: (params: { caseId?: string; status?: string; limit?: number; offset?: number } = {}) =>
    fetchApi<Page<InternalInteractionRow>>(`/internal/client-interaction/questions${qs(params)}`, { authContext: "workforce" }),
  listSubmissions: (params: { caseId?: string; requestId?: string; status?: string; limit?: number; offset?: number } = {}) =>
    fetchApi<Page<InternalInteractionRow>>(`/internal/client-interaction/submissions${qs(params)}`, { authContext: "workforce" }),
  listNotifications: (params: { caseId?: string; status?: string; limit?: number; offset?: number } = {}) =>
    fetchApi<Page<InternalInteractionRow>>(`/internal/client-interaction/notifications${qs(params)}`, { authContext: "workforce" }),
  retryNotification: (deliveryId: string) =>
    fetchApi<{ status: string; codeSafe?: string }>(`/internal/client-interaction/notifications/${encodeURIComponent(deliveryId)}/retry`, { method: "POST", body: JSON.stringify({}), authContext: "workforce" }),
};
