/** F8 synthetic browser QA. Local production build + intercepted customer APIs.
 * This is NOT live authenticated acceptance. No real API writes are made.
 * Run: $env:NEXT_PUBLIC_ENTRA_CLIENT_ID='f8-synthetic-client'
 *      $env:NEXT_PUBLIC_ENTRA_AUTHORITY='https://f8.ciamlogin.com/f8'
 *      $env:NEXT_PUBLIC_ENTRA_REDIRECT_URI='http://127.0.0.1:3108/portal'
 *      $env:NEXT_PUBLIC_ADMINICULUM_API_SCOPE='api://f8-synthetic/access_as_client'
 *      npm run build && node tests/cp3ContinuationF8BrowserQA.mjs
 * QA-only values, never deployment configuration.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.CP3_F8_QA_PORT || 3108);
const base = `http://127.0.0.1:${port}`;
const shots = process.env.CP3_F8_QA_OUTPUT || path.join(os.tmpdir(), "cp3-f8-qa");
fs.mkdirSync(shots, { recursive: true });

const workspace = {
  publicReference: "ws-f8",
  name: "Szervezeti munkatér",
  clientDisplayName: "F8 Teszt Kft.",
  mode: "ORGANIZATION",
  status: "ACTIVE",
  communicationMode: "PORTAL_PRIMARY",
  connectedSystemState: "NOT_CONFIGURED",
  membershipRole: "APPROVER",
  capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true },
};

const topicFixture = {
  topicId: "topic-adatvedelem",
  topicLabel: "Adatvédelem",
  state: "RESOLVED",
  shortExplanation: "Adatkezelési megfelelés.",
  missingInformation: [],
  nextAction: null,
  documents: [
    { publicationId: "doc-1", title: "Adatkezelési tájékoztató", versionLabel: "2. változat", publishedAt: "2026-09-01T10:00:00Z", downloadAvailable: true },
  ],
};

const awaitingRequest = {
  id: "req-1",
  caseId: "internal-case-1",
  matterPublicationId: "mp-pub-1",
  type: "DOCUMENT_UPLOAD",
  title: "Oktatási nyilvántartás",
  instructions: null,
  dueAt: null,
  required: true,
  status: "PUBLISHED",
  documentSpec: null,
  publishedAt: "2026-09-30T10:00:00Z",
  fields: [],
  contextLabel: "Munkavédelem",
  category: "DOCUMENT",
  state: "AWAITING_CUSTOMER",
  canRespond: true,
  canUpload: true,
};

const closedRequest = {
  ...awaitingRequest,
  id: "req-closed",
  caseId: "internal-case-2",
  matterPublicationId: null,
  type: "QUESTION_RESPONSE",
  status: "COMPLETED",
  category: "QUESTION",
  state: "CLOSED",
  canRespond: false,
  canUpload: false,
};

let server, browser;

async function start() {
  server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local server startup timeout")), 45000);
    const ready = (chunk) => { if (/ready/i.test(String(chunk))) { clearTimeout(timer); resolve(); } };
    server.stdout.on("data", ready);
    server.stderr.on("data", ready);
    server.once("error", reject);
    server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Local server exit ${code}`)); });
  });
}

async function prepare(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(Object.prototype, "controller", {
      configurable: true,
      set(value) {
        Object.defineProperty(this, "controller", { value, writable: true, configurable: true });
        if (typeof this.getAllAccounts === "function" && typeof this.acquireTokenSilent === "function") {
          const proto = Object.getPrototypeOf(this);
          const account = { homeAccountId: "f8-qa", environment: "login.windows.net", tenantId: "", username: "f8@example.test", localAccountId: "f8-qa", name: "F8 Teszt" };
          proto.getAllAccounts = () => [account];
          proto.getActiveAccount = () => account;
          proto.acquireTokenSilent = async () => ({ accessToken: "synthetic-f8-token" });
          proto.handleRedirectPromise = async () => null;
        }
      },
    });
    localStorage.setItem("adminiculum:client-portal-workspace", "ws-f8");
    localStorage.setItem("adminiculum:auth_token:customer", "synthetic-f8-token");
  });
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname.replace(/^\/api\/v1/, "");
    let body = {}, status = 200;
    if (pathname === "/client-portal/me") body = { identity: { displayName: "F8 Teszt", email: "f8@example.test", accountType: "ORGANIZATION" }, state: "READY", workspaces: [workspace], selectedWorkspace: workspace };
    else if (pathname === "/client-portal/home") body = { portalActionsEnabled: true, relationshipMode: "PORTAL_CENTRIC", access: { state: "READY", grantCount: 1 }, attention: [], matters: [], updates: [] };
    else if (pathname === "/client-portal/workspace") body = { actions: [], documents: [], messages: [], upcomingDeadlines: [], matterCount: 1 };
    else if (pathname === "/client-portal/org/cases") body = { items: [], total: 0 };
    else if (pathname === "/client-portal/org/company-profile") body = { questions: [], screens: [] };
    else if (pathname === "/client-portal/compliance") body = { topics: [topicFixture], controlsSummary: [] };
    else if (pathname === "/client-portal/compliance/requests") body = { items: [awaitingRequest, closedRequest], counts: { awaitingCustomer: 1, officeProcessing: 0, closed: 1, requestedDocuments: 1, openQuestions: 0 }, generatedAt: new Date().toISOString() };
    else if (pathname === "/client-portal/org/grow") body = { processes: [], initiatives: [], opportunities: [], outcomes: { measured: [], calculatedOrEstimated: [] }, surveys: [] };
    else if (pathname === "/client-portal/org/grow-assessments") body = { packs: [], aggregatedFindings: [] };
    else if (pathname === "/client-portal/org/grow-survey") body = { items: [] };
    else { status = 404; body = { message: "Synthetic endpoint not configured" }; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return { context, page, errors };
}

async function screenshot(page, name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(shots, name), fullPage: true });
}

try {
  await start();
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    const tag = `${viewport.width}x${viewport.height}`;
    const { context, page, errors } = await prepare(viewport);

    await page.goto(`${base}/portal/fejlesztes`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='org-grow-view']", { timeout: 15000 });
    const growOrder = await page.evaluate(() => {
      const ids = ["grow-section-teendok", "grow-section-fejlesztesi-iranyok", "grow-section-kezdemenyezesek", "grow-section-mukodes", "grow-section-eredmenyek"];
      return [...document.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid")).filter((id) => ids.includes(id));
    });
    assert.deepEqual(growOrder, ["grow-section-teendok", "grow-section-fejlesztesi-iranyok", "grow-section-kezdemenyezesek", "grow-section-mukodes", "grow-section-eredmenyek"], `grow block order at ${tag}`);
    const growOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(growOverflow, false, `grow horizontal overflow at ${tag}`);
    await screenshot(page, `grow-${tag}.png`);

    await page.goto(`${base}/portal/fejlesztes?tab=folyamatok`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='org-grow-view']", { timeout: 15000 });
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("tab") === "mukodes", { timeout: 5000 });
    const growSectionVisible = await page.evaluate(() => {
      const el = document.getElementById("grow-section-mukodes");
      return Boolean(el && el.getBoundingClientRect().height > 0);
    });
    assert.equal(growSectionVisible, true, `legacy ?tab=folyamatok must land on the működés block at ${tag}`);
    await screenshot(page, `grow-legacy-deeplink-${tag}.png`);

    await page.goto(`${base}/portal/megfeleles`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='org-compliance-view']", { timeout: 15000 });
    const compliance = await page.evaluate(() => {
      const links = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
      const body = document.body.textContent || "";
      return {
        links,
        hasClosedCard: body.includes("Lezárt / elkészült"),
        hasNoActionCard: body.includes("Jelenleg nincs ügyfélteendő"),
      };
    });
    assert.ok(compliance.links.includes("/portal/matters/mp-pub-1/requests/req-1"), `canonical matter link missing at ${tag}: ${JSON.stringify(compliance.links)}`);
    assert.ok(!compliance.links.some((href) => href && href.includes("internal-case-")), `internal caseId leaked into a route at ${tag}`);
    assert.ok(compliance.links.includes("/portal/ugyek"), `truthful matter-list fallback missing at ${tag}`);
    assert.equal(compliance.hasClosedCard, true, `Lezárt card missing at ${tag}`);
    assert.equal(compliance.hasNoActionCard, true, `no-action card missing at ${tag}`);
    await screenshot(page, `compliance-overview-${tag}.png`);

    await page.getByRole("button", { name: "Dokumentumok" }).click();
    await page.waitForSelector("text=Adatkezelési tájékoztató", { timeout: 10000 });
    const docRow = await page.evaluate(() => document.body.textContent || "");
    assert.match(docRow, /Adatvédelem/, `topic attribution missing at ${tag}`);
    assert.match(docRow, /2\. változat/, `version label missing at ${tag}`);
    await screenshot(page, `compliance-documents-${tag}.png`);

    const complianceOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(complianceOverflow, false, `compliance horizontal overflow at ${tag}`);
    assert.deepEqual(errors, [], `page errors at ${tag}: ${errors.join(" | ")}`);
    results.push({ viewport: tag, grow: true, compliance: true });
    await context.close();
  }
  const manifest = { generatedAt: new Date().toISOString(), results, screenshots: fs.readdirSync(shots).sort() };
  fs.writeFileSync(path.join(shots, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) { server.kill(); await new Promise((resolve) => server.once("exit", resolve)); }
}
