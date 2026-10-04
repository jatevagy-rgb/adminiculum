import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — Checkpoint F2 contract test
 * (contracts / intakes / new-intake / intake detail / leadership V3 runtime).
 * Pins the ORGANIZATION cutover for the remaining F2 legacy bodies, the
 * verified E2 semantics, the fail-closed zero-unit behavior, no automatic
 * Case creation, and INDIVIDUAL / CASE_RELAY preservation.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
const newIntake = () => read("src/components/client-portal-v3/intake/PortalNewIntakeV3.tsx");
const intakesV3 = () => read("src/components/client-portal-v3/intake/PortalIntakesV3.tsx");
const intakeDetailV3 = () => read("src/components/client-portal-v3/intake/PortalIntakeDetailV3.tsx");
const contractsV3 = () => read("src/components/client-portal-v3/contracts/PortalContractsV3.tsx");
const leadershipV3 = () => read("src/components/client-portal-v3/leadership/PortalLeadershipV3.tsx");
const intakeDetailPage = () => read("src/app/portal/megkeresesek/[intakeId]/page.tsx");
const contractsPage = () => read("src/app/portal/szerzodesek/page.tsx");
const intakesPage = () => read("src/app/portal/megkeresesek/page.tsx");
const newIntakePage = () => read("src/app/portal/megkeresesek/uj/page.tsx");
const leadershipPage = () => read("src/app/portal/szervezeti-attekintes/page.tsx");

const orgBranch = () => shell().slice(shell().indexOf("CLIENT PORTAL 3.0 CUTOVER"), shell().indexOf("// Customer context label"));
const legacyMain = () => shell().slice(shell().indexOf("// Customer context label"));

const v3Sources = () => [contractsV3(), leadershipV3()].join("\n");

describe("Checkpoint F2 — ORGANIZATION runtime cutover", () => {
  it("1. contracts ORGANIZATION route renders PortalContractsV3", () => {
    const src = orgBranch();
    assert.match(src, /view === 'contracts' \? <PortalContractsV3 \/> : null/);
    assert.match(contractsPage(), /view="contracts"/);
  });

  it("2. intakes ORGANIZATION route renders PortalIntakesV3", () => {
    const src = orgBranch();
    assert.match(src, /view === 'intakes' \? <PortalIntakesV3 \/> : null/);
    assert.match(intakesPage(), /view="intakes"/);
  });

  it("3. new-intake ORGANIZATION route renders PortalNewIntakeV3", () => {
    const src = orgBranch();
    assert.match(src, /view === 'new-intake' \? <PortalNewIntakeV3 \/> : null/);
    assert.match(newIntakePage(), /view="new-intake"/);
  });

  it("4. intake detail ORGANIZATION route renders PortalIntakeDetailV3", () => {
    const src = orgBranch();
    assert.match(src, /view === 'intake' \? <PortalIntakeDetailV3 intakeId=\{resourceId \?\? ''\} \/> : null/);
    assert.match(intakeDetailPage(), /view="intake"/);
    assert.match(intakeDetailPage(), /resourceId=\{intakeId\}/);
  });

  it("5. leadership ORGANIZATION route renders PortalLeadershipV3 and does not fall through legacy", () => {
    const src = orgBranch();
    assert.match(src, /view === 'leadership' \? <PortalLeadershipV3 \/> : null/);
    assert.match(leadershipPage(), /view="leadership"/);
  });

  it("6. OrganizationPortalViews no longer serves the F2 routes in ORGANIZATION", () => {
    const src = orgBranch();
    assert.match(src, /view !== 'intakes' && view !== 'new-intake' && view !== 'intake' && view !== 'contracts' && view !== 'leadership'/);
  });

  it("7. CASE_RELAY still uses OrganizationPortalViews for its legacy surfaces", () => {
    const src = legacyMain();
    assert.match(src, /<OrganizationPortalViews/);
    assert.match(shell(), /workspace\.mode === 'CASE_RELAY'/);
    assert.match(shell(), /\['Együttműködési áttekintés', '\/portal\/szervezeti-attekintes'\]/);
  });

  it("8. INDIVIDUAL keeps its existing surfaces and the legacy intake detail", () => {
    const src = legacyMain();
    assert.match(src, /view === 'intake' && state\.context\.selectedWorkspace\?\.mode !== 'ORGANIZATION' \? <CustomerIntakeDetail intakeId=\{resourceId \?\? ''\} \/> : null/);
    assert.match(shell(), /<HomeView/);
    assert.match(shell(), /<ListView/);
  });

  it("9. legacy OrganizationPortalViews remains in the repository", () => {
    assert.equal(exists("src/components/client-portal/OrganizationPortalViews.tsx"), true);
    assert.equal(exists("src/components/client-portal/CustomerIntake.tsx"), true);
  });
});

