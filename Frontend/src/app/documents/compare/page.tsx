"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { DocumentEditorShell } from "@/components/documents/DocumentEditorShell";
import {
  TipTapEditorExperimental,
  type TipTapEditorActiveState,
  type TipTapEditorCommand,
  type TipTapEditorCommandRequest,
  type TipTapEditorSelectionState,
} from "@/components/documents/editor/TipTapEditorExperimental";
import {
  downloadReviewSummary,
  downloadContract,
  downloadDocument,
  getContractComparison,
  getCaseContracts,
  getCaseDocuments,
  getCaseSummary,
  getCaseTasks,
  getCases,
  getContractEditDraft,
  getContractTimeline,
  getCurrentUser,
  getReviewNotes,
  saveContractEditDraft,
  saveReviewNotes,
  getAnonymousDocumentsBySource,
  getDocumentText,
  saveWorkspaceDocumentVersion,
  ApiError,
  type BlockReviewStatus,
  type CaseContractListItem,
  type CaseListItem,
  type CaseSummaryResponse,
  type ContractEditDraftResponse,
  type ContractCompareBlock,
  type ContractComparisonResponse,
  type CurrentUser,
  type DocumentItem,
  type ReviewNotesResult,
  type TaskItem,
  type TimelineEvent,
} from "@/lib/api";

type CompareDocument = {
  id: string;
  kind: "contract" | "document";
  source: "GENERATED" | "UPLOADED";
  title: string;
  fileName: string;
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  caseClientName: string;
  status: string;
  revisionNumber?: number;
  isCurrentRevision?: boolean;
  isFinalRevision?: boolean;
  generatedAt?: string;
  createdAt: string;
  updatedAt: string;
  templateName?: string;
  threadId?: string;
  spWebUrl?: string | null;
  spItemId?: string | null;
};

type BlockNoteDraft = {
  status: BlockReviewStatus;
  title: string;
  note: string;
};

type LocalWorkspaceComment = {
  id: string;
  text: string;
  quote?: string;
  start?: number | null;
  end?: number | null;
  createdAt: string;
  authorLabel: string;
  persistence: "local-only";
  linkedMarkId?: string | null;
};

type EditorSelectionSnapshot = {
  start: number;
  end: number;
  text: string;
};

type LocalReviewMarkType = "highlight" | "comment" | "replacement" | "deletion";
type LocalReviewMarkStatus = "pending" | "accepted" | "rejected" | "lawyer_edited";

type LocalReviewMark = {
  id: string;
  type: LocalReviewMarkType;
  quote: string;
  start: number | null;
  end: number | null;
  comment?: string;
  replacement?: string;
  createdAt: string;
  authorLabel: string;
  status: LocalReviewMarkStatus;
  linkedCommentId?: string | null;
};

type WorkspaceMainTab = "edit" | "review" | "comments" | "clauses" | "history";

type WorkspaceModeId =
  | "CONTRACT_REVIEW"
  | "CONTRACT_DRAFTING"
  | "CLAIM_DRAFTING"
  | "DEFENSE_RESPONSE"
  | "COUNTERCLAIM"
  | "LEGAL_ANALYSIS"
  | "AUTHORITY_REQUEST"
  | "DUE_DILIGENCE";

type WorkspaceModeDefinition = {
  id: WorkspaceModeId;
  label: string;
  purpose: string;
  inputType: string;
  mainWorkspaceType: string;
  finalOutput: string;
  enabled: boolean;
  phases: string[];
};

type WorkspaceClauseItem = {
  id: string;
  type: 'clause';
  title: string;
  description: string;
  tags: string[];
  text: string;
};

const toReadableStatus = (value?: string | null) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "—";
  const labels: Record<string, string> = {
    GENERATED: "Generált",
    APPROVED: "Jóváhagyott",
    SUBMITTED: "Beküldve",
    IN_REVIEW: "Review alatt",
    NEEDS_REVIEW: "Review szükséges",
    UPLOADED: "Feltöltött",
    CONTRACT: "Szerződés",
    DOCUMENT: "Dokumentum",
  };
  return labels[normalized.toUpperCase()] || normalized.replace(/_/g, " ").toLowerCase().replace(/^./, (char) => char.toUpperCase());
};

const workspaceClauseCatalogue: WorkspaceClauseItem[] = [
  { id: "clause-elallasi-jog", type: "clause", title: "Elállási jog", description: "Alap elállási rendelkezés szerződéses megszüntetési helyzetekhez.", tags: ["megszuntetes", "jog"], text: "A fél jogosult a szerződéstől elállni, ha a másik fél lényeges szerződésszegését írásbeli felszólítás ellenére sem orvosolja." },
  { id: "clause-felelossegkorlatozas", type: "clause", title: "Felelősségkorlátozás", description: "Keretszöveg a kártérítési felelősség ésszerű korlátozásához.", tags: ["kockazat", "kar"], text: "A felek felelőssége a közvetlen, igazolt károkra terjed ki; az elmaradt haszonért való felelősség kizárt, kivéve szándékos károkozás esetén." },
  { id: "clause-titoktartas", type: "clause", title: "Titoktartás", description: "Bizalmas információk kezelésére szolgáló alapklauzula.", tags: ["bizalmassag", "adat"], text: "A felek kötelesek a szerződés teljesítése során tudomásukra jutott bizalmas információkat megőrizni, és azokat harmadik személy részére csak jogszabály vagy előzetes írásbeli hozzájárulás alapján átadni." },
  { id: "clause-fizetesi-hatarido", type: "clause", title: "Fizetési határidő", description: "Fizetés esedékességét rögzítő indító szöveg.", tags: ["fizetes", "hatarido"], text: "A fizetési kötelezettség a szabályszerű számla kézhezvételétől számított 8 napon belül esedékes." },
  { id: "clause-ketnyelvu-rendelkezes", type: "clause", title: "Kétnyelvű rendelkezés", description: "Nyelvi elsőbbséget rögzítő kétnyelvű szerződésekhez.", tags: ["nyelv", "ertelmezes"], text: "A szerződés több nyelvű változata közötti eltérés esetén a magyar nyelvű szöveg az irányadó, kivéve ha a felek ettől írásban eltérően rendelkeznek." },
  { id: "clause-jogvalasztas", type: "clause", title: "Jogválasztás", description: "Alkalmazandó jogra vonatkozó alapklauzula.", tags: ["jog", "iranyado"], text: "A jelen szerződésre Magyarország joga irányadó." },
  { id: "clause-illetekesseg-joghatosag", type: "clause", title: "Illetékesség / joghatóság", description: "Jogvita rendezésére szolgáló fórumkijelölés.", tags: ["jogvita", "forum"], text: "A felek a szerződésből eredő vitáikat elsősorban tárgyalás útján rendezik; ennek sikertelensége esetén a hatáskörrel és illetékességgel rendelkező magyar bíróság jár el." },
  { id: "clause-vis-maior", type: "clause", title: "Vis maior", description: "Elháríthatatlan külső okokra vonatkozó mentesülési szöveg.", tags: ["kockazat", "teljesites"], text: "Vis maior esemény esetén az érintett fél a teljesítés akadályáról haladéktalanul értesíti a másik felet, és az akadály fennállása alatt a késedelem jogkövetkezményei alól mentesül." },
  { id: "clause-szerzodesszeges-kovetkezmenyei", type: "clause", title: "Szerződésszegés következményei", description: "Szerződésszegés kezelésének rövid kerete.", tags: ["szerzodesszeges", "jogkovetkezmeny"], text: "Szerződésszegés esetén a sérelmet szenvedett fél jogosult a szerződésszegés megszüntetését, kára megtérítését, valamint a szerződésben meghatározott egyéb jogkövetkezményeket érvényesíteni." },
  { id: "clause-adatkezelesi-rendelkezes", type: "clause", title: "Adatkezelési rendelkezés", description: "Személyes adatok kezelésére figyelmeztető indító klauzula.", tags: ["adatkezeles", "gdpr"], text: "A felek a szerződés teljesítése során kezelt személyes adatokat a vonatkozó adatvédelmi jogszabályokkal összhangban kezelik." },
  { id: "clause-kesedelmi-kamat", type: "clause", title: "Késedelmi kamat", description: "Fizetési késedelem esetére szóló starter rendelkezés.", tags: ["fizetes", "kesedelem"], text: "Fizetési késedelem esetén a késedelembe eső fél a Ptk. szerinti késedelmi kamat megfizetésére köteles." },
  { id: "clause-teljesitesi-hatarido", type: "clause", title: "Teljesítési határidő", description: "Teljesítés időpontját rögzítő alapmondat.", tags: ["teljesites", "hatarido"], text: "A teljesítés határideje a szerződés hatálybalépésétől számított, a felek által rögzített időtartam." },
  { id: "clause-birtokbaadas", type: "clause", title: "Birtokbaadás", description: "Ingatlan birtokbaadásához használható rövid klauzula.", tags: ["ingatlan", "birtok"], text: "Az eladó az ingatlant a teljes vételár megfizetését követően, jegyzőkönyv felvétele mellett adja a vevő birtokába." },
  { id: "clause-szavatossag", type: "clause", title: "Szavatosság", description: "Szavatossági nyilatkozat kezdőszövegként.", tags: ["szavatossag", "ingatlan"], text: "Az eladó szavatolja, hogy a szerződésben tett nyilatkozatai a szerződés aláírásának napján valósak és teljesek." },
  { id: "clause-tehermentesites", type: "clause", title: "Tehermentesítés", description: "Tehermentes állapot biztosításához.", tags: ["ingatlan", "teher"], text: "Az eladó kötelezettséget vállal arra, hogy az ingatlant a birtokbaadás időpontjáig a szerződésben meghatározott terhektől mentesíti." },
  { id: "clause-foglalo", type: "clause", title: "Foglaló", description: "Foglaló megfizetését rögzítő starter rendelkezés.", tags: ["vetelar", "biztositek"], text: "A vevő a szerződés aláírásával egyidejűleg foglalót fizet az eladó részére, amely a vételárba beszámít." },
  { id: "clause-vetelar-reszlet", type: "clause", title: "Vételár-részlet", description: "Részletekben történő vételárfizetéshez.", tags: ["vetelar", "fizetes"], text: "A vételár fennmaradó részét a vevő a szerződésben meghatározott ütemezés szerint, banki átutalással fizeti meg." },
  { id: "clause-alairas-ellenjegyzes", type: "clause", title: "Aláírás / ellenjegyzés", description: "Záró aláírási és ellenjegyzési rendelkezés.", tags: ["zaradek", "ellenjegyzes"], text: "A felek a szerződést elolvasás és értelmezés után, mint akaratukkal mindenben megegyezőt írják alá; az okiratot az eljáró ügyvéd ellenjegyzi." },
];

const workspaceModeRegistry: WorkspaceModeDefinition[] = [
  {
    id: "CONTRACT_REVIEW",
    label: "Szerződésátnézés",
    purpose: "A módosított munkapéldány ügyvédi áttekintése, döntési pontokkal és technikai előzményekkel.",
    inputType: "Feltöltött vagy generált szerződés",
    mainWorkspaceType: "Review-központú munkapéldány",
    finalOutput: "Ügyvéd által jóváhagyott munkapéldány / export",
    enabled: true,
    phases: ["Bemenet", "Review", "Módosítások áttekintése", "Ügyvédi review", "Export / leadás"],
  },
  {
    id: "CONTRACT_DRAFTING",
    label: "Szerződéskészítés",
    purpose: "Klauzula-alapú és ügyfélprofilhoz igazított szerződés-összeállítás.",
    inputType: "Instrukciók, sablonok, záradéktár",
    mainWorkspaceType: "Drafting és clause assembly",
    finalOutput: "Tiszta szerződéstervezet",
    enabled: false,
    phases: ["Bemenet", "Szerkezet", "Dokumentum összeállítása", "Ügyvédi review", "Export / leadás"],
  },
  {
    id: "CLAIM_DRAFTING",
    label: "Keresetlevél előkészítés",
    purpose: "Állítások, bizonyítékok és jogalapok stratégiai térképezése, majd beadvány-összeállítás.",
    inputType: "Peres iratok, tényállás, bizonyítékok",
    mainWorkspaceType: "Stratégiai térkép + dokumentum összeállítása",
    finalOutput: "Keresetlevél munkapéldány",
    enabled: false,
    phases: ["Bemenet", "Stratégiai térkép", "Dokumentum összeállítása", "Ügyvédi review", "Export / leadás"],
  },
  {
    id: "DEFENSE_RESPONSE",
    label: "Ellenirat / védekezés",
    purpose: "Ténybeli és jogi ellenérvek strukturálása, majd ellenirat szerkesztése.",
    inputType: "Keresetlevél, beadványok, bizonyítékok",
    mainWorkspaceType: "Stratégiai térkép + válaszirat",
    finalOutput: "Ellenirat munkapéldány",
    enabled: false,
    phases: ["Bemenet", "Stratégiai térkép", "Dokumentum összeállítása", "Ügyvédi review", "Export / leadás"],
  },
  {
    id: "COUNTERCLAIM",
    label: "Viszontkereset",
    purpose: "Ellenkövetelések és kapcsolódó bizonyítékok rendezése, majd viszontkereset összeállítása.",
    inputType: "Peres anyagok, ellenkövetelések",
    mainWorkspaceType: "Stratégiai térkép + dokumentum összeállítása",
    finalOutput: "Viszontkereset munkapéldány",
    enabled: false,
    phases: ["Bemenet", "Stratégiai térkép", "Dokumentum összeállítása", "Ügyvédi review", "Export / leadás"],
  },
  {
    id: "LEGAL_ANALYSIS",
    label: "Jogi elemzés",
    purpose: "Tényállás, kockázatok és döntési pontok ügyvédi review-ra alkalmas strukturálása.",
    inputType: "Forrásiratok, anonimizált szöveg, kutatási jegyzetek",
    mainWorkspaceType: "Elemzési munkatermék",
    finalOutput: "Ügyvédi review-ra szánt jogi elemzés",
    enabled: false,
    phases: ["Bemenet", "Elemzési váz", "Dokumentum összeállítása", "Ügyvédi review", "Export / leadás"],
  },
  {
    id: "AUTHORITY_REQUEST",
    label: "Hatósági / bírósági kérelem",
    purpose: "Kérelemtípus szerinti workflow és beadvány-előkészítés.",
    inputType: "Űrlapok, mellékletek, tényállás",
    mainWorkspaceType: "Kérelem-előkészítő munkatér",
    finalOutput: "Benyújtásra kész kérelem",
    enabled: false,
    phases: ["Bemenet", "Stratégiai térkép", "Dokumentum összeállítása", "Ügyvédi review", "Export / leadás"],
  },
  {
    id: "DUE_DILIGENCE",
    label: "Átvilágítás",
    purpose: "Dokumentum- és kockázatlista alapú átvilágítási megállapítások rendszerezése.",
    inputType: "Átvilágítási anyagok, dokumentumlista",
    mainWorkspaceType: "Kockázati és megállapítási mátrix",
    finalOutput: "Átvilágítási összefoglaló",
    enabled: false,
    phases: ["Bemenet", "Stratégiai térkép", "Dokumentum összeállítása", "Ügyvédi review", "Export / leadás"],
  },
];

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return value;
  }
};

const getSelectionExcerpt = (value: string, limit = 140) =>
  value.length > limit ? `${value.slice(0, limit).trim()}…` : value.trim();

const localReviewTypeLabel: Record<LocalReviewMarkType, string> = {
  highlight: "Kiemelés",
  comment: "Megjegyzés",
  replacement: "Szövegcsere-javaslat",
  deletion: "Törlési javaslat",
};

const localReviewToneClass: Record<LocalReviewMarkType, string> = {
  highlight: "border-[#BFDDBF] bg-[#EEF8ED] text-[#1E6A34]",
  comment: "border-[#C8D8F0] bg-[#F1F6FE] text-[#244B7A]",
  replacement: "border-[#E6C987] bg-[#FAEFCF] text-[#7A5A1F]",
  deletion: "border-[#E5C3C3] bg-[#FFF1F1] text-[#8B2A2A]",
};

const localReviewStatusLabel: Record<LocalReviewMarkStatus, string> = {
  pending: "Helyi / függőben",
  accepted: "Helyi / elfogadva",
  rejected: "Helyi / elutasítva",
  lawyer_edited: "Helyi / szerkesztve",
};

const localReviewPersistenceLabel: Record<LocalReviewMarkType, string> = {
  highlight: "Helyi kiemelés — mentés későbbi patchben.",
  comment: "Helyi megjegyzés — szerveroldali mentés későbbi patchben.",
  replacement: "Helyi cserejavaslat — mentés későbbi patchben.",
  deletion: "Helyi törlési javaslat — mentés későbbi patchben.",
};

const DEFAULT_NETWORK_ERROR_MESSAGE = "A művelet nem érhető el. Ellenőrizd a kapcsolatot vagy próbáld újra.";

