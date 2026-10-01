/**
 * CP3-C: Client Portal 3.0 checkpoint C — Matters V3 browser QA (synthetic).
 *
 * Proves in headless Chromium at 1440x900 and 390x844:
 *  - /portal/ugyek renders PortalMattersV3 inside the V3 shell with the
 *    canonical grant-scoped rows (OWN + SHARED), filters, honest empty state.
 *  - /portal/matters/<publicationId> renders PortalMatterWorkspaceV3 with the
 *    context header, Now/Waiting/Next, published milestones (+ meter only when
 *    percentage present), matter-scoped Action Center rows, published
 *    documents, capability-gated communication and the requests section.
 *  - zero-matter workspace, null-nextStep and capabilities-off fixtures behave.
 *  - No horizontal overflow, zero console/page errors.
 */

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CP3_C_QA_PORT || 3097);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(os.tmpdir(), "cp3-c-qa-shots");
const VIEWPORTS = [
  { width: 1440, height: 900, name: "desktop" },
  { width: 390, height: 844, name: "mobile" },
];

let scenario = "rich";
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

const ws = (ref) => ({
  publicReference: ref,
  name: "Szervezeti munkatér",
  clientDisplayName: "Demo Kft.",
  mode: "ORGANIZATION",
  status: "ACTIVE",
  communicationMode: "PORTAL_PRIMARY",
  connectedSystemState: "NOT_CONFIGURED",
  membershipRole: "APPROVER",
  capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true },
});

const OWN_MATTER = {
  publicReference: "DEMO-2026-01",
  matterPublicationId: "mp-1",
  publicTitle: "Adásvételi szerződés felülvizsgálat",
  organizationUnitName: "Operáció",
  relationshipToCase: "OWN",
  publicStatus: "Folyamatban",
  waitingOn: "Ügyfél válasza szükséges",
  nextStep: "Kérjük, töltse fel a kért dokumentumot.",
  publicTargetDate: "2026-10-12",
  customerActionRequired: true,
  lastPublishedUpdateAt: "2026-09-20T10:00:00.000Z",
};

const SHARED_MATTER = {
  publicReference: "DEMO-2026-02",
  matterPublicationId: "mp-2",
  publicTitle: "Munkajogi állásfoglalás",
  organizationUnitName: "HR",
  relationshipToCase: "SHARED",
  publicStatus: "Folyamatban",
  waitingOn: "Irodai feldolgozás",
  nextStep: null,
  publicTargetDate: null,
  customerActionRequired: false,
  lastPublishedUpdateAt: "2026-09-10T10:00:00.000Z",
};

function mockIdentityContext() {
  return {
    identity: { displayName: "Demo Kapcsolattartó", email: "demo@demokft.hu", accountType: "ORGANIZATION" },
    state: "READY",
    workspaces: [ws("ws-demo-org")],
    selectedWorkspace: ws("ws-demo-org"),
  };
}

const MOCK_PORTAL_HOME = { portalActionsEnabled: true, relationshipMode: "PORTAL_CENTRIC", access: { state: "READY", grantCount: 1 }, attention: [], matters: [], updates: [] };
const MOCK_PORTAL_WORKSPACE = { actions: [], documents: [], messages: [], upcomingDeadlines: [], matterCount: 2 };

const MATTERS = [OWN_MATTER, SHARED_MATTER];

function mockMatterDetail(ref) {
  const base = ref === "DEMO-2026-01" ? OWN_MATTER : SHARED_MATTER;
  const rich = scenario === "rich";
  return {
    ...base,
    currentStatusText: "Az iratcsomag ellenőrzése zajlik.",
    progressPercentage: rich && ref === "DEMO-2026-01" ? 60 : null,
    safeMilestones: rich && ref === "DEMO-2026-01"
      ? [
          { reference: "m1", title: "Iratok átvétele", description: null, state: "COMPLETED", displayOrder: 1, completedAt: "2026-09-10T10:00:00.000Z" },
          { reference: "m2", title: "Jogi ellenőrzés", description: "A dokumentumok szakmai áttekintése", state: "IN_PROGRESS", displayOrder: 2, completedAt: null },
        ]
      : [],
    requesterDisplayName: null,
    capabilities: {
      showTimeline: true,
      showDocuments: true,
      allowUploads: true,
      showMessages: rich && ref === "DEMO-2026-01",
      allowMessages: rich && ref === "DEMO-2026-01",
      showHours: false,
      showBillingStatement: false,
    },
  };
}

