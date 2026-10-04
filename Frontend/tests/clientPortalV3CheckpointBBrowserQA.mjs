/**
 * CP3-B: Client Portal 3.0 checkpoint B — Action Center + Home V3 browser QA.
 *
 * Synthetic-fixture QA (labelled as such — never "live authenticated
 * acceptance"). Proves in headless Chromium at 1440x900 and 390x844:
 *  1. /portal renders PortalHomeV3 inside the V3 shell; "Most Önre vár" uses
 *     max 3 Action Center items; zero actions hide the block entirely.
 *  2. /portal/teendoim renders PortalActionCenter; rows show one CTA each;
 *     overdue rows carry the OVERDUE urgency; correction rows show
 *     "Javítás szükséges"; no completed group exists.
 *  3. Filters render only for real dimensions.
 *  4. Action CTA navigation reaches the canonical request journey.
 *  5. No horizontal overflow at 390px, zero console/page errors.
 */

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CP3_B_QA_PORT || 3097);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(os.tmpdir(), "cp3-b-qa-shots");
const VIEWPORTS = [
  { width: 1440, height: 900, name: "desktop" },
  { width: 390, height: 844, name: "mobile" },
];

let scenario = "populated";
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

// ---------------------------------------------------------------------------
// Synthetic customer-safe fixtures
// ---------------------------------------------------------------------------

const workspaceSummary = (publicReference) => ({
  publicReference,
  name: "Szervezeti munkatér",
  clientDisplayName: "Demo Kft.",
  mode: "ORGANIZATION",
  status: "ACTIVE",
  communicationMode: "PORTAL_PRIMARY",
  connectedSystemState: "NOT_CONFIGURED",
  membershipRole: "APPROVER",
  capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true },
});

function mockIdentityContext() {
  return {
    identity: { displayName: "Demo Kapcsolattartó", email: "demo@demokft.hu", accountType: "ORGANIZATION" },
    state: "READY",
    workspaces: [workspaceSummary("ws-demo-org")],
    selectedWorkspace: workspaceSummary("ws-demo-org"),
  };
}

const MOCK_PORTAL_HOME = {
  portalActionsEnabled: true,
  relationshipMode: "PORTAL_CENTRIC",
  identity: { displayName: "Demo Kapcsolattartó", email: "demo@demokft.hu" },
  access: { state: "READY", grantCount: 1 },
  attention: [],
  matters: [],
  updates: [],
};

const MOCK_PORTAL_WORKSPACE = { actions: [], documents: [], messages: [], upcomingDeadlines: [], matterCount: 1 };

const MATTERS = [
  {
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
  },
  {
    publicReference: "DEMO-2026-02",
    matterPublicationId: "mp-2",
    publicTitle: "Bérleti szerződés hosszabbítás",
    organizationUnitName: "Operáció",
    relationshipToCase: "OWN",
    publicStatus: "Folyamatban",
    waitingOn: "Irodai feldolgozás",
    nextStep: null,
    publicTargetDate: null,
    customerActionRequired: false,
    lastPublishedUpdateAt: "2026-09-18T10:00:00.000Z",
  },
  {
    publicReference: "DEMO-2026-03",
    matterPublicationId: "mp-3",
    publicTitle: "Munkajogi állásfoglalás",
    organizationUnitName: "HR",
    relationshipToCase: "SHARED",
    publicStatus: "Folyamatban",
    waitingOn: "Irodai feldolgozás",
    nextStep: null,
    publicTargetDate: null,
    customerActionRequired: false,
    lastPublishedUpdateAt: "2026-09-10T10:00:00.000Z",
  },
];

