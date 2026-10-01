/**
 * CP3-D: Client Portal 3.0 checkpoint D — Document Library V3 browser QA
 * (synthetic; never "live authenticated acceptance").
 *
 * Verifies at 1440x900 and 390x844:
 *  - /portal/dokumentumok renders PortalDocumentLibraryV3 with Irodától +
 *    Saját beküldések segments; open requests never appear; published rows
 *    link by publicationId; correction rows link the canonical journey.
 *  - /portal/documents/<publicationId> renders PortalDocumentDetailV3 with the
 *    EXACT published version label (V1 stays V1 even when an internal V2
 *    exists) and a download CTA only when downloadAvailable.
 *  - zero-data fixtures, downloadAvailable=false and no legacy double render.
 *  - No horizontal overflow at 390px, zero console/page errors.
 */

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CP3_D_QA_PORT || 3097);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(os.tmpdir(), "cp3-d-qa-shots");
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

function mockIdentityContext() {
  return {
    identity: { displayName: "Demo Kapcsolattartó", email: "demo@demokft.hu", accountType: "ORGANIZATION" },
    state: "READY",
    workspaces: [ws("ws-demo-org")],
    selectedWorkspace: ws("ws-demo-org"),
  };
}

const MOCK_PORTAL_HOME = { portalActionsEnabled: true, relationshipMode: "PORTAL_CENTRIC", access: { state: "READY", grantCount: 1 }, attention: [], matters: [], updates: [] };
const MOCK_PORTAL_WORKSPACE = { actions: [], documents: [], messages: [], upcomingDeadlines: [], matterCount: 1 };

function mockLibrary() {
  if (scenario === "empty") {
    return { published: [], submitted: [] };
  }
  return {
    published: [
      // V1 publication while an internal V2 exists: the library must keep V1.
      { publicationId: "doc-1", title: "Ügyfél-tájékoztató iratcsomag", versionLabel: "v1", publishedAt: "2026-09-22T10:00:00.000Z", matterTitle: "Adásvételi szerződés felülvizsgálat", tags: [], downloadAvailable: true },
      { publicationId: "doc-2", title: "Adatvédelmi szabályzat", versionLabel: "v3", publishedAt: "2026-09-15T10:00:00.000Z", matterTitle: null, tags: ["Compliance"], downloadAvailable: true },
      { publicationId: "doc-3", title: "Archív tájékoztató", versionLabel: "v1", publishedAt: "2026-08-01T10:00:00.000Z", matterTitle: "Munkajogi állásfoglalás", tags: [], downloadAvailable: false },
    ],
    submitted: [
      {
        submissionId: "sub-1",
        requestTitle: "Cégkivonat feltöltése",
        files: [
          { id: "f1", title: "cegkivonat.pdf", statusLabel: "Beérkezett" },
          { id: "f2", title: "alairasi-cimpeldany.pdf", statusLabel: "Feldolgozás alatt" },
        ],
        submittedAt: "2026-09-20T10:00:00.000Z",
        status: "SUBMITTED",
        matterTitle: "Adásvételi szerződés felülvizsgálat",
        matterPublicationId: "mp-1",
        requestId: "r1",
      },
      {
        submissionId: "sub-2",
        requestTitle: "Aláírt melléklet pótlása",
        files: [{ id: "f3", title: "melleklet.pdf", statusLabel: "Beérkezett" }],
        submittedAt: "2026-09-18T10:00:00.000Z",
        status: "CORRECTION_REQUESTED",
        matterTitle: "Bérleti szerződés hosszabbítás",
        matterPublicationId: "mp-2",
        requestId: "r2",
      },
      {
        submissionId: "sub-3",
        requestTitle: "Árajánlat bekérése",
        files: [{ id: "f4", title: "ajanlat.pdf", statusLabel: "Beérkezett" }],
        submittedAt: "2026-09-10T10:00:00.000Z",
        status: "REJECTED",
        matterTitle: "Munkajogi állásfoglalás",
        matterPublicationId: "mp-3",
        requestId: "r3",
      },
    ],
  };
}