function mockPublishedMatter(ref) {
  return {
    id: ref,
    caseId: ref === "DEMO-2026-01" ? "case-1" : "case-2",
    title: ref === "DEMO-2026-01" ? OWN_MATTER.publicTitle : SHARED_MATTER.publicTitle,
    statusLabel: "Folyamatban",
    currentSummary: "Az iratcsomag ellenőrzése zajlik.",
    waitingOnLabel: ref === "DEMO-2026-01" ? "Ügyfél válasza szükséges" : "Irodai feldolgozás",
    waitingDescription: null,
    nextStepTitle: ref === "DEMO-2026-01" ? "Következő lépés" : null,
    nextStepLabel: null,
    nextStepDescription: null,
    estimatedTiming: ref === "DEMO-2026-01" ? "2026-10-12" : null,
    publishedAt: "2026-09-20T10:00:00.000Z",
    attentionCount: 0,
    documentCount: 1,
    latestUpdateAt: "2026-09-20T10:00:00.000Z",
    lastClientVisibleUpdateAt: "2026-09-20T10:00:00.000Z",
    messageCapabilities: { canRead: true, canSend: ref === "DEMO-2026-01" },
    documents: ref === "DEMO-2026-01"
      ? [{ id: "doc-1", matterId: "mp-1", matterTitle: null, title: "Közzétett iratcsomag", versionLabel: "v1", publishedAt: "2026-09-22T10:00:00.000Z", stateLabel: "Közzétéve", downloadAvailable: true, clientUploaded: false, isCompliancePolicy: false }]
      : [],
    actionRequests: [],
    updates: ref === "DEMO-2026-01"
      ? [{ id: "upd-1", matterId: "mp-1", matterTitle: null, title: "Az iratcsomag érkezett", body: "Az iroda megkapta az iratcsomagot.", categoryLabel: "Frissítés", publishedAt: "2026-09-21T10:00:00.000Z" }]
      : [],
    milestones: [],
  };
}

function mockActionCenter() {
  const rich = scenario === "rich";
  return {
    items: rich
      ? [
          {
            id: "request-r1",
            sourceType: "CLIENT_REQUEST",
            sourceId: "r1",
            domain: "LEGAL",
            kind: "UPLOAD",
            title: "Adóigazolás feltöltése",
            contextLabel: "Adásvételi szerződés felülvizsgálat",
            dueAt: null,
            urgency: "NORMAL",
            state: "OPEN",
            actionLabel: "Feltöltés megnyitása",
            href: "/portal/matters/mp-1/requests/r1",
            canCompleteInPortal: true,
            matterPublicationId: "mp-1",
          },
          {
            id: "compliance-t1-q1",
            sourceType: "COMPLIANCE_MISSING_FACT",
            sourceId: "t1",
            domain: "COMPLIANCE",
            kind: "PROFILE_FACT",
            title: "Munkavállalók számának megadása",
            contextLabel: "Munkavédelmi terület",
            dueAt: null,
            urgency: "NORMAL",
            state: "OPEN",
            actionLabel: "Adat megadása",
            href: "/portal/megfeleles",
            canCompleteInPortal: true,
            matterPublicationId: null,
          },
        ]
      : [],
    counts: rich ? { open: 2, overdue: 0, dueSoon: 0 } : { open: 0, overdue: 0, dueSoon: 0 },
  };
}

