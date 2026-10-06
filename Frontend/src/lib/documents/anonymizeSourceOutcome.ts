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
  "A dokumentum hiteles forrásszövege jelenleg nem érhető el.";

export const FEATURE_DISABLED_MESSAGE =
  "Az AI-anonimizálás jelenleg ki van kapcsolva. A funkció engedélyezéséhez forduljon rendszergazdához.";

export const SOURCE_PROCESSING_FAILURE_MESSAGE =
  "A forrásszöveg betöltése közben hiba történt. Próbálja újra később.";

export const AUTHORIZATION_DENIED_MESSAGE = "Nincs jogosultsága a dokumentum anonimizálásához.";
export const SECURITY_SCAN_BLOCKED_MESSAGE = "A dokumentum biztonsági ellenőrzése még nem engedélyezi a feldolgozást.";

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
  if (["AUTHORIZATION_DENIED", "CASE_ACCESS_FORBIDDEN", "FORBIDDEN"].includes(result.code || "")) {
    return { available: false, message: AUTHORIZATION_DENIED_MESSAGE };
  }
  if (["SECURITY_SCAN_BLOCKED", "DOCUMENT_SECURITY_SCAN_BLOCKED"].includes(result.code || "")) {
    return { available: false, message: SECURITY_SCAN_BLOCKED_MESSAGE };
  }
  // Presentation uses allowlisted messages, never exception/provider text.
  return { available: false, message: result.code === "SOURCE_NOT_AVAILABLE" || !result.code ? SOURCE_TEXT_LIMITATION_MESSAGE : SOURCE_PROCESSING_FAILURE_MESSAGE };
}
