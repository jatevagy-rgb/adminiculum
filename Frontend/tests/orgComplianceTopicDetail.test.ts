import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TopicDetailView,
  buildAnswerPayload,
  controlStatusLabel,
  controlsFor,
  summaryGroups,
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
  questionKey: "company_employee_count",
  valueType: "NUMBER",
  integerOnly: true,
  ...overrides,
});

const controlSummary = (overrides: Partial<PortalComplianceControlSummary> = {}): PortalComplianceControlSummary => ({
  requirementTitle: "Általános adatvédelem",
  controls: [
    {
      title: "Adatkezelési nyilvántartás vezetése",
      implementationStatus: "IMPLEMENTED",
      lastReviewedAt: "2026-01-15T00:00:00.000Z",
      nextReviewAt: "2026-10-01T00:00:00.000Z",
      evidence: { acceptedCurrent: 2, stale: 0, missing: false },
    },
  ],
  ...overrides,
});

function renderDetail(
  t: PortalComplianceTopic,
  controlsSummary: PortalComplianceControlSummary[] | undefined = undefined,
) {
  return renderToStaticMarkup(
    createElement(TopicDetailView, {
      topic: t,
      bucket: "CUSTOMER_ACTION",
      controlsSummary,
      onBack: () => {},
      missingInformationSection: null,
    }),
  );
}

describe("Compliance overview truthful status summary", () => {
  it("groups the shared primary buckets into three truthful counts", () => {
    const topics = [
      topic({ topicId: "a", state: "MORE_INFORMATION_NEEDED" }),
      topic({ topicId: "b", state: "REVIEW_RECOMMENDED" }),
      topic({ topicId: "c", state: "ACTION_IN_PROGRESS" }),
      topic({ topicId: "d", state: "LAWYER_REVIEW_REQUIRED" }),
      topic({ topicId: "e", state: "RESOLVED" }),
      topic({ topicId: "f", state: "RESOLVED", missingInformation: [missing()] }),
    ];
    assert.deepEqual(summaryGroups(topics), { customerAction: 3, progress: 2, noAction: 1 });
    // The groups partition every topic exactly once.
    const g = summaryGroups(topics);
    assert.equal(g.customerAction + g.progress + g.noAction, topics.length);
  });

  it("renders the three approved status labels and derives them from summaryGroups", () => {
    const src = source();
    assert.match(src, /label="Teendőt igényel"/);
    assert.match(src, /label="Folyamatban \/ ügyvédi vizsgálat"/);
    assert.match(src, /label="Jelenleg nincs ügyfélteendő"/);
    assert.match(src, /summaryGroups\(topics\)/);
  });

  it("never introduces a fabricated score, percentage, AI confidence or completion metric", () => {
    const src = source();
    assert.doesNotMatch(src, /complianceScore|riskScore|confidenceScore|aiConfidence|completionPercent|százalékos kockázat/i);
  });
});

describe("Compliance topic detail reuses only the client-safe DTO", () => {
  it("renders the full topic-detail hierarchy", () => {
    const markup = renderDetail(
      topic({
        topicId: "portal/nis2-scope",
        topicLabel: "Kiberbiztonsági (NIS2) hatály",
        state: "LAWYER_REVIEW_REQUIRED",
        shortExplanation: "NIS2 hatályvizsgálat.",
        missingInformation: [missing()],
        nextAction: "Ügyvédi áttekintés javasolt.",
      }),
    );
    assert.match(markup, /Kiberbiztonsági \(NIS2\) hatály/);
    assert.match(markup, /NIS2 hatályvizsgálat\./);
    assert.match(markup, /Miért érinti a céget\?/);
    assert.match(markup, /Következő lépés/);
    assert.match(markup, /Hiányzó információk/);
    assert.match(markup, /Dokumentumok/);
    assert.match(markup, /Intézkedések és ellenőrzési pontok/);
    assert.match(markup, /Hogyan készül a compliance térkép\?/);
    assert.match(markup, /Vissza az áttekintéshez/);
  });

  it("shows the immediate customer next action when the customer owes portal data", () => {
    const markup = renderDetail(
      topic({
        state: "LAWYER_REVIEW_REQUIRED",
        missingInformation: [missing()],
        nextAction: "Ügyvédi áttekintés javasolt.",
      }),
    );
    assert.match(markup, /Kérjük, adja meg az alábbi hiányzó adatokat a portálon\./);
  });

  it("renders published client-policy documents and a truthful empty state", () => {
    const withDoc = renderDetail(
      topic({
        documents: [
          {
            publicationId: "pub-1",
            title: "Adatkezelési tájékoztató",
            versionLabel: "Közzétett változat 2",
            publishedAt: "2026-08-01T00:00:00.000Z",
            downloadAvailable: true,
          },
        ],
      }),
    );
    assert.match(withDoc, /Közzétett dokumentumok/);
    assert.match(withDoc, /Adatkezelési tájékoztató/);
    assert.match(withDoc, /\/client-portal\/documents\/pub-1\/download/);

    const withoutDoc = renderDetail(topic({ documents: [] }));
    assert.match(withoutDoc, /Ehhez a területhez még nem tettek közzé ügyfélnek szánt dokumentumot\./);
  });

  it("never invents a document, only renders what the safe projection returned", () => {
    const markup = renderDetail(topic({ documents: [] }));
    assert.doesNotMatch(markup, /Közzétett dokumentumok/);
  });
});

