import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  OrgComplianceView,
  classifyTopic,
  controlProgressFor,
  filterTopics,
  summarizeTopics,
} from "../src/components/client-portal/OrgComplianceView";
import type {
  PortalComplianceControlSummary,
  PortalComplianceMissingInfo,
  PortalComplianceTopic,
} from "../src/lib/clientPortalApi";

const root = process.cwd();
const source = () => readFileSync(path.join(root, "src/components/client-portal/OrgComplianceView.tsx"), "utf8");

const topic = (overrides: Partial<PortalComplianceTopic> = {}): PortalComplianceTopic => ({
  topicId: "portal/gdpr-general-scope",
  topicLabel: "Általános adatvédelem",
  state: "RESOLVED",
  shortExplanation: "Alapvető adatvédelmi követelmények.",
  missingInformation: [],
  nextAction: null,
  documents: [],
  ...overrides,
});

const missing = (overrides: Partial<PortalComplianceMissingInfo> = {}): PortalComplianceMissingInfo => ({
  label: "Munkavállalók száma",
  portalAnswerable: true,
  questionKey: "employee_count",
  valueType: "NUMBER",
  integerOnly: true,
  ...overrides,
});

describe("Compliance Map convergence", () => {
  it("1+2. derives summary tile counts from returned topics and never double counts", () => {
    const topics = [
      topic({ topicId: "a", state: "MORE_INFORMATION_NEEDED" }),
      topic({ topicId: "b", state: "REVIEW_RECOMMENDED" }),
      topic({ topicId: "c", state: "ACTION_IN_PROGRESS" }),
      topic({ topicId: "d", state: "LAWYER_REVIEW_REQUIRED" }),
      topic({ topicId: "e", state: "RESOLVED" }),
      topic({ topicId: "f", state: "RESOLVED", missingInformation: [missing()] }),
    ];
    const counts = summarizeTopics(topics);
    assert.equal(counts.CUSTOMER_ACTION, 3);
    assert.equal(counts.IN_PROGRESS, 1);
    assert.equal(counts.LAWYER_REVIEW, 1);
    assert.equal(counts.NO_ACTION, 1);
    assert.equal(counts.CUSTOMER_ACTION + counts.IN_PROGRESS + counts.LAWYER_REVIEW + counts.NO_ACTION, topics.length);
  });

  it("9. classifies lawyer review and in-progress distinctly", () => {
    assert.equal(classifyTopic(topic({ state: "LAWYER_REVIEW_REQUIRED" })), "LAWYER_REVIEW");
    assert.equal(classifyTopic(topic({ state: "ACTION_IN_PROGRESS" })), "IN_PROGRESS");
    assert.equal(classifyTopic(topic({ state: "MORE_INFORMATION_NEEDED" })), "CUSTOMER_ACTION");
    assert.equal(classifyTopic(topic({ state: "REVIEW_RECOMMENDED" })), "CUSTOMER_ACTION");
    assert.equal(classifyTopic(topic({ state: "RESOLVED" })), "NO_ACTION");
  });

  it("2. status filter selects exactly the matching bucket", () => {
    const topics = [
      topic({ topicId: "a", state: "ACTION_IN_PROGRESS" }),
      topic({ topicId: "b", state: "RESOLVED" }),
    ];
    assert.deepEqual(filterTopics(topics, "", "IN_PROGRESS").map((t) => t.topicId), ["a"]);
    assert.deepEqual(filterTopics(topics, "", "NO_ACTION").map((t) => t.topicId), ["b"]);
    assert.deepEqual(filterTopics(topics, "", "ALL").map((t) => t.topicId), ["a", "b"]);
  });

  it("3. text search filters topics locally by label and explanation", () => {
    const topics = [
      topic({ topicId: "gdpr", topicLabel: "Általános adatvédelem", shortExplanation: "GDPR elvek" }),
      topic({ topicId: "nis2", topicLabel: "Kiberbiztonság", shortExplanation: "NIS2 elvek" }),
    ];
    assert.deepEqual(filterTopics(topics, "kiber", "ALL").map((t) => t.topicId), ["nis2"]);
    assert.deepEqual(filterTopics(topics, "adatvéd", "ALL").map((t) => t.topicId), ["gdpr"]);
    assert.deepEqual(filterTopics(topics, "nincs ilyen", "ALL"), []);
  });

  it("15. control progress derives only from the canonical controlsSummary projection", () => {
    const summary: PortalComplianceControlSummary[] = [
      {
        requirementTitle: "Általános adatvédelem",
        controls: [
          { title: "A", implementationStatus: "IMPLEMENTED", lastReviewedAt: null, nextReviewAt: "2026-10-01T00:00:00.000Z", evidence: { acceptedCurrent: 1, stale: 0, missing: false } },
          { title: "B", implementationStatus: "NOT_IMPLEMENTED", lastReviewedAt: null, nextReviewAt: null, evidence: { acceptedCurrent: 0, stale: 0, missing: true } },
        ],
      },
    ];
    assert.deepEqual(controlProgressFor(topic(), summary), { done: 1, total: 2, nextReviewAt: "2026-10-01T00:00:00.000Z" });
    assert.equal(controlProgressFor(topic({ topicLabel: "Nincs ilyen" }), summary), null);
    assert.equal(controlProgressFor(topic(), undefined), null);
    assert.equal(controlProgressFor(topic(), []), null);
  });

  it("renders a loading state without fabricating data or a score", () => {
    const markup = renderToStaticMarkup(createElement(OrgComplianceView));
    assert.match(markup, /Megfelelési áttekintés betöltése/);
    assert.doesNotMatch(markup, /%/);
  });

  it("4. keeps no-search-result state distinct from no-topics state", () => {
    const src = source();
    assert.match(src, /Nincs a keresésnek vagy a szűrőnek megfelelő terület\./);
    assert.match(src, /Ehhez a vállalkozáshoz még nem készült megfelelési értékelés\./);
  });

  it("5+6+7+8. preserves typed inline answering, the profile answer API, reload and UNKNOWN", () => {
    const src = source();
    assert.match(src, /info\.valueType === "BOOLEAN"/);
    assert.match(src, /info\.valueType === "ENUM"/);
    assert.match(src, /info\.valueType === "DATE"/);
    assert.match(src, /info\.valueType === "NUMBER"/);
    assert.match(src, /info\.integerOnly && !Number\.isInteger/);
    assert.match(src, /stringValue: trimmed/);
    assert.match(src, /answerPortalCompanyProfileQuestion\(info\.questionKey, payload\)/);
    assert.match(src, /status: "UNKNOWN"/);
    assert.match(src, /Adat megadása →/);
    assert.match(src, /Irodai egyeztetés szükséges/);
    // Successful save reloads compliance.
    assert.match(src, /setActionSuccess\("Adat sikeresen rögzítve\."\)/);
    assert.match(src, /await load\(\)/);
  });

  it("11+12. uses the canonical portal document download route only", () => {
    const src = source();
    assert.match(src, /portalDownloadUrl\(doc\.publicationId\)/);
    assert.match(src, /Közzétett dokumentumok/);
  });

  it("13+14. never references internal-only document fields", () => {
    const src = source();
    assert.doesNotMatch(src, /INTERNAL_ANALYSIS|storageKey|storagePath|sharePoint|spItemId|internalTitle|uploadedById|reviewer/i);
  });

  it("10+16. no fabricated completion, no absolute guarantee wording", () => {
    const src = source();
    assert.match(src, /const progress = controlProgressFor\(topic, data\?\.controlsSummary\)/);
    assert.match(src, /A megfelelési térkép a vállalati profil adataira épül\./);
    assert.match(src, /nem jelentenek felelősségkizáró abszolút garanciát vagy 100%-os minősítést/);
    assert.match(src, /Hogyan készül a compliance térkép\?/);
  });

  it("17. leaves the internal compliance management UI untouched", () => {
    const internal = readFileSync(path.join(root, "src/components/clients/compliance/ComplianceDocumentsSection.tsx"), "utf8");
    assert.match(internal, /complianceDocumentApi\.link/);
    assert.match(internal, /complianceDocumentApi\.unlink/);
  });
});
