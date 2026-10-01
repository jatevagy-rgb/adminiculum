import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — Checkpoint F6 contract test
 * (nested matter request / interaction V3 cutover).
 * Pins the ORGANIZATION runtime removal of legacy interaction UI, the exact
 * matter/request identity chain, preserved write flows (submission pipeline
 * with partial-success semantics, question flow, unavailable declaration),
 * scanner/quarantine preservation and INDIVIDUAL / CASE_RELAY retention.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const workspaceV3 = () => read("src/components/client-portal-v3/matters/PortalMatterWorkspaceV3.tsx");
const requestDetailV3 = () => read("src/components/client-portal-v3/request/PortalRequestDetailV3.tsx");
const interactionCardV3 = () => read("src/components/client-portal-v3/interaction/PortalInteractionCardV3.tsx");
const requestResponseV3 = () => read("src/components/client-portal-v3/interaction/PortalRequestResponseV3.tsx");
const questionThreadV3 = () => read("src/components/client-portal-v3/interaction/PortalQuestionThreadV3.tsx");
const requestRoutePage = () => read("src/app/portal/matters/[publicationId]/requests/[requestId]/page.tsx");

const v3Sources = () =>
  [requestDetailV3(), interactionCardV3(), requestResponseV3(), questionThreadV3()].join("\n");

const V3_TREE =
  "src/components/client-portal-v3/**";
