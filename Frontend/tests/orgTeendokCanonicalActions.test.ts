import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canonicalTaskBucket,
  canonicalTaskRows,
  organizationTaskHref,
  workspaceTaskRows,
} from "../src/components/client-portal/OrganizationPortalViews";
import type { PortalOrgHomeAction, PortalWorkspaceAction } from "../src/lib/clientPortalApi";

/**
 * ORGANIZATION Home and Teendők must be driven by the SAME canonical customer-action
 * projection. Home counts `getPortalOrgHome().actions` (legal + Compliance customer
 * actions); Teendők must expose that identical list, grouped truthfully, while the
 * existing document/data-request and submission history sections stay intact.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

function orgHomeAction(overrides: Partial<PortalOrgHomeAction> & { id: string }): PortalOrgHomeAction {
  return {
    matterPublicationId: null,
    matterTitle: null,
    title: overrides.id,
    instructions: null,
    dueAt: null,
    typeLabel: "Ügyintézési teendő",
    readOnlyNote: "Ügyféli teendő",
    area: "LEGAL",
    actionUrl: undefined,
    ...overrides,
  };
}

// Mirrors the live failure shape: published legal action + the Compliance customer
// actions that Home counted but Teendők never showed.
const legalAction = orgHomeAction({
  id: "action-1",
  matterPublicationId: "pub-1",
  matterTitle: "Közzétett ügy",
  title: "Nyilatkozat pótlása",
  area: "LEGAL",
  actionUrl: "/portal/matters/pub-1",
});

const complianceActions = [
  orgHomeAction({
    id: "compliance-topic-a-q1",
    matterTitle: "NIS2 hatókör",
    title: "Adja meg a hatókörbe tartozó szolgáltatásokat",
    typeLabel: "Megfelelési adatkérés",
    readOnlyNote: "Töltse ki a hiányzó adatot a portálon.",
    area: "COMPLIANCE",
    actionUrl: "/portal/megfeleles",
  }),
  orgHomeAction({
    id: "compliance-topic-a-q2",
    matterTitle: "NIS2 hatókör",
    title: "Adja meg az érintett telephelyeket",
    typeLabel: "Megfelelési adatkérés",
    readOnlyNote: "Töltse ki a hiányzó adatot a portálon.",
    area: "COMPLIANCE",
    actionUrl: "/portal/megfeleles",
  }),
  orgHomeAction({
    id: "compliance-topic-b",
    matterTitle: "GDPR nyilvántartás",
    title: "Tekintse át a nyilvántartási teendőket",
    typeLabel: "Megfelelési teendő",
    readOnlyNote: "A megfelelés oldalon tudja áttekinteni.",
    area: "COMPLIANCE",
    actionUrl: "/portal/megfeleles",
  }),
];

const homeActions = [legalAction, ...complianceActions];

describe("ORGANIZATION Teendők reuses the canonical Home customer-action projection", () => {
  it("1. exposes exactly the actions Home counts (legal + Compliance)", () => {
    const rows = canonicalTaskRows(homeActions);
    assert.equal(rows.length, homeActions.length);
    assert.deepEqual(rows.map((row) => row.id), homeActions.map((action) => action.id));
    // This is the Home/Teendők consistency contract: Teendők can never disagree
    // with the Home orientation count about whether the customer has work to do.
    assert.equal(rows.length, [...new Set(homeActions.map((action) => action.id))].length);
  });

  it("2. keeps the published legal action reachable once, with its canonical matter link", () => {
    const rows = canonicalTaskRows(homeActions);
    const legal = rows.filter((row) => row.id === "action-1");
    assert.equal(legal.length, 1);
    assert.equal(legal[0].href, "/portal/matters/pub-1");
    assert.equal(legal[0].title, "Nyilatkozat pótlása");
  });

  it("3. surfaces every Compliance customer action on Teendők", () => {
    const rows = canonicalTaskRows(homeActions);
    for (const action of complianceActions) {
      const match = rows.find((row) => row.id === action.id);
      assert.ok(match, `Compliance action ${action.id} must be reachable from Teendők`);
      assert.equal(match!.href, "/portal/megfeleles");
      assert.equal(match!.context, action.matterTitle);
      assert.notEqual(match!.bucket, "completed");
    }
    assert.equal(rows.filter((row) => row.href === "/portal/megfeleles").length, complianceActions.length);
  });

  it("4. never fabricates completion state and keeps overdue work actionable", () => {
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(canonicalTaskBucket(null), "now");
    assert.equal(canonicalTaskBucket(past), "now");
    assert.equal(canonicalTaskBucket(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()), "now");
    assert.equal(canonicalTaskBucket(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()), "upcoming");
    assert.ok(canonicalTaskRows(homeActions).every((row) => row.bucket !== "completed"));
  });

  it("5. de-duplicates rows that represent the same canonical id", () => {
    const rows = canonicalTaskRows([...homeActions, complianceActions[0], legalAction]);
    assert.equal(rows.length, homeActions.length);
    const ids = rows.map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("6. resolves a destination for every canonical action shape", () => {
    assert.equal(organizationTaskHref(orgHomeAction({ id: "a", actionUrl: "/portal/megfeleles", area: "COMPLIANCE" })), "/portal/megfeleles");
    assert.equal(organizationTaskHref(orgHomeAction({ id: "b", matterPublicationId: "pub/2" })), "/portal/matters/pub%2F2");
    assert.equal(organizationTaskHref(orgHomeAction({ id: "c", area: "COMPLIANCE" })), "/portal/megfeleles");
    assert.equal(organizationTaskHref(orgHomeAction({ id: "d" })), "/portal/action-requests/d");
  });
});

describe("CASE_RELAY keeps its existing workspace action projection", () => {
  const workspaceAction: PortalWorkspaceAction = {
    id: "ws-1",
    matterId: "pub-1",
    matterTitle: "Együttműködési ügy",
    type: "ACTION_REQUEST",
    title: "Iratok egyeztetése",
    description: null,
    dueAt: null,
    status: "PUBLISHED",
    bucket: "now",
    actionUrl: "/portal/matters/pub-1",
  };

  it("7. maps workspace.actions unchanged, including the original bucket and link", () => {
    const rows = workspaceTaskRows([workspaceAction]);
    assert.deepEqual(rows, [{
      id: "ws-1",
      title: "Iratok egyeztetése",
      context: "Együttműködési ügy",
      dueAt: null,
      href: "/portal/matters/pub-1",
      bucket: "now",
    }]);
  });

  it("8. preserves a completed workspace bucket instead of reclassifying it", () => {
    const rows = workspaceTaskRows([{ ...workspaceAction, id: "ws-2", bucket: "completed" }]);
    assert.equal(rows[0].bucket, "completed");
  });
});

describe("Teendők source contract", () => {
  const orgViews = () => read("src/components/client-portal/OrganizationPortalViews.tsx");
  const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");

  it("9. ORGANIZATION Teendők uses the canonical Home projection, not a second action universe", () => {
    const src = orgViews();
    assert.match(src, /getPortalOrgHome\(\)/);
    assert.match(src, /canonicalTaskRows\(/);
    assert.match(src, /canonicalActions === null && !canonicalFailed|\(canonicalActions \?\? loadedActions\) === null/);
    assert.match(src, /mode=\{context\.selectedWorkspace\?\.mode\}/);
    // CASE_RELAY keeps the pre-existing projection.
    assert.match(src, /workspaceTaskRows\(workspace\.actions\)/);
    // The canonical list is not fetched for the organization Home page (which
    // already owns that request) and never for non-organization workspaces.
    assert.match(src, /if \(!isOrganization \|\| canonicalActions\) return;/);
  });

  it("10. does not reimplement the Compliance next-actor classifier on the frontend", () => {
    const src = orgViews();
    assert.doesNotMatch(src, /classifyComplianceNextActor/);
    assert.doesNotMatch(src, /hasPortalAnswerableMissingInformation/);
  });

  it("11. keeps the document/data request and submission history sections intact", () => {
    const src = orgViews();
    assert.match(src, /selectCustomerRequestDocuments\(workspace\.documents\)/);
    assert.match(src, /selectCustomerSubmissionDocuments\(workspace\.documents\)/);
    assert.match(src, /Dokumentum- és adatbekérések/);
    assert.match(src, /Beküldött anyagaim/);
    assert.match(src, /customerRequestDetailHref\(item\.matterId, item\.id\)/);
  });

  it("12. INDIVIDUAL portal keeps its own list surface", () => {
    const src = shell();
    assert.match(src, /mode !== 'ORGANIZATION' && state\.context\.selectedWorkspace\?\.mode !== 'CASE_RELAY'/);
    assert.match(src, /<ListView view=\{view\}/);
    assert.match(src, /Ügyeim/);
  });

  it("13. keeps the customer-safe boundary (no internal compliance or legal intelligence)", () => {
    const src = orgViews();
    for (const forbidden of [
      "canonicalReference",
      "anchorKey",
      "CELEX",
      "INTERNAL_ANALYSIS",
      "legalMatrix",
      "workInstruction",
      "internalNotes",
      "assessmentFinding",
      "aiResponse",
    ]) {
      assert.doesNotMatch(src, new RegExp(forbidden), `Teendők must not expose ${forbidden}`);
    }
  });
});