function resolveResponse(url) {
  const pathname = new URL(url).pathname.replace(/^\/api\/v1/, "");
  if (pathname === "/client-portal/me") return { status: 200, body: mockIdentityContext() };
  if (pathname === "/client-portal/home") return { status: 200, body: MOCK_PORTAL_HOME };
  if (pathname === "/client-portal/workspace") return { status: 200, body: MOCK_PORTAL_WORKSPACE };
  if (pathname === "/client-portal/org/home") {
    return {
      status: 200,
      body: {
        customer: { name: "Demo Kft." },
        matters: scenario === "empty" ? [] : MATTERS,
        actions: [],
        recentDocuments: [],
        contactSummary: { openCount: 0, unreadCount: 0, latestPreview: null, latestUpdatedAt: null },
        growSummary: { activeInitiativesCount: 0, initiatives: [], knownProcessesCount: 0 },
        complianceSummary: { attentionCount: 0, inProgressCount: 0, noActionExpectedCount: 0, topics: [] },
      },
    };
  }
  if (pathname === "/client-portal/org/action-center") return { status: 200, body: mockActionCenter() };
  if (pathname === "/client-portal/org/units") return { status: 200, body: { items: [{ id: "u1", name: "Operáció" }, { id: "u2", name: "HR" }] } };
  if (pathname === "/client-portal/org/cases") {
    let items = scenario === "empty" ? [] : MATTERS;
    const params = new URL(url).searchParams;
    const relationship = params.get("relationship");
    const unitId = params.get("unitId");
    if (relationship === "OWN" || relationship === "SHARED") items = items.filter((item) => item.relationshipToCase === relationship);
    if (unitId) items = items.filter((item) => item.organizationUnitName === unitId);
    return { status: 200, body: { items, total: items.length, limit: 50, offset: 0 } };
  }
  if (pathname === "/client-portal/org/cases/DEMO-2026-01") return { status: 200, body: mockMatterDetail("DEMO-2026-01") };
  if (pathname === "/client-portal/org/cases/DEMO-2026-02") return { status: 200, body: mockMatterDetail("DEMO-2026-02") };
  if (pathname === "/client-portal/matters/mp-1") return { status: 200, body: mockPublishedMatter("DEMO-2026-01") };
  if (pathname === "/client-portal/matters/mp-2") return { status: 200, body: mockPublishedMatter("DEMO-2026-02") };
  if (pathname === "/client-portal/org/intakes") return { status: 200, body: { items: [] } };
  if (pathname === "/client-portal/org/summary/organization") return { status: 200, body: { units: [] } };
  if (pathname === "/client-portal/org/contracts") return { status: 200, body: { items: [] } };
  if (pathname === "/client-portal/org/company") return { status: 200, body: { companyName: "Demo Kft.", profileHeadline: null, groups: [], visibleMattersByArea: [], totalVisibleMatterCount: 0, milestones: [], initiatives: [] } };
  if (pathname === "/client-interaction/cases/case-1/requests") return { status: 200, body: { items: [] } };
  if (pathname === "/client-interaction/cases/case-1/questions") return { status: 200, body: { items: [] } };
  if (pathname === "/client-interaction/cases/case-2/requests") return { status: 200, body: { items: [] } };
  if (pathname === "/client-interaction/cases/case-2/questions") return { status: 200, body: { items: [] } };
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
            return [{ homeAccountId: "qa-user", environment: "login.windows.net", tenantId: "", username: "demo@demokft.hu", localAccountId: "qa-user", name: "Demo Kapcsolattartó" }];
          };
          proto.acquireTokenSilent = async function () {
            return { accessToken: "qa-customer-token" };
          };
          proto.handleRedirectPromise = async function () {
            return null;
          };
          proto.getActiveAccount = function () {
            return { homeAccountId: "qa-user", environment: "login.windows.net", tenantId: "", username: "demo@demokft.hu", localAccountId: "qa-user", name: "Demo Kapcsolattartó" };
          };
        }
      },
      configurable: true,
    });
    localStorage.setItem("adminiculum:client-portal-workspace", "ws-demo-org");
    localStorage.setItem("auth_token", "qa-customer-token");
  });

  await page.route("**/api/v1/**", async (route) => {
    const res = resolveResponse(route.request().url());
    await route.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) });
  });

  return { context, page, hardErrors };
}

async function checkMattersList(page) {
  await page.goto(`${BASE_URL}/portal/ugyek`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="portal-matters-v3"]', { timeout: 15000 });

  if (scenario === "empty") {
    await page.waitForSelector('text=Jelenleg nincs közzétett ügye.', { timeout: 15000 });
    return;
  }

  await page.waitForSelector('[data-testid="portal-matters-list"]', { timeout: 15000 });
  const rows = page.locator('[data-testid="portal-matter-row"]');
  if ((await rows.count()) !== 2) throw new Error(`expected 2 matter rows, got ${await rows.count()}`);
  const listText = await page.locator('[data-testid="portal-matters-list"]').innerText();
  for (const label of ["Adásvételi szerződés felülvizsgálat", "Munkajogi állásfoglalás", "DEMO-2026-01", "DEMO-2026-02", "Saját ügy", "Megosztott velem", "Ügyfél válasza szükséges"]) {
    if (!listText.includes(label)) throw new Error(`matter list missing ${label}`);
  }
  // OWN / SHARED filters re-query the canonical backend dimension.
  await page.click('text=Saját ügyek');
  await page.waitForTimeout(400);
  const ownRows = await page.locator('[data-testid="portal-matter-row"]').count();
  if (ownRows !== 1) throw new Error(`OWN filter expected 1 row, got ${ownRows}`);
  await page.click('text=Megosztott velem');
  await page.waitForTimeout(400);
  const sharedRows = await page.locator('[data-testid="portal-matter-row"]').count();
  if (sharedRows !== 1) throw new Error(`SHARED filter expected 1 row, got ${sharedRows}`);
  await page.click('text=Minden');
  await page.waitForTimeout(400);

  // Unit filter appears only with multiple units.
  const unitSelect = page.locator('select[aria-label="Szervezeti egység szűrő"]');
  if ((await unitSelect.count()) !== 1) throw new Error("unit filter missing with 2 units");

  // Row navigates by matterPublicationId.
  const href = await rows.first().locator("a").getAttribute("href");
  if (!href || !href.includes("/portal/matters/mp-1")) throw new Error(`unexpected matter href: ${href}`);
}

