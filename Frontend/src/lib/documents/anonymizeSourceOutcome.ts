/**
 * Truthful resolution of the anonymization source-read outcome (B1 closure).
 *
 * The anonymization-source endpoint answers HTTP 200 even when text is
 * unavailable, carrying a typed `code` (`SOURCE_NOT_AVAILABLE`) plus a safe
 * `limitationMessage`. The feature gate answers 501 with `code=FEATURE_DISABLED`.
 * This helper maps those shapes to a single product-level outcome so the
 * AnonymizeModal never collapses a disabled capability or a processing failure
 * into the generic "nincs szöveg" message.
 */

export const SOURCE_TEXT_LIMITATION_MESSAGE =
  "A dokumentum teljes szöveges előnézete jelenleg nem érhető el. Az anonimizálás a feltöltött dokumentum backend feldolgozásán fut.";

export const FEATURE_DISABLED_MESSAGE =
  "Az AI-anonimizálás jelenleg ki van kapcsolva. A funkció engedélyezéséhez forduljon rendszergazdához.";

export const SOURCE_PROCESSING_FAILURE_MESSAGE =
  "A forrásszöveg betöltése közben hiba történt. Próbálja újra később.";

export interface AnonymizeSourceOutcome {
  available: boolean;
  message: string;
}

export function resolveAnonymizeSourceOutcome(result: {
  success?: boolean;
  textAvailable?: boolean;
  sourceText?: string | null;
  code?: string | null;
  limitationMessage?: string | null;
}): AnonymizeSourceOutcome {
  const text = typeof result.sourceText === "string" ? result.sourceText.trim() : "";
  if (result.success && result.textAvailable && text.length > 0) {
    return { available: true, message: SOURCE_TEXT_LIMITATION_MESSAGE };
  }
  if (result.code === "FEATURE_DISABLED") {
    return { available: false, message: FEATURE_DISABLED_MESSAGE };
  }
  if (result.code === "PROCESSING_FAILURE") {
    return { available: false, message: SOURCE_PROCESSING_FAILURE_MESSAGE };
  }
  const reason =
    typeof result.limitationMessage === "string" && result.limitationMessage.trim().length > 0
      ? result.limitationMessage
      : SOURCE_TEXT_LIMITATION_MESSAGE;
  return { available: false, message: reason };
}
