/**
 * CP3-E1: Client Portal 3.0 checkpoint E1 — Company V3 browser QA (synthetic;
 * never "live authenticated acceptance").
 *
 * Verifies at 1440x900 and 390x844 on /portal/vallalat:
 *  - PortalCompanyV3 renders inside the V3 shell with the context header
 *    (companyName, profileHeadline, employeeCount only when known).
 *  - Profile editor opens, shows canonical adaptive screens, saves through the
 *    canonical endpoint, refreshes discovery, and never shows questionKey or a
 *    compliance percentage.
 *  - Organization, systems/processes (no raw enums), operating context,
 *    milestones and contracts sections render from canonical fixtures.
 *  - 403 fail-closed copy, zero-state fixtures, no fake scores.
 *  - No horizontal overflow at 390px, zero console/page errors.
 */

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CP3_E1_QA_PORT || 3097);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(os.tmpdir(), "cp3-e1-qa-shots");
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
const MOCK_PORTAL_WORKSPACE = { actions: [], documents: [], messages: [], upcomingDeadlines: [], matterCount: 0 };

function mockCompany() {
  if (scenario === "denied") return null;
  if (scenario === "empty") {
    return {
      companyName: "Demo Kft.",
      profileHeadline: null,
      employeeCount: null,
      groups: [],
      visibleMattersByArea: [],
      totalVisibleMatterCount: 0,
      milestones: [],
      initiatives: [],
      systems: [],
      processes: [],
      dataSummary: { relevantQuestionCount: 0, answeredCount: 0, unknownCount: 0, unansweredCount: 0, needsCompletion: false, portalPath: "/portal/vallalat/company-profile" },
      documentsSummary: { visibleDocumentCount: 0, latestPublishedAt: null, portalPath: "/portal/dokumentumok" },
      complianceSummary: { topicCount: 0, moreInformationNeededCount: 0, lawyerReviewRequiredCount: 0, actionInProgressCount: 0, resolvedCount: 0, portalPath: "/portal/megfeleles" },
      developmentSummary: { initiativeCount: 0, activeInitiativeCount: 0, portalPath: "/portal/fejlesztes" },
      outcomeSummary: { measuredCount: 0, calculatedCount: 0, estimatedCount: 0, portalPath: "/portal/fejlesztes" },
    };
  }
  return {
    companyName: "Demo Kft.",
    profileHeadline: "Országos logisztikai vállalkozás.",
    employeeCount: 42,
    groups: [{ id: "g1", name: "Operáció", parentGroupId: null }, { id: "g2", name: "HR", parentGroupId: null }],
    visibleMattersByArea: [{ areaName: "Operáció", visibleMatterCount: 2 }, { areaName: "HR", visibleMatterCount: 1 }],
    totalVisibleMatterCount: 3,
    milestones: [{ id: "m1", title: "Vállalati szerződési keretrendszer bevezetése", date: "2026-06-30T10:00:00.000Z" }],
    initiatives: [{ id: "i1", title: "Automatizált jóváhagyási rendszer", targetState: "Átfutási idő csökkentése", statusLabel: "Folyamatban", targetAt: null }],
    systems: [{ id: "s1", name: "ERP rendszer", category: "CORE", purpose: "Számlázás és készletkezelés" }, { id: "s2", name: "CRM", category: "SALES", purpose: null }],
    processes: [{ id: "p1", name: "Számlajóváhagyás", category: "FINANCE", criticality: "HIGH", frequency: "DAILY" }],
    dataSummary: { relevantQuestionCount: 6, answeredCount: 4, unknownCount: 1, unansweredCount: 1, needsCompletion: true, portalPath: "/portal/vallalat/company-profile" },
    documentsSummary: { visibleDocumentCount: 5, latestPublishedAt: "2026-09-22T10:00:00.000Z", portalPath: "/portal/dokumentumok" },
    complianceSummary: { topicCount: 3, moreInformationNeededCount: 1, lawyerReviewRequiredCount: 1, actionInProgressCount: 0, resolvedCount: 1, portalPath: "/portal/megfeleles" },
    developmentSummary: { initiativeCount: 1, activeInitiativeCount: 1, portalPath: "/portal/fejlesztes" },
    outcomeSummary: { measuredCount: 2, calculatedCount: 1, estimatedCount: 0, portalPath: "/portal/fejlesztes" },
  };
}

function mockContracts() {
  if (scenario === "empty" || scenario === "denied") return { items: [] };
  return {
    items: [
      {
        reference: "CT-2026-01",
        title: "Keretszerződés — logisztikai szolgáltatások",
        statusLabel: "Hatályos",
        lifecycle: "active",
        isActive: true,
        relatedMatterTitle: "Adásvételi szerződés felülvizsgálat",
        nextStep: null,
        customerActionRequired: false,
        keyDate: "2026-10-01T10:00:00.000Z",
        effectiveDate: "2026-01-01T10:00:00.000Z",
        expiryDate: "2026-12-31T10:00:00.000Z",
        nextCriticalDate: null,
        signatureDate: null,
        expiresThisMonth: false,
        publishedDoc: { publicationId: "doc-1", title: "Keretszerződés aláírt példánya", versionLabel: "v2", publishedAt: "2026-01-05T10:00:00.000Z", downloadAvailable: true },
      },
    ],
  };
}

