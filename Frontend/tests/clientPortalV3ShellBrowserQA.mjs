/**
 * CP3-SHELL: Client Portal 3.0 checkpoint A — V3 shell browser QA.
 *
 * Proves in real headless Chromium (desktop 1440x900, mobile 390x844):
 *  1. /portal renders PortalShellV3 for an ORGANIZATION workspace.
 *  2. Desktop primary nav has exactly the seven V3 destinations, in order,
 *     with Naptár/Kommunikáció absent.
 *  3. Header utilities (Naptár, Kommunikáció), the green Új megkeresés CTA and
 *     the workspace/account menu work.
 *  4. Mobile bottom nav has exactly four slots; Több opens the canonical sheet
 *     with the secondary destinations.
 *  5. EXTERNAL_ONLY hides Kommunikáció everywhere.
 *  6. Existing route bodies (Home, Ügyek, Teendők, Dokumentumok, Naptár,
 *     Új megkeresés) still render inside the V3 frame.
 *  7. Zero uncaught page errors, zero horizontal overflow at 390px.
 */

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CP3_SHELL_QA_PORT || 3097);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(os.tmpdir(), "cp3-shell-qa-shots");
const VIEWPORTS = [
  { width: 1440, height: 900, name: "desktop" },
  { width: 390, height: 844, name: "mobile" },
];

let communicationMode = "PORTAL_PRIMARY";
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
// Synthetic customer-safe fixtures (no internal fields)
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
    workspaces: [workspaceSummary("ws-demo-org"), { ...workspaceSummary("ws-demo-org-2"), publicReference: "ws-demo-org-2", name: "Második munkatér" }],
    selectedWorkspace: { ...workspaceSummary("ws-demo-org"), communicationMode },
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

const MOCK_PORTAL_WORKSPACE = {
  actions: [],
  documents: [],
  messages: [],
  upcomingDeadlines: [],
  matterCount: 1,
};

const CASE_ROW = {
  publicReference: "DEMO-2026-01",
  matterPublicationId: "mp-1",
  publicTitle: "Szerződés felülvizsgálat",
  organizationUnitName: "Operáció",
  relationshipToCase: "OWN",
  publicStatus: "Folyamatban",
  waitingOn: "Az iroda visszajelzése",
  nextStep: "Várjuk az iroda válaszát",
  publicTargetDate: null,
  customerActionRequired: false,
  lastPublishedUpdateAt: null,
};

const MOCK_ORG_HOME = {
  customer: { name: "Demo Kft." },
  matters: [CASE_ROW],
  actions: [],
  recentDocuments: [],
  contactSummary: { openCount: 0, unreadCount: 0, latestPreview: null, latestUpdatedAt: null },
  growSummary: { activeInitiativesCount: 0, initiatives: [], knownProcessesCount: 0 },
  complianceSummary: { attentionCount: 0, inProgressCount: 0, noActionExpectedCount: 0, topics: [] },
};

const MOCK_COMPANY = {
  companyName: "Demo Kft.",
  profileHeadline: null,
  groups: [],
  visibleMattersByArea: [],
  totalVisibleMatterCount: 1,
  milestones: [],
  initiatives: [],
};

const MOCK_CALENDAR = {
  from: "2026-09-01",
  to: "2026-09-30",
  today: "2026-09-29",
  items: [],
  categories: [],
  counts: { total: 0, open: 0, overdue: 0, dueToday: 0, dueNext7Days: 0, dueNext30Days: 0 },
};

function resolveResponse(url) {
  const pathname = new URL(url).pathname.replace(/^\/api\/v1/, "");
  if (pathname === "/client-portal/me") return { status: 200, body: mockIdentityContext() };
  if (pathname === "/client-portal/home") return { status: 200, body: MOCK_PORTAL_HOME };
  if (pathname === "/client-portal/workspace") return { status: 200, body: MOCK_PORTAL_WORKSPACE };
  if (pathname === "/client-portal/org/home") return { status: 200, body: MOCK_ORG_HOME };
  if (pathname === "/client-portal/org/units") return { status: 200, body: { items: [] } };
  if (pathname === "/client-portal/org/cases") return { status: 200, body: { items: [CASE_ROW], total: 1, limit: 50, offset: 0 } };
  if (pathname === "/client-portal/org/intakes") return { status: 200, body: { items: [] } };
  if (pathname === "/client-portal/org/summary/organization") return { status: 200, body: { units: [] } };
  if (pathname === "/client-portal/org/contracts") return { status: 200, body: { items: [] } };
  if (pathname === "/client-portal/org/company") return { status: 200, body: MOCK_COMPANY };
  if (pathname === "/client-portal/org/work-summary") {
    return { status: 200, body: { period: { from: "2026-09-01", to: "2026-09-30" }, totalMinutes: 0, matters: [] } };
  }
  if (pathname.startsWith("/client-portal/calendar")) return { status: 200, body: MOCK_CALENDAR };
  return { status: 200, body: {} };
}

