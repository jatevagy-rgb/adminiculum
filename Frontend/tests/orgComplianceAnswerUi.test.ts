import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("Organization compliance inline answer contract", () => {
  it("renders metadata-driven controls for every supported value type", () => {
    const component = read("src/components/client-portal/OrgComplianceView.tsx");
    const api = read("src/lib/clientPortalApi.ts");
    assert.match(component, /info\.valueType === "BOOLEAN"/);
    assert.match(component, /booleanValue: answerInput === "true"/);
    assert.match(component, /answerInput === "false"/);
    assert.match(component, /info\.valueType === "ENUM"/);
    assert.match(component, /enumValue: trimmed/);
    assert.match(component, /info\.valueType === "DATE"/);
    assert.match(component, /dateValue: trimmed/);
    assert.match(component, /info\.valueType === "NUMBER"/);
    assert.match(component, /info\.integerOnly && !Number\.isInteger/);
    assert.match(component, /stringValue: trimmed/);
    assert.match(api, /PortalComplianceMissingInfo[\s\S]*valueType/);
    assert.match(api, /PortalComplianceMissingInfo[\s\S]*integerOnly/);
  });

  it("preserves UNKNOWN and sends typed answers through the canonical endpoint", () => {
    const component = read("src/components/client-portal/OrgComplianceView.tsx");
    const api = read("src/lib/clientPortalApi.ts");
    assert.match(component, /status: "UNKNOWN"/);
    assert.match(component, /answerPortalCompanyProfileQuestion\(info\.questionKey, payload\)/);
    assert.match(api, /status: "ANSWERED" \| "UNKNOWN"/);
  });
});
