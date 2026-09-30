"use client";

import { LEGAL_PROMPT_CATALOG, LegalPromptTemplate } from "@/components/documents/legalPromptCatalog";

export interface SanitizedContextSource {
  isReady: boolean;
  sanitizedText?: string | null;
  documentTitle?: string | null;
  documentVersionId?: string | null;
  documentVersionNumber?: number | null;
  rejectionReason?: string | null;
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
    return { valid: true };
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

  return { valid: true };
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
  caseNumber?: string;
  caseTitle?: string;
  statusLabel?: string;
  urgencyLabel?: string;
  deadline?: string | null;
  responsibleName?: string | null;
  nextStep?: string | null;
  sanitizedContext?: SanitizedContextSource | null;
}): string {
  const validation = validateSanitizedContext(params.sanitizedContext);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const caseLabel = [params.caseNumber, params.caseTitle].filter(Boolean).join(" · ") || "Névtelen ügy";
  const docMeta = params.sanitizedContext?.documentTitle
    ? `${params.sanitizedContext.documentTitle}${params.sanitizedContext.documentVersionNumber ? ` v${params.sanitizedContext.documentVersionNumber}` : ""}`
    : null;

  return [
    buildPromptHeader("Ügy aktuális állása – Vezetői összefoglaló", caseLabel, docMeta),
    GLOBAL_PROMPT_RULES,
    "",
    "RÖGZÍTETT ÜGYADATOK:",
    `- Állapot: ${params.statusLabel || "Nincs megadva"}`,
    `- Sürgősség: ${params.urgencyLabel || "Normál"}`,
    params.deadline ? `- Határidő: ${params.deadline}` : null,
    params.responsibleName ? `- Felelős ügyvéd/munkatárs: ${params.responsibleName}` : null,
    params.nextStep ? `- Következő rögzített lépés: ${params.nextStep}` : null,
    "",
    "FELADAT:",
    "Készíts tömör, ügyvéd vagy partner számára áttekinthető helyzetértékelést:",
    "1. Az ügy jelenlegi státuszának és sürgősségének értékelése (1-2 bekezdés).",
    "2. Kockázatos területek vagy határidős veszélyek azonosítása.",
    "3. Azonnali teendők javasolt sorrendje (bullet pointokban).",
    "",
    buildContextSection(params.sanitizedContext),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 2. Matter Context Summary Prompt ("Miről szól az ügy? – Ügykontextus")
 */
export function buildDirectCaseContextPrompt(params: {
  caseNumber?: string;
  caseTitle?: string;
  originReason?: string | null;
  currentSituation?: string | null;
  description?: string | null;
  sanitizedContext?: SanitizedContextSource | null;
}): string {
  const validation = validateSanitizedContext(params.sanitizedContext);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const caseLabel = [params.caseNumber, params.caseTitle].filter(Boolean).join(" · ") || "Névtelen ügy";
  const docMeta = params.sanitizedContext?.documentTitle
    ? `${params.sanitizedContext.documentTitle}${params.sanitizedContext.documentVersionNumber ? ` v${params.sanitizedContext.documentVersionNumber}` : ""}`
    : null;

  const facts = [
    params.originReason ? `- Az ügy indoka: ${params.originReason}` : null,
    params.currentSituation ? `- Jelenlegi helyzet: ${params.currentSituation}` : null,
    params.description ? `- Ügyleírás: ${params.description}` : null,
  ].filter(Boolean);

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
    buildContextSection(params.sanitizedContext),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 3. Goal and Action Plan Prompt ("Cél és teendők – Akcióterv")
 */
export function buildDirectGoalActionPlanPrompt(params: {
  caseNumber?: string;
  caseTitle?: string;
  clientExpectation?: string | null;
  urgentAction?: string | null;
  nextStep?: string | null;
  deadline?: string | null;
  sanitizedContext?: SanitizedContextSource | null;
}): string {
  const validation = validateSanitizedContext(params.sanitizedContext);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const caseLabel = [params.caseNumber, params.caseTitle].filter(Boolean).join(" · ") || "Névtelen ügy";
  const docMeta = params.sanitizedContext?.documentTitle
    ? `${params.sanitizedContext.documentTitle}${params.sanitizedContext.documentVersionNumber ? ` v${params.sanitizedContext.documentVersionNumber}` : ""}`
    : null;

  return [
    buildPromptHeader("Cél és teendők – Ügyvédi akcióterv", caseLabel, docMeta),
    GLOBAL_PROMPT_RULES,
    "",
    "RÖGZÍTETT CÉLOK ÉS TEENDŐK:",
    params.clientExpectation ? `- Ügyfél elvárása: ${params.clientExpectation}` : null,
    params.urgentAction ? `- Sürgős teendő: ${params.urgentAction}` : null,
    params.nextStep ? `- Következő lépés: ${params.nextStep}` : null,
    params.deadline ? `- Határidő: ${params.deadline}` : null,
    "",
    "FELADAT:",
    "Készíts strukturált akciótervet az ügyfél elvárásainak teljesítéséhez:",
    "1. Az elérni kívánt cél jogi és gyakorlati megvalósíthatósága.",
    "2. Javasolt lépések ütemterve felelősségi körökkel és határidőkkel.",
    "3. Kockázatmérséklő intézkedések a kritikus teendőknél.",
    "",
    buildContextSection(params.sanitizedContext),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 4. Risk Matrix Prompt ("Kockázati mátrix prompt")
 * Reuses the canonical risk matrix template from legalPromptCatalog.
 */
export function buildDirectRiskMatrixPrompt(params: {
  caseNumber?: string;
  caseTitle?: string;
  sanitizedContext?: SanitizedContextSource | null;
}): string {
  const validation = validateSanitizedContext(params.sanitizedContext);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const caseLabel = [params.caseNumber, params.caseTitle].filter(Boolean).join(" · ") || "Névtelen ügy";
  const docMeta = params.sanitizedContext?.documentTitle
    ? `${params.sanitizedContext.documentTitle}${params.sanitizedContext.documentVersionNumber ? ` v${params.sanitizedContext.documentVersionNumber}` : ""}`
    : null;

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
    buildContextSection(params.sanitizedContext),
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
    caseNumber?: string;
    caseTitle?: string;
    sanitizedContext?: SanitizedContextSource | null;
  }
): string {
  const template = LEGAL_PROMPT_CATALOG.find((t) => t.id === templateId);
  if (!template) {
    throw new Error(`A megadott prompt sablon nem található: ${templateId}`);
  }

  const validation = validateSanitizedContext(params.sanitizedContext);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const caseLabel = [params.caseNumber, params.caseTitle].filter(Boolean).join(" · ") || "Névtelen ügy";
  const docMeta = params.sanitizedContext?.documentTitle
    ? `${params.sanitizedContext.documentTitle}${params.sanitizedContext.documentVersionNumber ? ` v${params.sanitizedContext.documentVersionNumber}` : ""}`
    : null;

  return [
    buildPromptHeader(template.label, caseLabel, docMeta),
    GLOBAL_PROMPT_RULES,
    "",
    "FELADAT:",
    template.buildBody({
      caseId: params.caseNumber,
      documentTitle: params.sanitizedContext?.documentTitle ?? undefined,
      anonymizedText: params.sanitizedContext?.sanitizedText ?? undefined,
    }),
    "",
    buildContextSection(params.sanitizedContext),
  ]
    .filter(Boolean)
    .join("\n");
}
