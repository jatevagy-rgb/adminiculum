import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — checkpoint C contract (Matters V3 list + matter
 * workspace). Pins the ORGANIZATION runtime cutover for /portal/ugyek and
 * /portal/matters/:matterPublicationId, the exact-publication-id identity
 * rule, the Now/Waiting/Next composition, published-only content, capability
 * gates, and legacy preservation for INDIVIDUAL/CASE_RELAY.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
const mattersV3 = () => read("src/components/client-portal-v3/matters/PortalMattersV3.tsx");
const workspaceV3 = () => read("src/components/client-portal-v3/matters/PortalMatterWorkspaceV3.tsx");
const statusTrack = () => read("src/components/client-portal-v3/matters/PortalMatterStatusTrack.tsx");
const milestones = () => read("src/components/client-portal-v3/matters/PortalMatterMilestones.tsx");
const sections = () => read("src/components/client-portal-v3/matters/PortalMatterSections.tsx");

const v3Sources = () => [mattersV3(), workspaceV3(), statusTrack(), milestones(), sections()].join("\n");

describe("Checkpoint C — matters list runtime", () => {
  it("1. /portal/ugyek ORGANIZATION renders PortalMattersV3", () => {
    const src = shell();
    assert.match(src, /view === 'matters' \? <PortalMattersV3 \/> : null/);
  });

  it("2. matter route ORGANIZATION renders PortalMatterWorkspaceV3", () => {
    const src = shell();
    assert.match(src, /view === 'matter' \? <PortalMatterWorkspaceV3 matterPublicationId=\{resourceId\} requestId=\{requestId\} \/> : null/);
  });

  it("3. the list uses only the canonical organization cases DTO", () => {
    const src = mattersV3();
    assert.match(src, /getPortalOrganizationCases/);
    assert.match(src, /getPortalOrganizationUnits/);
    assert.doesNotMatch(src, /getPortalMatters\(/);
    assert.doesNotMatch(src, /getCases\(/);
  });

  it("4/5. OWN and SHARED filters are backed by the canonical relationship dimension", () => {
    const src = mattersV3();
    assert.match(src, /OWN: "Saját ügyek"/);
    assert.match(src, /SHARED: "Megosztott velem"/);
    assert.match(src, /relationship: relationship === "ALL" \? undefined : relationship/);
    assert.doesNotMatch(src, /status ===|stage ===|legalArea/);
  });

  it("6. zero matters has the compact truthful empty state", () => {
    assert.match(mattersV3(), /Jelenleg nincs közzétett ügye\./);
  });

  it("7/8. rows link by matterPublicationId and never use an internal Case id", () => {
    const src = mattersV3();
    assert.match(src, /\/portal\/matters\/\$\{encodeURIComponent\(matter\.matterPublicationId\)\}/);
    assert.doesNotMatch(src, /matter\.caseId|case\.id|grant\.id|workspace\.id/);
  });

  it("optional unit filter renders only with more than one visible unit", () => {
    const src = mattersV3();
    assert.match(src, /units\.length > 1/);
  });

  it("filters use the canonical Button primitive", () => {
    const src = mattersV3();
    assert.match(src, /<Button/);
    assert.match(src, /variant=\{relationship === key \? "secondary" : "neutral"\}/);
  });
});

describe("Checkpoint C — matter workspace", () => {
  it("9. detail uses exact publicReference resolution, not title matching", () => {
    const src = workspaceV3();
    assert.match(src, /item\.matterPublicationId === matterPublicationId \|\| item\.publicReference === matterPublicationId/);
    assert.match(src, /getPortalOrganizationCase\(caseRow\.publicReference\)/);
    assert.doesNotMatch(src, /toLowerCase\(\).*includes|publicTitle ===|title\s*===/);
  });

  it("10. Now uses the canonical customer-safe status", () => {
    const src = workspaceV3() + statusTrack();
    assert.match(src, /PortalMatterStatusTrack current=\{detail\.currentStatusText\}/);
  });

  it("11. Waiting uses canonical waitingOn", () => {
    assert.match(workspaceV3(), /waitingOn=\{detail\.waitingOn\}/);
  });

  it("12/13. Next uses nextStep only when present and never fabricates content", () => {
    const src = workspaceV3() + statusTrack();
    assert.match(src, /nextStep=\{detail\.nextStep\}/);
    assert.match(src, /nextStep \? \(/);
    assert.match(src, /Nincs közzétett következő lépés\./);
    assert.doesNotMatch(src, /Az iroda hamarosan jelentkezik/);
  });

  it("14/15. milestones use only safeMilestones and the meter is absent when progressPercentage is null", () => {
    const src = workspaceV3() + milestones();
    assert.match(src, /milestones=\{detail\.safeMilestones\}/);
    assert.match(src, /progressPercentage=\{detail\.progressPercentage\}/);
    assert.match(src, /progressPercentage !== null && progressPercentage !== undefined \? \(/);
    assert.doesNotMatch(src, /milestones\.length.*100|progress = /);
  });

  it("16/17. documents use the published matter snapshot only", () => {
    const src = workspaceV3() + sections();
    assert.match(src, /matter\.documents/);
    assert.match(src, /\/portal\/documents\/\$\{encodeURIComponent\(document\.id\)\}/);
    // Open document requests never render as published documents here.
    assert.doesNotMatch(src, /DOCUMENT_UPLOAD|documentSpec/);
  });

  it("18. the nested request route stays reachable through the canonical journey", () => {
    const src = workspaceV3();
    assert.match(src, /requestId/);
    assert.match(src, /customerInteractionApi\.getRequest\(published\.caseId, requestId\)/);
    assert.match(src, /<CustomerRequestDetail/);
    assert.equal(exists("src/app/portal/matters/[publicationId]/requests/[requestId]/page.tsx"), true);
  });

  it("19/20. communication renders only when the capability allows and send respects allowMessages", () => {
    const src = workspaceV3();
    assert.match(src, /detail\.capabilities\.showMessages \? \(/);
    assert.match(src, /allowAsk=\{detail\.capabilities\.allowMessages\}/);
    assert.match(src, /scope="questions"/);
  });

  it("21/22/23. INDIVIDUAL and CASE_RELAY remain legacy and the /portal/ugyeim alias stays", () => {
    const src = shell();
    assert.match(src, /'Ügyeim', '\/portal\/ugyeim'/);
    assert.match(src, /workspace\.mode === 'CASE_RELAY'/);
    assert.match(src, /OrganizationPortalViews/);
    assert.equal(exists("src/app/portal/ugyeim/page.tsx"), true);
    const alias = read("src/app/portal/ugyeim/page.tsx");
    assert.match(alias, /ClientPortalShell/);
  });

  it("24. no internal ids/enums leak into the V3 matter UI", () => {
    const src = v3Sources();
    // Internal Case ids may only ever be API plumbing for the canonical
    // interaction components — never route identity or rendered content.
    assert.doesNotMatch(src, /href=\{?[^}\n]*caseId|\/portal\/[^"'\n]*caseId/);
    assert.doesNotMatch(src, /grantId|workspaceId=|workflowStep|internalStatus|internalOwner|taskNotes|lawFirmOwnerUserId/);
  });

  it("25. no raw hex / adm-blue / adm-ivory / cp-* in the new V3 matter files", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
    assert.doesNotMatch(src, /cp-(?:hero|status-track|pill|card|kicker)/);
    assert.match(src, /--adm-canvas-subtle|--adm-canvas-white/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /--adm-brand-green/);
    assert.match(src, /--adm-brand-terracotta/);
    assert.match(src, /focus-visible:ring-2/);
  });

  it("the Action Center DTO carries the canonical matter relation", () => {
    const api = read("src/lib/clientPortalApi.ts");
    assert.match(api, /matterPublicationId: string \| null;/);
    const backend = read("../Backend/src/modules/client-workspace/orgActionCenterService.ts");
    assert.match(backend, /matterPublicationId: string \| null;/);
    assert.match(backend, /matterPublicationId: matterPublicationId,/);
  });

  it("legacy matter components remain in the repository", () => {
    for (const relative of [
      "src/components/client-portal/MatterWorkspace.tsx",
      "src/components/client-portal/OrganizationPortalViews.tsx",
      "src/components/client-portal/CustomerRequestDetail.tsx",
      "src/app/portal/ugyek/page.tsx",
      "src/app/portal/matters/[publicationId]/page.tsx",
    ]) {
      assert.equal(exists(relative), true, `${relative} must remain`);
    }
  });
});
