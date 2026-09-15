import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { companyProfileCompletion } from "../src/lib/companyProfileCompletion";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("canonical company-profile completion", () => {
  it("ANSWERED + ANSWERED + UNKNOWN + UNANSWERED => 2 / 4", () => {
    const progress = companyProfileCompletion([
      { status: "ANSWERED" },
      { status: "ANSWERED" },
      { status: "UNKNOWN" },
      { status: "UNANSWERED" },
    ]);
    assert.equal(progress.answered, 2);
    assert.equal(progress.total, 4);
    assert.equal(progress.percent, 50);
  });

  it("never counts UNKNOWN as provided", () => {
    assert.equal(companyProfileCompletion([{ status: "UNKNOWN" }, { status: "UNKNOWN" }]).answered, 0);
    assert.equal(companyProfileCompletion([]).answered, 0);
    assert.equal(companyProfileCompletion([]).total, 0);
  });

  it("is the single definition reused by both the wizard and the Compliance Map", () => {
    const wizard = read("src/components/client-portal/OrganizationCompanyProfile.tsx");
    const map = read("src/components/client-portal/OrgComplianceView.tsx");
    assert.match(wizard, /companyProfileCompletion\(questions\)/);
    assert.match(map, /companyProfileCompletion\(discovery\.questions\)/);
    // The divergent "not UNANSWERED" predicate must be gone from the map.
    assert.doesNotMatch(map, /status !== "UNANSWERED"/);
  });
});
