"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useDialogAccessibility } from "@/components/ui/useDialogAccessibility";
import {
  anonymizeDocument,
  ApiError,
  getAnonymizationSourceText,
  type AnonymizationMetadataInput,
  type CaseContractListItem,
  type KnownPartyInput,
} from "@/lib/api";
import { AIPromptPanel } from "@/components/documents/AIPromptPanel";
import { OrganizationPersonPicker } from "@/components/documents/OrganizationPersonPicker";
import type { KnownPartyTransfer } from "@/lib/organizationPersonMapping";
import {
  resolveAnonymizeSourceOutcome,
  SOURCE_TEXT_LIMITATION_MESSAGE,
} from "@/lib/documents/anonymizeSourceOutcome";

// Minimal structured counterparty input
interface CounterpartyInput {
  name: string;
  side: 'OPPONENT' | 'ADDITIONAL_PARTY';
  partyType?: 'PERSON' | 'COMPANY' | 'UNKNOWN';
}

interface AnonymizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: CaseContractListItem;
  caseId?: string;
  /** Case client id — enables the explicit organization-person picker for known-party data */
  clientId?: string;
  /** Case client name, for known-party context in the anonymization surface */
  clientName?: string;
  /** Case client role (e.g. "Megbízó", "Ellenérdekű fél"), for known-party context */
  clientRole?: string;
  onSuccess?: (result: AnonymizeResult) => void;
}

export interface AnonymizeResult {
  anonymizedDocumentId: string;
  caseId: string;
  name: string;
  redactedText: string;
  redactedItems: Array<{
    type: string;
    original: string;
    replacement: string;
    position: number;
  }>;
  aiReadyPrompt: string;
}

type AITask = "REVIEW_RISKS" | "COMPARE_TEMPLATE" | "SUMMARIZE" | "CUSTOM";
type RedactionLevel = "FULL" | "CLIENT_ONLY";
type KnownPartyKind = "PERSON" | "COMPANY";

const aiTaskOptions: { value: AITask; label: string; description: string }[] = [
  { value: "REVIEW_RISKS", label: "Jogi kockázatok áttekintése", description: "Elemzés jogi kockázatok szempontjából" },
  { value: "COMPARE_TEMPLATE", label: "Összevetés mintával", description: "Összehasonlítás a standard mintával" },
  { value: "SUMMARIZE", label: "Összefoglalás", description: "A dokumentum összefoglalójának elkészítése" },
  { value: "CUSTOM", label: "Egyedi feladat", description: "Egyedi prompt" },
];

const redactionLevelOptions: { value: RedactionLevel; label: string }[] = [
  { value: "FULL", label: "Teljes anonimizálás" },
  { value: "CLIENT_ONLY", label: "Csak ügyféladatok" },
];

const legalRoleOptions = ["Ügyfél", "Megbízó", "Eladó", "Vevő", "Ellenérdekű fél", "Egyéb fél"];

const COPY_FAILURE_MESSAGE = "Nem sikerült a vágólapra másolni. Jelöld ki és másold kézzel.";

const PSEUDONYMIZATION_NOTE = "Az Adminiculum az AI-átadáshoz pszeudonimizált munkapéldányt készít; az eredeti adatok visszaállíthatók az Adminiculumban.";

