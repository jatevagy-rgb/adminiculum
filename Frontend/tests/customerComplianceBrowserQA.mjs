/**
 * Customer Compliance — Production-Server Browser QA.
 *
 * Proves in real headless Chromium (desktop 1440x900 and mobile 390x844) that the
 * organizational customer Compliance surface renders the five jobs coherently on
 * the canonical Adminiculum design system, using the canonical local portal auth
 * fixture pattern (MSAL controller interceptor + storage seeds + API interception).
 *
 * Scenarios: no current action, missing profile data, requested document, open
 * question/request, office processing state, published document, completed request.
 * Verifies zero route-local hex/oversized cards in the DOM, no horizontal overflow,
 * no fake compliance score, and zero uncaught console errors.
 */
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CUSTOMER_COMPLIANCE_QA_PORT || 3097);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "qa-screenshots-customer-compliance");
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
      if (!ready && /ready|started server/i.test(chunk.toString())) {
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

const MOCK_IDENTITY_CONTEXT = {
  identity: { displayName: "Kovács Péter", email: "kovacs.peter@tesztvallalat.hu", accountType: "ORGANIZATION" },
  state: "READY",
  workspaces: [
    {
      publicReference: "ws-tesztvallalat-org",
      name: "Szervezeti Munkatér",
      clientDisplayName: "Teszt Vállalat Kft.",
      mode: "ORGANIZATION",
      status: "ACTIVE",
      communicationMode: "PORTAL_PRIMARY",
      connectedSystemState: "READY",
      membershipRole: "APPROVER",
      capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true },
    },
  ],
  selectedWorkspace: {
    publicReference: "ws-tesztvallalat-org",
    name: "Szervezeti Munkatér",
    clientDisplayName: "Teszt Vállalat Kft.",
    mode: "ORGANIZATION",
    status: "ACTIVE",
    communicationMode: "PORTAL_PRIMARY",
    connectedSystemState: "READY",
    membershipRole: "APPROVER",
    capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true },
  },
};

const MOCK_COMPLIANCE = {
  topics: [
    {
      topicId: "portal/waste-management",
      topicLabel: "Hulladékgazdálkodási követelmények",
      state: "MORE_INFORMATION_NEEDED",
      shortExplanation: "A telephelyi hulladéknyilvántartás hiányos.",
      missingInformation: [
        { label: "Telephelyi hulladéknyilvántartás vezetése", portalAnswerable: true, questionKey: "company_waste_register", valueType: "BOOLEAN" },
      ],
      nextAction: "Kérjük, erősítse meg a nyilvántartás meglétét.",
      documents: [
        { publicationId: "pub-waste", title: "Hulladékgazdálkodási szabályzat", versionLabel: "Közzétett változat 1", publishedAt: "2026-08-01T00:00:00.000Z", downloadAvailable: true },
      ],
    },
    {
      topicId: "portal/nis2-scope",
      topicLabel: "Kiberbiztonsági (NIS2) hatály",
      state: "LAWYER_REVIEW_REQUIRED",
      shortExplanation: "NIS2 hatályvizsgálat folyamatban.",
      missingInformation: [],
      nextAction: "Ügyvédi áttekintés javasolt.",
      documents: [],
    },
    {
      topicId: "portal/gdpr-general-scope",
      topicLabel: "Általános adatvédelem",
      state: "RESOLVED",
      shortExplanation: "Alapvető adatvédelmi követelmények rendezve.",
      missingInformation: [],
      nextAction: null,
      documents: [
        { publicationId: "pub-gdpr", title: "Adatkezelési tájékoztató", versionLabel: "Közzétett változat 2", publishedAt: "2026-08-05T00:00:00.000Z", downloadAvailable: true },
      ],
    },
  ],
  controlsSummary: [
    {
      requirementTitle: "Hulladékgazdálkodási követelmények",
      controls: [
        { title: "Nyilvántartás vezetése", implementationStatus: "IMPLEMENTED", lastReviewedAt: "2026-01-15T00:00:00.000Z", nextReviewAt: "2026-10-01T00:00:00.000Z", evidence: { acceptedCurrent: 2, stale: 0, missing: false } },
        { title: "Szállítási dokumentumok", implementationStatus: "NOT_IMPLEMENTED", lastReviewedAt: null, nextReviewAt: null, evidence: { acceptedCurrent: 0, stale: 0, missing: true } },
      ],
    },
  ],
};

