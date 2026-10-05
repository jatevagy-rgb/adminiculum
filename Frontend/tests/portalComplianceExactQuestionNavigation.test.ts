import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  complianceTargetHref,
  readQuestionParam,
  readTopicParam,
  resolvePortalAnswerableQuestionKey,
  withComplianceTarget,
  withTopicParam,
} from "../src/components/client-portal/OrgComplianceView";
import type { PortalComplianceMissingInfo, PortalComplianceTopic } from "../src/lib/clientPortalApi";

/**
 * UX-02 exact-question navigation contract: the compliance surface must follow
 * the real Next search params for the selected topic and the exact
 * portal-answerable question, while the route stays customer-safe (only the
 * registry topicId and canonical questionKey ever appear in the URL).
 */

const root = process.cwd();
const source = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const v3Source = () => source("src/components/client-portal-v3/compliance/PortalComplianceV3.tsx");
const rowSource = () => source("src/components/client-portal-v3/actions/PortalActionRow.tsx");

const missing = (overrides: Partial<PortalComplianceMissingInfo> = {}): PortalComplianceMissingInfo => ({
  label: "Munkavállalók száma",
  portalAnswerable: true,
  questionKey: "company_employee_count",
  valueType: "NUMBER",
  integerOnly: true,
  ...overrides,
});

const topic = (overrides: Partial<PortalComplianceTopic> = {}): PortalComplianceTopic => ({
  topicId: "portal/nis2-scope",
  topicLabel: "Kiberbiztonsági (NIS2) hatály",
  state: "MORE_INFORMATION_NEEDED",
  shortExplanation: "NIS2 hatályvizsgálat.",
  missingInformation: [],
  nextAction: null,
  documents: [],
  ...overrides,
});

