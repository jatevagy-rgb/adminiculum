import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Client Portal 3.0 — Checkpoint E2 contract (Intake V3 / "Megkeresések").
 * Pins the V3 component build for organization intakes, strict non-wiring
 * isolation during parallel development, canonical API and DTO fidelity,
 * and design system compliance.
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

describe("Checkpoint E2 — intake component build & isolation", () => {
  it("1. Intake V3 files exist in src/components/client-portal-v3/intake/", () => {
    assert.ok(exists("src/components/client-portal-v3/intake/PortalIntakesV3.tsx"));
    assert.ok(exists("src/components/client-portal-v3/intake/PortalNewIntakeV3.tsx"));
    assert.ok(exists("src/components/client-portal-v3/intake/PortalIntakeDetailV3.tsx"));
    assert.ok(exists("src/components/client-portal-v3/intake/PortalIntakeSections.tsx"));
  });

  it("2. Strict isolation: ClientPortalShell is NOT wired to V3 intake components yet", () => {
    const src = shell();
    assert.doesNotMatch(src, /PortalIntakesV3/);
    assert.doesNotMatch(src, /PortalNewIntakeV3/);
    assert.doesNotMatch(src, /PortalIntakeDetailV3/);
  });

  it("3. Strict isolation: PortalShellV3 navigation is untouched", () => {
    const src = navigation();
    // Primary navigation remains the exact seven canonical destinations
    assert.match(src, /export const ORG_PRIMARY_NAV: readonly OrgPortalNavItem\[\] = \[/);
    assert.doesNotMatch(src, /label: "Megkeresések", href: "\/portal\/megkeresesek"/);
  });

  it("4. PortalIntakesV3 consumes the canonical listOwnIntakes API", () => {
    const src = intakesList();
    assert.match(src, /listOwnIntakes/);
    assert.match(src, /formatIntakeDate/);
    assert.match(src, /PortalIntakeStatusBadge/);
  });

  it("5. PortalIntakesV3 links rows using encodeURIComponent(intake.reference)", () => {
    const src = intakesList();
    assert.match(src, /\/portal\/megkeresesek\/\$\{encodeURIComponent\(intake\.reference\)\}/);
  });

  it("6. PortalIntakesV3 preserves linked matter CTA via encodeURIComponent(linkedMatterPublicationId)", () => {
    const src = intakesList();
    assert.match(src, /\/portal\/matters\/\$\{encodeURIComponent\(intake\.linkedMatterPublicationId\)\}/);
  });

  it("7. PortalIntakesV3 provides honest empty and filtered-empty states", () => {
    const src = intakesList();
    assert.match(src, /Még nincs megkeresése/);
    assert.match(src, /A kiválasztott szűrőhöz nem található megkeresés/);
  });

  it("8. PortalNewIntakeV3 uses listMemberUnits and canonical payload builder", () => {
    const src = newIntake();
    assert.match(src, /listMemberUnits/);
    assert.match(src, /createIntake/);
    assert.match(src, /submitIntake/);
    assert.match(src, /buildCreateIntakePayload/);
    assert.match(src, /INTAKE_URGENCIES/);
  });

  it("9. PortalNewIntakeV3 supports dual draft save and submit actions", () => {
    const src = newIntake();
    assert.match(src, /data-testid="portal-new-intake-submit-btn"/);
    assert.match(src, /data-testid="portal-new-intake-save-draft-btn"/);
  });

  it("10. PortalIntakeDetailV3 consumes getIntake, responds, updates, and withdraws", () => {
    const src = intakeDetail();
    assert.match(src, /getIntake\(intakeId\)/);
    assert.match(src, /updateIntake/);
    assert.match(src, /submitIntake/);
    assert.match(src, /withdrawIntake/);
    assert.match(src, /respondToIntake/);
    assert.match(src, /buildUpdateIntakePayload/);
  });

  it("11. PortalIntakeDetailV3 confirms submit and withdraw with non-destructive actions", () => {
    const src = intakeDetail();
    assert.match(src, /data-testid="portal-intake-confirm-submit-btn"/);
    assert.match(src, /data-testid="portal-intake-confirm-withdraw-btn"/);
  });

  it("12. Design system compliance: zero raw hex, no adm-blue/ivory, no cp-* classes", () => {
    const src = allV3IntakeSources();
    assert.doesNotMatch(src, /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/);
    assert.doesNotMatch(src, /--adm-blue/);
    assert.doesNotMatch(src, /--adm-ivory/);
    assert.doesNotMatch(src, /cp-(?:hero|card|row|pill|kicker|empty)/);
    assert.match(src, /--adm-canvas-subtle|--adm-canvas-white/);
    assert.match(src, /--adm-border-canonical/);
    assert.match(src, /--adm-brand-green/);
    assert.match(src, /focus-visible:ring-2/);
    assert.match(src, /h-10/);
  });
});
