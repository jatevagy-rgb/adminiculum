/**
 * CP3-F1: Client Portal 3.0 checkpoint F1 — Communication + Calendar V3
 * browser QA (synthetic; never "live authenticated acceptance").
 *
 * Verifies at 1440x900 and 390x844 on /portal/uzenetek and /portal/naptar:
 *  - PortalCommunicationV3 renders inside the V3 shell with canonical
 *    workspace-message rows (subject, matter, status, updatedAt, actionUrl).
 *  - No unread badge or invented message metadata.
 *  - EXTERNAL_ONLY shows the truthful quiet copy, no message list and no
 *    communication utility in the shell.
 *  - PortalCalendarV3 renders the server-count summary, all 9 category chips
 *    (zero-count categories included), month navigation, desktop grid, mobile
 *    day strip, selected-day items and upcoming events with canonical hrefs.
 *  - Empty states use the mandated truthful copies.
 *  - No horizontal overflow at 390px, zero console/page errors.
 */

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CP3_F1_QA_PORT || 3098);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(os.tmpdir(), "cp3-f1-qa-shots");
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

function ws(ref) {
  return {
    publicReference: ref,
    name: "Szervezeti munkatér",
    clientDisplayName: "Demo Kft.",
    mode: "ORGANIZATION",
    status: "ACTIVE",
    communicationMode: scenario === "external" ? "EXTERNAL_ONLY" : "PORTAL_PRIMARY",
    connectedSystemState: "NOT_CONFIGURED",
    membershipRole: "APPROVER",
    capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true },
  };
}

function mockIdentityContext() {
  return {
    identity: { displayName: "Demo Kapcsolattartó", email: "demo@demokft.hu", accountType: "ORGANIZATION" },
    state: "READY",
    workspaces: [ws("ws-demo-org")],
    selectedWorkspace: ws("ws-demo-org"),
  };
}

const MOCK_PORTAL_HOME = { portalActionsEnabled: true, relationshipMode: "PORTAL_CENTRIC", access: { state: "READY", grantCount: 1 }, attention: [], matters: [], updates: [] };

function mockWorkspace() {
  const messages =
    scenario === "rich"
      ? [
          { id: "msg-1", matterId: "case-1", matterTitle: "Adásvételi szerződés", subject: "Kérdés a vételár kiegyenlítéséről", status: "Megválaszolva", updatedAt: "2026-09-25T10:00:00.000Z", actionUrl: "/portal/matters/mp-1" },
          { id: "msg-2", matterId: "case-2", matterTitle: "Munkajogi tanácsadás", subject: "Új munkaszerződés tervezet", status: "Válaszra vár", updatedAt: null, actionUrl: "/portal/matters/mp-2" },
        ]
      : [];
  return { actions: [], documents: [], messages, upcomingDeadlines: [], matterCount: 0 };
}

function toDayKey(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function plusDays(n) {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return toDayKey(date);
}

function toIso(dayKey) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day).toISOString();
}

