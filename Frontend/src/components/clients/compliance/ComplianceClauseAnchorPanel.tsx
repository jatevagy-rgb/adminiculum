"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  complianceIntelligenceApi,
  type ComplianceAnchorType,
  type ComplianceClauseAnchorReadModel,
  type ComplianceClauseAnchorRow,
} from "@/lib/complianceIntelligenceApi";

/**
 * INTERNAL compliance workspace — structured legal matrix of one compliance
 * master document.
 *
 * This panel only DISPLAYS document-authored structured provenance that CDI-1
 * extracted from the document's own Word content controls. It deliberately makes
 * no legal statement: it never says a clause is compliant, non-compliant,
 * obsolete, or that a source changed. There is no monitoring and no AI
 * conclusion in this surface.
 *
 * INTERNAL ONLY: rendered only for INTERNAL_ANALYSIS links in the internal
 * compliance workspace. Nothing here is projected to the customer portal.
 */

const anchorTypeLabels: Record<ComplianceAnchorType, string> = {
  LEGAL: "Jogszabály",
  CASE: "Bírósági döntés",
  AUTHORITY: "Hatósági döntés",
};

const anchorTypeOrder: ComplianceAnchorType[] = ["LEGAL", "CASE", "AUTHORITY"];

/**
 * Readable Hungarian labels for the document-authored relation vocabulary
 * (`ADM-RELTYPE`). The stored token is a bounded machine token and must never be
 * rendered directly in the normal workforce card.
 *
 * This mirrors the backend's documented + observed vocabulary
 * (`Backend/src/modules/compliance-doc-intelligence/types.ts`). The vocabulary is
 * open-ended by design (an unknown but valid token is preserved verbatim and is
 * never rejected), so `relationTypeLabel` falls back to a neutral phrase for any
 * token outside this list instead of leaking it.
 */
