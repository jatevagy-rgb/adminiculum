"use client";

import { LEGAL_PROMPT_CATALOG, LegalPromptTemplate } from "@/components/documents/legalPromptCatalog";
import { listCaseContextSources } from "@/lib/caseContextSources";
import { getCaseWorkspace } from "@/lib/api";

export interface SanitizedContextSource {
  isReady: boolean;
  sourceId?: string | null;
  caseId?: string | null;
  clientId?: string | null;
  documentId?: string | null;
  sanitizedText?: string | null;
  documentTitle?: string | null;
  documentVersionId?: string | null;
  documentVersionNumber?: number | null;
  rejectionReason?: string | null;
}

const verifiedContexts = new WeakSet<object>();

/** Resolve a selected, immutable Case Context V2 result from the case-scoped API. */
export async function resolveSafePromptContext(
  context: SanitizedContextSource | null | undefined,
  scope: { caseId: string; clientId: string | null; documentId?: string | null },
): Promise<SanitizedContextSource | null> {
  if (!context?.isReady || context.rejectionReason || !context.sourceId ||
      !scope.caseId || context.caseId !== scope.caseId ||
      context.clientId !== scope.clientId ||
      (scope.documentId && context.documentId !== scope.documentId)) return null;
  // Case Context V2 sources carry no document/version provenance. A document-bound
  // request cannot safely inherit a case-level result.
  if (scope.documentId || context.documentId || context.documentVersionId) return null;
  try {
    const workspace = await getCaseWorkspace(scope.caseId);
    if (workspace.case.id !== scope.caseId || (workspace.case.client?.id ?? null) !== scope.clientId) return null;
    const sources = await listCaseContextSources(scope.caseId);
    const source = sources.find((item) => item.id === context.sourceId);
    if (!source?.anonymizedText?.trim() || !source.anonymizationSnapshot ||
        source.anonymizationSnapshot.mappingLocation !== "in-memory-only" ||
        source.anonymizedText !== context.sanitizedText ||
        containsRawSensitiveMarker(source.anonymizedText)) return null;
    const verified: SanitizedContextSource = {
      isReady: true,
      sourceId: source.id,
      caseId: scope.caseId,
      clientId: scope.clientId,
      sanitizedText: source.anonymizedText,
    };
    verifiedContexts.add(verified);
    return verified;
  } catch {
    return null;
  }
}

/**
 * Checks for known fixture markers or raw sensitive data tags that MUST NEVER
 * leak into external AI prompt text.
 */
const RAW_SENSITIVE_MARKERS = [
  /\[CONFIDENTIAL:RAW\]/i,
  /\[PII:RAW\]/i,
  /\[SECRET:RAW\]/i,
  /\[UNSANITIZED:RAW\]/i,
  /\[RAW_SENSITIVE\]/i,
  /<RAW_SENSITIVE>/i,
  /RAW_CONFIDENTIAL/i,
  /CONFIDENTIAL_RAW/i,
];

export function containsRawSensitiveMarker(text: string | null | undefined): boolean {
  if (!text) return false;
  return RAW_SENSITIVE_MARKERS.some((pattern) => pattern.test(text));
}

export function validateSanitizedContext(
  context?: SanitizedContextSource | null
): { valid: boolean; reason?: string } {
  if (!context) {
    return { valid: false, reason: "Nincs igazolt anonimizált háttérszöveg." };
  }

  if (context.sanitizedText && containsRawSensitiveMarker(context.sanitizedText)) {
    return {
      valid: false,
      reason:
        "Biztonsági hiba: Nyers, nem anonimizált bizalmas adatjelölőt ([CONFIDENTIAL:RAW] / [PII:RAW]) tartalmazó szöveg nem adható át a promptnak.",
    };
  }

  if (context.rejectionReason) {
    return {
      valid: false,
      reason: context.rejectionReason,
    };
  }

  return { valid: Boolean(context.isReady && verifiedContexts.has(context)) };
}

function promptContext(
  context: SanitizedContextSource | null | undefined,
  scope: { caseId?: string; clientId?: string | null; documentId?: string | null },
): SanitizedContextSource | null {
  return validateSanitizedContext(context).valid && context && scope.caseId &&
    context.caseId === scope.caseId && context.clientId === scope.clientId &&
    !scope.documentId && !context.documentId && !context.documentVersionId ? context : null;
}

