import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { countPendingEvidence, evidencePendingLabel } from "../src/lib/companyProfileEvidence";
import type { PortalCompanyProfileEvidenceState } from "../src/lib/clientPortalApi";

const state = (evidenceState: PortalCompanyProfileEvidenceState) => ({ evidenceState });

describe("company-profile follow-up evidence pending count", () => {
  it("counts only PENDING applicable controls, never the applicable total", () => {
    const applicable = [
      state("PENDING"),
      state("PENDING"),
      state("ANSWERED"),
      state("ANSWERED"),
      state("STALE"),
    ];
    // The old bug reported all 5 applicable controls as "megválaszolandó".
    assert.equal(applicable.length, 5);
    assert.equal(countPendingEvidence(applicable), 2);
  });

  it("unanswered => pending", () => {
    assert.equal(countPendingEvidence([state("PENDING")]), 1);
  });

  it("answered YES (current evidence) => not pending", () => {
    assert.equal(countPendingEvidence([state("ANSWERED")]), 0);
  });

  it("answered NO (explicitly not implemented) => not pending", () => {
    // NO persists as NOT_IMPLEMENTED, which the backend surfaces as ANSWERED.
    assert.equal(countPendingEvidence([state("ANSWERED")]), 0);
  });

  it("stale evidence keeps its own state and is never blindly pending", () => {
    assert.equal(countPendingEvidence([state("STALE")]), 0);
  });

  it("header shows the pending number when work remains", () => {
    assert.equal(evidencePendingLabel(5, 2), "2 megválaszolandó");
    assert.equal(evidencePendingLabel(2, 2), "2 megválaszolandó");
    assert.equal(evidencePendingLabel(9, 1), "1 megválaszolandó");
  });

  it("header says Mind megválaszolva only when nothing is pending", () => {
    assert.equal(evidencePendingLabel(3, 0), "Mind megválaszolva");
  });

  it("keeps an honest empty-state label when nothing applies", () => {
    assert.equal(evidencePendingLabel(0, 0), "Részletek");
  });

  it("WIRING: the component renders the helper label and counts from evidenceState", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/client-portal/OrganizationCompanyProfile.tsx"), "utf8");
    assert.match(src, /countPendingEvidence\(applicableEvidence\)/);
    assert.match(src, /evidencePendingLabel\(applicableEvidence\.length, pendingEvidenceCount\)/);
    // The false "applicable total == megválaszolandó" label must be gone.
    assert.doesNotMatch(src, /applicableEvidence\.length \? `\$\{applicableEvidence\.length\} megválaszolandó`/);
    assert.doesNotMatch(src, /\$\{applicableEvidence\.length\} megválaszolandó/);
  });
});
