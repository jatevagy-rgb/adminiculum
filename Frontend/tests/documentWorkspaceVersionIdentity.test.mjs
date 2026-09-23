/**
 * F-004 route-level regression: document version identity is canonical navigation state.
 *
 * This suite drives the ACTUAL production route/component tree
 * (src/app/cases/[caseId]/documents/page.tsx -> DocumentLedgerContent), not an
 * isolated helper, against a real Next server with deterministic API mocks.
 *
 * It pins the live acceptance contract:
 *   SELECT_V1_URL_HAS_VERSION_ID
 *   RELOAD_V1_STAYS_V1
 *   BACK_FORWARD_VERSION_TRUE
 *   CURRENT_VERSION_DEFAULT_STILL_WORKS
 *   INVALID_VERSION_NEVER_SELECTS_UNRELATED_VERSION
 * plus the surrounding regression inventory (documentId, direct URL, version
 * history, cross-document non-leakage).
 *
 * Run against an already-served app (dev or production build):
 *   npx next build && npx next start -p 3099
 *   DOC_VERSION_QA_BASE=http://localhost:3099 node --import tsx tests/run.mjs
 *
 * Without DOC_VERSION_QA_BASE the suite skips, so the default CI gate stays
 * deterministic and browser-free.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

const BASE = process.env.DOC_VERSION_QA_BASE || "";

const CASE_ID = "22222222-2222-4222-8222-222222222222";
const DOC_ID = "55555555-5555-4555-8555-555555555555";
const DOC2_ID = "55555555-5555-4555-8555-666666666666";
const V1 = "11111111-aaaa-4aaa-8aaa-111111111111";
const V2 = "22222222-bbbb-4bbb-8bbb-222222222222";
const W1 = "11111111-cccc-4ccc-8ccc-111111111111";
const W2 = "22222222-dddd-4ddd-8ddd-222222222222";
const BOGUS = "99999999-ffff-4fff-8fff-ffffffffffff";

const AUTH_ME = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "QA Ügyvéd",
  email: "qa@example.test",
  role: "ADMIN",
  organizationId: "44444444-4444-4444-8444-444444444444",
};

const CASE = {
  id: CASE_ID,
  caseNumber: "QA-1",
  title: "QA ügy",
  clientId: "66666666-6666-4666-8666-666666666666",
  clientName: "QA Ügyfél Kft.",
  matterType: "QA",
  status: "ACTIVE",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const makeDoc = (id, fileName) => ({
  id,
  caseId: CASE_ID,
  fileName,
  documentType: "UPLOADED",
  version: "1",
  folder: "QA",
  isLatest: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  securityScanStatus: "CLEAN",
});

const DOC = makeDoc(DOC_ID, "megbizasi-szerzodes.txt");
const DOC2 = makeDoc(DOC2_ID, "melleklet.txt");

const makeVersion = (documentId, id, n, isCurrent, file) => ({
  id,
  documentId,
  versionNumber: n,
  uploadedBy: { id: AUTH_ME.id, name: AUTH_ME.name },
  uploadedAt: `2026-01-0${n}T00:00:00.000Z`,
  originalFileName: file,
  mimeType: "text/plain",
  size: 120,
  storageReference: null,
  previousVersionId: n > 1 ? id : null,
  isCurrent,
  reviewStatus: "NONE",
  publicationStatus: "NOT_PUBLISHED",
  uploadSource: "USER_UPLOAD",
  versionType: "IMMUTABLE",
  spItemId: null,
  spWebUrl: null,
  securityScanStatus: "CLEAN",
});

const VERSIONS_BY_DOC = {
  [DOC_ID]: [
    makeVersion(DOC_ID, V2, 2, true, "megbizasi-szerzodes-v2.txt"),
    makeVersion(DOC_ID, V1, 1, false, "megbizasi-szerzodes-v1.txt"),
  ],
  [DOC2_ID]: [
    makeVersion(DOC2_ID, W2, 2, true, "melleklet-v2.txt"),
    makeVersion(DOC2_ID, W1, 1, false, "melleklet-v1.txt"),
  ],
};

function mock(url) {
  if (url.includes("/auth/me")) return { status: 200, body: AUTH_ME };
  if (url.includes("/contracts/editor-template-capabilities")) return { status: 200, body: { availability: { generation: false } } };
  if (url.includes(`/contracts/case/${CASE_ID}`)) return { status: 200, body: [] };
  if (url.includes(`/cases/${CASE_ID}/documents`)) return { status: 200, body: [DOC, DOC2] };
  if (url.includes(`/cases/${CASE_ID}/timeline`)) return { status: 200, body: [] };
  if (url.includes(`/cases/${CASE_ID}/client-house-style`)) return { status: 200, body: null };
  if (url.endsWith(`/cases/${CASE_ID}`)) return { status: 200, body: CASE };
  if (url.includes("/annotations")) return { status: 200, body: { items: [], total: 0 } };
  if (url.includes("/documents/") && url.includes("/versions")) {
    const documentId = Object.keys(VERSIONS_BY_DOC).find((id) => url.includes(`/documents/${id}/versions`));
    return { status: 200, body: { documentId: documentId || DOC_ID, versions: VERSIONS_BY_DOC[documentId] || [] } };
  }
  if (url.includes("/review-projection")) return { status: 404, body: { message: "not found" } };
  if (url.includes("/work-context")) return { status: 404, body: { message: "not found" } };
  if (url.includes("/client-publications/")) {
    if (url.includes("/milestones/eligible")) return { status: 200, body: { items: [] } };
    if (url.includes("/milestones/draft")) return { status: 200, body: { publicationId: null, publicationStatus: null, draft: [], publishedMilestones: [], publishedProgress: null } };
    if (url.includes("/overview")) {
      return { status: 200, body: { caseId: CASE_ID, clientId: CASE.clientId, gates: { foundationEnabled: false, portalReadEnabled: false, portalActionsEnabled: false }, warnings: [], grants: [], matterPublications: [], documentPublications: [], actionRequests: [], safeUpdates: [], history: [] } };
    }
    return { status: 200, body: { items: [] } };
  }
  if (url.includes("/internal/client-interaction/")) return { status: 200, body: { items: [] } };
  if (url.includes("/notifications/")) return { status: 200, body: { count: 0 } };
  if (url.includes("/client-identity/admin/memberships")) return { status: 200, body: { items: [] } };
  return { status: 200, body: { items: [] } };
}

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-workforce-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_ME });
  await page.route("**/api/v1/**", (route) => {
    const response = mock(route.request().url());
    return route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
  });
  return { context, page };
}

const selectedVersionText = (page) => page.evaluate(() => {
  const section = document.querySelector("#document-versions");
  if (!section) return null;
  const active = Array.from(section.querySelectorAll("button")).find((button) => button.className.includes("D8C58E"));
  return active ? active.textContent.trim() : null;
});

async function waitForVersions(page) {
  await page.waitForSelector("#document-versions button", { timeout: 90000 });
  await page.waitForTimeout(1200);
}

const goto = (page, path) => page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });

test("document workspace version identity is canonical URL state on the real route", { skip: !BASE }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    // Direct URL: explicit historical version binds and survives reload.
    {
      const { context, page } = await newPage(browser);
      await goto(page, `/cases/${CASE_ID}/documents?documentId=${DOC_ID}&versionId=${V1}`);
      await waitForVersions(page);
      const selected = await selectedVersionText(page);
      assert.ok(selected && selected.startsWith("v1"), `direct URL must select v1, got: ${selected}`);
      assert.ok(page.url().includes(`versionId=${V1}`), `direct URL must keep versionId, got: ${page.url()}`);

      await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
      await waitForVersions(page);
      const reloaded = await selectedVersionText(page);
      assert.ok(reloaded && reloaded.startsWith("v1"), `reload must stay on v1, got: ${reloaded}`);
      await context.close();
    }

    // In-session selection writes the URL; reload/back/forward stay version-true.
    {
      const { context, page } = await newPage(browser);
      await goto(page, `/cases/${CASE_ID}/documents?documentId=${DOC_ID}`);
      await waitForVersions(page);
      let selected = await selectedVersionText(page);
      assert.ok(selected && selected.startsWith("v2"), `default must be the current version, got: ${selected}`);

      await page.locator("#document-versions button", { hasText: "v1" }).first().click();
      await page.waitForTimeout(1000);
      selected = await selectedVersionText(page);
      assert.ok(selected && selected.startsWith("v1"), `click must select v1, got: ${selected}`);
      assert.ok(page.url().includes("versionId="), `selecting a historical version must write versionId, got: ${page.url()}`);

      await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
      await waitForVersions(page);
      selected = await selectedVersionText(page);
      assert.ok(selected && selected.startsWith("v1"), `reload after click must stay on v1, got: ${selected}`);

      await page.locator("#document-versions button", { hasText: "v2" }).first().click();
      await page.waitForTimeout(1000);
      assert.ok(!page.url().includes("versionId="), `selecting the current version must drop versionId, got: ${page.url()}`);

      await page.goBack();
      await page.waitForTimeout(1200);
      selected = await selectedVersionText(page);
      assert.ok(selected && selected.startsWith("v1"), `back must return to v1, got: ${selected} (${page.url()})`);

      await page.goForward();
      await page.waitForTimeout(1200);
      selected = await selectedVersionText(page);
      assert.ok(selected && selected.startsWith("v2"), `forward must return to the current version, got: ${selected} (${page.url()})`);
      await context.close();
    }

    // Invalid/foreign version ids never select an unrelated version and are canonicalized out.
    {
      const { context, page } = await newPage(browser);
      await goto(page, `/cases/${CASE_ID}/documents?documentId=${DOC_ID}&versionId=${BOGUS}`);
      await waitForVersions(page);
      const selected = await selectedVersionText(page);
      assert.ok(selected && selected.startsWith("v2"), `invalid version must fall back to current v2, got: ${selected}`);
      assert.ok(!page.url().includes(BOGUS), `invalid version must be canonicalized out of the URL, got: ${page.url()}`);
      await context.close();
    }

    // Real journey (no query) + cross-document non-leakage.
    {
      const { context, page } = await newPage(browser);
      await goto(page, `/cases/${CASE_ID}/documents`);
      await waitForVersions(page);
      let selected = await selectedVersionText(page);
      assert.ok(selected && selected.startsWith("v2"), `auto-selected document must show its current version, got: ${selected}`);

      await page.locator("#document-versions button", { hasText: "v1" }).first().click();
      await page.waitForTimeout(1000);
      assert.ok(page.url().includes("versionId="), `selecting v1 from the auto-selected document must write versionId, got: ${page.url()}`);

      await page.getByText("melleklet.txt", { exact: false }).first().click();
      await page.waitForTimeout(1500);
      selected = await selectedVersionText(page);
      assert.ok(selected && selected.startsWith("v2"), `switching document must resolve that document's current version, got: ${selected}`);
      assert.ok(!page.url().includes("versionId="), `switching document must drop the previous version identity, got: ${page.url()}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
