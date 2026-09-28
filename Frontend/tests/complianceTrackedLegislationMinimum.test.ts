import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TrackedLegislationPanel,
  trackedLegislationFamilyLabel,
  trackedLegislationReferenceCountLabel,
  trackedLegislationUnresolvedLabel,
} from "../src/components/compliance-center/TrackedLegislationPanel";
import type { ComplianceMonitoringManifest } from "../src/lib/complianceIntelligenceApi";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

type Source = ComplianceMonitoringManifest["sources"][number];

const source = (overrides: Partial<Source> = {}): Source => ({
  identifierFamily: "TV",
  sourceIdentifier: "TV/2013/5",
  locators: ["6:59/2"],
  referenceCount: 12,
  ...overrides,
});

const manifest = (sources: Source[], unresolvedCount = 0): ComplianceMonitoringManifest => ({
  schemaVersion: 1,
  generatedAt: "2026-09-27T00:00:00.000Z",
  sources,
  unresolvedSummary: {
    count: unresolvedCount,
    reasons: unresolvedCount ? { NO_MACHINE_IDENTIFIER: unresolvedCount } : {},
  },
});

const render = (m: ComplianceMonitoringManifest | null) =>
  renderToStaticMarkup(createElement(TrackedLegislationPanel, { manifest: m }));

const panelSource = () => read("src/components/compliance-center/TrackedLegislationPanel.tsx");
const centerSource = () => read("src/components/compliance-center/ComplianceCenter.tsx");

