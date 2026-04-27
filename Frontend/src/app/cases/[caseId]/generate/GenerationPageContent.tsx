"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  getContractTemplates,
  getCaseById,
  generateContract,
  previewContract,
  downloadContract,
  submitDocumentForReview,
  getGenerationDraft,
  saveGenerationDraft,
  type ContractTemplateItem,
  type ContractGenerateResponse,
  type CaseListItem,
} from "@/lib/api";
import { useUiPack } from "@/lib/uiPack";
import { WorkspaceLayout, Panel, Card, SectionBlock } from "@/components/ui/WorkspacePrimitives";
import { AnonymizeModal, type AnonymizeResult } from "@/components/documents/AnonymizeModal";
import { RehydrateModal } from "@/components/documents/RehydrateModal";
import {
  DOCUMENT_FAMILIES,
  pickFamilyFromTemplate,
  type DocumentFamilyId,
  WorkstationSectionId,
  DocumentId,
} from "./workstationSchema";

type GenerationPageProps = {
  params: Promise<{ caseId: string }>;
};

type DocumentReadinessState = "ready" | "draft_only" | "missing_fields" | "blocked";

type DocumentReadiness = {
  state: DocumentReadinessState;
  label: "Ready" | "Draft only" | "Missing fields" | "Blocked";
  message: string;
  missingFields: string[];
  blockingReasons: string[];
  draftWarnings: string[];
  canSelect: boolean;
  canGenerate: boolean;
  template: ContractTemplateItem | null;
};

type BundleGenerationResult = {
  status: "generated" | "skipped" | "failed";
  message: string;
  document?: ContractGenerateResponse["document"];
};

const bundleDocs: Record<DocumentId, string> = {
  main_sale: "Adásvételi szerződés",
  reg_consent: "Bejegyzési engedély",
  escrow_cert: "Letéti igazolás",
  own_funds: "Önerő nyilatkozat",
  iny_request: "INY kérelem",
  gift_main: "Ajándékozási szerződés",
};

type BundleDocId = DocumentId;

const TEMPLATE_RESOLVERS: Record<BundleDocId, (template: ContractTemplateItem) => boolean> = {
  main_sale: (template) => template.name === "Ingatlan adásvételi szerződés",
  reg_consent: (template) => template.name === "Bejegyzési engedély",
  escrow_cert: (template) => template.name === "Letéti igazolás",
  own_funds: (template) => template.name === "Önerő nyilatkozat",
  iny_request: (template) => template.name === "INY kérelem",
  gift_main: (template) => {
    const hay = `${template.name} ${template.description || ""} ${template.category}`.toLowerCase();
    return /ajándékozási szerződés|ajandekozasi szerzodes|gift/.test(hay);
  },
};

const VARIABLE_ALIASES: Record<string, string[]> = {
  seller_name: ["seller_name", "elado_nev"],
  buyer_name: ["buyer_name", "vevo_nev"],
  property_hrs: ["property_hrs", "ingatlan_helyrajzi_szam"],
  purchase_price: ["purchase_price", "vetelar"],
  closing_date: ["closing_date", "szerzodes_datuma"],
  possession_date: ["possession_date", "birtokbaadas_datuma"],
  attorney_name: ["attorney_name", "eljaro_ugyved", "ugyved_nev", "jogi_kepviselo_neve"],
  own_funds_amount: ["own_funds_amount", "onero_osszeg"],
  escrow_holder: ["escrow_holder", "letetkezelo_ugyved"],
  registration_consent_release: ["registration_consent_release", "bejegyzesi_engedely_kiadas_feltetele"],
  iny_request_note: ["iny_request_note", "iny_megjegyzes"],
  cash_amount: ["cash_amount", "keszpenz_resz"],
  transfer_amount: ["transfer_amount", "atutalas_resz"],
  advance_amount: ["advance_amount", "eloleg_osszeg"],
  deposit_amount: ["deposit_amount", "foglalo_osszeg"],
  loan_bank: ["loan_bank", "hitelezo_bank"],
  loan_amount: ["loan_amount", "hitel_osszeg"],
  retention_until: ["retention_until", "tulajdonjog_fenntartas_hatarideje"],
  seller_personal_id: ["seller_personal_id", "elado_szemelyi_szam"],
  buyer_personal_id: ["buyer_personal_id", "vevo_szemelyi_szam"],
};

const MAIN_SALE_READINESS_GROUPS = [
  { label: "Eladó adatai", fieldIds: ["seller_name", "seller_birth_name", "seller_mother_name", "seller_birth_place", "seller_birth_date", "seller_address"] },
  { label: "Vevő adatai", fieldIds: ["buyer_name", "buyer_birth_name", "buyer_mother_name", "buyer_birth_place", "buyer_birth_date", "buyer_address"] },
  { label: "Ingatlan adatai", fieldIds: ["property_hrs", "property_zip", "property_city", "property_street", "property_house_number", "property_area", "property_type_name", "property_title_share"] },
  { label: "Tulajdoni lap / földhivatali adatok", fieldIds: ["title_sheet_number", "land_office"] },
  { label: "Vételár és fizetés", fieldIds: ["purchase_price"] },
  { label: "Birtokbaadás", fieldIds: ["possession_date"] },
  { label: "Ügyvédi / okiratszerkesztő adatok", fieldIds: ["contract_location", "closing_date"] },
];

function resolveTemplateForDocument(docId: BundleDocId, templates: ContractTemplateItem[]): ContractTemplateItem | null {
  const resolver = TEMPLATE_RESOLVERS[docId];
  if (!resolver) return null;
  const exactMatch = templates.find(resolver);
  if (exactMatch) return exactMatch;
  if (docId === "main_sale") {
    return templates.find((template) => template.category === "ADASVETEL" && template.isDefault) || null;
  }
  return null;
}

function parseHungarianPropertyAddress(address: string) {
  const trimmed = address.trim();
  const match = trimmed.match(/^(\d{4})\s+([^,]+),\s*(.+)$/);
  if (!match) return { iranyitoszam: "", telepules: "", utca: trimmed, hazszam: "" };
  const [, iranyitoszam, telepules, streetPart] = match;
  const streetMatch = streetPart.match(/^(.*?)(\d+[A-Za-z\/-]*)$/);
  return {
    iranyitoszam,
    telepules: telepules.trim(),
    utca: (streetMatch?.[1] || streetPart).trim(),
    hazszam: (streetMatch?.[2] || "").trim(),
  };
}

