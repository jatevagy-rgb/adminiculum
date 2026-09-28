/**
 * Customer portal Teendők entry-point repair — production browser QA.
 *
 * Proves in real headless Chromium (desktop 1440x900 and mobile 390x844) that
 * every canonical actionable ClientRequest kind is reachable from the Teendők
 * list and that each row is a pure entry point into the already-merged
 * canonical request detail journey:
 *   1. DOCUMENT_REQUEST, CORRECTION_REQUEST, INFORMATION_REQUEST, DATA_FORM and
 *      QUESTION_RESPONSE rows render, each exactly once (no duplicate rows).
 *   2. Each row shows its customer-facing kind label and the canonical due date
 *      when one exists.
 *   3. Every row href is the canonical /portal/matters/<pub>/requests/<id> route.
 *   4. No inline response form, file input or upload/submission action exists in
 *      the list — the canonical detail route remains the only response surface.
 *   5. Case-internal fields (caseId sentinel, documentSpec, assignments, notes)
 *      never reach the page.
 *   6. The canonical action list ("Most szükséges") and the submission history
 *      ("Beküldött anyagaim") sections are preserved.
 *   7. The truthful empty state renders when no request exists.
 *   8. Mobile viewport has no horizontal overflow.
 *   9. Zero uncaught page errors or console errors.
 *
 * Requires a build with a configured customer provider, e.g.:
 *   $env:NEXT_PUBLIC_ENTRA_CLIENT_ID='11111111-1111-1111-1111-111111111111'
 *   $env:NEXT_PUBLIC_ENTRA_AUTHORITY='https://qa.ciamlogin.com/22222222-2222-2222-2222-222222222222'
 *   npx next build
 *   node tests/customerTeendokBrowserQA.mjs
 */
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CUSTOMER_TEENDOK_QA_PORT || 3098);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "qa-screenshots-customer-teendok");
const VIEWPORTS = [
  { width: 1440, height: 900, name: "desktop" },
  { width: 390, height: 844, name: "mobile" },
];

const WORKSPACE_REF = "ws-tesztvallalat-org";
const PUB = "pub-1";
// Must match the tenant in NEXT_PUBLIC_ENTRA_AUTHORITY used for the QA build
// (see the header): the shell selects the account by the authority's tenant.
const QA_TENANT = "22222222-2222-2222-2222-222222222222";