describe("Canonical customer-safe compliance target", () => {
  it("builds the exact topic + question href for a portal-answerable missing fact", () => {
    const href = complianceTargetHref("portal/nis2-scope", "company_employee_count");
    assert.equal(href, "/portal/megfeleles?topic=portal%2Fnis2-scope&question=company_employee_count");
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    assert.equal(params.get("topic"), "portal/nis2-scope");
    assert.equal(params.get("question"), "company_employee_count");
  });

  it("never exposes internal fact, rule or finding identifiers", () => {
    const href = complianceTargetHref("portal/nis2-scope", "company_employee_count");
    for (const forbidden of ["factDefinition", "requirementVersionId", "clientControlId", "findingId", "ruleId"]) {
      assert.ok(!href.toLowerCase().includes(forbidden.toLowerCase()), `href must not contain ${forbidden}`);
    }
    assert.doesNotMatch(href, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("keeps two missing questions of the same topic on distinct stable hrefs", () => {
    const first = complianceTargetHref("portal/nis2-scope", "company_employee_count");
    const second = complianceTargetHref("portal/nis2-scope", "company_sites");
    assert.notEqual(first, second);
    assert.equal(complianceTargetHref("portal/nis2-scope", "company_employee_count"), first);
  });

  it("updates same-route search params without drifting other parameters", () => {
    assert.equal(withComplianceTarget("?topic=portal%2Fa&question=q1", "portal/b", null), "?topic=portal%2Fb");
    assert.equal(withComplianceTarget("?topic=portal%2Fa", "portal/b", "q2"), "?topic=portal%2Fb&question=q2");
    assert.equal(withComplianceTarget("?topic=portal%2Fa&question=q1", null, null), "");
    assert.equal(withComplianceTarget("?topic=portal%2Fa&keep=1", null, null), "?keep=1");
    assert.equal(withComplianceTarget("?other=1", "portal/b", "q2"), "?other=1&topic=portal%2Fb&question=q2");
  });

  it("preserves the existing topic-only helper behavior", () => {
    assert.equal(withTopicParam("?topic=x&a=1", null), "?a=1");
    assert.equal(withTopicParam("?a=1", "b"), "?a=1&topic=b");
  });

  it("reads the exact question parameter only when non-empty", () => {
    assert.equal(readQuestionParam("?topic=x&question=q1"), "q1");
    assert.equal(readQuestionParam("?question="), null);
    assert.equal(readQuestionParam("?question=%20"), null);
    assert.equal(readQuestionParam(""), null);
  });

  it("reads the topic parameter from the framework search string", () => {
    assert.equal(readTopicParam("topic=portal%2Fnis2-scope&question=q1"), "portal/nis2-scope");
    assert.equal(readTopicParam(""), null);
  });
});

describe("Exact question resolution", () => {
  it("matches only the exact portal-answerable question", () => {
    const t = topic({
      missingInformation: [
        missing(),
        missing({ label: "Telephelyek", questionKey: "company_sites", valueType: "STRING" }),
        missing({ label: "Ügyvédi kérdés", questionKey: "office_only", portalAnswerable: false }),
      ],
    });
    assert.equal(resolvePortalAnswerableQuestionKey(t, "company_employee_count"), "company_employee_count");
    assert.equal(resolvePortalAnswerableQuestionKey(t, "company_sites"), "company_sites");
  });

  it("returns null for a stale or unavailable question and never guesses", () => {
    const t = topic({ missingInformation: [missing(), missing({ questionKey: "company_sites" })] });
    assert.equal(resolvePortalAnswerableQuestionKey(t, "stale_question"), null);
    assert.equal(resolvePortalAnswerableQuestionKey(t, "office_only"), null);
    assert.equal(resolvePortalAnswerableQuestionKey(t, null), null);
    assert.equal(resolvePortalAnswerableQuestionKey(topic({ missingInformation: [] }), "company_employee_count"), null);
  });
});

describe("PortalComplianceV3 follows the framework search params", () => {
  it("derives the selected topic and question from useSearchParams, not mount-only window state", () => {
    const src = v3Source();
    assert.match(src, /import \{ usePathname, useRouter, useSearchParams \} from "next\/navigation"/);
    assert.match(src, /readTopicParam\(searchString\)/);
    assert.match(src, /readQuestionParam\(searchString\)/);
    assert.doesNotMatch(src, /popstate/);
    assert.doesNotMatch(src, /window\.history/);
  });

  it("navigates topic selection through the framework router", () => {
    const src = v3Source();
    assert.match(src, /router\.push\(next, \{ scroll: false \}\)/);
    assert.match(src, /router\.replace\(/);
    assert.match(src, /withComplianceTarget\(searchString, topicId, null\)/);
    assert.doesNotMatch(src, /window\.location/);
  });

  it("opens the exact matching answer control and shows a truthful stale state", () => {
    const src = v3Source();
    assert.match(src, /matchedQuestionKey/);
    assert.match(src, /resolvePortalAnswerableQuestionKey\(selectedTopic, requestedQuestionKey\)/);
    assert.match(src, /focusQuestionKey=\{requestedQuestionKey\}/);
    assert.match(src, /portal-compliance-question-unavailable/);
    assert.match(src, /data-testid="portal-compliance-answer-control"/);
    assert.doesNotMatch(src, /setActiveQuestionKey\(requestedQuestionKey\)/);
  });

  it("keeps the typed answer mechanism local and never submits automatically from the URL", () => {
    const src = v3Source();
    assert.match(src, /answerPortalCompanyProfileQuestion\(info\.questionKey, payload\)/);
    assert.match(src, /status: "UNKNOWN"/);
    const answerCalls = src.match(/answerPortalCompanyProfileQuestion\(/g) ?? [];
    assert.equal(answerCalls.length, 2, "only the explicit save and mark-unknown handlers may answer");
  });

  it("sends the compliance worklist through the same canonical semantic route", () => {
    const src = v3Source();
    assert.match(src, /href: complianceTargetHref\(topic\.topicId, answerable\[0\]\?\.questionKey\)/);
  });

  it("keeps the manual Állapotok topic detail route working", () => {
    const src = v3Source();
    assert.match(src, /Részletek megnyitása →/);
    assert.match(src, /onClick=\{\(\) => applyTopicSelection\(topic\.topicId\)\}/);
  });

  it("wraps long question text on the touched action rows instead of truncating it", () => {
    const src = rowSource();
    assert.match(src, /break-words text-sm font-semibold text-\[var\(--adm-text-primary\)\]/);
    assert.doesNotMatch(src, /truncate text-sm font-semibold text-\[var\(--adm-text-primary\)\]/);
  });
});