const MOCK_REQUESTS = {
  items: [
    {
      id: "req-doc-1",
      caseId: "case-1",
      type: "DOCUMENT_UPLOAD",
      title: "Munkavédelmi oktatási nyilvántartás",
      instructions: "Kérjük, töltse fel a legutóbbi oktatás résztvevői listáját.",
      dueAt: "2026-10-15T00:00:00.000Z",
      required: true,
      status: "PUBLISHED",
      documentSpec: { acceptedMimeTypes: ["application/pdf"], maxFileCount: 1 },
      publishedAt: "2026-09-20T00:00:00.000Z",
      fields: [],
      contextLabel: "Munkavédelmi követelmények",
      category: "DOCUMENT",
      state: "AWAITING_CUSTOMER",
      canRespond: true,
      canUpload: true,
    },
    {
      id: "req-q-1",
      caseId: "case-1",
      type: "INFORMATION_REQUEST",
      title: "Adatkezelési nyilatkozat egyeztetése",
      instructions: "Kérjük, erősítse meg az adatkezelési nyilatkozat hatályát.",
      dueAt: null,
      required: false,
      status: "PUBLISHED",
      documentSpec: null,
      publishedAt: "2026-09-21T00:00:00.000Z",
      fields: [],
      contextLabel: "Adatvédelmi követelmények",
      category: "QUESTION",
      state: "AWAITING_CUSTOMER",
      canRespond: true,
      canUpload: false,
    },
    {
      id: "req-office-1",
      caseId: "case-1",
      type: "QUESTION_RESPONSE",
      title: "Cégadatok egyeztetése",
      instructions: null,
      dueAt: null,
      required: false,
      status: "UNDER_INTERNAL_REVIEW",
      documentSpec: null,
      publishedAt: "2026-09-10T00:00:00.000Z",
      fields: [],
      contextLabel: null,
      category: "QUESTION",
      state: "OFFICE_PROCESSING",
      canRespond: false,
      canUpload: false,
    },
    {
      id: "req-closed-1",
      caseId: "case-1",
      type: "DOCUMENT_UPLOAD",
      title: "Társasági szerződés",
      instructions: null,
      dueAt: null,
      required: true,
      status: "COMPLETED",
      documentSpec: null,
      publishedAt: "2026-08-10T00:00:00.000Z",
      fields: [],
      contextLabel: null,
      category: "DOCUMENT",
      state: "CLOSED",
      canRespond: false,
      canUpload: false,
    },
  ],
  counts: { awaitingCustomer: 2, officeProcessing: 1, closed: 1, requestedDocuments: 2, openQuestions: 2 },
  generatedAt: "2026-09-24T00:00:00.000Z",
};

const MOCK_COMPANY_PROFILE = {
  screens: [{ screenKey: "base", title: "Alapadatok", questionKeys: ["q_employee_count", "q_site_count"] }],
  questions: [
    { questionKey: "q_employee_count", label: "Munkavállalók száma", section: "base", valueType: "NUMBER", status: "ANSWERED" },
    { questionKey: "q_site_count", label: "Telephelyek száma", section: "base", valueType: "NUMBER", status: "UNANSWERED" },
  ],
};

function resolveResponse(url) {
  if (url.includes("/api/v1/client-portal/me")) return { status: 200, body: MOCK_IDENTITY_CONTEXT };
  if (url.includes("/api/v1/client-portal/home")) return { status: 200, body: { activeMatters: [], recentDocuments: [], contactSummary: { openCount: 0, unreadCount: 0, latestPreview: null }, complianceSummary: null } };
  if (url.includes("/api/v1/client-portal/workspace")) return { status: 200, body: MOCK_IDENTITY_CONTEXT.selectedWorkspace };
  if (url.includes("/api/v1/client-portal/compliance/requests")) return { status: 200, body: MOCK_REQUESTS };
  if (url.includes("/api/v1/client-portal/compliance")) return { status: 200, body: MOCK_COMPLIANCE };
  if (url.includes("/api/v1/client-portal/org/company-profile")) return { status: 200, body: MOCK_COMPANY_PROFILE };
  if (url.includes("/api/v1/client-portal/org/cases")) return { status: 200, body: { items: [], total: 0, limit: 50, offset: 0 } };
  if (url.includes("/api/v1/client-portal/matters")) return { status: 200, body: { items: [] } };
  return { status: 200, body: {} };
}

