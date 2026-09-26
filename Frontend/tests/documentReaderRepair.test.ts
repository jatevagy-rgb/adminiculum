import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveWordHandoffUrl } from "../src/components/documents/reader/readerContracts";

/**
 * Targeted repair contract for the five defects found in the new Document Reader.
 * Source-level assertions here pin the fix shape; the accompanying
 * documentReaderRepairDom.test.ts proves the runtime behaviour in jsdom.
 */

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const page = () => read("src/app/cases/[caseId]/documents/page.tsx");
const workspace = () => read("src/components/documents/reader/DocumentReaderWorkspace.tsx");
const rail = () => read("src/components/documents/reader/DocumentReviewRail.tsx");
const drawer = () => read("src/components/documents/reader/DocumentReaderRailDrawer.tsx");

// ---------------------------------------------------------------- DEFECT 1

test("DEFECT 1: a zero-reply comment still exposes a reply affordance", () => {
  const source = rail();
  const code = stripComments(source);
  // The toggle is rendered unconditionally (not gated on replyCount > 0).
  assert.match(code, /data-testid="reader-rail-comment-replies-toggle"/);
  assert.doesNotMatch(
    code,
    /comment\.replyCount > 0 \? \(\s*<button[\s\S]*?reader-rail-comment-replies-toggle/,
    "the reply toggle must not be conditional on an existing reply",
  );
  assert.match(code, /comment\.replyCount > 0 \? `\$\{readerCopy\.repliesShow\}/);
  assert.match(code, /readerCopy\.replyAction/);
});

test("DEFECT 1: zero replies do not require a pre-flight GET; existing replies load lazily", () => {
  const code = stripComments(rail());
  assert.match(code, /if \(next && comment\.replyCount > 0\) onLoadReplies\(\);/);
  assert.match(code, /onSubmitReply/);
});

// ---------------------------------------------------------------- DEFECT 2

test("DEFECT 2: an unmappable non-collapsed selection clears the previous anchor and errors", () => {
  const source = workspace();
  const code = stripComments(source);
  assert.doesNotMatch(code, /Keep any existing anchor/, "the stale-anchor fallback must be gone");

  const capture = code.slice(code.indexOf("const captureSelection"), code.indexOf("const clearSelection"));
  // Collapsed selection clears silently.
  assert.match(capture, /if \(!selection \|\| selection\.rangeCount === 0 \|\| selection\.isCollapsed\)/);
  // Unmappable selection clears everything before returning.
  assert.match(capture, /if \(!next\) \{[\s\S]*?setAnchor\(null\);[\s\S]*?setToolbarPos\(null\);[\s\S]*?setCommentComposerOpen\(false\);[\s\S]*?setProposalComposerOpen\(false\);[\s\S]*?setAnchorError\(readerCopy\.anchorUnavailable\);[\s\S]*?return;/);
  // No submission path can run with a null anchor.
  assert.match(code, /if \(!anchor\) return;/);
  assert.match(code, /!documentId \|\| !documentVersionId \|\| !anchor/);
});

test("DEFECT 2: controlled anchor error is displayed, and indexOf is never the anchor source", () => {
  assert.match(workspace(), /data-testid="document-reader-anchor-error"/);
  assert.match(read("src/components/documents/reader/readerCopy.ts"), /A kijelölés pontos helye nem határozható meg/);
  const util = stripComments(read("src/lib/documents/readerDomRange.ts"));
  assert.match(util, /getRangeAt\(0\)/);
  assert.doesNotMatch(util, /indexOf\(/);
});

// ---------------------------------------------------------------- DEFECT 3

test("DEFECT 3: page resolves the Word handoff through the truthful helper", () => {
  const source = page();
  assert.match(source, /resolveWordHandoffUrl\(\{/);
  assert.match(source, /versionIsCurrent: Boolean\(canonicalActiveVersion\?\.isCurrent\)/);
  assert.doesNotMatch(
    source,
    /wordHandoffUrl=\{canonicalActiveVersion\?\.spWebUrl \|\| selectedUploadedDocument/,
    "the historical-to-current fallback must be gone",
  );
});

test("DEFECT 3: a historical version never falls back to the current document URL", () => {
  assert.equal(
    resolveWordHandoffUrl({
      hasVersion: true,
      versionSpWebUrl: null,
      versionIsCurrent: false,
      documentSpWebUrl: "https://current.example/doc",
    }),
    null,
    "a historical version without its own URL must not open the current document",
  );
});

test("DEFECT 3: a historical version with its own URL uses exactly that URL", () => {
  assert.equal(
    resolveWordHandoffUrl({
      hasVersion: true,
      versionSpWebUrl: "https://historical.example/v1",
      versionIsCurrent: false,
      documentSpWebUrl: "https://current.example/doc",
    }),
    "https://historical.example/v1",
  );
});

test("DEFECT 3: a current version keeps its own URL or the canonical document fallback", () => {
  assert.equal(
    resolveWordHandoffUrl({ hasVersion: true, versionSpWebUrl: "https://v.example/2", versionIsCurrent: true, documentSpWebUrl: "https://current.example/doc" }),
    "https://v.example/2",
  );
  assert.equal(
    resolveWordHandoffUrl({ hasVersion: true, versionSpWebUrl: null, versionIsCurrent: true, documentSpWebUrl: "https://current.example/doc" }),
    "https://current.example/doc",
  );
  assert.equal(
    resolveWordHandoffUrl({ hasVersion: false, versionSpWebUrl: "https://v.example/1", versionIsCurrent: true, documentSpWebUrl: "https://current.example/doc" }),
    null,
    "no selected version -> no handoff",
  );
});

// ---------------------------------------------------------------- DEFECT 4

test("DEFECT 4: the drawer implements Escape, focus containment and focus restore", () => {
  const code = stripComments(drawer());
  assert.match(code, /event\.key === "Escape"/);
  assert.match(code, /event\.key !== "Tab"/);
  assert.match(code, /drawer\.contains\(active\)/);
  assert.match(code, /returnFocusRefRef\.current\?\.current/);
  assert.match(code, /role="dialog"/);
  assert.match(code, /aria-modal="true"/);
  assert.match(code, /tabIndex=\{-1\}/);
  // Focus enters the drawer on open.
  assert.match(code, /focusable\[0\] \?\? drawer/);
});

// ---------------------------------------------------------------- DEFECT 5

test("DEFECT 5: every composer resets its transient input on close or target change", () => {
  const comment = stripComments(read("src/components/documents/reader/ReviewCommentComposer.tsx"));
  const proposal = stripComments(read("src/components/documents/reader/ModificationProposalComposer.tsx"));
  const reject = stripComments(read("src/components/documents/reader/ProposalDecisionDialog.tsx"));
  assert.match(comment, /useEffect\(\(\) => \{\s*setBody\(""\);\s*\}, \[open, targetKey\]\)/);
  assert.match(proposal, /setProposedText\(""\);[\s\S]*?setRationale\(""\);[\s\S]*?\}, \[open, targetKey\]\)/);
  assert.match(reject, /useEffect\(\(\) => \{\s*setReason\(""\);\s*\}, \[open, targetKey\]\)/);
});

test("DEFECT 5: the workspace keys every composer to its exact target", () => {
  const code = stripComments(workspace());
  assert.match(code, /targetKey=\{anchor \? `\$\{anchor\.startOffset\}:\$\{anchor\.endOffset\}` : undefined\}/);
  assert.match(code, /targetKey=\{rejectTarget\?\.id\}/);
});
