import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

// Case Workspace — Kontextus V2 (additive) static contract guards.
//
// V2 is additive on the same /cases/:caseId/context route: the V1 surface must
// remain byte-equivalent in behavior, and the V2 files must implement the
// Backend PR #393 contract exactly (paste/communication sources, ephemeral
// manual terms, detect/review/anonymize with stale fail-closed handling).

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

/** Remove comments before token-level persistence/AI/portal scans. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const v1View = () => read("src/components/cases/CaseContextView.tsx");
const contextPage = () => read("src/app/cases/[caseId]/context/page.tsx");
const v2Main = () => read("src/components/cases/caseContextV2/CaseContextV2.tsx");
const v2Terms = () => read("src/components/cases/caseContextV2/ManualTermsEditor.tsx");
const v2Review = () => read("src/components/cases/caseContextV2/CandidateReviewList.tsx");
const v2Api = () => read("src/lib/caseContextSources.ts");
const v2All = () => [v2Main(), v2Terms(), v2Review(), v2Api()].join("\n");

describe("Case Workspace — Kontextus V2 additive contract", () => {
  it("1. V1 surface is untouched and still renders first on the route", () => {
    const view = v1View();
    for (const marker of [
      /data-testid="case-context-view"/,
      /key: "originReason", label: "Az ügy indoka"/,
      /key: "currentSituation", label: "Jelenlegi helyzet"/,
      /key: "clientExpectation", label: "Ügyfél elvárása"/,
      /key: "urgentAction", label: "Sürgős teendő"/,
      /key: "nextStep", label: "Következő lépés"/,
      /data-testid="case-context-description"/,
      /data-testid="case-context-communications"/,
      /data-testid="case-context-communications-link"/,
      /workspace\.case\.description/,
      /getCaseWorkspace\(caseId\)/,
    ]) {
      assert.match(view, marker, `V1 marker missing: ${marker}`);
    }
    // V1 does not know about the V2 surface (no import, no coupling).
    assert.doesNotMatch(view, /CaseContextV2|caseContextV2/, "V1 view stays decoupled from V2");

    const page = contextPage();
    const v1Index = page.indexOf("<CaseContextView");
    const v2Index = page.indexOf("<CaseContextV2");
    assert.ok(v1Index >= 0, "page renders the V1 view");
    assert.ok(v2Index > v1Index, "V2 renders BELOW V1, additively");
  });

  it("2. the API client mirrors the PR #393 endpoint contract", () => {
    const api = v2Api();
    assert.match(api, /\/cases\/\$\{encodeURIComponent\(caseId\)\}\/context-sources/);
    assert.match(api, /\/from-communication/);
    assert.match(api, /\$\{encodeURIComponent\(sourceId\)\}\/detect/);
    assert.match(api, /\$\{encodeURIComponent\(sourceId\)\}\/anonymize/);
    assert.match(api, /body: JSON\.stringify\(\{ rawText \}\)/);
    assert.match(api, /body: JSON\.stringify\(\{ communicationId \}\)/);
    assert.match(api, /body: JSON\.stringify\(\{ manualTerms \}\)/);
    assert.match(api, /sourceHash: payload\.sourceHash/);
    assert.match(api, /optionsDigest: payload\.optionsDigest/);
    assert.match(api, /approvedCandidateIds: payload\.approvedCandidateIds/);
  });

  it("3. pasted-source create sends only rawText (manual terms never ride along)", () => {
    const main = v2Main();
    assert.match(main, /createPastedCaseContextSource\(caseId, pasteText\)/);
    const api = v2Api();
    const start = api.indexOf("export async function createPastedCaseContextSource");
    const end = api.indexOf("export async function createCommunicationCaseContextSource");
    const createFn = api.slice(start, end);
    assert.match(createFn, /JSON\.stringify\(\{ rawText \}\)/);
    assert.doesNotMatch(createFn, /manualTerms/, "create payload must not include manual terms");
  });

  it("4. communication import is ID-only (no copied body pretending provenance)", () => {
    const main = v2Main();
    assert.match(main, /createCommunicationCaseContextSource\(caseId, selectedCommunicationId\)/);
    const api = v2Api();
    const start = api.indexOf("export async function createCommunicationCaseContextSource");
    const end = api.indexOf("export async function listCaseContextSources");
    const commFn = api.slice(start, end);
    assert.match(commFn, /JSON\.stringify\(\{ communicationId \}\)/);
    assert.doesNotMatch(commFn, /rawText|contentPreview/, "no body is copied into the request");
  });

  it("5. manual terms are ephemeral: no frontend persistence anywhere", () => {
    const v2 = stripComments(v2All());
    for (const forbidden of [/localStorage/, /sessionStorage/, /indexedDB/, /URLSearchParams/, /history\.pushState/]) {
      assert.doesNotMatch(v2, forbidden, `no persistence via ${forbidden}`);
    }
    assert.match(v2Terms(), /Manuális/);
    assert.match(v2Terms(), /[Nn]em kerülnek mentésre/, "editor states terms are not saved");
  });

  it("6. detect sends manual terms and stores sourceHash + optionsDigest verbatim", () => {
    const main = v2Main();
    assert.match(main, /detectCaseContextSource\(caseId, source\.id, manualTerms\)/);
    assert.match(main, /sourceHash: response\.sourceHash/);
    assert.match(main, /optionsDigest: response\.optionsDigest/);
  });

  it("7. candidate approval is explicit and starts empty", () => {
    const main = v2Main();
    assert.match(main, /approvedIds: new Set<string>\(\)/);
    assert.match(main, /handleToggleCandidate/);
    assert.match(main, /approvedCandidateIds: \[\.\.\.review\.approvedIds\]/);
    const reviewList = v2Review();
    assert.match(reviewList, /checked=\{approved\}/);
    assert.match(reviewList, /onChange=\{\(\) => onToggle\(candidate\.id\)\}/);
    assert.match(reviewList, /Nincs jóváhagyva — nem kerül alkalmazásra/);
    assert.match(reviewList, /Jóváhagyva — alkalmazásra kerül/);
  });

  it("8. anonymize uses the review token from THAT detection (snapshot terms, not live)", () => {
    const main = v2Main();
    assert.match(main, /manualTerms: review\.termsAtDetect/);
    assert.match(main, /sourceHash: review\.sourceHash/);
    assert.match(main, /optionsDigest: review\.optionsDigest/);
  });

  it("9. stale/conflict fails closed: no silent retry, review cleared, detect required again", () => {
    const main = v2Main();
    assert.match(main, /STALE_REVIEW_CODES\.has\(String\(error\.code \?\? ""\)\)/);
    const staleBranch = main.slice(main.indexOf("STALE_REVIEW_CODES.has"));
    assert.match(staleBranch, /setReview\(null\)/, "review is cleared on stale conflict");
    assert.match(staleBranch, /Futtasd újra a Detektálást/, "controlled message requires Detect again");
    assert.doesNotMatch(staleBranch, /while \(|for \(|retry|setTimeout/, "no automatic retry loop");
    const api = v2Api();
    assert.match(api, /SOURCE_HASH_MISMATCH/);
    assert.match(api, /OPTIONS_DIGEST_MISMATCH/);
    assert.match(api, /UNKNOWN_CANDIDATE_ID/);
    assert.match(api, /CONTEXT_SOURCE_ALREADY_ANONYMIZED/);
  });

  it("10. raw source and anonymized derivative are rendered separately; raw is immutable", () => {
    const main = v2Main();
    assert.match(main, /Eredeti forrásszöveg/);
    assert.match(main, /Anonimizált változat/);
    assert.match(main, /data-testid=\{`ccv2-source-raw-\$\{source\.id\}\`\}/);
    assert.match(main, /data-testid=\{`ccv2-source-anonymized-\$\{source\.id\}\`\}/);
    assert.match(main, /\{source\.rawText\}/, "raw text is rendered verbatim");
    assert.match(main, /\{source\.anonymizedText\}/, "anonymized text is rendered separately");
    assert.doesNotMatch(main, /value=\{source\.rawText\}|onChange.*rawText/, "raw source has no edit control");
    assert.match(main, /A mentett forrás szövege nem módosítható/, "raw immutability is stated");
  });

  it("11. no external AI is reachable from the V2 surface", () => {
    const v2 = stripComments(v2All());
    for (const forbidden of [/openai/i, /anthropic/i, /claude/i, /gemini/i, /gpt-?4|chatgpt/i, /preparePromptDraft/, /azure.?openai/i]) {
      assert.doesNotMatch(v2, forbidden, `no external AI via ${forbidden}`);
    }
    const main = v2Main();
    const called = ["listCaseContextSources", "createPastedCaseContextSource", "createCommunicationCaseContextSource", "detectCaseContextSource", "anonymizeCaseContextSource"];
    for (const fn of called) {
      assert.match(main, new RegExp(fn), `internal call ${fn} present`);
    }
  });

  it("12. no client portal exposure: workforce internal only", () => {
    const v2 = stripComments(v2All());
    for (const forbidden of [/portal/i, /client-portal/i, /authContext:\s*['"]customer/, /x-client-portal-workspace/]) {
      assert.doesNotMatch(v2, forbidden, `no portal surface via ${forbidden}`);
    }
    assert.match(v2Api(), /fetchApi</, "uses the workforce default auth context");
  });

  it("13. responsive layout primitives are used (mobile-safe)", () => {
    const v2 = v2Main() + v2Terms() + v2Review() + contextPage();
    assert.match(v2, /flex-wrap/);
    assert.match(v2, /sm:grid-cols|sm:flex|sm:/, "responsive sm: utilities present");
    assert.match(v2, /max-w-\[1400px\]|px-4/);
    assert.doesNotMatch(v2, /w-\[9\d\dpx\]|min-w-\[6\d\dpx\]/, "no desktop-fixed widths");
  });

  it("14. honest empty states exist for sources, communications and candidates", () => {
    const main = v2Main();
    assert.match(main, /még nincs mentett további kontextusforrás/);
    assert.match(main, /nincs kapcsolt kommunikáció/);
    assert.match(v2Review(), /nem talált érzékenynek tűnő elemet/);
  });

  it("15. no backend/schema change ships in this frontend branch", () => {
    const schema = read("../Backend/prisma/schema.prisma");
    assert.doesNotMatch(schema, /model CaseContextSource/, "frontend branch must not add the backend model");
    assert.ok(existsSync(path.resolve(process.cwd(), "src/lib/caseContextSources.ts")));
  });
});