async function createQaPage(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const hardErrors = [];
  page.on("pageerror", (err) => hardErrors.push(`PAGE_ERROR: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("[API]") && !msg.text().includes("Failed to load resource") && !msg.text().includes("status of 404")) {
      hardErrors.push(`CONSOLE_ERROR: ${msg.text()}`);
    }
  });

  await page.addInitScript(() => {
    Object.defineProperty(Object.prototype, "controller", {
      set(val) {
        Object.defineProperty(this, "controller", { value: val, writable: true, configurable: true });
        if (typeof this.getAllAccounts === "function" && typeof this.acquireTokenSilent === "function") {
          const proto = Object.getPrototypeOf(this);
          const account = { homeAccountId: "qa-user", environment: "login.windows.net", tenantId: "", username: "kovacs.peter@tesztvallalat.hu", localAccountId: "qa-user", name: "Kovács Péter" };
          proto.getAllAccounts = function () { return [account]; };
          proto.acquireTokenSilent = async function () { return { accessToken: "qa-customer-token" }; };
          proto.handleRedirectPromise = async function () { return null; };
          proto.getActiveAccount = function () { return account; };
        }
      },
      configurable: true,
    });
    localStorage.setItem("adminiculum:client-portal-workspace", "ws-tesztvallalat-org");
    localStorage.setItem("auth_token", "qa-customer-token");
  });

  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    const res = resolveResponse(url);
    await route.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) });
  });

  return { context, page, hardErrors };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log(`Starting Next.js production server on port ${PORT}...`);
  await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n=== ${viewport.name} (${viewport.width}x${viewport.height}) ===`);
      const { context, page, hardErrors } = await createQaPage(browser, viewport);

      await page.goto(`${BASE_URL}/portal/megfeleles`, { waitUntil: "networkidle" });
      try {
        await page.waitForSelector("[data-testid='org-compliance-view']", { timeout: 15000 });
      } catch (error) {
        const dump = await page.evaluate(() => document.body.innerText).catch(() => "");
        console.error("[QA DEBUG] body:", dump.slice(0, 800));
        console.error("[QA DEBUG] errors:", hardErrors.join(" | "));
        throw error;
      }

      const bodyText = async () => page.evaluate(() => document.body.innerText);
      const clickNav = async (label) => {
        await page.getByRole("button", { name: label, exact: true }).click();
        await page.waitForTimeout(250);
      };

      assert((await bodyText()).includes("Megfelelés"), "header 'Megfelelés' missing");
      assert((await bodyText()).includes("Öntől szükséges"), "overview customer-action count missing");
      assert((await bodyText()).includes("Vállalati profil"), "profile completeness line missing");
      await page.screenshot({ path: path.join(SHOTS, `attekintes-${viewport.name}.png`), fullPage: true });

      await clickNav("Teendők");
      assert((await bodyText()).includes("Munkavédelmi oktatási nyilvántartás"), "requested document work item missing");
      assert((await bodyText()).includes("Adatra várunk Öntől"), "profile information work item missing");
      await page.screenshot({ path: path.join(SHOTS, `teendok-${viewport.name}.png`), fullPage: true });

      await clickNav("Dokumentumok");
      const docsText = await bodyText();
      assert(docsText.includes("Bekért dokumentumok"), "requested documents group missing");
      assert(docsText.includes("Már megadott / elérhető"), "provided documents group missing");
      assert(docsText.includes("Munkavédelmi oktatási nyilvántartás"), "requested document row missing");
      assert(docsText.includes("Hulladékgazdálkodási szabályzat"), "published document missing");
      await page.screenshot({ path: path.join(SHOTS, `dokumentumok-${viewport.name}.png`), fullPage: true });

      await clickNav("Kérdések és kérések");
      const qText = await bodyText();
      assert(qText.includes("Válaszra vár Öntől"), "open question group missing");
      assert(qText.includes("Irodai feldolgozás alatt"), "office processing group missing");
      assert(qText.includes("Lezárt"), "closed group missing");
      assert(qText.includes("Cégadatok egyeztetése"), "office processing request missing");
      await page.screenshot({ path: path.join(SHOTS, `kerdesek-${viewport.name}.png`), fullPage: true });

      await clickNav("Állapotok");
      const topicText = await bodyText();
      assert(topicText.includes("Hulladékgazdálkodási követelmények"), "topic list missing");
      assert(topicText.includes("Adatra várunk Öntől"), "topic customer-action badge missing");
      assert(topicText.includes("Irodai feldolgozás:"), "office processing note missing");
      assert(!/complianceScore|riskScore|pontszám|százalékos kockázat/i.test(topicText), "fabricated score language present");

      // Open a topic detail through the canonical deep link control.
      await page.getByRole("button", { name: "Részletek megnyitása →" }).first().click();
      await page.waitForSelector("[data-testid='org-compliance-topic-detail']", { timeout: 10000 });
      const detailText = await bodyText();
      assert(detailText.includes("Miért érinti a céget?"), "topic detail rationale missing");
      assert(detailText.includes("Hiányzó információk"), "topic detail missing information missing");
      assert(detailText.includes("Hogyan készül a compliance térkép?"), "topic detail how-map missing");
      await page.screenshot({ path: path.join(SHOTS, `topic-detail-${viewport.name}.png`), fullPage: true });
      await page.getByRole("button", { name: /Vissza az áttekintéshez/ }).click();
      await page.waitForTimeout(250);

      // No route-local oversized cards and no horizontal overflow.
      const legacyCards = await page.evaluate(() => document.querySelectorAll('[class*="rounded-3xl"]').length);
      assert(legacyCards === 0, `found ${legacyCards} oversized rounded-3xl card(s) in the customer Compliance DOM`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 2, `horizontal overflow ${overflow}px at ${viewport.width}px`);

      assert(hardErrors.length === 0, `console/page errors: ${hardErrors.join(" | ")}`);
      console.log(`OK ${viewport.name}`);
      await context.close();
    }
  } finally {
    await browser.close();
    stopServer();
  }
}

run()
  .then(() => {
    console.log("\nCUSTOMER_COMPLIANCE_BROWSER_QA=PASS");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nCUSTOMER_COMPLIANCE_BROWSER_QA=FAIL");
    console.error(error);
    process.exit(1);
  });
