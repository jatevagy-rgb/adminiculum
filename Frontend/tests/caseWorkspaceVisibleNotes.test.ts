import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

(global as any).React = React;
import { CaseNotesThreadList } from "../src/components/cases/CaseWorkspaceOverview";
import { fmtDateTime } from "../src/components/cases/CaseCockpitPanels";
import type { CaseCommentDto } from "../src/lib/api";

// Focused coverage for the primary case-note surface (PR #384 visibility) and
// the canonical reply extension (case-note replies). The canonical case
// comments return on the case-comments endpoint; this proves they render on a
// primary Overview surface with body, author, time, resolved state and replies
// tied to their original note through the real Comment.parentId relation.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const overviewSrc = () => read("src/components/cases/CaseWorkspaceOverview.tsx");

function note(overrides: Partial<CaseCommentDto> = {}): CaseCommentDto {
  return {
    id: "note-1",
    caseId: "case-1",
    parentId: null,
    author: { id: "user-1", displayName: "Kovács Anna" },
    content: "Az ügyfél visszahívása szükséges.",
    status: "OPEN",
    createdAt: "2026-09-20T09:30:00.000Z",
    updatedAt: null,
    capabilities: { canResolve: false, canReopen: false, canDelete: false },
    ...overrides,
  };
}

function renderThread(comments: CaseCommentDto[], repliesById: Map<string, CaseCommentDto[]> = new Map()) {
  return renderToStaticMarkup(
    createElement(CaseNotesThreadList, { caseId: "case-1", comments, repliesById }),
  );
}

