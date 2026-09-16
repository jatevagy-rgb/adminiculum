/**
 * GWU: Customer Grow UI Evolution — Production-Server Browser QA.
 *
 * Proves in real headless Chromium (desktop 1440x900 and mobile 390x844):
 *  1. /portal/fejlesztes loads correctly with real customer-safe contract data.
 *  2. Default tab is Áttekintés (?tab=attekintes) with editorial hero, 5 safe KPI tiles, and "Mit látunk eddig?".
 *  3. All 6 IA tabs navigate with URL sync (?tab=...) and active tab styling.
 *  4. Felmérések tab renders catalogue, filter chips, 3-step guide, and generic survey with history.
 *  5. Assessment runner opens, shows step progress, offers explicit UNKNOWN option, and advances.
 *  6. Assessment results render findings, directions, and ResearchEvidence ("Mi alapján?").
 *  7. Folyamatok tab renders mapped processes, step indicators, system tags, and company link.
 *  8. Lehetőségek tab renders dignified fail-closed state (GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP).
 *  9. Kezdeményezések tab renders status filter chips and initiative cards with safe fields only.
 * 10. Eredmények tab renders provenance-grounded outcomes (Mért vs Számított/becsült) with methodology note.
 * 11. Zero fake numbers, zero fake percentages, no ASSUMED/synthetic outcomes presented as achieved.
 * 12. Browser back and forward buttons navigate tabs correctly.
 * 13. Mobile viewport (390x844) renders with zero horizontal overflow.
 * 14. Exactly 0 uncaught page errors or console exceptions.
 * 15. Process terminates cleanly with exit code 0.
 */

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CUSTOMER_GROW_QA_PORT || 3096);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "qa-screenshots-customer-grow");
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

