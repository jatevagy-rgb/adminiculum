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
//
// The Luna UI refinement (compact source index + selected detail, contextual
// primary actions, modal intake, zero-approval confirmation, raw/anonymized
// toggle) keeps the same functional semantics.

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
    assert.match(v2Terms(), /Saját kifejezések/);
    assert.match(v2Terms(), /nem maradnak meg/, "editor states terms are not saved");
  });

  it("6. detect sends manual terms and stores sourceHash + optionsDigest verbatim", () => {
    const main = v2Main();
    assert.match(main, /detectCaseContextSource\(caseId, source\.id, manualTerms\)/);
    assert.match(main, /sourceHash: response\.sourceHash/);
    assert.match(main, /optionsDigest: response\.optionsDigest/);
  });

  it("7. candidate approval is explicit and starts empty; select-all/clear are explicit actions only", () => {
    const main = v2Main();
    assert.match(main, /approvedIds: new Set<string>\(\)/);
    assert.match(main, /handleToggleCandidate/);
    assert.match(main, /approvedCandidateIds: \[\.\.\.review\.approvedIds\]/);
    // Detect response must NOT auto-select anything.
    const detectBranch = main.slice(
      main.indexOf("detectCaseContextSource(caseId, source.id, manualTerms)"),
      main.indexOf("const handleToggleCandidate"),
    );
    assert.match(detectBranch, /approvedIds: new Set<string>\(\)/, "detect resets approvals to empty");
    assert.doesNotMatch(detectBranch, /handleSelectAll/, "detect never calls select-all");
    // Select-all/clear are reachable only from explicit user buttons.
    assert.match(main, /onClick=\{handleSelectAll\}/);
    assert.match(main, /onClick=\{handleClearSelection\}/);
    const reviewList = v2Review();
    assert.match(reviewList, /checked=\{approved\}/);
    assert.match(reviewList, /onChange=\{\(\) => onToggle\(candidate\.id\)\}/);
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
    assert.match(main, /Az ellenőrzés már nem aktuális\. Futtasd újra az ellenőrzést/, "controlled stale copy requires Detect again");
    const staleBranch = main.slice(
      main.indexOf("STALE_REVIEW_CODES.has"),
      main.indexOf("const handleApply"),
    );
    assert.match(staleBranch, /setReview\(null\)/, "review is cleared on stale conflict");
    assert.match(staleBranch, /setApplyError\(\{ sourceId, message: STALE_REVIEW_MESSAGE \}\)/, "stale branch surfaces the controlled message");
    assert.doesNotMatch(staleBranch, /while \(|for \(|retry|setTimeout/, "no automatic retry loop");
    const api = v2Api();
    assert.match(api, /SOURCE_HASH_MISMATCH/);
    assert.match(api, /OPTIONS_DIGEST_MISMATCH/);
    assert.match(api, /UNKNOWN_CANDIDATE_ID/);
    assert.match(api, /CONTEXT_SOURCE_ALREADY_ANONYMIZED/);
  });

  it("10. raw source and anonymized derivative are rendered separately; raw is immutable", () => {
    const main = v2Main();
    assert.match(main, /Nyers forrás/);
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
    assert.match(v2, /break-words|break-all/, "long values wrap instead of overflowing");
  });

  it("14. honest empty/error states exist for sources, communications and candidates", () => {
    const main = v2Main();
    assert.match(main, /még nincs mentett kontextusforrás/);
    assert.match(main, /nincs átvehető kommunikáció/);
    assert.match(v2Review(), /Nem jelöltünk meg automatikusan ellenőrizendő elemet/);
    assert.match(main, /A kommunikációk most nem tölthetők be\./);
    assert.match(main, /Újrapróbálom/);
  });

  it("15. no backend/schema change ships in this frontend branch", () => {
    const schema = read("../Backend/prisma/schema.prisma");
    assert.doesNotMatch(schema, /model CaseContextSource/, "frontend branch must not add the backend model");
    assert.ok(existsSync(path.resolve(process.cwd(), "src/lib/caseContextSources.ts")));
  });

  it("16. product language: Kontextusforrások, no developer version framing", () => {
    const main = stripComments(v2Main());
    assert.match(main, /Kontextusforrások/);
    assert.match(main, /Az ügyhöz tartozó, feldolgozásra előkészített források\./);
    assert.doesNotMatch(main, /Kontextus V2|eyebrow="Kontextus V2"/, "no developer version framing in the visible surface");
  });

  it("17. technical implementation copy is removed from the ordinary workflow", () => {
    const visible = stripComments(v2Main() + v2Terms() + v2Review());
    for (const forbidden of [
      /determinisztikus szabályokat használja/,
      /külső AI-szolgáltatás nem vesz részt/,
      /Helyettesítés: memóriában/,
      /mappingLocation/,
      /resultHash/,
      /algorithmRevision/,
    ]) {
      assert.doesNotMatch(visible, forbidden, `technical copy removed: ${forbidden}`);
    }
    assert.doesNotMatch(v2Review(), /candidate\.detector|detektor/, "detector stays out of ordinary row presentation");
  });

  it("18. one selected source detail via local selection state (master/detail)", () => {
    const main = v2Main();
    assert.match(main, /useState<string \| null>\(null\)/, "selectedSourceId is local UI state only");
    assert.match(main, /data-testid=\{`ccv2-source-detail-\$\{source\.id\}\`\}/, "one detail per selected source");
    assert.match(main, /lg:grid-cols-\[300px_minmax\(0,1fr\)\]/, "compact master column with flexible detail");
    assert.doesNotMatch(stripComments(main), /selectedSourceId.*localStorage|persist/i, "no selection persistence");
  });

  it("19. zero-approval requires an explicit confirmation with preserved [] payload", () => {
    const main = v2Main();
    assert.match(main, /review\.approvedIds\.size === 0/);
    assert.match(main, /setZeroApprovalOpen\(true\)/);
    assert.match(main, /Egy elemet sem hagytál jóvá\./);
    assert.match(main, /A létrejövő változat megegyezik a nyers szöveggel/);
    assert.match(main, /Folytatás változatlan szöveggel/);
    assert.match(main, /Vissza az ellenőrzéshez/);
    assert.match(main, /approvedCandidateIds: \[\.\.\.review\.approvedIds\]/, "empty approval set is sent as []");
  });

  it("20. accessibility: labelled controls and no incomplete tab semantics", () => {
    const main = v2Main();
    assert.match(main, /id="ccv2-paste-textarea"/, "paste textarea has an explicit id");
    assert.match(main, /label="Szöveg"/, "paste textarea has an explicit label");
    assert.match(main, /id="ccv2-communication-select"/, "communication select has an explicit id");
    assert.match(main, /label="Kommunikáció"/, "communication select has an explicit label");
    assert.match(main, /aria-pressed/, "mutually exclusive views use aria-pressed");
    const v2 = v2Main() + v2Terms() + v2Review();
    assert.doesNotMatch(v2, /role="tab"/, "no incomplete tab semantics");
    assert.doesNotMatch(v2, /role="tablist"/, "no fake tablist");
  });

  it("21. candidate row hierarchy: originalText first, detector hidden, confidence quiet", () => {
    const reviewList = v2Review();
    const rowStart = reviewList.indexOf("candidate.originalText");
    const rowEnd = reviewList.indexOf("candidate.proposedReplacement", rowStart);
    assert.ok(rowStart >= 0 && rowEnd > rowStart, "originalText leads the row before the replacement");
    assert.doesNotMatch(reviewList, /candidate\.detector/, "detector is not rendered");
    assert.match(reviewList, /Csere:/, "replacement is clearly labelled");
    assert.match(reviewList, /CONFIDENCE_LABELS\[candidate\.confidence\]/, "confidence stays a quiet secondary detail");
    assert.match(reviewList, /break-words|break-all/, "long values wrap");
  });

  it("22. result metadata is restrained (applied count only, no internals)", () => {
    const main = v2Main();
    assert.match(main, /elem cserélve/, "applied count is shown when safe");
    assert.match(main, /anonymizationSnapshot\?\.appliedCount/);
    assert.doesNotMatch(main, /categoryCounts|anonymizationSnapshot\?\.sourceHash/, "category-count internals stay hidden");
  });

  it("23. detect/apply errors are tagged with the canonical source and render only for that source", () => {
    const main = v2Main();
    assert.match(main, /type SourceError = \{[\s\S]*?sourceId: string;[\s\S]*?message: string;[\s\S]*?\}/, "SourceError carries the canonical source id");
    assert.match(main, /useState<SourceError \| null>\(null\)/, "detect/apply errors use the tagged state");
    assert.match(main, /detectError\.sourceId === source\.id/, "detect error renders only under its own source");
    assert.match(main, /applyError\.sourceId === source\.id/, "apply error renders only under its own source");
    assert.match(main, /setDetectError\(\{ sourceId: source\.id, message: detectErrorMessage\(error\) \}\)/, "detect failure tags the failing source");
    assert.match(main, /const sourceId = review\.sourceId;/, "apply captures the reviewed source id before the request");
    const applyCatch = main.slice(main.indexOf("const sourceId = review.sourceId;"), main.indexOf("const handleApply"));
    assert.doesNotMatch(applyCatch, /setApplyError\("[^"]/, "apply failures always carry the canonical source id");
  });
});
