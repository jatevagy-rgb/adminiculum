/**
 * Canonical company-profile draft <-> persisted answer bridge.
 *
 * The Company Profile wizard edits a local `DraftValue` per question key and
 * only turns it into a persisted answer payload on save. Both directions are
 * pure, so they are unit-testable without the component or the API.
 *
 * Persisted UNKNOWN is a real answer state. It carries no value and must be
 * reconstructed as UNKNOWN — never coerced into ANSWERED or dropped as if the
 * question had never been answered.
 */
import type { PortalCompanyProfileAnswerPayload, PortalCompanyProfileQuestion } from "./clientPortalApi";

export type DraftValue = {
  status: "ANSWERED" | "UNKNOWN";
  numberValue?: string;
  booleanValue?: boolean;
  stringValue?: string;
  enumValue?: string;
  jsonValue?: string[];
};

/** The persisted question fields the draft bridge reads. */
export type DraftQuestion = Pick<
  PortalCompanyProfileQuestion,
  "questionKey" | "valueType" | "status" | "value" | "integerOnly"
>;

/**
 * Reconstructs the editable draft for one persisted discovery question.
 *
 * UNKNOWN is resolved FIRST, before any ANSWERED-value parsing: it produces
 * `{ status: "UNKNOWN" }` with no value. Truly unanswered questions produce no
 * draft, which is what keeps "never answered" distinct from "answered unknown".
 */
export function valueToDraft(question: DraftQuestion): DraftValue | undefined {
  if (question.status === "UNKNOWN") return { status: "UNKNOWN" };
  if (question.status !== "ANSWERED" || question.value === null || question.value === undefined) return undefined;
  if (Array.isArray(question.value)) return { status: "ANSWERED", jsonValue: [...question.value] };
  if (question.valueType === "NUMBER" && typeof question.value === "number") return { status: "ANSWERED", numberValue: String(question.value) };
  if (question.valueType === "BOOLEAN" && typeof question.value === "boolean") return { status: "ANSWERED", booleanValue: question.value };
  if (question.valueType === "ENUM" || question.valueType === "JURISDICTION") return { status: "ANSWERED", enumValue: String(question.value) };
  return { status: "ANSWERED", stringValue: String(question.value) };
}

export function draftToPayload(question: DraftQuestion, draft: DraftValue): PortalCompanyProfileAnswerPayload | null {
  if (draft.status === "UNKNOWN") return { status: "UNKNOWN" };
  switch (question.valueType) {
    case "NUMBER": {
      const trimmed = (draft.numberValue ?? "").trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) return null;
      if (question.integerOnly && !Number.isInteger(parsed)) return null;
      return { status: "ANSWERED", numberValue: parsed };
    }
    case "BOOLEAN":
      return typeof draft.booleanValue === "boolean" ? { status: "ANSWERED", booleanValue: draft.booleanValue } : null;
    case "ENUM":
      return draft.enumValue ? { status: "ANSWERED", enumValue: draft.enumValue } : null;
    case "JURISDICTION": {
      const code = (draft.enumValue ?? "").trim();
      return code ? { status: "ANSWERED", enumValue: code.toUpperCase() } : null;
    }
    case "MULTI_ENUM": {
      const values = draft.jsonValue ?? [];
      return values.length ? { status: "ANSWERED", jsonValue: values } : null;
    }
    case "STRING": {
      const value = (draft.stringValue ?? "").trim();
      return value ? { status: "ANSWERED", stringValue: value } : null;
    }
    default:
      return null;
  }
}

/**
 * Seeds editable drafts from persisted discovery answers without overwriting
 * in-flight edits. Because `valueToDraft` reconstructs UNKNOWN, a persisted
 * "Nem tudom" survives a page reload, an adaptive discovery refresh and a
 * topic A -> topic B -> topic A round trip.
 */
export function seedDrafts(
  existing: Record<string, DraftValue>,
  questions: readonly DraftQuestion[],
): Record<string, DraftValue> {
  const next = { ...existing };
  for (const question of questions) {
    if (next[question.questionKey]) continue;
    const seeded = valueToDraft(question);
    if (seeded) next[question.questionKey] = seeded;
  }
  return next;
}