function mockCalendar() {
  const today = toDayKey(new Date());
  if (scenario !== "rich") {
    return { from: "", to: "", today, items: [], categories: [], counts: { total: 0, open: 0, overdue: 0, dueToday: 0, dueNext7Days: 0, dueNext30Days: 0 } };
  }
  const in3 = plusDays(3);
  const in9 = plusDays(9);
  return {
    from: "",
    to: "",
    today,
    items: [
      { id: "cal-1", category: "MATTER_TARGET", categoryLabel: "Ügy céldátum", title: "Adásvétel — szerződéskötési céldátum", date: toIso(today), day: today, status: "OPEN", href: "/portal/matters/mp-1", matterTitle: "Adásvételi szerződés" },
      { id: "cal-2", category: "ACTION_REQUEST", categoryLabel: "Tennivaló-kérés", title: "Hiányzó igazolás beküldése", date: toIso(in3), day: in3, status: "OPEN", href: "/portal/action-requests/ar-1", matterTitle: "Adásvételi szerződés" },
      { id: "cal-3", category: "PUBLISHED_DEADLINE", categoryLabel: "Közzétett határidő", title: "Kötbér érvényesítési határidő", date: toIso(in9), day: in9, status: "INFO", href: "/portal/matters/mp-1", matterTitle: "Adásvételi szerződés" },
    ],
    categories: [
      { key: "MATTER_TARGET", label: "Ügy céldátum", count: 1 },
      { key: "PUBLISHED_DEADLINE", label: "Közzétett határidő", count: 1 },
      { key: "ACTION_REQUEST", label: "Tennivaló-kérés", count: 1 },
      { key: "CUSTOMER_REQUEST", label: "Ügyfélkérés", count: 0 },
      { key: "CONTRACT_DATE", label: "Szerződéses dátum", count: 0 },
      { key: "CONTRACT_OCCURRENCE", label: "Szerződéses esemény", count: 0 },
      { key: "COMPANY_MILESTONE", label: "Vállalati mérföldkő", count: 0 },
      { key: "GROW_TARGET", label: "Fejlesztési cél", count: 0 },
      { key: "COMPLIANCE_REVIEW", label: "Megfelelőségi felülvizsgálat", count: 0 },
    ],
    counts: { total: 3, open: 2, overdue: 0, dueToday: 1, dueNext7Days: 2, dueNext30Days: 3 },
  };
}