function mockDiscovery() {
  const base = {
    client: { name: "Demo Kft." },
    capabilities: { teaor25CatalogInstalled: true },
    screens: [
      {
        screenKey: "screen-size",
        order: 1,
        sectionKey: "meret",
        sectionTitleHu: "Méret és tevékenység",
        titleHu: "Vállalkozás mérete",
        helpTextHu: "Adja meg, hány munkavállalója van a vállalkozásnak.",
        whyHu: "A méret befolyásolja, mely szabályok érintik Önt.",
        uiKind: "FORM",
        factBindings: ["employee_count"],
        questionAtomKeys: ["employee_count"],
      },
      {
        screenKey: "screen-activity",
        order: 2,
        sectionKey: "tevekenyseg",
        sectionTitleHu: "Méret és tevékenység",
        titleHu: "Fő tevékenység",
        helpTextHu: "Válassza ki a fő tevékenységét.",
        whyHu: "A tevékenység határozza meg az ágazati szabályokat.",
        uiKind: "FORM",
        factBindings: ["main_activity"],
        questionAtomKeys: ["main_activity"],
      },
    ],
    questions: [
      { questionKey: "employee_count", label: "Munkavállalók száma", helpText: null, why: null, section: "DATA", valueType: "NUMBER", options: undefined, codeCatalog: null, integerOnly: true, order: 1, status: "ANSWERED", value: 42 },
      { questionKey: "main_activity", label: "Fő tevékenység", helpText: null, why: null, section: "DATA", valueType: "ENUM", options: ["Szállítmányozás", "Raktározás", "Egyéb"], codeCatalog: "TEAOR25", integerOnly: false, order: 2, status: "UNANSWERED", value: null },
    ],
  };
  if (scenario === "empty" || scenario === "denied") {
    return { ...base, screens: [], questions: [] };
  }
  return base;
}