describe("Compliance controls derive only from the safe controlsSummary", () => {
  it("matches controls by the safe portal topic label", () => {
    const t = topic();
    assert.equal(controlsFor(t, [controlSummary()]).length, 1);
    assert.deepEqual(controlsFor(topic({ topicLabel: "Nincs ilyen" }), [controlSummary()]), []);
    assert.deepEqual(controlsFor(t, undefined), []);
    assert.deepEqual(controlsFor(t, []), []);
  });

  it("translates implementation status to a safe label and never leaks the raw enum", () => {
    assert.equal(controlStatusLabel("IMPLEMENTED"), "Bevezetve");
    assert.equal(controlStatusLabel("NOT_IMPLEMENTED"), "Nincs bevezetve");
    assert.equal(controlStatusLabel(null), "Nincs felmérve");
    assert.equal(controlStatusLabel("SOME_UNKNOWN_KEY"), "Nincs felmérve");

    const markup = renderDetail(topic(), [controlSummary()]);
    assert.match(markup, /Adatkezelési nyilvántartás vezetése/);
    assert.match(markup, /Bevezetve/);
    assert.match(markup, /Érvényes, elfogadott bizonyíték/);
    assert.doesNotMatch(markup, /IMPLEMENTED|NOT_IMPLEMENTED/);
  });

  it("shows a truthful empty state when no control projection exists", () => {
    const markup = renderDetail(topic(), undefined);
    assert.match(markup, /Ehhez a területhez még nem érhető el intézkedési összegzés\./);
  });
});

describe("Compliance safe boundary on the customer topic detail", () => {
  it("never renders legal matrix, anchors, canonical references or internal analysis", () => {
    const markup = renderDetail(
      topic({
        topicId: "portal/nis2-scope",
        missingInformation: [missing()],
      }),
      [controlSummary()],
    );
    assert.doesNotMatch(
      markup,
      /anchorKey|anchorDisplay|canonicalReference|canonicalCitation|CELEX|Jogi mátrix|legal matrix|INTERNAL_ANALYSIS|monitoring manifest|AssessmentFinding/i,
    );
  });

  it("never fabricates a score, percentage or AI claim in the detail", () => {
    const markup = renderDetail(topic({ missingInformation: [missing()] }), [controlSummary()]);
    assert.doesNotMatch(markup, /pontszám|confidence|AI értékelés|kockázati pontszám/i);
  });

  it("keeps the customer component free of internal clause/anchor intelligence tokens", () => {
    const src = source();
    assert.doesNotMatch(
      src,
      /ComplianceClauseAnchor|anchorKey|anchorDisplay|canonicalReference|canonicalCitation|legalSourceBindingStatus|clause-anchors|compliance-intelligence|INTERNAL_ANALYSIS/i,
    );
    // The existing boundary already bans these; assert the new detail keeps it.
    assert.doesNotMatch(src, /storageKey|storagePath|sharePoint|spItemId|internalTitle|uploadedById|reviewer/i);
  });
});

describe("Portal answer payload preserves the typed answering contract", () => {
  const payload = (info: PortalComplianceMissingInfo, input: string) => buildAnswerPayload(info, input);

  it("answers BOOLEAN only with an explicit true/false selection", () => {
    assert.deepEqual(payload(missing({ valueType: "BOOLEAN" }), "true"), { status: "ANSWERED", booleanValue: true });
    assert.deepEqual(payload(missing({ valueType: "BOOLEAN" }), "false"), { status: "ANSWERED", booleanValue: false });
    assert.equal(payload(missing({ valueType: "BOOLEAN" }), ""), null);
    assert.equal(payload(missing({ valueType: "BOOLEAN" }), "maybe"), null);
  });

  it("answers NUMBER and respects integerOnly", () => {
    assert.deepEqual(payload(missing({ valueType: "NUMBER", integerOnly: true }), "42"), { status: "ANSWERED", numberValue: 42 });
    assert.equal(payload(missing({ valueType: "NUMBER", integerOnly: true }), "42.5"), null);
    assert.deepEqual(payload(missing({ valueType: "NUMBER", integerOnly: false }), "42.5"), { status: "ANSWERED", numberValue: 42.5 });
    assert.equal(payload(missing({ valueType: "NUMBER" }), "abc"), null);
    assert.equal(payload(missing({ valueType: "NUMBER" }), ""), null);
  });

  it("answers ENUM only with an approved option", () => {
    assert.deepEqual(payload(missing({ valueType: "ENUM", options: ["A", "B"] }), "B"), { status: "ANSWERED", enumValue: "B" });
    assert.equal(payload(missing({ valueType: "ENUM", options: ["A", "B"] }), "C"), null);
  });

  it("answers DATE and STRING with the trimmed value", () => {
    assert.deepEqual(payload(missing({ valueType: "DATE" }), "2026-05-01"), { status: "ANSWERED", dateValue: "2026-05-01" });
    assert.deepEqual(payload(missing({ valueType: "STRING" }), "  leírás  "), { status: "ANSWERED", stringValue: "leírás" });
  });

  it("performs no request without a resolvable questionKey", () => {
    assert.equal(payload(missing({ questionKey: null }), "42"), null);
  });
});

describe("Compliance overview still surfaces the existing answer contract", () => {
  it("keeps the grouped missing-information sections and answer affordances", () => {
    const src = source();
    assert.match(src, /Ön által megadható adatok/);
    assert.match(src, /Irodai egyeztetést igénylő adatok/);
    assert.match(src, /Irodai egyeztetés szükséges/);
    assert.match(src, /Adat megadása →/);
    assert.match(src, /Jelenleg nincs Öntől várt hiányzó adat ehhez a területhez\./);
  });
});