const MOCK_IDENTITY_CONTEXT = {
  identity: {
    displayName: "Kovács Péter",
    email: "kovacs.peter@tesztvallalat.hu",
    accountType: "ORGANIZATION",
  },
  state: "READY",
  workspaces: [
    {
      publicReference: WORKSPACE_REF,
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
    publicReference: WORKSPACE_REF,
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
  portalActionsEnabled: true,
  relationshipMode: "PORTAL_CENTRIC",
  identity: { displayName: "Kovács Péter", email: "kovacs.peter@tesztvallalat.hu" },
  access: { state: "ACTIVE", grantCount: 1 },
  attention: [],
  matters: [],
  updates: [],
};

const SHARED_DOCUMENT_ROW = {
  id: "shared-1",
  title: "Aláírt szerződés",
  kind: "SHARED_DOCUMENT",
  status: "Elérhető",
  publishedAt: "2026-09-01T10:00:00.000Z",
  actionUrl: "/portal/documents/shared-1",
  clientUploaded: false,
  isCompliancePolicy: false,
};

const SUBMISSION_ROW = {
  id: "sub-1",
  matterId: PUB,
  matterTitle: "Teszt ügy",
  title: "Beküldött dokumentum vagy adat",
  description: null,
  status: "Beküldve",
  publishedAt: "2026-09-03T10:00:00.000Z",
  kind: "SUBMISSION",
  actionUrl: `/portal/matters/${PUB}`,
};

// Extra internal fields are deliberately present to prove the list never
// renders them (a real backend strips them; this guards against a future
// frontend that starts reading them).
const REQUEST_ROWS = [
  {
    id: "req-doc",
    matterId: PUB,
    matterTitle: "Teszt ügy",
    title: "Cégkivonat bekérése",
    description: "Kérjük, töltse fel a 30 napnál nem régebbi cégkivonatot.",
    status: "Teendő",
    publishedAt: "2026-09-20T08:00:00.000Z",
    dueAt: null,
    kind: "DOCUMENT_REQUEST",
    actionUrl: `/portal/matters/${PUB}`,
    caseId: "case-internal-secret",
    documentSpec: { internalReviewRequired: true },
  },
  {
    id: "req-correction",
    matterId: PUB,
    matterTitle: "Teszt ügy",
    title: "Hiánypótlás a benyújtott irathoz",
    description: null,
    status: "Javítás szükséges",
    publishedAt: "2026-09-21T08:00:00.000Z",
    dueAt: null,
    kind: "CORRECTION_REQUEST",
    actionUrl: `/portal/matters/${PUB}`,
    assignedInternalUserId: "user-internal-1",
  },
  {
    id: "req-info",
    matterId: PUB,
    matterTitle: "Teszt ügy",
    title: "Adja meg az érintett szervezeteket",
    description: "Sorolja fel a hatókörbe tartozó szervezeteket.",
    status: "Teendő",
    publishedAt: "2026-09-22T08:00:00.000Z",
    dueAt: "2026-09-30T08:00:00.000Z",
    kind: "INFORMATION_REQUEST",
    actionUrl: `/portal/matters/${PUB}`,
  },
  {
    id: "req-form",
    matterId: PUB,
    matterTitle: "Teszt ügy",
    title: "NIS2 adatlap kitöltése",
    description: "Az adatlap mezőit a bekérés oldalán tudja kitölteni.",
    status: "Teendő",
    publishedAt: "2026-09-23T08:00:00.000Z",
    dueAt: null,
    kind: "DATA_FORM",
    actionUrl: `/portal/matters/${PUB}`,
    reviewerNotes: "internal note",
  },
  {
    id: "req-question",
    matterId: PUB,
    matterTitle: "Teszt ügy",
    title: "Válaszadás az iroda kérdésére",
    description: null,
    status: "Teendő",
    publishedAt: "2026-09-24T08:00:00.000Z",
    dueAt: null,
    kind: "QUESTION_RESPONSE",
    actionUrl: `/portal/matters/${PUB}`,
  },
];

const EXPECTED_ROWS = [
  { id: "req-doc", title: "Cégkivonat bekérése", label: "Dokumentumkérés" },
  { id: "req-correction", title: "Hiánypótlás a benyújtott irathoz", label: "Javításkérés" },
  { id: "req-info", title: "Adja meg az érintett szervezeteket", label: "Információkérés" },
  { id: "req-form", title: "NIS2 adatlap kitöltése", label: "Adatlap" },
  { id: "req-question", title: "Válaszadás az iroda kérdésére", label: "Válaszadás" },
];

const MOCK_ORG_HOME_ACTION = {
  id: "action-1",
  matterPublicationId: PUB,
  matterTitle: "Teszt ügy",
  title: "Nyilatkozat pótlása",
  instructions: null,
  dueAt: null,
  typeLabel: "Ügyintézési teendő",
  readOnlyNote: "Ügyféli teendő",
  area: "LEGAL",
  actionUrl: `/portal/matters/${PUB}`,
};

let requestRows = REQUEST_ROWS;
let emptyStateScenario = false;

function portalWorkspaceBody() {
  return {
    actions: [],
    documents: [
      SHARED_DOCUMENT_ROW,
      ...(emptyStateScenario ? [] : requestRows),
      SUBMISSION_ROW,
    ],
    messages: [],
    upcomingDeadlines: [],
    matterCount: 1,
  };
}

function resolveResponse(url) {
  if (url.includes("/api/v1/client-portal/me")) return { status: 200, body: MOCK_IDENTITY_CONTEXT };
  if (url.includes("/api/v1/client-portal/workspace")) return { status: 200, body: portalWorkspaceBody() };
  if (url.includes("/api/v1/client-portal/home")) return { status: 200, body: MOCK_PORTAL_HOME };
  if (url.includes("/api/v1/client-portal/org/home")) {
    return {
      status: 200,
      body: {
        customer: { name: "Teszt Vállalat Kft." },
        matters: [],
        actions: emptyStateScenario ? [] : [MOCK_ORG_HOME_ACTION],
        recentDocuments: [],
        contactSummary: { openCount: 0, unreadCount: 0, latestPreview: null, latestUpdatedAt: null },
      },
    };
  }
  if (url.includes("/api/v1/client-portal/org/units")) return { status: 200, body: { items: [] } };
  if (url.includes("/api/v1/client-portal/org/cases")) return { status: 200, body: { items: [] } };
  if (url.includes("/api/v1/client-portal/org/intakes")) return { status: 200, body: { items: [] } };
  if (url.includes("/api/v1/client-portal/org/summary")) return { status: 200, body: { units: [] } };
  if (url.includes("/api/v1/client-portal/org/contracts")) return { status: 200, body: { items: [] } };
  if (url.includes("/api/v1/client-portal/org/company")) {
    return {
      status: 200,
      body: {
        companyName: "Teszt Vállalat Kft.",
        profileHeadline: null,
        employeeCount: null,
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

async function createQaPage(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const hardErrors = [];

  page.on("pageerror", (err) => hardErrors.push(`PAGEERROR: ${err.message}`));
  page.on("console", (msg) => {
    if (
      msg.type() === "error" &&
      !msg.text().includes("[API]") &&
      !msg.text().includes("Failed to load resource") &&
      !msg.text().includes("status of 404")
    ) {
      hardErrors.push(`CONSOLE_ERROR: ${msg.text()}`);
    }
  });

  await page.addInitScript(({ tenant, workspaceRef }) => {
    Object.defineProperty(Object.prototype, "controller", {
      set(val) {
        Object.defineProperty(this, "controller", { value: val, writable: true, configurable: true });
        if (typeof this.getAllAccounts === "function" && typeof this.acquireTokenSilent === "function") {
          const proto = Object.getPrototypeOf(this);
          const account = {
            homeAccountId: `qa-user.${tenant}`,
            environment: "login.windows.net",
            tenantId: tenant,
            username: "kovacs.peter@tesztvallalat.hu",
            localAccountId: "qa-user",
            name: "Kovács Péter",
          };
          proto.getAllAccounts = function () {
            return [account];
          };
          proto.acquireTokenSilent = async function () {
            return { accessToken: "qa-customer-token" };
          };
          proto.handleRedirectPromise = async function () {
            return null;
          };
          proto.getActiveAccount = function () {
            return account;
          };
        }
      },
      configurable: true,
    });

    localStorage.setItem("adminiculum:client-portal-workspace", workspaceRef);
    localStorage.setItem("auth_token", "qa-customer-token");
  }, { tenant: QA_TENANT, workspaceRef: WORKSPACE_REF });

  await page.route("**/api/v1/**", async (route) => {
    const res = resolveResponse(route.request().url());
    await route.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) });
  });

  return { context, page, hardErrors };
}

const results = [];
function check(name, ok, detail) {
  results.push(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`);
}

async function loadTeendok(page, hardErrors = []) {
  await page.goto(`${BASE_URL}/portal/teendoim`, { waitUntil: "networkidle" });
  try {
    await page.waitForSelector("[data-testid='organization-client-portal']", { timeout: 15000 });
  } catch (error) {
    const body = await page.locator("body").innerText().catch(() => "");
    console.log("=== PAGE URL ===", page.url());
    console.log("=== BODY SNAPSHOT ===\n" + body.slice(0, 1200));
    console.log("=== HARD ERRORS ===\n" + hardErrors.slice(0, 5).join("\n"));
    throw error;
  }
  await page.waitForSelector("text=Dokumentum- és adatbekérések", { timeout: 15000 });
}

async function runMainScenario(browser, viewport) {
  const { context, page, hardErrors } = await createQaPage(browser, viewport);
  const tag = viewport.name;
  try {
    await loadTeendok(page, hardErrors);
    const body = await page.locator("body").innerText();
    const html = await page.content();

    const openLinks = page.locator('a:has-text("Bekérés megnyitása")');
    const hrefs = await openLinks.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    check(`[${tag}] all five canonical request rows render`, hrefs.length === 5, `rows=${hrefs.length}`);

    for (const row of EXPECTED_ROWS) {
      const expectedHref = `/portal/matters/${PUB}/requests/${row.id}`;
      check(`[${tag}] ${row.id} row present with canonical href`, hrefs.includes(expectedHref), expectedHref);
      check(`[${tag}] ${row.id} title visible`, body.includes(row.title));
      check(`[${tag}] ${row.id} kind label visible`, body.includes(row.label), row.label);
      check(`[${tag}] ${row.id} rendered exactly once`, hrefs.filter((href) => href === expectedHref).length === 1);
    }

    const infoRow = page.locator('a:has-text("Adja meg az érintett szervezeteket")');
    const infoRowText = await infoRow.innerText();
    check(`[${tag}] due date shown for the information request`, infoRowText.includes("Határidő"), infoRowText.replace(/\s+/g, " ").slice(0, 120));
    check(`[${tag}] canonical action list preserved`, body.includes("Most szükséges") && body.includes("Nyilatkozat pótlása"));
    check(`[${tag}] submission history preserved`, body.includes("Beküldött anyagaim") && body.includes("Beküldött dokumentum vagy adat"));
    check(`[${tag}] published document never becomes a request row`, !hrefs.includes(`/portal/documents/${SHARED_DOCUMENT_ROW.id}`), "shared document kept out of the request list");

    const fileInputs = await page.locator('input[type="file"]').count();
    check(`[${tag}] no inline upload path in the list`, fileInputs === 0, `file inputs=${fileInputs}`);
    check(`[${tag}] no inline response form in the list`, !body.includes("Válasz beküldése") && !body.includes("Nem tudom feltölteni"));

    check(`[${tag}] no internal request fields leak`, !/case-internal-secret|documentSpec|assignedInternalUserId|reviewerNotes|user-internal-1/.test(html));
    check(`[${tag}] zero console/page errors`, hardErrors.length === 0, hardErrors.slice(0, 2).join(" || "));

    if (tag === "mobile") {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`[${tag}] no horizontal overflow`, overflow <= 2, `overflow=${overflow}px`);
    }

    await page.screenshot({ path: path.join(SHOTS, `teendok-${tag}.png`), fullPage: true });
  } finally {
    await context.close();
  }
}

async function runEmptyScenario(browser) {
  emptyStateScenario = true;
  const { context, page, hardErrors } = await createQaPage(browser, VIEWPORTS[0]);
  try {
    await loadTeendok(page, hardErrors);
    const body = await page.locator("body").innerText();
    const openLinks = await page.locator('a:has-text("Bekérés megnyitása")').count();
    await page.waitForSelector("text=Jelenleg nincs Öntől szükséges dokumentum- vagy adatbekérés.", { timeout: 10000 });
    check("[desktop-empty] truthful empty state", true);
    check("[desktop-empty] no fabricated request rows", openLinks === 0, `rows=${openLinks}`);
    check("[desktop-empty] canonical action group stays truthful", body.includes("Jelenleg nincs Öntől szükséges teendő."));
    check("[desktop-empty] zero console/page errors", hardErrors.length === 0, hardErrors.slice(0, 2).join(" || "));
    await page.screenshot({ path: path.join(SHOTS, "teendok-empty-desktop.png"), fullPage: true });
  } finally {
    emptyStateScenario = false;
    await context.close();
  }
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log(`Starting Next.js production server on port ${PORT}...`);
  await startServer();
  console.log("Server ready. Launching Chromium...");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      await runMainScenario(browser, viewport);
    }
    await runEmptyScenario(browser);
  } finally {
    await browser.close();
    stopServer();
  }
  console.log(results.join("\n"));
  const failed = results.filter((entry) => entry.startsWith("FAIL")).length;
  console.log(`\n${results.length - failed}/${results.length} browser QA checks passed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  stopServer();
  console.error("QA run failed:", error);
  console.log(results.join("\n"));
  process.exit(1);
});
