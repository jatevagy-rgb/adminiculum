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
  generatedAt: "2026-09-26T00:00:00.000Z",
  sources,
  unresolvedSummary: { count: unresolvedCount, reasons: unresolvedCount ? { NO_MACHINE_IDENTIFIER: unresolvedCount } : {} },
});

const render = (m: ComplianceMonitoringManifest | null) =>
  renderToStaticMarkup(createElement(TrackedLegislationPanel, { manifest: m }));

describe("compliance tracked-legislation surface", () => {
  it("renders exactly one row per manifest source", () => {
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

  it("folds many locators onto a single act row instead of multiplying rows", () => {
    const markup = render(
      manifest([
        source({ locators: ["6:59/2", "8/3", "sec=15/B;par=4"], referenceCount: 3 }),
      ]),
    );
    assert.equal((markup.match(/<li/g) ?? []).length, 1);
  });

  it("labels a Hungarian act family without inventing the act title", () => {
    const markup = render(manifest([source({ identifierFamily: "TV", sourceIdentifier: "TV/2013/5" })]));
    assert.match(markup, /Törvény/);
    assert.match(markup, /TV\/2013\/5/);
    assert.doesNotMatch(markup, />TV</);
    assert.match(trackedLegislationFamilyLabel("TV"), /^Törvény$/);
  });

  it("labels an EU CELEX source without inventing the act title", () => {
    const markup = render(
      manifest([source({ identifierFamily: "CELEX", sourceIdentifier: "32016R0679", locators: ["art=28;par=3"], referenceCount: 2 })]),
    );
    assert.match(markup, /EU jogforrás/);
    assert.match(markup, /32016R0679/);
    assert.doesNotMatch(markup, />CELEX</);
  });

  it("displays referenceCount truthfully as anchor usage", () => {
    const markup = render(manifest([source({ referenceCount: 12 })]));
    assert.match(markup, /12 hivatkozás/);
    assert.doesNotMatch(markup, /érintett dokumentum/i);
    assert.equal(trackedLegislationReferenceCountLabel(1), "1 hivatkozás");
  });

  it("does not dump raw locators as the primary UI", () => {
    const markup = render(manifest([source({ locators: ["sec=15/B;par=4"] })]));
    assert.doesNotMatch(markup, /sec=15\/B/);
    assert.doesNotMatch(markup, /par=4/);
    const panel = read("src/components/compliance-center/TrackedLegislationPanel.tsx");
    assert.doesNotMatch(panel, /\.locators/);
  });

  it("shows no fabricated monitoring, watcher or verification status", () => {
    const markup = render(manifest([source()]));
    assert.doesNotMatch(markup, /naprakész|ellenőrizve|jóváhagyva|verifikálva|figyelve|monitoring|watcher/i);
    const panel = read("src/components/compliance-center/TrackedLegislationPanel.tsx");
    assert.doesNotMatch(panel, /AdminStatusPill|reviewStatus|watcherStatus|monitoringStatus/);
  });

  it("keeps the unresolved summary truthful without raw reason tokens", () => {
    const markup = render(manifest([source()], 3));
    assert.match(markup, /3 hivatkozás nem azonosítható/);
    assert.doesNotMatch(markup, /NO_MACHINE_IDENTIFIER|MALFORMED_CANONICAL_REFERENCE|UNSUPPORTED_ELI/);
    const empty = render(manifest([source()], 0));
    assert.doesNotMatch(empty, /nem azonosítható/);
  });

  it("renders an honest empty state without claiming active monitoring", () => {
    const markup = render(manifest([]));
    assert.match(markup, /Nincs rögzített jogforrás-kötés\./);
    assert.doesNotMatch(markup, /minden jogszabály naprakészen/i);
    assert.doesNotMatch(markup, /<li/);
  });

  it("uses the existing monitoring-manifest API only and adds no backend call", () => {
    const center = read("src/components/compliance-center/ComplianceCenter.tsx");
    assert.equal((center.match(/monitoringManifest\(\)/g) ?? []).length, 1);
    assert.doesNotMatch(center, /fetch\(/);
    const panel = read("src/components/compliance-center/TrackedLegislationPanel.tsx");
    assert.doesNotMatch(panel, /fetchApi|fetch\(|complianceCenterApi\.|complianceIntelligenceApi\./);
  });

  it("preserves the privacy boundary: no client or document identity in the surface", () => {
    const markup = render(
      manifest([
        source({ sourceIdentifier: "TV/2013/5" }),
        source({ identifierFamily: "CELEX", sourceIdentifier: "32016R0679", referenceCount: 1 }),
      ]),
    );
    assert.doesNotMatch(markup, /clientId|clientName|documentId|documentVersionId/i);
    const panel = read("src/components/compliance-center/TrackedLegislationPanel.tsx");
    assert.doesNotMatch(panel, /clientId|clientName|documentId|documentVersionId/);
  });
});
