import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TopicDetailView,
  classifyTopic,
  customerActionNote,
  officeProcessingNote,
  primaryBadgeLabel,
  readTopicParam,
  summaryGroups,
  withTopicParam,
} from "../src/components/client-portal/OrgComplianceView";
import type {
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
  questionKey: "company_employee_count",
  valueType: "NUMBER",
  integerOnly: true,
  ...overrides,
});

// The exact live reproduction: backend raw state is lawyer review while the
// topic simultaneously offers executable portal input.
const lawyerWithCustomerInput = () =>
  topic({
    topicId: "portal/nis2-scope",
    topicLabel: "Kiberbiztonsági (NIS2) hatály",
    state: "LAWYER_REVIEW_REQUIRED",
    shortExplanation: "NIS2 hatályvizsgálat.",
    missingInformation: [missing()],
    nextAction: "Ügyvédi áttekintés javasolt.",
  });

describe("Status model: customer dimension vs office dimension", () => {
  it("never labels the office processing dimension as the topic 'Állapot'", () => {
    const src = source();
    assert.doesNotMatch(src, /Állapot:/);
    assert.match(src, /\{customerActionNote\(topic\)\}/);
    assert.match(src, /\{officeProcessingNote\(topic\)\}/);
  });

  it("shows immediate customer action and office review simultaneously without contradiction", () => {
    const t = lawyerWithCustomerInput();
    const bucket = classifyTopic(t);
    assert.equal(bucket, "CUSTOMER_ACTION");

    // Customer dimension: the customer is the next actor.
    assert.equal(primaryBadgeLabel(t, bucket), "Adatra várunk Öntől");
    assert.equal(customerActionNote(t), "Öntől szükséges: 1 adat megadása");

    // Office dimension is a separate, explicitly labeled processing note.
    assert.equal(officeProcessingNote(t), "Irodai feldolgozás: ügyvédi vizsgálat folyamatban");
    assert.notEqual(customerActionNote(t), officeProcessingNote(t));
    assert.doesNotMatch(officeProcessingNote(t), /^Öntől/);
  });

  it("describes every safe topic state with an explicit office processing note", () => {
    for (const state of ["LAWYER_REVIEW_REQUIRED", "ACTION_IN_PROGRESS", "MORE_INFORMATION_NEEDED", "REVIEW_RECOMMENDED", "RESOLVED"] as const) {
      const note = officeProcessingNote(topic({ state }));
      assert.match(note, /^Irodai feldolgozás: /, `state ${state} must have an explicit office note`);
      assert.doesNotMatch(note, /^Öntől/);
    }
  });

  it("keeps the customer dimension truthful for attention and cleared topics", () => {
    // Office review without executable customer input cannot become customer work.
    assert.equal(
      customerActionNote(topic({ state: "REVIEW_RECOMMENDED" })),
      "Öntől jelenleg nincs várt teendő.",
    );
    // Office-only and cleared topics never claim an immediate customer task.
    assert.equal(
      customerActionNote(topic({ state: "LAWYER_REVIEW_REQUIRED" })),
      "Öntől jelenleg nincs várt teendő.",
    );
    assert.equal(customerActionNote(topic({ state: "RESOLVED" })), "Öntől jelenleg nincs várt teendő.");
  });

  it("renders both dimensions in the topic detail without the ambiguous 'Állapot' label", () => {
    const markup = renderToStaticMarkup(
      createElement(TopicDetailView, {
        topic: lawyerWithCustomerInput(),
        bucket: "CUSTOMER_ACTION",
        controlsSummary: undefined,
        onBack: () => {},
        missingInformationSection: null,
      }),
    );
    assert.match(markup, /Adatra várunk Öntől/);
    assert.match(markup, /Öntől szükséges: 1 adat megadása/);
    assert.match(markup, /Irodai feldolgozás: ügyvédi vizsgálat folyamatban/);
    assert.doesNotMatch(markup, /Állapot:/);
  });
});

