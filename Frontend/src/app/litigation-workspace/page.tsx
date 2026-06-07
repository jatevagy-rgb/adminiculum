"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminBadge, AdminButton, AdminPanel, AdminSectionHeader, AdminStatusPill } from "@/components/adminiculum/ui";
import { DocumentEditorShell } from "@/components/documents/DocumentEditorShell";
import {
  getCaseDocuments,
  getCaseById,
  getDocumentById,
  getDocumentText,
  type CaseListItem,
  type DocumentItem,
  type DocumentReviewData,
} from "@/lib/api";

type LitigationWorkspaceStep = "intake" | "strategy" | "assembly";

type OpponentBracketType =
  | "claim"
  | "fact"
  | "legal"
  | "evidence"
  | "amount"
  | "procedure"
  | "attackable";

type OpponentBracketStatus = "rögzítve" | "válaszút kell" | "válaszút kapcsolva" | "lezárható";

type OpponentBracket = {
  id: string;
  type: OpponentBracketType;
  title: string;
  quote: string;
  sourceRef: string;
  legalBasis: string;
  evidence: string;
  requestedRelief: string;
  risk: "low" | "medium" | "high";
  status: OpponentBracketStatus;
};

type ResponseBlock = {
  id: string;
  type:
    | "fact-rebuttal"
    | "evidence"
    | "statute"
    | "case-law"
    | "procedural-objection"
    | "amount-objection"
    | "evidence-motion"
    | "own-narrative";
  title: string;
  detail: string;
  relatedBracketIds: string[];
};

type ChapterBlock = {
  id: string;
  title: string;
  pleadingText: string;
  counterclaimDirection: string;
  requestedRelief: string;
  status: "hiányos" | "szerkeszthető" | "ügyvédi review";
};

type OutputTemplate = "full-defense" | "injunction-opposition" | "counterclaim" | "defense";

type DocumentRecord = (DocumentItem | DocumentReviewData) & Record<string, unknown>;

type LitigationDocumentContext = {
  id: string;
  title: string;
  fileName: string;
  documentType?: string | null;
  status?: string | null;
  folder?: string | null;
  version?: string | null;
  updatedAt?: string | null;
  text: string;
  textField?: string;
  unavailableReason?: string;
};

type PleadingChapterSeed = {
  id: string;
  title: string;
  sourceLabel: string;
  body: string;
  tone: "green" | "gold" | "blue" | "violet";
};

const workspaceSteps: Array<{
  key: LitigationWorkspaceStep;
  label: string;
  title: string;
  description: string;
}> = [
  {
    key: "intake",
    label: "1. Ellenfél irata",
    title: "Ellenfél iratának feldolgozása",
    description: "Az ellenfél feltöltött iratából strukturált ellenoldali állítások készülnek.",
  },
  {
    key: "strategy",
    label: "2. Állítások / Válaszút",
    title: "Állításhoz kapcsolt válaszstratégia",
    description: "Az ellenoldali állításokhoz ténybeli, bizonyítási, jogi és eljárási válaszblokkok kapcsolódnak.",
  },
  {
    key: "assembly",
    label: "3. Beadvány összeállítása / Szerkesztés",
    title: "Beadvány összeállítása és szerkesztése",
    description: "A saját fejezet-elemekből nagy szerkesztőfelületű beadvány-vázlat készül.",
  },
];

const bracketTypeLabels: Record<OpponentBracketType, string> = {
  claim: "Kérelem",
  fact: "Tényállítás",
  legal: "Jogi állítás",
  evidence: "Bizonyítéki hivatkozás",
  amount: "Összegszerűség / kárszámítás",
  procedure: "Eljárási kifogás",
  attackable: "Irreleváns / támadható állítás",
};

const buildSelectionTitle = (type: OpponentBracketType, text: string) => {
  const compactText = text.replace(/\s+/g, " ").trim();
  const preview = compactText.length > 72 ? `${compactText.slice(0, 72)}...` : compactText;
  return `${bracketTypeLabels[type]}: ${preview}`;
};

const responseTypeLabels: Record<ResponseBlock["type"], string> = {
  "fact-rebuttal": "Ténybeli cáfolat",
  evidence: "Bizonyíték",
  statute: "Jogszabályhely",
  "case-law": "Joggyakorlat",
  "procedural-objection": "Eljárásjogi kifogás",
  "amount-objection": "Összegszerűségi kifogás",
  "evidence-motion": "Bizonyítási indítvány",
  "own-narrative": "Saját narratíva",
};

const outputTemplateLabels: Record<OutputTemplate, string> = {
  "full-defense": "Teljes írásbeli ellenkérelem",
  "injunction-opposition": "Ideiglenes intézkedés elleni ellenkérelem",
  counterclaim: "Viszontkereset",
  defense: "Ellenirat / védekezés",
};

const fullDefenseStructure = [
  "Bíróság megszólítása",
  "Írásbeli ellenkérelem címsor",
  "Alperes adatai",
  "Alperesi jogi képviselő",
  "Felperes adatai",
  "Per tárgya",
  "Ügyszám",
  "Csatolmányok",
  "Bevezető jogi képviseleti formula",
  "A. Érdemi ellenkérelem",
  "B. Tényállási és bizonyítási rész",
  "C. Jogi érvelés / anyagi jogi kifogások",
  "D. Bizonyítási indítványok",
  "E. Mellékletjegyzék",
  "F. Záró kérelem / perköltség / dátum / aláírás",
];

const injunctionOppositionStructure = [
  "Kérelem",
  "Alaki kifogások",
  "Pp. 103. § szerinti feltételek hiánya",
  "Ideiglenes intézkedés nem előlegezheti meg az érdemi döntést",
  "Pp. 104. § szerinti arányossági mérleg",
  "Valószínűsítési kötelezettség hiánya",
  "Biztosítékadás indítványa, ha releváns",
  "Záró kérelem",
];

const riskTone: Record<OpponentBracket["risk"], "gold" | "amber" | "burgundy"> = {
  low: "gold",
  medium: "amber",
  high: "burgundy",
};

const riskLabel: Record<OpponentBracket["risk"], string> = {
  low: "Kockázat: alacsony",
  medium: "Kockázat: közepes",
  high: "Kockázat: magas",
};

const chapterStatusTone: Record<ChapterBlock["status"], "gold" | "green" | "violet"> = {
  hiányos: "gold",
  szerkeszthető: "green",
  "ügyvédi review": "violet",
};

const responseTone = (type: ResponseBlock["type"]): "green" | "gold" | "blue" | "violet" => {
  if (type === "evidence" || type === "evidence-motion") return "blue";
  if (type === "statute" || type === "case-law") return "violet";
  if (type === "procedural-objection" || type === "amount-objection") return "gold";
  return "green";
};

const uniqueIds = (ids: string[]) => Array.from(new Set(ids));

const documentTextFallback = "A dokumentum szövege még nem érhető el ezen a munkafelületen.";

const realDocumentTextFields = [
  "workspaceText",
  "extractedText",
  "sourceText",
  "textContent",
  "content",
  "text",
] as const;

const readStringField = (record: Record<string, unknown> | null | undefined, field: string): string => {
  const value = record?.[field];
  return typeof value === "string" ? value.trim() : "";
};

const pickDocumentText = (documentRecord?: Record<string, unknown> | null, textRecord?: Record<string, unknown> | null) => {
  for (const field of realDocumentTextFields) {
    const text = readStringField(documentRecord, field);
    if (text) return { text, field };
  }

  const apiText = readStringField(textRecord, "text");
  if (apiText) {
    return {
      text: apiText,
      field: readStringField(textRecord, "source") === "MODIFIED_WORKING_COPY" ? "workspaceText" : "extractedText",
    };
  }

  return { text: "", field: undefined };
};

const normalizeDocumentContext = ({
  documentId,
  detail,
  listItem,
  textResult,
}: {
  documentId: string;
  detail?: DocumentRecord | null;
  listItem?: DocumentItem | null;
  textResult?: Record<string, unknown> | null;
}): LitigationDocumentContext => {
  const record = (detail ?? listItem ?? null) as Record<string, unknown> | null;
  const { text, field } = pickDocumentText(record, textResult);
  const fileName = readStringField(record, "fileName") || documentId;
  const documentType = readStringField(record, "documentType") || null;
  const status = readStringField(record, "status") || null;
  const folder = readStringField(record, "folder") || null;
  const version = readStringField(record, "version") || null;
  const updatedAt = readStringField(record, "updatedAt") || null;

  return {
    id: readStringField(record, "id") || documentId,
    title: fileName,
    fileName,
    documentType,
    status,
    folder,
    version,
    updatedAt,
    text,
    textField: field,
    unavailableReason: readStringField(textResult, "unavailableReason") || undefined,
  };
};