const GLOBAL_PROMPT_RULES = `Feladatod: ügyvédi munkairat előkészítése az alábbi ügyadatok és háttér alapján.

FONTOS SZABÁLYOK:
1. Magyar nyelven válaszolj.
2. Ne találj ki nem létező tényeket, határidőket, feleket vagy jogszabályi hivatkozásokat.
3. Ha valamely adat hiányzik, jelöld így: HIÁNYZIK / NEM ÁLLAPÍTHATÓ MEG / ELLENŐRIZENDŐ.
4. A válasz ügyvédi review-ra szánt munkairat legyen, ne végleges jogi állásfoglalás.
5. A kimenet legyen jól tagolt, gyorsan áttekinthető.`;

function buildPromptHeader(title: string, caseLabel: string, docMeta?: string | null): string {
  return [
    `Adminiculum — Jogi munkaprompt: ${title}`,
    "--------------------------------------------------",
    `Ügy: ${caseLabel}`,
    docMeta ? `Dokumentum: ${docMeta}` : null,
    "--------------------------------------------------",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildContextSection(context?: SanitizedContextSource | null): string {
  if (!context || !context.isReady || !context.sanitizedText?.trim()) {
    return [
      "HÁTTÉRSZÖVEG / DOKUMENTUM:",
      "[Megjegyzés: Nem áll rendelkezésre külön anonimizált háttérszöveg. A prompt szerkezeti vázként használható; bizalmas adatot ne másoljon külső szolgáltatóhoz.]",
    ].join("\n");
  }

  const versionTag = context.documentVersionNumber
    ? ` (v${context.documentVersionNumber})`
    : "";

  return [
    `ANONIMIZÁLT HÁTTÉRSZÖVEG${versionTag}:`,
    context.sanitizedText.trim(),
  ].join("\n");
}

/**
 * 1. Current State Summary Prompt ("Ügy aktuális állása összefoglaló")
 */
export function buildDirectCurrentStatePrompt(params: {
  caseId?: string;
  clientId?: string | null;
  documentId?: string | null;
  caseNumber?: string;
  caseTitle?: string;
  statusLabel?: string;
  urgencyLabel?: string;
  deadline?: string | null;
  responsibleName?: string | null;
  nextStep?: string | null;
  sanitizedContext?: SanitizedContextSource | null;
}): string {
  const caseLabel = "[ÜGYAZONOSÍTÓ]";
  const docMeta = null;

  return [
    buildPromptHeader("Ügy aktuális állása – Vezetői összefoglaló", caseLabel, docMeta),
    GLOBAL_PROMPT_RULES,
    "",
    "RÖGZÍTETT ÜGYADATOK:",
    "- Állapot: [ANONIMIZÁLT ÁLLAPOT]",
    "- Sürgősség: [ANONIMIZÁLT SÜRGŐSSÉG]",
    "- Határidő: [ANONIMIZÁLT HATÁRIDŐ]",
    "- Felelős: [SZEREP]",
    "- Következő lépés: [ANONIMIZÁLT LÉPÉS]",
    "",
    "FELADAT:",
    "Készíts tömör, ügyvéd vagy partner számára áttekinthető helyzetértékelést:",
    "1. Az ügy jelenlegi státuszának és sürgősségének értékelése (1-2 bekezdés).",
    "2. Kockázatos területek vagy határidős veszélyek azonosítása.",
    "3. Azonnali teendők javasolt sorrendje (bullet pointokban).",
    "",
    buildContextSection(promptContext(params.sanitizedContext, params)),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 2. Matter Context Summary Prompt ("Miről szól az ügy? – Ügykontextus")
 */
export function buildDirectCaseContextPrompt(params: {
  caseId?: string;
  clientId?: string | null;
  documentId?: string | null;
  caseNumber?: string;
  caseTitle?: string;
  originReason?: string | null;
  currentSituation?: string | null;
  description?: string | null;
  sanitizedContext?: SanitizedContextSource | null;
}): string {
  const caseLabel = "[ÜGYAZONOSÍTÓ]";
  const docMeta = null;

  const facts = ["- Az ügy indoka: [ANONIMIZÁLT INDOK]", "- Jelenlegi helyzet: [ANONIMIZÁLT HELYZET]", "- Ügyleírás: [ANONIMIZÁLT LEÍRÁS]"];

  return [
    buildPromptHeader("Miről szól az ügy? – Ügykontextus elemzés", caseLabel, docMeta),
    GLOBAL_PROMPT_RULES,
    "",
    "RÖGZÍTETT INDULÓ TÉNYEK ÉS KONTEXTUS:",
    facts.length > 0 ? facts.join("\n") : "- Nincs rögzített szabad szöveges induló leírás.",
    "",
    "FELADAT:",
    "Foglald össze és elemezd az ügy jogi és ténybeli kontextusát:",
    "1. Tényállás rekonstrukciója a rendelkezésre álló adatok alapján.",
    "2. A jogvita vagy tranzakció fókuszkérdései.",
    "3. Tisztázandó ténybeli ellentmondások és hiányzó információk.",
    "",
    buildContextSection(promptContext(params.sanitizedContext, params)),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 3. Goal and Action Plan Prompt ("Cél és teendők – Akcióterv")
 */
export function buildDirectGoalActionPlanPrompt(params: {
  caseId?: string;
  clientId?: string | null;
  documentId?: string | null;
  caseNumber?: string;
  caseTitle?: string;
  clientExpectation?: string | null;
  urgentAction?: string | null;
  nextStep?: string | null;
  deadline?: string | null;
  sanitizedContext?: SanitizedContextSource | null;
}): string {
  const caseLabel = "[ÜGYAZONOSÍTÓ]";
  const docMeta = null;

  return [
    buildPromptHeader("Cél és teendők – Ügyvédi akcióterv", caseLabel, docMeta),
    GLOBAL_PROMPT_RULES,
    "",
    "RÖGZÍTETT CÉLOK ÉS TEENDŐK:",
    "- Ügyfél elvárása: [ANONIMIZÁLT CÉL]",
    "- Sürgős teendő: [ANONIMIZÁLT TEENDŐ]",
    "- Következő lépés: [ANONIMIZÁLT LÉPÉS]",
    "- Határidő: [ANONIMIZÁLT HATÁRIDŐ]",
    "",
    "FELADAT:",
    "Készíts strukturált akciótervet az ügyfél elvárásainak teljesítéséhez:",
    "1. Az elérni kívánt cél jogi és gyakorlati megvalósíthatósága.",
    "2. Javasolt lépések ütemterve felelősségi körökkel és határidőkkel.",
    "3. Kockázatmérséklő intézkedések a kritikus teendőknél.",
    "",
    buildContextSection(promptContext(params.sanitizedContext, params)),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 4. Risk Matrix Prompt ("Kockázati mátrix prompt")
 * Reuses the canonical risk matrix template from legalPromptCatalog.
 */
export function buildDirectRiskMatrixPrompt(params: {
  caseId?: string;
  clientId?: string | null;
  documentId?: string | null;
  caseNumber?: string;
  caseTitle?: string;
  sanitizedContext?: SanitizedContextSource | null;
}): string {
  const caseLabel = "[ÜGYAZONOSÍTÓ]";
  const docMeta = null;

  return [
    buildPromptHeader("Kockázati mátrix előkészítése", caseLabel, docMeta),
    GLOBAL_PROMPT_RULES,
    "",
    "FELADAT:",
    "Készítsd el a jogi és szerződéses kockázatokat összefoglaló „Kockázati mátrix” táblázatot.",
    "",
    "Kötelező kimeneti táblázat formátum (Markdown):",
    "| Kockázat | Súlyosság | Valószínűség | Érintett pont | Javasolt kezelés |",
    "|---|---|---|---|---|",
    "",
    "Megengedett Súlyosság értékek:",
    "Alacsony / Közepes / Magas / Kritikus",
    "",
    "Megengedett Valószínűség értékek:",
    "Alacsony / Közepes / Magas / Biztos vagy szöveg alapján fennáll",
    "",
    "Keresd különösen:",
    "- kitöltetlen placeholder-ek,",
    "- hiányzó mellékletek,",
    "- fizetési bizonytalanság és késedelmi szankciók,",
    "- felmondási aszimmetria,",
    "- felelősségkorlátozás és kártérítés,",
    "- jogválasztás és hatáskör.",
    "",
    buildContextSection(promptContext(params.sanitizedContext, params)),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Direct prompt builder for any canonical template in LEGAL_PROMPT_CATALOG.
 */
export function buildDirectCatalogPrompt(
  templateId: string,
  params: {
    caseId?: string;
    clientId?: string | null;
    documentId?: string | null;
    caseNumber?: string;
    caseTitle?: string;
    sanitizedContext?: SanitizedContextSource | null;
  }
): string {
  const template = LEGAL_PROMPT_CATALOG.find((t) => t.id === templateId);
  if (!template) {
    throw new Error(`A megadott prompt sablon nem található: ${templateId}`);
  }

  const caseLabel = "[ÜGYAZONOSÍTÓ]";
  const docMeta = null;
  const safeContext = promptContext(params.sanitizedContext, params);

  return [
    buildPromptHeader(template.label, caseLabel, docMeta),
    GLOBAL_PROMPT_RULES,
    "",
    "FELADAT:",
    template.buildBody({
      caseId: undefined,
      documentTitle: undefined,
      anonymizedText: safeContext?.sanitizedText ?? undefined,
    }),
    "",
    buildContextSection(safeContext),
  ]
    .filter(Boolean)
    .join("\n");
}
