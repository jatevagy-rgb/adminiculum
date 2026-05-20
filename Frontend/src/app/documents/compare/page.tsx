"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminBadge, AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { ClientHouseStylePanel } from "@/components/clients/ClientHouseStylePanel";
import { AIPromptPanel } from "@/components/documents/AIPromptPanel";
import { LegalAnalysisIntakePanel } from "@/components/documents/LegalAnalysisIntakePanel";
import { buildHouseStyleInstructionBlock } from "@/components/documents/legalPromptCatalog";
import { CaseWorkspaceNav } from "@/components/cases/CaseWorkspaceNav";
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
  getContractTimeline,
  getCurrentUser,
  getReviewNotes,
  saveReviewNotes,
  getAnonymousDocumentsBySource,
  getCaseClientHouseStyle,
  getDocumentText,
  saveWorkspaceDocumentVersion,
  type BlockReviewStatus,
  type CaseContractListItem,
  type CaseListItem,
  type CaseSummaryResponse,
  type ContractCompareBlock,
  type ContractComparisonResponse,
  type DocumentItem,
  type ReviewNotesResult,
  type TaskItem,
  type TimelineEvent,
  type ClientHouseStyleProfile,
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

type WorkspaceToolMode =
  | "klauzulak"
  | "ai-promptok"
  | "sablonok"
  | "anonimizalas"
  | "rehidratalas"
  | "megjegyzesek"
  | "javitasok";

type WorkspaceClauseItem = {
  id: string;
  type: 'clause';
  title: string;
  description: string;
  tags: string[];
  text: string;
};