export function AnonymizeModal({ isOpen, onClose, contract, caseId, clientId, clientName, clientRole, onSuccess }: AnonymizeModalProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useDialogAccessibility({ open: isOpen && mounted, onClose, dialogRef });
  const [aiTask, setAiTask] = useState<AITask>("REVIEW_RISKS");
  const [redactionLevel, setRedactionLevel] = useState<RedactionLevel>("FULL");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnonymizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedState, setCopiedState] = useState<"redacted" | "prompt" | "both" | null>(null);
  const [sourceTextLoading, setSourceTextLoading] = useState(false);
  const [sourceTextAvailable, setSourceTextAvailable] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const generation = useRef(0);
  const [sourceLimitationMessage, setSourceLimitationMessage] = useState(SOURCE_TEXT_LIMITATION_MESSAGE);

  const [metadataClientName, setMetadataClientName] = useState(clientName || "");
  const [metadataClientRole, setMetadataClientRole] = useState(clientRole || "");
  const [knownPartyKind, setKnownPartyKind] = useState<KnownPartyKind>("PERSON");
  const [knownPartyLegalRole, setKnownPartyLegalRole] = useState(clientRole || "Ügyfél");
  const [knownPartyName, setKnownPartyName] = useState(clientName || "");
  const [knownPartyRole, setKnownPartyRole] = useState(clientRole || "");
  const [knownPartyNotes, setKnownPartyNotes] = useState("");
  const [birthName, setBirthName] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [mothersName, setMothersName] = useState("");
  const [personAddress, setPersonAddress] = useState("");
  const [personTaxId, setPersonTaxId] = useState("");
  const [personalIdentifierNumber, setPersonalIdentifierNumber] = useState("");
  const [identityCardNumber, setIdentityCardNumber] = useState("");
  const [companyName, setCompanyName] = useState(clientName || "");
  const [companySeat, setCompanySeat] = useState("");
  const [companyTaxNumber, setCompanyTaxNumber] = useState("");
  const [euVatNumber, setEuVatNumber] = useState("");
  const [companyRegistrationNumber, setCompanyRegistrationNumber] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [representativeTitle, setRepresentativeTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
const [phone, setPhone] = useState("");
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  // Additional complete known-party bundles beyond the primary party. Each entry
  // is an independent identity bundle; adding/removing one never mutates another.
  const [additionalKnownParties, setAdditionalKnownParties] = useState<Array<KnownPartyInput & { id: string }>>([]);

  const applyOrganizationPerson = (transfer: KnownPartyTransfer, legalRole: string) => {
    // Append a NEW known-party bundle rather than overwriting the primary party,
    // so selecting a second person never erases the first.
    setAdditionalKnownParties((prev) => [
      ...prev,
      {
        id: `kp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: "PERSON",
        legalRole,
        name: transfer.name,
        role: transfer.role,
        notes: transfer.notes,
        contactEmail: transfer.contactEmail,
        phone: transfer.phone,
      },
    ]);
    setShowPersonPicker(false);
  };

  const removeAdditionalParty = (id: string) => {
    setAdditionalKnownParties((prev) => prev.filter((party) => party.id !== id));
  };

  const router = useRouter();

  useEffect(() => setMounted(true), []);

  // Structured counterparty (extra-party) input
  const [counterparties, setCounterparties] = useState<CounterpartyInput[]>([]);
  const [newCounterpartyName, setNewCounterpartyName] = useState('');
  const [newCounterpartySide, setNewCounterpartySide] = useState<'OPPONENT' | 'ADDITIONAL_PARTY'>('OPPONENT');

  useEffect(() => {
    setMetadataClientName(clientName || "");
    setMetadataClientRole(clientRole || "");
    setKnownPartyName(clientName || "");
    setKnownPartyRole(clientRole || "");
    setKnownPartyLegalRole(clientRole || "Ügyfél");
    setCompanyName(clientName || "");
  }, [clientName, clientRole]);

  // Reset stale result/error/copied state whenever the modal opens or the
  // document changes, so an old anonymized result never masquerades as belonging
  // to a different document.
  useEffect(() => {
    generation.current += 1;
    if (!isOpen) return;
    setResult(null);
    setError(null);
    setCopiedState(null);
    setIsLoading(false);
    return () => { generation.current += 1; };
  }, [isOpen, contract.id]);

  const knownPartyPrimaryName = knownPartyKind === "COMPANY"
    ? (companyName.trim() || knownPartyName.trim())
    : knownPartyName.trim();

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const loadSourceText = async () => {
      setSourceTextLoading(true);
      setSourceTextAvailable(false);
      setSourceText("");
      try {
        const response = await getAnonymizationSourceText(contract.id);
        if (!active) return;

        const outcome = resolveAnonymizeSourceOutcome(response);
        if (outcome.available) {
          const text = (response.sourceText || "").trim();
          setSourceTextAvailable(true);
          setSourceText(text);
          setSourceLimitationMessage(outcome.message);
        } else {
          setSourceTextAvailable(false);
          setSourceText("");
          setSourceLimitationMessage(outcome.message);
        }
      } catch {
        if (!active) return;
        setSourceTextAvailable(false);
        setSourceText("");
        setSourceLimitationMessage(resolveAnonymizeSourceOutcome({ code: "PROCESSING_FAILURE" }).message);
      } finally {
        if (active) {
          setSourceTextLoading(false);
        }
      }
    };

    loadSourceText();
    return () => {
      active = false;
    };
  }, [isOpen, contract.id]);

  const handleAddCounterparty = () => {
    if (!newCounterpartyName.trim()) return;
    setCounterparties(prev => [
      ...prev,
      { name: newCounterpartyName.trim(), side: newCounterpartySide }
    ]);
    setNewCounterpartyName('');
  };

  const handleRemoveCounterparty = (index: number) => {
    setCounterparties(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnonymize = async () => {
    if (!sourceTextAvailable || sourceTextLoading) return;
    const request = generation.current;
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await anonymizeDocument(contract.id, {
        aiTask,
        customPrompt: aiTask === "CUSTOM" ? customPrompt : undefined,
        redactionLevel,
        counterparties: counterparties.length > 0 ? counterparties : undefined,
        metadata: {
          clientName: metadataClientName.trim() || knownPartyPrimaryName || undefined,
          clientRole: metadataClientRole.trim() || knownPartyLegalRole.trim() || undefined,
          counterparty: knownPartyLegalRole.toLowerCase().includes("ellenérdek") ? knownPartyPrimaryName || undefined : undefined,
          notes: knownPartyNotes.trim() || undefined,
          knownParty: {
            kind: knownPartyKind,
            legalRole: knownPartyLegalRole.trim() || undefined,
            name: knownPartyPrimaryName || undefined,
            role: knownPartyRole.trim() || undefined,
            notes: knownPartyNotes.trim() || undefined,
            birthName: birthName.trim() || undefined,
            birthPlace: birthPlace.trim() || undefined,
            birthDate: birthDate.trim() || undefined,
            mothersName: mothersName.trim() || undefined,
            address: personAddress.trim() || undefined,
            taxId: personTaxId.trim() || undefined,
            personalId: identityCardNumber.trim() || personalIdentifierNumber.trim() || undefined,
            personalIdentifierNumber: personalIdentifierNumber.trim() || undefined,
            identityCardNumber: identityCardNumber.trim() || undefined,
            companyName: companyName.trim() || undefined,
            seat: companySeat.trim() || undefined,
            companyTaxNumber: companyTaxNumber.trim() || undefined,
            euVatNumber: euVatNumber.trim() || undefined,
            companyRegistrationNumber: companyRegistrationNumber.trim() || undefined,
            representativeName: representativeName.trim() || undefined,
            representativeTitle: representativeTitle.trim() || undefined,
            contactEmail: contactEmail.trim() || undefined,
            phone: phone.trim() || undefined,
          },
          knownParties: additionalKnownParties.length > 0
            ? additionalKnownParties.map(({ id: _id, ...party }) => party)
            : undefined,
        } as AnonymizationMetadataInput,
      }) as unknown as {
        success: boolean;
        anonymizedDocumentId?: string;
        redactedText?: string;
        redactedItems?: Array<{
          type: string;
          original: string;
          replacement: string;
          position: number;
        }>;
        aiReadyPrompt?: string;
        error?: string;
      };

      if (request !== generation.current) return;
      if (response.success && response.anonymizedDocumentId) {
        const resultData: AnonymizeResult = {
          anonymizedDocumentId: response.anonymizedDocumentId,
          caseId: caseId || '',
          name: contract.title || contract.templateName || 'Anonymous Document',
          redactedText: response.redactedText || "",
          redactedItems: response.redactedItems || [],
          aiReadyPrompt: response.aiReadyPrompt || "",
        };
        setResult(resultData);
        onSuccess?.(resultData);
      } else {
        setError(resolveAnonymizeSourceOutcome({ code: 'PROCESSING_FAILURE' }).message);
      }
    } catch (err) {
      if (request === generation.current) setError(resolveAnonymizeSourceOutcome({ code: err instanceof ApiError ? err.code || 'PROCESSING_FAILURE' : 'PROCESSING_FAILURE' }).message);
    } finally {
      if (request === generation.current) setIsLoading(false);
    }
  };

  const handleCopyRedactedText = async () => {
    if (result?.redactedText) {
      try {
        await navigator.clipboard.writeText(result.redactedText);
        setCopiedState("redacted");
        setTimeout(() => setCopiedState(null), 2000);
      } catch {
        setError(COPY_FAILURE_MESSAGE);
      }
    }
  };

  const handleCopyAIPrompt = async () => {
    if (result?.aiReadyPrompt) {
      try {
        await navigator.clipboard.writeText(result.aiReadyPrompt);
        setCopiedState("prompt");
        setTimeout(() => setCopiedState(null), 2000);
      } catch {
        setError(COPY_FAILURE_MESSAGE);
      }
    }
  };

  const handleCopyPromptAndText = async () => {
    if (result?.aiReadyPrompt && result?.redactedText) {
      try {
        await navigator.clipboard.writeText(`${result.aiReadyPrompt}\n\n---\n\nANONIMIZÁLT SZÖVEG:\n${result.redactedText}`);
        setCopiedState("both");
        setTimeout(() => setCopiedState(null), 2000);
      } catch {
        setError(COPY_FAILURE_MESSAGE);
      }
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setCustomPrompt("");
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 px-4 py-4 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="anonymize-modal-title" tabIndex={-1} className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden border border-[#e4e2dd] bg-white shadow-2xl outline-none">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-[#06190d] px-6 py-4">
          <div className="min-w-0">
            <h2 id="anonymize-modal-title" className="text-lg font-['Newsreader'] font-bold text-white">
              AI-előkészítés / Anonimizálás
            </h2>
            <p className="mt-1 break-words text-xs text-white/60">
              {contract.title || contract.templateName}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Bezárás"
            className="min-h-10 min-w-10 shrink-0 text-white/60 hover:text-white transition-colors"
          >
            <span aria-hidden="true" className="text-2xl">×</span>
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          {!result ? (
            <>
              {/* Source Document Info */}
              <div className="mb-6 p-4 bg-[#f5f3ee] border border-[#c3c8c1]/10">
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-[#06190d]">{contract.title || contract.templateName}</p>
                    <p className="text-xs text-[#434843]">
                      v{contract.revisionNumber || 1} • {contract.status}
                    </p>
                  </div>
                </div>
              </div>

              {/* Source Text Workspace */}
              <div className="mb-6 p-4 border border-[#c3c8c1]/20">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-bold text-[var(--adm-text-primary)]">Dokumentumforrás előnézete</p>
                </div>
                {sourceTextLoading ? (
                  <p className="text-xs text-[#434843]">Forrásszöveg betöltése...</p>
                ) : sourceTextAvailable ? (
                  <>
                    <p className="text-[10px] text-[#434843]/70 mb-2">
                      Az anonimizálás a dokumentum ellenőrzött, tárolt szövegéből készül.
                    </p>
                    <textarea
                      value={sourceText}
                      readOnly
                      aria-label="A dokumentum hiteles forrásszövege"
                      rows={10}
                      className="w-full p-3 border border-[#c3c8c1]/20 text-xs text-[#06190d] focus:outline-none focus:border-[#06190d] font-mono"
                    />
                    <p className="mt-2 text-[10px] text-[#434843]/60">
                      Betöltött karakterek: {sourceText.length}
                    </p>
                  </>
                ) : (
                  <div className="p-3 bg-[#fff8e1] border border-[#f9c74f] text-[#8a6a00] text-xs">
                    {sourceLimitationMessage}
                  </div>
                )}
              </div>

              {/* Known Party Metadata */}
              <div className="mb-6 p-4 border border-[#c3c8c1]/20">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-bold text-[#06190d]">Ismert fél adatai</p>
                </div>
                <p className="text-[10px] text-[#434843]/70 mb-3">
                  Az itt megadott adatok pontos egyezés alapján anonimizálódnak. Nem automatikus adatfelismerés, hanem ismert adatok védelme.
                </p>
                {clientId ? (
                  <>
                    {!showPersonPicker ? (
                      <button
                        type="button"
                        onClick={() => setShowPersonPicker(true)}
                        className="mb-3 border border-[#23472F]/40 px-3 py-1.5 text-[11px] font-semibold text-[#23472F] hover:bg-[#e2ede5] focus-visible:outline focus-visible:outline-2"
                      >
                        Személy átvétele az ügyfélszervezetből…
                      </button>
                    ) : (
                      <OrganizationPersonPicker
                        clientId={clientId}
                        isOpen={showPersonPicker}
                        onCancel={() => setShowPersonPicker(false)}
                        onConfirm={applyOrganizationPerson}
                      />
                    )}
                  </>
                ) : null}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    value={knownPartyKind}
                    onChange={(e) => setKnownPartyKind(e.target.value as KnownPartyKind)}
                    className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] focus:outline-none focus:border-[#06190d] bg-white"
                  >
                    <option value="PERSON">Természetes személy</option>
                    <option value="COMPANY">Jogi személy / cég</option>
                  </select>
                  <select
                    value={knownPartyLegalRole}
                    onChange={(e) => {
                      setKnownPartyLegalRole(e.target.value);
                      setMetadataClientRole(e.target.value);
                    }}
                    className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] focus:outline-none focus:border-[#06190d] bg-white"
                  >
                    {legalRoleOptions.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={knownPartyName}
                    onChange={(e) => {
                      setKnownPartyName(e.target.value);
                      setMetadataClientName(e.target.value);
                    }}
                    placeholder="Név / cégnév"
                    className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]"
                  />
                  <input
                    type="text"
                    value={knownPartyRole}
                    onChange={(e) => setKnownPartyRole(e.target.value)}
                    placeholder="Szerep"
                    className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]"
                  />
                  <input
                    type="text"
                    value={knownPartyNotes}
                    onChange={(e) => setKnownPartyNotes(e.target.value)}
                    placeholder="Megjegyzés"
                    className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]"
                  />
                  {knownPartyKind === "PERSON" ? (
                    <>
                      <input type="text" value={birthName} onChange={(e) => setBirthName(e.target.value)} placeholder="Születési név" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} placeholder="Születési hely" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} placeholder="Születési idő" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={mothersName} onChange={(e) => setMothersName(e.target.value)} placeholder="Anyja neve" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={personAddress} onChange={(e) => setPersonAddress(e.target.value)} placeholder="Lakcím" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={personTaxId} onChange={(e) => setPersonTaxId(e.target.value)} placeholder="Adóazonosító jel" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={personalIdentifierNumber} onChange={(e) => setPersonalIdentifierNumber(e.target.value)} placeholder="Személyi azonosító jel" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={identityCardNumber} onChange={(e) => setIdentityCardNumber(e.target.value)} placeholder="Személyi igazolvány száma" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                    </>
                  ) : (
                    <>
                      <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Cégnév" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={companySeat} onChange={(e) => setCompanySeat(e.target.value)} placeholder="Székhely" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={companyTaxNumber} onChange={(e) => setCompanyTaxNumber(e.target.value)} placeholder="Adószám" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={euVatNumber} onChange={(e) => setEuVatNumber(e.target.value)} placeholder="Közösségi adószám" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={companyRegistrationNumber} onChange={(e) => setCompanyRegistrationNumber(e.target.value)} placeholder="Cégjegyzékszám" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} placeholder="Képviselő neve" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={representativeTitle} onChange={(e) => setRepresentativeTitle(e.target.value)} placeholder="Képviselő tisztsége" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Kapcsolattartó email" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                      <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefonszám" className="px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]" />
                    </>
                  )}
                </div>
              </div>

              {/* Additional known-party bundles (person picker appends here) */}
              {additionalKnownParties.length > 0 && (
                <div className="mb-6 p-4 border border-[#c3c8c1]/20">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-xs font-bold text-[#06190d]">További ismert felek</p>
                  </div>
                  <div className="space-y-2">
                    {additionalKnownParties.map((party) => (
                      <div key={party.id} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 bg-[#f5f3ee] border border-[#c3c8c1]/10">
                        <div className="min-w-0 break-words">
                          <p className="text-xs font-bold text-[#06190d]">{party.name || "Ismert fél"}</p>
                          <p className="text-[10px] text-[#434843]/70">
                            {party.legalRole || "Szerep nélkül"}
                            {party.role ? ` — ${party.role}` : ""}
                            {party.contactEmail ? ` — ${party.contactEmail}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAdditionalParty(party.id)}
                          className="shrink-0 text-[#8b3a3a] hover:text-[#6b2020] text-xs font-bold"
                          aria-label={`Eltávolítás: ${party.name || "Ismert fél"}`}
                        >
                          Eltávolítás
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Known Party Context — case client is already known, user only needs counterparty info */}
              {clientName && (
                <div className="mb-4 p-3 bg-[#e2ede5] border border-[#a6c0af]">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 break-words">
                      <p className="text-xs font-bold text-[#23472F]">Ismert fél</p>
                      <p className="text-[10px] text-[#23472F]/70">
                        {clientName}{clientRole ? ` — ${clientRole}` : ""} — csak az ellenérdekelt feleket adja meg
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Structured Counterparty Input */}
              <div className="mb-6 p-4 border border-[#c3c8c1]/20">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-bold text-[#06190d]">További felek</p>
                </div>
                <p className="text-[10px] text-[#434843]/60 mb-3">
                  Opcionális — adja meg az ellenérdekelt feleket a pontosabb anonimizáláshoz
                </p>

                {/* Add counterparty form */}
                <div className="mb-3 flex min-w-0 flex-wrap gap-2">
                  <input
                    type="text"
                    value={newCounterpartyName}
                    onChange={(e) => setNewCounterpartyName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCounterparty()}
                    placeholder="Ellenérdekelt fél neve..."
                    className="w-full min-w-0 px-2 py-1.5 text-xs border border-[#c3c8c1]/20 text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d] sm:w-auto sm:flex-1"
                  />
                  <select
                    value={newCounterpartySide}
                    onChange={(e) => setNewCounterpartySide(e.target.value as 'OPPONENT' | 'ADDITIONAL_PARTY')}
                    className="px-2 py-1.5 text-xs border border-[#c3c8c1]/20 text-[#06190d] focus:outline-none focus:border-[#06190d] bg-white"
                  >
                    <option value="OPPONENT">Ellenérdekű</option>
                    <option value="ADDITIONAL_PARTY">További fél</option>
                  </select>
                  <button
                    onClick={handleAddCounterparty}
                    disabled={!newCounterpartyName.trim()}
                    className="px-3 py-1.5 text-xs font-bold bg-[#06190d] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>

                {/* Counterparty list */}
                {counterparties.length > 0 && (
                  <div className="space-y-1.5">
                    {counterparties.map((cp, i) => (
                      <div key={i} className="flex min-w-0 items-center justify-between gap-2 px-2 py-1.5 bg-[#f5f3ee] border border-[#c3c8c1]/10">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-[10px] text-[#434843]/50">
                            {cp.side === 'OPPONENT' ? 'E' : 'T'}
                          </span>
                          <span className="min-w-0 break-words text-xs text-[#06190d]">{cp.name}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveCounterparty(i)}
                          className="text-[#8b3a3a] hover:text-[#6b2020] text-xs font-bold"
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Task Selection */}
              <details className="mb-6 border border-[#c3c8c1]/20 p-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-[#434843]">
                  AI prompt beállítás
                </summary>
                <p className="mt-2 text-[10px] text-[#434843]/70">
                  Alapértelmezett prompt: szerződéses kockázatelemzés. Részletes promptok később a szerződés-workspace jobb oldali paneljén lesznek elérhetők.
                </p>
                <select
                  value={aiTask}
                  onChange={(e) => setAiTask(e.target.value as AITask)}
                  className="mt-3 w-full px-2 py-2 text-xs border border-[#c3c8c1]/20 text-[#06190d] focus:outline-none focus:border-[#06190d] bg-white"
                >
                  {aiTaskOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {option.description}
                    </option>
                  ))}
                </select>
              </details>

              {/* Custom Prompt (if CUSTOM selected) */}
              {aiTask === "CUSTOM" && (
                <div className="mb-6">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                    Egyedi prompt
                  </label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Add meg az egyedi elemzési utasításaidat..."
                    className="w-full p-3 border border-[#c3c8c1]/20 text-sm text-[#06190d] placeholder-[#c3c8c1] focus:outline-none focus:border-[#06190d]"
                    rows={3}
                  />
                </div>
              )}

              {/* Redaction Level */}
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                  Anonimizálás mértéke
                </label>
                <div className="flex flex-wrap gap-3">
                  {redactionLevelOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setRedactionLevel(option.value)}
                      className={`min-w-[130px] flex-1 p-3 text-center border transition-all ${
                        redactionLevel === option.value
                          ? "border-[#06190d] bg-[#06190d]/5"
                          : "border-[#c3c8c1]/20 hover:border-[#c3c8c1]/40"
                      }`}
                    >
                      <p className="text-xs font-bold text-[#06190d]">{option.label}</p>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-[#434843]/60">
                  Az anonimizálás jelenleg pontos ismert értékeket cserél: a tárolt ügyfél-/profiladatokat, valamint az itt megadott ügyfél- és ellenoldali adatokat. Nem végez automatikus AI/NER alapú felismerést ismeretlen e-mailekre, telefonszámokra, dátumokra, címekre vagy azonosítókra.
                </p>
                <p className="mt-2 text-[10px] text-[#514D45]">
                  {PSEUDONYMIZATION_NOTE}
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-[#fef2f2] border border-[#d4b8b8] text-[#8b3a3a] text-sm">
                  {error}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Success Result */}
              <div className="mb-6 p-4 bg-[#e2ede5] border border-[#a6c0af]">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="text-lg text-[#23472F]">✓</span>
                  <div>
                    <p className="text-sm font-bold text-[#23472F]">Anonimizálás kész</p>
                    <p className="text-xs text-[#23472F]/70">
                      {result.redactedItems.length} elem anonimizálva
                    </p>
                    <p className="text-xs text-[#23472F]/70 mt-1">
                      Az alábbi prompt panelből külső AI eszközbe másolható munkapromptokat készíthetsz az anonimizált szöveghez.
                    </p>
                  </div>
                </div>
              </div>

              {/* Redacted Preview */}
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                  Anonimizált tartalom előnézete
                </label>
                <div className="p-4 bg-[#f5f3ee] border border-[#c3c8c1]/10 text-xs text-[#434843] max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">
                  {result.redactedText || "Nincs elérhető előnézet"}
                </div>
              </div>

              {/* AI Ready Prompt */}
              {result.aiReadyPrompt && (
                <div className="mb-6">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#434843] mb-3">
                    AI-átadásra kész prompt
                  </label>
                  <div className="p-4 bg-[#f5f3ee] border border-[#c3c8c1]/10 text-xs text-[#434843] max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">
                    {result.aiReadyPrompt}
                  </div>
                </div>
              )}

              <div className="mb-6">
                <AIPromptPanel
                  caseId={caseId}
                  documentId={contract.id}
                  documentTitle={contract.title || contract.fileName || contract.templateName}
                  anonymizedText={result.redactedText}
                  className="w-full"
                />
              </div>

{/* Actions */}
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={handleCopyRedactedText}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest border transition-all ${
                    copiedState === "redacted"
                      ? "border-[#23472F] bg-[#e2ede5] text-[#23472F]"
                      : "border-[#06190d]/20 text-[#06190d] hover:bg-[#06190d]/5"
                  }`}
                >
                  {copiedState === "redacted" ? "✓ Másolva" : "Anonimizált szöveg másolása"}
                </button>
                <button
                  onClick={handleCopyAIPrompt}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest border transition-all ${
                    copiedState === "prompt"
                      ? "border-[#23472F] bg-[#e2ede5] text-[#23472F]"
                      : "border-[#06190d]/20 text-[#06190d] hover:bg-[#06190d]/5"
                  }`}
                >
                  {copiedState === "prompt" ? "✓ Másolva" : "Prompt másolása"}
                </button>
                <button
                  onClick={handleCopyPromptAndText}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all ${
                    copiedState === "both"
                      ? "bg-[#23472F] text-white"
                      : "bg-[#06190d] text-white hover:opacity-90"
                  }`}
                >
                  {copiedState === "both" ? "✓ Másolva" : "Prompt + szöveg másolása"}
                </button>
              </div>

              {/* Workspace return CTA */}
              {caseId && (
                <div className="mt-4 pt-4 border-t border-[#c3c8c1]/20">
                  <button
                    onClick={() => router.push(`/documents/compare?caseId=${encodeURIComponent(caseId)}&documentId=${encodeURIComponent(contract.id)}`)}
                    className="w-full py-3 text-xs font-bold uppercase tracking-widest bg-[#23472F] text-white hover:opacity-90 transition-colors"
                  >
                    Megnyitás Szerződés-workspace-ben
                  </button>
                  <p className="text-[10px] text-[#434843]/60 mt-2 text-center">
                    Az anonimizált szöveg innen már betölthető a workspace prompt paneljébe.
                  </p>
                </div>
              )}

              <div className="mt-2">
                <button
                  onClick={handleReset}
                  className="w-full py-2 text-xs font-bold uppercase tracking-widest border border-[#c3c8c1]/20 text-[#434843] hover:bg-[#f5f3ee]"
                >
                  Új anonimizálás
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-[#e4e2dd] px-4 py-4 sm:px-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-[#c3c8c1]/20 text-[#434843] hover:bg-[#f5f3ee]"
            >
              Mégse
            </button>
            <button
              onClick={handleAnonymize}
              disabled={isLoading || sourceTextLoading || !sourceTextAvailable || (aiTask === "CUSTOM" && !customPrompt)}
              className="min-w-0 px-4 py-2 text-xs font-bold uppercase tracking-widest bg-[#06190d] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed sm:px-6"
            >
              {isLoading ? "Feldolgozás..." : "Anonimizált másolat készítése"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