async function createQaPage(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const hardErrors = [];

  page.on("pageerror", (err) => hardErrors.push(`PAGEERROR: ${err.message}`));
  page.on("console", (msg) => {
    if (
      msg.type() === "error" &&
      !msg.text().includes("[API]") &&
      !msg.text().includes("Failed to load resource")
    ) {
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
            return [
              {
                homeAccountId: "qa-user",
                environment: "login.windows.net",
                tenantId: "",
                username: "demo@demokft.hu",
                localAccountId: "qa-user",
                name: "Demo Kapcsolattartó",
              },
            ];
          };
          proto.acquireTokenSilent = async function () {
            return { accessToken: "qa-customer-token" };
          };
          proto.handleRedirectPromise = async function () {
            return null;
          };
          proto.getActiveAccount = function () {
            return {
              homeAccountId: "qa-user",
              environment: "login.windows.net",
              tenantId: "",
              username: "demo@demokft.hu",
              localAccountId: "qa-user",
              name: "Demo Kapcsolattartó",
            };
          };
        }
      },
      configurable: true,
    });

    localStorage.setItem("adminiculum:client-portal-workspace", "ws-demo-org");
    localStorage.setItem("auth_token", "qa-customer-token");
  });

  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    const res = resolveResponse(url);
    await route.fulfill({
      status: res.status,
      contentType: "application/json",
      body: JSON.stringify(res.body),
    });
  });

  return { context, page, hardErrors };
}

const ORG_PRIMARY_LABELS = ["Áttekintés", "Ügyek", "Teendők", "Dokumentumok", "Vállalat", "Fejlesztés", "Megfelelés"];
const ORG_MORE_LABELS = ["Dokumentumok", "Vállalat", "Fejlesztés", "Megfelelés", "Naptár", "Kommunikáció"];

async function assertShellChrome(page, viewportName) {
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="portal-header-v3"]');

  // CTA
  const cta = await page.locator('[data-testid="portal-cta-new-intake"]');
  if ((await cta.count()) !== 1) throw new Error("exactly one Új megkeresés CTA expected");
  if (!((await cta.getAttribute("href")) || "").includes("/portal/megkeresesek/uj")) throw new Error("CTA href mismatch");
  if (!(await cta.innerText()).includes("Új megkeresés")) throw new Error("CTA label mismatch");

  // Utilities
  const tray = page.locator('[data-testid="org-portal-utility-tray"] a');
  const trayTitles = await tray.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("title")));
  if (!trayTitles.includes("Naptár")) throw new Error("Naptár utility missing");
  if (communicationMode === "PORTAL_PRIMARY" && !trayTitles.includes("Kommunikáció")) throw new Error("Kommunikáció utility missing");
  if (communicationMode === "EXTERNAL_ONLY" && trayTitles.includes("Kommunikáció")) throw new Error("Kommunikáció must be hidden in EXTERNAL_ONLY");

  // Account menu
  await page.click('[data-testid="portal-account-menu-trigger"]');
  await page.waitForSelector('[data-testid="portal-account-menu"]');
  const menuText = await page.locator('[data-testid="portal-account-menu"]').innerText();
  if (!menuText.includes("Kijelentkezés")) throw new Error("logout entry missing from account menu");
  if (!menuText.includes("Munkatérváltás")) throw new Error("workspace switch entry missing from account menu");
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="portal-account-menu"]', { state: "detached" });

  if (viewportName === "desktop") {
    const nav = page.locator('[data-testid="org-portal-primary-nav"]');
    if (!(await nav.isVisible())) throw new Error("desktop primary nav must be visible at 1440px");
    const labels = await nav.locator("a").evaluateAll((nodes) => nodes.map((n) => n.textContent.trim()));
    if (JSON.stringify(labels) !== JSON.stringify(ORG_PRIMARY_LABELS)) {
      throw new Error(`primary nav mismatch: ${JSON.stringify(labels)}`);
    }
    const navText = await nav.innerText();
    if (navText.includes("Naptár") || navText.includes("Kommunikáció")) {
      throw new Error("Naptár/Kommunikáció leaked into primary nav");
    }
  } else {
    const desktopNav = page.locator('[data-testid="org-portal-primary-nav"]');
    if (await desktopNav.isVisible()) throw new Error("desktop primary nav must not render on mobile");
    const mobileNav = page.locator('[data-testid="org-portal-mobile-nav-v3"]');
    if (!(await mobileNav.isVisible())) throw new Error("mobile bottom nav must be visible at 390px");
    const slots = await mobileNav.locator("a, button").evaluateAll((nodes) => nodes.map((n) => n.textContent.trim()));
    if (JSON.stringify(slots) !== JSON.stringify(["Áttekintés", "Ügyek", "Teendők", "Több"])) {
      throw new Error(`mobile slots mismatch: ${JSON.stringify(slots)}`);
    }
    // Több sheet
    await page.click('[data-testid="org-portal-more-trigger"]');
    await page.waitForSelector('[role="dialog"]');
    const sheetText = await page.locator('[role="dialog"]').innerText();
    const expectedMore = ORG_MORE_LABELS.filter((label) => communicationMode !== "EXTERNAL_ONLY" || label !== "Kommunikáció");
    for (const label of expectedMore) {
      if (!sheetText.includes(label)) throw new Error(`Több sheet missing ${label}`);
    }
    if (communicationMode === "EXTERNAL_ONLY" && sheetText.includes("Kommunikáció")) {
      throw new Error("Kommunikáció must be absent from Több sheet in EXTERNAL_ONLY");
    }
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (overflow) throw new Error("horizontal overflow at 390px");
  }
}

