import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("Phase 5A organizational customer portal shell + home journey", () => {
  const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
  const orgHome = () => read("src/components/client-portal/OrgHomeView.tsx");
  const orgViews = () => read("src/components/client-portal/OrganizationPortalViews.tsx");
  const api = () => read("src/lib/clientPortalApi.ts");

  it("organizational nav has the compact executive IA labels in order", () => {
    const src = shell();
    const orgIdx = src.indexOf("if (workspace.mode === 'ORGANIZATION')");
    const orgBlock = src.slice(orgIdx, src.indexOf("if (workspace.mode === 'CASE_RELAY')"));
    const order = ["Főoldal", "Ügyeink", "Teendőim", "Dokumentumok", "Üzenetek"];
    let last = -1;
    for (const label of order) {
      const idx = orgBlock.indexOf(`'${label}'`);
      assert.ok(idx > -1, `org IA missing ${label}`);
      assert.ok(idx > last, `org IA order violated for ${label}`);
      last = idx;
    }
    // No technical/legacy wording in the org nav.
    assert.doesNotMatch(orgBlock, /Ügyeim|Új megkeresés|Megkereséseim|Vezetői áttekintés|Kommunikáció|Együttműködési áttekintés/);
  });

  it("Főoldal renders Eddig / Most / Következőként journey", () => {
    const src = orgHome();
    for (const token of ["Eddig", "Most", "Következő", "Ami most Öntől kell", "Szervezeti ügyfélfelület", "Aktív jogi munka", "Legutóbbi tevékenység", "Vállalat és megfelelőség"]) {
      assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(src, /matter\.currentPosition/);
    assert.match(src, /matter\.nextStep/);
    assert.match(src, /milestones/);
    assert.doesNotMatch(src, /timeSummary|progressPercentage/);
    // neutral next-step empty state
    assert.match(src, /Jelenleg nincs Önnek szóló teendő/);
  });

  it("home empty states are human, never raw data markers", () => {
    const src = orgHome();
    for (const empty of ["Jelenleg nincs közzétett aktív ügy", "Még nincs közzétett frissítés", "Még nincs folyamatban kérdés vagy üzenetváltás"]) {
      assert.match(src, new RegExp(empty.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(src, /No data|0 records/);
  });

  it("home journey derives from immutable published revision, not live task/finding", () => {
    const src = orgHome();
    assert.doesNotMatch(src, /taskNotes|workInstruction|AssessmentFinding|internalOwner|reviewer|spItemId|sharePoint|aiPrompt|aiResponse|auditEvent/);
    assert.match(src, /getPortalOrgHome/);
  });

  it("uses the canonical org home endpoint with a customer-safe DTO", () => {
    const apiSrc = api();
    for (const token of ["PortalOrgHome", "getPortalOrgHome", "/client-portal/org/home", "PortalOrgHomeMatter", "contactSummary", "currentMatter"]) {
      assert.match(apiSrc, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(apiSrc, /prisma|storageProvider|scanProvider|quarantineStorageReference|spItemId/);
  });

  it("organization company context remains a functional customer surface", () => {
    const views = orgViews();
    assert.match(views, /view === "company"/);
    assert.match(views, /OrganizationCompany/);
    assert.match(views, /getPortalOrganizationCompany/);
    assert.doesNotMatch(views, /hamarosan ezen a felületen lesz elérhető/);
    assert.doesNotMatch(views, /ContractRecord|company-workspace|getWorkspaceOverview/);
    assert.doesNotMatch(views, /ComingNext/);
  });

  it("Teendők uses customer action objects, not the internal Task list", () => {
    const views = orgViews();
    assert.match(views, /OrganizationTasks/);
    assert.match(views, /workspace\.actions\.filter/);
    assert.match(views, /Most szükséges/);
    assert.doesNotMatch(views, /internal Task|taskStatus|workInstruction/);
  });

  it("home action link falls back to action-request detail when no matter publication id", () => {
    const src = orgHome();
    // When matterPublicationId is absent the action id is a request id, not a matter id.
    assert.match(src, /action\.matterPublicationId\s*\?\s*`\/portal\/matters\/\$\{encodeURIComponent\(action\.matterPublicationId\)\}`\s*:\s*`\/portal\/action-requests\/\$\{encodeURIComponent\(action\.id\)\}`/);
    assert.doesNotMatch(src, /action\.matterPublicationId\s*\|\|\s*action\.id/);
    assert.doesNotMatch(src, /\/portal\/matters\/\$\{encodeURIComponent\(action\.matterPublicationId\s*\|\|\s*action\.id\)\}/);
  });

  it("INDIVIDUAL nav remains unchanged and backward compatible", () => {
    const src = shell();
    const orgIdx = src.indexOf("if (workspace.mode === 'ORGANIZATION')");
    const caseRelayIdx = src.indexOf("if (workspace.mode === 'CASE_RELAY')");
    const individualBlock = src.slice(caseRelayIdx + "if (workspace.mode === 'CASE_RELAY')".length);
    assert.match(individualBlock, /Ügyeim/);
    assert.match(individualBlock, /Teendőim/);
    assert.match(individualBlock, /Üzenetek/);
  });

  it("Kapcsolat wording unifies customer messaging, not Outlook", () => {
    const views = orgViews();
    assert.match(views, /title="Kapcsolat"/);
    assert.match(views, /Itt tud az irodával az ügyeiről egyeztetni/);
    assert.doesNotMatch(views, /title="Kommunikáció"/);
    assert.doesNotMatch(views, /Outlook sync/);
  });
});