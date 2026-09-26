import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Document Reader convergence (READER-UI-CONVERGENCE).
 *
 * These assertions pin the approved NEW default reader information architecture
 * and the safety invariants that must not regress:
 *   - default document mode shows a dominant reader + right rail, NO left rail
 *     and NO dominant four-mode tab row;
 *   - the advanced modes (changes/review/versions) remain reachable and untouched;
 *   - selection anchoring is exact-version and DOM-Range based (never indexOf);
 *   - displayed-only document text can never create an anchored item;
 *   - proposal decisions are lawyer-level only and rejection requires a reason.
 */

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
/** Remove block and line comments so assertions target executable code only. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const page = () => read("src/app/cases/[caseId]/documents/page.tsx");
const workspace = () => read("src/components/documents/reader/DocumentReaderWorkspace.tsx");
const rail = () => read("src/components/documents/reader/DocumentReviewRail.tsx");
const toolbar = () => read("src/components/documents/reader/DocumentSelectionToolbar.tsx");
const rejectDialog = () => read("src/components/documents/reader/ProposalDecisionDialog.tsx");
const allowAnchor = () => read("src/lib/documents/readerDomRange.ts");
const hook = () => read("src/components/documents/reader/useDocumentReviewRail.ts");
const copy = () => read("src/components/documents/reader/readerCopy.ts");

test("default document mode renders the converged reader workspace", () => {
  const source = page();
  assert.match(source, /<DocumentReaderWorkspace/, "the new reader must be mounted for the default document mode");
  assert.match(source, /import \{ DocumentReaderWorkspace \} from "@\/components\/documents\/reader\/DocumentReaderWorkspace"/);
  assert.match(source, /data-testid="document-reader-workspace"|DocumentReaderWorkspace/);
});

test("the new reader has NO persistent left ledger", () => {
  assert.doesNotMatch(workspace(), /canonical-left-ledger/, "the converged reader must not render the legacy left ledger");
  assert.doesNotMatch(workspace(), /Dokumentumok és verziók/, "the left-rail document/version list must not appear in the reader");
  assert.doesNotMatch(workspace(), /<DocumentWorkspaceTabs/, "the reader must not render the dominant four-mode tab row");
});

test("the dominant four-mode tab row is absent from default document mode", () => {
  const source = page();
  // The single primary mode row is rendered only when the mode is not document.
  assert.match(source, /activeMode !== "document" \? \(\s*<section data-testid="canonical-top-region"/);
});

test("exactly two primary selection actions are offered", () => {
  const source = toolbar();
  assert.match(source, /data-testid="reader-selection-comment"/);
  assert.match(source, /data-testid="reader-selection-proposal"/);
  assert.equal((source.match(/<button/g) || []).length, 2, "the toolbar offers exactly two actions");
  const code = stripComments(source);
  assert.doesNotMatch(code, /annotationType/, "the toolbar must not expose the legacy annotation taxonomy");
  assert.doesNotMatch(code, /QUICK_ANNOTATION_ACTIONS/);
  assert.doesNotMatch(code, /Review indítása|Összehasonlítás/);
});

test("advanced mode deep links remain available from the reader overflow", () => {
  const source = workspace();
  assert.match(source, /document-reader-advanced-changes/);
  assert.match(source, /document-reader-advanced-review/);
  assert.match(source, /document-reader-advanced-versions/);
  // The page still owns the URL mode routing contract.
  const pageSource = page();
  assert.match(pageSource, /onOpenAdvanced=\{navigateToMode\}/);
  assert.match(pageSource, /requestedMode === "changes" \|\| requestedMode === "review" \|\| requestedMode === "versions"/);
  assert.match(pageSource, /const syncWorkspaceModeToUrl = useCallback/);
});

test("anchoring derives offsets from the DOM Range, never indexOf", () => {
  const util = allowAnchor();
  const code = stripComments(util);
  assert.match(code, /getRangeAt\(0\)/, "the anchor must come from the live DOM selection range");
  assert.match(code, /offsetFromRootStart/);
  assert.doesNotMatch(code, /indexOf\(/, "the new anchor must never use indexOf for offsets");
  // The reader reads from the exact-version text channel only.
  assert.match(workspace(), /isVersionScopedTextPlan/);
});

test("DOCUMENT_TEXT is display-only and can never create an anchored item", () => {
  const source = workspace();
  assert.match(source, /const canAnchor = versionScoped && Boolean\(versionText\)/);
  assert.match(source, /onMouseUp=\{canAnchor \? captureSelection : undefined\}/);
  assert.match(source, /document-reader-display-only/);
  assert.match(copy(), /Ehhez az előnézethez nem hozható létre verziópontos észrevétel\./);
});

test("review-comment create calls the canonical API with the exact payload", () => {
  const source = workspace();
  assert.match(source, /createDocumentReviewComment\(documentId, documentVersionId, \{/);
  for (const field of ["selectedText", "startOffset", "endOffset", "textPrefix", "textSuffix", "body"]) {
    assert.match(source, new RegExp(`${field}:`), `comment payload must carry ${field}`);
  }
});

test("modification-proposal create calls the canonical API with the exact payload", () => {
  const source = workspace();
  assert.match(source, /createDocumentModificationProposal\(documentId, documentVersionId, \{/);
  for (const field of ["selectedText", "startOffset", "endOffset", "proposedText", "rationale"]) {
    assert.match(source, new RegExp(`${field}:`), `proposal payload must carry ${field}`);
  }
});

test("ordinary comments never carry Accept / Reject", () => {
  const source = rail();
  const commentCard = source.slice(source.indexOf("function CommentCard"), source.indexOf("export function DocumentReviewRail"));
  assert.doesNotMatch(commentCard, /reader-rail-proposal-accept/);
  assert.doesNotMatch(commentCard, /reader-rail-proposal-reject/);
  assert.match(source, /reader-rail-comment/);
  assert.match(source, /reader-rail-reply-submit/);
});

test("proposal decisions are gated on lawyer-level roles and PENDING only", () => {
  const source = rail();
  assert.match(source, /entry\.proposal\.status === "PENDING" && canDecide/);
  assert.match(source, /reader-rail-proposal-accept/);
  assert.match(source, /reader-rail-proposal-reject/);
  // TRAINEE / LEGAL_ASSISTANT are never in the decision role set.
  const contracts = read("src/components/documents/reader/readerContracts.ts");
  assert.match(contracts, /PROPOSAL_DECISION_ROLES/);
  assert.doesNotMatch(contracts, /"TRAINEE"/);
  assert.doesNotMatch(contracts, /"LEGAL_ASSISTANT"/);
});

test("accept refreshes the rail without mutating document text", () => {
  const source = workspace();
  const acceptBlock = source.slice(source.indexOf("const acceptProposal"), source.indexOf("const confirmReject"));
  assert.match(acceptBlock, /acceptDocumentModificationProposal/);
  assert.match(acceptBlock, /reloadRail\(\)/);
  assert.doesNotMatch(acceptBlock, /setVersionText|setDocumentTextPreview|workspaceText/);
});

test("reject requires a reason and rejected proposals display it", () => {
  assert.match(rejectDialog(), /disabled=\{busy \|\| !trimmed\}/);
  assert.match(rejectDialog(), /data-testid="proposal-reject-reason"/);
  const source = rail();
  assert.match(source, /reader-rail-proposal-reason/);
  assert.match(source, /entry\.proposal\.decisionReason/);
});

test("completion copy is truthful and only shown when the proposal set is complete", () => {
  assert.match(rail(), /rail\?\.counts\.proposalDecisionComplete/);
  assert.match(rail(), /data-testid="reader-rail-complete"/);
  assert.match(copy(), /Minden módosítási javaslat elbírálva\./);
  // Never claims formal review approval.
  assert.doesNotMatch(copy(), /jóváhagyva|Review kész/i);
  assert.doesNotMatch(rail(), /Dokumentum jóváhagyva/);
});

test("version switch clears stale rail state and stale responses cannot overwrite", () => {
  const source = workspace();
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*?\}, \[documentId, documentVersionId\]\)/);
  const hookSource = hook();
  assert.match(hookSource, /requestRef/, "the rail loader must guard with a request generation");
  assert.match(hookSource, /requestRef\.current !== generation/, "a stale response must be discarded");
  assert.match(hookSource, /setRail\(null\)/, "the previous version rail is cleared on identity change");
});

test("historical version identity is visible and URL identity is preserved", () => {
  const source = workspace();
  assert.match(source, /document-reader-historical/);
  assert.match(source, /readerCopy\.historicalVersion/);
  const pageSource = page();
  assert.match(pageSource, /isHistoricalVersion=\{Boolean\(canonicalActiveVersion && !canonicalActiveVersion\.isCurrent\)\}/);
  assert.match(pageSource, /syncWorkspaceIdentityToUrl\(\{ documentId, versionId: version\.isCurrent \? null : version\.id \}, history\)/);
  assert.match(pageSource, /router\[history\]\(nextUrl\)/);
});

test("a rail item focuses its exact startOffset/endOffset range", () => {
  const source = workspace();
  assert.match(source, /focusRailTarget/);
  assert.match(source, /setHighlightRange\(\{ start: startOffset, end: endOffset \}\)/);
  assert.match(source, /data-testid=\{segment\.range\.testId\}/);
});

test("narrow viewport exposes the rail as a bounded drawer", () => {
  const source = workspace();
  const drawerSource = read("src/components/documents/reader/DocumentReaderRailDrawer.tsx");
  assert.match(source, /document-reader-rail-toggle/);
  assert.match(source, /lg:hidden/);
  assert.match(source, /<DocumentReaderRailDrawer/);
  assert.match(drawerSource, /document-reader-rail-drawer/);
  assert.match(drawerSource, /w-\[min\(92vw,380px\)\]/, "the drawer must be width-bounded to avoid horizontal overflow");
  assert.match(source, /min-w-0/, "the reader columns must allow shrinking");
});

test("accessibility: labelled inputs, modal focus containment and real buttons", () => {
  assert.match(rejectDialog(), /import \{ Modal \} from "@\/components\/ui\/Modal"/);
  assert.match(rejectDialog(), /aria-label=\{readerCopy\.rejectReasonLabel\}/);
  assert.match(toolbar(), /role="toolbar"/);
  assert.match(rail(), /<button/);
  assert.match(workspace(), /<button/);
  assert.doesNotMatch(toolbar(), /<div[^>]*onClick=/);
});

test("no new backend client is invented and the rail reuses canonical API functions", () => {
  const source = workspace();
  assert.match(hook(), /getDocumentReviewRail/, "the rail loader must reuse the canonical api client");
  for (const fn of [
    "createDocumentReviewComment",
    "createDocumentReviewCommentReply",
    "createDocumentModificationProposal",
    "acceptDocumentModificationProposal",
    "rejectDocumentModificationProposal",
    "withdrawDocumentModificationProposal",
  ]) {
    assert.match(source, new RegExp(fn), `${fn} must come from the canonical api module`);
  }
  assert.match(source, /from "@\/lib\/api"/, "the reader must import the canonical api module");
  assert.doesNotMatch(source, /fetch\(/, "the reader must not hand-roll HTTP calls");
});