const getUserFacingApiErrorMessage = (
  error: unknown,
  fallback = DEFAULT_NETWORK_ERROR_MESSAGE
) => {
  if (error instanceof ApiError) {
    return error.status === 0 ? DEFAULT_NETWORK_ERROR_MESSAGE : error.message || fallback;
  }
  if (error instanceof Error) {
    if (/networkerror|failed to fetch|load failed/i.test(error.message)) {
      return DEFAULT_NETWORK_ERROR_MESSAGE;
    }
    return error.message || fallback;
  }
  return fallback;
};

const toDaysDiff = (newer?: string, older?: string) => {
  if (!newer || !older) return null;
  const ms = new Date(newer).getTime() - new Date(older).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

const stripRevisionMarkers = (value: string) =>
  value
    .replace(/\(revision\s*\d+\)/gi, "")
    .replace(/\brev(?:ision)?\s*\d+\b/gi, "")
    .replace(/\bv\d+\b/gi, "")
    .replace(/[_\-]+rev[_\-]*\d+/gi, "")
    .replace(/\.docx$/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const lineageKey = (doc: CompareDocument) => {
  const byTitle = stripRevisionMarkers((doc.title || "").toLowerCase());
  const byTemplate = stripRevisionMarkers((doc.templateName || "").toLowerCase());
  const byFileName = stripRevisionMarkers((doc.fileName || "").toLowerCase());
  return byTitle || byTemplate || byFileName || "unknown";
};

const lineageGroupKey = (doc: CompareDocument) => {
  // Grounded explicit lineage for generated contracts
  if (doc.kind === "contract" && doc.threadId) {
    return `thread:${doc.caseId}:${doc.threadId}`;
  }
  // Honest fallback: same case + same kind + same source + normalized key
  return `fallback:${doc.caseId}:${doc.kind}:${doc.source}:${lineageKey(doc)}`;
};

const isReviewLikeStatus = (status?: string) => {
  const normalized = String(status || "").toUpperCase();
  return normalized.includes("REVIEW") || normalized === "SUBMITTED" || normalized === "IN_REVIEW";
};

const toDocumentSource = (doc: DocumentItem): "GENERATED" | "UPLOADED" => {
  const fromType = String(doc.documentType || "").toUpperCase();
  if (fromType.includes("CONTRACT") || fromType.includes("GENERATED")) return "GENERATED";
  return "UPLOADED";
};

const normalizeBlockTitle = (value?: string | null) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const buildBlockNoteKey = (block: ContractCompareBlock) => {
  const clauseId = block.targetBlock?.sourceClauseId || block.sourceBlock?.sourceClauseId;
  if (clauseId) {
    return `clause:${clauseId}`;
  }

  const orderIndex = block.targetBlock?.orderIndex ?? block.sourceBlock?.orderIndex ?? -1;
  const title = normalizeBlockTitle(block.targetBlock?.title || block.sourceBlock?.title || "untitled");
  return `order:${orderIndex}:title:${title || 'untitled'}`;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

export default function DocumentsComparePage() {
  return (
    <AuthenticatedApp section="documents-compare">
      <DocumentsComparePageContent />
    </AuthenticatedApp>
  );
}

function DocumentsComparePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCaseId = searchParams?.get("caseId") || "";
  const requestedDocumentId = searchParams?.get("documentId") || "";
  const requestedBaselineId = searchParams?.get("baselineId") || "";

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<CompareDocument[]>([]);
  const [caseSummaries, setCaseSummaries] = useState<Record<string, CaseSummaryResponse>>({});
  const [caseTasks, setCaseTasks] = useState<Record<string, TaskItem[]>>({});

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<Array<{ id: string; description: string; createdAt: string }>>([]);
  const [comparisonData, setComparisonData] = useState<ContractComparisonResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [reviewNotesData, setReviewNotesData] = useState<ReviewNotesResult | null>(null);
  const [reviewNotesLoading, setReviewNotesLoading] = useState(false);
  const [blockNoteDrafts, setBlockNoteDrafts] = useState<Record<string, BlockNoteDraft>>({});
  const [blockNotesSaveState, setBlockNotesSaveState] = useState<{ type: "success" | "error" | null; message: string }>({
    type: null,
    message: "",
  });
  const [blockNotesSaving, setBlockNotesSaving] = useState(false);
  const [reviewSummaryDownloading, setReviewSummaryDownloading] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const [search, setSearch] = useState("");
  const [caseFilter, setCaseFilter] = useState<string>(requestedCaseId || "all");
  const [reviewFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [hasPreviousOnly] = useState(false);
  const [recentOnly] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState("");
  const [editorTouched, setEditorTouched] = useState(false);
  const [isTipTapPreviewEnabled, setIsTipTapPreviewEnabled] = useState(false);
  const [tipTapPreviewDraft, setTipTapPreviewDraft] = useState("");
  const [tipTapCommandRequest, setTipTapCommandRequest] = useState<TipTapEditorCommandRequest | null>(null);
  const [tipTapActiveState, setTipTapActiveState] = useState<TipTapEditorActiveState>({
    bold: false,
    italic: false,
    underline: false,
    bulletList: false,
    orderedList: false,
    paragraph: true,
  });
  const [tipTapSelection, setTipTapSelection] = useState<TipTapEditorSelectionState>({
    text: "",
    from: 0,
    to: 0,
    empty: true,
  });
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [localCommentDraft, setLocalCommentDraft] = useState("");
  const [localComments, setLocalComments] = useState<LocalWorkspaceComment[]>([]);
  const [localReviewMarks, setLocalReviewMarks] = useState<LocalReviewMark[]>([]);
  const [selectionSnapshot, setSelectionSnapshot] = useState<EditorSelectionSnapshot | null>(null);
  const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);
  const [composerMode, setComposerMode] = useState<null | "comment" | "replacement" | "deletion">(null);
  const [composerDraft, setComposerDraft] = useState("");
  const [editingReviewMarkId, setEditingReviewMarkId] = useState<string | null>(null);
  const [contractEditDraft, setContractEditDraft] = useState<ContractEditDraftResponse | null>(null);
  const [isLoadingContractEditDraft, setIsLoadingContractEditDraft] = useState(false);
  const [contractEditDraftError, setContractEditDraftError] = useState<string | null>(null);
  const toolSearchRef = useRef<HTMLInputElement | null>(null);
  const localCommentRef = useRef<HTMLTextAreaElement | null>(null);
  const editorTextAreaRef = useRef<HTMLTextAreaElement | null>(null);

  // Anonymous document text loading state
  const [latestAnonymousText, setLatestAnonymousText] = useState("");
  const [latestAnonymousDocumentId, setLatestAnonymousDocumentId] = useState<string | null>(null);
  const [isLoadingAnonymousText, setIsLoadingAnonymousText] = useState(false);
  const [anonymousTextError, setAnonymousTextError] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [documentTextReason, setDocumentTextReason] = useState<string | null>(null);
  const [isLoadingDocumentText, setIsLoadingDocumentText] = useState(false);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [workspaceSaveState, setWorkspaceSaveState] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" });
  const [workspaceViewMode, setWorkspaceViewMode] = useState<"edit" | "compare">("edit");
  const [workspaceMainTab, setWorkspaceMainTab] = useState<WorkspaceMainTab>("edit");
  const [reviewLens, setReviewLens] = useState<"modified" | "clean" | "original">("modified");

  type ScopedCase = {
    id: string;
    caseNumber: string;
    title: string;
    clientName: string;
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const me = await getCurrentUser();
        setCurrentUser(me);
        const preloadedSummaries: Record<string, CaseSummaryResponse> = {};

        let scopedCases: ScopedCase[] = [];
        if (requestedCaseId) {
          try {
            const requestedSummary = await getCaseSummary(requestedCaseId);
            preloadedSummaries[requestedCaseId] = requestedSummary;
            scopedCases = [
              {
                id: requestedCaseId,
                caseNumber: requestedSummary.case.caseNumber,
                title: requestedSummary.case.title,
                clientName: requestedSummary.case.clientName,
              },
            ];
          } catch {
            const fallbackCasesResponse = await getCases(1, 120, me.id);
            scopedCases = fallbackCasesResponse.data
              .filter((item) => item.id === requestedCaseId || item.caseNumber === requestedCaseId)
              .map((item) => ({
                id: item.id,
                caseNumber: item.caseNumber,
                title: item.title,
                clientName: item.clientName,
              }));
          }
        } else {
          const casesResponse = await getCases(1, 120, me.id);
          scopedCases = casesResponse.data.map((item) => ({
            id: item.id,
            caseNumber: item.caseNumber,
            title: item.title,
            clientName: item.clientName,
          }));
        }

        const rows = await Promise.all(
          scopedCases.map(async (caseItem: ScopedCase) => {
            const [contracts, plainDocuments, summary, tasks] = await Promise.all([
              getCaseContracts(caseItem.id).catch(() => [] as CaseContractListItem[]),
              getCaseDocuments(caseItem.id).catch(() => [] as DocumentItem[]),
              preloadedSummaries[caseItem.id]
                ? Promise.resolve(preloadedSummaries[caseItem.id])
                : getCaseSummary(caseItem.id).catch(() => null),
              getCaseTasks(caseItem.id).catch(() => [] as TaskItem[]),
            ]);

            const unifiedContracts: CompareDocument[] = contracts.map((doc) => ({
              id: doc.id,
              kind: "contract",
              source: "GENERATED",
              title: doc.title || doc.fileName,
              fileName: doc.fileName || doc.title,
              caseId: caseItem.id,
              caseNumber: caseItem.caseNumber,
              caseTitle: caseItem.title,
              caseClientName: caseItem.clientName,
              status: doc.status || "UNKNOWN",
              revisionNumber: doc.revisionNumber || 1,
              isCurrentRevision: doc.isCurrentRevision,
              isFinalRevision: doc.isFinalRevision,
              generatedAt: doc.generatedAt,
              createdAt: doc.generatedAt,
              updatedAt: doc.generatedAt,
              templateName: doc.templateName,
              threadId: doc.threadId,
              spWebUrl: doc.spWebUrl,
              spItemId: doc.spItemId,
            }));

            const unifiedDocuments: CompareDocument[] = plainDocuments.map((doc) => ({
              id: doc.id,
              kind: "document",
              source: toDocumentSource(doc),
              title: doc.fileName,
              fileName: doc.fileName,
              caseId: caseItem.id,
              caseNumber: caseItem.caseNumber,
              caseTitle: caseItem.title,
              caseClientName: caseItem.clientName,
              status: String(doc.documentType || doc.folder || "UPLOADED").toUpperCase(),
              revisionNumber: Number.parseInt(String(doc.version || "1"), 10) || 1,
              createdAt: doc.createdAt,
              updatedAt: doc.updatedAt,
              spWebUrl: doc.spWebUrl,
              spItemId: doc.spItemId,
            }));

            return {
              caseId: caseItem.id,
              docs: [...unifiedContracts, ...unifiedDocuments],
              summary,
              tasks,
            };
          })
        );

        const merged = rows
          .flatMap((row) => row.docs)
          .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

        const summaryMap: Record<string, CaseSummaryResponse> = {};
        const taskMap: Record<string, TaskItem[]> = {};
        rows.forEach((row) => {
          if (row.summary) summaryMap[row.caseId] = row.summary;
          taskMap[row.caseId] = row.tasks;
        });

        setDocuments(merged);
        setCaseSummaries(summaryMap);
        setCaseTasks(taskMap);

        const requested = merged.find((doc) => doc.id === requestedDocumentId) || null;
        const first = merged[0] || null;
        setSelectedDocumentId((requested || first)?.id || null);
      } catch (err) {
        console.error("Compare board load failed:", err);
        setCurrentUser(null);
        setError("A dokumentum összevető felület betöltése sikertelen.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [requestedCaseId, requestedDocumentId]);

  const familiesByDocId = useMemo(() => {
    const map: Record<string, CompareDocument[]> = {};
    for (const doc of documents) {
      const groupKey = lineageGroupKey(doc);
      const family = documents.filter((peer) => lineageGroupKey(peer) === groupKey);
      map[doc.id] = family.sort(
        (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
      );
    }
    return map;
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const text = search.trim().toLowerCase();
    return documents.filter((doc) => {
      const caseMatch = caseFilter === "all" || doc.caseId === caseFilter || doc.caseNumber === caseFilter;
      const reviewMatch =
        reviewFilter === "all" ||
        (reviewFilter === "needs-review" && isReviewLikeStatus(doc.status)) ||
        (reviewFilter === "approved" && String(doc.status || "").toUpperCase() === "APPROVED") ||
        (reviewFilter === "generated" && String(doc.status || "").toUpperCase() === "GENERATED");
      const sourceMatch = sourceFilter === "all" || doc.source === sourceFilter;
      const hasPreviousMatch = !hasPreviousOnly || (familiesByDocId[doc.id]?.length || 0) > 1;
      const recentMatch =
        !recentOnly ||
        (Date.now() - new Date(doc.updatedAt || doc.createdAt).getTime()) / (1000 * 60 * 60 * 24) <= 14;
      const searchMatch =
        !text ||
        doc.fileName.toLowerCase().includes(text) ||
        doc.title.toLowerCase().includes(text) ||
        doc.caseNumber.toLowerCase().includes(text) ||
        doc.caseTitle.toLowerCase().includes(text);
      return caseMatch && reviewMatch && sourceMatch && hasPreviousMatch && recentMatch && searchMatch;
    });
  }, [documents, search, caseFilter, reviewFilter, sourceFilter, hasPreviousOnly, recentOnly, familiesByDocId]);

  const selectedDocument = useMemo(
    () => filteredDocuments.find((doc) => doc.id === selectedDocumentId) || filteredDocuments[0] || null,
    [filteredDocuments, selectedDocumentId]
  );

  useEffect(() => {
    setIsTipTapPreviewEnabled(false);
    setTipTapPreviewDraft("");
  }, [selectedDocument?.id]);

  const caseScopedDocuments = useMemo(() => {
    if (!requestedCaseId) return documents;
    return documents.filter((doc) => doc.caseId === requestedCaseId || doc.caseNumber === requestedCaseId);
  }, [documents, requestedCaseId]);

  const handleWorkspaceDocumentChange = (documentId: string) => {
    const nextDoc = documents.find((doc) => doc.id === documentId);
    setSelectedDocumentId(documentId || null);
    if (nextDoc) {
      const params = new URLSearchParams();
      params.set("caseId", nextDoc.caseId);
      params.set("documentId", nextDoc.id);
      router.push(`/documents/compare?${params.toString()}`);
    }
  };

  const lineage = useMemo(() => {
    if (!selectedDocument) return [] as CompareDocument[];
    return familiesByDocId[selectedDocument.id] || [];
  }, [selectedDocument, familiesByDocId]);

  const baselineCandidates = useMemo(() => {
    if (!selectedDocument) return [] as CompareDocument[];
    return lineage.filter((doc) => doc.id !== selectedDocument.id);
  }, [lineage, selectedDocument]);

  const requestedBaselineDocument = useMemo(() => {
    if (!requestedBaselineId) return null;
    return documents.find((doc) => doc.id === requestedBaselineId) || null;
  }, [documents, requestedBaselineId]);

  useEffect(() => {
    if (!selectedDocument) {
      setSelectedBaselineId(null);
      return;
    }

    if (requestedBaselineId && requestedBaselineId !== selectedDocument.id) {
      setSelectedBaselineId(requestedBaselineId);
      return;
    }

    const requested = requestedBaselineId
      ? baselineCandidates.find((candidate) => candidate.id === requestedBaselineId)
      : null;
    if (requested) {
      setSelectedBaselineId(requested.id);
      return;
    }

    const older = baselineCandidates.find(
      (candidate) =>
        new Date(candidate.updatedAt || candidate.createdAt).getTime() <
        new Date(selectedDocument.updatedAt || selectedDocument.createdAt).getTime()
    );
    setSelectedBaselineId((older || baselineCandidates[0])?.id || null);
  }, [selectedDocument, baselineCandidates, requestedBaselineId]);

  const selectedBaseline = useMemo(
    () =>
      baselineCandidates.find((doc) => doc.id === selectedBaselineId) ||
      documents.find((doc) => doc.id === selectedBaselineId) ||
      null,
    [baselineCandidates, documents, selectedBaselineId]
  );

  const effectiveBaseline = selectedBaseline || requestedBaselineDocument;

  const previousVersion = useMemo(() => {
    if (!selectedDocument) return null;
    return baselineCandidates.find(
      (candidate) =>
        new Date(candidate.updatedAt || candidate.createdAt).getTime() <
        new Date(selectedDocument.updatedAt || selectedDocument.createdAt).getTime()
    ) || null;
  }, [baselineCandidates, selectedDocument]);

  useEffect(() => {
    const loadComparison = async () => {
      if (!selectedDocument || selectedDocument.kind !== "contract") {
        setComparisonData(null);
        setComparisonError(null);
        return;
      }

      setComparisonLoading(true);
      setComparisonError(null);
      try {
        const comparison = await getContractComparison(selectedDocument.id, effectiveBaseline?.id || undefined);
        setComparisonData(comparison);
      } catch (err) {
        setComparisonData(null);
        if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
          setComparisonError("Nincs elérhető összevetési alap.");
        } else {
          setComparisonError("Blokk-összevetés nem érhető el.");
        }
      } finally {
        setComparisonLoading(false);
      }
    };

    loadComparison();
  }, [selectedDocument, effectiveBaseline?.id]);

  useEffect(() => {
    const loadReviewNotesForSelected = async () => {
      if (!selectedDocument || selectedDocument.kind !== "contract") {
        setReviewNotesData(null);
        setBlockNoteDrafts({});
        setBlockNotesSaveState({ type: null, message: "" });
        return;
      }

      setReviewNotesLoading(true);
      try {
        const notes = await getReviewNotes(selectedDocument.id);
        setReviewNotesData(notes);
      } catch {
        setReviewNotesData(null);
      } finally {
        setReviewNotesLoading(false);
      }
    };

    loadReviewNotesForSelected();
  }, [selectedDocument]);

  // Load latest anonymized text for the selected document
  useEffect(() => {
    if (!selectedDocument) {
      setLatestAnonymousText("");
      setLatestAnonymousDocumentId(null);
      setAnonymousTextError(null);
      setIsLoadingAnonymousText(false);
      return;
    }

    const loadAnonymousText = async () => {
      setIsLoadingAnonymousText(true);
      setAnonymousTextError(null);
      try {
        const docs = await getAnonymousDocumentsBySource(selectedDocument.id);
        if (docs.length > 0) {
          const latest = docs[0];
          setLatestAnonymousText(latest.redactedText || "");
          setLatestAnonymousDocumentId(latest.id);
        } else {
          setLatestAnonymousText("");
          setLatestAnonymousDocumentId(null);
        }
      } catch (err) {
        setLatestAnonymousText("");
        setLatestAnonymousDocumentId(null);
        if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
          setAnonymousTextError(null);
        } else {
          setAnonymousTextError("Az anonimizált szöveg betöltése nem sikerült.");
        }
      } finally {
        setIsLoadingAnonymousText(false);
      }
    };

    loadAnonymousText();
  }, [selectedDocument]);

  useEffect(() => {
    if (!selectedDocument || selectedDocument.kind !== "document") {
      setDocumentText("");
      setDocumentTextReason(null);
      setIsLoadingDocumentText(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDocumentText(true);
    setDocumentTextReason(null);
    getDocumentText(selectedDocument.id)
      .then((result) => {
        if (cancelled) return;
        setDocumentText(result.text || "");
        setDocumentTextReason(result.text?.trim() ? null : result.unavailableReason || "A dokumentum szövege még nincs kinyerve.");
      })
      .catch((err) => {
        if (!cancelled) {
          setDocumentText("");
          if (err instanceof ApiError && err.status === 404) {
            setDocumentTextReason("Nincs kinyert dokumentumszöveg.");
          } else {
            setDocumentTextReason("A dokumentum szövegének betöltése nem sikerült.");
          }
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDocumentText(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDocument]);

  useEffect(() => {
    if (!comparisonData || !selectedDocument || selectedDocument.kind !== "contract") {
      setBlockNoteDrafts({});
      return;
    }

    const persisted = new Map(
      (reviewNotesData?.blockNotes || []).map((note) => [note.blockKey, note])
    );

    const seeded: Record<string, BlockNoteDraft> = {};
    comparisonData.blocks.forEach((block) => {
      const key = buildBlockNoteKey(block);
      const persistedNote = persisted.get(key);
      seeded[key] = {
        status: persistedNote?.status || "OK",
        title: persistedNote?.title || "",
        note: persistedNote?.note || "",
      };
    });

    setBlockNoteDrafts(seeded);
  }, [comparisonData, reviewNotesData, selectedDocument]);

  useEffect(() => {
    if (!selectedDocument || selectedDocument.kind !== "contract") {
      setContractEditDraft(null);
      setContractEditDraftError(null);
      setIsLoadingContractEditDraft(false);
      return;
    }

    let cancelled = false;
    setIsLoadingContractEditDraft(true);
    setContractEditDraftError(null);
    getContractEditDraft(selectedDocument.id)
      .then((result) => {
        if (cancelled) return;
        setContractEditDraft(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setContractEditDraft(null);
        if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
          setContractEditDraftError("A szerződéshez nem érhető el menthető edit-draft szerkezet.");
        } else {
          setContractEditDraftError("A szerződés szerkeszthető blokkstruktúrája nem tölthető be.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingContractEditDraft(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDocument]);

  useEffect(() => {
    const loadTimeline = async () => {
      if (!selectedDocument?.id) {
        setTimelineEvents([]);
        return;
      }
      if (selectedDocument.kind === "contract") {
        const response = await getContractTimeline(selectedDocument.id).catch(() => null);
        const events = response?.events || [];
        setTimelineEvents(
          events.slice(0, 6).map((event) => ({
            id: event.id,
            description: event.description || event.typeLabel || event.type,
            createdAt: String(event.createdAt),
          }))
        );
        return;
      }
      const fallback = caseSummaries[selectedDocument.caseId]?.last5TimelineEvents || [];
      setTimelineEvents(
        fallback.slice(0, 6).map((event: TimelineEvent) => ({
          id: event.id,
          description: String(event.type || "Esemény"),
          createdAt: String(event.createdAt),
        }))
      );
    };
    loadTimeline();
  }, [selectedDocument, caseSummaries]);

  const reviewTaskCount = useMemo(() => {
    if (!selectedDocument) return 0;
    return (caseTasks[selectedDocument.caseId] || []).filter((task) => isReviewLikeStatus(task.status)).length;
  }, [selectedDocument, caseTasks]);

  const comparisonSummary = useMemo(() => {
    if (!selectedDocument) return [] as string[];
    if (!effectiveBaseline) {
      return [
        "Nincs elérhető korábbi összevetési alap ugyanabban az ügyben és dokumentumcsaládban.",
        `Kapcsolódó változatok: ${lineage.length}`,
      ];
    }

    const lines: string[] = [];
    lines.push(`Azonos ügy: ${selectedDocument.caseNumber}`);
    lines.push(`Azonos dokumentumcsalád: ${lineageKey(selectedDocument) === lineageKey(effectiveBaseline) ? "igen" : "nem"}`);
    const dayDiff = toDaysDiff(selectedDocument.updatedAt || selectedDocument.createdAt, effectiveBaseline.updatedAt || effectiveBaseline.createdAt);
    if (dayDiff !== null) lines.push(`Frissebb ${Math.max(0, dayDiff)} nappal`);
    if (selectedDocument.status !== effectiveBaseline.status) {
      lines.push(`Státusz változás: ${toReadableStatus(effectiveBaseline.status)} → ${toReadableStatus(selectedDocument.status)}`);
    }
    if (selectedDocument.source !== effectiveBaseline.source) {
      lines.push(`Forrás változás: ${effectiveBaseline.source} → ${selectedDocument.source}`);
    }
    lines.push(`Kapcsolódó változatok: ${lineage.length}`);
    lines.push(`Review feladatok (ügy): ${reviewTaskCount}`);
    return lines;
  }, [selectedDocument, effectiveBaseline, lineage, reviewTaskCount]);

  const effectiveWorkspaceText = useMemo(() => {
    if (contractEditDraft?.blocks?.length) {
      return contractEditDraft.blocks
        .map((block) => {
          const title = block.title?.trim() || "Szerződésblokk";
          const body = block.body?.trim() || "";
          return body ? `${title}\n${body}` : title;
        })
        .join("\n\n---\n\n");
    }
    // Use comparison block text first (available for generated contracts with baseline selected)
    if (comparisonData?.blocks?.length) {
      return comparisonData.blocks
        .map((block) => {
          const title = block.targetBlock?.title || block.sourceBlock?.title || "Szerződésblokk";
          const body = block.targetBlock?.body || block.sourceBlock?.body || "";
          return body ? `${title}\n${body}` : "";
        })
        .filter(Boolean)
        .join("\n\n---\n\n");
    }
    if (documentText) {
      return documentText;
    }
    // Fall back to latest anonymized text only when no original extracted text is available.
    if (latestAnonymousText) {
      return latestAnonymousText;
    }
    return "";
  }, [comparisonData, contractEditDraft, documentText, latestAnonymousText]);

  const activeDraftText = editorDraft || effectiveWorkspaceText || "";
  const hasWorkspaceText = Boolean(effectiveWorkspaceText.trim());
  const hasLocalDraftText = Boolean(editorDraft.trim());
  const isDraftDirty = editorTouched && editorDraft !== effectiveWorkspaceText;
  const toggleTipTapPreview = () => {
    setIsTipTapPreviewEnabled((currentValue) => {
      const nextValue = !currentValue;
      if (nextValue) {
        setTipTapPreviewDraft(editorDraft || effectiveWorkspaceText || "");
        setTipTapSelection({ text: "", from: 0, to: 0, empty: true });
      }
      return nextValue;
    });
  };
  const runTipTapCommand = (command: TipTapEditorCommand) => {
    setTipTapCommandRequest({ id: Date.now(), command });
  };
  const syncTipTapPreviewToWorkingDraft = () => {
    setEditorDraft(tipTapPreviewDraft);
    setEditorTouched(true);
    setEditorNotice("A TipTap előnézet szövege átvéve helyi munkapéldányként.");
  };
  const tipTapToolbarItems: Array<{
    key: TipTapEditorCommand;
    label: string;
    title: string;
    active: boolean;
  }> = [
    { key: "bold", label: "Félkövér", title: "Félkövér formázás", active: tipTapActiveState.bold },
    { key: "italic", label: "Dőlt", title: "Dőlt formázás", active: tipTapActiveState.italic },
    { key: "underline", label: "Aláhúzás", title: "Aláhúzás", active: tipTapActiveState.underline },
    { key: "unordered-list", label: "Felsorolás", title: "Felsorolás", active: tipTapActiveState.bulletList },
    { key: "ordered-list", label: "Számozás", title: "Számozott lista", active: tipTapActiveState.orderedList },
    { key: "paragraph", label: "Bekezdés", title: "Bekezdés", active: tipTapActiveState.paragraph },
  ];
  const editorStatusLabel =
    !hasWorkspaceText && !hasLocalDraftText
      ? "Előkészítő munkanézet"
        : isDraftDirty
        ? "Nem mentett helyi módosítások"
        : "Munkapéldány előkészítve";
  const isDocumentTextLoading = isLoadingDocumentText || isLoadingAnonymousText;
  const isModifiedWorkingCopy =
    selectedDocument?.source === "UPLOADED" &&
    documents.some((d) => d.id === selectedDocument.id && d.status === "MODIFIED_WORKING_COPY");
  const workspaceTextSourceLabel = contractEditDraft?.blocks?.length
    ? contractEditDraft.sourceMode === "saved_draft"
      ? "Mentett edit-draft blokkstruktúra"
      : "Szerkeszthető szerződésblokk-struktúra"
    : comparisonData?.blocks?.length
      ? "Generált dokumentum blokk-szövege"
      : isDocumentTextLoading
      ? "Szöveg betöltése…"
      : isModifiedWorkingCopy && documentText
        ? "Mentett módosított munkapéldány"
        : documentText
          ? "Valós kinyert dokumentumszöveg"
          : latestAnonymousText
            ? "Anonimizált szöveg"
            : documentTextReason
              ? `Nincs kinyert dokumentumszöveg — ${documentTextReason}`
              : "Nincs betöltött dokumentumszöveg";
  const activeCaseId = selectedDocument?.caseId || requestedCaseId;
  const workspaceBacklinkStatusLabel = isDocumentTextLoading
    ? "Szöveg betöltése…"
    : documentText
      ? isModifiedWorkingCopy
        ? "Mentett módosított munkapéldány"
        : "Valós kinyert dokumentumszöveg"
      : "Nincs kinyert dokumentumszöveg";
  const workspaceBacklinkStatusTone: "green" | "gold" | "blue" =
    isDocumentTextLoading ? "blue" : documentText ? "green" : "gold";

  const formatDraftForPreview = (value: string) =>
    value
      .split(/\n\s*\n|\n/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 80);

  const draftPreviewParagraphs = useMemo(() => formatDraftForPreview(activeDraftText), [activeDraftText]);
  const isDraftPreviewTruncated = useMemo(() => {
    const paragraphCount = activeDraftText
      .split(/\n\s*\n|\n/g)
      .map((line) => line.trim())
      .filter(Boolean).length;
    return paragraphCount > 80;
  }, [activeDraftText]);

const filteredClauseTools = useMemo(() => {
    return workspaceClauseCatalogue.filter((tool) => {
      const text = toolSearch.trim().toLowerCase();
      if (!text) return true;
      return (
        tool.title.toLowerCase().includes(text) ||
        tool.description.toLowerCase().includes(text) ||
        tool.tags.some((tag) => tag.toLowerCase().includes(text))
      );
    });
  }, [toolSearch]);

  const activeWorkspaceModeId: WorkspaceModeId = "CONTRACT_REVIEW";
  const activeWorkspaceMode =
    workspaceModeRegistry.find((mode) => mode.id === activeWorkspaceModeId) || workspaceModeRegistry[0];

  const proposedChanges = useMemo(() => {
    if (!comparisonData?.blocks?.length) return [] as Array<{
      id: string;
      type: "addition" | "deletion" | "modification" | "comment";
      text: string;
      author: string;
      timestamp: string;
      explanation: string;
      status: "pending" | "accepted" | "rejected" | "lawyer_edited";
    }>;
    return comparisonData.blocks.map((block) => {
      const text =
        block.targetBlock?.body?.trim() ||
        block.sourceBlock?.body?.trim() ||
        block.targetBlock?.title?.trim() ||
        block.sourceBlock?.title?.trim() ||
        "Nincs szöveges részlet.";
      const type: "addition" | "deletion" | "modification" | "comment" =
        block.status === "added"
          ? "addition"
          : block.status === "removed"
            ? "deletion"
            : block.status === "modified"
              ? "modification"
              : "comment";
      return {
        id: block.id,
        type,
        text,
        author: "Nincs hozzárendelt szerző",
        timestamp: selectedDocument?.updatedAt || selectedDocument?.createdAt || "",
        explanation: block.inlineDiff ? "Szövegszintű eltérés azonosítva." : "Technikai összevetésből származó javaslat.",
        status: "pending" as const,
      };
    });
  }, [comparisonData, selectedDocument?.createdAt, selectedDocument?.updatedAt]);

  const resolvedLocalReviewMarks = useMemo(() => {
    const text = activeDraftText || "";
    return localReviewMarks
      .map((mark) => {
        let start = typeof mark.start === "number" ? mark.start : null;
        let end = typeof mark.end === "number" ? mark.end : null;
        const hasIndexedMatch =
          start !== null &&
          end !== null &&
          start >= 0 &&
          end <= text.length &&
          text.slice(start, end) === mark.quote;

        if (!hasIndexedMatch && mark.quote) {
          const fallbackIndex = text.indexOf(mark.quote);
          if (fallbackIndex >= 0) {
            start = fallbackIndex;
            end = fallbackIndex + mark.quote.length;
          }
        }

        return {
          ...mark,
          resolvedStart: start,
          resolvedEnd: end,
          isResolved: start !== null && end !== null && end > start,
        };
      })
      .sort((a, b) => {
        const aStart = a.resolvedStart ?? Number.MAX_SAFE_INTEGER;
        const bStart = b.resolvedStart ?? Number.MAX_SAFE_INTEGER;
        return aStart - bStart;
      });
  }, [activeDraftText, localReviewMarks]);

  const reviewProgress = useMemo(() => {
    const pending =
      proposedChanges.filter((item) => item.status === "pending").length +
      localReviewMarks.filter((mark) => mark.status === "pending").length;
    const accepted =
      proposedChanges.filter((item) => item.status === "accepted").length +
      localReviewMarks.filter((mark) => mark.status === "accepted").length;
    const rejected =
      proposedChanges.filter((item) => item.status === "rejected").length +
      localReviewMarks.filter((mark) => mark.status === "rejected").length;
    const lawyerEdited =
      proposedChanges.filter((item) => item.status === "lawyer_edited").length +
      localReviewMarks.filter((mark) => mark.status === "lawyer_edited").length;
    return { pending, accepted, rejected, lawyerEdited };
  }, [localReviewMarks, proposedChanges]);
  const hasReviewProgress = reviewProgress.pending + reviewProgress.accepted + reviewProgress.rejected + reviewProgress.lawyerEdited > 0;

  useEffect(() => {
    if (!editorTouched) {
      setEditorDraft(effectiveWorkspaceText || "");
    }
  }, [effectiveWorkspaceText, editorTouched]);

  useEffect(() => {
    setWorkspaceViewMode("edit");
  }, [selectedDocumentId]);

  useEffect(() => {
    setLocalComments([]);
    setLocalCommentDraft("");
    setLocalReviewMarks([]);
    setSelectionSnapshot(null);
    setActiveAnchorId(null);
    setComposerMode(null);
    setComposerDraft("");
  }, [selectedDocumentId]);

  const getWorkspaceDocumentTitle = () => selectedDocument?.fileName || selectedDocument?.title || "Nincs kiválasztott dokumentum";

  const getWorkspaceDocumentKindLabel = () => {
    if (selectedDocument?.kind === "document") return "Feltöltött dokumentum";
    if (selectedDocument?.kind === "contract") return "Generált dokumentum";
    return "Dokumentum";
  };

  const getDocumentLedgerHref = () => {
    if (selectedDocument?.caseId) {
      return `/cases/${encodeURIComponent(selectedDocument.caseId)}/documents?documentId=${encodeURIComponent(selectedDocument.id)}`;
    }
    if (requestedCaseId) {
      return `/cases/${encodeURIComponent(requestedCaseId)}/documents`;
    }
    return "/cases";
  };

  const focusToolSearch = () => {
    setWorkspaceMainTab("clauses");
    toolSearchRef.current?.focus();
  };

  const canPersistWorkspaceSave =
    Boolean(selectedDocument) &&
    (selectedDocument?.kind === "document" || selectedDocument?.kind === "contract");

  const saveAvailabilityTitle = !selectedDocument
    ? "Válassz dokumentumot a mentéshez."
    : !editorDraft.trim()
      ? "Nincs mit menteni."
      : selectedDocument.kind === "contract" && contractEditDraftError
        ? "Módosított munkapéldány mentése későbbi backend patchben lesz aktiválható."
        : selectedDocument.kind === "contract"
          ? "Helyi szerkesztések mentése edit-draftként."
          : "Munkapéldány mentése a Dokumentumtárba.";

  const localAuthorLabel = currentUser?.name || currentUser?.email || "Helyi felhasználó";

  const syncSelectionSnapshot = () => {
    const textarea = editorTextAreaRef.current;
    if (!textarea) {
      setSelectionSnapshot(null);
      return null;
    }

    const currentValue = editorDraft || effectiveWorkspaceText || "";
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    if (start === end) {
      setSelectionSnapshot(null);
      return null;
    }

    const text = currentValue.slice(start, end);
    const nextSelection = { start, end, text };
    setSelectionSnapshot(nextSelection);
    return nextSelection;
  };

  const requireSelectionSnapshot = (emptyMessage: string) => {
    const snapshot = selectionSnapshot || syncSelectionSnapshot();
    if (!snapshot || !snapshot.text.trim()) {
      setEditorNotice(emptyMessage);
      return null;
    }
    return snapshot;
  };

  const focusEditorSelection = (start: number, end: number) => {
    globalThis.setTimeout(() => {
      const textarea = editorTextAreaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, end);
      syncSelectionSnapshot();
    }, 0);
  };

  const focusAnchor = (anchorId: string, preferredTab?: WorkspaceMainTab) => {
    setActiveAnchorId(anchorId);
    if (preferredTab) {
      setWorkspaceMainTab(preferredTab);
    }

    const resolvedMark = resolvedLocalReviewMarks.find(
      (mark) => mark.id === anchorId && mark.isResolved && mark.resolvedStart !== null && mark.resolvedEnd !== null
    );
    if (resolvedMark?.resolvedStart !== undefined && resolvedMark?.resolvedStart !== null && resolvedMark.resolvedEnd !== null) {
      focusEditorSelection(resolvedMark.resolvedStart, resolvedMark.resolvedEnd);
      return;
    }

    const comment = localComments.find((item) => item.id === anchorId);
    if (comment && typeof comment.start === "number" && typeof comment.end === "number" && comment.end > comment.start) {
      focusEditorSelection(comment.start, comment.end);
    }
  };

  const updateEditorText = (
    nextValue: string,
    selection?: { start: number; end: number }
  ) => {
    setEditorDraft(nextValue);
    setEditorTouched(true);
    globalThis.setTimeout(() => {
      if (selection && editorTextAreaRef.current) {
        editorTextAreaRef.current.focus();
        editorTextAreaRef.current.setSelectionRange(selection.start, selection.end);
        syncSelectionSnapshot();
      }
    }, 0);
  };

  const transformSelectedText = (
    transformer: (text: string) => string,
    emptyMessage: string
  ) => {
    const textarea = editorTextAreaRef.current;
    if (!textarea) {
      setEditorNotice(emptyMessage);
      return;
    }

    const currentValue = editorDraft || effectiveWorkspaceText || "";
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;

    if (start === end) {
      setEditorNotice(emptyMessage);
      return;
    }

    const selected = currentValue.slice(start, end);
    const nextValue = `${currentValue.slice(0, start)}${transformer(selected)}${currentValue.slice(end)}`;
    updateEditorText(nextValue, { start, end: start + transformer(selected).length });
  };

  const transformSelectionLines = (
    lineTransformer: (line: string, index: number) => string,
    emptyMessage: string
  ) => {
    const textarea = editorTextAreaRef.current;
    if (!textarea) {
      setEditorNotice(emptyMessage);
      return;
    }

    const currentValue = editorDraft || effectiveWorkspaceText || "";
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selectionStart = currentValue.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lineBreakAfterSelection = currentValue.indexOf("\n", end);
    const selectionEnd = lineBreakAfterSelection === -1 ? currentValue.length : lineBreakAfterSelection;
    const selected = currentValue.slice(selectionStart, selectionEnd);

    if (!selected.trim()) {
      setEditorNotice(emptyMessage);
      return;
    }

    const nextSelection = selected
      .split("\n")
      .map((line, index) => lineTransformer(line, index))
      .join("\n");

    const nextValue = `${currentValue.slice(0, selectionStart)}${nextSelection}${currentValue.slice(selectionEnd)}`;
    updateEditorText(nextValue, { start: selectionStart, end: selectionStart + nextSelection.length });
  };

  const expandSelectionParagraphSpacing = () =>
    transformSelectionLines(
      (line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        return index === 0 ? trimmed : `\n${trimmed}`;
      },
      "Jelölj ki egy vagy több bekezdést a bekezdéstérköz előkészítéséhez."
    );

  const applyLeftAlignmentHelper = () =>
    transformSelectionLines(
      (line) => line.replace(/^\s+/, ""),
      "Jelölj ki egy vagy több bekezdést a balra záráshoz."
    );

  const applyIndentHelper = () =>
    transformSelectionLines(
      (line) => (line.trim() ? `  ${line.replace(/^\s+/, "")}` : line),
      "Jelölj ki egy vagy több bekezdést a behúzáshoz."
    );

  const hasTextSelection = Boolean(selectionSnapshot?.text?.trim());

  const editorToolbarGroups: Array<{
    key: string;
    items: Array<{
      key: string;
      label: string;
      onClick?: () => void;
      disabled?: boolean;
      title?: string;
      tone?: "neutral" | "comment" | "review";
    }>;
  }> = [
    {
      key: "transform",
      items: [
        {
          key: "uppercase",
          label: "Aa↑",
          onClick: () => transformSelectedText((text) => text.toUpperCase(), "Jelölj ki szöveget a művelethez."),
          disabled: !hasTextSelection,
          title: hasTextSelection ? "Kijelölt szöveg nagybetűsítése." : "Jelölj ki szöveget a művelethez.",
        },
        {
          key: "lowercase",
          label: "Aa↓",
          onClick: () => transformSelectedText((text) => text.toLowerCase(), "Jelölj ki szöveget a művelethez."),
          disabled: !hasTextSelection,
          title: hasTextSelection ? "Kijelölt szöveg kisbetűsítése." : "Jelölj ki szöveget a művelethez.",
        },
      ],
    },
    {
      key: "lists",
      items: [
        {
          key: "numbering",
          label: "1.",
          onClick: () =>
            transformSelectionLines(
              (line, index) => `${index + 1}. ${line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "")}`,
              "Jelölj ki egy vagy több bekezdést a számozáshoz."
            ),
          title: "Számozott lista a kijelölt bekezdésekből.",
        },
        {
          key: "bullets",
          label: "•",
          onClick: () =>
            transformSelectionLines(
              (line) => `- ${line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "")}`,
              "Jelölj ki egy vagy több bekezdést a felsoroláshoz."
            ),
          title: "Felsorolás a kijelölt bekezdésekből.",
        },
      ],
    },
    {
      key: "alignment",
      items: [
        {
          key: "left",
          label: "Balra",
          onClick: applyLeftAlignmentHelper,
          title: "Helyi helper: eltávolítja a kijelölt bekezdések behúzását.",
        },
        {
          key: "justify",
          label: "Sorkizárt",
          disabled: true,
          title: "A helyi szerkesztőben a valódi sorkizárt tördelés későbbi patchben lesz aktiválható.",
        },
      ],
    },
    {
      key: "paragraph",
      items: [
        {
          key: "indent",
          label: "Behúzás",
          onClick: applyIndentHelper,
          title: "Helyi helper: két szóközös behúzás a kijelölt bekezdéseken.",
        },
        {
          key: "spacing",
          label: "Térköz",
          onClick: expandSelectionParagraphSpacing,
          title: "Helyi helper: üres sort illeszt a kijelölt bekezdések közé.",
        },
      ],
    },
  ];

  const renderHighlightedWorkspacePreview = () => {
    if (!activeDraftText.trim()) return null;
    if (!resolvedLocalReviewMarks.some((mark) => mark.isResolved)) return null;

    const segments: Array<{
      key: string;
      text: string;
      mark?: (typeof resolvedLocalReviewMarks)[number];
    }> = [];
    let cursor = 0;

    for (const mark of resolvedLocalReviewMarks) {
      if (!mark.isResolved || mark.resolvedStart === null || mark.resolvedEnd === null) continue;
      if (mark.resolvedStart < cursor) continue;
      if (mark.resolvedStart > cursor) {
        segments.push({
          key: `plain-${cursor}`,
          text: activeDraftText.slice(cursor, mark.resolvedStart),
        });
      }
      segments.push({
        key: mark.id,
        text: activeDraftText.slice(mark.resolvedStart, mark.resolvedEnd),
        mark,
      });
      cursor = mark.resolvedEnd;
    }

    if (cursor < activeDraftText.length) {
      segments.push({
        key: `plain-tail-${cursor}`,
        text: activeDraftText.slice(cursor),
      });
    }

    return (
      <div className="rounded-[10px] border border-[#E7DECB] bg-[#FCFAF4] px-5 py-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Review-hivatkozások</p>
            <p className="mt-1 text-[11px] text-[#6D6A62]">A kijelölt helyi kiemelések és megjegyzés-horgonyok itt jelennek meg. Ez nem Word változáskövetés.</p>
          </div>
          <span className="rounded-full border border-[#DDD7CA] bg-white px-2 py-1 text-[10px] font-semibold text-[#514D45]">
            {resolvedLocalReviewMarks.filter((mark) => mark.isResolved).length} helyi review-jel
          </span>
        </div>
        <div className="max-h-[240px] overflow-y-auto whitespace-pre-wrap rounded-[8px] border border-[#EFE8D8] bg-white px-4 py-3 font-serif text-[15px] leading-7 text-[#2A312C]">
          {segments.map((segment) =>
            segment.mark ? (
              <button
                key={segment.key}
                type="button"
                onClick={() => focusAnchor(segment.mark?.id || "", segment.mark?.type === "comment" ? "comments" : "review")}
                className={`rounded-[3px] border px-0.5 text-left transition-colors hover:brightness-[0.98] ${localReviewToneClass[segment.mark.type]} ${
                  activeAnchorId === segment.mark.id ? "ring-2 ring-[#8E6B2E]/30" : ""
                }`}
                title={`${localReviewTypeLabel[segment.mark.type]} — kattints a kapcsolódó panelhez`}
              >
                {segment.text}
              </button>
            ) : (
              <span key={segment.key}>{segment.text}</span>
            )
          )}
        </div>
      </div>
    );
  };

  const activateCompareMode = () => {
    setWorkspaceViewMode("compare");
    if (!selectedBaseline) {
      setEditorNotice("Nincs összevetési alap. Válassz korábbi verziót vagy ments egy módosított munkapéldányt.");
      return;
    }
    globalThis.document.getElementById("history-tech-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleLocalWordCompatibleExport = () => {
    const text = editorDraft || effectiveWorkspaceText;
    if (!text.trim()) {
      setEditorNotice("Nincs exportálható munkaszöveg.");
      return;
    }

    const escapedText = escapeHtml(text).replace(/\n/g, "<br />");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${getWorkspaceDocumentTitle()}</title></head><body>${escapedText}</body></html>`;
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement("a");
    const safeName = getWorkspaceDocumentTitle()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "szerzodes-workspace";
    anchor.href = url;
    anchor.download = `${safeName}.doc`;
    globalThis.document.body.appendChild(anchor);
    anchor.click();
    globalThis.document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setEditorNotice("Word-előkészítő export elkészült. Ez nem szerveroldali Word-mentés és nem illeszt be automatikus fejlécet.");
  };

  const handleAddLocalComment = () => {
    const text = localCommentDraft.trim();
    if (!text) return;
    setLocalComments((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length + 1}`,
        text,
        createdAt: new Date().toISOString(),
        authorLabel: currentUser?.name || currentUser?.email || "Helyi felhasználó",
        persistence: "local-only",
      },
    ]);
    setLocalCommentDraft("");
    setEditorNotice("Helyi megjegyzés hozzáadva. Mentés későbbi patchben lesz bekötve.");
  };

  const createLocalReviewMark = (
    type: LocalReviewMarkType,
    selection: EditorSelectionSnapshot,
    extra?: Partial<LocalReviewMark>
  ) => {
    const reviewMarkId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextMark: LocalReviewMark = {
      id: reviewMarkId,
      type,
      quote: selection.text,
      start: selection.start,
      end: selection.end,
      createdAt: new Date().toISOString(),
      authorLabel: localAuthorLabel,
      status: "pending",
      linkedCommentId: null,
      ...extra,
    };
    setLocalReviewMarks((prev) => [nextMark, ...prev]);
    setActiveAnchorId(reviewMarkId);
    return nextMark;
  };

  const updateLocalReviewMark = (markId: string, updater: (mark: LocalReviewMark) => LocalReviewMark) => {
    setLocalReviewMarks((prev) => prev.map((mark) => (mark.id === markId ? updater(mark) : mark)));
  };

  const applyLocalReviewDecision = (markId: string, status: LocalReviewMarkStatus) => {
    updateLocalReviewMark(markId, (mark) => ({ ...mark, status }));
    setActiveAnchorId(markId);
    setWorkspaceMainTab("review");
    setEditorNotice(
      status === "accepted"
        ? "A helyi review-jel elfogadva. Mentés későbbi patchben."
        : status === "rejected"
          ? "A helyi review-jel elutasítva. Mentés későbbi patchben."
          : "A helyi review-jel szerkesztve jelölést kapott. Mentés későbbi patchben."
    );
  };

  const openReviewMarkEditor = (mark: LocalReviewMark) => {
    setActiveAnchorId(mark.id);
    setWorkspaceMainTab(mark.type === "comment" ? "comments" : "review");
    if (mark.type === "comment" || mark.type === "replacement" || mark.type === "deletion") {
      setComposerMode(mark.type);
      setComposerDraft(mark.type === "replacement" ? mark.replacement || "" : mark.comment || "");
      setEditingReviewMarkId(mark.id);
      focusAnchor(mark.id, mark.type === "comment" ? "comments" : "review");
      return;
    }
    applyLocalReviewDecision(mark.id, "lawyer_edited");
  };

  function handleHighlightSelection() {
    const selection = requireSelectionSnapshot("Jelölj ki szöveget a művelethez.");
    if (!selection) return;
    createLocalReviewMark("highlight", selection);
    setWorkspaceMainTab("review");
    setEditorNotice("A kijelölt szöveg helyi review-kiemelést kapott.");
  }

  function openAnchoredCommentComposer() {
    const selection = requireSelectionSnapshot("Jelölj ki szöveget a művelethez.");
    if (!selection) return;
    setEditingReviewMarkId(null);
    setComposerMode("comment");
    setComposerDraft("");
    setWorkspaceMainTab("comments");
    setEditorNotice(`Kijelölt szöveg: „${getSelectionExcerpt(selection.text, 90)}”`);
  }

  function openProposedChangeComposer(mode: "replacement" | "deletion") {
    const selection = requireSelectionSnapshot("Jelölj ki szöveget a művelethez.");
    if (!selection) return;
    setEditingReviewMarkId(null);
    setComposerMode(mode);
    setComposerDraft("");
    setWorkspaceMainTab("review");
    setEditorNotice(
      mode === "replacement"
        ? `Szövegcsere-javaslat előkészítve: „${getSelectionExcerpt(selection.text, 90)}”`
        : `Törlési javaslat előkészítve: „${getSelectionExcerpt(selection.text, 90)}”`
    );
  }

  function handleSubmitAnchoredComment() {
    const text = composerDraft.trim();
    if (!text) {
      if (!text) setEditorNotice("Írj rövid megjegyzést a kijelölt részhez.");
      return;
    }

    if (editingReviewMarkId) {
      updateLocalReviewMark(editingReviewMarkId, (mark) => ({
        ...mark,
        comment: text,
        status: "lawyer_edited",
      }));
      setLocalComments((prev) =>
        prev.map((comment) =>
          comment.linkedMarkId === editingReviewMarkId
            ? { ...comment, text }
            : comment
        )
      );
      setActiveAnchorId(editingReviewMarkId);
      setEditingReviewMarkId(null);
      setComposerMode(null);
      setComposerDraft("");
      setEditorNotice("A helyi megjegyzés frissítve. Szerveroldali mentés későbbi patchben.");
      return;
    }

    const selection = requireSelectionSnapshot("Jelölj ki szöveget a megjegyzéshez.");
    if (!selection) return;

    const reviewMark = createLocalReviewMark("comment", selection, { comment: text });
    setLocalComments((prev) => [
      {
        id: `comment-${Date.now()}-${prev.length + 1}`,
        text,
        quote: selection.text,
        start: selection.start,
        end: selection.end,
        createdAt: new Date().toISOString(),
        authorLabel: localAuthorLabel,
        persistence: "local-only",
        linkedMarkId: reviewMark.id,
      },
      ...prev,
    ]);
    setActiveAnchorId(reviewMark.id);
    setEditingReviewMarkId(null);
    setComposerMode(null);
    setComposerDraft("");
    setEditorNotice("Helyi megjegyzés létrejött. Szerveroldali mentés későbbi patchben.");
  }

  function handleSubmitProposedChange() {
    if (composerMode !== "replacement" && composerMode !== "deletion") return;
    if (composerMode === "replacement" && !composerDraft.trim()) {
      setEditorNotice("Adj meg javasolt csere-szöveget.");
      return;
    }

    if (editingReviewMarkId) {
      updateLocalReviewMark(editingReviewMarkId, (mark) => ({
        ...mark,
        replacement: composerMode === "replacement" ? composerDraft.trim() : undefined,
        status: "lawyer_edited",
      }));
      setActiveAnchorId(editingReviewMarkId);
      setEditingReviewMarkId(null);
      setComposerMode(null);
      setComposerDraft("");
      setWorkspaceMainTab("review");
      setEditorNotice(
        composerMode === "replacement"
          ? "A helyi cserejavaslat frissítve. Mentés későbbi patchben."
          : "A helyi törlési javaslat frissítve. Mentés későbbi patchben."
      );
      return;
    }

    const selection = requireSelectionSnapshot("Jelölj ki szöveget a művelethez.");
    if (!selection) return;

    createLocalReviewMark(composerMode, selection, {
      replacement: composerMode === "replacement" ? composerDraft.trim() : undefined,
    });
    setEditingReviewMarkId(null);
    setComposerMode(null);
    setComposerDraft("");
    setWorkspaceMainTab("review");
    setEditorNotice(
      composerMode === "replacement"
        ? "Helyi szövegcsere-javaslat rögzítve. Mentés későbbi patchben."
        : "Helyi törlési javaslat rögzítve. Mentés későbbi patchben."
    );
  }

  const buildContractDraftBlocksFromText = (text: string) => {
    const sections = text
      .split(/\n\s*---\s*\n/g)
      .map((section) => section.trim())
      .filter(Boolean);
    const fallbackSections = sections.length
      ? sections
      : text
          .split(/\n{2,}/g)
          .map((section) => section.trim())
          .filter(Boolean);

    return fallbackSections.map((section, index) => {
      const existing = contractEditDraft?.blocks[index];
      const lines = section.split("\n");
      const firstLine = lines[0]?.trim() || "";
      const rest = lines.slice(1).join("\n").trim();
      const hasStructuredHeading = lines.length > 1 && firstLine.length > 0;

      return {
        id: existing?.id,
        title: hasStructuredHeading ? firstLine : existing?.title || `Szakasz ${index + 1}`,
        body: hasStructuredHeading ? rest : section,
        orderIndex: existing?.orderIndex ?? index,
        sourceClauseId: existing?.sourceClauseId ?? null,
      };
    });
  };

  const handleInsertClauseIntoDraft = (clauseText: string) => {
    const normalizedClause = clauseText.trim();
    if (!normalizedClause) {
      setEditorNotice("A kiválasztott klauzula nem tartalmaz beszúrható szöveget.");
      return;
    }

    const base = editorDraft || effectiveWorkspaceText || "";
    const nextDraft = base.trim() ? `${base.trim()}\n\n${normalizedClause}` : normalizedClause;
    setEditorDraft(nextDraft);
    setEditorTouched(true);
    setEditorNotice("Helyi beszúrás megtörtént. A változások mentéséhez külön mentés szükséges.");
  };

  const handleDownload = async (doc: CompareDocument) => {
    try {
      const blob = doc.kind === "contract" ? await downloadContract(doc.id) : await downloadDocument(doc.id);
      const url = URL.createObjectURL(blob);
      const anchor = globalThis.document.createElement("a");
      anchor.href = url;
      anchor.download = doc.fileName || "document";
      globalThis.document.body.appendChild(anchor);
      anchor.click();
      globalThis.document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setEditorNotice("A kért dokumentum letöltése nem érhető el.");
          return;
        }
        if (err.status === 400) {
          setEditorNotice("A dokumentum letöltése jelenleg nem érhető el ehhez a verzióhoz.");
          return;
        }
      }
      setEditorNotice("A dokumentum letöltése sikertelen.");
    }
  };

  const handleSaveWorkspaceVersion = async () => {
    if (!selectedDocument || !editorDraft.trim()) return;
    setIsSavingWorkspace(true);
    setWorkspaceSaveState({ type: null, message: "" });
    try {
      if (selectedDocument.kind === "contract") {
        if (contractEditDraftError) {
          setWorkspaceSaveState({
            type: "error",
            message: "A módosított munkapéldány mentése jelenleg nem érhető el.",
          });
          return;
        }

        const blocks = buildContractDraftBlocksFromText(editorDraft);
        if (blocks.length === 0) {
          setWorkspaceSaveState({
            type: "error",
            message: "A munkapéldány tartalma nem menthető ebben az állapotban.",
          });
          return;
        }

        const result = await saveContractEditDraft(selectedDocument.id, blocks);
        setContractEditDraft((previous) =>
          previous
            ? { ...previous, blocks: result.blocks, sourceMode: "saved_draft", draftMeta: { ...previous.draftMeta, updatedAt: result.updatedAt } }
            : {
                documentId: result.documentId,
                caseId: result.caseId,
                contractType: result.contractType,
                blocks: result.blocks,
                sourceMode: "saved_draft",
                draftMeta: { generationDraftId: result.draftId, updatedAt: result.updatedAt },
              }
        );
        setWorkspaceSaveState({
          type: "success",
          message: "Szerkesztési draft mentve. A véglegesített verzió külön export vagy generálás után jön létre.",
        });
        setEditorTouched(false);
        return;
      }

      const result = await saveWorkspaceDocumentVersion(selectedDocument.id, {
        text: editorDraft,
      });
      setWorkspaceSaveState({
        type: "success",
        message: "Módosított munkapéldány mentve.",
      });
      setEditorTouched(false);
      router.push(`/cases/${encodeURIComponent(selectedDocument.caseId)}/documents?documentId=${encodeURIComponent(result.id)}`);
    } catch (err: any) {
      let message = "A módosított munkapéldány mentése jelenleg nem érhető el.";
      if (err instanceof ApiError) {
        if (err.status === 404 || err.status === 501 || err.status === 0 || err.status === 400 || err.status === 401) {
          message = "A módosított munkapéldány mentése jelenleg nem érhető el.";
        }
      }
      setWorkspaceSaveState({
        type: "error",
        message,
      });
    } finally {
      setIsSavingWorkspace(false);
    }
  };

  const updateBlockDraft = (blockKey: string, patch: Partial<BlockNoteDraft>) => {
    setBlockNoteDrafts((prev) => ({
      ...prev,
      [blockKey]: {
        status: prev[blockKey]?.status || "OK",
        title: prev[blockKey]?.title || "",
        note: prev[blockKey]?.note || "",
        ...patch,
      },
    }));
  };

  const saveBlockNotes = async () => {
    if (!selectedDocument || selectedDocument.kind !== "contract" || !comparisonData) {
      return;
    }

    setBlockNotesSaving(true);
    setBlockNotesSaveState({ type: null, message: "" });

    try {
      const blockNotesPayload = comparisonData.blocks.map((block) => {
        const blockKey = buildBlockNoteKey(block);
        const draft = blockNoteDrafts[blockKey] || { status: "OK" as BlockReviewStatus, title: "", note: "" };
        return {
          blockKey,
          blockOrderIndex: block.targetBlock?.orderIndex ?? block.sourceBlock?.orderIndex ?? undefined,
          sourceClauseId: block.targetBlock?.sourceClauseId || block.sourceBlock?.sourceClauseId || undefined,
          status: draft.status,
          title: draft.title.trim() || undefined,
          note: draft.note.trim() || undefined,
        };
      });

      const saved = await saveReviewNotes({
        generationId: selectedDocument.id,
        overallStatus: reviewNotesData?.overallStatus || "NEEDS_REVISION",
        overallTitle: reviewNotesData?.overallTitle,
        overallNote: reviewNotesData?.overallNote,
        blockNotes: blockNotesPayload,
      });

      setReviewNotesData(saved);
      setBlockNotesSaveState({ type: "success", message: "Blokk-review jegyzetek mentve." });
    } catch {
      setBlockNotesSaveState({ type: "error", message: "A blokk-review jegyzetek mentése sikertelen." });
    } finally {
      setBlockNotesSaving(false);
    }
  };

  const handleDownloadReviewSummary = async () => {
    if (!selectedDocument || selectedDocument.kind !== "contract") {
      return;
    }

    setReviewSummaryDownloading(true);
    try {
      const blob = await downloadReviewSummary(selectedDocument.id);
      const url = URL.createObjectURL(blob);
      const anchor = globalThis.document.createElement("a");
      anchor.href = url;
      anchor.download = `review-summary-${selectedDocument.id}.txt`;
      globalThis.document.body.appendChild(anchor);
      anchor.click();
      globalThis.document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setBlockNotesSaveState({ type: "success", message: "Review összefoglaló exportálva." });
    } catch {
      setBlockNotesSaveState({ type: "error", message: "A review összefoglaló exportálása sikertelen." });
    } finally {
      setReviewSummaryDownloading(false);
    }
  };

  const renderInlineSegments = (
    segments: Array<{ type: 'equal' | 'delete' | 'insert'; text: string }> | undefined,
    mode: 'source' | 'target'
  ) => {
    if (!segments || segments.length === 0) {
      return null;
    }

    return segments.map((segment, index) => {
      if (segment.type === 'equal') {
        return <span key={`${segment.type}-${index}`}>{segment.text}</span>;
      }

      if (segment.type === 'delete' && mode === 'source') {
        return (
          <span key={`${segment.type}-${index}`} className="bg-[#ffe0de] text-[#7a1e1e] line-through">
            {segment.text}
          </span>
        );
      }

      if (segment.type === 'insert' && mode === 'target') {
        return (
          <span key={`${segment.type}-${index}`} className="bg-[#dff1df] text-[#1e6a34] underline">
            {segment.text}
          </span>
        );
      }

      return null;
    });
  };

return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#F3EBD4]">
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="space-y-3 p-4 xl:p-5">
          <header className="rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {activeCaseId ? (
                    <Link
                      href={`/cases/${encodeURIComponent(activeCaseId)}/documents`}
                      className="inline-flex items-center justify-center rounded-[5px] border border-[#D7CCB0] bg-white px-3 py-1.5 text-[11px] font-semibold leading-none text-[#16201A] transition-colors hover:bg-[#F6F2E8]"
                    >
                      ← Dokumentumtár
                    </Link>
                  ) : null}
                  <h1 className="min-w-0 max-w-full truncate font-serif text-[22px] font-medium leading-tight text-[#1F2821]">
                    {getWorkspaceDocumentTitle()}
                  </h1>
                  <span className="rounded-full border border-[#DDD7CA] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#514D45]">
                    Helyi munkapéldány
                  </span>
                  <span className="rounded-full border border-[#DDD7CA] bg-[#FBF9F3] px-2.5 py-1 text-[10px] font-semibold text-[#514D45]">
                    {workspaceBacklinkStatusLabel}
                  </span>
                </div>
                <p className="text-[11px] text-[#6D6A62]">
                  Ügy: <span className="font-semibold text-[#1F2821]">{selectedDocument?.caseNumber || "—"}</span>
                  {" · "}Ügyfél: <span className="font-semibold text-[#1F2821]">{selectedDocument?.caseClientName || "—"}</span>
                  {" · "}Feladat: <span className="font-semibold text-[#1F2821]">ügyvédi review</span>
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-start gap-2 lg:max-w-[420px] lg:justify-end">
                <AdminButton
                  disabled={!canPersistWorkspaceSave || !editorDraft.trim() || isSavingWorkspace || (selectedDocument?.kind === "contract" && Boolean(contractEditDraftError))}
                  variant="primary"
                  onClick={handleSaveWorkspaceVersion}
                  title={saveAvailabilityTitle}
                >
                  {isSavingWorkspace ? "Mentés..." : "Módosított verzió mentése"}
                </AdminButton>
                <AdminButton onClick={handleLocalWordCompatibleExport} variant="gold">
                  Word-előkészítő export
                </AdminButton>
                {activeCaseId ? (
                  <Link
                    href={`/cases/${encodeURIComponent(activeCaseId)}/handoff`}
                    className="inline-flex items-center justify-center rounded-[5px] border border-[#D7CCB0] bg-white px-4 py-2 text-[13px] font-semibold leading-none text-[#16201A] transition-colors hover:border-[#16201A] hover:bg-[#FBF6E7]"
                  >
                    Leadási csomag
                  </Link>
                ) : null}
              </div>
            </div>
            <details className="mt-3 rounded-[8px] border border-[#E7DECB] bg-white px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-[#514D45]">Részletek</summary>
              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(240px,1.2fr)_140px_160px_auto]">
                <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                  Dokumentum
                  <select
                    value={selectedDocument?.id || ""}
                    onChange={(e) => handleWorkspaceDocumentChange(e.target.value)}
                    className="mt-2 w-full rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs normal-case tracking-normal text-[#1F2821]"
                  >
                    <option value="">Válassz dokumentumot</option>
                    {caseScopedDocuments.map((doc) => (
                      <option key={`${doc.kind}-${doc.id}`} value={doc.id}>
                        {doc.fileName} · {doc.source === "GENERATED" ? "Generált" : "Feltöltött"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                  Forrás
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="mt-2 w-full rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs normal-case tracking-normal text-[#1F2821]"
                  >
                    <option value="all">Minden forrás</option>
                    <option value="GENERATED">Generált</option>
                    <option value="UPLOADED">Feltöltött</option>
                  </select>
                </label>
                <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                  Keresés
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Fájlnév / cím"
                    className="mt-2 w-full rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs normal-case tracking-normal text-[#1F2821]"
                  />
                </label>
                <div className="space-y-2">
                  <AdminButton
                    onClick={() => selectedDocument && handleDownload(selectedDocument)}
                    className="w-full justify-start"
                    size="sm"
                    variant="neutral"
                  >
                    Dokumentum letöltése
                  </AdminButton>
                  {selectedBaseline ? (
                    <AdminButton
                      onClick={() => handleDownload(selectedBaseline)}
                      className="w-full justify-start"
                      size="sm"
                      variant="neutral"
                    >
                      Alapdokumentum letöltése
                    </AdminButton>
                  ) : null}
                </div>
              </div>
            </details>
          </header>

          <section className="rounded-[10px] border border-[#D8CFB6] bg-white px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1 rounded-[8px] border border-[#EEE7D9] bg-[#FBF9F3] p-1">
                {([
                  { key: "edit", label: "Szerkesztés" },
                  { key: "review", label: "Review" },
                  { key: "comments", label: "Kommentek" },
                  { key: "clauses", label: "Klauzulák" },
                  { key: "history", label: "Előzmények" },
                ] as { key: WorkspaceMainTab; label: string }[]).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setWorkspaceMainTab(tab.key);
                      if (tab.key === "history") {
                        activateCompareMode();
                      } else {
                        setWorkspaceViewMode("edit");
                      }
                    }}
                    className={`rounded-[6px] px-2.5 py-1 text-[11px] font-semibold ${
                      workspaceMainTab === tab.key
                        ? "bg-[#1F4A33] text-[#F4EFDB]"
                        : "text-[#514D45] hover:bg-white hover:text-[#1F2821]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-[#6D6A62]">
                {workspaceMainTab === "edit"
                  ? "Szerkeszthető munkapéldány"
                  : workspaceMainTab === "review"
                    ? "Ügyvédi review"
                    : workspaceMainTab === "comments"
                      ? "Döntési megjegyzések"
                      : workspaceMainTab === "clauses"
                      ? "Klauzulatár támogatás"
                      : "Technikai előzmények"}
              </div>
            </div>
          </section>

          {error && <div className="p-3 text-xs bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a]">{error}</div>}

              {isLoading ? (
<div className="py-12 text-center text-xs text-[#7B776D]">Szerződés-workspace betöltése...</div>
          ) : !selectedDocument ? (
            <div className="flex flex-col items-center justify-center gap-6 py-16">
              <div className="text-center">
                <h3 className="font-serif text-2xl font-medium text-[#1F2821]">Nincs kiválasztott dokumentum</h3>
                <p className="mt-2 max-w-sm text-sm text-[#7B776D]">A workspace használatához válassz meglévő dokumentumot, vagy tölts fel újat a Dokumentumtárban.</p>
                {caseScopedDocuments.length > 0 ? (
                  <p className="mt-2 text-xs text-[#5F675F]">
                    Ehhez az ügyhöz elérhető {caseScopedDocuments.length} dokumentum. Válassz egyet az alábbi gyorslistából.
                  </p>
                ) : null}
              </div>
              {caseScopedDocuments.length > 0 ? (
                <div className="mx-auto flex w-full max-w-3xl flex-wrap justify-center gap-2">
                  {caseScopedDocuments.slice(0, 6).map((doc) => (
                    <button
                      key={`${doc.kind}-${doc.id}`}
                      type="button"
                      onClick={() => handleWorkspaceDocumentChange(doc.id)}
                      className="inline-flex items-center justify-center rounded-[5px] border border-[#D8CDB6] bg-white px-3 py-2 text-xs font-semibold text-[#16201A] transition-colors hover:border-[#B58A2A] hover:bg-[#FBF6E7]"
                    >
                      {doc.fileName}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3 justify-center">
                <a
                  href={requestedCaseId ? `/cases/${encodeURIComponent(requestedCaseId)}/documents` : '/cases'}
                  className="inline-flex items-center justify-center rounded-[5px] border border-[rgba(22,32,26,0.20)] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#16201A] transition-colors hover:border-[#16201A] hover:bg-[#FBF6E7]"
                >
                  Vissza a Dokumentumtárba
                </a>
                <a
                  href={requestedCaseId ? `/cases/${encodeURIComponent(requestedCaseId)}/documents` : '/cases'}
                  className="inline-flex items-center justify-center rounded-[5px] border border-[#1F4A33] bg-[#1F4A33] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#2A5C44]"
                >
                  Dokumentum kiválasztása
                </a>
                <a
                  href={requestedCaseId ? `/cases/${encodeURIComponent(requestedCaseId)}/documents` : '/cases'}
                  className="inline-flex items-center justify-center rounded-[5px] border border-[#B58A2A] bg-[#FBF6E7] px-5 py-2.5 text-[13px] font-semibold text-[#6C5120] transition-colors hover:bg-[#F2E7C4]"
                >
                  Dokumentum feltöltése
                </a>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <aside className="order-2 min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
                {editorNotice ? (
                  <div className="flex items-start justify-between gap-3 rounded-[8px] border border-[#A6C0AF] bg-[#E2EDE5] p-3 text-[11px] text-[#23472F]">
                    <p className="font-semibold">{editorNotice}</p>
                    <button type="button" onClick={() => setEditorNotice(null)} className="text-sm font-bold leading-none text-[#23472F]" aria-label="Értesítés bezárása">
                      ×
                    </button>
                  </div>
                ) : null}

                <section className="space-y-3 rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] p-4 text-[#1F2821]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-serif text-lg font-medium text-[#1F2821]">
                        {workspaceMainTab === "edit"
                          ? "Szerkesztés"
                          : workspaceMainTab === "review"
                            ? "Review"
                            : workspaceMainTab === "comments"
                              ? "Megjegyzések"
                              : workspaceMainTab === "clauses"
                                ? "Klauzulák"
                                : "Előzmények"}
                      </h2>
                      <p className="mt-1 text-[11px] text-[#6D6A62]">
                        Jobb oldali támogatópanelek. A fő fókusz a munkapéldányon marad.
                      </p>
                    </div>
                    <AdminStatusPill tone="neutral">Munkamód: {activeWorkspaceMode.label}</AdminStatusPill>
                  </div>

                  {workspaceMainTab === "edit" ? (
                    <>
                      <div className="rounded-[8px] border border-[#DDD7CA] bg-white p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Dokumentumállapot</p>
                        <div className="mt-2 space-y-2 text-[11px] text-[#514D45]">
                          <p><span className="font-semibold text-[#1F2821]">Dokumentumtípus:</span> {getWorkspaceDocumentKindLabel()}</p>
                          <p><span className="font-semibold text-[#1F2821]">Szövegforrás:</span> {workspaceTextSourceLabel}</p>
                          <p><span className="font-semibold text-[#1F2821]">Verzió:</span> v{selectedDocument?.revisionNumber || 1}</p>
                        </div>
                        <div className={`mt-3 rounded-[6px] border px-3 py-2 text-[11px] font-semibold ${isDraftDirty ? "border-[#E6C987] bg-[#FAEFCF] text-[#7A5A1F]" : "border-[#D9E6D9] bg-[#F5FAF5] text-[#2F5A37]"}`}>
                          {isDraftDirty ? "Nem mentett helyi módosítások." : "A helyi munkapéldány szerkeszthető, de nem Word változáskövetés."}
                        </div>
                        {workspaceSaveState.type ? (
                          <div className={`mt-3 rounded-[6px] border px-3 py-2 text-[11px] font-semibold ${
                            workspaceSaveState.type === "success"
                              ? "border-[#A6C0AF] bg-[#E2EDE5] text-[#23472F]"
                              : "border-[#F2DAD6] bg-[#FFF5F3] text-[#8B2A2A]"
                          }`}>
                            {workspaceSaveState.message}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-[8px] border border-[#DDD7CA] bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Kijelölés</p>
                          {hasTextSelection ? (
                            <span className="rounded-full border border-[#BFDDBF] bg-[#EEF8ED] px-2 py-0.5 text-[10px] font-semibold text-[#1E6A34]">
                              {selectionSnapshot?.text.trim().length || 0} karakter kijelölve
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[11px] text-[#6D6A62]">
                          {hasTextSelection
                            ? `Kijelölt részlet: „${getSelectionExcerpt(selectionSnapshot?.text || "", 120)}”`
                            : "Jelölj ki szöveget a művelethez."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleHighlightSelection}
                            disabled={!hasTextSelection}
                            className="rounded-[5px] border border-[#BFDDBF] bg-[#EEF8ED] px-2.5 py-1 text-[10px] font-semibold text-[#1E6A34] disabled:cursor-not-allowed disabled:border-[#DDD7CA] disabled:bg-[#FBF9F3] disabled:text-[#8B877E]"
                          >
                            Kiemelés
                          </button>
                          <button
                            type="button"
                            onClick={openAnchoredCommentComposer}
                            disabled={!hasTextSelection}
                            className="rounded-[5px] border border-[#C8D8F0] bg-[#F1F6FE] px-2.5 py-1 text-[10px] font-semibold text-[#244B7A] disabled:cursor-not-allowed disabled:border-[#DDD7CA] disabled:bg-[#FBF9F3] disabled:text-[#8B877E]"
                          >
                            Megjegyzés
                          </button>
                          <button
                            type="button"
                            onClick={() => openProposedChangeComposer("replacement")}
                            disabled={!hasTextSelection}
                            className="rounded-[5px] border border-[#E6C987] bg-[#FAEFCF] px-2.5 py-1 text-[10px] font-semibold text-[#7A5A1F] disabled:cursor-not-allowed disabled:border-[#DDD7CA] disabled:bg-[#FBF9F3] disabled:text-[#8B877E]"
                          >
                            Cserejavaslat
                          </button>
                          <button
                            type="button"
                            onClick={() => openProposedChangeComposer("deletion")}
                            disabled={!hasTextSelection}
                            className="rounded-[5px] border border-[#E5C3C3] bg-[#FFF1F1] px-2.5 py-1 text-[10px] font-semibold text-[#8B2A2A] disabled:cursor-not-allowed disabled:border-[#DDD7CA] disabled:bg-[#FBF9F3] disabled:text-[#8B877E]"
                          >
                            Törlési javaslat
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {workspaceMainTab === "review" ? (
                    <>
                      <div className="rounded-[8px] border border-[#DDD7CA] bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Review nézet</p>
                          <div className="flex flex-wrap gap-1 rounded-[8px] border border-[#EEE7D9] bg-[#FBF9F3] p-1">
                            {([
                              { key: "modified", label: "Módosításokkal" },
                              { key: "clean", label: "Tiszta" },
                              { key: "original", label: "Eredeti" },
                            ] as const).map((option) => (
                              <button
                                key={option.key}
                                type="button"
                                onClick={() => {
                                  setReviewLens(option.key);
                                  if (option.key === "original") {
                                    setWorkspaceViewMode("compare");
                                  }
                                }}
                                className={`rounded-[6px] px-2 py-1 text-[10px] font-semibold ${
                                  reviewLens === option.key ? "bg-[#1F4A33] text-[#F4EFDB]" : "text-[#514D45] hover:bg-white"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {[
                            { label: "Függőben", value: reviewProgress.pending, tone: "border-[#E6C987] bg-[#FAEFCF] text-[#7A5A1F]" },
                            { label: "Elfogadva", value: reviewProgress.accepted, tone: "border-[#BFDDBF] bg-[#EEF8ED] text-[#1E6A34]" },
                            { label: "Elutasítva", value: reviewProgress.rejected, tone: "border-[#E5C3C3] bg-[#FFF1F1] text-[#8B2A2A]" },
                            { label: "Ügyvéd által szerkesztve", value: reviewProgress.lawyerEdited, tone: "border-[#D9CFEA] bg-[#F6F1FD] text-[#63428E]" },
                          ].map((card) => (
                            <div key={card.label} className={`rounded-[6px] border p-2 ${card.tone}`}>
                              <p className="text-[10px] uppercase">{card.label}</p>
                              <p className="mt-1 text-lg font-semibold">{card.value}</p>
                            </div>
                          ))}
                        </div>
                        {!hasReviewProgress ? (
                          <p className="mt-3 rounded-[6px] border border-dashed border-[#DDD7CA] bg-[#FBF9F3] p-3 text-[11px] text-[#7B776D]">
                            Még nincs feldolgozható módosítás.
                          </p>
                        ) : null}
                      </div>

                      {composerMode === "replacement" || composerMode === "deletion" ? (
                        <div className={`rounded-[8px] border p-3 ${composerMode === "replacement" ? "border-[#E6C987] bg-[#FFF9EC]" : "border-[#E5C3C3] bg-[#FFF8F7]"}`}>
                          <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${composerMode === "replacement" ? "text-[#7A5A1F]" : "text-[#8B2A2A]"}`}>
                            {editingReviewMarkId
                              ? composerMode === "replacement"
                                ? "Szövegcsere-javaslat szerkesztése"
                                : "Törlési javaslat szerkesztése"
                              : composerMode === "replacement"
                                ? "Szövegcsere-javaslat"
                                : "Törlési javaslat"}
                          </p>
                          <p className="mt-2 text-[11px] text-[#514D45]">
                            Horgonyzott kijelölés: „{getSelectionExcerpt(selectionSnapshot?.text || "", 120) || "Nincs kijelölés"}”
                          </p>
                          {composerMode === "replacement" ? (
                            <textarea
                              value={composerDraft}
                              onChange={(e) => setComposerDraft(e.target.value)}
                              rows={4}
                              placeholder="Írd be a javasolt csere-szöveget."
                              className="mt-3 w-full rounded-[6px] border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821] outline-none focus:border-[#63428E]"
                            />
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <AdminButton size="xs" variant="primary" onClick={handleSubmitProposedChange}>
                              Helyi review-jel mentése
                            </AdminButton>
                            <AdminButton size="xs" variant="neutral" onClick={() => { setComposerMode(null); setComposerDraft(""); setEditingReviewMarkId(null); }}>
                              Mégse
                            </AdminButton>
                          </div>
                          <p className="mt-2 text-[10px] text-[#7B776D]">Helyi döntés — mentés későbbi patchben.</p>
                        </div>
                      ) : null}

                      {localReviewMarks.length > 0 ? (
                        <div className="space-y-2">
                          {localReviewMarks.map((mark) => (
                            <div
                              key={mark.id}
                              className={`w-full rounded-[8px] border bg-white p-3 text-left transition-colors ${localReviewToneClass[mark.type]} ${
                                activeAnchorId === mark.id ? "ring-2 ring-[#8E6B2E]/30" : ""
                              }`}
                            >
                              <button type="button" onClick={() => focusAnchor(mark.id, "review")} className="w-full text-left">
                                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                  <span className="rounded-full border border-current px-2 py-0.5 font-semibold">
                                    {localReviewTypeLabel[mark.type]}
                                  </span>
                                  <span>{mark.authorLabel}</span>
                                  <span>•</span>
                                  <span>{formatDateTime(mark.createdAt)}</span>
                                  <span className="rounded-full border border-current px-2 py-0.5">{localReviewStatusLabel[mark.status]}</span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-[11px] font-semibold">„{getSelectionExcerpt(mark.quote, 180)}”</p>
                                <p className="mt-2 text-[10px] opacity-80">{localReviewPersistenceLabel[mark.type]}</p>
                                {mark.comment ? <p className="mt-2 text-[11px]">{mark.comment}</p> : null}
                                {mark.replacement ? (
                                  <p className="mt-2 text-[11px]">
                                    <span className="font-semibold">Javasolt csere:</span> {mark.replacement}
                                  </p>
                                ) : null}
                              </button>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => applyLocalReviewDecision(mark.id, "accepted")}
                                  title="Helyi döntés — mentés későbbi patchben."
                                  className="rounded-[5px] border border-[#BFDDBF] bg-white/80 px-2 py-1 text-[10px] text-[#1E6A34]"
                                >
                                  Elfogadás
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyLocalReviewDecision(mark.id, "rejected")}
                                  title="Helyi döntés — mentés későbbi patchben."
                                  className="rounded-[5px] border border-[#E5C3C3] bg-white/80 px-2 py-1 text-[10px] text-[#8B2A2A]"
                                >
                                  Elutasítás
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openReviewMarkEditor(mark)}
                                  title="Helyi döntés — mentés későbbi patchben."
                                  className="rounded-[5px] border border-[#D9CFEA] bg-white/80 px-2 py-1 text-[10px] text-[#63428E]"
                                >
                                  Szerkesztés
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {proposedChanges.length > 0 ? (
                        <div className="rounded-[8px] border border-[#DDD7CA] bg-white p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Javasolt módosítások</p>
                          <div className="mt-3 space-y-2">
                            {proposedChanges.map((item) => (
                              <div key={item.id} className="rounded-[6px] border border-[#EEE7D9] bg-[#FBF9F3] p-3">
                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#7B776D]">
                                  <span className="rounded-full border border-[#DDD7CA] bg-white px-2 py-0.5">
                                    {item.type === "addition"
                                      ? "Hozzáadás"
                                      : item.type === "deletion"
                                        ? "Törlés"
                                        : item.type === "modification"
                                          ? "Módosítás"
                                          : "Komment"}
                                  </span>
                                  <span>{item.author}</span>
                                  <span>•</span>
                                  <span>{formatDateTime(item.timestamp)}</span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-[11px] text-[#514D45]">{item.text}</p>
                                <p className="mt-2 text-[11px] text-[#7B776D]">{item.explanation}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {workspaceMainTab === "comments" ? (
                    <section className="space-y-3">
                      <div className="rounded-[6px] border border-[#C8D8F0] bg-[#F1F6FE] px-3 py-2 text-[11px] text-[#244B7A]">
                        Helyi megjegyzés — szerveroldali mentés későbbi patchben.
                      </div>
                      {composerMode === "comment" ? (
                        <div className="rounded-[8px] border border-[#C8D8F0] bg-white p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6B7E9A]">
                            {editingReviewMarkId ? "Horgonyzott megjegyzés szerkesztése" : "Horgonyzott megjegyzés"}
                          </p>
                          <p className="mt-2 text-[11px] text-[#514D45]">Kijelölt idézet: „{getSelectionExcerpt(selectionSnapshot?.text || "", 120) || "Nincs kijelölés"}”</p>
                          <textarea
                            value={composerDraft}
                            onChange={(e) => setComposerDraft(e.target.value)}
                            rows={4}
                            placeholder="Írd ide a horgonyzott megjegyzést."
                            className="mt-3 w-full rounded-[6px] border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821] outline-none focus:border-[#244B7A]"
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <AdminButton size="xs" variant="primary" onClick={handleSubmitAnchoredComment}>
                              Megjegyzés rögzítése
                            </AdminButton>
                            <AdminButton size="xs" variant="neutral" onClick={() => { setComposerMode(null); setComposerDraft(""); setEditingReviewMarkId(null); }}>
                              Mégse
                            </AdminButton>
                          </div>
                        </div>
                      ) : null}
                      <textarea
                        ref={localCommentRef}
                        value={localCommentDraft}
                        onChange={(e) => setLocalCommentDraft(e.target.value)}
                        rows={4}
                        placeholder="Általános helyi megjegyzés ehhez a munkapéldányhoz."
                        className="w-full rounded-[6px] border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821] outline-none focus:border-[#1F4A33]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <AdminButton size="xs" variant="primary" onClick={handleAddLocalComment} disabled={!localCommentDraft.trim()}>
                          Általános megjegyzés mentése
                        </AdminButton>
                      </div>
                      {localComments.length > 0 ? (
                        <div className="space-y-2">
                          {localComments.map((comment) => (
                            <button
                              key={comment.id}
                              type="button"
                              onClick={() => focusAnchor(comment.linkedMarkId || comment.id, "comments")}
                              className={`w-full rounded-[6px] border p-3 text-left text-[11px] text-[#514D45] transition-colors ${
                                activeAnchorId === (comment.linkedMarkId || comment.id)
                                  ? "border-[#8CB4E6] bg-[#F3F8FF] ring-2 ring-[#D8E6FA]"
                                  : "border-[#E6EDF8] bg-white"
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#6B7E9A]">
                                <span className="font-semibold text-[#1F2821]">{comment.authorLabel}</span>
                                <span>•</span>
                                <span>{formatDateTime(comment.createdAt)}</span>
                                <span className="rounded-full border border-[#D5E3F5] bg-[#F1F6FE] px-2 py-0.5 text-[10px]">
                                  Helyi
                                </span>
                              </div>
                              {comment.quote ? (
                                <p className="mt-2 rounded-[5px] border border-[#E4ECF7] bg-[#F8FBFF] px-2 py-1 text-[10px] italic text-[#4E6786]">
                                  „{getSelectionExcerpt(comment.quote, 140)}”
                                </p>
                              ) : null}
                              <p className="mt-2 whitespace-pre-wrap">{comment.text}</p>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-[#7B776D]">Még nincs megjegyzés ehhez a munkapéldányhoz.</p>
                      )}
                    </section>
                  ) : null}

                  {workspaceMainTab === "clauses" ? (
                    <>
                      <input
                        ref={toolSearchRef}
                        value={toolSearch}
                        onChange={(e) => setToolSearch(e.target.value)}
                        placeholder="Keress klauzulát…"
                        className="w-full rounded-[6px] border border-[#D7CCB0] bg-white px-3 py-2 text-xs text-[#1F2821]"
                      />
                      {filteredClauseTools.length === 0 ? (
                        <p className="rounded-[5px] border border-dashed border-[#DDD7CA] bg-[#FBF9F3] p-3 text-xs text-[#9C9890]">Nincs találat a klauzulák között.</p>
                      ) : (
                        <div className="space-y-2">
                          {filteredClauseTools.map((clause) => (
                            <div key={clause.id} className="rounded-[6px] border border-[#EEE7D9] bg-white p-3">
                              <div className="space-y-1">
                                <h4 className="text-sm font-semibold text-[#1F2821]">{clause.title}</h4>
                                <p className="text-[11px] text-[#7B776D]">{clause.description}</p>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {clause.tags.map((tag) => (
                                  <span key={`${clause.id}-${tag}`} className="rounded-full border border-[#DDD7CA] bg-[#FBF9F3] px-2 py-0.5 text-[10px] text-[#514D45]">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              {expandedToolId === clause.id ? (
                                <div className="mt-3 space-y-2 rounded-[6px] border border-[#DDD7CA] bg-[#FBF9F3] p-3">
                                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-[#514D45]">{clause.text}</p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <AdminButton size="xs" variant="neutral" onClick={() => handleInsertClauseIntoDraft(clause.text)}>
                                      Beszúrás
                                    </AdminButton>
                                    <span className="text-[10px] text-[#7B776D]">Helyi beszúrás — mentés külön szükséges.</span>
                                  </div>
                                </div>
                              ) : null}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <AdminButton size="xs" variant="neutral" onClick={() => setExpandedToolId(expandedToolId === clause.id ? null : clause.id)}>
                                  Előnézet
                                </AdminButton>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : null}

                  {workspaceMainTab === "history" ? (
                    <section className="space-y-3">
                      <div className="rounded-[8px] border border-[#DDD7CA] bg-white p-3">
                        <p className="text-sm font-semibold text-[#1F2821]">Előzmények és technikai összevetés</p>
                        <p className="mt-1 text-[11px] text-[#7B776D]">Ez a nézet audit- és technikai célra marad elérhető. Nem ez a szerződés-workspace elsődleges workflow-ja.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <AdminButton size="xs" variant="neutral" onClick={activateCompareMode}>
                            Technikai összevetés megnyitása
                          </AdminButton>
                          <span className="rounded-full border border-[#DDD7CA] bg-[#FBF9F3] px-2 py-1 text-[10px] text-[#514D45]">
                            {selectedBaseline ? "Alapdokumentum kiválasztva" : "Nincs összevetési alap"}
                          </span>
                        </div>
                      </div>
                    </section>
                  ) : null}
                </section>
              </aside>
              <div className="order-1 min-w-0 space-y-4">
                <DocumentEditorShell
                  ref={editorTextAreaRef}
                  title="Szerkeszthető munkapéldány"
                  subtitle={`Helyi szerkesztési nézet. Nem Word változáskövetés. Forrás: ${workspaceTextSourceLabel}`}
                  value={editorDraft}
                  onChange={(value) => {
                    setEditorDraft(value);
                    setEditorTouched(true);
                  }}
                  showEditor={Boolean(activeDraftText)}
                  isDirty={isDraftDirty}
                  status={<AdminStatusPill tone={isDraftDirty ? "amber" : activeDraftText ? "green" : "neutral"}>{editorStatusLabel}</AdminStatusPill>}
                  badges={
                    <>
                      {workspaceMainTab === "review" ? (
                        <span className="rounded-full border border-[#DDD7CA] bg-white px-2 py-1 text-[10px] font-semibold text-[#514D45]">
                          {reviewLens === "modified" ? "Módosításokkal" : reviewLens === "clean" ? "Tiszta nézet" : "Eredeti nézet"}
                        </span>
                      ) : null}
                    </>
                  }
                  toolbar={
                    <div className="grid w-full gap-3">
                      {workspaceSaveState.type === "success" ? (
                        <div className="rounded-[6px] border border-[#A6C0AF] bg-[#E2EDE5] px-3 py-2 text-[11px] font-semibold text-[#23472F]">
                          {workspaceSaveState.message}
                        </div>
                      ) : workspaceSaveState.type === "error" ? (
                        <div className="rounded-[6px] border border-[#F2DAD6] bg-[#FFF5F3] px-3 py-2 text-[11px] font-semibold text-[#8B2A2A]">
                          {workspaceSaveState.message}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-dashed border-[#D8CFB6] bg-[#FFFDF8] px-3 py-2">
                        <button
                          type="button"
                          onClick={toggleTipTapPreview}
                          className={`rounded-[999px] border px-3 py-1.5 text-[10px] font-semibold transition ${
                            isTipTapPreviewEnabled
                              ? "border-[#B28B2E] bg-[#FAEFCF] text-[#5A4317]"
                              : "border-[#D8CFB6] bg-white text-[#514D45] hover:border-[#B28B2E] hover:bg-[#FBF6E7]"
                          }`}
                          aria-pressed={isTipTapPreviewEnabled}
                        >
                          TipTap előnézet
                        </button>
                        <span className="text-[11px] text-[#7B776D]">
                          {isTipTapPreviewEnabled
                            ? "Kísérleti szerkesztő · helyi munkapéldány · nem Word-változáskövetés."
                            : "Alapértelmezett textarea szerkesztő aktív."}
                        </span>
                        {isTipTapPreviewEnabled ? (
                          <button
                            type="button"
                            onClick={syncTipTapPreviewToWorkingDraft}
                            disabled={tipTapPreviewDraft === editorDraft}
                            className="rounded-[999px] border border-[#1F4A33] bg-[#1F4A33] px-3 py-1.5 text-[10px] font-semibold text-[#F4EFDB] transition hover:bg-[#173827] disabled:cursor-not-allowed disabled:border-[#D8CFB6] disabled:bg-[#EFE9DA] disabled:text-[#9C9890]"
                          >
                            TipTap szöveg átvétele munkapéldányként
                          </button>
                        ) : null}
                      </div>
                      {isTipTapPreviewEnabled ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[#D8CFB6] bg-[#FCFAF4] px-3 py-2">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6C5120]">TipTap pilot</span>
                          {tipTapToolbarItems.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => runTipTapCommand(item.key)}
                              title={item.title}
                              className={`rounded-[6px] border px-2.5 py-1 text-[10px] font-semibold transition ${
                                item.active
                                  ? "border-[#B28B2E] bg-[#FAEFCF] text-[#5A4317] shadow-sm"
                                  : "border-[#E7DECB] bg-white text-[#514D45] hover:border-[#B28B2E] hover:bg-[#FBF6E7]"
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                          <span className="ml-auto text-[11px] text-[#7B776D]">
                            Kijelölés: {tipTapSelection.empty ? "nincs helyi pilot kijelölés" : `${tipTapSelection.text.length} karakter`}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        {editorToolbarGroups.map((group) => (
                          <div key={group.key} className="flex items-center gap-1 rounded-[8px] border border-[#E7DECB] bg-white px-1.5 py-1">
                            {group.items.map((action) => (
                              <button
                                key={action.key}
                                type="button"
                                onClick={action.onClick}
                                disabled={action.disabled}
                                title={action.title}
                                className={`rounded-[5px] px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                                  action.tone === "comment"
                                    ? "text-[#244B7A] hover:bg-[#F1F6FE]"
                                    : action.tone === "review"
                                      ? "text-[#63428E] hover:bg-[#F6F1FD]"
                                      : "text-[#514D45] hover:bg-[#FBF9F3]"
                                } disabled:cursor-not-allowed disabled:text-[#9C9890]`}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  }
                  pageClassName="max-w-[1480px]"
                  canvasClassName="min-h-[720px] bg-[#FFFDF8]"
                  textareaClassName="text-[16.5px]"
                  minHeightClassName="min-h-[680px]"
                  placeholder="Itt jelenik meg a valós kinyert dokumentumszöveg, az anonimizált szöveg vagy a helyi munkapéldány."
                  editorMode={isTipTapPreviewEnabled ? "rich-text-ready" : "plain-text"}
                  editorSlot={
                    isTipTapPreviewEnabled ? (
                      <div className="space-y-3">
                        <div className="rounded-[8px] border border-[#E6C987] bg-[#FAEFCF] px-3 py-2 text-[11px] leading-5 text-[#6C5120]">
                          <span className="font-semibold">Kísérleti szerkesztő · helyi munkapéldány · nem Word-változáskövetés.</span>{" "}
                          A textarea munkanézet bármikor visszakapcsolható; mentés/export a munkapéldány szövegéből történik.
                        </div>
                        <TipTapEditorExperimental
                          value={tipTapPreviewDraft}
                          onChange={setTipTapPreviewDraft}
                          commandRequest={tipTapCommandRequest}
                          onActiveStateChange={setTipTapActiveState}
                          onSelectionChange={setTipTapSelection}
                          placeholder="Kísérleti TipTap előnézet a szerződés-workspace shellben."
                        />
                        <div className="rounded-[8px] border border-dashed border-[#D8CFB6] bg-[#FCFAF4] px-3 py-2 text-[11px] text-[#7B776D]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>Helyi előnézeti szöveg hossza: {tipTapPreviewDraft.length} karakter.</span>
                            <span>A meglévő mentés/export továbbra is a munkapéldány szövegét használja.</span>
                          </div>
                          {!tipTapSelection.empty ? (
                            <p className="mt-2 text-[#6C5120]">
                              Helyi pilot kijelölés: „{getSelectionExcerpt(tipTapSelection.text, 140)}”
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : undefined
                  }
                  onSelect={syncSelectionSnapshot}
                  onKeyUp={syncSelectionSnapshot}
                  onClick={syncSelectionSnapshot}
                  beforeEditor={
                    activeDraftText ? (
                      <div className="pt-1">
                        <div className="border-b border-[#EEE7D9] pb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 break-words font-serif text-[26px] font-medium leading-tight text-[#1F2821]">{getWorkspaceDocumentTitle()}</h3>
                            <span className="rounded-full border border-[#DDD7CA] px-2 py-0.5 text-[10px] text-[#514D45]">{getWorkspaceDocumentKindLabel()}</span>
                          </div>
                          <p className="mt-2 text-[11px] text-[#7B776D]">
                            Ügy: {selectedDocument?.caseNumber || "—"} · Verzió: v{selectedDocument?.revisionNumber || 1}
                            {selectedDocument?.id ? ` · Azonosító: ${selectedDocument.id.slice(0, 8)}` : ""}
                          </p>
                        </div>
                        <div className="pt-6">
                          {hasTextSelection ? (
                            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[8px] border border-[#E6D5A6] bg-[#FCF4DB] px-3 py-2 text-[11px] text-[#6C5120]">
                              <span className="font-semibold">Kijelölés:</span>
                              <span className="max-w-[420px] truncate">„{getSelectionExcerpt(selectionSnapshot?.text || "", 110)}”</span>
                              <button type="button" onClick={handleHighlightSelection} className="rounded-[5px] border border-[#BFDDBF] bg-[#EEF8ED] px-2 py-1 text-[10px] font-semibold text-[#1E6A34]">
                                Kiemelés
                              </button>
                              <button type="button" onClick={openAnchoredCommentComposer} className="rounded-[5px] border border-[#C8D8F0] bg-[#F1F6FE] px-2 py-1 text-[10px] font-semibold text-[#244B7A]">
                                Megjegyzés
                              </button>
                              <button type="button" onClick={() => openProposedChangeComposer("replacement")} className="rounded-[5px] border border-[#E6C987] bg-[#FAEFCF] px-2 py-1 text-[10px] font-semibold text-[#7A5A1F]">
                                Cserejavaslat
                              </button>
                              <button type="button" onClick={() => openProposedChangeComposer("deletion")} className="rounded-[5px] border border-[#E5C3C3] bg-[#FFF1F1] px-2 py-1 text-[10px] font-semibold text-[#8B2A2A]">
                                Törlési javaslat
                              </button>
                            </div>
                          ) : (
                            <div className="mb-4 rounded-[8px] border border-dashed border-[#DDD7CA] bg-[#FBF9F3] px-3 py-2 text-[11px] text-[#7B776D]">
                              Jelölj ki szöveget a művelethez.
                            </div>
                          )}
                          {renderHighlightedWorkspacePreview()}
                        </div>
                      </div>
                    ) : null
                  }
                  afterEditor={
                    activeDraftText ? (
                      <>
                        {isDraftPreviewTruncated ? (
                          <p className="mt-3 text-[11px] text-[#7B776D]">A hosszú dokumentum előnézete rövidítve jelenik meg.</p>
                        ) : null}
                        <p className="mt-3 text-[10px] text-[#9C9890]">Bekezdések: {draftPreviewParagraphs.length}</p>
                      </>
                    ) : null
                  }
                  emptyState={
                    <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                      <h3 className="font-serif text-2xl font-medium text-[#1F2821]">Szerkeszthető munkapéldány</h3>
                      <p className="mt-3 max-w-xl text-sm leading-6 text-[#7B776D]">
                        {isLoadingDocumentText
                          ? "A dokumentumszöveg betöltése folyamatban."
                          : documentTextReason
                          ? `Nincs kinyert dokumentumszöveg — ${documentTextReason}`
                          : anonymousTextError
                          ? `Az anonimizált szöveg betöltése nem sikerült. ${anonymousTextError}`
                          : "A dokumentum szövege még nincs kinyerve. Tölts fel dokumentumot a Dokumentumtárban, hogy a teljes szöveg megjelenjen."}
                      </p>
                      {!isLoadingDocumentText && !documentTextReason && !anonymousTextError ? (
                        <div className="mt-6 flex flex-wrap justify-center gap-2">
                          <AdminButton variant="neutral" onClick={focusToolSearch}>
                            Klauzula keresése
                          </AdminButton>
                          <Link href={getDocumentLedgerHref()} className="inline-flex items-center justify-center rounded-[5px] border border-[rgba(22,32,26,0.20)] bg-white px-4 py-2 text-[13px] font-semibold leading-none text-[#16201A] transition-colors hover:border-[#16201A] hover:bg-[#FBF6E7]">
                            Dokumentumtár
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  }
                />

                {(workspaceMainTab === "history" || workspaceViewMode === "compare") ? (
                <details
                  id="history-tech-panel"
                  open={workspaceViewMode === "compare"}
                  className={`scroll-mt-4 rounded-[10px] border bg-white p-4 ${workspaceViewMode === "compare" ? "border-[#B58A2A] ring-2 ring-[#F2E4BD]" : "border-[#D8CFB6]"}`}
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-sm font-semibold text-[#1F2821]">Előzmények és technikai összevetés</h2>
                        <p className="mt-1 text-[11px] text-[#7B776D]">Audit és technikai ellenőrző nézet. Ez Adminiculumon belüli szöveg-összevetés, nem Word változáskövetés.</p>
                      </div>
                      <span className="rounded-full border border-[#DDD7CA] bg-[#FBF9F3] px-2 py-1 text-[10px] text-[#514D45]">
                        {workspaceViewMode === "compare" ? "Aktív technikai nézet" : "Másodlagos audit nézet"}
                      </span>
                    </div>
                  </summary>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <p className="text-[11px] text-[#7B776D]">
                      Ha nincs kiválasztott alapdokumentum, a felület akkor is használható munkapéldányként.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedBaselineId(previousVersion?.id || null)}
                        disabled={!previousVersion}
                        className="px-2 py-1 border border-[#DDD7CA] text-xs hover:bg-[#FBF9F3] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Közvetlen előző
                      </button>
                      <select
                        value={selectedBaseline?.id || ""}
                        onChange={(e) => setSelectedBaselineId(e.target.value || null)}
                        className="px-2 py-1 border border-[#DDD7CA] text-xs"
                      >
                        <option value="">Nincs összevetési alap</option>
                        {baselineCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.fileName} · {toReadableStatus(candidate.status)} · {formatDateTime(candidate.updatedAt || candidate.createdAt)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                <div className="mb-3 mt-3 p-3 border border-[#EEE7D9] bg-[#FBF9F3] space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-xs font-semibold text-[#1F2821]">Review folyamat</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedDocument.kind === "contract" && (
                        <Link
                          href={`/cases/${selectedDocument.caseId}/review/${selectedDocument.id}`}
                          className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-white"
                        >
                          Review megnyitása
                        </Link>
                      )}
                      <Link
                        href={`/cases/${selectedDocument.caseId}/documents`}
                        className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-white"
                      >
                        Ügy dokumentumai
                      </Link>
                      <button
                        onClick={() => handleDownload(selectedDocument)}
                        className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-white"
                      >
                        Aktuális dokumentum letöltése
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] text-[#514D45]">
                    <span className="px-2 py-0.5 border border-[#DDD7CA] bg-white">Dokumentum státusz: {toReadableStatus(selectedDocument.status)}</span>
                    <span className="px-2 py-0.5 border border-[#DDD7CA] bg-white">Forrás: {selectedDocument.source === "GENERATED" ? "Generált" : "Feltöltött"}</span>
                    <span className="px-2 py-0.5 border border-[#DDD7CA] bg-white">Összevetési alap: {selectedBaseline ? "kiválasztva" : "nincs"}</span>
                    <span className="px-2 py-0.5 border border-[#DDD7CA] bg-white">
                      Blokk-összevetés: {selectedDocument.kind === "contract" && !!comparisonData ? "elérhető" : "nem elérhető"}
                    </span>
                    <span className="px-2 py-0.5 border border-[#DDD7CA] bg-white">Review feladatok: {reviewTaskCount}</span>
                  </div>

                  {!selectedBaseline ? (
                    <p className="text-[11px] text-[#7B776D]">Válassz összevetési alapdokumentumot a pontosabb összevetéshez.</p>
                  ) : selectedDocument.kind !== "contract" ? (
                    <p className="text-[11px] text-[#7B776D]">Ehhez a dokumentumtípushoz jelenleg metaadat alapú összevetés érhető el.</p>
                  ) : comparisonData ? (
                    <p className="text-[11px] text-[#7B776D]">A blokk-szintű összevetés betöltve; folytatható a review.</p>
                  ) : (
                    <p className="text-[11px] text-[#7B776D]">A blokk-szintű összevetés betöltése folyamatban vagy nem érhető el.</p>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="p-3 border border-[#EEE7D9] bg-[#FBF9F3]">
                    <p className="text-[10px] uppercase text-[#7B776D]">Aktuális dokumentum</p>
                    <p className="text-sm font-semibold text-[#1F2821] mt-1 break-all">{selectedDocument.fileName}</p>
                    <ul className="mt-2 text-[11px] text-[#514D45] space-y-1">
                      <li>Ügy: {selectedDocument.caseNumber} · {selectedDocument.caseTitle}</li>
                      <li>Ügyfél: {selectedDocument.caseClientName || "—"}</li>
                      <li>Forrás: {selectedDocument.source === "GENERATED" ? "Generált" : "Feltöltött"}</li>
                      <li>Státusz: {toReadableStatus(selectedDocument.status)}</li>
                      <li className="flex items-center gap-2">
                        Verzió: v{selectedDocument.revisionNumber || 1}
                        {selectedDocument.isCurrentRevision && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#d1e8d3] text-[#23472F] font-bold uppercase tracking-wide">Aktuális</span>
                          )}
                          {selectedDocument.isFinalRevision && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#06190d] text-white font-bold uppercase tracking-wide">Végleges</span>
                          )}
                      </li>
                      <li>Frissítve: {formatDateTime(selectedDocument.updatedAt || selectedDocument.createdAt)}</li>
                    </ul>
                  </div>

                  <div className="p-3 border border-[#EEE7D9] bg-white">
                    <p className="text-[10px] uppercase text-[#7B776D]">Összevetési alapdokumentum</p>
                    {!selectedBaseline ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-[#9C9890]">Nincs összevetési alap.</p>
                        <p className="text-[11px] text-[#7B776D]">
                          Válassz korábbi verziót vagy ments egy módosított munkapéldányt.
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-[#1F2821] mt-1 break-all">{selectedBaseline.fileName}</p>
                        <ul className="mt-2 text-[11px] text-[#514D45] space-y-1">
                          <li>Ügy: {selectedBaseline.caseNumber} · {selectedBaseline.caseTitle}</li>
                          <li>Forrás: {selectedBaseline.source === "GENERATED" ? "Generált" : "Feltöltött"}</li>
                          <li>Státusz: {toReadableStatus(selectedBaseline.status)}</li>
                          <li className="flex items-center gap-2">
                            <span>Verzió: v{selectedBaseline.revisionNumber || 1}</span>
                            {selectedBaseline.isCurrentRevision && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-[#d1e8d3] text-[#23472F] font-bold uppercase tracking-wide">Aktuális</span>
                            )}
                            {selectedBaseline.isFinalRevision && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-[#06190d] text-white font-bold uppercase tracking-wide">Végleges</span>
                            )}
                          </li>
                          <li>Frissítve: {formatDateTime(selectedBaseline.updatedAt || selectedBaseline.createdAt)}</li>
                          <li>{previousVersion?.id === selectedBaseline.id ? "Közvetlen előző verzió" : "Történeti verzió"}</li>
                        </ul>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 p-3 border border-[#EEE7D9] bg-[#F6F2E8] text-xs text-[#514D45] space-y-1">
                  {comparisonSummary.map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                </div>

                <div className="mt-3 p-3 border border-[#EEE7D9] bg-white text-xs text-[#514D45] space-y-1">
                  <p className="font-semibold text-[#1F2821]">Szöveg-összevetés állapota</p>
                  {!selectedBaseline ? (
                    <p className="text-[#7B776D]">
                      Jelenleg csak metaadat-összehasonlítás látszik. Szöveg-összevetéshez válassz alapdokumentumot.
                    </p>
                  ) : selectedDocument.kind !== "contract" ? (
                    <p className="text-[#7B776D]">
                      A felület metaadat-összehasonlítást mutat; blokk-szintű szöveg-összevetés jelenleg csak támogatott szerződésrevíziók esetén érhető el.
                    </p>
                  ) : comparisonData ? (
                    <p>
                      Szöveg-összevetés betöltve. Módosított blokkok:{" "}
                      <span className="font-semibold">{comparisonData.summary.modified}</span>.
                    </p>
                  ) : (
                    <p className="text-[#7B776D]">
                      A rendszer összehasonlítási adatot tölt. Ha nem érhető el blokk-adat, a nézet metaadat összevetésre korlátozódik.
                    </p>
                  )}
                </div>
                </details>
                ) : null}

                <section className="border border-[#DDD7CA] bg-white p-4">
                <h3 className="text-sm font-semibold text-[#1F2821] mb-2">Verziók és előzmények</h3>
                {lineage.length === 0 ? (
                  <p className="text-xs text-[#9C9890]">Nincs elérhető előzményadat.</p>
                ) : (
                  <div className="space-y-2">
                    {lineage.map((doc) => (
                      <div key={`${doc.kind}-${doc.id}`} className="p-2 border border-[#EEE7D9] flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-[#1F2821]">{doc.fileName}</p>
                          <p className="text-[10px] text-[#7B776D]">v{doc.revisionNumber || 1} · {toReadableStatus(doc.status)} · {doc.source === "GENERATED" ? "Generált" : "Feltöltött"} · {formatDateTime(doc.updatedAt || doc.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.isCurrentRevision && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#d1e8d3] text-[#23472F]">Aktuális</span>
                          )}
                          {doc.isFinalRevision && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#06190d] text-white">Végleges</span>
                          )}
                          {doc.id !== selectedDocument.id && (
                            <button onClick={() => setSelectedBaselineId(doc.id)} className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-[#FBF9F3]">
                              Összevetési alap
                            </button>
                          )}
                          <Link href={`/cases/${doc.caseId}/documents`} className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-[#FBF9F3]">Dokumentumok</Link>
                          {doc.kind === "contract" && (
                            <Link href={`/cases/${doc.caseId}/review/${doc.id}`} className="px-2 py-1 text-[10px] border border-[#DDD7CA] hover:bg-[#FBF9F3]">Review</Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="border border-[#DDD7CA] bg-white p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-[#1F2821]">Blokk-szintű összehasonlítás</h3>
                  <div className="flex items-center gap-2">
                    {selectedDocument?.kind === "contract" && (
                      <button
                        onClick={handleDownloadReviewSummary}
                        disabled={reviewSummaryDownloading}
                        className="px-3 py-1.5 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3] disabled:opacity-50"
                      >
                        {reviewSummaryDownloading ? "Exportálás..." : "Review összefoglaló exportálása"}
                      </button>
                    )}
                    {selectedDocument?.kind === "contract" && (
                      <button
                        onClick={saveBlockNotes}
                        disabled={blockNotesSaving || comparisonLoading || reviewNotesLoading || !comparisonData}
                        className="px-3 py-1.5 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3] disabled:opacity-50"
                      >
                        {blockNotesSaving ? "Mentés..." : "Blokk megjegyzések mentése"}
                      </button>
                    )}
                    {selectedDocument?.kind === "contract" && (
                      <Link
                        href={`/cases/${selectedDocument.caseId}/review/${selectedDocument.id}`}
                        className="px-3 py-1.5 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]"
                      >
                        Review megnyitása
                      </Link>
                    )}
                  </div>
                </div>

                {blockNotesSaveState.type && (
                  <div
                    className={`mb-3 p-2 text-xs border ${
                      blockNotesSaveState.type === "success"
                        ? "bg-[#E2EDE5] border-[#A6C0AF] text-[#23472F]"
                        : "bg-[#FEF2F2] border-[#D4B8B8] text-[#8B3A3A]"
                    }`}
                  >
                    {blockNotesSaveState.message}
                  </div>
                )}

                {selectedDocument?.kind !== "contract" ? (
                  <p className="text-xs text-[#9C9890]">Blokk-szintű összevetés jelenleg csak támogatott szerződésrevíziókra érhető el.</p>
                ) : comparisonLoading ? (
                  <p className="text-xs text-[#7B776D]">Összehasonlítás betöltése...</p>
                ) : comparisonError ? (
                  <p className="text-xs text-[#8b3a3a]">{comparisonError}</p>
                ) : !comparisonData ? (
                  <p className="text-xs text-[#9C9890]">Nincs összehasonlítási adat.</p>
                ) : (
                  <>
                    <div className="mb-3 p-3 border border-[#EEE7D9] bg-[#FBF9F3] text-xs text-[#514D45]">
                      <p>
                        Forráskijelölés: <span className="font-semibold">{comparisonData.sourceSelection}</span> ·
                        Biztonság: <span className="font-semibold">{toReadableStatus(comparisonData.confidence)}</span>
                      </p>
                      <p className="text-[11px] text-[#7B776D] mt-1">{comparisonData.confidenceReason}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="px-2 py-0.5 border border-[#DDD7CA]">Változatlan: {comparisonData.summary.unchanged}</span>
                        <span className="px-2 py-0.5 border border-[#DDD7CA]">Módosított: {comparisonData.summary.modified}</span>
                        <span className="px-2 py-0.5 border border-[#DDD7CA]">Hozzáadott: {comparisonData.summary.added}</span>
                        <span className="px-2 py-0.5 border border-[#DDD7CA]">Eltávolított: {comparisonData.summary.removed}</span>
                      </div>
                      <p className="text-[9px] text-[#7B776D] italic mt-2">
                        Az összevetés döntéstámogatásra szolgál: metaadat és elérhető blokk-szintű különbségek alapján segíti a review lépéseket.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {comparisonData.blocks.map((block) => {
                        const blockKey = buildBlockNoteKey(block);
                        const draft = blockNoteDrafts[blockKey] || { status: "OK" as BlockReviewStatus, title: "", note: "" };
                        const statusClass =
                          block.status === "unchanged"
                            ? "bg-[#e4f4e6] text-[#23472F]"
                            : block.status === "modified"
                              ? "bg-[#fff1c2] text-[#6a4b00]"
                              : block.status === "added"
                                ? "bg-[#dff1df] text-[#1e6a34]"
                                : "bg-[#ffe0de] text-[#7a1e1e]";

                        return (
                          <div key={block.id} className="border border-[#EEE7D9]">
                            <div className="px-3 py-2 border-b border-[#EEE7D9] flex items-center justify-between">
                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 ${statusClass}`}>{toReadableStatus(block.status)}</span>
                              <span className="text-[10px] text-[#7B776D]">Illesztés: {toReadableStatus(block.matchStrategy)}</span>
                            </div>
                            <div className="grid md:grid-cols-2">
                              <div className="p-3 border-r border-[#EEE7D9] bg-[#FBF9F3]">
                                <p className="text-[10px] uppercase text-[#7B776D] mb-1">Forrás</p>
                                {block.sourceBlock ? (
                                  <>
                                    <p className="text-xs font-semibold text-[#1F2821]">{block.sourceBlock.title || "—"}</p>
                                    <p className="text-[11px] text-[#514D45] whitespace-pre-wrap mt-1">{block.sourceBlock.body || "—"}</p>
                                    {block.status === 'modified' && block.inlineDiff && (
                                      <p className="text-[11px] text-[#514D45] whitespace-pre-wrap mt-2 border-t border-[#EEE7D9] pt-2">
                                        {renderInlineSegments(block.inlineDiff.sourceSegments, 'source')}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-xs text-[#9C9890]">Nincs forrásblokk</p>
                                )}
                              </div>
                              <div className="p-3 bg-white">
                                <p className="text-[10px] uppercase text-[#7B776D] mb-1">Revízió</p>
                                {block.targetBlock ? (
                                  <>
                                    <p className="text-xs font-semibold text-[#1F2821]">{block.targetBlock.title || "—"}</p>
                                    <p className="text-[11px] text-[#514D45] whitespace-pre-wrap mt-1">{block.targetBlock.body || "—"}</p>
                                    {block.status === 'modified' && block.inlineDiff && (
                                      <p className="text-[11px] text-[#514D45] whitespace-pre-wrap mt-2 border-t border-[#EEE7D9] pt-2">
                                        {renderInlineSegments(block.inlineDiff.targetSegments, 'target')}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-xs text-[#9C9890]">Nincs revíziós blokk</p>
                                )}
                              </div>
                            </div>
                            <div className="px-3 py-3 border-t border-[#EEE7D9] bg-[#FDFBF6] space-y-2">
                              <div className="grid md:grid-cols-[180px_1fr] gap-2 items-center">
                                <label className="text-[10px] uppercase text-[#7B776D]">Review státusz</label>
                                <select
                                  value={draft.status}
                                  onChange={(e) => updateBlockDraft(blockKey, { status: e.target.value as BlockReviewStatus })}
                                  className="w-full border border-[#DDD7CA] bg-white px-2 py-1 text-xs"
                                >
                                  <option value="OK">Rendben</option>
                                  <option value="REVIEW_NEEDED">Review szükséges</option>
                                  <option value="RISK_ISSUE">Kockázati kérdés</option>
                                </select>
                              </div>
                              <div className="grid md:grid-cols-[180px_1fr] gap-2 items-center">
                                <label className="text-[10px] uppercase text-[#7B776D]">Rövid cím</label>
                                <input
                                  value={draft.title}
                                  onChange={(e) => updateBlockDraft(blockKey, { title: e.target.value })}
                                  placeholder="Opcionális rövid cím"
                                  className="w-full border border-[#DDD7CA] bg-white px-2 py-1 text-xs"
                                />
                              </div>
                              <div className="grid md:grid-cols-[180px_1fr] gap-2">
                                <label className="text-[10px] uppercase text-[#7B776D] pt-1">Megjegyzés</label>
                                <textarea
                                  value={draft.note}
                                  onChange={(e) => updateBlockDraft(blockKey, { note: e.target.value })}
                                  rows={3}
                                  placeholder="Opcionális megjegyzés"
                                  className="w-full border border-[#DDD7CA] bg-white px-2 py-1 text-xs resize-y"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
              </div>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}

