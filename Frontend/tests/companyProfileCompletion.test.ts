import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { companyProfileCompletion } from "../src/lib/companyProfileCompletion";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const q = (questionKey: string, status: string) => ({ questionKey, status });
const screen = (factBindings: string[]) => ({ factBindings });

describe("canonical company-profile completion (reachable facts only)", () => {
  it("CASE A: hidden questions are excluded from the denominator", () => {
    // 65 raw questions, only 38 bound to visible screens, 34 of those ANSWERED.
    const visibleKeys = Array.from({ length: 38 }, (_, i) => `visible_${i + 1}`);
    const hiddenKeys = Array.from({ length: 27 }, (_, i) => `hidden_${i + 1}`);
    const questions = [
      ...visibleKeys.map((key, i) => q(key, i < 34 ? "ANSWERED" : "UNANSWERED")),
      ...hiddenKeys.map((key) => q(key, "ANSWERED")),
    ];
    assert.equal(questions.length, 65);

    const progress = companyProfileCompletion(questions, [screen(visibleKeys)]);
    assert.equal(progress.answered, 34);
    assert.equal(progress.total, 38);
    assert.notEqual(progress.total, 65);
  });

  it("CASE B: UNKNOWN stays in the reachable denominator but never the numerator", () => {
    const questions = [q("a", "ANSWERED"), q("b", "ANSWERED"), q("c", "UNKNOWN"), q("d", "UNANSWERED")];
    const progress = companyProfileCompletion(questions, [screen(["a", "b", "c", "d"])]);
    assert.equal(progress.answered, 2);
    assert.equal(progress.total, 4);
  });

  it("CASE C: hidden ANSWERED facts do not inflate the numerator", () => {
    const visible = [q("v1", "ANSWERED"), q("v2", "ANSWERED")];
    const hidden = Array.from({ length: 10 }, (_, i) => q(`h${i}`, "ANSWERED"));
    const progress = companyProfileCompletion([...visible, ...hidden], [screen(["v1", "v2"])]);
    assert.equal(progress.answered, 2);
    assert.equal(progress.total, 2);
  });

  it("CASE D: hidden UNANSWERED facts do not inflate the denominator", () => {
    const visible = [q("v1", "ANSWERED")];
    const hidden = Array.from({ length: 5 }, (_, i) => q(`h${i}`, "UNANSWERED"));
    const progress = companyProfileCompletion([...visible, ...hidden], [screen(["v1"])]);
    assert.equal(progress.total, 1);
    assert.equal(progress.answered, 1);
  });

  it("CASE E: a fact bound to two visible screens is counted once", () => {
    const questions = [q("employee_count", "ANSWERED"), q("other", "UNANSWERED")];
    const screens = [screen(["employee_count"]), screen(["employee_count", "other"])];
    const progress = companyProfileCompletion(questions, screens);
    assert.equal(progress.total, 2);
    assert.equal(progress.answered, 1);
  });

  it("CASE F: an adaptive branch that opens adds the new reachable facts", () => {
    const questions = [q("a", "ANSWERED"), q("b", "UNANSWERED"), q("c", "UNANSWERED"), q("d", "UNANSWERED")];
    const before = companyProfileCompletion(questions, [screen(["a", "b"])]);
    assert.deepEqual({ answered: before.answered, total: before.total }, { answered: 1, total: 2 });
    const after = companyProfileCompletion(questions, [screen(["a", "b"]), screen(["c", "d"])]);
    assert.deepEqual({ answered: after.answered, total: after.total }, { answered: 1, total: 4 });
  });

  it("CASE G: an adaptive branch that closes removes the facts", () => {
    const questions = [q("a", "ANSWERED"), q("b", "UNANSWERED")];
    assert.equal(companyProfileCompletion(questions, [screen(["a", "b"])]).total, 2);
    assert.equal(companyProfileCompletion(questions, [screen(["a"])]).total, 1);
  });

  it("CASE H: dependency-only / evidence items never affect profile completion", () => {
    const questions = [q("a", "ANSWERED"), q("company_evidence_analysis", "ANSWERED")];
    const progress = companyProfileCompletion(questions, [screen(["a"])]);
    assert.equal(progress.total, 1);
    assert.equal(progress.answered, 1);
  });

  it("CASE I: both surfaces use the same adaptive authority and agree", () => {
    const wizard = read("src/components/client-portal/OrganizationCompanyProfile.tsx");
    const map = read("src/components/client-portal/OrgComplianceView.tsx");
    assert.match(wizard, /companyProfileCompletion\(questions, screens\)/);
    assert.match(map, /companyProfileCompletion\(discovery\.questions, discovery\.screens\)/);

    const questions = [q("a", "ANSWERED"), q("b", "UNKNOWN"), q("hidden", "ANSWERED")];
    const screens = [screen(["a", "b"])];
    const wizardResult = companyProfileCompletion(questions, screens);
    const mapResult = companyProfileCompletion(questions, screens);
    assert.deepEqual(wizardResult, mapResult);
    assert.deepEqual({ answered: wizardResult.answered, total: wizardResult.total }, { answered: 1, total: 2 });
  });

  it("legacy call without screens still counts every given question (back-compat)", () => {
    const progress = companyProfileCompletion([q("a", "ANSWERED"), q("b", "UNKNOWN")]);
    assert.equal(progress.answered, 1);
    assert.equal(progress.total, 2);
  });
});
