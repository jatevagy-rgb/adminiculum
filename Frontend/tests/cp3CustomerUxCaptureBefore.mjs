import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3099;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS_DIR = "C:\\Users\\drHUBAYGyulaMáté\\.gemini\\antigravity\\brain\\9ba49e77-edda-4518-8d6f-2d5538765c83\\cp3_ux_evidence\\screenshots";

let devServer;

function startDevServer() {
  return new Promise((resolve, reject) => {
    console.log("Starting Next.js dev server on port " + PORT + "...");
    devServer = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "-p", String(PORT)], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        NEXT_PUBLIC_ENTRA_CLIENT_ID: "qa-synthetic-client",
        NEXT_PUBLIC_ENTRA_AUTHORITY: "https://qa.ciamlogin.com/qa",
        NEXT_PUBLIC_ENTRA_REDIRECT_URI: `http://127.0.0.1:${PORT}/portal`,
        NEXT_PUBLIC_ADMINICULUM_API_SCOPE: "api://qa-synthetic/access_as_client",
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    devServer.stdout?.on("data", (chunk) => process.stdout.write(chunk));
    devServer.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    devServer.on("error", reject);

    const startTime = Date.now();
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}`);
        if (res.status) {
          clearInterval(interval);
          console.log("\nNext dev server is responsive at " + BASE_URL);
          resolve();
        }
      } catch {
        if (Date.now() - startTime > 45000) {
          clearInterval(interval);
          reject(new Error("Timeout waiting for Next dev server"));
        }
      }
    }, 1000);
  });
}

function stopDevServer() {
  if (!devServer) return;
  console.log("Stopping Next.js dev server...");
  try {
    if (process.platform === "win32" && devServer.pid) {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(devServer.pid)], { stdio: "ignore" });
    } else {
      devServer.kill("SIGKILL");
    }
  } catch (err) {
    console.error("Error stopping dev server:", err);
  }
  devServer = undefined;
}

const CASE_ROW = {
  publicReference: "PER-2026-042",
  matterPublicationId: "mp-demo-1",
  publicTitle: "Kereskedelmi megállapodás véleményezése",
  organizationUnitName: "Kereskedelem és Jog",
  relationshipToCase: "OWN",
  publicStatus: "Ügyféli jóváhagyásra vár",
  waitingOn: "Ügyfél nyilatkozata",
  nextStep: "Kérjük a módosított 4.2 záradék jóváhagyását",
  publicTargetDate: "2026-10-15T12:00:00.000Z",
  customerActionRequired: true,
  lastPublishedUpdateAt: "2026-10-01T08:00:00.000Z",
};

const CASE_ROW_2 = {
  publicReference: "SZERZ-2026-018",
  matterPublicationId: "mp-demo-2",
  publicTitle: "Ingatlanbérleti szerződés felülvizsgálata",
  organizationUnitName: "Ingatlanjog",
  relationshipToCase: "OWN",
  publicStatus: "Irodai tervezet készítése",
  waitingOn: "Irodai ügyintéző",
  nextStep: "Bérleti feltételek jogi összevetése",
  publicTargetDate: "2026-10-28T12:00:00.000Z",
  customerActionRequired: false,
  lastPublishedUpdateAt: "2026-09-28T14:30:00.000Z",
};

const ACTION_ITEMS = [
  {
    id: "act-1",
    title: "Cégkivonat és aláírási címpéldány feltöltése",
    contextLabel: "Kereskedelmi megállapodás · PER-2026-042",
    actionLabel: "Feltöltés megnyitása",
    href: "/portal/matters/mp-demo-1/requests/req-01",
    urgency: "OVERDUE",
    state: "CORRECTION_REQUIRED",
    dueAt: "2026-09-30T10:00:00.000Z",
    sourceType: "REQUEST",
  },
  {
    id: "act-2",
    title: "Kérdőív: Adatkezelési hozzájárulások pontosítása",
    contextLabel: "GDPR Megfelelés 2026",
    actionLabel: "Kérdések megválaszolása",
    href: "/portal/megfeleles?topic=adatvedelem",
    urgency: "DUE_SOON",
    state: "OPEN",
    dueAt: "2026-10-05T17:00:00.000Z",
    sourceType: "COMPLIANCE_QUESTION",
  },
  {
    id: "act-3",
    title: "Tervezet véglegesítése",
    contextLabel: "SZERZ-2026-018",
    actionLabel: "Megtekintés",
    href: "/portal/matters/mp-demo-2",
    urgency: "NORMAL",
    state: "IN_PROGRESS",
    dueAt: "2026-10-20T12:00:00.000Z",
    sourceType: "MATTER_MILESTONE",
  },
];

function mockIdentityContext() {
  return {
    identity: { displayName: "Kovács Péter vezérigazgató", email: "kovacs.peter@acmeholding.hu", accountType: "ORGANIZATION" },
    state: "READY",
    workspaces: [
      {
        publicReference: "ws-acme-prod",
        name: "Acme Holding Zrt. - Központi Ügyintézés",
        clientDisplayName: "Acme Holding Zrt.",
        mode: "ORGANIZATION",
        status: "ACTIVE",
        communicationMode: "PORTAL_PRIMARY",
        connectedSystemState: "NOT_CONFIGURED",
        membershipRole: "APPROVER",
        capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true },
      },
      {
        publicReference: "ws-acme-sub",
        name: "Acme Logisztika Kft.",
        clientDisplayName: "Acme Logisztika Kft.",
        mode: "ORGANIZATION",
        status: "ACTIVE",
        communicationMode: "PORTAL_PRIMARY",
        connectedSystemState: "NOT_CONFIGURED",
        membershipRole: "VIEWER",
        capabilities: { home: true, matters: true, tasks: true, documents: true, messages: false },
      },
    ],
    selectedWorkspace: {
      publicReference: "ws-acme-prod",
      name: "Acme Holding Zrt. - Központi Ügyintézés",
      clientDisplayName: "Acme Holding Zrt.",
      mode: "ORGANIZATION",
      status: "ACTIVE",
      communicationMode: "PORTAL_PRIMARY",
      connectedSystemState: "NOT_CONFIGURED",
      membershipRole: "APPROVER",
      capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true },
    },
  };
}

function resolveMockResponse(url, scenario = "normal") {
  const pathname = new URL(url).pathname.replace(/^\/api\/v1/, "");
  if (pathname === "/client-portal/me") return { status: 200, body: mockIdentityContext() };
  if (pathname === "/client-portal/org/action-center") {
    if (scenario === "empty") return { status: 200, body: { items: [], counts: { open: 0, overdue: 0, dueSoon: 0 } } };
    if (scenario === "error") return { status: 500, body: { error: "Failed to load actions" } };
    return { status: 200, body: { items: ACTION_ITEMS, counts: { open: 3, overdue: 1, dueSoon: 1 } } };
  }
  if (pathname === "/client-portal/org/home") {
    if (scenario === "error") return { status: 500, body: { error: "Failed to load home" } };
    return {
      status: 200,
      body: {
        customer: { name: "Acme Holding Zrt." },
        matters: scenario === "empty" ? [] : [CASE_ROW, CASE_ROW_2],
        actions: scenario === "empty" ? [] : ACTION_ITEMS,
        recentDocuments: scenario === "empty" ? [] : [
          {
            id: "doc-1",
            title: "Kereskedelmi Megállapodás Tervezet v2.4.pdf",
            matterTitle: "Kereskedelmi megállapodás véleményezése",
            publishedAt: "2026-10-01T09:15:00.000Z",
          },
          {
            id: "doc-2",
            title: "Társasági Szerződés Módosítás Kivonat.pdf",
            matterTitle: "Cégjogi aktualizálás",
            publishedAt: "2026-09-29T16:00:00.000Z",
          },
        ],
        contactSummary: { openCount: 1, unreadCount: 0, latestPreview: null, latestUpdatedAt: null },
        growSummary: {
          activeInitiativesCount: 2,
          initiatives: [
            { id: "init-1", title: "Szerződéskötési automatizáció bevezetése", statusLabel: "Folyamatban - II. mérföldkő" },
            { id: "init-2", title: "Beszerzési megfelelőségi folyamat optimalizálás", statusLabel: "Tervezés alatt" },
          ],
          knownProcessesCount: 4,
        },
        complianceSummary: {
          attentionCount: 1,
          inProgressCount: 2,
          noActionExpectedCount: 5,
          topics: [
            { topicId: "top-1", topicLabel: "Adatvédelem és GDPR audit", nextAction: "Ügyfél általi kérdőív kitöltése esedékes" },
            { topicId: "top-2", topicLabel: "Munkavédelmi és Munkaügyi Megfelelés", nextAction: "Irodai felülvizsgálat folyamatban" },
          ],
        },
      },
    };
  }
  if (pathname === "/client-portal/home") return { status: 200, body: { portalActionsEnabled: true, access: { state: "READY" } } };
  if (pathname === "/client-portal/workspace") return { status: 200, body: { actions: [], documents: [], messages: [] } };
  if (pathname === "/client-portal/org/cases") return { status: 200, body: { items: [CASE_ROW, CASE_ROW_2], total: 2, limit: 50, offset: 0 } };
  if (pathname === "/client-portal/org/units") return { status: 200, body: { items: [] } };
  if (pathname === "/client-portal/org/company") return { status: 200, body: { companyName: "Acme Holding Zrt.", visibleMattersByArea: [] } };
  if (pathname.startsWith("/client-portal/calendar")) return { status: 200, body: { items: [], counts: { total: 0 } } };
  return { status: 200, body: {} };
}

async function runQa() {
  try {
    await startDevServer();

    const browser = await chromium.launch();

    const viewports = [
      { name: "desktop", width: 1440, height: 900 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
    ];

    async function setupPage(page, scenario = "normal") {
      await page.addInitScript(() => {
        Object.defineProperty(Object.prototype, "controller", {
          set(val) {
            Object.defineProperty(this, "controller", { value: val, writable: true, configurable: true });
            if (typeof this.getAllAccounts === "function" && typeof this.acquireTokenSilent === "function") {
              const proto = Object.getPrototypeOf(this);
              proto.getAllAccounts = () => [{ homeAccountId: "qa-user", username: "kovacs.peter@acmeholding.hu", name: "Kovács Péter" }];
              proto.acquireTokenSilent = async () => ({ accessToken: "qa-token" });
              proto.handleRedirectPromise = async () => null;
              proto.getActiveAccount = () => ({ homeAccountId: "qa-user", username: "kovacs.peter@acmeholding.hu", name: "Kovács Péter" });
            }
          },
          configurable: true,
        });
        localStorage.setItem("adminiculum:client-portal-workspace", "ws-acme-prod");
        localStorage.setItem("auth_token", "qa-token");
      });

      await page.route("**/api/v1/**", async (route) => {
        const url = route.request().url();
        const res = resolveMockResponse(url, scenario);
        await route.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) });
      });
    }

    for (const vp of viewports) {
      console.log(`Capturing BEFORE on viewport ${vp.name} (${vp.width}x${vp.height})...`);
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await setupPage(page, "normal");

      // 1. Normal Home
      console.log("Navigating to /portal...");
      await page.goto(`${BASE_URL}/portal`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForSelector('[data-testid="portal-home-v3"]', { timeout: 60000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SHOTS_DIR, `before_home_${vp.name}.png`), fullPage: true });

      // If desktop, capture account menu open
      if (vp.name === "desktop") {
        await page.click('[data-testid="portal-account-menu-trigger"]');
        await page.waitForSelector('[data-testid="portal-account-menu"]', { state: "visible" });
        await page.screenshot({ path: path.join(SHOTS_DIR, `before_account_menu_desktop.png`) });
      }

      // If mobile, capture Több navigation sheet open
      if (vp.name === "mobile") {
        await page.click('[data-testid="org-portal-more-trigger"]');
        await page.waitForSelector('[role="dialog"]', { state: "visible" });
        await page.screenshot({ path: path.join(SHOTS_DIR, `before_mobile_more_sheet.png`) });
      }

      await context.close();
    }

    // Capture Empty state at desktop & mobile
    for (const vp of [viewports[0], viewports[2]]) {
      console.log(`Capturing BEFORE empty state on ${vp.name}...`);
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await setupPage(page, "empty");
      await page.goto(`${BASE_URL}/portal`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector('[data-testid="portal-home-v3"]', { timeout: 30000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SHOTS_DIR, `before_home_empty_${vp.name}.png`), fullPage: true });
      await context.close();
    }

    // Capture Error state at desktop
    {
      console.log(`Capturing BEFORE error state on desktop...`);
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await setupPage(page, "error");
      await page.goto(`${BASE_URL}/portal`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS_DIR, `before_home_error_desktop.png`), fullPage: true });
      await context.close();
    }

    await browser.close();
    console.log("BEFORE screenshots captured successfully!");
  } finally {
    stopDevServer();
  }
}

runQa().catch((err) => {
  console.error("QA error:", err);
  stopDevServer();
  process.exit(1);
});