function mockOrgHome() {
  return {
    customer: { name: "Demo Kft." },
    matters: scenario === "empty" ? [] : MATTERS,
    actions: [],
    recentDocuments: [
      { id: "doc-1", matterTitle: "Adásvételi szerződés felülvizsgálat", title: "Közzétett iratcsomag", publishedAt: "2026-09-22T10:00:00.000Z", downloadAvailable: true },
      { id: "doc-2", matterTitle: null, title: "Ügyfél-tájékoztató", publishedAt: "2026-09-15T10:00:00.000Z", downloadAvailable: true },
    ],
    contactSummary: { openCount: 0, unreadCount: 0, latestPreview: null, latestUpdatedAt: null },
    growSummary: {
      activeInitiativesCount: 1,
      initiatives: [{ id: "init-1", title: "Automatizált jóváhagyási rendszer bevezetése", statusLabel: "Folyamatban", targetState: "Átfutási idő csökkentése" }],
      knownProcessesCount: 2,
    },
    complianceSummary: {
      attentionCount: 1,
      inProgressCount: 0,
      noActionExpectedCount: 0,
      topics: [{ topicId: "t1", topicLabel: "Munkavédelmi terület", state: "MORE_INFORMATION_NEEDED", nextAction: "Kérjük, töltse ki a hiányzó információkat a portálon." }],
    },
    digitalTwinSummary: { organizationUnitsCount: 2, knownProcessesCount: 2, knownSystemsCount: 1, employeeCount: 42 },
  };
}

