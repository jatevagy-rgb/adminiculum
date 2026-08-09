import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("CP1 organizational client portal UI", () => {
  const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
  const orgViews = () => read("src/components/client-portal/OrganizationPortalViews.tsx");
  const orgAdmin = () => read("src/components/client-portal/OrganizationAdminControlPlane.tsx");
  const portalApi = () => read("src/lib/clientPortalApi.ts");
  const adminApi = () => read("src/lib/clientPortalAdminApi.ts");
  const interactionApi = () => read("src/lib/clientInteractionApi.ts");

  it("registers organization routes in the canonical customer shell", () => {
    assert.match(shell(), /selectedWorkspace\?\.mode === 'ORGANIZATION'/);
    assert.match(shell(), /OrganizationPortalViews/);
    assert.match(shell(), /Új megkeresés/);
    assert.match(shell(), /Megkereséseim/);
    assert.match(shell(), /Kommunikáció/);
    assert.match(shell(), /Szervezeti áttekintés/);
    assert.equal(existsSync(path.join(root, "src/app/portal/szervezeti-attekintes/page.tsx")), true);
    assert.match(read("src/app/portal/megkeresesek/uj/page.tsx"), /view="new-intake"/);
  });

  it("defines customer-safe organization DTOs and endpoint wrappers", () => {
    const src = portalApi();
    for (const token of [
      "PortalOrganizationCase",
      "PortalOrganizationCaseDetail",
      "PortalOrganizationIntake",
      "PortalLeadershipUnitAggregate",
      "getPortalOrganizationCases",
      "/client-portal/org/cases",
      "/client-portal/org/intakes",
      "/client-portal/org/summary/organization",
    ]) assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(src, /Prisma|storageProvider|scanProvider|quarantineStorageReference/);
  });

  it("renders organization home, own/shared cases, intake, documents and leadership aggregate", () => {
    const src = orgViews();
    for (const label of [
      "Szervezeti ügyfélfelület",
      "Szervezeti egységeim",
      "Figyelmet igényel",
      "Saját aktív ügyeim",
      "Nekem megosztott ügyek",
      "Általam indított megkeresések",
      "Olvasatlan kommunikáció",
      "Dokumentumok és feltöltések",
      "Saját ügyeim",
      "Megosztott velem",
      "Most itt tartunk",
      "Mire várunk",
      "Az ügy előrehaladása",
      "Szervezeti áttekintés",
      "nem ad hozzáférést egyedi ügyekhez",
    ]) assert.match(src, new RegExp(label));
    assert.match(src, /relationshipToCase === "OWN"/);
    assert.match(src, /relationshipToCase === "SHARED"/);
    assert.doesNotMatch(src, /raw enum|workspace ID|grant ID|SharePoint|SCAN_FAILED/);
  });

  it("respects communication mode and avoids fake integrations", () => {
    const src = orgViews() + shell();
    const orgSrc = orgViews();
    assert.match(src, /communicationMode !== 'EXTERNAL_ONLY'/);
    assert.match(src, /portálon belüli üzenetküldés nincs engedélyezve/);
    assert.match(src, /canSendMessages|allowMessages/);
    assert.doesNotMatch(orgSrc, /Outlook sync|automatikus szinkronizáció/);
  });

  it("exposes workforce organization administration endpoints and controls", () => {
    const api = adminApi();
    const ui = orgAdmin();
    for (const token of [
      "/client-identity/admin/workspaces/",
      "/client-identity/admin/participants",
      "/client-identity/admin/summary-scopes",
      "MESSAGE_READ",
      "MESSAGE_SEND",
      "DOCUMENT_UPLOAD",
      "CLIENT_TIMELINE_READ",
    ]) assert.match(api, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const label of [
      "Szervezeti felépítés",
      "Ügyféloldali résztvevők",
      "Ügyfélkommunikáció",
      "Belső tervezet",
      "Vezetői rálátás",
      "Ügyfélnek megosztott dokumentumok",
      "Kiválasztott résztvevők",
    ]) assert.match(ui, new RegExp(label));
    assert.match(ui, /createCaseParticipant/);
    assert.match(ui, /updateCaseParticipant/);
    assert.match(ui, /revokeCaseParticipant/);
    assert.match(ui, /createSummaryScope/);
  });

  it("never dead-ends an organization surface on the empty workspace-capability guard", () => {
    // Regression: organization customers surface content via explicit Case grants
    // + org home (OrganizationPortalViews), not workspace-level capability flags.
    // The workspace-empty short-circuit must be gated on !isOrganization, otherwise
    // a granted org customer sees only "nincs elérhető tartalom" and no cases.
    const src = shell();
    assert.match(
      src,
      /if \(!isOrganization && !\[capabilities\.matters, capabilities\.tasks, capabilities\.documents, capabilities\.messages\]\.some\(Boolean\)\)/,
    );
    // isOrganization must be computed before the guard, not only after it.
    const guardIdx = src.indexOf("setState({ status: 'workspace-empty'");
    const isOrgIdx = src.indexOf("const isOrganization = context.selectedWorkspace.mode === 'ORGANIZATION'");
    assert.ok(isOrgIdx !== -1 && guardIdx !== -1 && isOrgIdx < guardIdx, "isOrganization must be declared before the workspace-empty guard");
  });

  it("adds customer/workforce thread participant API wrappers", () => {
    const src = interactionApi();
    assert.match(src, /sendMessage/);
    assert.match(src, /markThreadRead/);
    assert.match(src, /createQuestionThread/);
    assert.match(src, /addQuestionParticipant/);
    assert.match(src, /removeQuestionParticipant/);
    assert.match(src, /archiveQuestion/);
    assert.match(src, /authContext: "customer"/);
    assert.match(src, /authContext: "workforce"/);
  });
});