describe("compliance tracked-legislation minimum surface", () => {
  it("1. renders exactly one row per distinct manifest act", () => {
    const markup = render(
      manifest([
        source({ sourceIdentifier: "TV/2013/5" }),
        source({ sourceIdentifier: "TV/2015/57", referenceCount: 4 }),
      ]),
    );
    assert.equal((markup.match(/<li/g) ?? []).length, 2);
    assert.match(markup, /TV\/2013\/5/);
    assert.match(markup, /TV\/2015\/57/);
  });

  it("2. never duplicates an act row and folds many locators onto one row", () => {
    const markup = render(
      manifest([source({ locators: ["6:59/2", "8/3", "sec=15/B;par=4"], referenceCount: 3 })]),
    );
    assert.equal((markup.match(/<li/g) ?? []).length, 1);
    assert.equal((markup.match(/TV\/2013\/5/g) ?? []).length, 1);
  });

  it("3. renders a Hungarian act reference truthfully without inventing a title", () => {
    const markup = render(manifest([source({ identifierFamily: "TV", sourceIdentifier: "TV/2013/5" })]));
    assert.match(markup, /Törvény/);
    assert.match(markup, /TV\/2013\/5/);
    // The raw identifierFamily token is never product copy.
    assert.doesNotMatch(markup, />TV</);
    assert.equal(trackedLegislationFamilyLabel("TV"), "Törvény");
  });

  it("4. renders an EU CELEX source truthfully without inventing a title", () => {
    const markup = render(
      manifest([
        source({ identifierFamily: "CELEX", sourceIdentifier: "32016R0679", locators: ["art=28;par=3"], referenceCount: 8 }),
      ]),
    );
    assert.match(markup, /EU jogforrás/);
    assert.match(markup, /32016R0679/);
    assert.doesNotMatch(markup, />CELEX</);
    assert.equal(trackedLegislationFamilyLabel("CELEX"), "EU jogforrás");
  });

  it("5. renders referenceCount truthfully as anchor usage, never affected documents", () => {
    const markup = render(manifest([source({ referenceCount: 12 })]));
    assert.match(markup, /12 hivatkozás/);
    assert.doesNotMatch(markup, /érintett dokumentum/i);
    assert.doesNotMatch(markup, /dokumentum(?:ot|ok)? érint/i);
    assert.equal(trackedLegislationReferenceCountLabel(1), "1 hivatkozás");
    assert.equal(trackedLegislationReferenceCountLabel(0), "0 hivatkozás");
  });

  it("6. removes raw locator clutter from the surface", () => {
    const markup = render(manifest([source({ locators: ["sec=15/B;par=4", "art=28;par=3"] })]));
    assert.doesNotMatch(markup, /sec=15\/B/);
    assert.doesNotMatch(markup, /par=4/);
    assert.doesNotMatch(markup, /art=28/);
    assert.doesNotMatch(panelSource(), /\.locators/);
    assert.doesNotMatch(centerSource(), /\.locators/);
  });

  it("7. makes no affected-document or impact count claim", () => {
    const panel = panelSource();
    assert.doesNotMatch(panel, /impactedDocument|affectedDocument|érintett dokumentum/i);
    const markup = render(manifest([source(), source({ identifierFamily: "CELEX", sourceIdentifier: "32016R0679" })]));
    assert.doesNotMatch(markup, /érintett/i);
  });

  it("8. shows no fabricated watcher, monitoring or verification status", () => {
    const markup = render(manifest([source()]));
    assert.doesNotMatch(markup, /naprakész|ellenőrizve|jóváhagyva|verifikálva|figyelve|figyelt\b|watcher|monitoring/i);
    assert.doesNotMatch(markup, /<span[^>]*rounded-full/);
    assert.doesNotMatch(panelSource(), /AdminStatusPill|reviewStatus|watcherStatus|monitoringStatus/);
    // The misleading heading is gone; the truthful heading is used.
    assert.match(markup, /Követett jogszabályok/);
    assert.doesNotMatch(markup, /Automatikus figyelés/);
  });

  it("9. renders an honest empty state without claiming active monitoring", () => {
    const markup = render(manifest([]));
    assert.match(markup, /Nincs rögzített jogforrás-kötés\./);
    assert.doesNotMatch(markup, /<li/);
    assert.match(markup, /0 követett jogszabály/);
    const nullState = render(null);
    assert.match(nullState, /Nincs rögzített jogforrás-kötés\./);
  });

  it("10. preserves unresolvedSummary truthfulness with bounded aggregate copy", () => {
    const withUnresolved = render(manifest([source()], 3));
    assert.match(withUnresolved, /3 hivatkozás nem azonosítható támogatott jogforrás-azonosítóval\./);
    assert.doesNotMatch(withUnresolved, /NO_MACHINE_IDENTIFIER|MALFORMED_CANONICAL_REFERENCE|UNSUPPORTED_ELI|INVALID_CELEX/);
    const noUnresolved = render(manifest([source()], 0));
    assert.doesNotMatch(noUnresolved, /nem azonosítható/);
    assert.equal(trackedLegislationUnresolvedLabel(3), "3 hivatkozás nem azonosítható támogatott jogforrás-azonosítóval.");
  });

  it("11. reuses the existing monitoring-manifest API and introduces no backend or endpoint", () => {
    const center = centerSource();
    assert.equal((center.match(/monitoringManifest\(\)/g) ?? []).length, 1);
    assert.doesNotMatch(center, /fetch\(/);
    const panel = panelSource();
    assert.doesNotMatch(panel, /fetchApi|fetch\(|complianceIntelligenceApi\.|complianceCenterApi\./);
    assert.doesNotMatch(panel, /\/api\/|monitoring-manifest/);
    // No fabricated enrichment fields leak into the surface.
    assert.doesNotMatch(panel, /officialEliUri|LegalSubdivision|legalSubdivision|subdivision/i);
  });

  it("preserves the privacy boundary — no client or document identity", () => {
    const markup = render(
      manifest([
        source({ sourceIdentifier: "TV/2013/5" }),
        source({ identifierFamily: "CELEX", sourceIdentifier: "32016R0679", referenceCount: 1 }),
      ]),
    );
    assert.doesNotMatch(markup, /clientId|clientName|documentId|documentVersionId|matterId/i);
    assert.doesNotMatch(panelSource(), /clientId|clientName|documentId|documentVersionId|matterId/);
  });
});