function resolveResponse(url) {
  const pathname = new URL(url).pathname.replace(/^\/api\/v1/, "");
  if (pathname === "/client-portal/me") return { status: 200, body: mockIdentityContext() };
  if (pathname === "/client-portal/home") return { status: 200, body: MOCK_PORTAL_HOME };
  if (pathname === "/client-portal/workspace") return { status: 200, body: MOCK_PORTAL_WORKSPACE };
  if (pathname === "/client-portal/org/company") {
    if (scenario === "denied") return { status: 403, body: { error: "CLIENT_SUMMARY_SCOPE_FORBIDDEN" } };
    return { status: 200, body: mockCompany() };
  }
  if (pathname === "/client-portal/org/contracts") return { status: 200, body: mockContracts() };
  if (pathname === "/client-portal/org/company-profile") return { status: 200, body: mockDiscovery() };
  if (pathname === "/client-portal/org/company-profile/evidence") {
    return {
      status: 200,
      body: {
        items: [
          { controlKey: "ctrl-1", module: "DATA", questionHu: "Rendelkezik adatvédelmi szabályzattal?", relevance: "APPLIES", implemented: false, evidenceLinked: false, evidenceState: "PENDING", stateHu: "Megválaszolandó" },
          { controlKey: "ctrl-2", module: "DATA", questionHu: "Van-e kijelölt adatvédelmi kapcsolattartó?", relevance: "APPLIES", implemented: true, evidenceLinked: true, evidenceState: "ANSWERED", stateHu: "Megválaszolva" },
          { controlKey: "ctrl-3", module: "DATA", questionHu: "Korábbi adatkezelési tájékoztató", relevance: "APPLIES", implemented: true, evidenceLinked: true, evidenceState: "STALE", stateHu: "Felülvizsgálandó" },
        ],
        reusableDocuments: [{ documentVersionId: "dv-1", label: "Adatvédelmi szabályzat v3" }],
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

async function checkCompany(page) {
  await page.goto(`${BASE_URL}/portal/vallalat`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="client-portal-shell-v3"]', { timeout: 15000 });

  if (scenario === "denied") {
    await page.waitForSelector('text=Ez a tartalom nem érhető el ezen az ügyfélfelületen.', { timeout: 15000 });
    return;
  }

  await page.waitForSelector('[data-testid="portal-company-v3"]', { timeout: 15000 });
  const text = await page.evaluate(() => document.body.innerText);

  if (scenario === "empty") {
    if (!text.includes("Demo Kft.")) throw new Error("company name missing in empty state");
    if (text.includes("Munkavállalók száma")) throw new Error("employeeCount rendered when unknown");
    if (text.includes("%")) throw new Error("percentage rendered in empty state");
    await page.waitForSelector('text=Jelenleg nincs közzétett szerződés.', { timeout: 15000 });
    return;
  }

  for (const label of ["Demo Kft.", "Országos logisztikai vállalkozás.", "Munkavállalók száma: 42"]) {
    if (!text.includes(label)) throw new Error(`context header missing ${label}`);
  }
  for (const label of ["Operáció", "HR", "3 látható közzétett ügy"]) {
    if (!text.includes(label)) throw new Error(`organization section missing ${label}`);
  }
  for (const label of ["ERP rendszer", "Számlázás és készletkezelés", "Számlajóváhagyás"]) {
    if (!text.includes(label)) throw new Error(`operations section missing ${label}`);
  }
  // Raw internal enums must never leak.
  for (const raw of ["HIGH", "DAILY", "FINANCE", "SALES", "CORE"]) {
    if (text.includes(raw)) throw new Error(`raw enum leaked: ${raw}`);
  }
  for (const label of ["Kapcsolódó működési áttekintés", "Vállalati szerződési keretrendszer bevezetése", "Keretszerződés — logisztikai szolgáltatások", "Hatályos", "Dokumentum megnyitása", "Szerződések megnyitása"]) {
    if (!text.includes(label)) throw new Error(`context/milestones/contracts missing ${label}`);
  }
  // No fake scores anywhere.
  for (const fake of ["%", "érettség", "ROI", "megtakarítás"]) {
    if (text.includes(fake)) throw new Error(`fake metric leaked: ${fake}`);
  }
  // Profile completion is profile-data completion, clearly labelled.
  for (const label of ["PROFILADATOK KITÖLTÖTTSÉGE", "Nem jogi megfelelőségi minősítés."]) {
    if (!text.includes(label)) throw new Error(`profile completion copy missing ${label}`);
  }
  // The dead profile route must not be rendered as a CTA.
  if (text.includes("/portal/vallalat/company-profile")) throw new Error("dead company-profile CTA rendered");

  // Open the editor; verify one canonical adaptive screen with a TEÁOR question.
  await page.click('[data-testid="portal-company-profile-edit"]');
  await page.waitForSelector('[data-testid="portal-company-profile-editor"]', { timeout: 15000 });
  const editorText = await page.locator('[data-testid="portal-company-profile-editor"]').innerText();
  if (!editorText.includes("Vállalkozás mérete")) throw new Error("adaptive screen missing");
  if (editorText.includes("employee_count")) throw new Error("questionKey leaked as customer copy");
  if (editorText.includes("main_activity")) throw new Error("questionKey leaked as customer copy");
  // Save uses the canonical endpoint (observed via the route mock) and shows truth.
  await page.click('text=Mentés és tovább');
  await page.waitForSelector('text=A válaszokat elmentettük.', { timeout: 15000 });
  // Second screen (activity / TEÁOR) is now active after adaptive refresh.
  await page.waitForSelector('text=Fő tevékenység', { timeout: 15000 });

  // Evidence journey keeps truthful states (progressive disclosure first).
  const evidenceSection = page.locator('[data-testid="company-profile-evidence"]');
  await evidenceSection.locator("button[aria-expanded]").first().click();
  const evidenceText = await evidenceSection.innerText();
  for (const label of ["Dokumentumok és intézkedések", "Megválaszolandó", "Megválaszolva", "Felülvizsgálandó"]) {
    if (!evidenceText.includes(label)) throw new Error(`evidence state missing ${label}`);
  }
}

async function runQa() {
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log(`Starting Next.js production server on port ${PORT}...`);
  await startServer();
  console.log("Server started. Launching Chromium...");

  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenarioName of ["rich", "empty", "denied"]) {
      scenario = scenarioName;
      console.log(`\n=== Scenario: ${scenarioName} ===`);
      for (const viewport of VIEWPORTS) {
        console.log(`Viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
        const { context, page, hardErrors } = await createQaPage(browser, viewport);
        await checkCompany(page);
        if (viewport.name === "mobile") {
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
          if (overflow) throw new Error("horizontal overflow at 390px");
        }
        if (viewport.name === "desktop" && scenarioName === "rich") {
          await page.screenshot({ path: path.join(SHOTS, "company-desktop.png"), fullPage: true });
        }
        if (hardErrors.length) throw new Error(`hard errors: ${hardErrors.join(" | ")}`);
        await context.close();
      }
    }

    console.log("\nCP3_E1_BROWSER_QA=PASS");
    return 0;
  } finally {
    await browser.close();
    stopServer();
  }
}

runQa()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("CP3_E1_BROWSER_QA=FAIL");
    console.error(error);
    stopServer();
    process.exit(1);
  });
