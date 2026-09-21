import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { draftToPayload, seedDrafts, valueToDraft, type DraftQuestion } from "../src/lib/companyProfileDraft";

const base = (over: Partial<DraftQuestion>): DraftQuestion => ({
  questionKey: "employee_count",
  valueType: "NUMBER",
  status: "UNANSWERED",
  value: null,
  ...over,
});

describe("company-profile draft bridge (persisted UNKNOWN survives)", () => {
  it("RELOAD: a persisted UNKNOWN reconstructs its own draft state", () => {
    // This is the exact state a reloaded discovery returns for "Nem tudom".
    const reloaded = base({ questionKey: "data_processing", status: "UNKNOWN", value: null, valueType: "BOOLEAN" });
    const draft = valueToDraft(reloaded);
    assert.deepEqual(draft, { status: "UNKNOWN" });
  });

  it("UNKNOWN is never coerced into ANSWERED and never carries a value", () => {
    for (const valueType of ["NUMBER", "BOOLEAN", "STRING", "ENUM", "MULTI_ENUM", "JURISDICTION"] as const) {
      const draft = valueToDraft(base({ status: "UNKNOWN", value: null, valueType }));
      assert.deepEqual(draft, { status: "UNKNOWN" });
      assert.equal("numberValue" in (draft ?? {}), false);
      assert.equal("stringValue" in (draft ?? {}), false);
      assert.equal("booleanValue" in (draft ?? {}), false);
      assert.equal("enumValue" in (draft ?? {}), false);
      assert.equal("jsonValue" in (draft ?? {}), false);
    }

    // Even if a stray value accompanies UNKNOWN, it is not parsed as an answer.
    const draft = valueToDraft(base({ status: "UNKNOWN", value: 42, valueType: "NUMBER" }));
    assert.deepEqual(draft, { status: "UNKNOWN" });
  });

  it("UNANSWERED stays distinct from UNKNOWN: it produces no draft at all", () => {
    assert.equal(valueToDraft(base({ status: "UNANSWERED", value: null })), undefined);
    assert.equal(valueToDraft(base({ status: "ANSWERED", value: null })), undefined);
  });

  it("ANSWERED value parsing is preserved for every typed control", () => {
    assert.deepEqual(valueToDraft(base({ status: "ANSWERED", value: 52, valueType: "NUMBER" })), { status: "ANSWERED", numberValue: "52" });
    assert.deepEqual(valueToDraft(base({ status: "ANSWERED", value: true, valueType: "BOOLEAN" })), { status: "ANSWERED", booleanValue: true });
    assert.deepEqual(valueToDraft(base({ status: "ANSWERED", value: "HU", valueType: "JURISDICTION" })), { status: "ANSWERED", enumValue: "HU" });
    assert.deepEqual(valueToDraft(base({ status: "ANSWERED", value: "6201", valueType: "ENUM" })), { status: "ANSWERED", enumValue: "6201" });
    assert.deepEqual(valueToDraft(base({ status: "ANSWERED", value: ["6201", "6202"], valueType: "MULTI_ENUM" })), { status: "ANSWERED", jsonValue: ["6201", "6202"] });
    assert.deepEqual(valueToDraft(base({ status: "ANSWERED", value: "Megjegyzés", valueType: "STRING" })), { status: "ANSWERED", stringValue: "Megjegyzés" });
  });

  it("ROUND TRIP: a reconstructed UNKNOWN saves back as a valueless UNKNOWN payload", () => {
    const question = base({ status: "UNKNOWN", value: null, valueType: "NUMBER" });
    const draft = valueToDraft(question);
    assert.ok(draft);
    assert.deepEqual(draftToPayload(question, draft), { status: "UNKNOWN" });
  });

  it("RELOAD STATE: seeding drafts from a reloaded discovery keeps UNKNOWN visible", () => {
    const reloadedQuestions = [
      base({ questionKey: "answered_one", status: "ANSWERED", value: 5, valueType: "NUMBER" }),
      base({ questionKey: "unknown_one", status: "UNKNOWN", value: null, valueType: "BOOLEAN" }),
      base({ questionKey: "never_answered", status: "UNANSWERED", value: null, valueType: "STRING" }),
    ];
    const drafts = seedDrafts({}, reloadedQuestions);
    assert.deepEqual(drafts, {
      answered_one: { status: "ANSWERED", numberValue: "5" },
      unknown_one: { status: "UNKNOWN" },
    });
    assert.equal(drafts.never_answered, undefined);
  });

  it("TOPIC RETURN + DISCOVERY REFRESH: topic A -> topic B -> topic A keeps UNKNOWN and never clobbers edits", () => {
    const topicA = [
      base({ questionKey: "a_unknown", status: "UNKNOWN", value: null, valueType: "BOOLEAN" }),
      base({ questionKey: "a_open", status: "UNANSWERED", value: null, valueType: "NUMBER" }),
    ];
    const topicB = [base({ questionKey: "b_answered", status: "ANSWERED", value: 3, valueType: "NUMBER" })];

    let drafts = seedDrafts({}, topicA);
    assert.deepEqual(drafts.a_unknown, { status: "UNKNOWN" });

    // Move to topic B, then back to topic A: the UNKNOWN draft is still there.
    drafts = seedDrafts(drafts, topicB);
    drafts = seedDrafts(drafts, topicA);
    assert.deepEqual(drafts.a_unknown, { status: "UNKNOWN" });

    // A discovery refresh re-runs seeding; UNKNOWN must survive it too.
    drafts = seedDrafts(drafts, topicA);
    assert.deepEqual(drafts.a_unknown, { status: "UNKNOWN" });
    assert.deepEqual(drafts.b_answered, { status: "ANSWERED", numberValue: "3" });

    // An in-flight edit is never overwritten by re-seeding persisted state.
    drafts = seedDrafts({ ...drafts, a_open: { status: "ANSWERED", numberValue: "12" } }, topicA);
    assert.deepEqual(drafts.a_open, { status: "ANSWERED", numberValue: "12" });
  });

  it("WIRING: the wizard seeds persisted drafts through the shared helper", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/client-portal/OrganizationCompanyProfile.tsx"), "utf8");
    assert.match(src, /seedDrafts\(previous, activeAtoms\)/);
    assert.match(src, /from "@\/lib\/companyProfileDraft"/);
  });
});