describe("Case Workspace visible notes", () => {
  it("1. renders a note body, author and created time in a primary notes surface", () => {
    const createdAt = "2026-09-20T09:30:00.000Z";
    const markup = renderThread([note({ createdAt })]);
    assert.match(markup, /data-testid="case-notes-primary"/);
    assert.match(markup, /Az ügyfél visszahívása szükséges\./); // 2. body
    assert.match(markup, /Kovács Anna/); // 3. author
    assert.ok(markup.includes(fmtDateTime(createdAt)), "created time must be rendered"); // 4.
  });

  it("2. hosts the notes section on the primary overview, outside the collapsed secondary details", () => {
    const src = overviewSrc();
    const sectionIdx = src.indexOf("<CaseWorkspaceNotesSection");
    const detailsIdx = src.indexOf("<details ref={secondaryDetailsRef}");
    assert.ok(sectionIdx > -1, "the primary notes section must be rendered");
    assert.ok(detailsIdx > -1, "the secondary details area must remain");
    assert.ok(sectionIdx > src.indexOf("</details>", detailsIdx), "notes must follow the closed details area on the visible history surface");
    assert.match(src, /caseId=\{caseId\}/);
  });

  it("3. a newly created note becomes visible after the canonical refresh", () => {
    const src = overviewSrc();
    assert.match(
      src,
      /<CaseCommentModal caseId=\{caseId\} onClose=\{\(\) => setModal\(null\)\} onSaved=\{\(\) => void refresh\(\)\} \/>/,
    );
    assert.match(src, /onCreateNote=\{\(\) => setModal\(\{ type: "case-comment" \}\)\}/);
    assert.match(src, /refreshKey=\{notesRefreshKey\}/);
    assert.match(src, /setNotesRefreshKey\(\(value\) => value \+ 1\)/);
  });

  it("4. empty state is truthful and offers the create action", () => {
    const src = overviewSrc();
    assert.match(src, /Ehhez az ügyhöz még nincs megjegyzés\./);
    assert.match(src, /Első megjegyzés írása/);
    const markup = renderThread([]);
    assert.ok(markup === "", "an empty thread list renders nothing");
  });

  it("5. shows the existing resolve state and offers the canonical reply action", () => {
    const openMarkup = renderThread([note()]);
    assert.doesNotMatch(openMarkup, /Megoldva/);
    assert.match(openMarkup, /data-testid="case-note-reply-action"/);
    assert.match(openMarkup, />Válasz</);
    const resolvedMarkup = renderThread([note({ status: "RESOLVED" })]);
    assert.match(resolvedMarkup, /data-testid="case-note-resolved"/);
    assert.match(resolvedMarkup, /Megoldva/);

    const src = overviewSrc();
    const start = src.indexOf("export function CaseWorkspaceNotesSection");
    const end = src.indexOf("export interface CaseWorkspaceDocumentsSectionProps");
    assert.ok(start > -1 && end > start);
    const section = src.slice(start, end);
    assert.match(section, /getCaseComments/);
    assert.match(section, /createCaseComment\(caseId, replyContent\.trim\(\), note\.id\)/);
    assert.match(section, /groupCaseCommentThreads/);
  });

  it("6. existing case-comment API semantics are unchanged", () => {
    const api = read("src/lib/api.ts");
    assert.match(api, /\/cases\/\$\{encodeURIComponent\(caseId\)\}\/comments/);
    assert.match(api, /export async function createCaseComment/);
    assert.match(api, /export async function resolveCaseComment/);
    assert.match(api, /export async function reopenCaseComment/);
    const routes = read("../Backend/src/modules/cases/routes.ts");
    assert.match(routes, /router\.get\('\/:caseId\/comments'/);
    assert.match(routes, /router\.post\('\/:caseId\/comments'/);
    assert.match(routes, /\/:caseId\/comments\/:commentId\/resolve/);
    assert.match(routes, /\/:caseId\/comments\/:commentId\/reopen/);
  });

  it("7. reply relation is additive, nullable and non-destructive", () => {
    const schema = read("../Backend/prisma/schema.prisma");
    const modelStart = schema.indexOf("model Comment {");
    assert.ok(modelStart > -1, "the canonical Comment model must exist");
    const commentModel = schema.slice(modelStart, schema.indexOf("\n}", modelStart));
    assert.match(commentModel, /parentId\s+String\?/);
    assert.match(commentModel, /@relation\("CommentReplies"/);
    assert.match(commentModel, /onDelete: SetNull/);
    assert.doesNotMatch(commentModel, /threadId|replyToCommentId/);
    const migration = read("../Backend/prisma/migrations/20260927100000_case_comment_replies/migration.sql");
    assert.match(migration, /ADD COLUMN "parentId" TEXT/);
    assert.match(migration, /ON DELETE SET NULL/);
    assert.doesNotMatch(migration, /UPDATE "comments"|DELETE FROM "comments"|DROP COLUMN/);
    const workspace = read("../Backend/src/modules/cases/workspace.ts");
    assert.match(workspace, /where: \{ caseId, documentId: null \}/);
  });

  it("8. keeps document comments isolated from case notes", () => {
    const src = overviewSrc();
    assert.doesNotMatch(src, /getDocumentComments|listDocumentComments/);
    const workspace = read("../Backend/src/modules/cases/workspace.ts");
    assert.match(workspace, /where: \{ caseId, documentId: null \}/);
    const docService = read("../Backend/src/modules/documents/documentComments.service.ts");
    assert.match(docService, /parentCommentId/);
    assert.match(docService, /allowParentCommentId/);
    const caseService = read("../Backend/src/modules/cases/caseComments.service.ts");
    assert.match(caseService, /COMMENT_PARENT_IS_DOCUMENT_COMMENT/);
  });

  it("9. secondary notes and activity rendering remain available", () => {
    const src = overviewSrc();
    assert.match(src, /title="Jegyzetek"/);
    assert.match(src, /title="Aktivitás"/);
    assert.match(src, /data-testid="activity-feed"/);
    assert.match(src, /<details ref=\{secondaryDetailsRef\}/);
  });

  it("10. corrects the misleading communication label without changing its operation", () => {
    const src = overviewSrc();
    assert.doesNotMatch(src, /Kommunikáció hozzáadása/);
    const labelIdx = src.indexOf("Megjegyzés hozzáadása");
    assert.ok(labelIdx > -1, "the truthful label must exist");
    assert.ok(
      src.slice(Math.max(0, labelIdx - 220), labelIdx).includes('type: "case-comment"'),
      "the relabelled action must still open the case-comment modal",
    );
  });
});
