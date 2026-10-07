import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAnonymizeSourceOutcome,
  FEATURE_DISABLED_MESSAGE,
  SOURCE_PROCESSING_FAILURE_MESSAGE,
  SOURCE_TEXT_LIMITATION_MESSAGE,
} from "../src/lib/documents/anonymizeSourceOutcome";

describe("anonymization source outcome", () => {
  it("accepts usable source text", () => {
    const outcome = resolveAnonymizeSourceOutcome({
      success: true,
      textAvailable: true,
      sourceText: "Szerződés szövege.",
    });
    assert.equal(outcome.available, true);
    assert.equal(outcome.message, SOURCE_TEXT_LIMITATION_MESSAGE);
  });

  it("surfaces the feature-disabled capability truthfully, not as missing text", () => {
    const outcome = resolveAnonymizeSourceOutcome({
      success: false,
      textAvailable: false,
      code: "FEATURE_DISABLED",
    });
    assert.equal(outcome.available, false);
    assert.equal(outcome.message, FEATURE_DISABLED_MESSAGE);
  });

  it("distinguishes a processing failure from missing text", () => {
    const outcome = resolveAnonymizeSourceOutcome({
      success: false,
      textAvailable: false,
      code: "PROCESSING_FAILURE",
    });
    assert.equal(outcome.available, false);
    assert.equal(outcome.message, SOURCE_PROCESSING_FAILURE_MESSAGE);
  });

  it("uses an allowlisted message for SOURCE_NOT_AVAILABLE", () => {
    const outcome = resolveAnonymizeSourceOutcome({
      success: true,
      textAvailable: false,
      code: "SOURCE_NOT_AVAILABLE",
      limitationMessage: "Egyéni korlátozás",
    });
    assert.equal(outcome.available, false);
    assert.equal(outcome.message, SOURCE_TEXT_LIMITATION_MESSAGE);
  });

  it("does not accept whitespace-only text as available", () => {
    const outcome = resolveAnonymizeSourceOutcome({
      success: true,
      textAvailable: true,
      sourceText: "   ",
      limitationMessage: "Nincs szöveg",
    });
    assert.equal(outcome.available, false);
    assert.equal(outcome.message, SOURCE_TEXT_LIMITATION_MESSAGE);
  });

  it("keeps authorization, scanning, capability, source and processing failures distinct without raw text", () => {
    const codes = ['FEATURE_DISABLED', 'AUTHORIZATION_DENIED', 'SECURITY_SCAN_BLOCKED', 'SOURCE_NOT_AVAILABLE', 'PROCESSING_FAILURE'];
    const outcomes = codes.map((code) => resolveAnonymizeSourceOutcome({ code, limitationMessage: 'secret provider stack trace' }));
    assert.equal(new Set(outcomes.map((outcome) => outcome.message)).size, 5);
    assert.ok(outcomes.every((outcome) => !outcome.available && !outcome.message.includes('secret')));
  });
});