type OppositeParty = {
  partyType: "PERSON" | "COMPANY";
  name: string;
  birthDate: string;
  birthName?: string;
  birthPlace?: string;
  motherName?: string;
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function GenerationPageContent({ params }: GenerationPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [uiPack] = useUiPack();
  const isSignalTiles = uiPack === "signal_tiles_console";

  // signal_ops_console palette (dark, dense, operational)
  const s = {
    bg: "bg-slate-900",
    bgAlt: "bg-slate-800",
    bgHover: "hover:bg-slate-700",
    bgCard: "bg-slate-800",
    bgSection: "bg-slate-800",
    text: "text-slate-100",
    textMuted: "text-slate-400",
    textDark: "text-slate-200",
    border: "border-slate-600",
    borderLight: "border-slate-700",
    badge: "bg-slate-700 text-slate-200",
    accent: "text-cyan-400",
    accentBg: "bg-cyan-900 text-cyan-200",
    success: "bg-emerald-900 text-emerald-200",
    warning: "bg-amber-900 text-amber-200",
    danger: "bg-red-900 text-red-200",
    rail: "w-56",
    railBg: "bg-slate-950",
    sectionLabel: "text-[9px] uppercase tracking-[0.3em] text-slate-500",
    cardBorder: "border border-slate-700 hover:border-cyan-700",
    btnCmd: "bg-cyan-900 hover:bg-cyan-800 text-cyan-200 border border-cyan-700",
    btnCmdDisabled: "bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed",
    docCard: "border border-slate-700 hover:border-cyan-700 transition-colors cursor-pointer",
    docCardSelected: "border-cyan-600 bg-cyan-950/40",
    readinessDot: "w-2 h-2 rounded-full shrink-0",
    readinessDotReady: "bg-emerald-400",
    readinessDotDraft: "bg-amber-400",
    readinessDotMissing: "bg-red-400",
    readinessDotBlocked: "bg-slate-600",
  };

  // insight_analytics_light / legal_ops_atelier palette (warm, spacious, editorial)
  const a = {
    bg: "bg-[#fbf9f4]",
    bgAlt: "bg-[#F6F2E8]",
    bgHover: "hover:bg-[#ECE6DA]",
    bgCard: "bg-white",
    bgSection: "bg-[#f5f3ee]",
    text: "text-[#1F2821]",
    textMuted: "text-[#7B776D]",
    textDark: "text-[#514D45]",
    border: "border-[#DDD7CA]",
    borderLight: "border-[#EEE7D9]",
    badge: "bg-[#f5f3ee] text-[#434843]",
    accent: "text-[#C9A227]",
    accentBg: "bg-[#C9A227] text-white",
    success: "bg-[#d1e8d3] text-[#23472F]",
    warning: "bg-[#EEE7D9] text-[#514D45]",
    danger: "bg-[#ffdad6] text-[#ba1a1a]",
    rail: "w-64",
    railBg: "bg-[#F0EBE1]",
    sectionLabel: "text-[9px] uppercase tracking-[0.25em] text-[#9B9478]",
    cardBorder: "border border-[#E6D39A] hover:border-[#C9A227]",
    btnCmd: "bg-[#C9A227] hover:bg-[#B8911F] text-white border border-[#B8911F]",
    btnCmdDisabled: "bg-[#E5E7EB] text-[#9CA3AF] border border-[#E5E7EB] cursor-not-allowed",
    docCard: "border border-[#E6D39A] hover:border-[#C9A227] transition-colors cursor-pointer",
    docCardSelected: "border-[#C9A227] bg-[#FEF9E7]",
    readinessDot: "w-2.5 h-2.5 rounded-full shrink-0",
    readinessDotReady: "bg-[#059669]",
    readinessDotDraft: "bg-[#D97706]",
    readinessDotMissing: "bg-[#DC2626]",
    readinessDotBlocked: "bg-[#9CA3AF]",
  };

  const p = isSignalTiles ? s : a;

  // ─── STATE ───────────────────────────────────────────────────────────────
  const [caseData, setCaseData] = useState<CaseListItem | null>(null);
  const [oppositeParty, setOppositeParty] = useState<OppositeParty>({ partyType: "PERSON", name: "", birthDate: "", birthName: "", birthPlace: "", motherName: "" });
  const [templates, setTemplates] = useState<ContractTemplateItem[]>([]);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [clauseToggles, setClauseToggles] = useState<Record<string, boolean>>({});
  const [activeSection, setActiveSection] = useState<WorkstationSectionId>("bundle");
  const [generatedDoc, setGeneratedDoc] = useState<ContractGenerateResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const [fatalIssues, setFatalIssues] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<Record<BundleDocId, boolean>>({
    main_sale: true, reg_consent: false, escrow_cert: false, own_funds: false, iny_request: false, gift_main: false,
  });
  const [activeDocumentId, setActiveDocumentId] = useState<BundleDocId>("main_sale");
  const [bundleResults, setBundleResults] = useState<Partial<Record<BundleDocId, BundleGenerationResult>>>({});
  const [resolvedGenerationCaseId] = useState<string>(resolvedParams.caseId);
  const [familyOverride, setFamilyOverride] = useState<"auto" | DocumentFamilyId>("auto");
  const [anonymizeModalContract, setAnonymizeModalContract] = useState<{ id: string; title?: string; templateName?: string; revisionNumber?: number; status: string } | null>(null);
  const [rehydrateDoc, setRehydrateDoc] = useState<{ id: string; name: string } | null>(null);
  const [rehydrateModalOpen, setRehydrateModalOpen] = useState(false);

  // ─── DERIVED VALUES (declaration order matters for dependency tracking) ────

  const family = familyOverride === "auto" ? "sale_purchase" : familyOverride;
  const schema = useMemo(() => DOCUMENT_FAMILIES[family as DocumentFamilyId] ?? DOCUMENT_FAMILIES.sale_purchase, [family]);

  const fieldMap = useMemo(() => {
    const map: Record<string, (typeof schema.fields)[0]> = {};
    for (const field of schema.fields) {
      if (!field.documentScope || field.documentScope === activeDocumentId) {
        map[field.id] = field;
      }
    }
    return map;
  }, [schema, schema.fields, activeDocumentId]);

  const resolvedTemplates = useMemo(() => {
    const resolved: Partial<Record<BundleDocId, ContractTemplateItem | null>> = {};
    for (const doc of schema.documents) {
      resolved[doc.id as BundleDocId] = resolveTemplateForDocument(doc.id as BundleDocId, templates);
    }
    return resolved;
  }, [templates, schema.documents]);

  const documentReadiness = useMemo((): Record<BundleDocId, DocumentReadiness> => {
    const result: Partial<Record<BundleDocId, DocumentReadiness>> = {};
    for (const doc of schema.documents) {
      const docId = doc.id as BundleDocId;
      const template = resolvedTemplates[docId] ?? null;
      if (!template) {
        result[docId] = { state: "blocked", label: "Blocked", message: `No template found for "${doc.label}"`, missingFields: [], blockingReasons: ["No template resolved"], draftWarnings: [], canSelect: false, canGenerate: false, template: null };
        continue;
      }
      const requiredFieldIds = doc.requiredFieldIds || [];
      const blockingFieldIds = doc.blockingFieldIds || [];
      const draftFieldIds = doc.draftFieldIds || [];
      const hasRequired = requiredFieldIds.every((fid: string) => {
        const field = fieldMap[fid];
        if (!field) return true;
        return (VARIABLE_ALIASES[field.variableKey] || [field.variableKey]).some((k) => (variableValues[k] || "").trim());
      });
      const hasBlocking = blockingFieldIds.every((fid: string) => {
        const field = fieldMap[fid];
        if (!field) return true;
        return (VARIABLE_ALIASES[field.variableKey] || [field.variableKey]).some((k) => (variableValues[k] || "").trim());
      });
      const hasDraft = draftFieldIds.some((fid: string) => {
        const field = fieldMap[fid];
        if (!field) return false;
        return (VARIABLE_ALIASES[field.variableKey] || [field.variableKey]).some((k) => (variableValues[k] || "").trim());
      });
      const missingFields = requiredFieldIds.filter((fid: string) => {
        const field = fieldMap[fid];
        if (!field) return false;
        return !(VARIABLE_ALIASES[field.variableKey] || [field.variableKey]).some((k) => (variableValues[k] || "").trim());
      });
      const blockingReasons = blockingFieldIds.filter((fid: string) => {
        const field = fieldMap[fid];
        if (!field) return false;
        return !(VARIABLE_ALIASES[field.variableKey] || [field.variableKey]).some((k) => (variableValues[k] || "").trim());
      });
      const draftWarnings = draftFieldIds.filter((fid: string) => {
        const field = fieldMap[fid];
        if (!field) return false;
        return !(VARIABLE_ALIASES[field.variableKey] || [field.variableKey]).some((k) => (variableValues[k] || "").trim());
      });
      const state: DocumentReadinessState = !hasRequired ? "missing_fields" : !hasBlocking ? "blocked" : hasDraft ? "draft_only" : "ready";
      const labels: Record<DocumentReadinessState, DocumentReadiness["label"]> = { ready: "Ready", draft_only: "Draft only", missing_fields: "Missing fields", blocked: "Blocked" };
      const messages: Record<DocumentReadinessState, string> = {
        ready: "All required fields are filled.",
        draft_only: "Ready for draft generation; some optional fields are missing.",
        missing_fields: `${missingFields.length} required field(s) missing.`,
        blocked: `Blocked by ${blockingReasons.length} field(s).`,
      };
      result[docId] = { state, label: labels[state], message: messages[state], missingFields, blockingReasons, draftWarnings, canSelect: true, canGenerate: hasRequired && hasBlocking, template };
    }
    return result as Record<BundleDocId, DocumentReadiness>;
  }, [schema, resolvedTemplates, variableValues, fieldMap]);

  const selectedDocumentIds = useMemo(
    () => Object.entries(selectedDocs).filter(([, v]) => v).map(([d]) => d as BundleDocId),
    [selectedDocs]
  );
  const selectedCount = selectedDocumentIds.length;
  const generatableSelectedDocs = selectedDocumentIds.filter((id) => documentReadiness[id]?.canGenerate);

  const selectedTemplate = useMemo(() => {
    const generatable = selectedDocumentIds.find((docId) => documentReadiness[docId]?.canGenerate);
    return generatable ? documentReadiness[generatable]?.template ?? null : null;
  }, [selectedDocumentIds, documentReadiness]);

  const readinessSections = schema.sections;
  const activeDocumentReadiness = documentReadiness[activeDocumentId];

  // ─── SIDE EFFECTS ──────────────────────────────────────────────────────────

  // Opposite party → variable values
  useEffect(() => {
    if (!caseData || !oppositeParty.name) return;
    const role = (caseData.clientRole || "").toUpperCase();
    const isBuyer = role === "BUYER" || role === "VEVŐ" || role === "VEVO";
    if (isBuyer) {
      setVariableValues((v) => ({ ...v, seller_name: oppositeParty.name }));
    } else {
      setVariableValues((v) => ({ ...v, buyer_name: oppositeParty.name }));
    }
    if (oppositeParty.birthDate) {
      setVariableValues((v) => ({ ...v, [isBuyer ? "seller_birth_date" : "buyer_birth_date"]: oppositeParty.birthDate }));
    }
    if (oppositeParty.birthName && isBuyer) setVariableValues((v) => ({ ...v, seller_birth_name: oppositeParty.birthName ?? "" }));
    if (oppositeParty.birthPlace && isBuyer) setVariableValues((v) => ({ ...v, seller_birth_place: oppositeParty.birthPlace ?? "" }));
    if (oppositeParty.motherName && isBuyer) setVariableValues((v) => ({ ...v, seller_mother_name: oppositeParty.motherName ?? "" }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppositeParty.name, oppositeParty.birthDate, oppositeParty.birthName, oppositeParty.birthPlace, oppositeParty.motherName, caseData?.clientRole]);

  // Fatal issues + warnings
  useEffect(() => {
    const fatal: string[] = [];
    const warn: string[] = [];
    for (const doc of schema.documents) {
      const r = documentReadiness[doc.id as BundleDocId];
      if (!r) continue;
      if (r.state === "blocked") fatal.push(`${doc.label}: ${r.blockingReasons.join(", ") || "blocked"}`);
      if (r.state === "missing_fields") fatal.push(`${doc.label}: ${r.missingFields.join(", ")}`);
      if (r.draftWarnings.length > 0) warn.push(`${doc.label}: draft warnings — ${r.draftWarnings.join(", ")}`);
    }
    if (!caseData) fatal.push("Case data not loaded");
    setFatalIssues(fatal);
    setWarnings(warn);
  }, [caseData, documentReadiness, schema.documents]);

  // Load case + templates + draft
  useEffect(() => {
    getCaseById(resolvedParams.caseId)
      .then((c) => { setCaseData(c); return getContractTemplates(); })
      .then((tpls) => setTemplates(tpls))
      .catch(console.error);

    getGenerationDraft(resolvedParams.caseId)
      .then((draft) => {
        if (!draft) return;
        const first = Array.isArray(draft) ? draft[0] : draft;
        if (first && "documentFamily" in first && "draftData" in first) {
          setFamilyOverride((first as { documentFamily: DocumentFamilyId }).documentFamily);
          const data = (first as { draftData: { selectedDocs?: Record<BundleDocId, boolean>; variableValues?: Record<string, string>; clauseToggles?: Record<string, boolean>; oppositeParty?: OppositeParty } }).draftData;
          if (data.selectedDocs) setSelectedDocs(data.selectedDocs);
          if (data.variableValues) setVariableValues(data.variableValues);
          if (data.clauseToggles) setClauseToggles(data.clauseToggles);
          if (data.oppositeParty) setOppositeParty(data.oppositeParty);
          setWorkspaceMessage("Draft reloaded from server");
        }
      })
      .catch(() => {
        try {
          const stored = localStorage.getItem(`generation-draft:${resolvedParams.caseId}:${familyOverride === "auto" ? "auto" : familyOverride}`);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.variableValues) setVariableValues(parsed.variableValues);
            if (parsed.clauseToggles) setClauseToggles(parsed.clauseToggles);
            if (parsed.selectedDocs) setSelectedDocs(parsed.selectedDocs);
            if (parsed.oppositeParty) setOppositeParty(parsed.oppositeParty);
            setWorkspaceMessage("Draft reloaded from local storage");
          }
        } catch { /* ignore */ }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams.caseId]);

  // ─── HANDLERS ─────────────────────────────────────────────────────────────

  const handleVariableChange = useCallback((key: string, value: string) => {
    setVariableValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleToggle = useCallback((toggleId: string) => {
    setClauseToggles((prev) => ({ ...prev, [toggleId]: !prev[toggleId] }));
  }, []);

  const toggleDocumentSelection = (docId: BundleDocId) => {
    const r = documentReadiness[docId];
    setActiveDocumentId(docId);
    if (!r?.canSelect) return;
    setSelectedDocs((prev) => ({ ...prev, [docId]: !prev[docId] }));
  };

  const buildGenerationPayload = useCallback((docId: BundleDocId, template: ContractTemplateItem): Record<string, string> => {
    const d: Record<string, string> = {};
    const v = variableValues;
    d.seller_name = v.seller_name || v.elado_nev || "";
    d.elado_nev = d.seller_name;
    d.seller_birth_name = v.seller_birth_name || v.elado_szul_nev || "";
    d.elado_szul_nev = d.seller_birth_name;
    d.seller_mother_name = v.seller_mother_name || v.elado_anya_neve || "";
    d.elado_anya_neve = d.seller_mother_name;
    d.seller_birth_place = v.seller_birth_place || v.elado_szul_hely || "";
    d.elado_szul_hely = d.seller_birth_place;
    d.seller_birth_date = v.seller_birth_date || v.elado_szul_ido || "";
    d.elado_szul_ido = d.seller_birth_date;
    d.seller_address = v.seller_address || v.elado_lakcim || "";
    d.elado_lakcim = d.seller_address;
    d.seller_id_card = v.seller_id_card || v.elado_szemelyi_ig || "";
    d.elado_szemelyi_ig = d.elado_szemelyi_ig || "";
    d.seller_personal_id = v.seller_personal_id || v.elado_szemelyi_szam || "";
    d.elado_szemelyi_szam = v.elado_szemelyi_szam || "";
    d.seller_citizenship = v.seller_citizenship || v.elado_allampolgarsag || "";
    d.elado_allampolgarsag = v.elado_allampolgarsag || "";
    d.buyer_name = v.buyer_name || v.vevo_nev || "";
    d.vevo_nev = d.buyer_name;
    d.buyer_birth_name = v.buyer_birth_name || v.vevo_szul_nev || "";
    d.vevo_szul_nev = d.buyer_birth_name;
    d.buyer_mother_name = v.buyer_mother_name || v.vevo_anya_neve || "";
    d.vevo_anya_neve = d.buyer_mother_name;
    d.buyer_birth_place = v.buyer_birth_place || v.vevo_szul_hely || "";
    d.vevo_szul_hely = d.buyer_birth_place;
    d.buyer_birth_date = v.buyer_birth_date || v.vevo_szul_ido || "";
    d.vevo_szul_ido = d.buyer_birth_date;
    d.buyer_address = v.buyer_address || v.vevo_lakcim || "";
    d.vevo_lakcim = d.buyer_address;
    d.buyer_id_card = v.buyer_id_card || v.vevo_szemelyi_ig || "";
    d.vevo_szemelyi_ig = d.vevo_szemelyi_ig || "";
    d.buyer_personal_id = v.buyer_personal_id || v.vevo_szemelyi_szam || "";
    d.vevo_szemelyi_szam = v.vevo_szemelyi_szam || "";
    d.buyer_citizenship = v.buyer_citizenship || v.vevo_allampolgarsag || "";
    d.vevo_allampolgarsag = v.vevo_allampolgarsag || "";
    const addr = v.property_address || v.property_hrs || "";
    const parsed = parseHungarianPropertyAddress(addr);
    d.property_hrs = d.property_hrs || v.property_hrs || parsed.hazszam || "";
    d.ingatlan_helyrajzi_szam = d.ingatlan_helyrajzi_szam || v.ingatlan_helyrajzi_szam || parsed.hazszam || "";
    d.ingatlan_iranyitoszam = d.ingatlan_iranyitoszam || v.ingatlan_iranyitoszam || parsed.iranyitoszam || "";
    d.ingatlan_telepules = d.ingatlan_telepules || v.ingatlan_telepules || parsed.telepules || "";
    d.ingatlan_utca = d.ingatlan_utca || v.ingatlan_utca || parsed.utca || "";
    d.ingatlan_hazszam = d.ingatlan_hazszam || v.ingatlan_hazszam || parsed.hazszam || "";
    d.property_address = d.property_address || v.property_address || addr;
    d.property_zip = d.property_zip || v.property_zip || parsed.iranyitoszam || "";
    d.property_city = d.property_city || v.property_city || parsed.telepules || "";
    d.property_street = d.property_street || v.property_street || parsed.utca || "";
    d.property_house_number = d.property_house_number || v.property_house_number || parsed.hazszam || "";
    d.property_floor_door = v.property_floor_door || "";
    d.ingatlan_alapterulet = v.ingatlan_alapterulet || "";
    d.ingatlan_tipus_neve = v.ingatlan_tipus_neve || "";
    d.ingatlan_tulajdoni_hanyad = v.ingatlan_tulajdoni_hanyad || "";
    d.belterulet = v.belterulet || "";
    d.ingatlan_fekves = v.ingatlan_fekves || "";
    d.tulajdoni_lap_sorszam = v.tulajdoni_lap_sorszam || "";
    d.kormanyhivatal = v.kormanyhivatal || "";
    d.kozos_tulajdoni_hanyad = v.kozos_tulajdoni_hanyad || "";
    d.lien_bank_name = v.lien_bank_name || "";
    d.preemption_holder = v.preemption_holder || "";
    d.purchase_price = v.purchase_price || v.vetelar || "";
    d.vetelar = v.vetelar || "";
    d.cash_amount = v.cash_amount || "";
    d.transfer_amount = v.transfer_amount || "";
    d.advance_amount = v.advance_amount || "";
    d.deposit_amount = v.deposit_amount || "";
    d.loan_bank = v.loan_bank || "";
    d.loan_amount = v.loan_amount || "";
    d.own_funds_amount = v.own_funds_amount || "";
    d.retention_until = v.retention_until || "";
    d.possession_date = v.possession_date || v.birtokbaadas_datuma || "";
    d.birtokbaadas_datuma = v.birtokbaadas_datuma || "";
    d.utility_transfer_deadline = v.utility_transfer_deadline || "";
    d.duty_notes = v.duty_notes || "";
    d.szerzodes_helye = v.szerzodes_helye || v.contract_location || "";
    d.contract_location = v.contract_location || "";
    d.attorney_name = v.attorney_name || "";
    d.closing_date = v.closing_date || v.szerzodes_datuma || "";
    d.szerzodes_datuma = v.szerzodes_datuma || "";
    d.ugyved_nev = v.ugyved_nev || v.attorney_name || "";
    d.ugyvedi_iroda_neve = v.ugyvedi_iroda_neve || "";
    d.ugyvedi_iroda_szekhelye = v.ugyvedi_iroda_szekhelye || "";
    d.ugyvedi_iroda_tarhely = v.ugyvedi_iroda_tarhely || "";
    d.ugyved_kasz = v.ugyved_kasz || "";
    d.jogi_kepviselo_neve = v.jogi_kepviselo_neve || "";
    d.jogi_kepviselo_szekhelye = v.jogi_kepviselo_szekhelye || "";
    d.jogi_kepviselo_tarhely = v.jogi_kepviselo_tarhely || "";
    d.onero_osszeg = v.onero_osszeg || v.own_funds_amount || "";
    d.onero_osszeg_szam = v.onero_osszeg_szam || v.own_funds_amount || "";
    d.onero_osszeg_betu = v.onero_osszeg_betu || "";
    d.letetkezelo_ugyved = v.letetkezelo_ugyved || v.escrow_holder || "";
    d.bejegyzesi_engedely_kiadas_feltetele = v.bejegyzesi_engedely_kiadas_feltetele || v.registration_consent_release || "";
    d.bejegyzesi_engedely_peldanyszam = v.bejegyzesi_engedely_peldanyszam || "";
    d.bejegyzesi_engedely_benyujtasi_hatarido_nap = v.bejegyzesi_engedely_benyujtasi_hatarido_nap || "";
    d.ellenjegyzes_datuma = v.ellenjegyzes_datuma || v.closing_date || "";
    d.ellenjegyzes_helye = v.ellenjegyzes_helye || v.szerzodes_helye || "";
    d.adasveteli_szerzodes_datuma = v.adasveteli_szerzodes_datuma || v.closing_date || "";
    d.elado_adoazonosito_jel = v.elado_adoazonosito_jel || "";
    d.vevo1_adoazonosito_jel = v.vevo1_adoazonosito_jel || "";
    d.vevo2_adoazonosito_jel = v.vevo2_adoazonosito_jel || "";
    d.vevo1_nev = v.vevo1_nev || v.buyer_name || "";
    d.vevo1_szul_nev = v.vevo1_szul_nev || v.vevo_szul_nev || "";
    d.vevo1_szul_hely = v.vevo1_szul_hely || v.vevo_szul_hely || "";
    d.vevo1_szul_ido = v.vevo1_szul_ido || v.vevo_szul_ido || "";
    d.vevo1_anya_neve = v.vevo1_anya_neve || v.vevo_anya_neve || "";
    d.vevo1_lakcim = v.vevo1_lakcim || v.vevo_lakcim || "";
    d.vevo1_szemelyi_ig = v.vevo1_szemelyi_ig || v.vevo_szemelyi_ig || "";
    d.vevo1_szemelyi_szam = v.vevo1_szemelyi_szam || v.vevo_szemelyi_szam || "";
    d.vevo1_allampolgarsag = v.vevo1_allampolgarsag || v.vevo_allampolgarsag || "";
    d.vevo1_tulajdoni_hanyad = v.vevo1_tulajdoni_hanyad || v.ingatlan_tulajdoni_hanyad || "";
    d.vevo2_nev = v.vevo2_nev || "";
    d.vevo2_szul_nev = v.vevo2_szul_nev || "";
    d.vevo2_szul_hely = v.vevo2_szul_hely || "";
    d.vevo2_szul_ido = v.vevo2_szul_ido || "";
    d.vevo2_anya_neve = v.vevo2_anya_neve || "";
    d.vevo2_lakcim = v.vevo2_lakcim || "";
    d.vevo2_szemelyi_ig = v.vevo2_szemelyi_ig || "";
    d.vevo2_szemelyi_szam = v.vevo2_szemelyi_szam || "";
    d.vevo2_allampolgarsag = v.vevo2_allampolgarsag || "";
    d.vevo2_tulajdoni_hanyad = v.vevo2_tulajdoni_hanyad || "";
    d.leteti_hivatkozas_pontja = v.leteti_hivatkozas_pontja || "";
    d.onero_hivatkozas_pontja = v.onero_hivatkozas_pontja || "";
    d.kerelem_helye = v.kerelem_helye || v.szerzodes_helye || "";
    d.kerelem_datuma = v.kerelem_datuma || v.closing_date || "";
    d.kerelem_targya = v.kerelem_targya || "";
    d.ingatlan_nyilvantartasi_iktatoszam = v.ingatlan_nyilvantartasi_iktatoszam || "";
    d.kerelmezo1_nev = v.kerelmezo1_nev || v.vevo1_nev || v.buyer_name || "";
    d.kerelmezo1_szul_nev = v.kerelmezo1_szul_nev || v.vevo1_szul_nev || v.vevo_szul_nev || "";
    d.kerelmezo1_adoazonosito_jel = v.kerelmezo1_adoazonosito_jel || v.vevo1_adoazonosito_jel || "";
    d.kerelmezo1_szemelyi_azonosito = v.kerelmezo1_szemelyi_azonosito || v.vevo1_szemelyi_szam || v.vevo_szemelyi_szam || "";
    d.kerelmezo2_nev = v.kerelmezo2_nev || v.vevo2_nev || "";
    d.kerelmezo2_szul_nev = v.kerelmezo2_szul_nev || v.vevo2_szul_nev || "";
    d.kerelmezo2_adoazonosito_jel = v.kerelmezo2_adoazonosito_jel || v.vevo2_adoazonosito_jel || "";
    d.kerelmezo2_szemelyi_azonosito = v.kerelmezo2_szemelyi_azonosito || v.vevo2_szemelyi_szam || "";
    d.kerelmezo3_nev = v.kerelmezo3_nev || "";
    d.kerelmezo3_szul_nev = v.kerelmezo3_szul_nev || "";
    d.kerelmezo3_adoazonosito_jel = v.kerelmezo3_adoazonosito_jel || "";
    d.kerelmezo3_szemelyi_azonosito = v.kerelmezo3_szemelyi_azonosito || "";
    d.mellekletek_felsorolasa = v.mellekletek_felsorolasa || "";
    d.igazgatasi_szolgaltatasi_dij = v.igazgatasi_szolgaltatasi_dij || "";
    d.ingatlan_dij = v.ingatlan_dij || "";
    d.fizetesi_mod = v.fizetesi_mod || "";
    d.mentesseg_jogalapja = v.mentesseg_jogalapja || "";
    d.mezogazdasagi_jovahagyas_nyilatkozat = v.mezogazdasagi_jovahagyas_nyilatkozat || "";
    d.soron_kivuli_igenyles = v.soron_kivuli_igenyles || "";
    d.egyeb_megjegyzes = v.egyeb_megjegyzes || v.iny_request_note || "";
    (template.variables || []).forEach((variable) => {
      const def = typeof (variable as unknown as { defaultValue?: string }).defaultValue === "string" ? (variable as unknown as { defaultValue: string }).defaultValue : undefined;
      if (d[variable.name] === undefined) d[variable.name] = def || "";
    });
    d.bundle_document_id = docId;
    return d;
  }, [variableValues]);

  const handleGenerate = async (documents: BundleDocId[]) => {
    if (!documents.length) return;
    setIsGenerating(true);
    setWorkspaceMessage(null);
    const results: Partial<Record<BundleDocId, BundleGenerationResult>> = {};
    try {
      for (const doc of documents) {
        const readiness = documentReadiness[doc];
        const template = readiness?.template;
        if (!readiness?.canGenerate || !template) {
          results[doc] = { status: "skipped", message: readiness?.message || "A dokumentum jelenleg nem generálható" };
          continue;
        }
        try {
          const payload = {
            templateId: template.id,
            caseId: resolvedGenerationCaseId,
            title: `${caseData?.title || ""} - ${new Date().toLocaleDateString()} - ${bundleDocs[doc]}`,
            data: buildGenerationPayload(doc, template),
          };
          const result = await generateContract(payload);
          if (result.success) {
            setGeneratedDoc(result);
            results[doc] = { status: "generated", message: result.document?.fileName || `${bundleDocs[doc]} elkészült`, document: result.document };
          } else {
            results[doc] = { status: "failed", message: result.error || "Generation failed" };
          }
        } catch (error) {
          results[doc] = { status: "failed", message: (error as Error).message || "Generation failed" };
        }
      }
      const g = Object.values(results).filter((item) => item?.status === "generated").length;
      const s = Object.values(results).filter((item) => item?.status === "skipped").length;
      const f = Object.values(results).filter((item) => item?.status === "failed").length;
      setBundleResults(results);
      setWorkspaceMessage(`Generated: ${g} · Skipped: ${s} · Failed: ${f}`);
      const pref = results[activeDocumentId]?.status === "generated" ? results[activeDocumentId]?.document : Object.values(results).find((item) => item?.status === "generated")?.document;
      if (pref?.id) {
        setTimeout(() => { router.push(`/cases/${resolvedGenerationCaseId}/review/${pref.id}`); }, 450);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDraft = async () => {
    setIsDraftSaving(true);
    try {
      await saveGenerationDraft({
        caseId: resolvedGenerationCaseId,
        templateId: selectedTemplate?.id || undefined,
        templateName: selectedTemplate?.name || undefined,
        documentFamily: schema.id,
        draftData: { selectedDocs, variableValues, clauseToggles, oppositeParty },
      });
      setWorkspaceMessage("Draft saved to server for this case workstation");
    } catch {
      try {
        localStorage.setItem(`generation-draft:${resolvedGenerationCaseId}:${schema.id}`, JSON.stringify({ selectedDocs, variableValues, clauseToggles, oppositeParty, templateId: selectedTemplate?.id || null, savedAt: new Date().toISOString() }));
        setWorkspaceMessage("Draft saved locally (server save failed)");
      } catch {
        setWorkspaceMessage("Failed to save draft");
      }
    } finally {
      setIsDraftSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!selectedTemplate) return;
    setIsPreviewing(true);
    try {
      const payload = {
        templateId: selectedTemplate.id,
        caseId: resolvedGenerationCaseId,
        title: `${caseData?.title || ""} — Preview — ${selectedTemplate.name}`,
        data: buildGenerationPayload(activeDocumentId, selectedTemplate),
      };
      const result = await previewContract(payload);
      if (result.success && result.preview?.base64Content) {
        const byteChars = atob(result.preview.base64Content);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        window.open(URL.createObjectURL(blob), "_blank");
      }
    } catch (err) {
      setWorkspaceMessage("Preview failed: " + (err as Error).message);
    } finally {
      setIsPreviewing(false);
    }
  };

  if (!caseData) {
    return (
      <div className={`flex-1 flex items-center justify-center ${p.bg}`}>
        <div className="text-center">
          <p className={`text-lg ${p.textMuted}`}>Case not found</p>
          <button onClick={() => router.push("/cases")} className={`mt-4 px-4 py-2 rounded font-medium transition-colors ${isSignalTiles ? "bg-cyan-900 text-cyan-200 hover:bg-cyan-800" : "bg-[#C9A227] text-white hover:bg-[#B8911F]"}`}>
            Back to Cases
          </button>
        </div>
      </div>
    );
  }

  // ─── SIGNAL_OPS_CONSOLE LAYOUT ────────────────────────────────────────────
  // Dense operational workstation: compact controls, status-forward, command-heavy

  const signalLeftRail = (
    <nav className={`flex flex-col h-full ${p.railBg} ${isSignalTiles ? "" : ""}`}>
      {/* Case context header */}
      <div className={`p-3 border-b ${isSignalTiles ? "border-[#1E293B]" : "border-[#E2E8F0]"}`}>
        <p className={`${p.sectionLabel} mb-1`}>Case</p>
        <p className={`text-[11px] font-semibold leading-tight ${p.text}`}>{caseData?.title || "Case data unavailable"}</p>
        <p className={`text-[10px] mt-0.5 ${p.textMuted}`}>{caseData?.caseNumber || resolvedParams.caseId}</p>
        {caseData?.clientName && <p className={`text-[10px] mt-1 ${p.textMuted}`}>Ügyfél: {caseData.clientName}</p>}
      </div>

      {/* Document family selector */}
      <div className={`p-3 border-b ${isSignalTiles ? "border-[#1E293B]" : "border-[#E2E8F0]"}`}>
        <label className={`${p.sectionLabel} block mb-1`}>Family</label>
        <select value={familyOverride} onChange={(e) => setFamilyOverride(e.target.value as "auto" | DocumentFamilyId)} className={`w-full h-8 border px-2 text-[11px] focus:outline-none focus:ring-1 ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-300 focus:border-cyan-500" : "border-[#E2E8F0] bg-white text-[#1F2821] focus:border-[#C9A227]"}`}>
          <option value="auto">Auto ({family})</option>
          <option value="sale_purchase">sale_purchase</option>
          <option value="gift_usufruct">gift_usufruct</option>
          <option value="standalone_registration">standalone_registration</option>
        </select>
      </div>

      {/* Document selector — compact list */}
      <div className="flex-1 overflow-y-auto p-2">
        <p className={`${p.sectionLabel} px-2 py-1`}>Documents</p>
        {schema.documents.map((doc) => {
          const readiness = documentReadiness[doc.id as BundleDocId];
          const isSelected = activeDocumentId === doc.id;
          const dotColor = readiness?.state === "ready" ? p.readinessDotReady : readiness?.state === "draft_only" ? p.readinessDotDraft : readiness?.state === "missing_fields" ? p.readinessDotMissing : p.readinessDotBlocked;
          return (
            <button
              key={doc.id}
              onClick={() => { setActiveDocumentId(doc.id as BundleDocId); setActiveSection("bundle"); }}
              className={`w-full text-left px-2 py-1.5 text-[11px] rounded transition-all flex items-center gap-2 ${isSelected ? (isSignalTiles ? "bg-[#16253D] border border-[#243B63] text-slate-100" : "bg-[#FEF9E7] border border-[#C9A227] text-[#1F2821]") : `${p.textMuted} ${p.bgHover}`}`}>
              <span className={`${p.readinessDot} ${dotColor}`} />
              <span className="truncate">{doc.label}</span>
              {selectedDocs[doc.id as BundleDocId] && <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded ${isSignalTiles ? "bg-cyan-900 text-cyan-300" : "bg-[#C9A227] text-white"}`}>ON</span>}
            </button>
          );
        })}
      </div>

      {/* Section navigation — tight */}
      <div className={`p-2 border-t ${isSignalTiles ? "border-[#1E293B]" : "border-[#E2E8F0]"}`}>
        <p className={`${p.sectionLabel} px-2 py-1`}>Section</p>
        <div className="space-y-0.5 max-h-36 overflow-y-auto">
          {readinessSections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${activeSection === section.id ? (isSignalTiles ? "bg-[#16253D] text-cyan-300 border border-[#243B63]" : "bg-[#FEF9E7] text-[#1F2821] border border-[#C9A227]") : `${p.textMuted} hover:${p.text}`}`}>
              {section.label}
            </button>
          ))}
        </div>
      </div>

      {/* Back link */}
      <div className={`p-2 border-t ${isSignalTiles ? "border-[#1E293B]" : "border-[#E2E8F0]"}`}>
        <button onClick={() => router.push(`/cases/${resolvedGenerationCaseId}`)} className={`w-full text-left px-2 py-1.5 text-[11px] rounded flex items-center gap-1.5 ${p.textMuted} ${p.bgHover}`}>
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          Back to Case
        </button>
      </div>
    </nav>
  );

  const signalCenterContent = (
    <div className="flex-1 overflow-y-auto">
      {activeSection === "bundle" ? (
        <div className="p-6 space-y-4">
          {/* Compact header row */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[9px] uppercase tracking-[0.35em] px-2 py-1 ${isSignalTiles ? "bg-[#16253D] text-slate-400 border border-[#1E293B]" : "bg-[#ECE6DA] text-[#7B776D]"}`}>Case Document Preparation</span>
                <span className={`text-[9px] uppercase tracking-[0.25em] px-2 py-1 border ${isSignalTiles ? "bg-[#0F172A] text-slate-400 border-[#1E293B]" : "bg-[#FEF9E7] text-[#1F2821] border-[#E6D39A]"}`}>{selectedCount} selected</span>
              </div>
              <h1 className={`text-xl font-serif ${p.text}`}>{schema.label}</h1>
            </div>
          </div>

          {/* Dense document card grid */}
          <div className="grid grid-cols-2 gap-2">
            {schema.documents.map((doc) => {
              const readiness = documentReadiness[doc.id as BundleDocId];
              const isSelected = selectedDocs[doc.id as BundleDocId];
              const isDisabled = !readiness?.canSelect;
              const badgeClass = readiness?.state === "ready" ? (isSignalTiles ? "bg-emerald-900/60 text-emerald-300" : "bg-[#ECFDF5] text-[#059669]") : readiness?.state === "draft_only" ? (isSignalTiles ? "bg-amber-900/60 text-amber-300" : "bg-[#FFFBEB] text-[#D97706]") : readiness?.state === "missing_fields" ? (isSignalTiles ? "bg-red-900/60 text-red-300" : "bg-[#FEF2F2] text-[#DC2626]") : (isSignalTiles ? "bg-slate-800 text-slate-500" : "bg-[#F9FAFB] text-[#9CA3AF]");
              return (
                <Card key={doc.id} uiPack={uiPack} emphasis={isSelected ? "primary" : "secondary"} className={`${p.docCard} ${isSelected ? p.docCardSelected : ""} ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}>
                  <button onClick={() => toggleDocumentSelection(doc.id as BundleDocId)} disabled={isDisabled} className="w-full text-left p-3">
                    <div className="flex items-start justify-between mb-2">
                      <p className={`text-[12px] font-semibold ${p.text}`}>{doc.label}</p>
                      <span className={`text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded font-bold shrink-0 ml-2 ${isDisabled ? (isSignalTiles ? "bg-slate-800 text-slate-600" : "bg-[#E5E7EB] text-[#9CA3AF]") : isSelected ? (isSignalTiles ? "bg-cyan-900 text-cyan-200" : "bg-[#C9A227] text-white") : (isSignalTiles ? "bg-slate-800 text-slate-400" : "bg-[#E5E7EB] text-[#6B7280]")}`}>
                        {isDisabled ? "OFF" : isSelected ? "ON" : "OFF"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`${p.readinessDot} ${readiness?.state === "ready" ? p.readinessDotReady : readiness?.state === "draft_only" ? p.readinessDotDraft : readiness?.state === "missing_fields" ? p.readinessDotMissing : p.readinessDotBlocked}`} />
                      <span className={`text-[10px] ${p.textMuted}`}>{readiness?.label || "Unknown"}</span>
                    </div>
                    <p className={`text-[10px] ${p.textMuted}`}>{doc.dependencyNote}</p>
                    <p className={`text-[9px] mt-1 ${isSignalTiles ? "text-slate-600" : "text-[#9C9890]"}`}>{readiness?.message}</p>
                  </button>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-4">
          <div>
            <h1 className={`text-lg font-serif ${p.text}`}>{readinessSections.find((s) => s.id === activeSection)?.label || activeSection}</h1>
            <p className={`text-[10px] mt-0.5 ${p.textMuted}`}>{schema.label} · Section {readinessSections.findIndex((s) => s.id === activeSection) + 1} of {readinessSections.length}</p>
          </div>
          <SectionBlock title={readinessSections.find((s) => s.id === activeSection)?.label || ""} subtitle={`Family: ${schema.id} · Document: ${bundleDocs[activeDocumentId] || activeDocumentId}`} uiPack={uiPack}>
            <div className="space-y-3">
              {schema.fields.filter((field) => field.section === activeSection).filter((field) => !field.dependsOnToggle || clauseToggles[field.dependsOnToggle]).map((field) => (
                <div key={field.id} className="grid gap-1">
                  <label className={`text-[10px] uppercase tracking-[0.15em] flex items-center gap-1 ${p.textMuted}`}>
                    {field.label}
                    {field.required && <span className={isSignalTiles ? "text-red-400" : "text-[#DC2626]"}>*</span>}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea value={variableValues[field.variableKey] || ""} onChange={(e) => handleVariableChange(field.variableKey, e.target.value)} className={`w-full border px-2 py-1.5 text-[11px] resize-none focus:outline-none focus:ring-1 ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#E2E8F0] bg-[#FAF8F2] text-[#1F2821] focus:border-[#C9A227]"}`} rows={2} />
                  ) : (
                    <input type={field.type === "number" ? "number" : field.type} value={variableValues[field.variableKey] || ""} onChange={(e) => handleVariableChange(field.variableKey, e.target.value)} className={`w-full h-8 border px-2 text-[11px] focus:outline-none focus:ring-1 ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#E2E8F0] bg-[#FAF8F2] text-[#1F2821] focus:border-[#C9A227]"}`} />
                  )}
                </div>
              ))}
            </div>
          </SectionBlock>
          {activeSection === "parties" && family === "sale_purchase" && activeDocumentId === "main_sale" && (
            <SectionBlock title="Ellenjegyző fél — Auto-fill" subtitle="Auto-fills the opposite party fields" uiPack={uiPack}>
              <div className={`p-3 border border-dashed rounded ${isSignalTiles ? "border-cyan-800 bg-cyan-950/30" : "border-[#C9A227] bg-amber-50"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`${p.sectionLabel}`}>{caseData?.clientRole && (caseData.clientRole.toUpperCase() === "BUYER" || caseData.clientRole.toUpperCase() === "VEVŐ" || caseData.clientRole.toUpperCase() === "VEVO") ? "Ellenjegyző fél (Eladó)" : "Ellenjegyző fél (Vevő)"}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="oppPartyType" value="PERSON" checked={oppositeParty.partyType === "PERSON"} onChange={() => setOppositeParty((p) => ({ ...p, partyType: "PERSON" }))} className={`w-3 h-3 ${isSignalTiles ? "accent-cyan-400" : "accent-[#C9A227]"}`} />
                      <span className={`text-[11px] ${p.text}`}>Személy</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="oppPartyType" value="COMPANY" checked={oppositeParty.partyType === "COMPANY"} onChange={() => setOppositeParty((p) => ({ ...p, partyType: "COMPANY" }))} className={`w-3 h-3 ${isSignalTiles ? "accent-cyan-400" : "accent-[#C9A227]"}`} />
                      <span className={`text-[11px] ${p.text}`}>Cég</span>
                    </label>
                  </div>
                  <input type="text" placeholder={oppositeParty.partyType === "PERSON" ? "pl. Kovács János" : "pl. Kft."} value={oppositeParty.name} onChange={(e) => setOppositeParty((p) => ({ ...p, name: e.target.value }))} className={`w-full px-2 py-1.5 text-[11px] border rounded focus:outline-none ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#DDD7CA] bg-white text-[#1F2821] focus:border-[#C9A227]"}`} />
                  {oppositeParty.partyType === "PERSON" && (
                    <>
                      <input type="date" value={oppositeParty.birthDate} onChange={(e) => setOppositeParty((p) => ({ ...p, birthDate: e.target.value }))} className={`w-full px-2 py-1.5 text-[11px] border rounded focus:outline-none ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#DDD7CA] bg-white text-[#1F2821] focus:border-[#C9A227]"}`} />
                      <input type="text" placeholder="Születési név (opcionális)" value={oppositeParty.birthName || ""} onChange={(e) => setOppositeParty((p) => ({ ...p, birthName: e.target.value }))} className={`w-full px-2 py-1.5 text-[11px] border rounded focus:outline-none ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#DDD7CA] bg-white text-[#1F2821] focus:border-[#C9A227]"}`} />
                    </>
                  )}
                </div>
              </div>
            </SectionBlock>
          )}
          {activeSection === "title" && (
            <SectionBlock title="Záradékok és opciók" uiPack={uiPack}>
              <div className="space-y-1.5">
                {schema.toggles.filter((t) => t.section === "title").map((toggle) => (
                  <button key={toggle.id} onClick={() => handleToggle(toggle.id)} className={`px-3 py-1.5 rounded border text-[11px] ${clauseToggles[toggle.id] ? (isSignalTiles ? "border-emerald-500 bg-emerald-950/40 text-emerald-300" : "border-[#10B981] bg-[#F0FDF4] text-[#059669]") : (isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-300" : "border-[#DDD7CA] bg-white text-[#1F2821]")}`}>
                    {toggle.label}
                  </button>
                ))}
              </div>
            </SectionBlock>
          )}
        </div>
      )}
    </div>
  );

  const signalRightRail = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Readiness — command alert style */}
        <SectionBlock title="Readiness" uiPack={uiPack}>
          {workspaceMessage && (
            <div className={`mb-2 rounded p-2 text-[10px] ${isSignalTiles ? "bg-cyan-950/50 border border-cyan-800 text-cyan-300" : "bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8]"}`}>
              <p>{workspaceMessage}</p>
            </div>
          )}
          {fatalIssues.length > 0 ? (
            <div className={`rounded p-2 ${isSignalTiles ? "bg-red-950/50 border border-red-800" : "bg-[#FEF2F2] border border-[#FECACA]"}`}>
              <p className={`text-[9px] mb-1 ${isSignalTiles ? "text-red-400" : "text-[#DC2626]"}`}>BLOCKING</p>
              {fatalIssues.map((issue) => <p key={issue} className={`text-[10px] ${isSignalTiles ? "text-red-300" : "text-[#DC2626]"}`}>• {issue}</p>)}
            </div>
          ) : warnings.length > 0 ? (
            <div className={`rounded p-2 ${isSignalTiles ? "bg-amber-950/50 border border-amber-800" : "bg-[#FFFBEB] border border-[#FDE68A]"}`}>
              <p className={`text-[9px] mb-1 ${isSignalTiles ? "text-amber-400" : "text-[#F59E0B]"}`}>WARNINGS</p>
              {warnings.map((warning) => <p key={warning} className={`text-[10px] ${isSignalTiles ? "text-amber-300" : "text-[#F59E0B]"}`}>• {warning}</p>)}
            </div>
          ) : (
            <p className={`text-[10px] ${isSignalTiles ? "text-emerald-400" : "text-[#059669]"}`}>✓ No blocking issues</p>
          )}
          {activeDocumentReadiness && (
            <div className={`mt-2 rounded p-2 ${isSignalTiles ? "border border-[#1E293B] bg-[#0F172A]" : "border border-[#E2E8F0] bg-[#FAF8F2]"}`}>
              <p className={`${p.sectionLabel} mb-1`}>Active · {bundleDocs[activeDocumentId as BundleDocId] || activeDocumentId}</p>
              <p className={`text-[10px] ${p.text}`}>State: {activeDocumentReadiness.label}</p>
              <p className={`text-[9px] mt-0.5 ${p.textMuted}`}>{activeDocumentReadiness.message}</p>
            </div>
          )}
        </SectionBlock>

        {/* Selected docs list — compact */}
        <SectionBlock title={`Selected (${selectedCount})`} uiPack={uiPack}>
          {selectedCount === 0 ? (
            <p className={`text-[10px] ${p.textMuted}`}>No documents selected</p>
          ) : (
            <div className="space-y-1">
              {selectedDocumentIds.map((docId) => {
                const r = documentReadiness[docId];
                return (
                  <div key={docId} className={`flex items-center justify-between text-[10px] p-1.5 rounded ${isSignalTiles ? "bg-[#0F172A]" : "bg-[#FAF8F2]"}`}>
                    <span className={p.text}>{bundleDocs[docId] || docId}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${r?.canGenerate ? (isSignalTiles ? "bg-emerald-900/60 text-emerald-300" : "bg-[#ECFDF5] text-[#059669]") : (isSignalTiles ? "bg-red-900/60 text-red-300" : "bg-[#FEF2F2] text-[#DC2626]")}`}>
                      {r?.label || "?"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionBlock>

        {/* Command actions */}
        <SectionBlock title="Commands" uiPack={uiPack}>
          <div className="space-y-1.5">
            <button onClick={handleDraft} disabled={isDraftSaving} className={`w-full py-2 px-3 rounded text-[11px] font-medium border transition-colors ${isDraftSaving ? p.btnCmdDisabled : (isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-300 hover:bg-[#16253D]" : "border-[#DDD7CA] bg-white text-[#514D45] hover:bg-[#ECE6DA]")}`}>
              {isDraftSaving ? "Saving..." : "Save Draft"}
            </button>
            <button onClick={handlePreview} disabled={!selectedTemplate || isPreviewing} className={`w-full py-2 px-3 rounded text-[11px] font-medium border transition-colors ${selectedTemplate ? p.btnCmd : p.btnCmdDisabled}`}>
              {isPreviewing ? "Previewing..." : "Preview"}
            </button>
            <button onClick={() => handleGenerate(generatableSelectedDocs)} disabled={generatableSelectedDocs.length === 0 || isGenerating || fatalIssues.length > 0} className={`w-full py-2 px-3 rounded text-[11px] font-bold border transition-colors ${generatableSelectedDocs.length > 0 && fatalIssues.length === 0 && !isGenerating ? p.btnCmd : p.btnCmdDisabled}`}>
              {isGenerating ? "Generating..." : `Generate (${generatableSelectedDocs.length})`}
            </button>
          </div>
          {bundleResults && Object.keys(bundleResults).length > 0 && (
            <div className={`mt-2 p-2 rounded border text-[10px] space-y-0.5 ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A]" : "border-[#E2E8F0] bg-[#FAF8F2]"}`}>
              <p className={`font-semibold ${p.text}`}>Results</p>
              {Object.entries(bundleResults).map(([docId, result]) => (
                <div key={docId} className="flex items-start gap-1.5">
                  <span className={result?.status === "generated" ? (isSignalTiles ? "text-emerald-400" : "text-[#059669]") : result?.status === "skipped" ? (isSignalTiles ? "text-amber-400" : "text-[#D97706]") : (isSignalTiles ? "text-red-400" : "text-[#DC2626]")}>•</span>
                  <span className={p.textMuted}>{bundleDocs[docId as BundleDocId] || docId}: {result?.message}</span>
                </div>
              ))}
            </div>
          )}
        </SectionBlock>
      </div>
    </div>
  );

  // ─── INSIGHT_ANALYTICS_LIGHT LAYOUT ─────────────────────────────────────────

  const insightLeftRail = (
    <nav className={`flex flex-col h-full ${p.railBg}`}>
      <div className={`p-5 border-b ${isSignalTiles ? "border-[#1E293B]" : "border-[#E2E8F0]"}`}>
        <p className={`${p.sectionLabel} mb-2`}>Ügyfél munkaterület</p>
        <h2 className={`text-sm font-serif font-semibold leading-tight ${p.text}`}>{caseData?.title || "Case data unavailable"}</h2>
        <p className={`text-[10px] mt-1.5 ${p.textMuted}`}>{caseData?.caseNumber || resolvedParams.caseId}</p>
        {caseData?.clientName && <p className={`text-[10px] mt-1 ${p.textMuted}`}>Ügyfél: {caseData.clientName}</p>}
        {caseData?.clientRole && <p className={`text-[10px] mt-0.5 ${p.textMuted}`}>Szerepkör: {caseData.clientRole}</p>}
      </div>

      <div className={`p-4 border-b ${isSignalTiles ? "border-[#1E293B]" : "border-[#E2E8F0]"}`}>
        <label className={`${p.sectionLabel} block mb-2`}>Dokumentum család</label>
        <select value={familyOverride} onChange={(e) => setFamilyOverride(e.target.value as "auto" | DocumentFamilyId)} className={`w-full h-9 border px-3 text-xs focus:outline-none focus:ring-1 ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-300 focus:border-cyan-500" : "border-[#E2E8F0] bg-white text-[#1F2821] focus:border-[#C9A227]"}`}>
          <option value="auto">Automatikus ({family})</option>
          <option value="sale_purchase">Adásvétel (sale_purchase)</option>
          <option value="gift_usufruct">Ajándékozás (gift_usufruct)</option>
          <option value="standalone_registration">Önálló bejegyzés</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <p className={`${p.sectionLabel} px-2 py-2`}>Dokumentumok</p>
        <div className="space-y-1">
          {schema.documents.map((doc) => {
            const readiness = documentReadiness[doc.id as BundleDocId];
            const isSelected = activeDocumentId === doc.id;
            const dotColor = readiness?.state === "ready" ? p.readinessDotReady : readiness?.state === "draft_only" ? p.readinessDotDraft : readiness?.state === "missing_fields" ? p.readinessDotMissing : p.readinessDotBlocked;
            return (
              <button
                key={doc.id}
                onClick={() => { setActiveDocumentId(doc.id as BundleDocId); setActiveSection("bundle"); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-start gap-3 ${isSelected ? `${p.docCardSelected}` : `${p.docCard} ${p.bgHover}`}`}>
                <span className={`${p.readinessDot} ${dotColor} mt-1.5`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${p.text}`}>{doc.label}</p>
                  <p className={`text-[10px] mt-0.5 ${p.textMuted}`}>{readiness?.template?.name || "Nincs sablon"}</p>
                  <p className={`text-[9px] mt-1 ${p.textMuted}`}>{doc.dependencyNote}</p>
                </div>
                {selectedDocs[doc.id as BundleDocId] && (
                  <span className={`text-[9px] px-2 py-0.5 rounded font-medium shrink-0 ${isSignalTiles ? "bg-cyan-900 text-cyan-200" : "bg-[#C9A227] text-white"}`}>Kiválasztva</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`p-3 border-t ${isSignalTiles ? "border-[#1E293B]" : "border-[#E2E8F0]"}`}>
        <p className={`${p.sectionLabel} px-2 py-2`}>Szakaszok</p>
        <div className="space-y-0.5">
          {readinessSections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${activeSection === section.id ? `${p.docCardSelected}` : `${p.bgHover} ${p.textMuted}`}`}>
              {section.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`p-3 border-t ${isSignalTiles ? "border-[#1E293B]" : "border-[#E2E8F0]"}`}>
        <button onClick={() => router.push(`/cases/${resolvedGenerationCaseId}`)} className={`w-full text-left px-3 py-2 text-xs rounded-lg flex items-center gap-2 ${p.textMuted} ${p.bgHover}`}>
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          Vissza az ügyhöz
        </button>
      </div>
    </nav>
  );

  const insightCenterContent = (
    <div className="flex-1 overflow-y-auto">
      {activeSection === "bundle" ? (
        <div className="p-8 max-w-3xl mx-auto space-y-6">
          <div>
            <span className={`text-[9px] uppercase tracking-[0.35em] px-3 py-1 ${isSignalTiles ? "bg-[#16253D] text-slate-400" : "bg-[#ECE6DA] text-[#7B776D]"}`}>Dokumentum-előkészítés</span>
            <h1 className={`text-3xl font-serif mt-4 ${p.text}`}>{schema.label}</h1>
            <p className={`text-xs mt-2 leading-relaxed ${p.textMuted}`}>Válassza ki a generálandó dokumentumokat. Minden dokumentum sablonja automatikusan felismerésre kerül.</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {schema.documents.map((doc) => {
              const readiness = documentReadiness[doc.id as BundleDocId];
              const isSelected = selectedDocs[doc.id as BundleDocId];
              const isDisabled = !readiness?.canSelect;
              const badgeClass = readiness?.state === "ready" ? (isSignalTiles ? "bg-emerald-900/60 text-emerald-300" : "bg-[#ECFDF5] text-[#059669]") : readiness?.state === "draft_only" ? (isSignalTiles ? "bg-amber-900/60 text-amber-300" : "bg-[#FFFBEB] text-[#D97706]") : readiness?.state === "missing_fields" ? (isSignalTiles ? "bg-red-900/60 text-red-300" : "bg-[#FEF2F2] text-[#DC2626]") : (isSignalTiles ? "bg-slate-800 text-slate-500" : "bg-[#F9FAFB] text-[#9CA3AF]");
              return (
                <Card key={doc.id} uiPack={uiPack} emphasis={isSelected ? "primary" : "secondary"} className={`${p.docCard} ${isSelected ? p.docCardSelected : ""} ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}>
                  <button onClick={() => toggleDocumentSelection(doc.id as BundleDocId)} disabled={isDisabled} className="w-full text-left p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${p.text}`}>{doc.label}</p>
                        <p className={`text-xs mt-1 ${p.textMuted}`}>{doc.dependencyNote}</p>
                        <p className={`text-[10px] mt-1.5 ${p.textMuted}`}>{readiness?.template?.name || "Nincs sablon"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-4">
                        <span className={`text-[10px] uppercase tracking-wider px-3 py-1 rounded font-medium ${badgeClass}`}>{readiness?.label || "Unknown"}</span>
                        <span className={`text-[10px] px-3 py-1 rounded border font-medium ${isDisabled ? (isSignalTiles ? "border-[#1E293B] text-slate-600" : "border-[#E5E7EB] text-[#9CA3AF]") : isSelected ? (isSignalTiles ? "border-cyan-600 text-cyan-300" : "border-[#C9A227] text-[#1F2821]") : (isSignalTiles ? "border-[#1E293B] text-slate-400" : "border-[#E2E8F0] text-[#6B7280]")}`}>
                          {isDisabled ? "Nem elérhető" : isSelected ? "Kiválasztva" : "Kiválasztás"}
                        </span>
                      </div>
                    </div>
                    <p className={`text-[10px] mt-3 ${p.textMuted}`}>{readiness?.message}</p>
                  </button>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-8 max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className={`text-2xl font-serif ${p.text}`}>{readinessSections.find((s) => s.id === activeSection)?.label || activeSection}</h1>
            <p className={`text-xs mt-1 ${p.textMuted}`}>{schema.label} · {readinessSections.findIndex((s) => s.id === activeSection) + 1}. szakasz a {readinessSections.length} közül</p>
          </div>
          <SectionBlock title={readinessSections.find((s) => s.id === activeSection)?.label || ""} subtitle={`Család: ${schema.id} · Dokumentum: ${bundleDocs[activeDocumentId] || activeDocumentId}`} uiPack={uiPack}>
            <div className="space-y-4">
              {schema.fields.filter((field) => field.section === activeSection).filter((field) => !field.dependsOnToggle || clauseToggles[field.dependsOnToggle]).map((field) => (
                <div key={field.id} className="grid gap-2">
                  <label className={`text-[10px] uppercase tracking-[0.2em] flex items-center gap-1.5 ${p.textMuted}`}>
                    {field.label}
                    {field.required && <span className={isSignalTiles ? "text-red-400" : "text-[#DC2626]"}>*</span>}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea value={variableValues[field.variableKey] || ""} onChange={(e) => handleVariableChange(field.variableKey, e.target.value)} className={`w-full border px-4 py-3 text-xs resize-none focus:outline-none focus:ring-1 ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#E2E8F0] bg-[#FAF8F2] text-[#1F2821] focus:border-[#C9A227]"}`} rows={4} />
                  ) : (
                    <input type={field.type === "number" ? "number" : field.type} value={variableValues[field.variableKey] || ""} onChange={(e) => handleVariableChange(field.variableKey, e.target.value)} className={`w-full h-10 border px-3 text-xs focus:outline-none focus:ring-1 ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#E2E8F0] bg-[#FAF8F2] text-[#1F2821] focus:border-[#C9A227]"}`} />
                  )}
                </div>
              ))}
            </div>
          </SectionBlock>
          {activeSection === "parties" && family === "sale_purchase" && activeDocumentId === "main_sale" && (
            <SectionBlock title="Ellenjegyző fél — Auto-fill" subtitle="Az ellenoldali fél adatai automatikusan kitöltik a megfelelő eladó/vevő mezőket" uiPack={uiPack}>
              <div className={`p-5 border border-dashed rounded-xl ${isSignalTiles ? "border-cyan-800 bg-cyan-950/30" : "border-[#C9A227] bg-amber-50"}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${p.textMuted}`}>
                    {caseData?.clientRole && (caseData.clientRole.toUpperCase() === "BUYER" || caseData.clientRole.toUpperCase() === "VEVŐ" || caseData.clientRole.toUpperCase() === "VEVO") ? "Ellenjegyző fél (Eladó)" : "Ellenjegyző fél (Vevő)"}
                  </span>
                  <span className={`text-[10px] ${p.textMuted}`}>→ automatikusan kitölti az ellenoldali mezőt</span>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="oppPartyType" value="PERSON" checked={oppositeParty.partyType === "PERSON"} onChange={() => setOppositeParty((p) => ({ ...p, partyType: "PERSON" }))} className={`w-3.5 h-3.5 ${isSignalTiles ? "accent-cyan-400" : "accent-[#C9A227]"}`} />
                      <span className={`text-xs ${p.text}`}>Személy</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="oppPartyType" value="COMPANY" checked={oppositeParty.partyType === "COMPANY"} onChange={() => setOppositeParty((p) => ({ ...p, partyType: "COMPANY" }))} className={`w-3.5 h-3.5 ${isSignalTiles ? "accent-cyan-400" : "accent-[#C9A227]"}`} />
                      <span className={`text-xs ${p.text}`}>Cég</span>
                    </label>
                  </div>
                  <input type="text" placeholder={oppositeParty.partyType === "PERSON" ? "pl. Kovács János" : "pl. Kft."} value={oppositeParty.name} onChange={(e) => setOppositeParty((p) => ({ ...p, name: e.target.value }))} className={`w-full px-4 py-2.5 text-xs border rounded-lg focus:outline-none ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#DDD7CA] bg-white text-[#1F2821] focus:border-[#C9A227]"}`} />
                  {oppositeParty.partyType === "PERSON" && (
                    <>
                      <input type="date" value={oppositeParty.birthDate} onChange={(e) => setOppositeParty((p) => ({ ...p, birthDate: e.target.value }))} className={`w-full px-4 py-2.5 text-xs border rounded-lg focus:outline-none ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#DDD7CA] bg-white text-[#1F2821] focus:border-[#C9A227]"}`} />
                      <input type="text" placeholder="Születési név (opcionális)" value={oppositeParty.birthName || ""} onChange={(e) => setOppositeParty((p) => ({ ...p, birthName: e.target.value }))} className={`w-full px-4 py-2.5 text-xs border rounded-lg focus:outline-none ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#DDD7CA] bg-white text-[#1F2821] focus:border-[#C9A227]"}`} />
                      <input type="text" placeholder="Születési hely (opcionális)" value={oppositeParty.birthPlace || ""} onChange={(e) => setOppositeParty((p) => ({ ...p, birthPlace: e.target.value }))} className={`w-full px-4 py-2.5 text-xs border rounded-lg focus:outline-none ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#DDD7CA] bg-white text-[#1F2821] focus:border-[#C9A227]"}`} />
                      <input type="text" placeholder="Anyja neve (opcionális)" value={oppositeParty.motherName || ""} onChange={(e) => setOppositeParty((p) => ({ ...p, motherName: e.target.value }))} className={`w-full px-4 py-2.5 text-xs border rounded-lg focus:outline-none ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-200 focus:border-cyan-500" : "border-[#DDD7CA] bg-white text-[#1F2821] focus:border-[#C9A227]"}`} />
                    </>
                  )}
                </div>
              </div>
            </SectionBlock>
          )}
          {activeSection === "title" && (
            <SectionBlock title="Záradékok és opciók" uiPack={uiPack}>
              <div className="grid grid-cols-2 gap-2">
                {schema.toggles.filter((t) => t.section === "title").map((toggle) => (
                  <button key={toggle.id} onClick={() => handleToggle(toggle.id)} className={`px-4 py-2.5 rounded-lg border text-xs font-medium text-left ${clauseToggles[toggle.id] ? (isSignalTiles ? "border-emerald-500 bg-emerald-950/40 text-emerald-300" : "border-[#10B981] bg-[#F0FDF4] text-[#059669]") : (isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-300" : "border-[#DDD7CA] bg-white text-[#1F2821]")}`}>
                    {toggle.label}
                  </button>
                ))}
              </div>
            </SectionBlock>
          )}
        </div>
      )}
    </div>
  );

  const insightRightRail = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <SectionBlock title="Összefoglaló" uiPack={uiPack}>
          {workspaceMessage && (
            <div className={`mb-3 rounded-lg p-3 text-xs ${isSignalTiles ? "bg-cyan-950/50 border border-cyan-800 text-cyan-300" : "bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8]"}`}>
              <p>{workspaceMessage}</p>
            </div>
          )}
          {fatalIssues.length > 0 ? (
            <div className={`rounded-lg p-3 ${isSignalTiles ? "bg-red-950/50 border border-red-800" : "bg-[#FEF2F2] border border-[#FECACA]"}`}>
              <p className={`text-[10px] font-semibold mb-2 ${isSignalTiles ? "text-red-400" : "text-[#DC2626]"}`}>Blokkoló hibák</p>
              {fatalIssues.map((issue) => <p key={issue} className={`text-xs ${isSignalTiles ? "text-red-300" : "text-[#DC2626]"}`}>• {issue}</p>)}
            </div>
          ) : warnings.length > 0 ? (
            <div className={`rounded-lg p-3 ${isSignalTiles ? "bg-amber-950/50 border border-amber-800" : "bg-[#FFFBEB] border border-[#FDE68A]"}`}>
              <p className={`text-[10px] font-semibold mb-2 ${isSignalTiles ? "text-amber-400" : "text-[#F59E0B]"}`}>Figyelmeztetések</p>
              {warnings.map((warning) => <p key={warning} className={`text-xs ${isSignalTiles ? "text-amber-300" : "text-[#F59E0B]"}`}>• {warning}</p>)}
            </div>
          ) : (
            <p className={`text-xs ${isSignalTiles ? "text-emerald-400" : "text-[#059669]"}`}>Nincs blokkoló probléma</p>
          )}
          {activeDocumentReadiness && (
            <div className={`mt-3 rounded-lg p-3 ${isSignalTiles ? "border border-[#1E293B] bg-[#0F172A]" : "border border-[#E2E8F0] bg-[#FAF8F2]"}`}>
              <p className={`${p.sectionLabel} mb-1.5`}>Aktív · {bundleDocs[activeDocumentId as BundleDocId] || activeDocumentId}</p>
              <p className={`text-xs mb-1 ${p.text}`}>Állapot: {activeDocumentReadiness.label}</p>
              <p className={`text-[10px] ${p.textMuted}`}>{activeDocumentReadiness.message}</p>
            </div>
          )}
        </SectionBlock>

        <SectionBlock title={`Dokumentumok (${selectedCount})`} uiPack={uiPack}>
          {selectedCount === 0 ? (
            <p className={`text-xs ${p.textMuted}`}>Nincs dokumentum kiválasztva</p>
          ) : (
            <div className="space-y-1.5">
              {selectedDocumentIds.map((docId) => {
                const r = documentReadiness[docId];
                return (
                  <div key={docId} className={`flex items-center justify-between p-2.5 rounded-lg text-xs ${isSignalTiles ? "bg-[#0F172A]" : "bg-[#FAF8F2]"}`}>
                    <span className={p.text}>{bundleDocs[docId] || docId}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${r?.canGenerate ? (isSignalTiles ? "bg-emerald-900/60 text-emerald-300" : "bg-[#ECFDF5] text-[#059669]") : (isSignalTiles ? "bg-red-900/60 text-red-300" : "bg-[#FEF2F2] text-[#DC2626]")}`}>
                      {r?.label || "?"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionBlock>

        <SectionBlock title="Műveletek" uiPack={uiPack}>
          <div className="space-y-2">
            <button onClick={handleDraft} disabled={isDraftSaving} className={`w-full py-2.5 px-4 rounded-lg text-xs font-medium border transition-colors ${isDraftSaving ? p.btnCmdDisabled : (isSignalTiles ? "border-[#1E293B] bg-[#0F172A] text-slate-300 hover:bg-[#16253D]" : "border-[#DDD7CA] bg-white text-[#514D45] hover:bg-[#ECE6DA]")}`}>
              {isDraftSaving ? "Mentés..." : "Piszkozat mentése"}
            </button>
            <button onClick={handlePreview} disabled={!selectedTemplate || isPreviewing} className={`w-full py-2.5 px-4 rounded-lg text-xs font-medium border transition-colors ${selectedTemplate ? p.btnCmd : p.btnCmdDisabled}`}>
              {isPreviewing ? "Előnézet..." : "Előnézet megtekintése"}
            </button>
            <button onClick={() => handleGenerate(generatableSelectedDocs)} disabled={generatableSelectedDocs.length === 0 || isGenerating || fatalIssues.length > 0} className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold border transition-colors ${generatableSelectedDocs.length > 0 && fatalIssues.length === 0 && !isGenerating ? p.btnCmd : p.btnCmdDisabled}`}>
              {isGenerating ? "Generálás..." : `Generálás (${generatableSelectedDocs.length})`}
            </button>
          </div>
          {bundleResults && Object.keys(bundleResults).length > 0 && (
            <div className={`mt-3 p-3 rounded-lg border text-xs space-y-1 ${isSignalTiles ? "border-[#1E293B] bg-[#0F172A]" : "border-[#E2E8F0] bg-[#FAF8F2]"}`}>
              <p className={`font-semibold ${p.text}`}>Generálási eredmények</p>
              {Object.entries(bundleResults).map(([docId, result]) => (
                <div key={docId} className="flex items-start gap-2">
                  <span className={result?.status === "generated" ? (isSignalTiles ? "text-emerald-400" : "text-[#059669]") : result?.status === "skipped" ? (isSignalTiles ? "text-amber-400" : "text-[#D97706]") : (isSignalTiles ? "text-red-400" : "text-[#DC2626]")}>•</span>
                  <span className={p.textMuted}>{bundleDocs[docId as BundleDocId] || docId}: {result?.message}</span>
                </div>
              ))}
            </div>
          )}
        </SectionBlock>
      </div>
    </div>
  );

  // ─── RETURN — conditional layout based on pack
  if (isSignalTiles) {
    return (
      <WorkspaceLayout uiPack={uiPack} left={signalLeftRail} right={signalRightRail} data-surface="generate">
        {signalCenterContent}
      </WorkspaceLayout>
    );
  }
  return (
    <WorkspaceLayout uiPack={uiPack} left={insightLeftRail} right={insightRightRail} data-surface="generate">
      {insightCenterContent}
    </WorkspaceLayout>
  );
}