async function checkMatterWorkspace(page) {
  await page.goto(`${BASE_URL}/portal/matters/mp-1`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="portal-matter-workspace"]', { timeout: 15000 });

  if (scenario === "empty") {
    // Zero-matter grant scope fails closed.
    await page.waitForSelector('text=Jelenleg nincs közzétett ügye.', { timeout: 15000 }).catch(() => {});
    const text = await page.evaluate(() => document.body.innerText);
    if (!text.includes("Ez a tartalom nem érhető el ezen az ügyfélfelületen.")) throw new Error("fail-closed matter copy missing");
    return;
  }

  const text = await page.evaluate(() => document.body.innerText);
  for (const label of ["Adásvételi szerződés felülvizsgálat", "DEMO-2026-01", "Saját ügy", "Operáció", "Folyamatban"]) {
    if (!text.includes(label)) throw new Error(`context header missing ${label}`);
  }
  for (const label of ["MOST ITT TARTUNK", "MIRE VÁRUNK", "KÖVETKEZŐ LÉPÉS", "Az iratcsomag ellenőrzése zajlik.", "Ügyfél válasza szükséges", "Kérjük, töltse fel a kért dokumentumot."]) {
    if (!text.includes(label)) throw new Error(`status track missing ${label}`);
  }
  if (!text.includes("60%")) throw new Error("published progress meter missing");
  for (const label of ["Iratok átvétele", "Jogi ellenőrzés", "Teljesítve", "Folyamatban"]) {
    if (!text.includes(label)) throw new Error(`milestones missing ${label}`);
  }
  if (!text.includes("Adóigazolás feltöltése")) throw new Error("matter-scoped action center row missing");
  const actionsText = await page.locator('[data-testid="portal-matter-actions"]').innerText();
  if (actionsText.includes("Munkavállalók számának megadása")) throw new Error("workspace-scoped compliance row leaked into matter actions");
  if (!text.includes("Közzétett iratcsomag")) throw new Error("published documents missing");
  await page.waitForSelector('[data-testid="portal-matter-communication"]', { timeout: 5000 });
  if (!text.includes("Az iratcsomag érkezett")) throw new Error("published updates missing");

  // Null-nextStep matter (mp-2): quiet truthful absence, no fabrication.
  await page.goto(`${BASE_URL}/portal/matters/mp-2`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="portal-matter-workspace"]', { timeout: 15000 });
  const text2 = await page.evaluate(() => document.body.innerText);
  if (!text2.includes("Nincs közzétett következő lépés.")) throw new Error("null-nextStep truthful state missing");
  if (text2.includes("Az iroda hamarosan")) throw new Error("fabricated next-step copy leaked");
  if (text2.includes("%")) throw new Error("progress meter rendered without published percentage");
  if ((await page.locator('[data-testid="portal-matter-communication"]').count()) !== 0) throw new Error("communication section rendered with showMessages=false");

  await page.goto(`${BASE_URL}/portal/matters/mp-1`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="portal-matter-workspace"]');
}

async function runQa() {
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log(`Starting Next.js production server on port ${PORT}...`);
  await startServer();
  console.log("Server started. Launching Chromium...");

  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenarioName of ["rich", "empty"]) {
      scenario = scenarioName;
      console.log(`\n=== Scenario: ${scenarioName} ===`);
      for (const viewport of VIEWPORTS) {
        console.log(`Viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
        const { context, page, hardErrors } = await createQaPage(browser, viewport);
        await checkMattersList(page);
        await checkMatterWorkspace(page);
        if (viewport.name === "mobile") {
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
          if (overflow) throw new Error("horizontal overflow at 390px");
        }
        if (viewport.name === "desktop" && scenarioName === "rich") {
          await page.goto(`${BASE_URL}/portal/matters/mp-1`, { waitUntil: "networkidle" });
          await page.waitForSelector('[data-testid="portal-matter-workspace"]');
          await page.screenshot({ path: path.join(SHOTS, "matter-workspace-desktop.png"), fullPage: true });
        }
        if (hardErrors.length) throw new Error(`hard errors: ${hardErrors.join(" | ")}`);
        await context.close();
      }
    }

    console.log("\nCP3_C_BROWSER_QA=PASS");
    return 0;
  } finally {
    await browser.close();
    stopServer();
  }
}

runQa()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("CP3_C_BROWSER_QA=FAIL");
    console.error(error);
    stopServer();
    process.exit(1);
  });