type WorkspacePromptTool = {
  id: string;
  type: 'prompt';
  title: string;
  description: string;
  tags: string[];
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

const workspacePromptTools: WorkspacePromptTool[] = [
  { id: "prompt-gyors-kockazatelemzes", type: "prompt", title: "Gyors kockázatelemzés", description: "Rövid, célzott kockázati áttekintés előkészítése.", tags: ["ai", "kockazat"] },
  { id: "prompt-teljes-jogi-elemzes", type: "prompt", title: "Teljes jogi elemzés", description: "Átfogó jogi elemzési prompt előkészítése.", tags: ["ai", "elemzes"] },
  { id: "prompt-hianyzo-adatok-es-iratok", type: "prompt", title: "Hiányzó adatok és iratok", description: "Hiánypótlási pontok összegyűjtéséhez.", tags: ["ai", "hianypotlas"] },
  { id: "prompt-modositasi-javaslatok", type: "prompt", title: "Módosítási javaslatok", description: "Szerződésszöveg javítási irányainak előkészítése.", tags: ["ai", "modositas"] },
  { id: "prompt-ellenoldali-ervek", type: "prompt", title: "Ellenoldali érvek", description: "Ellenérvek és tárgyalási pozíciók feltárásához.", tags: ["ai", "targyalas"] },
  { id: "prompt-formazasi-szamozasi-ellenorzes", type: "prompt", title: "Formázási / számozási ellenőrzés", description: "Szerkezeti és számozási hibák kereséséhez.", tags: ["ai", "formazas"] },
  { id: "prompt-partnerellenorzesi-vazlat", type: "prompt", title: "Partnerellenőrzési vázlat", description: "Partner- és háttérellenőrzéshez használható vázlat.", tags: ["ai", "partner"] },
];

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return value;
  }
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

  const [search, setSearch] = useState("");
  const [caseFilter, setCaseFilter] = useState<string>(requestedCaseId || "all");
  const [reviewFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [hasPreviousOnly] = useState(false);
  const [recentOnly] = useState(false);
const [toolMode, setToolMode] = useState<WorkspaceToolMode>("klauzulak");
  const [toolSearch, setToolSearch] = useState("");
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState("");
  const [editorTouched, setEditorTouched] = useState(false);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [localCommentDraft, setLocalCommentDraft] = useState("");
  const [localComments, setLocalComments] = useState<string[]>([]);
  const toolSearchRef = useRef<HTMLInputElement | null>(null);
  const localCommentRef = useRef<HTMLTextAreaElement | null>(null);

  // Anonymous document text loading state
  const [latestAnonymousText, setLatestAnonymousText] = useState("");
  const [latestAnonymousDocumentId, setLatestAnonymousDocumentId] = useState<string | null>(null);
  const [isLoadingAnonymousText, setIsLoadingAnonymousText] = useState(false);
  const [anonymousTextError, setAnonymousTextError] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [documentTextReason, setDocumentTextReason] = useState<string | null>(null);
  const [isLoadingDocumentText, setIsLoadingDocumentText] = useState(false);
  const [clientHouseStyle, setClientHouseStyle] = useState<ClientHouseStyleProfile | null>(null);
const [isLoadingHouseStyle, setIsLoadingHouseStyle] = useState(false);
  const [houseStyleNotice, setHouseStyleNotice] = useState<string | null>(null);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [workspaceSaveState, setWorkspaceSaveState] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" });

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
        console.error("Contract comparison load failed:", err);
        setComparisonData(null);
        setComparisonError("A blokk-szintű összehasonlítás nem érhető el ehhez a párhoz.");
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
        console.error("Anonymous text load failed:", err);
        setLatestAnonymousText("");
        setLatestAnonymousDocumentId(null);
        setAnonymousTextError("Az anonimizált szöveg betöltése nem sikerült.");
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
        console.error("Document text load failed:", err);
        if (!cancelled) {
          setDocumentText("");
          setDocumentTextReason("A dokumentum szövegének betöltése nem sikerült.");
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
    if (!selectedDocument?.caseId) {
      setClientHouseStyle(null);
      setIsLoadingHouseStyle(false);
      return;
    }

    let cancelled = false;
    setIsLoadingHouseStyle(true);
    getCaseClientHouseStyle(selectedDocument.caseId)
      .then((profile) => {
        if (!cancelled) setClientHouseStyle(profile);
      })
      .catch(() => {
        if (!cancelled) setClientHouseStyle(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHouseStyle(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDocument?.caseId]);

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
  }, [comparisonData, documentText, latestAnonymousText]);

  const activeDraftText = editorDraft || effectiveWorkspaceText || "";
  const hasWorkspaceText = Boolean(effectiveWorkspaceText.trim());
  const hasLocalDraftText = Boolean(editorDraft.trim());
  const isDraftDirty = editorTouched && editorDraft !== effectiveWorkspaceText;
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
  const workspaceTextSourceLabel = comparisonData?.blocks?.length
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
    if (toolMode !== "klauzulak") return [];
    return workspaceClauseCatalogue.filter((tool) => {
      const text = toolSearch.trim().toLowerCase();
      if (!text) return true;
      return (
        tool.title.toLowerCase().includes(text) ||
        tool.description.toLowerCase().includes(text) ||
        tool.tags.some((tag) => tag.toLowerCase().includes(text))
      );
    });
  }, [toolSearch, toolMode]);

  const filteredPromptTools = useMemo(() => {
    if (toolMode !== "ai-promptok") return [];
    return workspacePromptTools.filter((tool) => {
      const text = toolSearch.trim().toLowerCase();
      if (!text) return true;
      return (
        tool.title.toLowerCase().includes(text) ||
        tool.description.toLowerCase().includes(text) ||
        tool.tags.some((tag) => tag.toLowerCase().includes(text))
      );
    });
  }, [toolSearch, toolMode]);

  useEffect(() => {
    if (!editorTouched) {
      setEditorDraft(effectiveWorkspaceText || "");
    }
  }, [effectiveWorkspaceText, editorTouched]);

  const getWorkspaceDocumentTitle = () => selectedDocument?.fileName || selectedDocument?.title || "Nincs kiválasztott dokumentum";

  const selectedCaseClientId = selectedDocument ? caseSummaries[selectedDocument.caseId]?.case?.clientId : undefined;

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
    toolSearchRef.current?.focus();
  };

  const insertClauseIntoDraft = (clauseText: string) => {
    const base = editorDraft || effectiveWorkspaceText || "";
    const nextDraft = base ? `${base}\n\n${clauseText}` : clauseText;
    setEditorDraft(nextDraft);
    setEditorTouched(true);
    setEditorNotice("Klauzula beszúrva a helyi munkapéldányba.");
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
    setLocalComments((prev) => [...prev, text]);
    setLocalCommentDraft("");
    setEditorNotice("Helyi megjegyzés hozzáadva. Mentés külön patchben lesz bekötve.");
  };

  const handleCopyPromptTool = async (toolTitle: string) => {
    const prompt = [
      `Cím: ${toolTitle}`,
      "Magyar nyelven válaszolj.",
      "Őrizd meg a dokumentumban szereplő jelöléseket, placeholder-eket és anonimizált azonosítókat.",
      "Ügyvédi felülvizsgálatra alkalmas munkaterméket készíts, ne végleges jogi tanácsként fogalmazz.",
      "Ne találj ki hiányzó tényeket, adatokat vagy dokumentumtartalmat.",
      effectiveWorkspaceText
        ? `=== ANONIMIZÁLT DOKUMENTUMSZÖVEG ===\n${effectiveWorkspaceText}`
        : "=== DOKUMENTUMSZÖVEG ===\nIlleszd be ide az anonimizált dokumentumszöveget.",
    ].join("\n\n");

    try {
      await navigator.clipboard.writeText(prompt);
      setEditorNotice(
        effectiveWorkspaceText
          ? "Prompt vágólapra másolva."
          : "Prompt-váz másolva. Teljes dokumentumszöveg nélkül csak sablonként használható."
      );
    } catch {
      setEditorNotice("Nem sikerült a prompt másolása.");
    }
  };

  const handleCopyHouseStyleInstructions = async () => {
    const block = buildHouseStyleInstructionBlock(clientHouseStyle);
    if (!block) {
      setHouseStyleNotice("Ehhez az ügyfélhez még nincs másolható house style profil.");
      return;
    }
    try {
      const selectedClientName = selectedDocument?.caseClientName || clientHouseStyle?.officialName || clientHouseStyle?.shortName || "nem ismert ügyfél";
      await navigator.clipboard.writeText([
        block,
        "",
        `Aktív ügyfél: ${selectedClientName}`,
        "Figyelmeztetés: a fejléc referencia; automatikus Word-beillesztés csak külön export modul támogatása esetén történhet.",
      ].join("\n"));
      setHouseStyleNotice("House style instrukciók vágólapra másolva.");
    } catch {
      setHouseStyleNotice("Nem sikerült a house style instrukciók másolása.");
    }
  };

  const handleDownload = async (doc: CompareDocument) => {
    const blob = doc.kind === "contract" ? await downloadContract(doc.id) : await downloadDocument(doc.id);
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement("a");
    anchor.href = url;
    anchor.download = doc.fileName || "document";
    globalThis.document.body.appendChild(anchor);
    anchor.click();
    globalThis.document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleSaveWorkspaceVersion = async () => {
    if (!selectedDocument || !editorDraft.trim()) return;
    setIsSavingWorkspace(true);
    setWorkspaceSaveState({ type: null, message: "" });
    try {
      const result = await saveWorkspaceDocumentVersion(selectedDocument.id, {
        text: editorDraft,
      });
      setWorkspaceSaveState({
        type: "success",
        message: `Módosított munkapéldány mentve.`,
      });
      setEditorTouched(false);
      router.push(`/cases/${encodeURIComponent(selectedDocument.caseId)}/documents?documentId=${encodeURIComponent(result.id)}`);
    } catch (err: any) {
      setWorkspaceSaveState({
        type: "error",
        message: `Mentés sikertelen: ${err?.message || "Ismeretlen hiba."}`,
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
          <span key={`${segment.type}-${index}`} className="bg-[#d9ecff] text-[#143d66] underline">
            {segment.text}
          </span>
        );
      }

      return null;
    });
  };