const relationTypeLabels: Record<string, string> = {
  MANDATORY_BASIS: "Kötelező jogalap",
  LEGAL_LIMIT: "Jogi korlát",
  ROLE_DEFINITION: "Szerepkör-meghatározás",
  CONTRACTUAL_CHOICE: "Szerződéses választás",
  CONTRACTUAL_FRAMEWORK: "Szerződéses keret",
  CONDITIONAL_MANDATORY: "Feltételes kötelezettség",
  MANDATORY_INFO: "Kötelező tájékoztatás",
  UNSPECIFIED: "Nincs megjelölve",
  ACCOUNTABILITY: "Elszámoltathatóság",
  ADEQUACY_MECHANISM: "Megfelelőségi mechanizmus",
  AUTHORITY_CONTROL: "Hatósági kontroll",
  AUTHORIZED_PROCESSING: "Engedélyezett adatkezelés",
  AUTOMATED_DECISION_DISCLOSURE: "Automatizált döntés tájékoztatása",
  AUTOMATED_DECISION_RIGHT: "Automatizált döntéssel kapcsolatos jog",
  CASELAW_INTERPRETATION: "Bírói gyakorlat értelmezése",
  CONDITIONAL_CROSS_BORDER: "Feltételes határon átnyúló adatkezelés",
  CONDITIONAL_EXCEPTION: "Feltételes kivétel",
  CONDITIONAL_REQUIREMENT: "Feltételes követelmény",
  CONDITIONAL_TRANSFER_BASIS: "Feltételes továbbítási jogalap",
  CONFIDENTIALITY: "Titoktartás",
  CONFLICTS_RULE: "Összeférhetetlenségi szabály",
  CONFLICT_GUARDRAIL: "Összeférhetetlenségi korlát",
  CONSENT_REQUIREMENT: "Hozzájárulási követelmény",
  CONSENT_WITHDRAWAL: "Hozzájárulás visszavonása",
  CONTRACTUAL_ALLOCATION: "Szerződéses feladatmegosztás",
  CONTRACTUAL_GUARDRAIL: "Szerződéses korlát",
  CONTRACTUAL_IMPLEMENTATION: "Szerződéses megvalósítás",
  CONTRACT_FORMATION: "Szerződéskötés",
  CONTRACT_PARTY_SEPARATION: "Szerződő felek szétválasztása",
  COOKIE_RULE: "Sütiszabály",
  CORRECTION_CONSEQUENCE: "Helyesbítés következménye",
  DATA_MINIMISATION: "Adattakarékosság",
  DATA_PROCESSOR_CONTRACT: "Adatfeldolgozói szerződés",
  DATA_PROTECTION_CONTEXT: "Adatvédelmi kontextus",
  DATA_PROTECTION_PRINCIPLE: "Adatvédelmi alapelv",
  DATA_PROTECTION_ROLE: "Adatvédelmi szerepkör",
  DATA_SUBJECT_RIGHT: "Érintetti jog",
  DEADLINE_BASIS: "Határidő jogalapja",
  DOCUMENTATION_BASIS: "Dokumentálási jogalap",
  DOCUMENTATION_DUTY: "Dokumentálási kötelezettség",
  ENFORCEMENT_BENCHMARK: "Hatósági gyakorlat mércéje",
  EVIDENCE_CONTEXT: "Bizonyíték-kontextus",
  EVIDENCE_RETENTION: "Bizonyíték megőrzése",
  EXEMPTION_RULE: "Mentességi szabály",
  FURTHER_PURPOSE_NOTICE: "További célú felhasználás tájékoztatása",
  INCIDENT_DUTY: "Incidenskezelési kötelezettség",
  INDEPENDENCE_STANDARD: "Függetlenségi követelmény",
  INDIRECT_DATA_CATEGORY: "Közvetett adatkategória",
  INDIRECT_RECIPIENT_TRANSPARENCY: "Közvetett címzett-tájékoztatás",
  INDIRECT_SOURCE_DISCLOSURE: "Közvetett forrás felfedése",
  INDIRECT_TRANSPARENCY: "Közvetett tájékoztatás",
  INTEGRITY_CONFIDENTIALITY: "Integritás és bizalmasság",
  INTERPRETATION: "Értelmezés",
  JUDICIAL_REMEDY: "Bírósági jogorvoslat",
  JURISDICTION_CONTEXT: "Joghatósági kontextus",
  LEGAL_BASIS: "Jogalap",
  LEGAL_CONSEQUENCE: "Jogkövetkezmény",
  LEGAL_GUARDRAIL: "Jogi korlát",
  LEGAL_PROTECTION: "Jogi védelem",
  LIABILITY_BASELINE: "Felelősségi alapvonal",
  MANDATORY_EVIDENCE: "Kötelező bizonyíték",
  MANDATORY_INFORMATION: "Kötelező tájékoztatás",
  OUTPUT_DUTY: "Eredményközlési kötelezettség",
  PERSONALITY_RIGHT: "Személyiségi jog",
  PRECONDITION_DOCUMENTATION: "Előfeltétel dokumentálása",
  PROCESSOR_FRAMEWORK: "Adatfeldolgozói keret",
  PROCESSOR_INSTRUCTION: "Adatfeldolgozói utasítás",
  PROFESSIONAL_CONTENT: "Szakmai tartalom",
  PROFESSIONAL_RESPONSIBILITY: "Szakmai felelősség",
  PROFESSIONAL_RESULT: "Szakmai eredmény",
  PROFESSIONAL_SCOPE: "Szakmai hatókör",
  PROFESSIONAL_STANDARD: "Szakmai követelmény",
  PROHIBITION: "Tilalom",
  RECIPIENT_TRANSPARENCY: "Címzett-tájékoztatás",
  REGISTRY_CONTENT: "Nyilvántartási tartalom",
  REGISTRY_OBLIGATION: "Nyilvántartási kötelezettség",
  REGISTRY_REPORTING: "Nyilvántartási jelentés",
  REQUEST_DEADLINE: "Kérelem határideje",
  RETENTION: "Megőrzés",
  RETENTION_BASIS: "Megőrzési jogalap",
  RETENTION_REQUIREMENT: "Megőrzési követelmény",
  ROLE_ALLOCATION: "Szerepkör-megosztás",
  ROLE_DEPENDENT: "Szerepkörfüggő",
  ROLE_GUARDRAIL: "Szerepkör-korlát",
  SAFEGUARD_MECHANISM: "Védelmi mechanizmus",
  SCC_MECHANISM: "Standard szerződéses kikötés",
  SECTORAL_BASIS: "Ágazati jogalap",
  SECURITY_CONTEXT: "Biztonsági kontextus",
  SECURITY_CONTROL: "Biztonsági intézkedés",
  SECURITY_REQUIREMENT: "Biztonsági követelmény",
  SECURITY_RISK_ASSESSMENT: "Biztonsági kockázatértékelés",
  STATUTORY_BASELINE: "Törvényi alapvonal",
  STATUTORY_CONTEXT: "Törvényi kontextus",
  STATUTORY_DEFAULT: "Törvényi alapértelmezés",
  STATUTORY_MODEL: "Törvényi minta",
  STORAGE_LIMITATION: "Tárolási korlát",
  SUBPROCESSOR_AUTHORIZATION: "Alfeldolgozó engedélyezése",
  SUBPROCESSOR_FLOWDOWN: "Alfeldolgozói továbbadás",
  SUPERVISORY_REMEDY: "Hatósági jogorvoslat",
  SURVIVAL_RETENTION: "Szerződés megszűnését túlélő megőrzés",
  TRANSFER_REQUIREMENT: "Továbbítási követelmény",
  TRANSFER_TRANSPARENCY: "Továbbítási tájékoztatás",
  TRANSPARENCY_REQUIREMENT: "Átláthatósági követelmény",
  UI_MANDATORY_GATE: "Kötelező felületi kapu",
  VERIFICATION_BASIS: "Ellenőrzési jogalap",
};