function mockDocumentDetail(ref) {
  if (scenario === "empty") return null;
  if (ref === "doc-1") {
    return {
      id: "doc-1",
      matterId: "mp-1",
      matterTitle: "Adásvételi szerződés felülvizsgálat",
      title: "Ügyfél-tájékoztató iratcsomag",
      explanation: "Az ügy aktuális állását összefoglaló közzétett iratcsomag.",
      versionLabel: "v1",
      publishedAt: "2026-09-22T10:00:00.000Z",
      stateLabel: "Közzétéve",
      downloadAvailable: true,
      mimeType: "application/pdf",
      size: 204800,
      clientUploaded: false,
      isCompliancePolicy: false,
    };
  }
  if (ref === "doc-2") {
    return {
      id: "doc-2",
      matterId: null,
      matterTitle: null,
      title: "Adatvédelmi szabályzat",
      explanation: null,
      versionLabel: "v3",
      publishedAt: "2026-09-15T10:00:00.000Z",
      stateLabel: "Közzétéve",
      downloadAvailable: true,
      mimeType: "application/pdf",
      size: 102400,
      clientUploaded: false,
      isCompliancePolicy: true,
    };
  }
  if (ref === "doc-3") {
    return {
      id: "doc-3",
      matterId: null,
      matterTitle: null,
      title: "Archív tájékoztató",
      explanation: null,
      versionLabel: "v1",
      publishedAt: "2026-08-01T10:00:00.000Z",
      stateLabel: "Közzétéve",
      downloadAvailable: false,
      mimeType: null,
      size: null,
      clientUploaded: false,
      isCompliancePolicy: false,
    };
  }
  return null;
}