return (
    <div className="flex-1 flex min-h-0 flex-col bg-[#EFE7CF] xl:flex-row">
      <CaseWorkspaceNav
        caseId={selectedDocument?.caseId || requestedCaseId}
        caseNumber={selectedDocument?.caseNumber}
        title={selectedDocument?.caseTitle}
        clientName={selectedDocument?.caseClientName}
        activeTab="workspace"
        activeDocumentId={selectedDocument?.id}
        helperText="A workspace nem ment automatikusan Word-verziót; a mentés külön művelet."
      />
      <main className="min-w-0 flex-1 overflow-y-auto border-b border-[#DDD7CA] xl:border-b-0 xl:border-r">
        <div className="p-6 space-y-4">
          <header className="rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="inline-flex items-center gap-2 rounded-[5px] border border-[#1F4A33] bg-[#1F4A33] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#F4EFDB]">
                  Workspace
                  <span className="rounded-[3px] border border-[#B58A2A] bg-[rgba(181,138,42,0.18)] px-1.5 py-0.5 text-[9px] text-[#F2E4BD]">
                    jogi munkapéldány
                  </span>
                </div>
                <div className="rounded-[8px] border border-[#D8CFB6] bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {activeCaseId ? (
                      <>
                        <Link
                          href={`/cases/${encodeURIComponent(activeCaseId)}`}
                          className="inline-flex items-center justify-center rounded-[5px] border border-[#1F4A33] bg-[#1F4A33] px-3 py-1.5 text-[11px] font-semibold leading-none text-white transition-colors hover:bg-[#2A5C44]"
                        >
                          ← Vissza az ügyhöz
                        </Link>
                        <Link
                          href={`/cases/${encodeURIComponent(activeCaseId)}/documents`}
                          className="inline-flex items-center justify-center rounded-[5px] border border-[#C8B98A] bg-white px-3 py-1.5 text-[11px] font-semibold leading-none text-[#16201A] transition-colors hover:bg-[#F6F2E8]"
                        >
                          ← Vissza a Dokumentumtárba
                        </Link>
                      </>
                    ) : null}
                    <span className="max-w-full truncate text-xs font-semibold text-[#1F2821]">{getWorkspaceDocumentTitle()}</span>
                    <AdminStatusPill tone={workspaceBacklinkStatusTone}>{workspaceBacklinkStatusLabel}</AdminStatusPill>
                  </div>
                  {isModifiedWorkingCopy ? (
                    <p className="mt-2 text-[11px] text-[#3D4842]">Szöveges munkapéldány. Nem Word változáskövetés.</p>
                  ) : null}
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7B776D]">
                  Ügyeim › {selectedDocument?.caseClientName || selectedDocument?.caseTitle || "Ügy"} › Szerződés-workspace
                </p>
                <div>
                  <h1 className="font-serif text-3xl font-medium leading-tight text-[#1F2821]">Szerződés-workspace</h1>
                  <p className="mt-1 max-w-3xl text-sm text-[#7B776D]">
                    Itt készíthető elő a dokumentum átnézése, anonimizálása, AI elemzése és ügyvédi review-ja.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="max-w-full truncate text-sm font-semibold text-[#1F2821]">{getWorkspaceDocumentTitle()}</span>
                  <AdminBadge tone={selectedDocument?.kind === "contract" ? "green" : "gold"}>{getWorkspaceDocumentKindLabel()}</AdminBadge>