const UNKNOWN_RELATION_TYPE_LABEL = "Nem besorolt kapcsolat";

/** Present one document-authored relation token as a readable Hungarian label. */
export function relationTypeLabel(value: string | null | undefined): string {
  const key = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!key) return UNKNOWN_RELATION_TYPE_LABEL;
  return relationTypeLabels[key] ?? UNKNOWN_RELATION_TYPE_LABEL;
}

/**
 * Display-only locator humanizer.
 *
 * The persisted locator is opaque and is never rewritten (see
 * `docs/compliance/COMPLIANCE_MONITORING_MANIFEST_V1.md`). For the NORMAL
 * workforce card only, a locator composed exclusively of the two documented,
 * unambiguous legislative keys is rendered as a human citation; anything else
 * that carries implementation syntax is omitted rather than guessed at.
 *
 *   `art=28;par=3`  ->  `28. cikk (3) bekezdés`
 *   `5/2/b`         ->  `5/2/b`            (plain locator, no implementation syntax)
 *   `sec=15/B;par=4`->  null               (unrecognized key: never invented)
 *   `paras=41-45`   ->  null               (unrecognized key: never invented)
 */
const LOCATOR_TOKEN_RENDERERS: Record<string, (value: string) => string | null> = {
  art: (value) => (/^\d+[A-Za-z]?$/.test(value) ? `${value}. cikk` : null),
  par: (value) => (/^\d+$/.test(value) ? `(${value}) bekezdés` : null),
};

export function humanizeLocator(value: string | null | undefined): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (!raw.includes("=")) return raw;

  const rendered: string[] = [];
  for (const part of raw.split(";").map((token) => token.trim()).filter(Boolean)) {
    const separator = part.indexOf("=");
    if (separator <= 0) return null;
    const render = LOCATOR_TOKEN_RENDERERS[part.slice(0, separator).trim().toLowerCase()];
    const text = render ? render(part.slice(separator + 1).trim()) : null;
    if (!text) return null;
    rendered.push(text);
  }
  return rendered.length ? rendered.join(" ") : null;
}

/** An absolute http(s) value is the only thing rendered as a link. */
export function isHttpUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

/**
 * Every meaningful row field the read model already transports, in the order the
 * row displays them. Free-text search covers all of these so an internal reader
 * can find a row by any identifier that is visible in it — not only its clause.
 */
const SEARCHABLE_ROW_FIELDS = [
  "clauseRef",
  "clauseTitle",
  "anchorDisplay",
  "canonicalReference",
  "anchorKey",
  "eli",
  "celex",
  "locator",
  "ecli",
  "caseId",
  "caseLocator",
  "decisionId",
  "authorityLocator",
  "sourceUrl",
  "rationale",
] as const;