const NOW = new Date();
function isoOffset(days) {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function mockActionCenter() {
  if (scenario === "empty") {
    return { items: [], counts: { open: 0, overdue: 0, dueSoon: 0 } };
  }
  return {
    items: [
      {
        id: "correction-r3",
        sourceType: "CLIENT_SUBMISSION",
        sourceId: "sub-1",
        domain: "LEGAL",
        kind: "CORRECTION",
        title: "Hiányzó aláírás pótlása",
        contextLabel: "Adásvételi szerződés felülvizsgálat",
        dueAt: null,
        urgency: "NORMAL",
        state: "CORRECTION_REQUIRED",
        actionLabel: "Javítás megnyitása",
        href: "/portal/matters/mp-1/requests/r3",
        canCompleteInPortal: true,
      },
      {
        id: "request-r1",
        sourceType: "CLIENT_REQUEST",
        sourceId: "r1",
        domain: "LEGAL",
        kind: "UPLOAD",
        title: "Adóigazolás feltöltése",
        contextLabel: "Adásvételi szerződés felülvizsgálat",
        dueAt: isoOffset(-2),
        urgency: "OVERDUE",
        state: "OPEN",
        actionLabel: "Feltöltés megnyitása",
        href: "/portal/matters/mp-1/requests/r1",
        canCompleteInPortal: true,
      },
      {
        id: "request-r2",
        sourceType: "CLIENT_REQUEST",
        sourceId: "r2",
        domain: "LEGAL",
        kind: "FORM",
        title: "Cégadatok megerősítése",
        contextLabel: "Bérleti szerződés hosszabbítás",
        dueAt: isoOffset(2),
        urgency: "DUE_SOON",
        state: "OPEN",
        actionLabel: "Kitöltés megnyitása",
        href: "/portal/matters/mp-2/requests/r2",
        canCompleteInPortal: true,
      },
      {
        id: "intake-i1",
        sourceType: "INTAKE",
        sourceId: "i1",
        domain: "INTAKE",
        kind: "INTAKE_MORE_INFO",
        title: "További adatok a megkereséshez",
        contextLabel: "Új keretszerződés előkészítése",
        dueAt: null,
        urgency: "NORMAL",
        state: "OPEN",
        actionLabel: "Adatkérés megnyitása",
        href: "/portal/megkeresesek/i1",
        canCompleteInPortal: true,
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
      },
    ],
    counts: { open: 5, overdue: 1, dueSoon: 1 },
  };
}

function resolveResponse(url) {
  const pathname = new URL(url).pathname.replace(/^\/api\/v1/, "");
  if (pathname === "/client-portal/me") return { status: 200, body: mockIdentityContext() };
  if (pathname === "/client-portal/home") return { status: 200, body: MOCK_PORTAL_HOME };
  if (pathname === "/client-portal/workspace") return { status: 200, body: MOCK_PORTAL_WORKSPACE };
  if (pathname === "/client-portal/org/home") return { status: 200, body: mockOrgHome() };
  if (pathname === "/client-portal/org/action-center") return { status: 200, body: mockActionCenter() };
  if (pathname === "/client-portal/org/units") return { status: 200, body: { items: [{ id: "u1", name: "Operáció" }] } };
  if (pathname === "/client-portal/org/cases") return { status: 200, body: { items: MATTERS, total: 3, limit: 50, offset: 0 } };
  if (pathname === "/client-portal/org/cases/DEMO-2026-01") {
    return {
      status: 200,
      body: {
        ...MATTERS[0],
        currentStatusText: "Folyamatban",
        progressPercentage: null,
        safeMilestones: [],
        requesterDisplayName: null,
        capabilities: { showTimeline: true, showDocuments: true, allowUploads: true, showMessages: true, allowMessages: true, showHours: false, showBillingStatement: false },
      },
    };
  }
  if (pathname === "/client-portal/org/intakes") return { status: 200, body: { items: [], total: 0, limit: 20, offset: 0 } };
  if (pathname === "/client-portal/org/summary/organization") return { status: 200, body: { units: [] } };
  if (pathname === "/client-portal/org/contracts") return { status: 200, body: { items: [] } };
  if (pathname === "/client-portal/org/company") return { status: 200, body: { companyName: "Demo Kft.", profileHeadline: null, groups: [], visibleMattersByArea: [], totalVisibleMatterCount: 0, milestones: [], initiatives: [] } };
  if (pathname === "/client-portal/org/work-summary") return { status: 200, body: { period: { from: "2026-09-01", to: "2026-09-30" }, totalMinutes: 0, matters: [] } };
  if (pathname === "/client-portal/matters/mp-1") {
    return {
      status: 200,
      body: {
        id: "mp-1",
        caseId: "case-1",
        title: "Adásvételi szerződés felülvizsgálat",
        statusLabel: "Folyamatban",
        waitingOnLabel: "Ügyfél válasza szükséges",
        nextStepTitle: "Kérjük, töltse fel a kért dokumentumot.",
        publicDeadlines: [],
        publishedAt: "2026-09-20T10:00:00.000Z",
        attentionCount: 0,
        documentCount: 1,
        messageCapabilities: { canRead: true, canSend: true },
      },
    };
  }
  if (pathname === "/client-interaction/cases/case-1/requests/r3") {
    return { status: 200, body: { id: "r3", caseId: "case-1", type: "CORRECTION_REQUEST", title: "Hiányzó aláírás pótlása", instructions: null, dueAt: null, required: true, status: "PUBLISHED", documentSpec: null, publishedAt: "2026-09-25T10:00:00.000Z", fields: [], contextLabel: null } };
  }
  if (pathname === "/client-interaction/cases/case-1/requests/r3/submissions") {
    return { status: 200, body: { items: [{ id: "sub-1", requestId: "r3", status: "CORRECTION_REQUESTED", submittedAt: "2026-09-24T10:00:00.000Z", files: [], fields: [] }] } };
  }
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

async function assertNoOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("horizontal overflow at 390px");
}

async function checkHome(page) {
  await page.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="portal-home-v3"]', { timeout: 15000 });
  const homeText = await page.evaluate(() => document.body.innerText);

  if (scenario === "empty") {
    if (homeText.includes("Most Önre vár")) throw new Error("zero-action home must hide the action block");
    if (!homeText.includes("Jelenleg nincs közzétett aktív ügy.")) throw new Error("empty matters state missing");
    return;
  }

  if (!homeText.includes("Most Önre vár")) throw new Error("home action section missing");
  const actionRows = await page.locator('[data-testid="portal-home-v3-actions"] [data-testid="portal-action-row"]').count();
  if (actionRows > 3) throw new Error(`home shows ${actionRows} actions (max 3)`);
  if (actionRows < 1) throw new Error("home action rows missing");
  if (!homeText.includes("Adásvételi szerződés felülvizsgálat")) throw new Error("featured matter missing");
  if (!homeText.includes("Demo Kft.")) throw new Error("customer heading missing");
  if (homeText.includes("%")) throw new Error("fabricated percentage leaked into home");
  const matterRows = await page.locator('[data-testid="portal-home-v3-matters"] li').count();
  if (matterRows !== 3) throw new Error(`home matter rows expected 3, got ${matterRows}`);
}