async function runBodyChecks(page) {
  await page.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="org-home-view"]', { timeout: 15000 });
  const homeText = await page.evaluate(() => document.body.innerText);
  if (!homeText.includes("Ami most Öntől kell")) throw new Error("/portal home body missing");
  if (!homeText.includes("Demo Kft.")) throw new Error("/portal customer heading missing");

  await page.goto(`${BASE_URL}/portal/ugyek`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]');
  await page.waitForSelector('text=Szerződés felülvizsgálat', { timeout: 15000 });
  const ugyekText = await page.evaluate(() => document.body.innerText);
  if (!ugyekText.includes("Saját és megosztott szervezeti ügyek")) throw new Error("/portal/ugyek body missing");

  await page.goto(`${BASE_URL}/portal/teendoim`, { waitUntil: "networkidle" });
  await page.waitForSelector('text=Ami most Öntől kell', { timeout: 15000 });
  const teendoimText = await page.evaluate(() => document.body.innerText);
  if (!teendoimText.includes("Most szükséges")) throw new Error("/portal/teendoim body missing");

  await page.goto(`${BASE_URL}/portal/dokumentumok`, { waitUntil: "networkidle" });
  await page.waitForSelector('text=Az iroda által közzétett dokumentumok', { timeout: 15000 });

  await page.goto(`${BASE_URL}/portal/naptar`, { waitUntil: "networkidle" });
  await page.waitForSelector('text=Határidők és teendők', { timeout: 15000 });

  await page.goto(`${BASE_URL}/portal/megkeresesek/uj`, { waitUntil: "networkidle" });
  await page.waitForSelector('text=Szervezeti megkeresés indítása', { timeout: 15000 });
}

async function runQa() {
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log(`Starting Next.js production server on port ${PORT}...`);
  await startServer();
  console.log("Server started. Launching Chromium...");

  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n=== Viewport: ${viewport.name} (${viewport.width}x${viewport.height}) ===`);
      const { context, page, hardErrors } = await createQaPage(browser, viewport);
      await page.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
      await assertShellChrome(page, viewport.name);
      if (viewport.name === "desktop") {
        await runBodyChecks(page);
        await page.screenshot({ path: path.join(SHOTS, "portal-desktop.png"), fullPage: true });
      } else {
        await page.screenshot({ path: path.join(SHOTS, "portal-mobile.png"), fullPage: true });
      }
      if (hardErrors.length) throw new Error(`hard errors: ${hardErrors.join(" | ")}`);
      await context.close();
    }

    // EXTERNAL_ONLY pass (mobile)
    console.log("\n=== EXTERNAL_ONLY mode (mobile) ===");
    communicationMode = "EXTERNAL_ONLY";
    const { context, page, hardErrors } = await createQaPage(browser, VIEWPORTS[1]);
    await page.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
    await assertShellChrome(page, "mobile");
    if (hardErrors.length) throw new Error(`hard errors: ${hardErrors.join(" | ")}`);
    await context.close();
    communicationMode = "PORTAL_PRIMARY";

    console.log("\nCP3_SHELL_BROWSER_QA=PASS");
    return 0;
  } finally {
    await browser.close();
    stopServer();
  }
}

runQa()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("CP3_SHELL_BROWSER_QA=FAIL");
    console.error(error);
    stopServer();
    process.exit(1);
  });