describe("Summary semantics: three mutually exclusive categories", () => {
  it("counts each topic in exactly one category and matches its semantics", () => {
    const topics = [
      lawyerWithCustomerInput(), // customer action (lawyer review overlap)
      topic({ topicId: "a", state: "MORE_INFORMATION_NEEDED" }), // office refresh
      topic({ topicId: "b", state: "REVIEW_RECOMMENDED" }), // office review
      topic({ topicId: "c", state: "ACTION_IN_PROGRESS" }), // office
      topic({ topicId: "d", state: "LAWYER_REVIEW_REQUIRED" }), // office
      topic({ topicId: "e", state: "RESOLVED" }), // cleared
    ];
    const groups = summaryGroups(topics);
    assert.deepEqual(groups, { customerAction: 1, atOffice: 4, noAction: 1 });
    assert.equal(groups.customerAction + groups.atOffice + groups.noAction, topics.length);

    // "Öntől szükséges" counts exactly the CUSTOMER_ACTION bucket.
    assert.equal(groups.customerAction, topics.filter((t) => classifyTopic(t) === "CUSTOMER_ACTION").length);
    // "Irodánál van" counts the buckets where the office is the next actor.
    assert.equal(
      groups.atOffice,
      topics.filter((t) => ["IN_PROGRESS", "LAWYER_REVIEW"].includes(classifyTopic(t))).length,
    );
    // "Jelenleg nincs ügyfélteendő" counts exactly the fully cleared topics.
    assert.equal(groups.noAction, topics.filter((t) => classifyTopic(t) === "NO_ACTION").length);
  });

  it("matches the live 5-topic lawyer-review-with-customer-input scenario", () => {
    const base = lawyerWithCustomerInput();
    const topics = Array.from({ length: 5 }, (_, i) => ({ ...base, topicId: `portal/nis2-${i}` }));
    assert.deepEqual(summaryGroups(topics), { customerAction: 5, atOffice: 0, noAction: 0 });
    // The overview label and every card now agree on the customer dimension.
    for (const t of topics) {
      assert.match(customerActionNote(t), /^Öntől szükséges: 1 adat megadása$/);
      assert.match(officeProcessingNote(t), /ügyvédi vizsgálat/);
    }
  });

  it("never counts office refresh, review or a missing unanswerable question as customer work", () => {
    const topics = [
      topic({ topicId: "refresh", state: "MORE_INFORMATION_NEEDED", missingInformation: [] }),
      topic({ topicId: "review", state: "REVIEW_RECOMMENDED", missingInformation: [] }),
      topic({ topicId: "office", state: "LAWYER_REVIEW_REQUIRED", missingInformation: [missing({ portalAnswerable: false })] }),
      topic({ topicId: "no-key", state: "MORE_INFORMATION_NEEDED", missingInformation: [missing({ questionKey: null })] }),
    ];
    assert.deepEqual(summaryGroups(topics), { customerAction: 0, atOffice: 4, noAction: 0 });
    for (const item of topics) {
      assert.equal(customerActionNote(item), "Öntől jelenleg nincs várt teendő.");
    }
    topics.push(topic({ topicId: "answer", state: "LAWYER_REVIEW_REQUIRED", missingInformation: [missing()] }));
    assert.deepEqual(summaryGroups(topics), { customerAction: 1, atOffice: 4, noAction: 0 });
  });

  it("derives the V3 customer-required tile from the same rendered worklist", () => {
    const v3 = readFileSync(path.join(root, "src/components/client-portal-v3/compliance/PortalComplianceV3.tsx"), "utf8");
    assert.match(v3, /label="Öntől szükséges"\s+count=\{worklist\.length\}/);
    assert.match(v3, /for \(const request of requestGroups\.awaiting\)/);
    assert.match(v3, /if \(answerable\.length === 0\) continue/);
    assert.doesNotMatch(v3, /count=\{groups\.customerAction \+ requestGroups\.awaiting\.length\}/);
  });
});

describe("Customer-safe topic deep link (?topic=)", () => {
  it("reads the topic parameter from a location search string", () => {
    assert.equal(readTopicParam("?topic=portal%2Fnis2-scope"), "portal/nis2-scope");
    assert.equal(readTopicParam("topic=portal/gdpr-general-scope"), "portal/gdpr-general-scope");
    assert.equal(readTopicParam("?topic="), null);
    assert.equal(readTopicParam("?topic=%20%20"), null);
    assert.equal(readTopicParam(""), null);
    assert.equal(readTopicParam("?other=1"), null);
  });

  it("sets and removes the topic parameter while preserving other params", () => {
    assert.equal(withTopicParam("", "portal/nis2-scope"), "?topic=portal%2Fnis2-scope");
    assert.equal(withTopicParam("?foo=bar", "portal/nis2-scope"), "?foo=bar&topic=portal%2Fnis2-scope");
    assert.equal(withTopicParam("?foo=bar&topic=portal%2Fnis2-scope", null), "?foo=bar");
    assert.equal(withTopicParam("?topic=portal%2Fnis2-scope", null), "");
    assert.equal(withTopicParam("", null), "");
  });

  it("round-trips a selected topic through the URL contract", () => {
    const search = withTopicParam("?foo=bar", "portal/gdpr-general-scope");
    assert.equal(readTopicParam(search), "portal/gdpr-general-scope");
    assert.equal(readTopicParam(withTopicParam(search, null)), null);
  });

  it("wires deep linking through history without leaking internal identifiers", () => {
    const src = source();
    assert.match(src, /readTopicParam\(window\.location\.search\)/);
    assert.match(src, /withTopicParam\(window\.location\.search, topicId\)/);
    assert.match(src, /window\.history\.pushState/);
    assert.match(src, /window\.addEventListener\("popstate"/);
    // No internal identifiers may ride along in the URL.
    assert.doesNotMatch(src, /canonicalReference|anchorKey|CELEX|INTERNAL_ANALYSIS|ComplianceClauseAnchor/i);
  });
});

describe("Overview compaction and safe boundary", () => {
  it("drops the repeated per-card negative lines", () => {
    const src = source();
    assert.doesNotMatch(src, /Nincs közzétett ügyfél-dokumentum\./);
    assert.doesNotMatch(src, /Nincs hiányzó adat\./);
  });

  it("still surfaces published documents and controls only from the safe projection", () => {
    const src = source();
    assert.match(src, /Közzétett ügyfél-dokumentum: \$\{topic\.documents\.length\}/);
    assert.match(src, /const progress = controlProgressFor\(topic, data\?\.controlsSummary\)/);
    assert.match(src, /TopicControls topic=\{topic\} controlsSummary=\{controlsSummary\}/);
  });

  it("never renders legal matrix, anchors, canonical references, internal analysis or AI output", () => {
    const markup = renderToStaticMarkup(
      createElement(TopicDetailView, {
        topic: lawyerWithCustomerInput(),
        bucket: "CUSTOMER_ACTION",
        controlsSummary: undefined,
        onBack: () => {},
        missingInformationSection: null,
      }),
    );
    assert.doesNotMatch(
      markup,
      /anchorKey|canonicalReference|canonicalCitation|CELEX|Jogi mátrix|legal matrix|INTERNAL_ANALYSIS|monitoring manifest|AssessmentFinding|AI értékelés/i,
    );
    assert.doesNotMatch(source(), /storageKey|storagePath|sharePoint|spItemId|internalTitle|uploadedById|reviewer/i);
  });
});
