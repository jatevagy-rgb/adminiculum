/**
 * Presentation mapping for the internal Compliance Workbench (UX-13).
 *
 * Backend canonical state codes stay authoritative in the API and in the
 * component's decision logic. This module is the single boundary that turns
 * those codes into human-facing Hungarian labels. Unknown canonical codes must
 * fall back to a neutral label — never be printed as a raw token, and never be
 * presented as a success.
 *
 * The MISSING_FACT outcome wording mirrors `complianceOutcomeLabels` in
 * `components/clients/compliance/ComplianceOverview.tsx` so the two workforce
 * Compliance surfaces stay consistent.
 */

export const WORKBENCH_KIND_LABELS: Record<string, string> = {
  MISSING_FACT: "Hiányzó adat",
  SUBMISSION: "Ügyfélbeküldés",
  STALE_EVIDENCE: "Bizonyíték felülvizsgálata",
  PROPOSAL: "Intézkedés",
  SOURCE_IMPACT: "Jogforráshatás",
};

/** Canonical applicability outcomes used as a MISSING_FACT row's status. */
export const WORKBENCH_OUTCOME_LABELS: Record<string, string> = {
  APPLIES: "Belső értékelés szerint releváns",
  DOES_NOT_APPLY: "Nem releváns",
  INSUFFICIENT_FACTS: "Nincs elég adat",
  LEGAL_REVIEW_REQUIRED: "Jogi felülvizsgálat szükséges",
  TECHNICAL_REVIEW_REQUIRED: "Technikai felülvizsgálat szükséges",
  SOURCE_SUPPORT_INSUFFICIENT: "Nem elégséges forrástámogatás",
};

/** Standalone canonical statuses (submission, evidence, observation, proposal, task). */
export const WORKBENCH_STATUS_LABELS: Record<string, string> = {
  // client submissions
  SUBMITTED: "Beküldve",
  SCANNING: "Vizsgálat alatt",
  RECEIVED: "Beérkezett",
  UNDER_INTERNAL_REVIEW: "Belső felülvizsgálat alatt",
  CORRECTION_REQUESTED: "Javítás kérve",
  ACCEPTED_INTO_MATTER: "Ügyirathoz elfogadva",
  // evidence records
  PROVIDED: "Szolgáltatva",
  UNDER_REVIEW: "Felülvizsgálat alatt",
  // legal source observations
  NEW: "Új",
  IN_REVIEW: "Felülvizsgálat alatt",
  IMPACT_CONFIRMED: "Hatás megerősítve",
  // compliance proposals
  PROPOSED: "Javasolt",
  CONFIRMED: "Megerősítve",
  // task lifecycle (proposal composite status)
  OPEN: "Nyitott",
  PENDING: "Függőben",
  IN_PROGRESS: "Folyamatban",
  BLOCKED: "Akadályozott",
  COMPLETED: "Befejezve",
  CANCELLED: "Törölve",
};

/** Canonical recorded impact-decision kinds. */
export const IMPACT_DECISION_LABELS: Record<string, string> = {
  NO_ACTION: "Nincs további teendő",
  REEVALUATE: "Meglévő szabályok újraértékelése",
  REMEDIATION: "Meglévő javaslatból ügy / feladat",
  RULE_REVIEW: "Követelmény felülvizsgálati tervezete",
};

export const UNKNOWN_WORKBENCH_STATUS = "Ismeretlen állapot";

/**
 * Canonical AssessmentFinding operational statuses (the finding's own lifecycle,
 * distinct from its applicability outcome). Ordinary presentation must not print
 * the raw token (`OPEN`, `RESOLVED`, …).
 */
export const COMPLIANCE_FINDING_STATUS_LABELS: Record<string, string> = {
  OPEN: "Nyitott",
  ACKNOWLEDGED: "Tudomásul véve",
  ACTION_PLANNED: "Intézkedés tervezve",
  RESOLVED: "Megoldva",
};

export function complianceFindingStatusLabel(status: string | null | undefined): string {
  const key = String(status || "").trim().toUpperCase();
  if (!key) return UNKNOWN_WORKBENCH_STATUS;
  return COMPLIANCE_FINDING_STATUS_LABELS[key] || UNKNOWN_WORKBENCH_STATUS;
}

/**
 * The backend materializes a bounded English next-step instruction for each
 * finding (`Review and address this applicable requirement.` / `Resolve the
 * applicability evidence …`). Ordinary presentation shows a Hungarian equivalent
 * instead of the persisted English text; any unrecognized value degrades to a
 * neutral Hungarian instruction rather than leaking English or a raw token.
 */
const COMPLIANCE_RECOMMENDATION_LABELS: Record<string, string> = {
  "Review and address this applicable requirement.":
    "Tekintse át és kezelje ezt a releváns követelményt.",
  "Resolve the applicability evidence before treating this requirement as determined.":
    "A követelmény meghatározottként kezelése előtt tisztázni kell az alkalmazhatósági bizonyítékot.",
};

export const UNKNOWN_COMPLIANCE_RECOMMENDATION_LABEL = "Belső áttekintés szükséges.";

export function complianceRecommendationLabel(recommendation: string | null | undefined): string | null {
  const trimmed = String(recommendation || "").trim();
  if (!trimmed) return null;
  return COMPLIANCE_RECOMMENDATION_LABELS[trimmed] ?? UNKNOWN_COMPLIANCE_RECOMMENDATION_LABEL;
}

/** `STALE:<status>` composite emitted for expired evidence records. */
const STALE_PREFIX = "STALE:";
/** `DECIDED:<kind>` composite emitted for observations with a recorded decision. */
const DECIDED_PREFIX = "DECIDED:";

function statusTokenLabel(token: string): string {
  return WORKBENCH_OUTCOME_LABELS[token] || WORKBENCH_STATUS_LABELS[token] || UNKNOWN_WORKBENCH_STATUS;
}

export function workbenchKindLabel(kind: string): string {
  return WORKBENCH_KIND_LABELS[kind] || "Ismeretlen tételtípus";
}

export function impactDecisionLabel(kind: string): string {
  return IMPACT_DECISION_LABELS[kind] || UNKNOWN_WORKBENCH_STATUS;
}

/**
 * Human-facing status label for a workbench row. Explicitly handles the bounded
 * composite statuses the backend emits and falls back to a neutral label for any
 * unrecognized canonical code, so a raw state token never reaches the screen.
 */
export function workbenchStatusLabel(row: { kind: string; status: string }): string {
  const status = row.status;
  if (!status) return UNKNOWN_WORKBENCH_STATUS;

  if (row.kind === "STALE_EVIDENCE" && status.startsWith(STALE_PREFIX)) {
    return `Lejárt · ${statusTokenLabel(status.slice(STALE_PREFIX.length))}`;
  }

  if (row.kind === "PROPOSAL" && status.includes(":")) {
    const [proposalStatus, taskStatus] = status.split(":");
    return `${statusTokenLabel(proposalStatus)} · feladat: ${statusTokenLabel(taskStatus)}`;
  }

  if (row.kind === "SOURCE_IMPACT" && status.startsWith(DECIDED_PREFIX)) {
    return `Döntés rögzítve · ${impactDecisionLabel(status.slice(DECIDED_PREFIX.length))}`;
  }

  return statusTokenLabel(status);
}
