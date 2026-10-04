/**
 * CP3 V3 matter — shared WF10 history browser QA (synthetic).
 *
 * Proves in headless Chromium at 1440x900 and 390x844:
 *  - /portal/matters/<matterPublicationId> renders the "Megosztott ügytörténet"
 *    section from the EXISTING server-projected matter.history DTO.
 *  - title + occurredAt + non-null minutes + non-null body are the only
 *    per-item disclosures; null body / null minutes stay hidden.
 *  - a matter WITHOUT history renders no history section (truthful absence).
 *  - no horizontal overflow, zero page errors.
 *
 * QA-only synthetic fixtures; no real API writes, no live auth.
 */

import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CP3_HIST_QA_PORT || 3096);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(os.tmpdir(), "cp3-history-qa-shots");
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { width: 1440, height: 900, name: "desktop" },
  { width: 390, height: 844, name: "mobile" },
];

let server;

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT)], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    let ready = false;
    const onOutput = (chunk) => {
      const text = chunk.toString();
      if (!ready && /ready|started server/i.test(text)) {
        ready = true;
        setTimeout(resolve, 1200);
      }
    };
    server.stdout?.on("data", onOutput);
    server.stderr?.on("data", onOutput);
    server.on("error", reject);
    server.on("exit", (code) => {
      if (!ready) reject(new Error(`next start exited before ready with code: ${code}`));
    });
    setTimeout(() => {
      if (!ready) reject(new Error("Timed out waiting for next start server"));
    }, 35000);
  });
}

function stopServer() {
  if (!server) return;
  try {
    if (process.platform === "win32" && server.pid) {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
    } else {
      server.kill("SIGKILL");
    }
  } catch {}
  server = undefined;
}

const ws = {
  publicReference: "ws-hist-org",
  name: "Szervezeti munkatér",
  clientDisplayName: "Történet Teszt Kft.",
  mode: "ORGANIZATION",
  status: "ACTIVE",
  communicationMode: "PORTAL_PRIMARY",
  connectedSystemState: "NOT_CONFIGURED",
  membershipRole: "APPROVER",
  capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true },
};

const CASE_ROW = {
  publicReference: "HIST-2026-01",
  matterPublicationId: "mp-hist-1",
  publicTitle: "Megosztott történettel rendelkező ügy",
  organizationUnitName: "Operáció",
  relationshipToCase: "OWN",
  publicStatus: "Folyamatban",
  waitingOn: "Irodai feldolgozás",
  nextStep: null,
  publicTargetDate: null,
  customerActionRequired: false,
  lastPublishedUpdateAt: "2026-09-20T10:00:00.000Z",
};

const CASE_ROW_NO_HISTORY = {
  ...CASE_ROW,
  publicReference: "HIST-2026-02",
  matterPublicationId: "mp-hist-2",
  publicTitle: "Történet nélküli ügy",
};

function mockMatterDetail(ref) {
  const base = ref === "HIST-2026-01" ? CASE_ROW : CASE_ROW_NO_HISTORY;
  return {
    ...base,
    currentStatusText: "Az iratcsomag ellenőrzése zajlik.",
    progressPercentage: null,
    safeMilestones: [],
    requesterDisplayName: null,
    capabilities: {
      showTimeline: true,
      showDocuments: false,
      allowUploads: false,
      showMessages: false,
      allowMessages: false,
      showHours: false,
      showBillingStatement: false,
    },
  };
}

function mockPublishedMatter(withHistory) {
  const base = {
    id: withHistory ? "mp-hist-1" : "mp-hist-2",
    caseId: withHistory ? "case-hist-1" : "case-hist-2",
    title: withHistory ? CASE_ROW.publicTitle : CASE_ROW_NO_HISTORY.publicTitle,
    statusLabel: "Folyamatban",
    currentSummary: "Az iratcsomag ellenőrzése zajlik.",
    waitingOnLabel: "Irodai feldolgozás",
    waitingDescription: null,
    nextStepTitle: null,
    nextStepLabel: null,
    nextStepDescription: null,
    estimatedTiming: null,
    publishedAt: "2026-09-20T10:00:00.000Z",
    attentionCount: 0,
    documentCount: 0,
    latestUpdateAt: "2026-09-20T10:00:00.000Z",
    lastClientVisibleUpdateAt: "2026-09-20T10:00:00.000Z",
    messageCapabilities: { canRead: false, canSend: false },
    documents: [],
    actionRequests: [],
    updates: [],
    milestones: [],
  };
  if (withHistory) {
    base.history = {
      policyRevision: "policy-v3",
      items: [
        {
          sourceKey: "hist-source-1",
          title: "Iratcsomag érkezett",
          body: "Az iroda megkapta a beküldött iratcsomagot.",
          occurredAt: "2026-09-11T10:00:00.000Z",
          minutes: 45,
        },
        {
          sourceKey: "hist-source-2",
          title: "Belső egyeztetés",
          body: null,
          occurredAt: "2026-09-12T10:00:00.000Z",
          minutes: null,
        },
      ],
    };
  }
  return base;
}