function searchTextOf(row: ComplianceClauseAnchorRow): string {
  return SEARCHABLE_ROW_FIELDS.map((field) => row[field])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

/**
 * Search-only projection of one row.
 *
 * Peter transports a canonical `TV/<year>/<act>` reference as `T/<year>/<act>`;
 * the backend normalizes `T` → `TV` before storage, so the canonical value never
 * contains the alias. Matching both spellings here keeps search usable without
 * persisting, displaying, or re-emitting the alias.
 */
function searchableRowText(row: ComplianceClauseAnchorRow): string {
  const canonical = searchTextOf(row);
  const alias = canonical.replace(/TV\//g, "T/");
  return alias === canonical ? canonical : `${canonical} ${alias}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("hu-HU");
  } catch {
    return value;
  }
}

const caseIdentifier = (row: ComplianceClauseAnchorRow): string | null => row.caseId || humanizeLocator(row.caseLocator);
const authorityLocators = (row: ComplianceClauseAnchorRow): string | null =>
  [humanizeLocator(row.authorityLocator), humanizeLocator(row.locator)].filter(Boolean).join(" · ") || null;

/**
 * A hyperlink-transported TV reference has no CELEX by construction, so its
 * unresolved binding is stated as such instead of being presented as a malformed
 * CELEX identifier. CELEX rows keep the unchanged wording below.
 */
const TV_REFERENCE_BINDING_REASON = "TV-hivatkozás; C3A CELEX-kötés nem alkalmazható";

/** Neutral Hungarian labels for the internal binding outcome reasons. */
const bindingReasonLabels: Record<string, string> = {
  NO_CELEX: "nincs CELEX azonosító",
  INVALID_CELEX: "a CELEX azonosító nem a támogatott formátumú",
  SOURCE_NOT_FOUND: "nincs ilyen egyedi kanónikus forrás",
  NO_BINDABLE_VERSION: "nincs jóváhagyott, aktív forrásverzió",
  AMBIGUOUS_BINDABLE_VERSION: "több egyedi találat, ezért nem oldható fel",
};

/**
 * Readable Hungarian labels for the parser's internal processing codes.
 *
 * These stay visible to the internal reader as a plain-language signal, but the
 * raw machine token (and any transported payload such as a source label) is
 * never rendered in the normal workforce compliance card. Unknown codes fall
 * back to a neutral phrase instead of leaking an unrecognized token.
 */
const ingestWarningLabels: Record<string, string> = {
  RELATION_TYPE_MISSING: "A dokumentum nem jelöli a kapcsolat típusát",
  RELATION_TYPE_UNPARSEABLE: "A dokumentum kapcsolat-típusa nem értelmezhető",
  CLAUSE_VALUE_MISSING: "A hivatkozott pont megjelölése hiányzik",
  CLAUSE_VALUE_FROM_ALIAS: "A pont megjelölése a dokumentum alternatív címkéjéből származik",
  PENDING_ANCHOR_CONTROL: "A hivatkozás jelölése félkész a dokumentumban",
  ANCHOR_DISPLAY_FROM_ALIAS: "A hivatkozás megnevezése alternatív címkéből származik",
  ANCHOR_KEY_UNRESOLVED: "A dokumentum nem tartalmaz ehhez elég gépi azonosítót",
  ORPHAN_ANCHOR_METADATA: "Gazdátlan hivatkozás-metaadat a dokumentumban",
  LOOSE_ANCHOR_METADATA: "Táblázaton kívüli hivatkozás-metaadat a dokumentumban",
  LEGACY_CITATION_COLUMNS: "Régi formátumú hivatkozás-oszlop a dokumentumban",
  DUPLICATE_ANCHOR_METADATA: "Ismétlődő hivatkozás-metaadat a dokumentumban",
  ROW_WITHOUT_ANCHOR_CONTROL: "Hivatkozás nélküli sor a dokumentumban",
  ROW_WITHOUT_CLAUSE_CONTROL: "Pontmegjelölés nélküli sor a dokumentumban",
  CONTROL_OUTSIDE_TABLE_ROW: "Táblázaton kívüli jelölő a dokumentumban",
  TAG_MALFORMED: "Hibás szerkezetű jelölő a dokumentumban",
  UNKNOWN_ADM_CONTROL_KIND: "Ismeretlen típusú jelölő a dokumentumban",
  UNKNOWN_RELATION_TYPE: "Nem szokványos kapcsolat-típus a dokumentumban",
  MULTILINE_CONTROL_VALUE: "Többsoros jelölőérték a dokumentumban",
  RELATION_TYPE_SOURCE_LABEL: "A dokumentum saját kapcsolat-megjelölése",
  ROW_LIMIT_REACHED: "A feldolgozott sorok száma elérte a korlátot",
  XML_UNCLOSED_ELEMENTS: "Lezáratlan szerkezeti elem a dokumentumban",
  HYPERLINK_LEGAL_ANCHOR_USED: "Hivatkozás alapján azonosított jogi forrás",
  HYPERLINK_LEGAL_ANCHOR_NO_DISPLAY: "Hivatkozás jogi forrás megnevezése nélkül",
  HYPERLINK_RELATIONSHIP_UNRESOLVED: "Nem feloldható hivatkozás a dokumentumban",
  HYPERLINK_LIMIT_REACHED: "A feldolgozott hivatkozások száma elérte a korlátot",
};

const UNKNOWN_INGEST_WARNING_LABEL = "Feldolgozási jelzés a dokumentumból";

/** Map one persisted processing code to its readable label, payload-stripped. */
export function ingestWarningLabel(code: string): string {
  const base = code.split(":")[0];
  return ingestWarningLabels[base] ?? UNKNOWN_INGEST_WARNING_LABEL;
}

/** Readable, de-duplicated labels for a row's processing codes. */
export function ingestWarningTexts(codes: string[]): string[] {
  return [...new Set(codes.map(ingestWarningLabel))];
}

/**
 * Truthful canonical binding line (INTERNAL only).
 *
 * A resolved binding shows the stored canonical citation/title when the registry
 * actually has one. When no readable identity is stored the line is omitted: an
 * internal transport key (e.g. `EU-<celex>`) is never leaked into the normal
 * workforce card as a stand-in legal name.
 */
function bindingLine(row: ComplianceClauseAnchorRow) {
  const status = row.legalSourceBindingStatus;
  if (!status) return null;

  if (status === "RESOLVED") {
    const label = row.canonicalTitle || row.canonicalCitation;
    if (!label) return null;
    return (
      <p className="mt-1 text-xs text-[var(--adm-text)]" data-testid="clause-anchor-binding">
        Kanónikus forrás: <b>{label}</b>
        {row.canonicalTitle && row.canonicalCitation ? ` · ${row.canonicalCitation}` : ""}
        {row.bindingOrigin === "READ_TIME_EXACT_CELEX" ? (
          <span className="ml-1 text-[var(--adm-text-muted)]">(CELEX egyezés, nem tárolt)</span>
        ) : (
          <span className="ml-1 text-[var(--adm-text-muted)]">(verzió feldolgozásakor rögzítve)</span>
        )}
      </p>
    );
  }

  return (
    <p className="mt-1 text-xs text-[var(--adm-text-muted)]" data-testid="clause-anchor-binding-unresolved">
      Kanónikus forrás: nincs egyedi találat
      {row.canonicalReference
        ? ` — ${TV_REFERENCE_BINDING_REASON}`
        : row.bindingReason
          ? ` — ${bindingReasonLabels[row.bindingReason] ?? "nem oldható fel"}`
          : ""}
    </p>
  );
}

function metaField({ label, value, mono = false, href = null }: { label: string; value: string | null; mono?: boolean; href?: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0" key={label}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className={`block break-all text-xs text-[var(--adm-green-800)] underline ${mono ? "font-mono" : ""}`}
        >
          {value}
        </a>
      ) : (
        <p className={`break-words text-xs text-[var(--adm-text)] ${mono ? "font-mono" : ""}`}>{value}</p>
      )}
    </div>
  );
}

function clauseAnchorRow(row: ComplianceClauseAnchorRow) {
  const warnings = row.ingestWarnings ?? [];
  return (
    <li
      key={row.id}
      className="rounded border border-[var(--adm-border)] bg-white p-3"
      data-testid="clause-anchor-row"
      data-anchor-type={row.anchorType}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-[var(--adm-text)]">{row.clauseRef}</p>
          {row.clauseTitle ? <p className="mt-0.5 text-xs text-[var(--adm-text-muted)]">{row.clauseTitle}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-0.5 text-[10px] text-[var(--adm-text)]">
            {relationTypeLabel(row.relationType)}
          </span>
          <span className="rounded border border-[var(--adm-border)] bg-white px-2 py-0.5 text-[10px] text-[var(--adm-text)]">
            {anchorTypeLabels[row.anchorType] ?? row.anchorType}
          </span>
        </div>
      </div>

      <p className="mt-2 text-sm text-[var(--adm-text)]">{row.anchorDisplay}</p>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {metaField({ label: "ELI", value: row.eli, mono: true, href: isHttpUrl(row.eli) ? row.eli : null })}
        {metaField({ label: "Norma helye", value: humanizeLocator(row.locator) })}
        {metaField({ label: "ECLI", value: row.ecli, mono: true })}
        {metaField({ label: "Ügyszám", value: caseIdentifier(row), mono: true })}
        {metaField({ label: "Bírósági hely", value: humanizeLocator(row.caseLocator) })}
        {metaField({ label: "Döntés azonosítója", value: row.decisionId, mono: true })}
        {metaField({ label: "Hatósági hely", value: authorityLocators(row) })}
        {metaField({ label: "Forrás URL", value: row.sourceUrl, href: isHttpUrl(row.sourceUrl) ? row.sourceUrl : null })}
      </div>

      {row.rationale ? (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Kapcsolat / indok</p>
          <p className="mt-0.5 text-xs text-[var(--adm-text)]">{row.rationale}</p>
        </div>
      ) : null}

      <div className="mt-2 border-t border-[var(--adm-border)] pt-2">
        {row.canonicalReference
          ? metaField({ label: "Figyelési azonosító", value: row.canonicalReference, mono: true })
          : null}
        {row.anchorKey ? null : (
          <p className="text-xs text-[var(--adm-ochre-500)]" data-testid="anchor-key-unresolved">
            Nincs stabil hivatkozás-azonosító: a dokumentum nem tartalmaz ehhez elég gépi azonosítót.
          </p>
        )}
        {bindingLine(row)}
        {warnings.length ? (
          <div className="mt-2" data-testid="clause-anchor-warnings">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Belső feldolgozási jelzés</p>
            <ul className="mt-0.5 space-y-0.5">
              {ingestWarningTexts(warnings).map((label) => (
                <li key={label} className="text-[10px] text-[var(--adm-text-muted)]">{label}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function versionProvenance({
  versions,
  selectedDocumentVersionId,
  onSelect,
}: {
  versions: ComplianceClauseAnchorReadModel["versions"];
  selectedDocumentVersionId: string;
  onSelect: (documentVersionId: string) => void;
}) {
  const selected = versions.find((version) => version.documentVersionId === selectedDocumentVersionId);
  if (!selected) return null;
  const ingestedAt = selected.rows.reduce<string | null>((latest, row) => {
    if (!row.ingestedAt) return latest;
    return !latest || row.ingestedAt > latest ? row.ingestedAt : latest;
  }, null);
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Dokumentumverzió</span>
        <select
          className="mt-1 rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-xs text-[var(--adm-text)]"
          value={selected.documentVersionId}
          onChange={(event) => onSelect(event.target.value)}
        >
          {versions.map((version) => (
            <option key={version.documentVersionId} value={version.documentVersionId}>
              {`v${version.version} · ${version.rows.length} tétel${version.isCurrent ? " · aktuális" : ""}`}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[10px] text-[var(--adm-text-muted)]">
        Kinyerve: {formatDate(ingestedAt)} · A verziók külön provenance-t őriznek, a korábbi verzió tételei nem íródnak át.
      </p>
    </div>
  );
}

/**
 * Bounded auto-refresh for a freshly uploaded INTERNAL_ANALYSIS document.
 * CDI ingestion is scheduled fire-and-forget at linkage time, so the very first
 * read can legitimately be empty. The panel retries a SMALL, bounded number of
 * times and stops as soon as rows arrive; documents that legitimately have no
 * anchors simply stop after the cap. This is display-only: it never triggers or
 * controls ingestion/monitoring.
 */
const AUTO_MATRIX_MAX_ATTEMPTS = 6;
const AUTO_MATRIX_REFRESH_MS = 2500;

export function ComplianceClauseAnchorPanel({
  clientId,
  documentId,
  autoRefreshWhileEmpty = false,
}: {
  clientId: string;
  documentId: string;
  autoRefreshWhileEmpty?: boolean;
}) {
  const [data, setData] = useState<ComplianceClauseAnchorReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [clauseQuery, setClauseQuery] = useState("");
  const [relationType, setRelationType] = useState("");
  const [anchorType, setAnchorType] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [matrixCollapsed, setMatrixCollapsed] = useState(false);
  const [autoRefreshAttempts, setAutoRefreshAttempts] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const model = await complianceIntelligenceApi.clauseAnchors(clientId, documentId);
      setData(model);
      const versions = model.versions ?? [];
      const preferred =
        versions.find((version) => version.isCurrent && version.rows.length) ||
        versions.find((version) => version.rows.length) ||
        versions[0] ||
        null;
      setSelectedVersionId(preferred ? preferred.documentVersionId : null);
    } catch {
      setError("A dokumentum jogi mátrixa jelenleg nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [clientId, documentId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => { setAutoRefreshAttempts(0); }, [documentId]);

  const totalAnchorRows = useMemo(
    () => (data?.versions ?? []).reduce((sum, version) => sum + (version.rows?.length ?? 0), 0),
    [data],
  );

  // Bounded: at most AUTO_MATRIX_MAX_ATTEMPTS refreshes, stopping at the first row.
  useEffect(() => {
    if (!autoRefreshWhileEmpty || loading || error || totalAnchorRows > 0) return;
    if (autoRefreshAttempts >= AUTO_MATRIX_MAX_ATTEMPTS) return;
    const timer = setTimeout(() => {
      setAutoRefreshAttempts((value) => value + 1);
      void load();
    }, AUTO_MATRIX_REFRESH_MS);
    return () => clearTimeout(timer);
  }, [autoRefreshWhileEmpty, loading, error, totalAnchorRows, autoRefreshAttempts, load]);

  const versions = useMemo(() => data?.versions ?? [], [data]);
  const selectedVersion = useMemo(
    () => versions.find((version) => version.documentVersionId === selectedVersionId) ?? versions[0] ?? null,
    [versions, selectedVersionId],
  );
  const rows = useMemo(() => selectedVersion?.rows ?? [], [selectedVersion]);

  const relationTypes = useMemo(() => Array.from(new Set(rows.map((row) => row.relationType))).sort(), [rows]);
  const unresolvedCount = useMemo(() => rows.filter((row) => !row.anchorKey).length, [rows]);
  const warnedCount = useMemo(() => rows.filter((row) => (row.ingestWarnings ?? []).length > 0).length, [rows]);

  const visibleRows = useMemo(() => {
    const query = clauseQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (query) {
        const haystack = searchableRowText(row).toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (relationType && row.relationType !== relationType) return false;
      if (anchorType && row.anchorType !== anchorType) return false;
      if (unresolvedOnly && row.anchorKey) return false;
      return true;
    });
  }, [rows, clauseQuery, relationType, anchorType, unresolvedOnly]);

  const hasAnyRows = versions.some((version) => version.rows.length > 0);

  return (
    <div className="mt-2 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3" data-testid="compliance-clause-anchor-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">
          Jogi hivatkozások mátrixa
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[10px] text-[var(--adm-text-muted)]">
            A dokumentum saját, gépi azonosítóval jelölt hivatkozásai. Ez nem jogi értékelés.
          </p>
          {!loading && !error && hasAnyRows ? (
            <button
              type="button"
              data-testid="clause-anchor-toggle"
              aria-expanded={!matrixCollapsed}
              aria-controls="compliance-clause-anchor-matrix"
              onClick={() => setMatrixCollapsed((value) => !value)}
              className="rounded border border-[var(--adm-border)] bg-white px-2 py-0.5 text-[10px] text-[var(--adm-text)]"
            >
              {matrixCollapsed ? "Mátrix megnyitása" : "Mátrix összecsukása"}
            </button>
          ) : null}
        </div>
      </div>

      {loading ? <p className="mt-3 text-xs text-[var(--adm-text-muted)]">Betöltés…</p> : null}
      {!loading && error ? (
        <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
          <button type="button" onClick={() => void load()} className="ml-3 rounded border border-[var(--adm-border)] bg-white px-2 py-0.5 text-[10px] text-[var(--adm-text)]">
            Újrapróbálás
          </button>
        </div>
      ) : null}

      {!loading && !error && !hasAnyRows ? (
        <div className="mt-3 text-xs text-[var(--adm-text-muted)]" data-testid="clause-anchor-empty">
          <p>Ehhez a dokumentumhoz még nincs kinyert jogi hivatkozás-mátrix.</p>
          <p className="mt-1">
            A mátrix csak olyan belső elemzési master dokumentumból készül, amely gépi azonosítóval jelölt hivatkozásokat
            tartalmaz. A csak szövegként megadott hivatkozásokat tartalmazó dokumentumokból nem készül mátrix.
          </p>
        </div>
      ) : null}

      {!loading && !error && hasAnyRows ? (
        matrixCollapsed ? (
          <p className="mt-3 text-[10px] text-[var(--adm-text-muted)]" data-testid="clause-anchor-counts">
            {`Megjelenítve: ${visibleRows.length} / ${rows.length} tétel · Azonosító nélkül: ${unresolvedCount} · Feldolgozási jelzéssel: ${warnedCount}`}
          </p>
        ) : (
        <div id="compliance-clause-anchor-matrix" className="mt-3 space-y-3">
          {selectedVersion
            ? versionProvenance({ versions, selectedDocumentVersionId: selectedVersion.documentVersionId, onSelect: setSelectedVersionId })
            : null}

          <div className="grid gap-2 sm:grid-cols-4">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Tétel keresése</span>
              <input
                type="text"
                className="mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-xs text-[var(--adm-text)]"
                placeholder="pl. 1.1."
                value={clauseQuery}
                onChange={(event) => setClauseQuery(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Kapcsolat típusa</span>
              <select
                className="mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-xs text-[var(--adm-text)]"
                value={relationType}
                onChange={(event) => setRelationType(event.target.value)}
              >
                <option value="">Összes</option>
                {relationTypes.map((type) => (
                  <option key={type} value={type}>{relationTypeLabel(type)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Hivatkozás fajtája</span>
              <select
                className="mt-1 w-full rounded border border-[var(--adm-border)] bg-white px-2 py-1 text-xs text-[var(--adm-text)]"
                value={anchorType}
                onChange={(event) => setAnchorType(event.target.value)}
              >
                <option value="">Összes</option>
                {anchorTypeOrder.map((type) => (
                  <option key={type} value={type}>{anchorTypeLabels[type]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-1">
              <input type="checkbox" checked={unresolvedOnly} onChange={(event) => setUnresolvedOnly(event.target.checked)} />
              <span className="text-xs text-[var(--adm-text)]">Csak azonosító nélküli tételek</span>
            </label>
          </div>

          <p className="text-[10px] text-[var(--adm-text-muted)]" data-testid="clause-anchor-counts">
            {`Megjelenítve: ${visibleRows.length} / ${rows.length} tétel · Azonosító nélkül: ${unresolvedCount} · Feldolgozási jelzéssel: ${warnedCount}`}
          </p>

          {rows.length === 0 ? (
            <p className="text-xs text-[var(--adm-text-muted)]" data-testid="clause-anchor-version-empty">
              Ehhez a verzióhoz nincs kinyert tétel.
            </p>
          ) : visibleRows.length === 0 ? (
            <p className="text-xs text-[var(--adm-text-muted)]">Nincs a szűrésnek megfelelő tétel.</p>
          ) : (
            <ul className="space-y-2">{visibleRows.map((row) => clauseAnchorRow(row))}</ul>
          )}
        </div>
        )
      ) : null}
    </div>
  );
}
