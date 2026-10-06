/**
 * Regression proof for the dead-end "E-mail thread hozzárendelése" CTA.
 *
 * Before this repair the empty-state action navigated to
 * `/cases/<caseId>/communications`, a surface that lists only communications
 * already linked to the case — so an unlinked conversation could never be
 * selected. The CTA now reuses the existing intake communication picker
 * (single-select, client-scoped) and calls the existing
 * `POST /communications/:id/link-case` contract via `linkCommunicationToCase`.
 *
 * These are source-contract checks: they pin the wiring and the truthful states
 * (single selection, exact case identity, duplicate prevention, readback, and
 * the conflict/unauthorized error mapping).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

const overview = () => read("src/components/cases/CaseWorkspaceOverview.tsx");
const drawer = () => read("src/components/cases/intake/CaseCommunicationPickerDrawer.tsx");
const errors = () => read("src/lib/communicationLinkErrors.ts");

describe("Case Workspace email-thread picker repair (B4)", () => {
  it("replaces the dead-end communications link with an in-place picker action", () => {
    const src = overview();
    assert.match(
      src,
      /onAddThread=\{\(\) => setCommPickerOpen\(true\)\}/,
      "the empty state must open the picker instead of navigating away",
    );
    assert.doesNotMatch(src, /E-mail thread hozzárendelése" href=/, "the CTA must no longer be a link");
  });

  it("renders the existing picker in single-select, client-scoped mode", () => {
    const src = overview();
    assert.match(src, /<CaseCommunicationPickerDrawer/);
    assert.match(src, /singleSelect/);
    assert.match(src, /clientId=\{c\.client\?\.id \?\? ""\}/);
    assert.match(src, /busy=\{commLinkBusy\}/);
    assert.match(src, /error=\{commLinkError\}/);
    assert.match(src, /onConfirm=\{\(ids\) => void confirmLinkThread\(ids\)\}/);
  });

  it("links exactly one thread and preserves exact case identity", () => {
    const src = overview();
    assert.match(src, /if \(ids\.length !== 1\) return/, "multiple threads must never be linked silently");
    assert.match(src, /await linkCommunicationToCase\(communicationId, caseId\)/);
    assert.match(src, /setCommPickerOpen\(false\)/);
    assert.match(src, /await refresh\(\)/, "the linked thread is read back through a workspace refresh");
  });

  it("keeps the picker single-select and truthful on load/link failure", () => {
    const src = drawer();
    assert.match(src, /singleSelect\?: boolean/);
    assert.match(src, /setStaged\(\[id\]\)/);
    assert.match(src, /sel && !singleSelect/, "primary toggle is hidden in single-select mode");
    assert.match(src, /disabled=\{busy \|\| \(singleSelect && staged\.length !== 1\)\}/);
    assert.match(src, /data-testid="comm-picker-load-error"/);
    assert.match(src, /data-testid="comm-picker-link-error"/);
  });

  it("maps unauthorized/conflict states truthfully without leaking server text", () => {
    const src = errors();
    assert.match(src, /status === 403/);
    assert.match(src, /status === 404/);
    assert.match(src, /status === 409/);
    assert.match(src, /CLIENT_CASE_MISMATCH/);
    assert.match(src, /COMMUNICATION_TASK_CASE_MISMATCH/);
  });
});