function resolveResponse(url) {
  const pathname = new URL(url).pathname.replace(/^\/api\/v1/, "");
  if (pathname === "/client-portal/me") {
    return { status: 200, body: { identity: { displayName: "Történet Kapcsolattartó", email: "tortenet@teszt.hu", accountType: "ORGANIZATION" }, state: "READY", workspaces: [ws], selectedWorkspace: ws } };
  }
  if (pathname === "/client-portal/home") return { status: 200, body: { portalActionsEnabled: true, relationshipMode: "PORTAL_CENTRIC", access: { state: "READY", grantCount: 1 }, attention: [], matters: [], updates: [] } };
  if (pathname === "/client-portal/workspace") return { status: 200, body: { actions: [], documents: [], messages: [], upcomingDeadlines: [], matterCount: 2 } };
  if (pathname === "/client-portal/org/cases") return { status: 200, body: { items: [CASE_ROW, CASE_ROW_NO_HISTORY], total: 2, limit: 50, offset: 0 } };
  if (pathname === "/client-portal/org/cases/HIST-2026-01") return { status: 200, body: mockMatterDetail("HIST-2026-01") };
  if (pathname === "/client-portal/org/cases/HIST-2026-02") return { status: 200, body: mockMatterDetail("HIST-2026-02") };
  if (pathname === "/client-portal/matters/mp-hist-1") return { status: 200, body: mockPublishedMatter(true) };
  if (pathname === "/client-portal/matters/mp-hist-2") return { status: 200, body: mockPublishedMatter(false) };
  if (pathname === "/client-portal/org/action-center") return { status: 200, body: { items: [], counts: { open: 0, overdue: 0, dueSoon: 0 } } };
  if (pathname === "/client-portal/org/units") return { status: 200, body: { items: [{ id: "u1", name: "Operáció" }] } };
  if (pathname === "/client-interaction/cases/case-hist-1/requests" || pathname === "/client-interaction/cases/case-hist-1/questions") return { status: 200, body: { items: [] } };
  return { status: 200, body: {} };
}

async function createQaPage(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const hardErrors = [];
  page.on("pageerror", (err) => hardErrors.push(`PAGEERROR: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("[API]") && !msg.text().includes("Failed to load resource")) {
      hardErrors.push(`CONSOLE_ERROR: ${msg.text()}`);
    }
  });
  await page.addInitScript(() => {
    Object.defineProperty(Object.prototype, "controller", {
      set(val) {
        Object.defineProperty(this, "controller", { value: val, writable: true, configurable: true });
        if (typeof this.getAllAccounts === "function" && typeof this.acquireTokenSilent === "function") {
          const proto = Object.getPrototypeOf(this);
          proto.getAllAccounts = function () {
            return [{ homeAccountId: "qa-user", environment: "login.windows.net", tenantId: "", username: "tortenet@teszt.hu", localAccountId: "qa-user", name: "Történet Kapcsolattartó" }];
          };
          proto.acquireTokenSilent = async function () {
            return { accessToken: "qa-customer-token" };
          };
          proto.handleRedirectPromise = async function () {
            return null;
          };
          proto.getActiveAccount = function () {
            return { homeAccountId: "qa-user", environment: "login.windows.net", tenantId: "", username: "tortenet@teszt.hu", localAccountId: "qa-user", name: "Történet Kapcsolattartó" };
          };
        }
      },
      configurable: true,
    });
    localStorage.setItem("adminiculum:client-portal-workspace", "ws-hist-org");
    localStorage.setItem("auth_token", "qa-customer-token");
  });
  await page.route("**/api/v1/**", async (route) => {
    const res = resolveResponse(route.request().url());
    await route.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) });
  });
  return { context, page, hardErrors };
}

try {
  await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const viewport of VIEWPORTS) {
      const tag = viewport.name;
      const { context, page, hardErrors } = await createQaPage(browser, viewport);

      await page.goto(`${BASE_URL}/portal/matters/mp-hist-1`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="portal-matter-workspace"]', { timeout: 15000 });
      await page.waitForSelector('[data-testid="portal-matter-history"]', { timeout: 15000 });
      const sectionText = await page.locator('[data-testid="portal-matter-history"]').innerText();
      for (const expected of ["Megosztott ügytörténet", "Iratcsomag érkezett", "Belső egyeztetés", "Az iroda megkapta a beküldött iratcsomagot.", "45 perc"]) {
        if (!sectionText.includes(expected)) throw new Error(`history section at ${tag} missing ${JSON.stringify(expected)}; got: ${sectionText}`);
      }
      if (sectionText.includes("policy-v3")) throw new Error(`history section at ${tag} leaked policy internals`);
      const itemCount = await page.locator('[data-testid="portal-matter-history"] li').count();
      assert.equal(itemCount, 2, `expected 2 history items at ${tag}, got ${itemCount}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `history matter horizontal overflow at ${tag}`);
      await page.screenshot({ path: path.join(SHOTS, `history-${tag}.png`), fullPage: true });

      await page.goto(`${BASE_URL}/portal/matters/mp-hist-2`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="portal-matter-workspace"]', { timeout: 15000 });
      await page.waitForTimeout(800);
      const absentCount = await page.locator('[data-testid="portal-matter-history"]').count();
      assert.equal(absentCount, 0, `history section must be absent for a matter without history at ${tag}`);

      assert.deepEqual(hardErrors, [], `page errors at ${tag}: ${hardErrors.join(" | ")}`);
      results.push({ viewport: tag, historyVisible: true, absenceTruthful: true });
      await context.close();
    }
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
} catch (error) {
  console.error(`HISTORY_QA_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  stopServer();
}