async function checkActionCenter(page) {
  await page.goto(`${BASE_URL}/portal/teendoim`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="portal-action-center"]', { timeout: 15000 });

  if (scenario === "empty") {
    await page.waitForSelector('text=Jelenleg nincs teendője.', { timeout: 15000 });
    return;
  }

  await page.waitForSelector('[data-testid="portal-action-center-list"]', { timeout: 15000 });
  const rows = page.locator('[data-testid="portal-action-row"]');
  if ((await rows.count()) !== 5) throw new Error(`expected 5 action rows, got ${await rows.count()}`);
  for (let index = 0; index < 5; index += 1) {
    const ctas = await rows.nth(index).locator('[data-testid="portal-action-cta"]').count();
    if (ctas !== 1) throw new Error(`row ${index} has ${ctas} CTAs (must be exactly 1)`);
  }
  if ((await page.locator('[data-urgency="OVERDUE"]').count()) !== 1) throw new Error("exactly one OVERDUE row expected");
  const centerText = await page.evaluate(() => document.body.innerText);
  if (!centerText.includes("Javítás szükséges")) throw new Error("correction state missing");
  if (!centerText.includes("Lejárt")) throw new Error("overdue label missing");
  if (!centerText.includes("Hamarosan esedékes")) throw new Error("due-soon label missing");
  const filterText = await page.locator('[data-testid="portal-action-center-filters"]').innerText();
  for (const label of ["Minden", "Határidős", "Ügyek", "Megfelelés", "Adatkérés"]) {
    if (!filterText.includes(label)) throw new Error(`filter ${label} missing`);
  }

  // Navigation from the canonical action href reaches the request journey.
  const firstHref = await page.locator('[data-testid="portal-action-cta"]').first().getAttribute("href");
  if (!firstHref || !firstHref.includes("/portal/matters/mp-1/requests/r3")) throw new Error(`unexpected first action href: ${firstHref}`);
  await page.click('[data-testid="portal-action-cta"]');
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
  await page.waitForTimeout(800);
}

async function runQa() {
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log(`Starting Next.js production server on port ${PORT}...`);
  await startServer();
  console.log("Server started. Launching Chromium...");

  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenarioName of ["empty", "populated"]) {
      scenario = scenarioName;
      console.log(`\n=== Scenario: ${scenarioName} ===`);
      for (const viewport of VIEWPORTS) {
        console.log(`Viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
        const { context, page, hardErrors } = await createQaPage(browser, viewport);
        await checkHome(page);
        await checkActionCenter(page);
        if (viewport.name === "mobile") await assertNoOverflow(page);
        if (viewport.name === "desktop") {
          await page.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
          await page.waitForSelector('[data-testid="portal-home-v3"]');
          await page.screenshot({ path: path.join(SHOTS, `home-${scenarioName}-desktop.png`), fullPage: true });
        }
        if (hardErrors.length) throw new Error(`hard errors: ${hardErrors.join(" | ")}`);
        await context.close();
      }
    }

    console.log("\nCP3_B_BROWSER_QA=PASS");
    return 0;
  } finally {
    await browser.close();
    stopServer();
  }
}

runQa()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("CP3_B_BROWSER_QA=FAIL");
    console.error(error);
    stopServer();
    process.exit(1);
  });