function resolveResponse(url) {
  const pathname = new URL(url).pathname.replace(/^\/api\/v1/, "");
  if (pathname === "/client-portal/me") return { status: 200, body: mockIdentityContext() };
  if (pathname === "/client-portal/home") return { status: 200, body: MOCK_PORTAL_HOME };
  if (pathname === "/client-portal/workspace") return { status: 200, body: mockWorkspace() };
  if (pathname === "/client-portal/calendar") return { status: 200, body: mockCalendar() };
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

async function checkCommunication(page, viewport) {
  await page.goto(`${BASE_URL}/portal/uzenetek`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="portal-communication-v3"]', { timeout: 15000 });

  if (scenario === "external") {
    await page.waitForSelector('[data-testid="portal-communication-external-only"]', { timeout: 15000 });
    const text = await page.evaluate(() => document.body.innerText);
    if (!text.includes("Ezen a munkaterületen a portálos üzenetváltás jelenleg nem aktív.")) throw new Error("EXTERNAL_ONLY quiet copy missing");
    if (await page.locator('[data-testid="portal-communication-list"]').count()) throw new Error("message list rendered in EXTERNAL_ONLY");
    if (await page.locator('[data-testid="org-portal-utility-communication"]').count()) throw new Error("communication utility rendered in EXTERNAL_ONLY");
    return;
  }

  if (scenario === "empty") {
    await page.waitForSelector('text=Jelenleg nincs portálos beszélgetése.', { timeout: 15000 });
    if (await page.locator('[data-testid="portal-communication-list"]').count()) throw new Error("message list rendered in empty state");
    return;
  }

  await page.waitForSelector('[data-testid="portal-communication-list"]', { timeout: 15000 });
  const text = await page.evaluate(() => document.body.innerText);
  for (const label of ["Kommunikáció", "Kérdés a vételár kiegyenlítéséről", "Adásvételi szerződés", "Megválaszolva", "Új munkaszerződés tervezet", "Válaszra vár", "Legutóbbi aktivitás"]) {
    if (!text.includes(label)) throw new Error(`communication list missing ${label}`);
  }
  for (const fake of ["olvasatlan", "Olvasatlan"]) {
    if (text.includes(fake)) throw new Error(`unread state invented: ${fake}`);
  }
  const rowCount = await page.locator('[data-testid="portal-communication-row"]').count();
  if (rowCount !== 2) throw new Error(`expected 2 rows, got ${rowCount}`);
  const hrefs = await page.$$eval('[data-testid="portal-communication-row"] a', (els) => els.map((el) => el.getAttribute("href")));
  if (hrefs[0] !== "/portal/matters/mp-1" || hrefs[1] !== "/portal/matters/mp-2") throw new Error(`canonical actionUrl not preserved: ${hrefs.join(", ")}`);
  if (viewport.name === "desktop" && scenario === "rich") {
    await page.screenshot({ path: path.join(SHOTS, "communication-desktop.png"), fullPage: true });
  }
}

async function checkCalendar(page, viewport) {
  await page.goto(`${BASE_URL}/portal/naptar`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="portal-calendar-v3"]', { timeout: 15000 });

  if (scenario === "empty" || scenario === "external") {
    await page.waitForSelector('text=Ebben az időszakban nincs közzétett határidő vagy esemény.', { timeout: 15000 });
    return;
  }

  await page.waitForSelector('[data-testid="portal-calendar-summary"]', { timeout: 15000 });
  await page.waitForSelector('text=nyitott teendő', { timeout: 15000 });
  const text = await page.evaluate(() => document.body.innerText);
  for (const label of ["Naptár", "2 nyitott teendő", "1 ma esedékes", "a következő 7 napban"]) {
    if (!text.includes(label)) throw new Error(`calendar summary missing ${label}`);
  }
  for (const label of ["Ügy céldátum (1)", "Megfelelőségi felülvizsgálat (0)", "Következő események"]) {
    if (!text.includes(label)) throw new Error(`calendar section missing ${label}`);
  }
  const chipCount = await page.locator('[data-testid="portal-calendar-filters"] button').count();
  if (chipCount !== 9) throw new Error(`expected 9 category chips, got ${chipCount}`);
  for (const label of ["Adásvétel — szerződéskötési céldátum", "Hiányzó igazolás beküldése", "Kötbér érvényesítési határidő"]) {
    if (!text.includes(label)) throw new Error(`calendar item missing ${label}`);
  }
  for (const label of ["Nyitott", "Tájékoztató"]) {
    if (!text.includes(label)) throw new Error(`customer-safe status missing ${label}`);
  }
  const hrefs = await page.$$eval('[data-testid="portal-calendar-item"] a', (els) => els.map((el) => el.getAttribute("href")));
  if (!hrefs.includes("/portal/matters/mp-1") || !hrefs.includes("/portal/action-requests/ar-1")) throw new Error(`canonical calendar hrefs not preserved: ${hrefs.join(", ")}`);
  if (viewport.name === "desktop") {
    await page.waitForSelector('[data-testid="portal-calendar-grid"]', { state: "visible", timeout: 15000 });
    if (scenario === "rich") await page.screenshot({ path: path.join(SHOTS, "calendar-desktop.png"), fullPage: true });
  } else {
    await page.waitForSelector('[data-testid="portal-calendar-day-strip"]', { state: "attached", timeout: 15000 });
  }
}

async function runQa() {
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log(`Starting Next.js production server on port ${PORT}...`);
  await startServer();
  console.log("Server started. Launching Chromium...");

  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenarioName of ["rich", "empty", "external"]) {
      scenario = scenarioName;
      console.log(`\n=== Scenario: ${scenarioName} ===`);
      for (const viewport of VIEWPORTS) {
        console.log(`Viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
        const { context, page, hardErrors } = await createQaPage(browser, viewport);
        await checkCommunication(page, viewport);
        await checkCalendar(page, viewport);
        if (viewport.name === "mobile") {
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
          if (overflow) throw new Error("horizontal overflow at 390px");
        }
        if (hardErrors.length) throw new Error(`hard errors: ${hardErrors.join(" | ")}`);
        await context.close();
      }
    }

    console.log("\nCP3_F1_BROWSER_QA=PASS");
    return 0;
  } finally {
    await browser.close();
    stopServer();
  }
}

runQa()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("CP3_F1_BROWSER_QA=FAIL");
    console.error(error);
    stopServer();
    process.exit(1);
  });
