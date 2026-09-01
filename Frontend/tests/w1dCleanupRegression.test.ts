import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("W1D cleanup regressions", () => {
  it("keeps one canonical visible Case creation surface", () => {
    const communication = read("src/components/communications/CommunicationWorkspace.tsx");
    const workgroups = read("src/app/clients/[clientId]/workgroups/WorkgroupsPageContent.tsx");
    const client = read("src/app/clients/[clientId]/page.tsx");

    for (const source of [communication, workgroups, client]) {
      assert.match(source, /CompactNewCaseDialog/);
      assert.doesNotMatch(source, /false\s*&&\s*show(CreateCase|NewCase)Modal/);
    }
    assert.doesNotMatch(communication, /createCaseFromCommunication|caseMatterTypeOptions|submitCreateCase/);
    assert.doesNotMatch(workgroups, /createCase|caseForm|handleCreateCase/);
    assert.doesNotMatch(client, /createCase|caseFormData|handleCreateCase|WORKFLOW_TEMPLATES/);
  });

  it("removes fake Settings profile, integration, and save placeholders", () => {
    const settings = read("src/app/settings/page.tsx");
    assert.doesNotMatch(settings, /Későbbi patchben|Mentés későbbi patchben/);
    assert.doesNotMatch(settings, /id="profile"|id="integrations"/);
    assert.match(settings, /\/settings\/workflows/);
    assert.match(settings, /\/settings\/work-packages/);
  });
});
