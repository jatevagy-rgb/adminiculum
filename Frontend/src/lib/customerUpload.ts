// Pure, framework-free upload-list state used by the customer portal document
// upload experience. Kept side-effect free so it can be unit-tested without a
// DOM: the React component owns object URLs and network calls, this module owns
// the list transitions and the client-safe status wording.

export type UploadItemStatus = "pending" | "uploading" | "done" | "error";

export interface UploadItem {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  isImage: boolean;
  label: string; // page/side label, e.g. "Előlap", "Hátlap", "1. oldal"
  status: UploadItemStatus;
  serverState?: string; // RECEIVED | PROCESSING | ...
  codeSafe?: string | null;
}

export const PAGE_SIDE_LABELS = ["Előlap", "Hátlap", "1. oldal", "2. oldal", "Egyéb"] as const;

export const ACCEPTED_UPLOAD_MIME = ["application/pdf", "image/jpeg", "image/png"];

let seq = 0;
export function makeUploadItem(input: { fileName: string; sizeBytes: number; mimeType: string }): UploadItem {
  seq += 1;
  return {
    id: `u-${Date.now()}-${seq}`,
    fileName: input.fileName,
    sizeBytes: input.sizeBytes,
    mimeType: input.mimeType,
    isImage: input.mimeType.startsWith("image/"),
    label: "",
    status: "pending",
  };
}

export type UploadAction =
  | { type: "add"; items: UploadItem[] }
  | { type: "remove"; id: string }
  | { type: "relabel"; id: string; label: string }
  | { type: "status"; id: string; status: UploadItemStatus; serverState?: string; codeSafe?: string | null }
  | { type: "reset" };

export function uploadReducer(state: UploadItem[], action: UploadAction): UploadItem[] {
  switch (action.type) {
    case "add":
      return [...state, ...action.items];
    case "remove":
      return state.filter((item) => item.id !== action.id);
    case "relabel":
      return state.map((item) => (item.id === action.id ? { ...item, label: action.label } : item));
    case "status":
      return state.map((item) =>
        item.id === action.id
          ? { ...item, status: action.status, serverState: action.serverState ?? item.serverState, codeSafe: action.codeSafe ?? item.codeSafe }
          : item,
      );
    case "reset":
      return [];
    default:
      return state;
  }
}

export function uploadSummary(items: UploadItem[]) {
  return {
    total: items.length,
    done: items.filter((i) => i.status === "done").length,
    failed: items.filter((i) => i.status === "error").length,
    uploading: items.filter((i) => i.status === "uploading").length,
    pending: items.filter((i) => i.status === "pending").length,
  };
}

// A file may be uploaded but still scanning; never surface raw scanner codes,
// quarantine references, storage providers or provider errors to the customer.
export function uploadStateMessage(item: Pick<UploadItem, "status" | "serverState">): string {
  if (item.status === "error") return "A fájl feltöltése nem sikerült. Kérjük, próbálja újra.";
  if (item.status === "uploading") return "Feltöltés folyamatban…";
  if (item.status === "pending") return "Küldésre kész";
  // status === 'done'
  if (item.serverState === "PROCESSING" || item.serverState === "SCANNING") return "A dokumentum biztonsági ellenőrzése folyamatban van.";
  if (item.serverState === "RECEIVED") return "Beérkezett, feldolgozás alatt.";
  return "Feltöltve.";
}

export function humanFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
