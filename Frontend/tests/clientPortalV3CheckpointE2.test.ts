import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — Checkpoint E2 contract test (Intake V3 / "Megkeresések").
 * Pins the 4-step wizard journey, zero/single/multi-unit semantics, draft vs submit
 * write semantics, draft preservation upon submit failure, reference ID invisibility,
 * and design system compliance without runtime wiring.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => existsSync(path.join(root, relative));

const shell = () => read("src/components/client-portal/ClientPortalShell.tsx");
const navigation = () => read("src/components/client-portal-v3/navigation.ts");
const intakesList = () => read("src/components/client-portal-v3/intake/PortalIntakesV3.tsx");
const newIntake = () => read("src/components/client-portal-v3/intake/PortalNewIntakeV3.tsx");
const intakeDetail = () => read("src/components/client-portal-v3/intake/PortalIntakeDetailV3.tsx");
const intakeSections = () => read("src/components/client-portal-v3/intake/PortalIntakeSections.tsx");

const allV3IntakeSources = () =>
  [intakesList(), newIntake(), intakeDetail(), intakeSections()].join("\n");

describe("Checkpoint E2 — 4-step intake journey & targeted acceptance repair", () => {
  it("1. four named steps exist in the intake wizard", () => {
    const src = newIntake();
    assert.match(src, /label:\s*"Téma"/);
    assert.match(src, /label:\s*"Szervezeti terület"/);
    assert.match(src, /label:\s*"Leírás"/);
    assert.match(src, /label:\s*"Ellenőrzés"/);
    assert.match(src, /portal-new-intake-step-1/);
    assert.match(src, /portal-new-intake-step-2/);
    assert.match(src, /portal-new-intake-step-3/);
    assert.match(src, /portal-new-intake-step-4/);
    assert.match(src, /aria-current=\{isCurrent \? "step" : undefined\}/);
  });

  it("2. initial step is Téma", () => {
    const src = newIntake();
    assert.match(src, /useState<IntakeStep>\(1\)/);
    assert.match(src, /currentStep === 1/);
  });

  it("3. user cannot advance with empty subject", () => {
    const src = newIntake();
    assert.match(src, /canAdvanceStep1 = subject\.trim\(\)\.length > 0/);
    assert.match(src, /disabled=\{!canAdvanceStep1\}/);
  });

  it("4. zero units blocks creation truthfully", () => {
    const src = newIntake();
    assert.match(src, /units\.length === 0/);
    assert.match(src, /portal-new-intake-no-units-alert/);
    assert.match(src, /Ehhez a művelethez még nincs szervezeti egységhez rendelve/);
    assert.match(src, /canAdvanceStep2 = units\.length > 0 && unitId\.trim\(\)\.length > 0/);
  });

  it("5. one unit is preselected", () => {
    const src = newIntake();
    assert.match(src, /if \(items\.length === 1\)\s*\{\s*setUnitId\(items\[0\]\.id\);\s*\}/);
  });

  it("6. multiple units require explicit selection", () => {
    const src = newIntake();
    assert.match(src, /<option value="">— Válasszon szervezeti egységet —<\/option>/);
    assert.match(src, /unitId\.trim\(\)\.length > 0/);
    assert.match(src, /disabled=\{!canAdvanceStep2\}/);
  });

  it("7. description is required", () => {
    const src = newIntake();
    assert.match(src, /canAdvanceStep3 = description\.trim\(\)\.length > 0/);
    assert.match(src, /disabled=\{!canAdvanceStep3\}/);
  });

  it("8. urgency is preserved under optional subsection", () => {
    const src = newIntake();
    assert.match(src, /További beállítások \(opcionális\)/);
    assert.match(src, /INTAKE_URGENCIES/);
    assert.match(src, /urgency,\s*requestedDeadline/);
  });

  it("9. requestedDeadline is preserved under optional subsection", () => {
    const src = newIntake();
    assert.match(src, /portal-new-intake-deadline-input/);
    assert.match(src, /requestedDeadline: deadline \|\| null/);
  });

  it("10. review step displays entered canonical values", () => {
    const src = newIntake();
    assert.match(src, /data-testid="portal-new-intake-review"/);
    assert.match(src, /data-testid="portal-review-subject"/);
    assert.match(src, /data-testid="portal-review-unit"/);
    assert.match(src, /data-testid="portal-review-description"/);
    assert.match(src, /data-testid="portal-review-urgency"/);
  });

  it("11. 'Megkeresés beküldése' creates then submits", () => {
    const src = newIntake();
    assert.match(src, /created = await createIntake\(payload\)/);
    assert.match(src, /await submitIntake\(created\.reference, null\)/);
    assert.match(src, /data-testid="portal-new-intake-submit-btn"/);
  });

  it("12. 'Piszkozat mentése' creates without submit", () => {
    const src = newIntake();
    assert.match(src, /if \(!shouldSubmitImmediately\) \{/);
    assert.match(src, /router\.push\(`\/portal\/megkeresesek\/\$\{encodeURIComponent\(created\.reference\)\}`\)/);
    assert.match(src, /data-testid="portal-new-intake-save-draft-btn"/);
  });

  it("13. create-success + submit-failure never claims success and preserves the draft", () => {
    const src = newIntake();
    assert.match(src, /setDraftSavedReference\(created\.reference\)/);
    assert.match(src, /A megkeresés piszkozata létrejött és elmentésre került, de a beküldés nem sikerült/);
    assert.match(src, /Ugrás az elmentett piszkozathoz/);
  });

  it("14. no automatic Case creation exists", () => {
    const src = newIntake() + intakeDetail() + intakesList();
    assert.doesNotMatch(src, /createCase|createMatter|createPortalCase/);
    assert.doesNotMatch(src, /POST \/cases|POST \/matters/);
  });

  it("15. intake.reference is not visibly rendered by PortalIntakeDetailV3", () => {
    const src = intakeDetail();
    assert.doesNotMatch(src, /Azonosító:\s*\{intake\.reference\}/);
    assert.doesNotMatch(src, />\{intake\.reference\}</);
  });

  it("16. no raw hex / stone / adm-blue / adm-ivory / cp-* in E2 V3 files", () => {
    const src = allV3IntakeSources();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /\bstone-\b/);
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
    assert.doesNotMatch(src, /cp-(?:hero|card|row|pill|kicker|empty)/);
    assert.match(src, /--adm-canvas-subtle|--adm-canvas-white/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /--adm-brand-green/);
    assert.match(src, /focus-visible:ring-2/);
    assert.match(src, /h-10/);
  });

  it("17. ClientPortalShell remains untouched", () => {
    const src = shell();
    assert.doesNotMatch(src, /PortalIntakesV3/);
    assert.doesNotMatch(src, /PortalNewIntakeV3/);
    assert.doesNotMatch(src, /PortalIntakeDetailV3/);
  });

  it("18. navigation remains untouched", () => {
    const src = navigation();
    assert.match(src, /export const ORG_PRIMARY_NAV: readonly OrgPortalNavItem\[\] = \[/);
    assert.doesNotMatch(src, /label: "Megkeresések", href: "\/portal\/megkeresesek"/);
  });
});
