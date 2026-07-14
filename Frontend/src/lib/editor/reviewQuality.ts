import { EDITOR_LIMITS } from "./editorModel";
import { DOCX_LIMITS } from "./docxInterop";

export const DOCUMENT_COMMENT_DECISION = {
  branch: "C",
  relation: "Comment.documentId exists in Prisma, but no document-comment route/authorization contract is implemented.",
  mutationSupport: false,
  anchoredComments: false,
  remainingBlocker:
    "Document-level comments need a dedicated route/service with document access checks, bounded text DTOs, resolve/reopen transitions, and content-minimized audit before activation.",
} as const;

export const MODE_C_REVIEW_WARNING =
  "A jelenlegi szerkesztési munkamenet tartalma nincs az Adminiculum szerverére mentve.\n" +
  "A review-feladat a dokumentum rekordjához kapcsolódik, nem ehhez a helyi szerkesztési állapothoz.\n\n" +
  "Exportálja külön a DOCX/HTML/TXT példányt, ha a reviewernek a mostani böngészős tartalmat is látnia kell.";

export const EDITOR_KEYBOARD_SHORTCUTS = [
  { keys: "Ctrl/Cmd+B", label: "félkövér" },
  { keys: "Ctrl/Cmd+I", label: "dőlt" },
  { keys: "Ctrl/Cmd+U", label: "aláhúzás" },
  { keys: "Ctrl/Cmd+Z", label: "visszavonás" },
  { keys: "Ctrl/Cmd+Shift+Z vagy Ctrl/Cmd+Y", label: "újra" },
  { keys: "Ctrl/Cmd+F", label: "szerkesztőn belüli keresés" },
  { keys: "Enter / Shift+Enter keresésben", label: "következő / előző találat" },
  { keys: "Escape", label: "keresés vagy panelmód bezárása" },
] as const;

export const REVIEW_STATE_EXPORT_ONLY = {
  persistenceMode: "EXPORT_ONLY",
  serverSaved: false,
  reviewerCanAccessCurrentSession: false,
} as const;

export function buildModeCReviewConfirmation(isDirty: boolean): string {
  return isDirty
    ? `${MODE_C_REVIEW_WARNING}\n\nFolytatja a review műveletet a mentetlen böngészős tartalom feltöltése nélkül?`
    : `${MODE_C_REVIEW_WARNING}\n\nFolytatja?`;
}

export function shouldWarnBeforeReviewAction(isDirty: boolean): boolean {
  return isDirty;
}

export function compareSavedSourcesLabel(): string {
  return "Mentett források összehasonlítása";
}

export function documentCommentUnavailableMessage(): string {
  return "Dokumentumszintű megjegyzések jelenleg nem aktívak: nincs jóváhagyott kiszolgálói útvonal, resolve/reopen szerződés vagy tartalomszegény audit.";
}

export function editorLimitSummary(): string {
  return `Szerkesztési korlátok: legfeljebb ${EDITOR_LIMITS.maxNodes.toLocaleString("hu-HU")} csomópont, ${EDITOR_LIMITS.maxTotalTextLength.toLocaleString("hu-HU")} karakter, ${EDITOR_LIMITS.maxTableRows}×${EDITOR_LIMITS.maxTableCols} tábla, DOCX import legfeljebb ${Math.round(DOCX_LIMITS.maxCompressedBytes / 1024 / 1024)} MB tömörített fájl.`;
}

export function isNearTextLimit(characterCount: number): boolean {
  return characterCount >= Math.floor(EDITOR_LIMITS.maxTotalTextLength * 0.8);
}
