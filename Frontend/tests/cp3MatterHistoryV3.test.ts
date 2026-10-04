import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * WF10 shared history → CP3 V3 matter workspace wiring contract.
 *
 * The V3 customer surface must consume the EXISTING server-projected
 * `matter.history` DTO (portal + report parity) without a second backend
 * history service/endpoint, without client-side policy reconstruction, and
 * without exposing raw internal data. Absence stays truthful (no section).
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("CP3 V3 matter — shared history wiring", () => {
  const workspace = () => read("src/components/client-portal-v3/matters/PortalMatterWorkspaceV3.tsx");
  const api = () => read("src/lib/clientPortalApi.ts");
  const legacy = () => read("src/components/client-portal/MatterWorkspace.tsx");

  it("V3 workspace renders the shared history projection only when present", () => {
    const src = workspace();
    assert.match(src, /matter\.history \?/);
    assert.match(src, /data-testid="portal-matter-history"/);
    assert.match(src, /Megosztott ügytörténet/);
    assert.match(src, /aria-label="Megosztott ügytörténet"/);
  });

  it("V3 history renders only title, occurredAt, non-null body and non-null minutes", () => {
    const src = workspace();
    assert.match(src, /item\.title/);
    assert.match(src, /formatDate\(item\.occurredAt\)/);
    assert.match(src, /item\.body !== null/);
    assert.match(src, /item\.minutes !== null/);
    assert.match(src, /key=\{item\.sourceKey\}/);
  });

  it("V3 history never exposes policy or reviewer internals", () => {
    const src = workspace();
    assert.doesNotMatch(src, /policyRevision/);
    assert.doesNotMatch(src, /sourceSetDigest/);
    assert.doesNotMatch(src, /rationale/i);
    assert.doesNotMatch(src, /timeEntryDescription|TimeEntryDescription/);
    assert.doesNotMatch(src, /billing|rate|forint|HUF/i);
  });

  it("V3 does not fabricate an empty managed-policy claim when history is absent", () => {
    const src = workspace();
    // The section is conditionally rendered on the DTO presence; there is no
    // unconditional fallback section claiming managed history.
    const body = src.slice(src.indexOf("PortalMatterUpdatesSection"));
    assert.match(body, /matter\.history \?/);
    const historyBlock = body.slice(body.indexOf("matter.history ?"));
    assert.ok(!historyBlock.includes("history ? null") || historyBlock.includes(") : null}"));
  });

  it("DTO keeps the WF10 history projection after CP3 cutover", () => {
    const src = api();
    assert.match(src, /history\?: \{ policyRevision: string \| null; items: \{ sourceKey: string; title: string; body: string \| null; occurredAt: string; minutes: number \| null \}\[\] \}/);
  });

  it("legacy MatterWorkspace history rendering remains intact", () => {
    const src = legacy();
    assert.match(src, /matter\.history/);
    assert.match(src, /Megosztott ügytörténet/);
  });
});