const pleadingChapterTitleByType: Record<ResponseBlock["type"], string> = {
  "fact-rebuttal": "Tényállási cáfolat",
  evidence: "Bizonyítékok és okirati hivatkozások",
  statute: "Jogszabályi érvelés",
  "case-law": "Joggyakorlati hivatkozások",
  "procedural-objection": "Eljárásjogi kifogások",
  "amount-objection": "Összegszerűségi kifogások",
  "evidence-motion": "Bizonyítási indítványok",
  "own-narrative": "Alperesi narratíva",
};

const buildPleadingChapterSeeds = (responseBlocks: ResponseBlock[]): PleadingChapterSeed[] => {
  if (responseBlocks.length === 0) {
    return [
      {
        id: "placeholder-merits",
        title: "A. Érdemi ellenkérelem előkészítése",
        sourceLabel: "Nincs még válaszblokk",
        body: "[Ide kerül az ellenfél kérelmeire adott tételes, állításokból felépített válasz.]",
        tone: "gold",
      },
      {
        id: "placeholder-evidence",
        title: "B. Tényállási és bizonyítási rész előkészítése",
        sourceLabel: "Nincs még bizonyítási válaszblokk",
        body: "[Ide kerülnek a tényállási cáfolatok, bizonyítékok és bizonyítási indítványok.]",
        tone: "blue",
      },
    ];
  }

  const groupedBlocks = responseBlocks.reduce<Record<ResponseBlock["type"], ResponseBlock[]>>((groups, block) => {
    groups[block.type] = [...(groups[block.type] ?? []), block];
    return groups;
  }, {} as Record<ResponseBlock["type"], ResponseBlock[]>);

  return Object.entries(groupedBlocks).flatMap(([type, blocks], typeIndex) =>
    blocks.map((block, blockIndex) => ({
      id: block.id,
      title: `${String.fromCharCode(65 + typeIndex)}.${blockIndex + 1}. ${pleadingChapterTitleByType[type as ResponseBlock["type"]]}`,
      sourceLabel: block.title,
      body: block.detail || "[A válaszblokk részlete még nincs kitöltve.]",
      tone: responseTone(type as ResponseBlock["type"]),
    })),
  );
};

const buildPleadingSkeleton = ({
  caseId,
  documentId,
  clientName,
  outputTemplate,
  chapterSeeds,
}: {
  caseId: string;
  documentId: string;
  clientName: string;
  outputTemplate: OutputTemplate;
  chapterSeeds: PleadingChapterSeed[];
}) => {
  const title = outputTemplateLabels[outputTemplate];
  const clientLine = clientName || "[Ügyfél / alperes neve - nincs megadva a kontextusban]";
  const chapters = chapterSeeds
    .map(
      (chapter, index) =>
        `${index + 1}. ${chapter.title}\nForrás válaszblokk: ${chapter.sourceLabel}\n${chapter.body}\n[Ügyvédi pontosítás, jogi ellenőrzés és bizonyítéki hivatkozás szükséges.]`,
    )
    .join("\n\n");

  return [
    "BÁLINTFY ÉS TÁRSAI ÜGYVÉDI IRODA",
    "[Irodai fejléc / címer / elérhetőség helye]",
    "",
    "[Bíróság neve]",
    "[Bíróság címe]",
    "",
    `Ügyszám: ${caseId || "[Ügyszám / caseId nincs megadva]"}`,
    `Ellenfél irata: ${documentId || "[Dokumentumazonosító nincs megadva]"}`,
    `Ügyfél / alperes: ${clientLine}`,
    "Felperes: [Felperes adatai]",
    "Per tárgya: [Per tárgya]",
    "",
    title.toUpperCase(),
    "[Tárgy / alcím: az ellenfél beadványára adott válasz]",
    "",
    "Tisztelt Bíróság!",
    "",
    "Alulírott jogi képviselő útján eljáró ügyfél nevében az alábbi, állítás-válasz logikából előkészített szerkezetű beadvány-vázlatot terjesztjük elő.",
    "",
    "I. Kérelem és perbeli álláspont",
    "[A végleges kérelmi rész ügyvédi szerkesztéssel kerül kitöltésre. A rendszer itt nem állít elő jogi bizonyosságot.]",
    "",
    "II. A válaszblokkokból előkészített fejezetek",
    chapters,
    "",
    "III. Bizonyítási indítványok",
    "[A bizonyítékokra és indítványokra vonatkozó rész a válaszblokkokból és ügyvédi ellenőrzésből épül fel.]",
    "",
    "IV. Mellékletek",
    "[Mellékletjegyzék / okiratok / csatolmányok helye.]",
    "",
    "V. Záró kérelem",
    "[Perköltség, dátum, aláírás és záró kérelem helye.]",
    "",
    "Fontos: ez helyi szerkesztési vázlat. Nincs Word-export, nincs szerveroldali mentés, nincs AI-következtetés.",
  ].join("\n");
};

export default function LitigationWorkspacePage() {
  return (
    <AuthenticatedApp section="litigation-workspace">
      <Suspense fallback={<LitigationWorkspaceShellFallback />}>
        <LitigationWorkspacePageContent />
      </Suspense>
    </AuthenticatedApp>
  );
}

function LitigationWorkspaceShellFallback() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F3EBD4] p-4">
      <div className="mx-auto max-w-[1640px] rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] p-4 text-[13px] text-[#6D6A62]">
        Peres workflow betöltése.
      </div>
    </div>
  );
}

function LitigationWorkspacePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const caseId = searchParams?.get("caseId")?.trim() ?? "";
  const documentId = searchParams?.get("documentId")?.trim() ?? "";
  const clientName = searchParams?.get("clientName")?.trim() || searchParams?.get("ugyfel")?.trim() || "";
  const mode = searchParams?.get("mode")?.trim() || "pleading-workflow";
  const requestedStep = searchParams?.get("step")?.trim();
  const currentStep: LitigationWorkspaceStep = isWorkspaceStep(requestedStep) ? requestedStep : "intake";
  const hasContext = Boolean(caseId && documentId);

  const [sourceReference, setSourceReference] = useState("");
  const [localExtractedText, setLocalExtractedText] = useState("");
  const [localTextWasTouched, setLocalTextWasTouched] = useState(false);
  const [selectedOpponentText, setSelectedOpponentText] = useState("");
  const [selectionOpponentType, setSelectionOpponentType] = useState<OpponentBracketType>("fact");
  const [documentContext, setDocumentContext] = useState<LitigationDocumentContext | null>(null);
  const [caseContext, setCaseContext] = useState<CaseListItem | null>(null);
  const [caseContextError, setCaseContextError] = useState<string | null>(null);
  const [isLoadingDocumentContext, setIsLoadingDocumentContext] = useState(false);
  const [documentContextError, setDocumentContextError] = useState<string | null>(null);
  const [opponentBrackets, setOpponentBrackets] = useState<OpponentBracket[]>([]);
  const [responseBlocks, setResponseBlocks] = useState<ResponseBlock[]>([]);
  const [openOpponentBracketIds, setOpenOpponentBracketIds] = useState<string[]>([]);
  const [openResponseBlockIds, setOpenResponseBlockIds] = useState<string[]>([]);
  const [activeLinkFamily, setActiveLinkFamily] = useState<{ side: "opponent" | "response"; id: string } | null>(null);
  const [chapterBlocks, setChapterBlocks] = useState<ChapterBlock[]>([]);
  const [outputTemplate, setOutputTemplate] = useState<OutputTemplate>("full-defense");
  const [pleadingEditorText, setPleadingEditorText] = useState("");
  const [editorWasTouched, setEditorWasTouched] = useState(false);

  const [bracketDraft, setBracketDraft] = useState({
    type: "claim" as OpponentBracketType,
    title: "",
    quote: "",
    sourceRef: "",
    legalBasis: "",
    evidence: "",
    requestedRelief: "",
    risk: "medium" as OpponentBracket["risk"],
    status: "válaszút kell" as OpponentBracketStatus,
  });

  const [responseDraft, setResponseDraft] = useState({
    title: "",
    detail: "",
    type: "fact-rebuttal" as ResponseBlock["type"],
    relatedBracketIds: [] as string[],
  });

  const [chapterDraft, setChapterDraft] = useState({
    title: "",
    pleadingText: "",
    counterclaimDirection: "",
    requestedRelief: "",
    status: "hiányos" as ChapterBlock["status"],
  });

  const linkedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const bracket of opponentBrackets) {
      counts[bracket.id] = responseBlocks.filter((block) => block.relatedBracketIds.includes(bracket.id)).length;
    }
    return counts;
  }, [opponentBrackets, responseBlocks]);

  const activeOpponentBracketIds = useMemo(() => {
    if (!activeLinkFamily) return [];
    if (activeLinkFamily.side === "opponent") return [activeLinkFamily.id];
    const responseBlock = responseBlocks.find((block) => block.id === activeLinkFamily.id);
    return responseBlock?.relatedBracketIds ?? [];
  }, [activeLinkFamily, responseBlocks]);

  const activeResponseBlockIds = useMemo(() => {
    if (!activeLinkFamily) return [];
    if (activeLinkFamily.side === "response") return [activeLinkFamily.id];
    return responseBlocks
      .filter((block) => block.relatedBracketIds.includes(activeLinkFamily.id))
      .map((block) => block.id);
  }, [activeLinkFamily, responseBlocks]);

  const assemblyStructure = outputTemplate === "injunction-opposition" ? injunctionOppositionStructure : fullDefenseStructure;
  const generatedChapterSeeds = useMemo(() => buildPleadingChapterSeeds(responseBlocks), [responseBlocks]);
  const effectiveClientName = clientName || caseContext?.clientName || "";
  const effectiveCaseNumber = caseContext?.caseNumber || caseId;
  const effectiveCaseStatus = caseContext?.status || (hasContext ? "helyi vázlat" : "kontextus szükséges");
  const generatedPleadingSkeleton = useMemo(
    () =>
      buildPleadingSkeleton({
        caseId,
        documentId,
        clientName: effectiveClientName,
        outputTemplate,
        chapterSeeds: generatedChapterSeeds,
      }),
    [caseId, documentId, effectiveClientName, outputTemplate, generatedChapterSeeds],
  );
  const currentStepIndex = workspaceSteps.findIndex((step) => step.key === currentStep);

  useEffect(() => {
    if (!caseId || !documentId) {
      setDocumentContext(null);
      setDocumentContextError(null);
      setIsLoadingDocumentContext(false);
      setLocalTextWasTouched(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDocumentContext(true);
    setDocumentContextError(null);
    setLocalTextWasTouched(false);

    const loadDocumentContext = async () => {
      const [detailResult, textResult, listResult] = await Promise.allSettled([
        getDocumentById(documentId),
        getDocumentText(documentId),
        getCaseDocuments(caseId),
      ]);

      if (cancelled) return;

      const detail = detailResult.status === "fulfilled" ? (detailResult.value as DocumentRecord | null) : null;
      const textPayload = textResult.status === "fulfilled" ? (textResult.value as unknown as Record<string, unknown>) : null;
      const caseDocuments = listResult.status === "fulfilled" ? listResult.value : [];
      const listItem = caseDocuments.find((document) => document.id === documentId) ?? null;

      if (!detail && !listItem && detailResult.status === "rejected" && listResult.status === "rejected") {
        setDocumentContextError("A dokumentum adatai nem tölthetők be az elérhető frontend API-kon keresztül.");
      }

      const nextContext = normalizeDocumentContext({
        documentId,
        detail,
        listItem,
        textResult: textPayload,
      });

      setDocumentContext(nextContext);
      if (nextContext.text) {
        setLocalExtractedText(nextContext.text);
      } else {
        setLocalExtractedText("");
      }
      setSourceReference(nextContext.fileName ? `Forrásdokumentum: ${nextContext.fileName}` : "");
      setIsLoadingDocumentContext(false);
    };

    loadDocumentContext().catch(() => {
      if (cancelled) return;
      setDocumentContext(normalizeDocumentContext({ documentId }));
      setDocumentContextError("A dokumentum adatai nem tölthetők be az elérhető frontend API-kon keresztül.");
      setLocalExtractedText("");
      setSourceReference("");
      setIsLoadingDocumentContext(false);
    });

    return () => {
      cancelled = true;
    };
  }, [caseId, documentId]);

  useEffect(() => {
    if (!caseId) {
      setCaseContext(null);
      setCaseContextError(null);
      return;
    }

    let cancelled = false;
    setCaseContextError(null);

    getCaseById(caseId)
      .then((record) => {
        if (cancelled) return;
        setCaseContext(record);
      })
      .catch(() => {
        if (cancelled) return;
        setCaseContext(null);
        setCaseContextError("Az ügy adatai nem tölthetők be az elérhető frontend API-kon keresztül.");
      });

    return () => {
      cancelled = true;
    };
  }, [caseId]);

  useEffect(() => {
    if (!documentContext || localTextWasTouched) return;
    setLocalExtractedText(documentContext.text);
  }, [documentContext, localTextWasTouched]);

  useEffect(() => {
    if (currentStep === "assembly" && !editorWasTouched && pleadingEditorText !== generatedPleadingSkeleton) {
      setPleadingEditorText(generatedPleadingSkeleton);
    }
  }, [currentStep, editorWasTouched, generatedPleadingSkeleton, pleadingEditorText]);

  const navigateToStep = (step: LitigationWorkspaceStep) => {
    const nextParams = new URLSearchParams(searchParams?.toString());
    nextParams.set("step", step);
    router.push(`${pathname}?${nextParams.toString()}`);
  };

  const toggleOpponentBracket = (bracketId: string) => {
    const relatedResponseIds = responseBlocks
      .filter((block) => block.relatedBracketIds.includes(bracketId))
      .map((block) => block.id);

    setActiveLinkFamily({ side: "opponent", id: bracketId });
    setOpenOpponentBracketIds((prev) =>
      prev.includes(bracketId) ? prev.filter((id) => id !== bracketId) : [...prev, bracketId],
    );

    if (relatedResponseIds.length > 0) {
      setOpenResponseBlockIds((prev) => uniqueIds([...prev, ...relatedResponseIds]));
    }
  };

  const toggleResponseBlock = (responseBlockId: string) => {
    const responseBlock = responseBlocks.find((block) => block.id === responseBlockId);
    const relatedOpponentIds = responseBlock?.relatedBracketIds ?? [];

    setActiveLinkFamily({ side: "response", id: responseBlockId });
    setOpenResponseBlockIds((prev) =>
      prev.includes(responseBlockId) ? prev.filter((id) => id !== responseBlockId) : [...prev, responseBlockId],
    );

    if (relatedOpponentIds.length > 0) {
      setOpenOpponentBracketIds((prev) => uniqueIds([...prev, ...relatedOpponentIds]));
    }
  };

  const addOpponentBracket = () => {
    if (!bracketDraft.title.trim() || !bracketDraft.quote.trim()) return;
    const nextBracketId = `bracket-${Date.now()}-${opponentBrackets.length + 1}`;
    setOpponentBrackets((prev) => [
      ...prev,
      {
        id: nextBracketId,
        type: bracketDraft.type,
        title: bracketDraft.title.trim(),
        quote: bracketDraft.quote.trim(),
        sourceRef: bracketDraft.sourceRef.trim(),
        legalBasis: bracketDraft.legalBasis.trim(),
        evidence: bracketDraft.evidence.trim(),
        requestedRelief: bracketDraft.requestedRelief.trim(),
        risk: bracketDraft.risk,
        status: bracketDraft.status,
      },
    ]);
    setOpenOpponentBracketIds((prev) => [...prev, nextBracketId]);
    setBracketDraft({
      type: "claim",
      title: "",
      quote: "",
      sourceRef: "",
      legalBasis: "",
      evidence: "",
      requestedRelief: "",
      risk: "medium",
      status: "válaszút kell",
    });
  };

  const addOpponentItemFromSelection = () => {
    const selectedText = selectedOpponentText.trim();
    if (!selectedText) return;
    const nextBracketId = `bracket-${Date.now()}-${opponentBrackets.length + 1}`;
    setOpponentBrackets((prev) => [
      ...prev,
      {
        id: nextBracketId,
        type: selectionOpponentType,
        title: buildSelectionTitle(selectionOpponentType, selectedText),
        quote: selectedText,
        sourceRef: sourceReference.trim(),
        legalBasis: "",
        evidence: "",
        requestedRelief: "",
        risk: "medium",
        status: "rögzítve",
      },
    ]);
    setOpenOpponentBracketIds((prev) => [...prev, nextBracketId]);
    setSelectedOpponentText("");
  };

  const startResponseForOpponentBracket = (bracketId: string) => {
    const bracket = opponentBrackets.find((item) => item.id === bracketId);
    if (!bracket) return;

    setActiveLinkFamily({ side: "opponent", id: bracketId });
    setOpenOpponentBracketIds((prev) => uniqueIds([...prev, bracketId]));
    setOpenResponseBlockIds((prev) =>
      uniqueIds([
        ...prev,
        ...responseBlocks
          .filter((block) => block.relatedBracketIds.includes(bracketId))
          .map((block) => block.id),
      ]),
    );
    setResponseDraft((prev) => ({
      ...prev,
      title: prev.title.trim() ? prev.title : `Válasz: ${bracket.title}`,
      relatedBracketIds: prev.relatedBracketIds.includes(bracketId)
        ? prev.relatedBracketIds
        : [...prev.relatedBracketIds, bracketId],
    }));
  };

  const toggleBracketRelation = (bracketId: string) => {
    setResponseDraft((prev) => ({
      ...prev,
      relatedBracketIds: prev.relatedBracketIds.includes(bracketId)
        ? prev.relatedBracketIds.filter((id) => id !== bracketId)
        : [...prev.relatedBracketIds, bracketId],
    }));
  };

  const addResponseBlock = () => {
    if (!responseDraft.title.trim() || !responseDraft.detail.trim()) return;
    const nextResponseId = `response-${Date.now()}-${responseBlocks.length + 1}`;
    setResponseBlocks((prev) => [
      ...prev,
      {
        id: nextResponseId,
        type: responseDraft.type,
        title: responseDraft.title.trim(),
        detail: responseDraft.detail.trim(),
        relatedBracketIds: responseDraft.relatedBracketIds,
      },
    ]);
    setOpenResponseBlockIds((prev) => [...prev, nextResponseId]);
    setOpenOpponentBracketIds((prev) => uniqueIds([...prev, ...responseDraft.relatedBracketIds]));
    setActiveLinkFamily({ side: "response", id: nextResponseId });
    setOpponentBrackets((prev) =>
      prev.map((bracket) =>
        responseDraft.relatedBracketIds.includes(bracket.id)
          ? { ...bracket, status: "válaszút kapcsolva" }
          : bracket,
      ),
    );
    setResponseDraft({
      title: "",
      detail: "",
      type: "fact-rebuttal",
      relatedBracketIds: [],
    });
  };

  const addChapterBlock = () => {
    if (!chapterDraft.title.trim() || !chapterDraft.pleadingText.trim()) return;
    const nextChapter = {
      id: `chapter-${Date.now()}-${chapterBlocks.length + 1}`,
      title: chapterDraft.title.trim(),
      pleadingText: chapterDraft.pleadingText.trim(),
      counterclaimDirection: chapterDraft.counterclaimDirection.trim(),
      requestedRelief: chapterDraft.requestedRelief.trim(),
      status: chapterDraft.status,
    };
    setChapterBlocks((prev) => [...prev, nextChapter]);
    setPleadingEditorText((prev) => [prev, `${nextChapter.title}\n${nextChapter.pleadingText}`].filter(Boolean).join("\n\n"));
    setChapterDraft({
      title: "",
      pleadingText: "",
      counterclaimDirection: "",
      requestedRelief: "",
      status: "hiányos",
    });
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F3EBD4]">
      <div className="mx-auto max-w-[1640px] space-y-4 px-4 py-4 xl:px-6">
        <WorkflowHeader
          caseId={caseId}
          documentId={documentId}
          caseNumber={effectiveCaseNumber}
          clientName={effectiveClientName}
          documentName={documentContext?.title || documentContext?.fileName || ""}
          mode={mode}
          status={effectiveCaseStatus}
          hasContext={hasContext}
          caseContextError={caseContextError}
        />

        {!hasContext ? (
          <MissingContextState />
        ) : (
          <>
            <WorkflowNavigation
              currentStep={currentStep}
              currentStepIndex={currentStepIndex}
              onNavigate={navigateToStep}
            />

            {currentStep === "intake" ? (
              <IntakeWorkspace
                localExtractedText={localExtractedText}
                sourceReference={sourceReference}
                documentContext={documentContext}
                isLoadingDocumentContext={isLoadingDocumentContext}
                documentContextError={documentContextError}
                selectedOpponentText={selectedOpponentText}
                selectionOpponentType={selectionOpponentType}
                bracketDraft={bracketDraft}
                opponentBrackets={opponentBrackets}
                linkedCounts={linkedCounts}
                openOpponentBracketIds={openOpponentBracketIds}
                activeOpponentBracketIds={activeOpponentBracketIds}
                onSourceReferenceChange={setSourceReference}
                onSelectedOpponentTextChange={setSelectedOpponentText}
                onSelectionOpponentTypeChange={setSelectionOpponentType}
                onBracketDraftChange={setBracketDraft}
                onAddOpponentBracket={addOpponentBracket}
                onAddOpponentItemFromSelection={addOpponentItemFromSelection}
                onToggleOpponentBracket={toggleOpponentBracket}
                onNext={() => navigateToStep("strategy")}
              />
            ) : null}

            {currentStep === "strategy" ? (
              <StrategyWorkspace
                opponentBrackets={opponentBrackets}
                responseBlocks={responseBlocks}
                responseDraft={responseDraft}
                linkedCounts={linkedCounts}
                openOpponentBracketIds={openOpponentBracketIds}
                openResponseBlockIds={openResponseBlockIds}
                activeOpponentBracketIds={activeOpponentBracketIds}
                activeResponseBlockIds={activeResponseBlockIds}
                onResponseDraftChange={setResponseDraft}
                onToggleBracketRelation={toggleBracketRelation}
                onToggleOpponentBracket={toggleOpponentBracket}
                onToggleResponseBlock={toggleResponseBlock}
                onStartResponseForOpponentBracket={startResponseForOpponentBracket}
                onAddResponseBlock={addResponseBlock}
                onBack={() => navigateToStep("intake")}
                onNext={() => navigateToStep("assembly")}
              />
            ) : null}

            {currentStep === "assembly" ? (
              <AssemblyWorkspace
                chapterBlocks={chapterBlocks}
                chapterDraft={chapterDraft}
                outputTemplate={outputTemplate}
                assemblyStructure={assemblyStructure}
                generatedChapterSeeds={generatedChapterSeeds}
                generatedPleadingSkeleton={generatedPleadingSkeleton}
                pleadingEditorText={pleadingEditorText}
                editorWasTouched={editorWasTouched}
                responseBlocks={responseBlocks}
                onChapterDraftChange={setChapterDraft}
                onAddChapterBlock={addChapterBlock}
                onOutputTemplateChange={setOutputTemplate}
                onApplyGeneratedSkeleton={() => {
                  setPleadingEditorText(generatedPleadingSkeleton);
                  setEditorWasTouched(false);
                }}
                onPleadingEditorTextChange={(value) => {
                  setPleadingEditorText(value);
                  setEditorWasTouched(true);
                }}
                onBack={() => navigateToStep("strategy")}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function isWorkspaceStep(step: string | undefined): step is LitigationWorkspaceStep {
  return step === "intake" || step === "strategy" || step === "assembly";
}

function WorkflowHeader({
  caseId,
  documentId,
  caseNumber,
  clientName,
  documentName,
  mode,
  status,
  hasContext,
  caseContextError,
}: {
  caseId: string;
  documentId: string;
  caseNumber: string;
  clientName: string;
  documentName: string;
  mode: string;
  status: string;
  hasContext: boolean;
  caseContextError: string | null;
}) {
  return (
    <section className="rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <AdminBadge tone="green">Ügyhöz kötött peres munkafolyamat</AdminBadge>
            <AdminStatusPill tone="gold">Helyi vázlat — nincs szerveroldali mentés.</AdminStatusPill>
          </div>
          <div>
            <h1 className="font-serif text-[30px] font-medium leading-tight text-[#1F2821]">Peres beadvány-munkafolyamat</h1>
            <p className="mt-1 max-w-4xl text-[13px] text-[#6D6A62]">
              Ügyhöz és feltöltött ellenfél-iratához kötött háromlépéses állítás-, válaszút- és szerkesztési munkaterület.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {caseId ? (
              <>
                <Link
                  href={`/cases/${encodeURIComponent(caseId)}`}
                  className="inline-flex items-center justify-center rounded-[6px] border border-[#D8CFB6] bg-white px-3 py-2 text-[12px] font-semibold text-[#1F2821] transition-colors hover:border-[#1F4A33] hover:bg-[#F7F3E7]"
                >
                  ← Ügy áttekintése
                </Link>
                <Link
                  href={`/cases/${encodeURIComponent(caseId)}/documents`}
                  className="inline-flex items-center justify-center rounded-[6px] border border-[#D8CFB6] bg-white px-3 py-2 text-[12px] font-semibold text-[#1F2821] transition-colors hover:border-[#1F4A33] hover:bg-[#F7F3E7]"
                >
                  ← Dokumentumtár
                </Link>
              </>
            ) : (
              <div className="rounded-[6px] border border-dashed border-[#D8CFB6] bg-white px-3 py-2 text-[11px] text-[#7B776D]">
                Az ügy áttekintése és a Dokumentumtár megnyitásához előbb ügyazonosító szükséges.
              </div>
            )}
          </div>
          {caseContextError ? (
            <p className="rounded-[6px] border border-dashed border-[#D8CFB6] bg-white px-3 py-2 text-[11px] text-[#7B776D]">
              {caseContextError}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2 rounded-[8px] border border-[#D8CFB6] bg-white p-3 text-[11px] text-[#514D45] sm:grid-cols-5">
          <div>
            <p className="font-semibold text-[#1F2821]">Ügy száma</p>
            <p className="mt-1 break-all">{caseNumber || "Hiányzik"}</p>
          </div>
          <div>
            <p className="font-semibold text-[#1F2821]">Dokumentum</p>
            <p className="mt-1 break-all">{documentName || documentId || "Hiányzik"}</p>
          </div>
          <div>
            <p className="font-semibold text-[#1F2821]">Ügyfél</p>
            <p className="mt-1 break-all">{clientName || "Ügyféladat nem érhető el"}</p>
          </div>
          <div>
            <p className="font-semibold text-[#1F2821]">Mód</p>
            <p className="mt-1 break-all">{mode}</p>
          </div>
          <div>
            <p className="font-semibold text-[#1F2821]">Státusz</p>
            <p className="mt-1">{status}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function MissingContextState() {
  return (
    <section className="rounded-[10px] border border-[#D8CFB6] bg-white p-4">
      <AdminSectionHeader
        eyebrow="Hiányzó ügykörnyezet"
        title="Válassz ügyet és ellenfél iratát a peres stratégiai térkép indításához."
        subtitle="Ez a munkafolyamat csak caseId és documentId kontextussal értelmezhető. A célindítás: ügy megnyitása, ellenfél feltöltött iratának kiválasztása, majd peres munkaterület indítása."
        action={<AdminStatusPill tone="gold">Case + document kell</AdminStatusPill>}
      />
    </section>
  );
}

function WorkflowNavigation({
  currentStep,
  currentStepIndex,
  onNavigate,
}: {
  currentStep: LitigationWorkspaceStep;
  currentStepIndex: number;
  onNavigate: (step: LitigationWorkspaceStep) => void;
}) {
  return (
    <section className="rounded-[10px] border border-[#D8CFB6] bg-white p-4">
      <div className="grid gap-2 xl:grid-cols-3">
        {workspaceSteps.map((step, index) => {
          const active = currentStep === step.key;
          const completed = index < currentStepIndex;
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => onNavigate(step.key)}
              className={`min-h-[92px] rounded-[8px] border p-3 text-left transition-colors ${
                active
                  ? "border-[#1F4A33] bg-[#1F4A33] text-[#F4EFDB]"
                  : completed
                    ? "border-[#C6B681] bg-[#FBF6E7] text-[#1F2821] hover:bg-white"
                    : "border-[#E7DECB] bg-[#FBF9F3] text-[#514D45] hover:bg-white"
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]">{step.label}</span>
              <span className="mt-2 block font-serif text-lg font-medium leading-tight">{step.title}</span>
              <span className={`mt-1 block text-[11px] leading-5 ${active ? "text-[#F4EFDB]" : "text-[#6D6A62]"}`}>
                {step.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function IntakeWorkspace({
  localExtractedText,
  sourceReference,
  documentContext,
  isLoadingDocumentContext,
  documentContextError,
  selectedOpponentText,
  selectionOpponentType,
  bracketDraft,
  opponentBrackets,
  linkedCounts,
  openOpponentBracketIds,
  activeOpponentBracketIds,
  onSourceReferenceChange,
  onSelectedOpponentTextChange,
  onSelectionOpponentTypeChange,
  onBracketDraftChange,
  onAddOpponentBracket,
  onAddOpponentItemFromSelection,
  onToggleOpponentBracket,
  onNext,
}: {
  localExtractedText: string;
  sourceReference: string;
  documentContext: LitigationDocumentContext | null;
  isLoadingDocumentContext: boolean;
  documentContextError: string | null;
  selectedOpponentText: string;
  selectionOpponentType: OpponentBracketType;
  bracketDraft: {
    type: OpponentBracketType;
    title: string;
    quote: string;
    sourceRef: string;
    legalBasis: string;
    evidence: string;
    requestedRelief: string;
    risk: OpponentBracket["risk"];
    status: OpponentBracketStatus;
  };
  opponentBrackets: OpponentBracket[];
  linkedCounts: Record<string, number>;
  openOpponentBracketIds: string[];
  activeOpponentBracketIds: string[];
  onSourceReferenceChange: (value: string) => void;
  onSelectedOpponentTextChange: (value: string) => void;
  onSelectionOpponentTypeChange: (value: OpponentBracketType) => void;
  onBracketDraftChange: (value: typeof bracketDraft | ((prev: typeof bracketDraft) => typeof bracketDraft)) => void;
  onAddOpponentBracket: () => void;
  onAddOpponentItemFromSelection: () => void;
  onToggleOpponentBracket: (bracketId: string) => void;
  onNext: () => void;
}) {
  const documentTextRef = useRef<HTMLTextAreaElement | null>(null);
  const documentMetaItems = [
    documentContext?.documentType ? `Típus: ${documentContext.documentType}` : null,
    documentContext?.status ? `Státusz: ${documentContext.status}` : null,
    documentContext?.folder ? `Mappa: ${documentContext.folder}` : null,
    documentContext?.version ? `Verzió: ${documentContext.version}` : null,
  ].filter((item): item is string => Boolean(item));
  const hasDocumentText = localExtractedText.trim().length > 0;
  const hasSelectedText = selectedOpponentText.trim().length > 0;

  const captureSelectedText = () => {
    const textarea = documentTextRef.current;
    if (!textarea) return;
    const selection = localExtractedText.slice(textarea.selectionStart, textarea.selectionEnd).trim();
    onSelectedOpponentTextChange(selection);
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(360px,1.15fr)_minmax(340px,0.85fr)]">
      <DocumentEditorShell
        ref={documentTextRef}
        readOnly
        title="Ellenfél irata"
        subtitle="A munkaterület az ellenfél feltöltött iratának elérhető adatait és munkaszövegét mutatja."
        value={localExtractedText}
        placeholder={documentTextFallback}
        rows={20}
        minHeightClassName="min-h-[560px]"
        status={<AdminStatusPill tone={hasDocumentText ? "green" : "gold"}>{hasDocumentText ? "Szöveg elérhető" : "Nincs szöveg"}</AdminStatusPill>}
        badges={
          <>
            {documentMetaItems.length > 0 ? (
              documentMetaItems.map((item) => (
                <AdminBadge key={item} tone="neutral">
                  {item}
                </AdminBadge>
              ))
            ) : (
              <AdminBadge tone="neutral">Metaadat nem érhető el</AdminBadge>
            )}
            {documentContext?.textField ? <AdminBadge tone="blue">Szövegforrás: {documentContext.textField}</AdminBadge> : null}
            <AdminBadge tone={documentContext ? "green" : "gold"}>
              {documentContext ? "Dokumentum kontextus" : "Betöltés alatt"}
            </AdminBadge>
          </>
        }
        toolbar={
          <div className="grid w-full gap-3">
            <div className="rounded-[8px] border border-[#D8CFB6] bg-white p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Kiválasztott dokumentum</p>
                  <h3 className="mt-1 break-words font-serif text-xl font-medium text-[#1F2821]">
                    {isLoadingDocumentContext ? "Dokumentum betöltése..." : documentContext?.title || "Dokumentumadat nem érhető el"}
                  </h3>
                </div>
              </div>
              {documentContextError ? (
                <p className="mt-3 rounded-[6px] border border-dashed border-[#E5C3C3] bg-[#FFF7F4] px-3 py-2 text-[11px] text-[#7B776D]">
                  {documentContextError}
                </p>
              ) : null}
            </div>
            <input
              value={sourceReference}
              onChange={(event) => onSourceReferenceChange(event.target.value)}
              placeholder="Forrás referencia: oldal / pont / bekezdés"
              className="w-full rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
            />
            <div className="rounded-[8px] border border-[#D8CFB6] bg-white p-3">
              <div className="grid gap-2 lg:grid-cols-[minmax(180px,260px)_1fr]">
                <select
                  value={selectionOpponentType}
                  onChange={(event) => onSelectionOpponentTypeChange(event.target.value as OpponentBracketType)}
                  className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                >
                  {Object.entries(bracketTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <AdminButton variant="warning" onClick={onAddOpponentItemFromSelection} disabled={!hasSelectedText}>
                  Ellenfél állításának létrehozása kijelölésből
                </AdminButton>
              </div>
              {hasSelectedText ? (
                <p className="mt-2 line-clamp-2 rounded-[6px] border border-[#E7DECB] bg-[#FBF9F3] px-3 py-2 text-[11px] text-[#514D45]">
                  Kijelölt szöveg: „{selectedOpponentText}”
                </p>
              ) : (
                <p className="mt-2 rounded-[6px] border border-dashed border-[#D8CFB6] bg-[#FBF9F3] px-3 py-2 text-[11px] text-[#7B776D]">
                  Jelölj ki szöveget az ellenfél iratából.
                </p>
              )}
            </div>
          </div>
        }
        helperText={
          !hasDocumentText
            ? documentContext?.unavailableReason || documentTextFallback
            : undefined
        }
        onMouseUp={captureSelectedText}
        onKeyUp={captureSelectedText}
        onSelect={captureSelectedText}
      />

      <AdminPanel className="overflow-hidden">
        <AdminSectionHeader
          eyebrow="Állításrögzítés"
          title="Ellenfél állításának létrehozása"
          subtitle="Kérelem, tényállítás, jogi állítás, bizonyíték vagy támadható állítás strukturált rögzítése."
          action={<AdminStatusPill tone="burgundy">{opponentBrackets.length} állítás</AdminStatusPill>}
        />
        <div className="space-y-3 p-4">
          <OpponentBracketForm
            bracketDraft={bracketDraft}
            onBracketDraftChange={onBracketDraftChange}
            onAddOpponentBracket={onAddOpponentBracket}
          />
          <OpponentBracketList
            opponentBrackets={opponentBrackets}
            linkedCounts={linkedCounts}
            sourceReference={sourceReference}
            openBracketIds={openOpponentBracketIds}
            activeBracketIds={activeOpponentBracketIds}
            onToggleBracket={onToggleOpponentBracket}
          />
          <div className="flex justify-end">
            <AdminButton variant="primary" size="sm" onClick={onNext}>
              Tovább: Állítások / Válaszút
            </AdminButton>
          </div>
        </div>
      </AdminPanel>
    </section>
  );
}

function OpponentBracketForm({
  bracketDraft,
  onBracketDraftChange,
  onAddOpponentBracket,
}: {
  bracketDraft: {
    type: OpponentBracketType;
    title: string;
    quote: string;
    sourceRef: string;
    legalBasis: string;
    evidence: string;
    requestedRelief: string;
    risk: OpponentBracket["risk"];
    status: OpponentBracketStatus;
  };
  onBracketDraftChange: (value: typeof bracketDraft | ((prev: typeof bracketDraft) => typeof bracketDraft)) => void;
  onAddOpponentBracket: () => void;
}) {
  return (
    <div className="rounded-[8px] border border-[#E5C3C3] bg-[#FFF7F4] p-3">
      <div className="grid gap-2">
        <select
          value={bracketDraft.type}
          onChange={(event) => onBracketDraftChange((prev) => ({ ...prev, type: event.target.value as OpponentBracketType }))}
          className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
        >
          {Object.entries(bracketTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={bracketDraft.title}
          onChange={(event) => onBracketDraftChange((prev) => ({ ...prev, title: event.target.value }))}
          placeholder="Érv / kérelem címe"
          className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
        />
        <textarea
          value={bracketDraft.quote}
          onChange={(event) => onBracketDraftChange((prev) => ({ ...prev, quote: event.target.value }))}
          rows={4}
          placeholder="Idézet / forráshely az ellenfél iratából"
          className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
        />
        <input
          value={bracketDraft.sourceRef}
          onChange={(event) => onBracketDraftChange((prev) => ({ ...prev, sourceRef: event.target.value }))}
          placeholder="Forráshely: oldal / pont / bekezdés"
          className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
        />
        <input
          value={bracketDraft.legalBasis}
          onChange={(event) => onBracketDraftChange((prev) => ({ ...prev, legalBasis: event.target.value }))}
          placeholder="Hivatkozott jogalap"
          className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
        />
        <input
          value={bracketDraft.evidence}
          onChange={(event) => onBracketDraftChange((prev) => ({ ...prev, evidence: event.target.value }))}
          placeholder="Hivatkozott bizonyíték"
          className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
        />
        <input
          value={bracketDraft.requestedRelief}
          onChange={(event) => onBracketDraftChange((prev) => ({ ...prev, requestedRelief: event.target.value }))}
          placeholder="Követelt jogkövetkezmény"
          className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={bracketDraft.risk}
            onChange={(event) => onBracketDraftChange((prev) => ({ ...prev, risk: event.target.value as OpponentBracket["risk"] }))}
            className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
          >
            <option value="low">Kockázat: alacsony</option>
            <option value="medium">Kockázat: közepes</option>
            <option value="high">Kockázat: magas</option>
          </select>
          <select
            value={bracketDraft.status}
            onChange={(event) => onBracketDraftChange((prev) => ({ ...prev, status: event.target.value as OpponentBracketStatus }))}
            className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
          >
            <option value="rögzítve">Státusz: rögzítve</option>
            <option value="válaszút kell">Státusz: válaszút kell</option>
            <option value="válaszút kapcsolva">Státusz: válaszút kapcsolva</option>
            <option value="lezárható">Státusz: lezárható</option>
          </select>
        </div>
        <AdminButton variant="warning" size="sm" onClick={onAddOpponentBracket} disabled={!bracketDraft.title.trim() || !bracketDraft.quote.trim()}>
          Ellenfél állítása hozzáadása
        </AdminButton>
      </div>
    </div>
  );
}

function OpponentBracketList({
  opponentBrackets,
  linkedCounts,
  sourceReference,
  openBracketIds,
  activeBracketIds,
  onToggleBracket,
  onStartResponseForBracket,
}: {
  opponentBrackets: OpponentBracket[];
  linkedCounts: Record<string, number>;
  sourceReference: string;
  openBracketIds: string[];
  activeBracketIds: string[];
  onToggleBracket: (bracketId: string) => void;
  onStartResponseForBracket?: (bracketId: string) => void;
}) {
  if (opponentBrackets.length === 0) {
    return (
      <div className="rounded-[8px] border border-dashed border-[#DFCFC6] bg-[#FBF9F3] p-4 text-[12px] text-[#7B776D]">
        Még nincs ellenfél-állítás. Ezen a munkaterületen az ellenfél iratából kell kiemelni a támadható állításokat és kérelmeket.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {opponentBrackets.map((bracket) => {
        const isOpen = openBracketIds.includes(bracket.id);
        const isActive = activeBracketIds.includes(bracket.id);
        const linkedCount = linkedCounts[bracket.id] || 0;

        return (
          <div
            key={bracket.id}
            className={`relative rounded-[10px] border bg-white shadow-sm transition-colors before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[4px] before:rounded-r-full before:bg-[#8F3131] ${
              isActive ? "border-[#2D4A7C] ring-2 ring-[#C7D6EA]" : "border-[#E5C3C3]"
            }`}
          >
            <button
              type="button"
              onClick={() => onToggleBracket(bracket.id)}
              className="flex w-full items-start justify-between gap-3 px-4 py-3 pl-6 text-left"
              aria-expanded={isOpen}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <AdminBadge tone="burgundy">{bracketTypeLabels[bracket.type]}</AdminBadge>
                  <AdminBadge tone={linkedCount ? "blue" : "neutral"}>{linkedCount} válasz</AdminBadge>
                  {isActive ? <AdminBadge tone="blue">Kapcsolt fókusz</AdminBadge> : null}
                </span>
                <span className="mt-2 block truncate font-serif text-lg font-medium text-[#1F2821]">{bracket.title}</span>
                <span className="mt-1 block truncate text-[11px] text-[#6D6A62]">
                  {linkedCount > 0 ? `${linkedCount} kapcsolt saját válasz` : "Még nincs válasz ehhez az állításhoz."}
                </span>
                <span className="mt-1 block truncate text-[11px] text-[#8F6D62]">
                  {bracket.sourceRef || sourceReference || "Forráshely nincs megadva"} · {bracket.status}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <AdminStatusPill tone={riskTone[bracket.risk]}>{riskLabel[bracket.risk]}</AdminStatusPill>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#E5C3C3] bg-[#FFF8F5] text-[14px] font-semibold text-[#8F3131]">
                  {isOpen ? "−" : "+"}
                </span>
              </span>
            </button>

            {onStartResponseForBracket ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F0DFD8] bg-[#FFFDFC] px-4 py-2 pl-6">
                <p className="text-[11px] text-[#6D6A62]">
                  {linkedCount > 0 ? `${linkedCount} saját válasz kapcsolódik ehhez.` : "Még nincs válasz ehhez az állításhoz."}
                </p>
                <AdminButton
                  variant="warning"
                  size="sm"
                  onClick={() => onStartResponseForBracket(bracket.id)}
                >
                  Válasz készítése ehhez
                </AdminButton>
              </div>
            ) : null}

            {isOpen ? (
              <div className="border-t border-[#F0DFD8] px-4 pb-4 pl-6 pt-3">
                <p className="rounded-[8px] border border-[#F0DFD8] bg-[#FFF8F5] px-3 py-2 text-[12px] italic text-[#6B4A44]">
                  „{bracket.quote}”
                </p>
                <dl className="mt-3 grid gap-2 text-[11px] text-[#514D45] md:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-[#1F2821]">Forráshely</dt>
                    <dd>{bracket.sourceRef || sourceReference || "Nincs megadva"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[#1F2821]">Jogalap</dt>
                    <dd>{bracket.legalBasis || "Nincs megadva"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[#1F2821]">Bizonyíték</dt>
                    <dd>{bracket.evidence || "Nincs megadva"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[#1F2821]">Követelt jogkövetkezmény</dt>
                    <dd>{bracket.requestedRelief || "Nincs megadva"}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StrategyWorkspace({
  opponentBrackets,
  responseBlocks,
  responseDraft,
  linkedCounts,
  openOpponentBracketIds,
  openResponseBlockIds,
  activeOpponentBracketIds,
  activeResponseBlockIds,
  onResponseDraftChange,
  onToggleBracketRelation,
  onToggleOpponentBracket,
  onToggleResponseBlock,
  onStartResponseForOpponentBracket,
  onAddResponseBlock,
  onBack,
  onNext,
}: {
  opponentBrackets: OpponentBracket[];
  responseBlocks: ResponseBlock[];
  responseDraft: {
    title: string;
    detail: string;
    type: ResponseBlock["type"];
    relatedBracketIds: string[];
  };
  linkedCounts: Record<string, number>;
  openOpponentBracketIds: string[];
  openResponseBlockIds: string[];
  activeOpponentBracketIds: string[];
  activeResponseBlockIds: string[];
  onResponseDraftChange: (value: typeof responseDraft | ((prev: typeof responseDraft) => typeof responseDraft)) => void;
  onToggleBracketRelation: (bracketId: string) => void;
  onToggleOpponentBracket: (bracketId: string) => void;
  onToggleResponseBlock: (responseBlockId: string) => void;
  onStartResponseForOpponentBracket: (bracketId: string) => void;
  onAddResponseBlock: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <AdminPanel className="overflow-hidden">
        <AdminSectionHeader
          eyebrow="Ellenfél állításai"
          title="Ellenfél állításai"
          subtitle="A korábban rögzített ellenoldali állítások. Innen választod ki, mire válaszol a saját stratégiai blokk."
          action={<AdminStatusPill tone="burgundy">{opponentBrackets.length} állítás</AdminStatusPill>}
        />
        <div className="space-y-3 p-4">
          <div className="rounded-[8px] border border-[#E7DECB] bg-[#FBF9F3] px-3 py-2 text-[11px] text-[#6D6A62]">
            Egy állítás megnyitása kiemeli és automatikusan megnyitja a hozzá kapcsolt válaszblokkokat.
          </div>
          <OpponentBracketList
            opponentBrackets={opponentBrackets}
            linkedCounts={linkedCounts}
            sourceReference=""
            openBracketIds={openOpponentBracketIds}
            activeBracketIds={activeOpponentBracketIds}
            onToggleBracket={onToggleOpponentBracket}
            onStartResponseForBracket={onStartResponseForOpponentBracket}
          />
          <AdminButton variant="neutral" size="sm" onClick={onBack}>
            Vissza: Ellenfél irata
          </AdminButton>
        </div>
      </AdminPanel>

      <AdminPanel className="overflow-hidden">
        <AdminSectionHeader
          eyebrow="Saját válaszok"
          title="Saját válaszok"
          subtitle="Tények, bizonyítékok, jogszabályhelyek, joggyakorlat és eljárási kifogások az ellenoldali állításokhoz kapcsolva."
          action={<AdminStatusPill tone="green">{responseBlocks.length} válaszblokk</AdminStatusPill>}
        />
        <div className="space-y-3 p-4">
          <div className="rounded-[8px] border border-[#E6D8AD] bg-[#FFF9E6] p-3">
            <div className="grid gap-2">
              {responseDraft.relatedBracketIds.length > 0 ? (
                <div className="rounded-[8px] border border-[#C7D6EA] bg-[#F3F7FC] px-3 py-2 text-[11px] text-[#2D4A7C]">
                  <span className="font-semibold">Erre válaszol: </span>
                  {responseDraft.relatedBracketIds
                    .map((bracketId) => opponentBrackets.find((bracket) => bracket.id === bracketId)?.title)
                    .filter(Boolean)
                    .join(", ")}
                </div>
              ) : (
                <div className="rounded-[8px] border border-dashed border-[#D8CFB6] bg-white px-3 py-2 text-[11px] text-[#7B776D]">
                  Nincs ellenoldali állításhoz kapcsolva.
                </div>
              )}
              <select
                value={responseDraft.type}
                onChange={(event) => onResponseDraftChange((prev) => ({ ...prev, type: event.target.value as ResponseBlock["type"] }))}
                className="rounded border border-[#E3D6AA] bg-white px-3 py-2 text-xs text-[#1F2821]"
              >
                {Object.entries(responseTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                value={responseDraft.title}
                onChange={(event) => onResponseDraftChange((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Válaszblokk címe"
                className="rounded border border-[#E3D6AA] bg-white px-3 py-2 text-xs text-[#1F2821]"
              />
              <textarea
                value={responseDraft.detail}
                onChange={(event) => onResponseDraftChange((prev) => ({ ...prev, detail: event.target.value }))}
                rows={6}
                placeholder="Ténybeli cáfolat, bizonyíték, jogszabályhely, joggyakorlat, kifogás vagy saját narratíva"
                className="rounded border border-[#E3D6AA] bg-white px-3 py-2 text-xs text-[#1F2821]"
              />
              <div className="rounded-[6px] border border-[#E6D8AD] bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Kapcsolódó ellenoldali állítások</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {opponentBrackets.length === 0 ? (
                    <span className="text-[11px] text-[#7B776D]">Előbb az Ellenfél irata munkaterületen hozz létre állításokat.</span>
                  ) : (
                    opponentBrackets.map((bracket) => (
                      <button
                        key={bracket.id}
                        type="button"
                        onClick={() => onToggleBracketRelation(bracket.id)}
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                          responseDraft.relatedBracketIds.includes(bracket.id)
                            ? "border-[#2D4A7C] bg-[#EAEFF6] text-[#2D4A7C]"
                            : "border-[#DDD7CA] bg-[#FBF9F3] text-[#514D45] hover:bg-white"
                        }`}
                      >
                        {bracket.title}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <AdminButton variant="warning" size="sm" onClick={onAddResponseBlock} disabled={!responseDraft.title.trim() || !responseDraft.detail.trim()}>
                Válaszblokk hozzáadása
              </AdminButton>
            </div>
          </div>

          {responseBlocks.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[#D8CFB6] bg-[#FBF9F3] p-4 text-[12px] text-[#7B776D]">
              Még nincs saját válaszblokk. Ez a munkaterület az állításhoz kapcsolt válaszstratégia helye, nem kész jogi következtetés.
            </div>
          ) : (
            <div className="space-y-3">
              {responseBlocks.map((block) => {
                const isOpen = openResponseBlockIds.includes(block.id);
                const isActive = activeResponseBlockIds.includes(block.id);
                const relatedTitles = block.relatedBracketIds
                  .map((bracketId) => opponentBrackets.find((bracket) => bracket.id === bracketId)?.title)
                  .filter(Boolean);

                return (
                  <div
                    key={block.id}
                    className={`relative rounded-[10px] border bg-white shadow-sm transition-colors before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[4px] before:rounded-r-full before:bg-[#1F4A33] ${
                      isActive ? "border-[#2D4A7C] ring-2 ring-[#C7D6EA]" : "border-[#D8CFB6]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleResponseBlock(block.id)}
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 pl-6 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <AdminBadge tone={responseTone(block.type)}>{responseTypeLabels[block.type]}</AdminBadge>
                          <AdminBadge tone={block.relatedBracketIds.length ? "blue" : "neutral"}>{block.relatedBracketIds.length} ellenoldali kapcsolat</AdminBadge>
                          {isActive ? <AdminBadge tone="blue">Kapcsolt fókusz</AdminBadge> : null}
                        </span>
                        <span className="mt-2 block truncate font-serif text-lg font-medium text-[#1F2821]">{block.title}</span>
                        <span className="mt-1 block truncate text-[11px] text-[#6D6A62]">
                          {relatedTitles.length > 0 ? `Erre válaszol: ${relatedTitles.join(", ")}` : "Nincs ellenoldali állításhoz kapcsolva."}
                        </span>
                      </span>
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#D8CFB6] bg-[#FBF9F3] text-[14px] font-semibold text-[#1F4A33]">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-[#E7DECB] px-4 pb-4 pl-6 pt-3">
                        <p className="whitespace-pre-wrap rounded-[8px] border border-[#E7DECB] bg-[#FCFAF4] px-3 py-2 text-[12px] leading-6 text-[#514D45]">
                          {block.detail}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {relatedTitles.length > 0 ? (
                            relatedTitles.map((title) => (
                              <AdminBadge key={title} tone="blue">
                                Kapcsolódik: {title}
                              </AdminBadge>
                            ))
                          ) : (
                            <AdminBadge tone="neutral">Nincs ellenoldali állításhoz kapcsolva.</AdminBadge>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <AdminButton variant="neutral" size="sm" onClick={onBack}>
              Vissza
            </AdminButton>
            <AdminButton variant="primary" size="sm" onClick={onNext}>
              Tovább: Beadvány összeállítása
            </AdminButton>
          </div>
        </div>
      </AdminPanel>
    </section>
  );
}

function AssemblyWorkspace({
  chapterBlocks,
  chapterDraft,
  outputTemplate,
  assemblyStructure,
  generatedChapterSeeds,
  generatedPleadingSkeleton,
  pleadingEditorText,
  editorWasTouched,
  responseBlocks,
  onChapterDraftChange,
  onAddChapterBlock,
  onOutputTemplateChange,
  onApplyGeneratedSkeleton,
  onPleadingEditorTextChange,
  onBack,
}: {
  chapterBlocks: ChapterBlock[];
  chapterDraft: {
    title: string;
    pleadingText: string;
    counterclaimDirection: string;
    requestedRelief: string;
    status: ChapterBlock["status"];
  };
  outputTemplate: OutputTemplate;
  assemblyStructure: string[];
  generatedChapterSeeds: PleadingChapterSeed[];
  generatedPleadingSkeleton: string;
  pleadingEditorText: string;
  editorWasTouched: boolean;
  responseBlocks: ResponseBlock[];
  onChapterDraftChange: (value: typeof chapterDraft | ((prev: typeof chapterDraft) => typeof chapterDraft)) => void;
  onAddChapterBlock: () => void;
  onOutputTemplateChange: (value: OutputTemplate) => void;
  onApplyGeneratedSkeleton: () => void;
  onPleadingEditorTextChange: (value: string) => void;
  onBack: () => void;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(280px,0.62fr)_minmax(760px,1.38fr)]">
      <AdminPanel className="overflow-hidden">
        <AdminSectionHeader
          eyebrow="Válaszokból fejezetek"
          title="Válaszból fejezet"
          subtitle="A válaszblokkokból képzett fejezet-vázlat. Ezek táplálják a beadványszerkesztőt."
          action={<AdminStatusPill tone="violet">{generatedChapterSeeds.length} generált fejezet</AdminStatusPill>}
        />
        <div className="space-y-3 p-4">
          <div className="rounded-[8px] border border-[#D8CFB6] bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Automatikus vázlat</p>
            <p className="mt-2 text-[12px] leading-5 text-[#514D45]">
              A beadványszerkesztő a válaszblokkok számából és típusából készít tiszta peres dokumentum-vázat. Hiányzó ügyadatnál helykitöltő marad.
            </p>
            <AdminButton variant="gold" size="sm" onClick={onApplyGeneratedSkeleton} className="mt-3">
              Vázlat frissítése válaszblokkokból
            </AdminButton>
          </div>

          <div className="rounded-[8px] border border-[#D7CCB0] bg-[#FBF9F3] p-3">
            <div className="grid gap-2">
              <select
                value={outputTemplate}
                onChange={(event) => onOutputTemplateChange(event.target.value as OutputTemplate)}
                className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
              >
                {Object.entries(outputTemplateLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                value={chapterDraft.title}
                onChange={(event) => onChapterDraftChange((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Fejezet / saját érv címe"
                className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
              />
              <textarea
                value={chapterDraft.pleadingText}
                onChange={(event) => onChapterDraftChange((prev) => ({ ...prev, pleadingText: event.target.value }))}
                rows={5}
                placeholder="Beadványba illeszthető fejezetszöveg"
                className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
              />
              <input
                value={chapterDraft.counterclaimDirection}
                onChange={(event) => onChapterDraftChange((prev) => ({ ...prev, counterclaimDirection: event.target.value }))}
                placeholder="Viszontkereseti / ellenkérelmi irány"
                className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
              />
              <input
                value={chapterDraft.requestedRelief}
                onChange={(event) => onChapterDraftChange((prev) => ({ ...prev, requestedRelief: event.target.value }))}
                placeholder="Kérelem / jogkövetkezmény"
                className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
              />
              <select
                value={chapterDraft.status}
                onChange={(event) => onChapterDraftChange((prev) => ({ ...prev, status: event.target.value as ChapterBlock["status"] }))}
                className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
              >
                <option value="hiányos">Státusz: hiányos</option>
                <option value="szerkeszthető">Státusz: szerkeszthető</option>
                <option value="ügyvédi review">Státusz: ügyvédi review</option>
              </select>
              <AdminButton variant="primary" size="sm" onClick={onAddChapterBlock} disabled={!chapterDraft.title.trim() || !chapterDraft.pleadingText.trim()}>
                Fejezetelem hozzáadása
              </AdminButton>
            </div>
          </div>

          {generatedChapterSeeds.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[#D8CFB6] bg-white p-4 text-[12px] text-[#7B776D]">
              A válaszútból még nincs átemelhető fejezet. A szerkesztő ilyenkor alap helykitöltő vázat készít.
            </div>
          ) : (
            <div className="space-y-2">
              {generatedChapterSeeds.map((chapter, index) => (
                <div key={chapter.id} className="rounded-[8px] border border-[#E7DECB] bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminBadge tone={chapter.tone}>{index + 1}. fejezet</AdminBadge>
                    <AdminBadge tone="neutral">{chapter.sourceLabel}</AdminBadge>
                  </div>
                  <h3 className="mt-2 font-serif text-[15px] font-medium text-[#1F2821]">{chapter.title}</h3>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-[#6D6A62]">{chapter.body}</p>
                </div>
              ))}
            </div>
          )}

          {chapterBlocks.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[#DDD7CA] bg-white p-4 text-[12px] text-[#7B776D]">
              Még nincs saját fejezetelem. Ez a panel a végső beadvány fejezeteinek előkészítése.
            </div>
          ) : (
            <div className="space-y-3">
              {chapterBlocks.map((chapter) => (
                <div key={chapter.id} className="rounded-[10px] border border-[#DDD7CA] bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-serif text-lg font-medium text-[#1F2821]">{chapter.title}</h3>
                    <AdminStatusPill tone={chapterStatusTone[chapter.status]}>{chapter.status}</AdminStatusPill>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-[#514D45]">{chapter.pleadingText}</p>
                </div>
              ))}
            </div>
          )}

          <AdminButton variant="neutral" size="sm" onClick={onBack}>
            Vissza: Állítások / Válaszút
          </AdminButton>
        </div>
      </AdminPanel>

      <DocumentEditorShell
        title="Beadványszerkesztő"
        subtitle="Automatikusan előkészített, helyi beadványvázlat Bálintfy-stílusú fejléccel és válaszblokkokon alapuló fejezetekkel."
        value={pleadingEditorText}
        onChange={onPleadingEditorTextChange}
        placeholder={generatedPleadingSkeleton}
        rows={28}
        minHeightClassName="min-h-[820px]"
        isDirty={editorWasTouched}
        dirtyLabel="Nem mentett helyi beadványvázlat."
        cleanLabel={pleadingEditorText.trim() ? "Helyi beadványvázlat előkészítve." : undefined}
        status={<AdminStatusPill tone="gold">Helyi vázlat</AdminStatusPill>}
        badges={
          <>
            <AdminBadge tone="neutral">{responseBlocks.length} saját válasz</AdminBadge>
            <AdminBadge tone="violet">{generatedChapterSeeds.length} beadványrész</AdminBadge>
          </>
        }
        sideActions={
          <AdminButton variant="gold" size="sm" onClick={onApplyGeneratedSkeleton}>
            Vázlat frissítése válaszblokkokból
          </AdminButton>
        }
        toolbar={
          <div className="grid w-full gap-3">
            <div className="grid gap-3 rounded-[10px] border border-[#D8CFB6] bg-white p-4 text-[11px] text-[#514D45] md:grid-cols-3">
              <div>
                <p className="font-semibold text-[#1F2821]">Forráslogika</p>
                <p className="mt-1">{responseBlocks.length} saját válasz alapján előkészítve</p>
              </div>
              <div>
                <p className="font-semibold text-[#1F2821]">Fejezetképzés</p>
                <p className="mt-1">Tény, bizonyíték, jogszabály, joggyakorlat és kifogás szerint csoportosítva</p>
              </div>
              <div>
                <p className="font-semibold text-[#1F2821]">Mentés/export</p>
                <p className="mt-1">Helyi vázlat; Word-export és szerveroldali mentés nincs bekötve</p>
              </div>
            </div>
            <div className="rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-serif text-xl font-medium text-[#1F2821]">Bálintfy ellenkérelem struktúra</h3>
                  <p className="mt-1 text-[12px] text-[#6D6A62]">{outputTemplateLabels[outputTemplate]}</p>
                </div>
                <AdminStatusPill tone="gold">Későbbi patch</AdminStatusPill>
              </div>
              <ol className="mt-4 grid gap-2 rounded-[8px] border border-[#E7DECB] bg-white p-4 text-[12px] text-[#514D45] md:grid-cols-2">
                {assemblyStructure.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          </div>
        }
        helperText="Helyi vázlat · AI nélkül · nincs szerveroldali mentés."
      />
    </section>
  );
}