<AdminStatusPill tone={isDocumentTextLoading ? "blue" : hasWorkspaceText ? "green" : "amber"}>
                    {isDocumentTextLoading
                      ? "Szöveg betöltése…"
                      : hasWorkspaceText
                        ? workspaceTextSourceLabel
                        : documentTextReason
                          ? `Nincs kinyert szöveg — ${documentTextReason}`
                          : "Előkészítő nézet"}
                  </AdminStatusPill>
                </div>
                <div className="grid gap-2 rounded-[8px] border border-[#D8CFB6] bg-[#F7F0D9] p-3 md:grid-cols-[1fr_180px_180px]">
                  <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                    Dokumentum kiválasztása
                    <select value={selectedDocument?.id || ""} onChange={(e) => handleWorkspaceDocumentChange(e.target.value)} className="mt-2 w-full rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs normal-case tracking-normal text-[#1F2821]">
                      <option value="">Válassz dokumentumot</option>
                      {caseScopedDocuments.map((doc) => (
                        <option key={`${doc.kind}-${doc.id}`} value={doc.id}>{doc.fileName} · {doc.source === "GENERATED" ? "Generált" : "Feltöltött"}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                    Forrás
                    <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="mt-2 w-full rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs normal-case tracking-normal text-[#1F2821]">
                      <option value="all">Minden forrás</option>
                      <option value="GENERATED">Generált</option>
                      <option value="UPLOADED">Feltöltött</option>
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">
                    Keresés
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Fájlnév / cím" className="mt-2 w-full rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs normal-case tracking-normal text-[#1F2821]" />
                  </label>
                </div>
              </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  href={getDocumentLedgerHref()}
                  className="inline-flex items-center justify-center rounded-[5px] border border-[rgba(22,32,26,0.20)] bg-white px-4 py-2 text-[13px] font-semibold leading-none text-[#16201A] transition-colors hover:border-[#16201A] hover:bg-[#FBF6E7]"
                >
                  Vissza a Dokumentumtárba
                </Link>
                <AdminButton onClick={handleLocalWordCompatibleExport} variant="gold">
                  Word-előkészítő export
                </AdminButton>
                {activeCaseId ? (
                  <Link
                    href={`/cases/${encodeURIComponent(activeCaseId)}/handoff`}
                    className="inline-flex items-center justify-center rounded-[5px] border border-[#DDD7CA] bg-white px-4 py-2 text-[13px] font-semibold leading-none text-[#16201A] transition-colors hover:border-[#16201A] hover:bg-[#FBF6E7]"
                  >
                    Leadási csomag
                  </Link>
                ) : null}
                <AdminButton
                  disabled={!selectedDocument || !editorDraft.trim() || isSavingWorkspace}
                  variant="primary"
                  onClick={handleSaveWorkspaceVersion}
                  title={!selectedDocument ? "Válassz dokumentumot a mentéshez." : !editorDraft.trim() ? "Nincs mit menteni." : "Munkapéldány mentése a Dokumentumtárba."}
                >
                  {isSavingWorkspace ? "Mentés..." : "Módosított verzió mentése"}
                </AdminButton>
                <AdminButton
                  onClick={() => globalThis.document.getElementById("version-compare-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  variant="muted"
                  title="Az összevetés a lenti összevetési panelen érhető el."
                >
                  Verziók összevetése
                </AdminButton>
              </div>
            </div>
          </header>

          {error && <div className="p-3 text-xs bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a]">{error}</div>}

              {isLoading ? (
<div className="py-12 text-center text-xs text-[#7B776D]">Szerződés-workspace betöltése...</div>
          ) : !selectedDocument ? (
            <div className="flex flex-col items-center justify-center gap-6 py-16">
              <div className="text-center">
                <h3 className="font-serif text-2xl font-medium text-[#1F2821]">Nincs kiválasztott dokumentum</h3>
                <p className="mt-2 max-w-sm text-sm text-[#7B776D]">Válassz egy dokumentumot a listából, vagy nyisd meg a Dokumentumtárat.</p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                <a
                  href={requestedCaseId ? `/cases/${encodeURIComponent(requestedCaseId)}/documents` : '/cases'}
                  className="inline-flex items-center justify-center rounded-[5px] border border-[rgba(22,32,26,0.20)] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#16201A] transition-colors hover:border-[#16201A] hover:bg-[#FBF6E7]"
                >
                  Vissza a Dokumentumtárba
                </a>
                <a
                  href={requestedCaseId ? `/documents/compare?caseId=${encodeURIComponent(requestedCaseId)}` : '/documents/compare'}
                  className="inline-flex items-center justify-center rounded-[5px] border border-[#1F4A33] bg-[#1F4A33] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#2A5C44]"
                >
                  Dokumentum kiválasztása
                </a>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 2xl:grid-cols-[300px_minmax(720px,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
<aside className="min-w-0 space-y-3 rounded-[10px] border border-[#D8CFB6] bg-[#F7F0D9] p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
                <div>
                  <h2 className="font-serif text-xl font-medium text-[#1F2821]">Eszközök</h2>
                </div>

                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { key: "klauzulak", label: "Klauzulák" },
                      { key: "ai-promptok", label: "AI promptok" },
                      { key: "sablonok", label: "Sablonok" },
                      { key: "anonimizalas", label: "Anonimizálás" },
                      { key: "rehidratalas", label: "Rehidratálás" },
                      { key: "megjegyzesek", label: "Megjegyzések" },
                      { key: "javitasok", label: "Javítások" },
                    ] as { key: WorkspaceToolMode; label: string }[]
                  ).map((mode) => (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => {
                        setToolMode(mode.key);
                        focusToolSearch();
                      }}
                      className={`rounded-[4px] border px-2 py-1 text-[10px] font-semibold transition-colors ${
                        toolMode === mode.key
                          ? "border-[#1F4A33] bg-[#1F4A33] text-[#F4EFDB]"
                          : "border-[#DDD7CA] bg-white text-[#7B776D] hover:bg-[#FBF9F3]"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                <input
                  ref={toolSearchRef}
                  value={toolSearch}
                  onChange={(e) => setToolSearch(e.target.value)}
                  placeholder={
                    toolMode === "klauzulak"
                      ? "Keress klauzulát…"
                      : toolMode === "ai-promptok"
                      ? "Keress promptot…"
                      : toolMode === "sablonok"
                      ? "Keress sablont…"
                      : "Keresés…"
                  }
                  className="w-full rounded-[6px] border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                />

                {editorNotice ? (
                  <div className="flex items-start justify-between gap-3 rounded-[5px] border border-[#A6C0AF] bg-[#E2EDE5] p-3 text-[11px] text-[#23472F]">
                    <p className="font-semibold">{editorNotice}</p>
                    <button type="button" onClick={() => setEditorNotice(null)} className="text-sm font-bold leading-none text-[#23472F]" aria-label="Értesítés bezárása">
                      ×
                    </button>
                  </div>
                ) : null}

                {toolMode === "klauzulak" ? (
                  <section className="space-y-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B776D]">Klauzulák</h3>
                    {filteredClauseTools.length === 0 ? (
                      <p className="rounded-[5px] border border-dashed border-[#DDD7CA] bg-[#FBF9F3] p-3 text-xs text-[#9C9890]">Nincs találat a klauzulák között.</p>
                    ) : (
                      <div className="space-y-2">
                        {filteredClauseTools.map((clause) => (
                          <div key={clause.id} className="rounded-[6px] border border-[#EEE7D9] bg-[#FBF9F3] p-3">
                            <div className="space-y-1">
                              <h4 className="text-sm font-semibold text-[#1F2821]">{clause.title}</h4>
                              <p className="text-[11px] text-[#7B776D]">{clause.description}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {clause.tags.map((tag) => (
                                  <span key={`${clause.id}-${tag}`} className="rounded-full border border-[#DDD7CA] bg-white px-2 py-0.5 text-[10px] text-[#514D45]">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {expandedToolId === clause.id ? (
                              <p className="mt-3 whitespace-pre-wrap rounded-[5px] border border-[#DDD7CA] bg-white p-3 text-[11px] leading-relaxed text-[#514D45]">{clause.text}</p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <AdminButton size="xs" variant="neutral" onClick={() => setExpandedToolId(expandedToolId === clause.id ? null : clause.id)}>
                                Előnézet
                              </AdminButton>
                              <AdminButton size="xs" variant="primary" onClick={() => insertClauseIntoDraft(clause.text)}>
                                Beszúrás
                              </AdminButton>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ) : null}

                {toolMode === "ai-promptok" ? (
                  <section className="space-y-3">
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B776D]">AI promptok</h3>
                      <p className="mt-1 text-[10px] text-[#7B776D]">Adminiculum nem hív külső AI-t; a promptok vágólapra másolhatók.</p>
                    </div>

                    <AIPromptPanel
                      caseId={selectedDocument.caseId}
                      documentId={selectedDocument.id}
                      documentTitle={selectedDocument.fileName || selectedDocument.title}
                      anonymizedText={effectiveWorkspaceText}
                      clientHouseStyle={clientHouseStyle}
                    />

                    <div className="border-t border-[#EEE7D9] pt-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B776D] mb-2">AI válasz visszaillesztése</h4>
                      <p className="text-[10px] text-[#7B776D] mb-2">Az elemzés ügyvédi felülvizsgálatot igényel; nem minősül végleges jogi állásfoglalásnak.</p>
                      <LegalAnalysisIntakePanel
                        caseId={selectedDocument.caseId}
                        documentId={selectedDocument.id}
                        documentSourceType="DOCUMENT"
                        documentTitle={selectedDocument.fileName || selectedDocument.title}
                      />
                    </div>

                    {filteredPromptTools.length > 0 ? (
                      <div className="border-t border-[#EEE7D9] pt-3 space-y-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B776D]">AI válasz visszaillesztése</h4>
                        {filteredPromptTools.map((tool) => (
                          <div key={tool.id} className="rounded-[6px] border border-[#D6DEEC] bg-white p-3">
                            <div className="space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="text-sm font-semibold text-[#1F2821]">{tool.title}</h4>
                                <AdminStatusPill tone={effectiveWorkspaceText ? "green" : "neutral"} className="shrink-0">
                                  {effectiveWorkspaceText ? "Szöveggel használható" : "Csak prompt-váz"}
                                </AdminStatusPill>
                              </div>
                              <p className="text-[11px] text-[#7B776D]">{tool.description}</p>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <AdminButton size="xs" variant="gold" onClick={() => handleCopyPromptTool(tool.title)}>
                                Másolás
                              </AdminButton>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {toolMode === "sablonok" ? (
                  <section className="space-y-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B776D]">Ügyfél-specifikus sablonok</h3>
                    <div className="rounded-[6px] border border-[#DDD7CA] bg-[#F6F2E8] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-[#1F2821]">House style profil</h4>
                          <p className="mt-1 text-[11px] text-[#7B776D]">
                            {isLoadingHouseStyle
                              ? "House style profil betöltése..."
                              : clientHouseStyle
                                ? "Az ügyfél house style profilja elérhető a promptokhoz és előkészítő instrukciókhoz."
                                : "Ehhez az ügyfélhez még nincs house style profil."}
                          </p>
                        </div>
                        <AdminStatusPill tone={clientHouseStyle ? "green" : "neutral"}>{clientHouseStyle ? "Profil van" : "Nincs profil"}</AdminStatusPill>
                      </div>
                      {clientHouseStyle ? (
                        <div className="mt-3 space-y-2 rounded border border-[#EEE7D9] bg-white p-2 text-[11px] text-[#3D4842]">
                          <p>{[clientHouseStyle.preferredLanguage, clientHouseStyle.documentLanguageMode, clientHouseStyle.fontFamily, clientHouseStyle.headingStyle].filter(Boolean).join(" · ") || "A profil elérhető, de még kevés formázási adatot tartalmaz."}</p>
                          {clientHouseStyle.headerAssetPath ? <img src={clientHouseStyle.headerAssetPath} alt={clientHouseStyle.headerDescription || "Ügyfél fejlécminta"} className="max-h-14 max-w-full rounded border border-[#EEE7D9] bg-white object-contain" /> : <p className="text-[#7B776D]">Nincs fejlécminta.</p>}
                          {clientHouseStyle.headerDescription ? <p>{clientHouseStyle.headerDescription}</p> : null}
                          {clientHouseStyle.brandingNotes ? <p className="whitespace-pre-wrap">{clientHouseStyle.brandingNotes}</p> : null}
                          <p className="text-[10px] text-[#7B776D]">A fejlécminta referencia; automatikus Word-beillesztés külön export patchben készül el.</p>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <AdminButton size="xs" variant="gold" onClick={handleCopyHouseStyleInstructions} disabled={!clientHouseStyle}>House style + fejléc instrukció másolása</AdminButton>
                      </div>
                      {houseStyleNotice ? <p className="mt-2 text-[10px] font-semibold text-[#23472F]">{houseStyleNotice}</p> : null}
                    </div>
                    {selectedCaseClientId ? (
                      <div className="max-h-[420px] overflow-y-auto rounded-[6px] border border-[#DDD7CA] bg-white">
                        <ClientHouseStylePanel
                          compact
                          clientId={selectedCaseClientId}
                          clientName={selectedDocument.caseClientName}
                          onSaved={() => {
                            if (selectedDocument?.caseId) {
                              getCaseClientHouseStyle(selectedDocument.caseId).then(setClientHouseStyle).catch(() => setClientHouseStyle(null));
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <p className="rounded border border-dashed border-[#DDD7CA] bg-white p-3 text-[11px] text-[#7B776D]">
                        Az ügyfél azonosítója nem érhető el, ezért a profil szerkesztése itt nem nyitható meg.
                      </p>
                    )}
                  </section>
                ) : null}

                {toolMode === "anonimizalas" ? (
                  <section className="space-y-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B776D]">Anonimizálás</h3>
                    {isLoadingAnonymousText && !effectiveWorkspaceText ? (
                      <div className="rounded-[5px] border border-[#D6DEEC] bg-[#EAEFF6] p-3">
                        <p className="text-xs font-semibold text-[#2D4A7C]">Anonimizált munkaszöveg betöltése…</p>
                      </div>
                    ) : effectiveWorkspaceText ? (
                      <div className="rounded-[5px] border border-[#A6C0AF] bg-[#E2EDE5] p-3 space-y-2">
                        <p className="text-xs font-bold text-[#23472F]">Anonimizált munkaszöveg elérhető</p>
                        <p className="text-[11px] leading-5 text-[#23472F]">A promptok és a jogi elemzés már a legutóbbi elérhető anonimizált munkaszövegre épülhetnek.</p>
                        {latestAnonymousDocumentId ? <p className="text-[10px] text-[#4A6B4A]">Munkaszöveg azonosító: {latestAnonymousDocumentId.slice(0, 8)}</p> : null}
                        <Link href={getDocumentLedgerHref()} className="block rounded-[5px] border border-[#A6C0AF] bg-white px-3 py-2 text-center text-xs font-semibold text-[#23472F] hover:bg-[#F6F2E8]">
                          Újra megnyitás a Dokumentumtárban
                        </Link>
                      </div>
                    ) : (
                      <div className="rounded-[5px] border border-[#F2E4BD] bg-[#FAEFCF] p-3 space-y-2">
                        <p className="text-xs font-bold text-[#7A5A1F]">Anonimizálás szükséges az AI elemzéshez</p>
                        <p className="text-[11px] leading-5 text-[#7A5A1F]">A szerződés-workspace megnyitható anonimizálás nélkül is, de az AI promptok és jogi elemzés anonimizált munkaszövegre épülnek.</p>
                        <Link href={getDocumentLedgerHref()} className="block rounded-[5px] border border-[#8E6A1B] bg-[#B58A2A] px-3 py-2 text-center text-xs font-semibold text-white hover:bg-[#8E6A1B]">
                          Anonimizálás indítása
                        </Link>
                      </div>
                    )}
                    {anonymousTextError ? (
                      <p className="rounded-[5px] border border-[#F2E4BD] bg-[#FAEFCF] p-2 text-[10px] text-[#7A5A1F]">
                        Az anonimizált szöveg betöltése nem sikerült. A Dokumentumtárban újra megnyitható az anonimizálás.
                      </p>
                    ) : null}
                  </section>
                ) : null}

                {toolMode === "rehidratalas" ? (
                  <section className="space-y-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B776D]">Rehidratálás</h3>
                    <div className="rounded-[6px] border border-dashed border-[#DDD7CA] bg-[#F6F2E8] p-3">
                      <p className="text-xs font-semibold text-[#1F2821]">Rehidratálás későbbi patchben</p>
                      <p className="mt-1 text-[11px] text-[#7B776D]">Az AI válaszból készített módosított dokumentum visszaépítése külön munkafolyamatban történik.</p>
                      <p className="mt-2 text-[10px] text-[#9C9890]">Rehidratálási művelet a Dokumentumtárban vagy külön modalban érhető el.</p>
                    </div>
                  </section>
                ) : null}

                {toolMode === "megjegyzesek" ? (
                  <section className="space-y-3">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B776D]">Helyi megjegyzések</h3>
                    <textarea
                      ref={localCommentRef}
                      value={localCommentDraft}
                      onChange={(event) => setLocalCommentDraft(event.target.value)}
                      placeholder="Írj előkészítő megjegyzést az ügyvédnek…"
                      rows={3}
                      className="w-full resize-y rounded-[5px] border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821] outline-none focus:border-[#1F4A33]"
                    />
                    <div className="flex gap-2">
                      <AdminButton size="sm" variant="primary" onClick={handleAddLocalComment}>
                        Megjegyzés hozzáadása
                      </AdminButton>
                    </div>
                    <div className="space-y-2">
                      {localComments.length > 0 ? (
                        localComments.map((comment, index) => (
                          <div key={`${index}-${comment.slice(0, 16)}`} className="rounded-[5px] border border-[#DDD7CA] bg-white p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Megjegyzés #{index + 1}</p>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-[#1F2821]">{comment}</p>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-[5px] border border-dashed border-[#DDD7CA] bg-white p-3 text-xs text-[#9C9890]">Még nincs helyi megjegyzés.</p>
                      )}
                    </div>
                  </section>
                ) : null}

                {toolMode === "javitasok" ? (
                  <section className="space-y-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B776D]">Javítási mód</h3>
                    <div className="rounded-[6px] border border-dashed border-[#DDD7CA] bg-[#F6F2E8] p-3">
                      <p className="text-xs font-semibold text-[#1F2821]">Javítási mód</p>
                      <p className="mt-1 text-[11px] text-[#7B776D]">A javítási mód későbbi patchben kapcsolódik szerveroldali dokumentumszerkesztéshez. Itt egyelőre helyi munkanézeti jelölések használhatók.</p>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-block rounded bg-[#d9ecff] px-2 py-0.5 text-[10px] text-[#143d66] underline">beszúrt szöveg</span>
                          <span className="text-[10px] text-[#7B776D]">← beszúrt</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block rounded bg-[#ffe0de] px-2 py-0.5 text-[10px] text-[#7a1e1e] line-through">törölt szöveg</span>
                          <span className="text-[10px] text-[#7B776D]">← törölt</span>
                        </div>
                      </div>
                      <AdminButton size="xs" variant="muted" disabled className="mt-3">
                        Valódi track changes később
                      </AdminButton>
                    </div>
                  </section>
                ) : null}
              </aside>

              <div className="min-w-0 space-y-4">
                <section className="overflow-hidden rounded-[10px] border border-[#D8CFB6] bg-white">
                  <div className="flex flex-col gap-3 border-b border-[#EEE7D9] p-4 lg:flex-row lg:items-start lg:justify-between">
<div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-serif text-2xl font-medium text-[#1F2821]">Szerkeszthető munkapéldány</h2>
                        <AdminStatusPill tone={isDraftDirty ? "amber" : activeDraftText ? "green" : "neutral"}>{editorStatusLabel}</AdminStatusPill>
                      </div>
<p className="text-[11px] text-[#7B776D]">Helyi szerkesztési nézet. Nem Word változáskövetés. Forrás: {workspaceTextSourceLabel}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AdminButton size="sm" variant="neutral" onClick={focusToolSearch} title="Bal oldali eszköztárban kereshetsz klauzulát.">
                        Klauzula beszúrása
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="neutral"
                        onClick={() => {
                          if (localCommentRef.current) {
                            localCommentRef.current.focus();
                            localCommentRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
                          } else {
                            setEditorNotice("A megjegyzésmező lent található.");
                          }
                        }}
                      >
                        Megjegyzés hozzáadása
                      </AdminButton>
                      <AdminButton size="sm" variant="gold" onClick={handleLocalWordCompatibleExport}>
                        Word-előkészítő export
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        disabled={!selectedDocument || !editorDraft.trim() || isSavingWorkspace}
                        variant="primary"
                        onClick={handleSaveWorkspaceVersion}
                        title={!selectedDocument ? "Válassz dokumentumot a mentéshez." : !editorDraft.trim() ? "Nincs mit menteni." : "Munkapéldány mentése a Dokumentumtárba."}
                      >
                        {isSavingWorkspace ? "Mentés..." : "Módosított verzió mentése"}
                      </AdminButton>
                    </div>
                  </div>

{isDraftDirty ? (
                    <div className="border-b border-[#E6C987] bg-[#FAEFCF] px-4 py-3 text-xs font-semibold text-[#7A5A1F]">
                      A munkapéldány helyi módosításokat tartalmaz. Ezek még nincsenek szerveroldalon mentve.
                    </div>
                  ) : null}

                  {workspaceSaveState.type === "success" ? (
                    <div className="border-b border-[#A6C0AF] bg-[#E2EDE5] px-4 py-3 text-xs font-semibold text-[#23472F]">
                      {workspaceSaveState.message}
                    </div>
                  ) : workspaceSaveState.type === "error" ? (
                    <div className="border-b border-[#F2DAD6] bg-[#FFF5F3] px-4 py-3 text-xs font-semibold text-[#8B2A2A]">
                      {workspaceSaveState.message}
                    </div>
                  ) : null}

                <div className="bg-[#EFE7CF] px-3 py-5 sm:px-6 lg:px-8 xl:px-12">
                    <div className="mx-auto flex w-full max-w-[1400px] items-start gap-4">
                    <div className="min-h-[760px] flex-1 border border-[rgba(22,32,26,0.14)] bg-white px-6 py-8 shadow-[0_18px_50px_rgba(22,32,26,0.14)] sm:px-12 lg:px-20 xl:px-28">
                      <div className="border-b border-[#EEE7D9] pb-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B776D]">Helyi munkapéldány</p>
                        <h3 className="mt-2 break-words font-serif text-2xl font-medium leading-tight text-[#1F2821]">{getWorkspaceDocumentTitle()}</h3>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[#7B776D]">
                          <span className="rounded-full border border-[#DDD7CA] px-2 py-0.5">{getWorkspaceDocumentKindLabel()}</span>
                          <span className="rounded-full border border-[#DDD7CA] px-2 py-0.5">helyi munkapéldány</span>
                          {selectedDocument?.id ? <span className="rounded-full border border-[#DDD7CA] px-2 py-0.5">ID: {selectedDocument.id.slice(0, 8)}</span> : null}
                        </div>
                      </div>

                      {activeDraftText ? (
                        <div className="pt-6">
                          <textarea
                            value={editorDraft}
                            onChange={(event) => {
                              setEditorDraft(event.target.value);
                              setEditorTouched(true);
                            }}
                            placeholder="Itt jelenik meg a valós kinyert dokumentumszöveg, az anonimizált szöveg vagy a helyi munkapéldány."
                            className="min-h-[600px] w-full resize-y border-0 bg-white p-0 font-serif text-[15px] leading-8 text-[#1F2821] outline-none placeholder:text-[#A6AEA3] focus:ring-0"
                          />
                          {isDraftPreviewTruncated ? (
                            <p className="mt-3 text-[11px] text-[#7B776D]">A hosszú dokumentum előnézete rövidítve jelenik meg.</p>
                          ) : null}
                          <p className="mt-3 text-[10px] text-[#9C9890]">Bekezdések: {draftPreviewParagraphs.length}</p>
                        </div>
                      ) : (
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
                      )}
                    </div>
                    <aside className="hidden w-[290px] shrink-0 space-y-2 rounded-[8px] border border-[#D8CFB6] bg-[#FBF6E7] p-3 xl:block">
                      <h3 className="font-serif text-lg font-medium text-[#1F2821]">Dokumentum adatai</h3>
                      <div className="space-y-1 text-[11px] text-[#514D45]">
                        <p><span className="font-semibold text-[#1F2821]">Név:</span> {getWorkspaceDocumentTitle()}</p>
                        <p><span className="font-semibold text-[#1F2821]">Szövegstátusz:</span> {workspaceTextSourceLabel}</p>
                        <p><span className="font-semibold text-[#1F2821]">Verzió:</span> v{selectedDocument.revisionNumber || 1}</p>
                      </div>
                      {activeCaseId ? (
                        <Link
                          href={`/cases/${encodeURIComponent(activeCaseId)}/handoff`}
                          className="block rounded-[5px] border border-[#DDD7CA] bg-white px-3 py-2 text-center text-[11px] font-semibold text-[#16201A] hover:bg-[#FBF9F3]"
                        >
                          Leadási csomag megnyitása
                        </Link>
                      ) : null}
                      <details className="rounded-[6px] border border-[#DDD7CA] bg-white p-2">
                        <summary className="cursor-pointer text-[11px] font-semibold text-[#1F2821]">Technikai részletek</summary>
                        <div className="mt-2 space-y-1 text-[10px] text-[#7B776D]">
                          <p>Dokumentum ID: {selectedDocument.id}</p>
                          <p>Ügy ID: {selectedDocument.caseId}</p>
                          <p>Forrás: {selectedDocument.source === "GENERATED" ? "Generált" : "Feltöltött"}</p>
                        </div>
                      </details>
                    </aside>
                    </div>
                  </div>
                </section>

                <section id="version-compare-panel" className="scroll-mt-4 border border-[#DDD7CA] bg-white p-4">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[#1F2821]">Verziók és összevetés</h2>
                    <p className="mt-1 text-[11px] text-[#7B776D]">A munkapéldány szerkesztése és az ügyvédi review ettől külön kezelendő.</p>
                  </div>
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
                <p className="text-[11px] text-[#7B776D]">
                  Ha nincs kiválasztott alapdokumentum, a felület akkor is használható munkapéldányként.
                </p>

                <div className="mb-3 p-3 border border-[#EEE7D9] bg-[#FBF9F3] space-y-2">
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
                        <p className="text-xs text-[#9C9890]">Nincs kiválasztott baseline dokumentum.</p>
                        <p className="text-[11px] text-[#7B776D]">
                          Szöveg-összevetéshez válassz egy előző verziót, majd a blokk-szintű panelen jelennek meg a módosítások.
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
              </section>

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
                                ? "bg-[#d9ecff] text-[#143d66]"
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

<aside className="w-56 shrink-0 bg-white hidden xl:block xl:overflow-y-auto border-l border-[#DDD7CA]">
        <div className="p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7B776D]">Dokumentum információ</p>
          <div className="space-y-1">
            <p className="text-[10px] text-[#7B776D]">Dokumentum</p>
            <p className="text-[11px] font-semibold text-[#1F2821] truncate">{getWorkspaceDocumentTitle()}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-[#7B776D]">Típus</p>
            <AdminBadge tone={selectedDocument?.kind === "contract" ? "green" : "gold"}>{getWorkspaceDocumentKindLabel()}</AdminBadge>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-[#7B776D]">Szöveg státusz</p>
            <AdminStatusPill tone={isDocumentTextLoading ? "blue" : hasWorkspaceText ? "green" : "amber"}>
              {isDocumentTextLoading
                ? "Betöltés…"
                : hasWorkspaceText
                  ? "Elérhető"
                  : documentTextReason
                    ? "Nincs szöveg"
                    : "Nincs kinyerve"}
            </AdminStatusPill>
            {!isDocumentTextLoading && !hasWorkspaceText && documentTextReason ? (
              <p className="text-[10px] text-[#9C9890] mt-0.5">{documentTextReason}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-[#7B776D]">Verzió</p>
            <p className="text-[11px] text-[#1F2821]">v{selectedDocument?.revisionNumber || 1}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-[#7B776D]">Ügy</p>
            <p className="text-[11px] font-semibold text-[#1F2821]">{selectedDocument?.caseNumber}</p>
          </div>
          <details className="rounded-[5px] border border-[#EEE7D9] bg-[#FBF9F3] p-2">
            <summary className="cursor-pointer text-[10px] font-semibold text-[#514D45]">Technikai részletek</summary>
            <div className="mt-2 space-y-2">
              <button onClick={() => handleDownload(selectedDocument)} className="w-full rounded-[5px] border border-[#DDD7CA] bg-white px-3 py-2 text-[10px] hover:bg-[#FBF9F3]">
                Dokumentum letöltése
              </button>
              {selectedBaseline ? (
                <button onClick={() => handleDownload(selectedBaseline)} className="w-full rounded-[5px] border border-[#DDD7CA] bg-white px-3 py-2 text-[10px] hover:bg-[#FBF9F3]">
                  Alapdokumentum letöltése
                </button>
              ) : null}
              <Link href={getDocumentLedgerHref()} className="block rounded-[5px] border border-[#DDD7CA] bg-white px-3 py-2 text-center text-[10px] hover:bg-[#FBF9F3]">
                Dokumentumtár
              </Link>
            </div>
          </details>
        </div>
      </aside>
    </div>
  );
}