describe("Checkpoint F2 — verified E2 semantics preserved", () => {
  it("10. four named steps exist in the intake wizard", () => {
    const src = newIntake();
    assert.match(src, /label:\s*"Téma"/);
    assert.match(src, /label:\s*"Szervezeti terület"/);
    assert.match(src, /label:\s*"Leírás"/);
    assert.match(src, /label:\s*"Ellenőrzés"/);
  });

  it("11. zero units blocks all write paths", () => {
    const src = newIntake();
    assert.match(src, /const canAdvanceStep2 = units\.length > 0 && unitId\.trim\(\)\.length > 0/);
    assert.match(src, /if \(!canAdvanceStep1 \|\| !canAdvanceStep2 \|\| !canAdvanceStep3 \|\| busy\) return;/);
    assert.match(src, /portal-new-intake-no-units-alert/);
  });

  it("12. one unit is preselected and multiple units require explicit selection", () => {
    const src = newIntake();
    assert.match(src, /if \(items\.length === 1\)\s*\{\s*setUnitId\(items\[0\]\.id\);\s*\}/);
    assert.match(src, /<option value="">— Válasszon szervezeti egységet —<\/option>/);
  });

  it("13. subject and description are required", () => {
    const src = newIntake();
    assert.match(src, /const canAdvanceStep1 = subject\.trim\(\)\.length > 0/);
    assert.match(src, /const canAdvanceStep3 = description\.trim\(\)\.length > 0/);
  });

  it("14. urgency and requestedDeadline are preserved", () => {
    const src = newIntake();
    assert.match(src, /INTAKE_URGENCIES/);
    assert.match(src, /urgency,\s*requestedDeadline: deadline \|\| null/);
  });

  it("15. draft saves via create only; direct submit creates then submits", () => {
    const src = newIntake();
    assert.match(src, /created = await createIntake\(payload\)/);
    assert.match(src, /await submitIntake\(created\.reference, null\)/);
    assert.match(src, /if \(!shouldSubmitImmediately\) \{/);
  });

  it("16. partial success preserves the draft reference truthfully", () => {
    const src = newIntake();
    assert.match(src, /setDraftSavedReference\(created\.reference\)/);
    assert.match(src, /A megkeresés piszkozata létrejött és elmentésre került, de a beküldés nem sikerült/);
    assert.match(src, /Ugrás az elmentett piszkozathoz/);
  });

  it("17. no automatic Case creation in any F2 surface", () => {
    const src = [newIntake(), intakesV3(), intakeDetailV3()].join("\n");
    assert.doesNotMatch(src, /createCase|createMatter|createPortalCase/);
    assert.doesNotMatch(src, /POST \/cases|POST \/matters/);
  });
});

describe("Checkpoint F2 — contracts and leadership contracts", () => {
  it("18. contracts consumes the canonical published contracts projection", () => {
    const src = contractsV3();
    assert.match(src, /getPortalOrganizationContracts\(\)/);
    assert.match(src, /contractDateRows/);
    assert.match(src, /selectActiveContracts/);
    assert.match(src, /selectExpiringThisMonthContracts/);
  });

  it("19. contracts has truthful empty state and no fabricated renewal or expiry alerts", () => {
    const src = contractsV3().replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(src, /Jelenleg nincs közzétett szerződéses áttekintés/);
    assert.doesNotMatch(src, /hosszabbít|megújít|renewal|autoRenew/i);
    assert.match(src, /contract\.expiresThisMonth/);
  });

  it("20. contracts links the canonical published document when downloadable", () => {
    const src = contractsV3();
    assert.match(src, /contract\.publishedDoc\?\.downloadAvailable/);
    assert.match(src, /\/portal\/documents\/\$\{encodeURIComponent\(contract\.publishedDoc\.publicationId\)\}/);
  });

  it("21. leadership consumes the canonical org summary contract with aggregate-only copy", () => {
    const src = leadershipV3();
    assert.match(src, /getPortalOrganizationSummary\(\)/);
    assert.match(src, /kizárólag összesített adatokat mutat/);
    assert.match(src, /unit\.activeCaseCount/);
    assert.match(src, /unit\.waitingOnCustomerCount/);
    assert.match(src, /unit\.publicStageCounts/);
  });

  it("22. F2 V3 files follow the V3 visual contract", () => {
    const src = v3Sources();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /stone-/);
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
    assert.doesNotMatch(src, /rounded-2xl|rounded-3xl/);
    assert.match(src, /--adm-canvas-white/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /--adm-brand-green/);
    assert.match(src, /focus-visible:ring-2/);
  });
});