const PROHIBITED_LEGACY_IMPORTS =
  /from ["'][^"']*(?:CustomerRequestDetail|CustomerInteractionCard|RequestResponseCard|QuestionThreadRow|UnavailableDeclarationPanel|MatterWorkspace)[^"']*["']/;

describe("Checkpoint F6 — ORGANIZATION runtime cutover", () => {
  it("1. PortalMatterWorkspaceV3 no longer imports legacy interaction components", () => {
    const src = workspaceV3();
    assert.doesNotMatch(src, /CustomerInteractionCard/);
    assert.doesNotMatch(src, /CustomerRequestDetail/);
    assert.doesNotMatch(src, /RequestResponseCard/);
    assert.doesNotMatch(src, /QuestionThreadRow/);
  });

  it("2. the matter workspace renders the V3 interaction card for requests and questions", () => {
    const src = workspaceV3();
    assert.match(src, /<PortalInteractionCardV3 caseId=\{matter\.caseId\} allowAsk=\{detail\.capabilities\.allowMessages\} matterPublicationId=\{detail\.matterPublicationId\} scope="questions" \/>/);
    assert.match(src, /<PortalInteractionCardV3 caseId=\{matter\.caseId\} matterPublicationId=\{detail\.matterPublicationId\} scope="requests" \/>/);
  });

  it("3. the nested request branch renders PortalRequestDetailV3", () => {
    const src = workspaceV3();
    assert.match(src, /<PortalRequestDetailV3/);
    assert.match(src, /caseId=\{matter\.caseId\}/);
    assert.match(src, /publicationId=\{detail\.matterPublicationId\}/);
  });

  it("4. exact matter and request identity preserved — no positional/default fallback", () => {
    const src = workspaceV3();
    assert.match(src, /item\.matterPublicationId === matterPublicationId \|\| item\.publicReference === matterPublicationId/);
    assert.match(src, /customerInteractionApi\.getRequest\(published\.caseId, requestId\)/);
    assert.match(src, /customerInteractionApi\.listSubmissions\(published\.caseId, requestId\)/);
    assert.doesNotMatch(src, /getRequest\([^)]*items\[\d|getRequest\([^)]*\[0\]/);
    assert.doesNotMatch(src, /first request|első bekérés/i);
    // Unavailable/fail-closed state exists for an invalid request identity.
    assert.match(src, /setRequestUnavailable\(true\)/);
  });

  it("5. the nested request route page passes exact identities", () => {
    const src = requestRoutePage();
    assert.match(src, /params: Promise<\{ publicationId: string; requestId: string \}>/);
    assert.match(src, /resourceId=\{publicationId\}/);
    assert.match(src, /requestId=\{requestId\}/);
  });

  it("6. no client-portal-v3 runtime file imports prohibited legacy components", () => {
    assert.doesNotMatch(workspaceV3(), PROHIBITED_LEGACY_IMPORTS);
    assert.doesNotMatch(requestDetailV3(), PROHIBITED_LEGACY_IMPORTS);
    assert.doesNotMatch(interactionCardV3(), PROHIBITED_LEGACY_IMPORTS);
    assert.doesNotMatch(requestResponseV3(), PROHIBITED_LEGACY_IMPORTS);
    assert.doesNotMatch(questionThreadV3(), PROHIBITED_LEGACY_IMPORTS);
  });
});

describe("Checkpoint F6 — functional preservation", () => {
  it("7. question flow preserved: canonical create + list + thread contracts", () => {
    const src = interactionCardV3();
    assert.match(src, /customerInteractionApi\.listQuestions\(caseId\)/);
    assert.match(src, /customerInteractionApi\.createQuestion\(caseId, \{ subject, bodySafe: body \}\)/);
    assert.match(src, /portal-question-send/);
    const thread = questionThreadV3();
    assert.match(thread, /customerInteractionApi\.getThread\(caseId, thread\.id\)/);
    assert.match(thread, /Ügyvédi iroda/);
    assert.match(thread, /msg\.authorType === "INTERNAL" \? "Ügyvédi iroda" : "Ön"/);
  });

  it("8. submission pipeline preserved with the exact partial-success semantics", () => {
    const src = requestResponseV3();
    assert.match(src, /created = await customerInteractionApi\.createSubmission\(caseId, request\.id\)/);
    assert.match(src, /submissionRef\.current = \{ id: created\.id, answersSent: false \}/);
    assert.match(src, /await customerInteractionApi\.submitAnswers\(caseId, submissionId, filled\)/);
    assert.match(src, /customerInteractionApi\.uploadFile\(caseId, submissionId/);
    assert.match(src, /await customerInteractionApi\.submitSubmission\(caseId, submissionId, note\)/);
    // Partial upload failure keeps the persisted submission and retries only failed files.
    assert.match(src, /if \(failedThisPass > 0\) \{/);
    assert.match(src, /Néhány fájl feltöltése nem sikerült/);
    assert.match(src, /if \(!submissionRef\.current\) \{/);
    assert.match(src, /item\.status === "done" \|\| item\.status === "uploading"/);
  });

  it("9. scanner/quarantine path unchanged and acceptance stays server-side", () => {
    const src = requestResponseV3();
    assert.match(src, /result\.state/);
    assert.match(src, /serverState: result\.state/);
    assert.match(src, /A fájl csak sikeres biztonsági ellenőrzés után kerülhet be az ügy iratai közé\./);
    assert.doesNotMatch(src, /acceptFile|documentVersionId/);
  });

  it("10. prior submission state remains visible, including correction reasons", () => {
    const src = requestResponseV3();
    assert.match(src, /submission\?\.correctionReason/);
    assert.match(src, /Javítás szükséges:/);
    assert.match(src, /localizedInteractionStatus\(submission\.status\)/);
    const detail = requestDetailV3();
    assert.match(detail, /submission \? localizedInteractionStatus\(submission\.status\) : "Még nincs beküldés"/);
  });

  it("11. unavailable declaration preserved with the canonical contract and copy", () => {
    const src = requestDetailV3();
    assert.match(src, /customerInteractionApi\.declareUnavailable\(caseId, request\.id, boundedUnavailableReason\(reason\)\)/);
    assert.match(src, /unavailable-declaration-state/);
    assert.match(src, /a bekérést nem zárja le automatikusan/);
    assert.match(src, /canRespondToRequest\(request\.status\)/);
    assert.match(src, /{canRespond \? \(/);
  });

  it("12. response eligibility and fail-closed status gates preserved", () => {
    const src = requestResponseV3();
    assert.match(src, /!\["COMPLETED", "CANCELLED", "EXPIRED"\]\.includes\(request\.status\)/);
    assert.match(src, /requestAllowsDocumentUpload\(request\.type\)/);
    assert.match(src, /type === "DOCUMENT_UPLOAD" \|\| type === "MISSING_DOCUMENT_REQUEST" \|\| type === "CORRECTION_REQUEST"/);
    const detail = requestDetailV3();
    assert.match(detail, /Ez a bekérés lezárult, további beküldés nem lehetséges\./);
  });

  it("13. published documents remain distinct from customer submissions", () => {
    const src = requestDetailV3();
    assert.match(src, /<PortalMatterDocumentsSection documents=\{relatedDocuments\} \/>/);
    assert.doesNotMatch(src, /submission\.files\.map|uploaded.*documents/);
    // The response composer uploads only into the submission pipeline.
    const response = requestResponseV3();
    assert.doesNotMatch(response, /publishedDoc|publishedDoc/);
  });

  it("14. field renderers preserve every canonical field type", () => {
    const src = requestResponseV3();
    for (const fieldType of ["LONG_TEXT", "ADDRESS", "YES_NO", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "DATE", "NUMBER", "EMAIL", "PHONE"]) {
      assert.match(src, new RegExp(`field\\.type === "${fieldType}"`), `${fieldType} renderer missing`);
    }
  });

  it("15. customer-safe boundary: no internal metadata invented", () => {
    const src = v3Sources().replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, /\b(?:assignee|ownerId|workforceId|membershipId|triage|internalNote|mailbox)\b/i);
    assert.doesNotMatch(src, /unreadCount|unread/);
    assert.doesNotMatch(src, /\bscan\b|quarantine|checksum/i);
    assert.doesNotMatch(src, /visibility/);
  });
});

describe("Checkpoint F6 — preservation of non-ORG modes", () => {
  it("16. INDIVIDUAL keeps the legacy request components", () => {
    const shell = read("src/components/client-portal/ClientPortalShell.tsx");
    assert.match(shell, /<CustomerRequestDetail/);
    assert.match(shell, /<CustomerInteractionCard/);
  });

  it("17. CASE_RELAY keeps the legacy request components", () => {
    const orgViews = read("src/components/client-portal/OrganizationPortalViews.tsx");
    assert.match(orgViews, /<CustomerRequestDetail/);
  });

  it("18. legacy sources remain in the repository", () => {
    for (const file of [
      "src/components/client-portal/CustomerRequestDetail.tsx",
      "src/components/client-portal/CustomerInteractionCard.tsx",
      "src/components/client-portal/MatterWorkspace.tsx",
    ]) {
      assert.equal(exists(file), true, `${file} must remain`);
    }
  });

  it("19. deep links from Action Center / matter cards stay valid", () => {
    const src = interactionCardV3();
    assert.match(src, /\/portal\/matters\/\$\{encodeURIComponent\(matterPublicationId\)\}\/requests\/\$\{encodeURIComponent\(request\.id\)\}/);
    assert.equal(exists("src/app/portal/matters/[publicationId]/requests/[requestId]/page.tsx"), true);
  });
});

describe("Checkpoint F6 — visual contract", () => {
  it("20. F6 V3 files follow the V3 visual contract", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /stone-/);
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
    assert.doesNotMatch(src, /rounded-2xl|rounded-3xl|rounded-full/);
    assert.match(src, /--adm-canvas-white/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /--adm-brand-green/);
    assert.match(src, /focus-visible:ring-2/);
  });

  it("21. loading / empty / error states are explicit", () => {
    const src = v3Sources();
    assert.match(src, /Betöltés…/);
    assert.match(src, /Az interakciók jelenleg nem érhetők el\./);
    assert.match(src, /Még nincs kérdésszál\./);
    assert.match(src, /Nincs aktív dokumentum- vagy adatbekérés\./);
    assert.match(src, /Még nincs beküldés/);
  });
});