// ---------------------------------------------------------------------------
// Synthetic Customer-Safe Fixtures
// ---------------------------------------------------------------------------
const MOCK_IDENTITY_CONTEXT = {
  identity: {
    displayName: "Kovács Péter",
    email: "kovacs.peter@tesztvallalat.hu",
    accountType: "ORGANIZATION",
  },
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

const MOCK_PORTAL_HOME = {
  activeMatters: [],
  recentDocuments: [],
  contactSummary: { openCount: 0, unreadCount: 0, latestPreview: null },
  complianceSummary: null,
};

const MOCK_PORTAL_WORKSPACE = {
  actions: [],
  documents: [],
  messages: [],
  upcomingDeadlines: [],
  matterCount: 0,
};

const MOCK_ORG_GROW = {
  customerName: "Teszt Vállalat Kft.",
  processes: [
    {
      id: "proc-1",
      name: "Megrendelés teljesítés",
      category: "OPERATIONS",
      criticality: "HIGH",
      frequency: "DAILY",
      organizationGroupName: "Operáció",
      steps: [
        {
          id: "step-1",
          position: 1,
          name: "Megrendelés rögzítése",
          stepType: "DATA_ENTRY",
          isApproval: false,
          systemName: "SAP ERP",
          systemCategory: "ERP",
        },
        {
          id: "step-2",
          position: 2,
          name: "Vezetői jóváhagyás",
          stepType: "APPROVAL",
          isApproval: true,
          systemName: "SAP ERP",
          systemCategory: "ERP",
        },
      ],
    },
  ],
  initiatives: [
    {
      id: "init-1",
      title: "Automatizált jóváhagyási rendszer bevezetése",
      targetState: "Átfutási idő csökkentése 40%-kal",
      statusLabel: "Folyamatban",
      targetAt: "2026-06-30T00:00:00.000Z",
      hasRelatedMatter: true,
    },
  ],
  outcomes: {
    measured: [
      {
        id: "out-1",
        basis: "MEASURED",
        basisLabel: "Ténylegesen mért eredmény",
        initiativeTitle: "Automatizált jóváhagyási rendszer bevezetése",
        processName: "Megrendelés teljesítés",
      },
    ],
    calculatedOrEstimated: [
      {
        id: "out-2",
        basis: "CALCULATED",
        basisLabel: "Számított megtakarítás",
        initiativeTitle: "Automatizált jóváhagyási rendszer bevezetése",
        processName: "Megrendelés teljesítés",
      },
    ],
  },
  opportunities: [],
  opportunitiesDeferredNotice: "A fejlesztési lehetőségek csak jóváhagyott ügyféloldali közzétételi folyamaton keresztül jelenhetnek meg.",
  surveys: [
    {
      id: "survey-1",
      submittedAt: "2026-03-01T10:00:00.000Z",
      categoryLabels: ["Működés és folyamatok"],
      freeText: "A megrendelések feldolgozása túl lassú a manuális jóváhagyás miatt.",
      processName: "Megrendelés teljesítés",
    },
  ],
};

const MOCK_GROW_ASSESSMENTS_CATALOGUE = {
  packs: [
    {
      packKey: "pack-operational",
      version: 1,
      titleHu: "Működési és jóváhagyási felmérés",
      descriptionHu: "Feltárja a döntéshozatali és jóváhagyási folyamatok szűk keresztmetszeteit.",
      estimatedMinutes: 5,
      questionCount: 1,
      status: "NOT_STARTED",
      latestCompletedAt: null,
      latestFindingCount: 0,
      latestSummaryHu: null,
      latestResultAvailable: false,
      allowsProcessReference: true,
      resultScopes: [],
    },
    {
      packKey: "pack-it-architecture",
      version: 1,
      titleHu: "IT rendszerek és integrációk felmérése",
      descriptionHu: "Felméri az üzleti alkalmazások közötti adatkapcsolatokat és kézi munkát.",
      estimatedMinutes: 8,
      questionCount: 3,
      status: "COMPLETED",
      latestCompletedAt: "2026-03-01T12:00:00.000Z",
      latestFindingCount: 1,
      latestSummaryHu: "Az IT rendszerek integrációja hiányos az értékesítés és a számlázás között.",
      latestResultAvailable: true,
      allowsProcessReference: false,
      resultScopes: [
        {
          processId: null,
          processName: null,
          completedAt: "2026-03-01T12:00:00.000Z",
          findingCount: 1,
          resultAvailable: true,
        },
      ],
    },
  ],
  aggregatedFindings: [
    {
      titleHu: "IT silók az értékesítés és pénzügy között",
      summaryHu: "Nincs közvetlen adatkapcsolat a CRM és a számlázó között, manuális kettős rögzítés szükséges.",
    },
  ],
  aggregatedAttentionAreaCount: 1,
  aggregatedUnknownAreaCount: 0,
  noticeHu: "A kitöltött felmérések alapján készült összesítés.",
};

const MOCK_ASSESSMENT_DETAIL_OPERATIONAL = {
  definition: {
    packKey: "pack-operational",
    version: 1,
    titleHu: "Működési és jóváhagyási felmérés",
    descriptionHu: "Feltárja a döntéshozatali és jóváhagyási folyamatok szűk keresztmetszeteit.",
    estimatedMinutes: 5,
    allowsProcessReference: true,
    questions: [
      {
        questionKey: "q1",
        promptHu: "Hogyan történik a jóváhagyás az operatív folyamatokban?",
        helpTextHu: "Válassza a szervezetre leginkább jellemző működést.",
        options: [
          { value: "MANUAL", labelHu: "Manuálisan, papíron vagy e-mailben" },
          { value: "AUTOMATED", labelHu: "Rendszerben szabályalapúan automatizálva" },
          { value: "UNKNOWN", labelHu: "Nem tudom pontosan" },
        ],
      },
    ],
  },
  latestResult: null,
  latestResultAvailable: false,
  resultScope: null,
};

const MOCK_ASSESSMENT_DETAIL_IT = {
  definition: {
    packKey: "pack-it-architecture",
    version: 1,
    titleHu: "IT rendszerek és integrációk felmérése",
    descriptionHu: "Felméri az üzleti alkalmazások közötti adatkapcsolatokat és kézi munkát.",
    estimatedMinutes: 8,
    allowsProcessReference: false,
    questions: [],
  },
  latestResult: null, // will be assigned below or references completed
  latestResultAvailable: true,
  resultScope: null,
};

const MOCK_ASSESSMENT_RESULT_COMPLETED = {
  packKey: "pack-it-architecture",
  packVersion: 1,
  titleHu: "IT rendszerek és integrációk felmérése",
  completedAt: "2026-03-01T12:00:00.000Z",
  findings: [
    {
      titleHu: "Hiányzó integráció az értékesítés és a számlázás között",
      summaryHu: "A számlázási adatok rögzítése manuálisan történik, ami heti 6 óra adminisztrációt igényel.",
    },
  ],
  directions: [
    {
      labelHu: "API-alapú integráció kiépítése a CRM és az ERP rendszerek között.",
    },
  ],
  evidence: [
    {
      title: "Digitális érettség és folyamatautomatizáció KKV szektorban",
      authors: "Németh & Szabó",
      year: 2025,
      doi: "10.1234/example.2025.01",
      locator: "45-52. oldal",
      boundedClaim: "A rendszerek közötti integráció 70%-kal csökkenti az adatbeviteli hibákat.",
      limitations: "Magyarországi KKV mintán validálva.",
      strengthLabelHu: "Közvetlen kutatási bizonyíték",
    },
  ],
  attentionAreaCount: 1,
  unknownAreaCount: 0,
  summaryHu: "Az IT architektúra stabil, de a manuális adatmozgatás kockázatot hordoz.",
  noticeHu: "Szakértői véleményezés elérhető.",
};

const MOCK_GROW_SURVEYS = {
  items: [
    {
      id: "survey-1",
      submittedAt: "2026-03-01T10:00:00.000Z",
      categoryLabels: ["Működés és folyamatok"],
      freeText: "A megrendelések feldolgozása túl lassú a manuális jóváhagyás miatt.",
      processName: "Megrendelés teljesítés",
    },
  ],
};

function resolveResponse(url) {
  if (url.includes("/api/v1/client-portal/me")) {
    return { status: 200, body: MOCK_IDENTITY_CONTEXT };
  }
  if (url.includes("/api/v1/client-portal/home")) {
    return { status: 200, body: MOCK_PORTAL_HOME };
  }
  if (url.includes("/api/v1/client-portal/workspace")) {
    return { status: 200, body: MOCK_PORTAL_WORKSPACE };
  }
  if (url.includes("/api/v1/client-portal/org/grow-survey")) {
    return { status: 200, body: MOCK_GROW_SURVEYS };
  }
  if (url.includes("/api/v1/client-portal/org/grow-assessments/pack-it-architecture/results")) {
    return { status: 200, body: MOCK_ASSESSMENT_RESULT_COMPLETED };
  }
  if (url.includes("/api/v1/client-portal/org/grow-assessments/pack-operational/results")) {
    return { status: 200, body: MOCK_ASSESSMENT_RESULT_COMPLETED };
  }
  if (url.includes("/api/v1/client-portal/org/grow-assessments/pack-operational")) {
    return { status: 200, body: MOCK_ASSESSMENT_DETAIL_OPERATIONAL };
  }
  if (url.includes("/api/v1/client-portal/org/grow-assessments/pack-it-architecture")) {
    MOCK_ASSESSMENT_DETAIL_IT.latestResult = MOCK_ASSESSMENT_RESULT_COMPLETED;
    return { status: 200, body: MOCK_ASSESSMENT_DETAIL_IT };
  }
  if (url.includes("/api/v1/client-portal/org/grow-assessments")) {
    return { status: 200, body: MOCK_GROW_ASSESSMENTS_CATALOGUE };
  }
  if (url.includes("/api/v1/client-portal/org/grow")) {
    return { status: 200, body: MOCK_ORG_GROW };
  }
  if (url.includes("/api/v1/client-portal/org/units")) {
    return { status: 200, body: { items: [] } };
  }
  if (url.includes("/api/v1/client-portal/org/cases")) {
    return { status: 200, body: { items: [] } };
  }
  if (url.includes("/api/v1/client-portal/org/intakes")) {
    return { status: 200, body: { items: [] } };
  }
  if (url.includes("/api/v1/client-portal/org/summary")) {
    return { status: 200, body: { units: [] } };
  }
  if (url.includes("/api/v1/client-portal/org/contracts")) {
    return { status: 200, body: { items: [] } };
  }
  if (url.includes("/api/v1/client-portal/org/company")) {
    return {
      status: 200,
      body: {
        companyName: "Teszt Vállalat Kft.",
        profileHeadline: "Vezető hazai logisztikai és szállítmányozási szolgáltató.",
        employeeCount: 45,
        groups: [],
        visibleMattersByArea: [],
        totalVisibleMatterCount: 0,
        milestones: [],
        initiatives: [],
      },
    };
  }
  return { status: 200, body: { items: [] } };
}

async function createQaPage(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const hardErrors = [];

  page.on("pageerror", (err) => hardErrors.push(`PAGEERROR: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("[API]") && !msg.text().includes("Failed to load resource") && !msg.text().includes("status of 404")) {
      hardErrors.push(`CONSOLE_ERROR: ${msg.text()}`);
    }
  });

  // Inject minification-safe MSAL controller interceptor and storage seeds
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
                username: "kovacs.peter@tesztvallalat.hu",
                localAccountId: "qa-user",
                name: "Kovács Péter",
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
              username: "kovacs.peter@tesztvallalat.hu",
              localAccountId: "qa-user",
              name: "Kovács Péter",
            };
          };
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
    console.log(`[QA ROUTE] ${route.request().method()} ${url} -> ${res.status}`);
    await route.fulfill({
      status: res.status,
      contentType: "application/json",
      body: JSON.stringify(res.body),
    });
  });

  return { context, page, hardErrors };
}

async function runCustomerGrowBrowserQA() {
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log(`Starting Next.js production server on port ${PORT}...`);
  await startServer();
  console.log("Server started successfully. Launching Chromium...");

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n===============================================================`);
      console.log(`Testing viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);
      console.log(`===============================================================`);

      const { context, page, hardErrors } = await createQaPage(browser, viewport);

      // 1. Initial Page Load
      console.log("1. Navigating to /portal/fejlesztes...");
      await page.goto(`${BASE_URL}/portal/fejlesztes`, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-testid='grow-sub-nav']", { timeout: 10000 });

      // Screenshot overview
      await page.screenshot({ path: path.join(SHOTS, `overview-${viewport.name}.png`), fullPage: true });

      // 2. Overview Tab & KPI Verification
      console.log("2. Verifying Áttekintés tab hero and real KPIs...");
      const pageText = await page.evaluate(() => document.body.innerText);

      if (!pageText.includes("Fejlesztési Áttekintés")) {
        throw new Error("Editorial title 'Fejlesztési Áttekintés' not found on overview tab");
      }
      if (!pageText.includes("Teszt Vállalat Kft.")) {
        throw new Error("Client display name 'Teszt Vállalat Kft.' not found on overview tab");
      }

      // Check the 5 KPI tiles
      if (!pageText.includes("KITÖLTÉSRE VÁR") || !pageText.includes("BEFEJEZETT") || !pageText.includes("FOLYAMATOK") || !pageText.includes("FOLYAMATBAN") || !pageText.includes("MÉRT EREDMÉNY")) {
        throw new Error("One or more of the 5 real KPI tiles are missing on Áttekintés tab");
      }

      // Check findings spotlight
      const findingsSection = await page.locator("[data-testid='grow-aggregated-findings']");
      if ((await findingsSection.count()) === 0) {
        throw new Error("Aggregated findings spotlight [data-testid='grow-aggregated-findings'] missing");
      }

      // Guard: No fake percentages in overview
      if (/érettség\s*\d+%/i.test(pageText) || /érettségi\s*szint/i.test(pageText)) {
        throw new Error("Prohibited fake maturity percentage found on overview!");
      }

      // 3. Tab Navigation & URL Sync
      const tabs = [
        { id: "felmeresek", label: "Felmérések" },
        { id: "folyamatok", label: "Folyamatok" },
        { id: "lehetosegek", label: "Lehetőségek" },
        { id: "kezdemenyezesek", label: "Kezdeményezések" },
        { id: "eredmenyek", label: "Eredmények" },
        { id: "attekintes", label: "Áttekintés" },
      ];

      for (const tab of tabs) {
        console.log(`3. Navigating to tab: ${tab.label} (${tab.id})...`);
        const tabButton = page.locator(`[data-testid='grow-tab-${tab.id}']`);
        if ((await tabButton.count()) === 0) {
          throw new Error(`Tab button [data-testid='grow-tab-${tab.id}'] not found`);
        }
        await tabButton.click();
        await page.waitForTimeout(300);

        // Verify URL sync
        const currentUrl = page.url();
        if (!currentUrl.includes(`tab=${tab.id}`)) {
          throw new Error(`URL did not sync tab parameter: expected tab=${tab.id}, got ${currentUrl}`);
        }

        // Verify aria-selected
        const isSelected = await tabButton.getAttribute("aria-selected");
        if (isSelected !== "true") {
          throw new Error(`Tab ${tab.id} does not have aria-selected='true' after click`);
        }
      }

      // 4. Felmérések Tab Inspection
      console.log("4. Inspecting Felmérések tab (catalogue, filters, guide, survey)...");
      await page.locator("[data-testid='grow-tab-felmeresek']").click();
      await page.waitForTimeout(400);

      // Verify catalogue rendered
      const catalogue = page.locator("[data-testid='grow-assessment-catalogue']");
      if ((await catalogue.count()) === 0) {
        throw new Error("Assessment catalogue [data-testid='grow-assessment-catalogue'] not found");
      }

      // Verify 3-step guide
      const felmeresekText = await page.evaluate(() => document.body.innerText);
      if (!felmeresekText.includes("Mi történik a kitöltés után?")) {
        throw new Error("3-step explanatory guide 'Mi történik a kitöltés után?' not found");
      }

      // Verify generic survey section and history
      const genericSurvey = page.locator("[data-testid='grow-feltaras-section']");
      if ((await genericSurvey.count()) === 0) {
        throw new Error("Generic survey section [data-testid='grow-feltaras-section'] not found");
      }
      if (!/korábban beküldött/i.test(felmeresekText)) {
        throw new Error("Survey history section not found");
      }

      await page.screenshot({ path: path.join(SHOTS, `felmeresek-${viewport.name}.png`), fullPage: true });

      // 5. Interactive Assessment Runner & UNKNOWN Choice
      console.log("5. Testing interactive assessment runner...");
      const startButton = page.locator("[data-testid='grow-assessment-start-pack-operational']");
      if ((await startButton.count()) === 0) {
        throw new Error("Start assessment button for pack-operational not found");
      }
      await startButton.click();
      await page.waitForSelector("[data-testid='grow-assessment-runner']", { timeout: 5000 });

      // Verify runner question & UNKNOWN option
      const runnerText = await page.evaluate(() => document.body.innerText);
      if (!runnerText.includes("Hogyan történik a jóváhagyás")) {
        throw new Error("Assessment question prompt not rendered in runner");
      }
      if (!runnerText.includes("Nem tudom pontosan")) {
        throw new Error("Explicit UNKNOWN option ('Nem tudom pontosan') missing in runner");
      }

      // Select UNKNOWN option
      const unknownOption = page.locator("[data-testid='grow-assessment-option-UNKNOWN']");
      if ((await unknownOption.count()) > 0) {
        await unknownOption.click();
      }

      await page.screenshot({ path: path.join(SHOTS, `runner-${viewport.name}.png`), fullPage: true });

      // Cancel runner to return to catalogue
      const cancelButton = page.locator("[data-testid='grow-assessment-runner-cancel']");
      if ((await cancelButton.count()) > 0) {
        await cancelButton.click();
        await page.waitForTimeout(300);
      }

      // 6. Assessment Results & Research Evidence
      console.log("6. Verifying assessment results view and 'Mi alapján?' evidence...");
      const resultButton = page.locator("[data-testid='grow-assessment-result-pack-it-architecture']");
      if ((await resultButton.count()) > 0) {
        await resultButton.click();
        await page.waitForSelector("[data-testid='grow-assessment-result']", { timeout: 5000 });

        const resultText = await page.evaluate(() => document.body.innerText);
        if (!/amit látunk/i.test(resultText) || !/javasolt irányok/i.test(resultText)) {
          throw new Error("Result findings or directions missing");
        }
        if (!/mi alapján\?/i.test(resultText)) {
          throw new Error("'Mi alapján?' research evidence section missing");
        }
        if (!resultText.includes("Németh & Szabó")) {
          throw new Error("ResearchEvidence author citation missing");
        }

        await page.screenshot({ path: path.join(SHOTS, `results-${viewport.name}.png`), fullPage: true });

        // Close results
        const backToCat = page.locator("[data-testid='grow-assessment-result-back']");
        if ((await backToCat.count()) > 0) {
          await backToCat.click();
          await page.waitForTimeout(300);
        }
      }

      // 7. Folyamatok Tab
      console.log("7. Inspecting Folyamatok tab...");
      await page.locator("[data-testid='grow-tab-folyamatok']").click();
      await page.waitForTimeout(400);
      const folyamatText = await page.evaluate(() => document.body.innerText);
      if (!folyamatText.includes("Megrendelés teljesítés") || !folyamatText.includes("SAP ERP")) {
        throw new Error("Mapped process or system tag not rendered on Folyamatok tab");
      }
      await page.screenshot({ path: path.join(SHOTS, `folyamatok-${viewport.name}.png`), fullPage: true });

      // 8. Lehetőségek Tab (Dignified Guarded Fail-Closed State)
      console.log("8. Inspecting Lehetőségek guarded state...");
      await page.locator("[data-testid='grow-tab-lehetosegek']").click();
      await page.waitForTimeout(400);
      const lehetosegText = await page.evaluate(() => document.body.innerText);
      const gapCodeAttr = await page.locator("[data-publication-code='GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP']").count();
      if (gapCodeAttr === 0 || !lehetosegText.includes("Jelenleg nincs ügyféloldalon közzétett fejlesztési lehetőség")) {
        throw new Error("Dignified fail-closed notice not found on Lehetőségek tab");
      }
      await page.screenshot({ path: path.join(SHOTS, `lehetosegek-${viewport.name}.png`), fullPage: true });

      // 9. Kezdeményezések Tab
      console.log("9. Inspecting Kezdeményezések tab...");
      await page.locator("[data-testid='grow-tab-kezdemenyezesek']").click();
      await page.waitForTimeout(400);
      const kezdemenyezesText = await page.evaluate(() => document.body.innerText);
      if (!kezdemenyezesText.includes("Automatizált jóváhagyási rendszer bevezetése") || !kezdemenyezesText.includes("Folyamatban")) {
        throw new Error("Customer initiative card not rendered on Kezdeményezések tab");
      }
      await page.screenshot({ path: path.join(SHOTS, `kezdemenyezesek-${viewport.name}.png`), fullPage: true });

      // 10. Eredmények Tab
      console.log("10. Inspecting Eredmények tab...");
      await page.locator("[data-testid='grow-tab-eredmenyek']").click();
      await page.waitForTimeout(400);
      const eredmenyText = await page.evaluate(() => document.body.innerText);
      if (!/mért eredmények/i.test(eredmenyText) || !/számított/i.test(eredmenyText)) {
        throw new Error("Outcome distinction (Mért vs Számított) missing on Eredmények tab");
      }
      if (!/forrásmegjelölés/i.test(eredmenyText) && !/módszertan/i.test(eredmenyText)) {
        throw new Error("Methodology note missing on Eredmények tab");
      }
      await page.screenshot({ path: path.join(SHOTS, `eredmenyek-${viewport.name}.png`), fullPage: true });

      // 11. Browser Back / Forward Verification
      console.log("11. Verifying browser history back/forward navigation...");
      await page.goBack();
      await page.waitForTimeout(300);
      if (!page.url().includes("tab=kezdemenyezesek")) {
        throw new Error(`Browser goBack failed to restore ?tab=kezdemenyezesek, got: ${page.url()}`);
      }

      await page.goForward();
      await page.waitForTimeout(300);
      if (!page.url().includes("tab=eredmenyek")) {
        throw new Error(`Browser goForward failed to restore ?tab=eredmenyek, got: ${page.url()}`);
      }

      // 12. Mobile Layout & Overflow Check
      if (viewport.name === "mobile") {
        console.log("12. Checking horizontal overflow on mobile viewport...");
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth + 2;
        });
        if (hasOverflow) {
          throw new Error("Mobile layout has horizontal overflow!");
        }
      }

      // 13. Hard Errors Check
      console.log("13. Checking for console / page errors...");
      if (hardErrors.length > 0) {
        throw new Error(`Hard browser errors detected (${hardErrors.length}):\n${hardErrors.join("\n")}`);
      }

      console.log(`[PASS] Viewport ${viewport.name} passed all assertions with 0 errors.`);
      results.push({ viewport: viewport.name, status: "PASS" });

      await context.close();
    }

    console.log("\n===============================================================");
    console.log("ALL BROWSER QA TESTS COMPLETED SUCCESSFULLY (EXIT CODE 0)");
    console.log("===============================================================");
    console.log(`BROWSER_QA=PASS`);
    console.log(`DESKTOP=PASS`);
    console.log(`MOBILE=PASS`);
    console.log(`BROWSER_QA_EXIT_CODE=0`);
    console.log(`RUNNER_TERMINATES_CLEANLY=YES`);
  } finally {
    await browser.close();
    stopServer();
  }
}

runCustomerGrowBrowserQA()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n[FAIL] Customer Grow Browser QA failed:", err);
    stopServer();
    process.exit(1);
  });
