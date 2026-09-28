import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

(global as any).React = React;
import { CaseNotesThreadList, groupCaseCommentThreads } from "../src/components/cases/CaseWorkspaceOverview";
import { fmtDateTime } from "../src/components/cases/CaseCockpitPanels";
import type { CaseCommentDto } from "../src/lib/api";

// Focused coverage for the case-note reply extension: the canonical
// Comment.parentId relation, the same-case / document-comment guards and the
// thread rendering on the primary Megjegyzések surface. No reply is ever faked
// through string prefixes, quoted-text parsing, activity records or document
// comments.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

function comment(overrides: Partial<CaseCommentDto> = {}): CaseCommentDto {
  return {
    id: "cm-1",
    caseId: "case-1",
    parentId: null,
    author: { id: "user-1", displayName: "Kovács Anna" },
    content: "Jegyzet",
    status: "OPEN",
    createdAt: "2026-09-20T09:30:00.000Z",
    updatedAt: null,
    capabilities: { canResolve: false, canReopen: false, canDelete: false },
    ...overrides,
  };
}

function renderThread(comments: CaseCommentDto[], repliesById: Map<string, CaseCommentDto[]>) {
  return renderToStaticMarkup(
    createElement(CaseNotesThreadList, { caseId: "case-1", comments, repliesById }),
  );
}

describe("Case note replies", () => {
  it("1. groups replies under their parent and never promotes replies to top-level", () => {
    const parent = comment({ id: "parent-1", content: "Eredeti jegyzet" });
    const reply = comment({ id: "reply-1", parentId: "parent-1", content: "Válasz szöveg" });
    const orphan = comment({ id: "reply-2", parentId: "missing-parent", content: "Árva válasz" });
    const { topLevel, repliesById } = groupCaseCommentThreads([reply, parent, orphan]);
    assert.deepEqual(topLevel.map((c) => c.id), ["parent-1"]);
    assert.deepEqual((repliesById.get("parent-1") ?? []).map((c) => c.id), ["reply-1"]);
    assert.equal(repliesById.get("missing-parent")?.length, 1);
  });

  it("2. renders a reply visually subordinate beneath its parent with author and time", () => {
    const parent = comment({ id: "parent-1", content: "Eredeti jegyzet" });
    const reply = comment({
      id: "reply-1",
      parentId: "parent-1",
      content: "Válasz szöveg",
      author: { id: "user-2", displayName: "Nagy Péter" },
      createdAt: "2026-09-20T10:00:00.000Z",
    });
    const repliesById = new Map([["parent-1", [reply]]]);
    const markup = renderThread([parent], repliesById);
    assert.match(markup, /data-testid="case-note-replies"/);
    assert.match(markup, /data-testid="case-note-reply"/);
    assert.match(markup, /Válasz szöveg/);
    assert.match(markup, /Nagy Péter/);
    assert.ok(markup.includes(fmtDateTime("2026-09-20T10:00:00.000Z")), "reply time must be rendered");
    // The reply block must appear inside the parent's <li>, after the parent body.
    const parentBodyIdx = markup.indexOf("Eredeti jegyzet");
    const repliesIdx = markup.indexOf('data-testid="case-note-replies"');
    assert.ok(parentBodyIdx > -1 && repliesIdx > parentBodyIdx, "replies render after the parent body");
  });

  it("3. orders replies oldest-first inside a thread", () => {
    const replyNew = comment({ id: "r-new", parentId: "p", createdAt: "2026-09-21T00:00:00.000Z" });
    const replyOld = comment({ id: "r-old", parentId: "p", createdAt: "2026-09-19T00:00:00.000Z" });
    const { repliesById } = groupCaseCommentThreads([replyNew, replyOld]);
    assert.deepEqual((repliesById.get("p") ?? []).map((c) => c.id), ["r-old", "r-new"]);
  });

  it("4. offers one inline Válasz action per note with an inline composer", () => {
    const markup = renderThread([comment({ id: "parent-1" })], new Map());
    assert.match(markup, /data-testid="case-note-reply-action"/);
    assert.match(markup, />Válasz</);
    const src = read("src/components/cases/CaseWorkspaceOverview.tsx");
    assert.match(src, /data-testid="case-note-reply-composer"/);
    assert.match(src, /Válasz a megjegyzésre…/);
    assert.match(src, /Válasz küldése/);
  });

  it("5. sends replies through the canonical case-comment endpoint with parentCommentId", () => {
    const src = read("src/components/cases/CaseWorkspaceOverview.tsx");
    const section = src.slice(src.indexOf("function CaseNoteThread"));
    assert.match(section, /createCaseComment\(caseId, replyContent\.trim\(\), note\.id\)/);
    assert.doesNotMatch(section, /createCommunication|createDocumentComment|activity/i);
    const api = read("src/lib/api.ts");
    const create = api.slice(api.indexOf("export async function createCaseComment"));
    assert.match(create, /parentCommentId/);
    assert.match(create, /body\.parentCommentId = parentCommentId/);
  });

  it("6. backend validates the reply parent: same case, case note, one level", () => {
    const service = read("../Backend/src/modules/cases/caseComments.service.ts");
    assert.match(service, /COMMENT_PARENT_NOT_FOUND/);
    assert.match(service, /COMMENT_PARENT_IS_DOCUMENT_COMMENT/);
    assert.match(service, /COMMENT_PARENT_IS_REPLY/);
    assert.match(service, /parent\.caseId !== caseId/);
    assert.match(service, /parent\.documentId !== null/);
    assert.match(service, /parent\.parentId !== null/);
    assert.match(service, /data: \{ caseId, documentId: null, userId: access\.actorId, content, parentId/);
  });

  it("7. top-level note creation is unchanged (parentId omitted -> top-level row)", () => {
    const api = read("src/lib/api.ts");
    const create = api.slice(api.indexOf("export async function createCaseComment"));
    assert.match(create, /if \(parentCommentId\) body\.parentCommentId = parentCommentId/);
    const service = read("../Backend/src/modules/cases/caseComments.service.ts");
    assert.match(service, /parentId: parentId \?\? null/);
  });

  it("8. resolved semantics remain: OPEN notes hide the badge, RESOLVED notes show it", () => {
    const open = renderThread([comment({ status: "OPEN" })], new Map());
    assert.doesNotMatch(open, /Megoldva/);
    const resolved = renderThread([comment({ status: "RESOLVED" })], new Map());
    assert.match(resolved, /data-testid="case-note-resolved"/);
  });

  it("9. the workspace projection keeps document comments out of case notes", () => {
    const workspace = read("../Backend/src/modules/cases/workspace.ts");
    assert.match(workspace, /where: \{ caseId, documentId: null \}/);
    const docService = read("../Backend/src/modules/documents/documentComments.service.ts");
    assert.match(docService, /'parentCommentId'/);
  });

  it("10. migration is additive: no backfill, no destructive statements, nullable FK", () => {
    const migration = read("../Backend/prisma/migrations/20260927100000_case_comment_replies/migration.sql");
    assert.match(migration, /ADD COLUMN "parentId" TEXT/);
    assert.match(migration, /ON DELETE SET NULL/);
    assert.match(migration, /CREATE INDEX IF NOT EXISTS "comments_parentId_idx"/);
    assert.doesNotMatch(migration, /UPDATE "comments"|DELETE FROM "comments"|DROP COLUMN|DROP TABLE/);
  });
});
