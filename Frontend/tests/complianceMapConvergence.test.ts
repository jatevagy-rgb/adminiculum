import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  OrgComplianceView,
  TopicDocuments,
  classifyTopic,
  controlProgressFor,
  filterTopics,
  hasPortalAnswerableMissingInformation,
  nextActionFor,
  primaryBadgeLabel,
  refreshAfterProfileAnswer,
  secondaryStateNote,
  summarizeTopics,
  topicStateLabel,
} from "../src/components/client-portal/OrgComplianceView";
import { companyProfileCompletion } from "../src/lib/companyProfileCompletion";
import { portalDownloadUrl } from "../src/lib/clientPortalApi";
import type {
  PortalComplianceControlSummary,
  PortalComplianceDocument,
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
    // Successful save refreshes BOTH compliance and profile completion (narrow).
    assert.match(src, /setActionSuccess\("Adat sikeresen rögzítve\."\)/);
    assert.match(src, /await refreshAfterProfileAnswer\(/);
  });

  it("A. profile completion counts only ANSWERED (UNKNOWN is not provided)", () => {
    const progress = companyProfileCompletion([
      { status: "ANSWERED" },
      { status: "ANSWERED" },
      { status: "UNKNOWN" },
      { status: "UNANSWERED" },
    ]);
    assert.equal(progress.answered, 2);
    assert.equal(progress.total, 4);
  });

  it("B. control progress counts IMPLEMENTED only and copy does not claim rendezett", () => {
    const summary: PortalComplianceControlSummary[] = [
      {
        requirementTitle: "Általános adatvédelem",
        controls: [
          { title: "A", implementationStatus: "IMPLEMENTED", lastReviewedAt: null, nextReviewAt: null, evidence: { acceptedCurrent: 0, stale: 0, missing: true } },
          { title: "B", implementationStatus: "IMPLEMENTING", lastReviewedAt: null, nextReviewAt: null, evidence: { acceptedCurrent: 0, stale: 0, missing: true } },
        ],
      },
    ];
    const progress = controlProgressFor(topic(), summary);
    assert.deepEqual(progress, { done: 1, total: 2, nextReviewAt: null });

    const src = source();
    assert.match(src, /Implementált kontrollok:/);
    assert.doesNotMatch(src, /rendezett/i);
  });

  it("C. a successful inline answer refreshes compliance AND profile completion", async () => {
    let complianceRefreshes = 0;
    let completion = companyProfileCompletion([
      { status: "ANSWERED" },
      { status: "ANSWERED" },
      { status: "UNKNOWN" },
      { status: "UNANSWERED" },
    ]);
    assert.deepEqual({ answered: completion.answered, total: completion.total }, { answered: 2, total: 4 });

    await refreshAfterProfileAnswer({
      refreshCompliance: async () => {
        complianceRefreshes += 1;
      },
      refreshProfileCompletion: async () => {
        // The canonical discovery now returns 3 ANSWERED after the inline answer.
        completion = companyProfileCompletion([
          { status: "ANSWERED" },
          { status: "ANSWERED" },
          { status: "ANSWERED" },
          { status: "UNANSWERED" },
        ]);
      },
    });

    assert.equal(complianceRefreshes, 1);
    assert.deepEqual({ answered: completion.answered, total: completion.total }, { answered: 3, total: 4 });
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

describe("Compliance Map truthful primary-state convergence", () => {
  // The exact live reproduction: topic whose backend raw state is lawyer review
  // while the card simultaneously offers executable customer input.
  const lawyerWithCustomerInput = (): PortalComplianceTopic =>
    topic({
      topicId: "portal/nis2-scope",
      topicLabel: "Kiberbiztonsági (NIS2) hatály",
      state: "LAWYER_REVIEW_REQUIRED",
      shortExplanation: "NIS2 hatályvizsgálat.",
      missingInformation: [missing()],
      nextAction: "Ügyvédi áttekintés javasolt.",
    });

  it("A. executable customer input is the PRIMARY bucket, even under lawyer review", () => {
    const t = lawyerWithCustomerInput();
    const bucket = classifyTopic(t);
    assert.equal(bucket, "CUSTOMER_ACTION");
    assert.equal(primaryBadgeLabel(t, bucket), "Adatra várunk Öntől");
    // Raw backend state is preserved, but never as the contradictory primary badge.
    assert.equal(topicStateLabel(t), "Ügyvédi vizsgálat alatt");
    assert.notEqual(primaryBadgeLabel(t, bucket), topicStateLabel(t));
    assert.match(secondaryStateNote(t, bucket) ?? "", /ügyvédi vizsgálat/i);
    // The immediate next step belongs to the customer, not the lawyer.
    assert.equal(nextActionFor(t, bucket), "Kérjük, adja meg az alábbi hiányzó adatokat a portálon.");
  });

  it("A. the card shows the bucket badge and the gated customer CTA", () => {
    const src = source();
    assert.match(src, /\{primaryBadgeLabel\(topic, bucket\)\}/);
    // The office dimension must NOT be presented as the topic "state": customer
    // next step and office processing are rendered as explicit separate labels.
    assert.doesNotMatch(src, /Állapot: \{topicStateLabel\(topic\)\}/);
    assert.match(src, /\{customerActionNote\(topic\)\}/);
    assert.match(src, /\{officeProcessingNote\(topic\)\}/);
    assert.match(src, /info\.portalAnswerable && info\.questionKey \?/);
    assert.match(src, /Adat megadása →/);
  });

  it("B. once the missing data is supplied the primary bucket becomes LAWYER_REVIEW", () => {
    const after = topic({ topicId: "portal/nis2-scope", state: "LAWYER_REVIEW_REQUIRED", missingInformation: [] });
    assert.equal(classifyTopic(after), "LAWYER_REVIEW");
    assert.equal(primaryBadgeLabel(after, "LAWYER_REVIEW"), "Ügyvédi vizsgálat");
    assert.equal(secondaryStateNote(after, "LAWYER_REVIEW"), null);
  });

  it("C. ACTION_IN_PROGRESS with no outstanding customer input stays IN_PROGRESS", () => {
    const t = topic({ state: "ACTION_IN_PROGRESS", missingInformation: [] });
    assert.equal(classifyTopic(t), "IN_PROGRESS");
    assert.equal(primaryBadgeLabel(t, "IN_PROGRESS"), "Folyamatban");
  });

  it("D. RESOLVED with no missing information is NO_ACTION", () => {
    const t = topic({ state: "RESOLVED", missingInformation: [] });
    assert.equal(classifyTopic(t), "NO_ACTION");
    assert.equal(primaryBadgeLabel(t, "NO_ACTION"), "Nincs jelenlegi teendő");
  });

  it("E. summary counts exactly match the shared primary buckets (no double counting)", () => {
    const topics = [
      lawyerWithCustomerInput(), // lawyer + portal-answerable -> CUSTOMER_ACTION only
      topic({ topicId: "b", state: "LAWYER_REVIEW_REQUIRED" }),
      topic({ topicId: "c", state: "ACTION_IN_PROGRESS" }),
      topic({ topicId: "d", state: "RESOLVED" }),
      topic({ topicId: "e", state: "REVIEW_RECOMMENDED" }),
    ];
    const counts = summarizeTopics(topics);
    assert.deepEqual(counts, { CUSTOMER_ACTION: 2, IN_PROGRESS: 1, LAWYER_REVIEW: 1, NO_ACTION: 1 });
    assert.equal(counts.CUSTOMER_ACTION + counts.IN_PROGRESS + counts.LAWYER_REVIEW + counts.NO_ACTION, topics.length);
    // The conflicted topic is NOT also counted under lawyer review.
    assert.equal(classifyTopic(topics[0]), "CUSTOMER_ACTION");
    assert.equal(classifyTopic(topics[1]), "LAWYER_REVIEW");
  });

  it("F. non-portal-answerable missing info alone never produces a customer CTA", () => {
    const notAnswerable = topic({
      state: "LAWYER_REVIEW_REQUIRED",
      missingInformation: [missing({ portalAnswerable: false, questionKey: null })],
    });
    assert.equal(hasPortalAnswerableMissingInformation(notAnswerable), false);
    assert.equal(classifyTopic(notAnswerable), "LAWYER_REVIEW");
    assert.notEqual(primaryBadgeLabel(notAnswerable, "LAWYER_REVIEW"), "Adatra várunk Öntől");

    // portalAnswerable without a resolvable questionKey is also not executable.
    const noKey = topic({
      state: "LAWYER_REVIEW_REQUIRED",
      missingInformation: [missing({ portalAnswerable: true, questionKey: null })],
    });
    assert.equal(hasPortalAnswerableMissingInformation(noKey), false);
    assert.equal(classifyTopic(noKey), "LAWYER_REVIEW");
  });

  it("G. renders published documents and only the canonical download route", () => {
    const documents: PortalComplianceDocument[] = [
      { publicationId: "pub-1", title: "Adatkezelési tájékoztató", versionLabel: "v2", publishedAt: "2026-08-01T00:00:00.000Z", downloadAvailable: true },
    ];
    const markup = renderToStaticMarkup(createElement(TopicDocuments, { documents }));
    assert.match(markup, /Adatkezelési tájékoztató/);
    assert.match(markup, /v2/);
    assert.match(markup, /Közzétett dokumentumok/);
    assert.ok(markup.includes(portalDownloadUrl("pub-1")));
  });

  it("H. invents no document when a topic has none", () => {
    const markup = renderToStaticMarkup(createElement(TopicDocuments, { documents: [] }));
    assert.equal(markup, "");
  });

  it("H. omits the download action when it is not available", () => {
    const documents: PortalComplianceDocument[] = [
      { publicationId: "pub-2", title: "Belső szabályzat", versionLabel: "v1", publishedAt: "2026-08-02T00:00:00.000Z", downloadAvailable: false },
    ];
    const markup = renderToStaticMarkup(createElement(TopicDocuments, { documents }));
    assert.match(markup, /Belső szabályzat/);
    assert.equal(markup.includes("/download"), false);
  });

  it("I. control progress counts IMPLEMENTED only (1 / 2) and never claims rendezett", () => {
    const summary: PortalComplianceControlSummary[] = [
      {
        requirementTitle: "Általános adatvédelem",
        controls: [
          { title: "A", implementationStatus: "IMPLEMENTED", lastReviewedAt: null, nextReviewAt: null, evidence: { acceptedCurrent: 1, stale: 0, missing: false } },
          { title: "B", implementationStatus: "IMPLEMENTING", lastReviewedAt: null, nextReviewAt: null, evidence: { acceptedCurrent: 0, stale: 0, missing: true } },
        ],
      },
    ];
    assert.deepEqual(controlProgressFor(topic(), summary), { done: 1, total: 2, nextReviewAt: null });
    const src = source();
    assert.match(src, /Implementált kontrollok:/);
    assert.doesNotMatch(src, /rendezett/i);
  });

  it("J. invents no control progress without an authoritative projection", () => {
    assert.equal(controlProgressFor(topic(), undefined), null);
    assert.equal(controlProgressFor(topic(), []), null);
    assert.equal(
      controlProgressFor(topic({ topicLabel: "Nincs ilyen" }), [
        {
          requirementTitle: "Más terület",
          controls: [{ title: "A", implementationStatus: "IMPLEMENTED", lastReviewedAt: null, nextReviewAt: null, evidence: { acceptedCurrent: 1, stale: 0, missing: false } }],
        },
      ]),
      null,
    );
    assert.match(source(), /\{progress \? \(/);
  });

  it("K. search and status filter still work after the card recomposition", () => {
    const topics = [
      topic({ topicId: "nis2", topicLabel: "Kiberbiztonsági (NIS2) hatály", shortExplanation: "NIS2", state: "LAWYER_REVIEW_REQUIRED", missingInformation: [missing()] }),
      topic({ topicId: "gdpr", topicLabel: "Általános adatvédelem", shortExplanation: "GDPR", state: "RESOLVED" }),
    ];
    // The conflicted topic filters under CUSTOMER_ACTION, never under lawyer review.
    assert.deepEqual(filterTopics(topics, "", "CUSTOMER_ACTION").map((t) => t.topicId), ["nis2"]);
    assert.deepEqual(filterTopics(topics, "", "LAWYER_REVIEW").map((t) => t.topicId), []);
    assert.deepEqual(filterTopics(topics, "gdpr", "ALL").map((t) => t.topicId), ["gdpr"]);
    assert.deepEqual(filterTopics(topics, "nis2", "ALL").map((t) => t.topicId), ["nis2"]);
    assert.deepEqual(filterTopics(topics, "nincs talalat", "ALL"), []);
  });

  it("L. inline answer refreshes compliance AND profile completion without a reload", async () => {
    const calls: string[] = [];
    await refreshAfterProfileAnswer({
      refreshCompliance: async () => { calls.push("compliance"); },
      refreshProfileCompletion: async () => { calls.push("profile"); },
    });
    assert.deepEqual(calls.sort(), ["compliance", "profile"]);

    const src = source();
    // Both the ANSWERED and the UNKNOWN paths use the same narrow refresh.
    assert.equal((src.match(/await refreshAfterProfileAnswer\(/g) ?? []).length, 2);
    assert.match(src, /refreshCompliance: \(\) => load\(\{ silent: true \}\)/);
    assert.match(src, /refreshProfileCompletion: loadProfile/);
    assert.match(src, /const progress = controlProgressFor\(topic, data\?\.controlsSummary\)/);
  });

  it("keeps REVIEW_RECOMMENDED on its canonical customer-attention mapping", () => {
    const t = topic({ state: "REVIEW_RECOMMENDED" });
    assert.equal(classifyTopic(t), "CUSTOMER_ACTION");
    assert.equal(primaryBadgeLabel(t, "CUSTOMER_ACTION"), "Teendő tőletek");
    assert.equal(secondaryStateNote(t, "CUSTOMER_ACTION"), null);
  });

  it("keeps the canonical backend nextAction outside the conflicting case", () => {
    const lawyer = topic({ state: "LAWYER_REVIEW_REQUIRED", missingInformation: [], nextAction: "Ügyvédi áttekintés javasolt." });
    assert.equal(nextActionFor(lawyer, "LAWYER_REVIEW"), "Ügyvédi áttekintés javasolt.");
    const more = topic({
      state: "MORE_INFORMATION_NEEDED",
      missingInformation: [missing()],
      nextAction: "Kérjük, töltse ki a hiányzó információkat a portálon.",
    });
    assert.equal(nextActionFor(more, "CUSTOMER_ACTION"), "Kérjük, töltse ki a hiányzó információkat a portálon.");
  });
});