function resolveResponse(url) {
  const pathname = new URL(url).pathname.replace(/^\/api\/v1/, "");
  if (pathname === "/client-portal/me") return { status: 200, body: mockIdentityContext() };
  if (pathname === "/client-portal/home") return { status: 200, body: MOCK_PORTAL_HOME };
  if (pathname === "/client-portal/workspace") return { status: 200, body: MOCK_PORTAL_WORKSPACE };
  if (pathname === "/client-portal/org/documents") return { status: 200, body: mockLibrary() };
  if (pathname.startsWith("/client-portal/documents/")) {
    const ref = decodeURIComponent(pathname.split("/").pop() || "");
    const detail = mockDocumentDetail(ref);
    return detail ? { status: 200, body: detail } : { status: 404, body: { error: "not_found" } };
  }
  if (pathname === "/client-portal/org/home") {
    return {
      status: 200,
      body: {
        customer: { name: "Demo Kft." },
        matters: [],
        actions: [],
        recentDocuments: [],
        contactSummary: { openCount: 0, unreadCount: 0, latestPreview: null, latestUpdatedAt: null },
        growSummary: { activeInitiativesCount: 0, initiatives: [], knownProcessesCount: 0 },
        complianceSummary: { attentionCount: 0, inProgressCount: 0, noActionExpectedCount: 0, topics: [] },
      },
    };
  }
  if (pathname === "/client-portal/org/action-center") {
    return {
      status: 200,
      body: {
        items: scenario === "empty"
          ? []
          : [
              {
                id: "request-open",
                sourceType: "CLIENT_REQUEST",
                sourceId: "r-open",
                domain: "LEGAL",
                kind: "UPLOAD",
                title: "Nyitott dokumentumkérés (dokumentum feltöltés)",
                contextLabel: "Adásvételi szerződés felülvizsgálat",
                dueAt: null,
                urgency: "NORMAL",
                state: "OPEN",
                actionLabel: "Feltöltés megnyitása",
                href: "/portal/matters/mp-1/requests/r-open",
                canCompleteInPortal: true,
                matterPublicationId: "mp-1",
              },
            ],
        counts: { open: scenario === "empty" ? 0 : 1, overdue: 0, dueSoon: 0 },
      },
    };
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

async function checkLibrary(page) {
  await page.goto(`${BASE_URL}/portal/dokumentumok`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="portal-document-library-v3"]', { timeout: 15000 });

  if (scenario === "empty") {
    await page.waitForSelector('text=Az iroda még nem tett közzé dokumentumot ezen az ügyfélfelületen.', { timeout: 15000 });
    await page.waitForSelector('text=Még nincs beküldött anyaga.', { timeout: 15000 });
    return;
  }

  await page.waitForSelector('[data-testid="portal-document-library-published"]', { timeout: 15000 });
  const publishedText = await page.locator('[data-testid="portal-document-library-published"]').innerText();
  for (const label of ["Irodától", "Ügyfél-tájékoztató iratcsomag", "v1", "Adatvédelmi szabályzat", "Compliance", "3 tétel"]) {
    if (!publishedText.includes(label)) throw new Error(`published segment missing ${label}`);
  }
  // Open requests must never appear anywhere in the document library.
  const bodyText = await page.evaluate(() => document.body.innerText);
  if (bodyText.includes("Nyitott dokumentumkérés")) {
    throw new Error("open request leaked into the document library");
  }
  const submittedText = await page.locator('[data-testid="portal-document-library-submitted"]').innerText();
  for (const label of ["Saját beküldések", "Cégkivonat feltöltése", "Beküldve", "Javítás szükséges", "Nem fogadható el", "Beérkezett", "Feldolgozás alatt"]) {
    if (!submittedText.includes(label)) throw new Error(`submission segment missing ${label}`);
  }
  // Correction row links the canonical request journey.
  const correctionHref = await page.locator('[data-testid="portal-submission-correction-cta"]').first().getAttribute("href");
  if (!correctionHref || !correctionHref.includes("/portal/matters/mp-2/requests/r2")) throw new Error(`unexpected correction href: ${correctionHref}`);
  // Published row links by publicationId.
  const publishedHref = await page.locator('[data-testid="portal-published-document-cta"]').first().getAttribute("href");
  if (!publishedHref || !publishedHref.includes("/portal/documents/doc-1")) throw new Error(`unexpected published href: ${publishedHref}`);
  // downloadAvailable=false rows carry no download affordance.
  const downloadLinks = await page.locator('[data-testid="portal-document-library-published"] a[href*="/download"]').count();
  if (downloadLinks !== 2) throw new Error(`expected 2 download links, got ${downloadLinks}`);
}

async function checkDetail(page) {
  if (scenario === "empty") {
    await page.goto(`${BASE_URL}/portal/documents/missing`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
    await page.waitForSelector('text=Ez a dokumentum nem érhető el ezen az ügyfélfelületen.', { timeout: 15000 });
    return;
  }

  await page.goto(`${BASE_URL}/portal/documents/doc-1`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="portal-document-detail-v3"]', { timeout: 15000 });
  const text = await page.evaluate(() => document.body.innerText);
  if (!text.includes("Ügyfél-tájékoztató iratcsomag")) throw new Error("detail title missing");
  if (!text.includes("Adásvételi szerződés felülvizsgálat")) throw new Error("detail matter context missing");
  const versionLabel = await page.locator('[data-testid="portal-document-version-label"]').innerText();
  if (versionLabel.trim() !== "v1") throw new Error(`EXACT VERSION INVARIANT violated: expected v1, got ${versionLabel.trim()}`);
  if ((await page.locator('[data-testid="portal-document-download-cta"]').count()) !== 1) throw new Error("download CTA missing when downloadAvailable=true");
  // No legacy DocumentView body below the V3 detail.
  if ((await page.locator('[data-testid="client-portal-shell"]').count()) !== 0) throw new Error("legacy shell chrome leaked into ORGANIZATION document view");

  // downloadAvailable=false → no dead CTA.
  await page.goto(`${BASE_URL}/portal/documents/doc-3`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="portal-document-detail-v3"]', { timeout: 15000 });
  if ((await page.locator('[data-testid="portal-document-download-cta"]').count()) !== 0) throw new Error("dead download CTA rendered when downloadAvailable=false");

  // Unpublished/missing publication → fail-closed copy, shell intact.
  await page.goto(`${BASE_URL}/portal/documents/missing`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });
  await page.waitForSelector('text=Ez a dokumentum nem érhető el ezen az ügyfélfelületen.', { timeout: 15000 });
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
        await checkLibrary(page);
        await checkDetail(page);
        if (viewport.name === "mobile") {
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
          if (overflow) throw new Error("horizontal overflow at 390px");
        }
        if (viewport.name === "desktop" && scenarioName === "rich") {
          await page.goto(`${BASE_URL}/portal/dokumentumok`, { waitUntil: "networkidle" });
          await page.waitForSelector('[data-testid="portal-document-library-v3"]');
          await page.screenshot({ path: path.join(SHOTS, "document-library-desktop.png"), fullPage: true });
        }
        if (hardErrors.length) throw new Error(`hard errors: ${hardErrors.join(" | ")}`);
        await context.close();
      }
    }

    console.log("\nCP3_D_BROWSER_QA=PASS");
    return 0;
  } finally {
    await browser.close();
    stopServer();
  }
}

runQa()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("CP3_D_BROWSER_QA=FAIL");
    console.error(error);
    stopServer();
    process.exit(1);
  });
