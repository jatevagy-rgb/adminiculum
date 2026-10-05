/**
 * UX-02 live P1 repair browser QA — exact customer compliance question navigation.
 *
 * Proves in real headless Chromium (desktop 1440x900 and mobile 390x844) that:
 *   1. Home ("Most Önre vár") and Teendők compliance action rows carry the exact
 *      customer-safe href /portal/megfeleles?topic=<topicId>&question=<questionKey>.
 *   2. The compliance surface opens the exact topic detail and the exact
 *      portal-answerable question with its existing answer control visible.
 *   3. Same-route link navigation updates the rendered detail without a reload.
 *   4. Browser Back and Forward re-sync topic and question from the URL.
 *   5. A stale/unavailable question shows the topic plus a truthful notice and
 *      never opens or guesses another question.
 *   6. An unknown topic and a parameter-less load both fall back to the overview.
 *   7. The manual Állapotok topic detail keeps working.
 *   8. Long question text wraps instead of being single-line truncated.
 *   9. Nothing is submitted automatically (no answer request is issued) and no
 *      console/page errors occur.
 *
 * Requires a production build with a configured customer provider, e.g.:
 *   $env:NEXT_PUBLIC_ENTRA_CLIENT_ID='11111111-1111-1111-1111-111111111111'
 *   $env:NEXT_PUBLIC_ENTRA_AUTHORITY='https://qa.ciamlogin.com/22222222-2222-2222-2222-222222222222'
 *   npx next build
 *   node tests/ux02PortalComplianceExactQuestionQA.mjs
 */
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.UX02_QA_PORT || 3096);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "qa-screenshots-ux02-compliance-question");
const VIEWPORTS = [
  { width: 1440, height: 900, name: "desktop" },
  { width: 390, height: 844, name: "mobile" },
];

const WORKSPACE_REF = "ws-tesztvallalat-org";
const QA_TENANT = "22222222-2222-2222-2222-222222222222";

const TOPIC_ID = "portal/nis2-scope";
const TOPIC_LABEL = "Kiberbiztonsági (NIS2) hatály";
const QUESTION_KEY = "company_employee_count";
const QUESTION_LABEL =
  "Kérjük, adja meg a hatókörbe tartozó szolgáltatások teljes megnevezését és azok üzemeltetési felelősét, mert a jelenlegi nyilvántartás ezeket az adatokat még nem tartalmazza.";
const SECOND_QUESTION_KEY = "company_services";
const EXPECTED_HREF = `/portal/megfeleles?topic=${encodeURIComponent(TOPIC_ID)}&question=${QUESTION_KEY}`;

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

const COMPLIANCE_ACTION_ITEM = {
  id: `compliance-${TOPIC_ID}-${QUESTION_KEY}`,
  sourceType: "COMPLIANCE_MISSING_FACT",
  sourceId: TOPIC_ID,
  domain: "COMPLIANCE",
  kind: "PROFILE_FACT",
  title: QUESTION_LABEL,
  contextLabel: TOPIC_LABEL,
  dueAt: null,
  urgency: "NORMAL",
  state: "OPEN",
  actionLabel: "Adat megadása",
  href: EXPECTED_HREF,
  canCompleteInPortal: true,
  matterPublicationId: null,
};

const COMPLIANCE_TOPICS = [
  {
    topicId: TOPIC_ID,
    topicLabel: TOPIC_LABEL,
    state: "MORE_INFORMATION_NEEDED",
    shortExplanation: "NIS2 hatályvizsgálat a közzétett ügyadatok alapján.",
    missingInformation: [
      {
        label: QUESTION_LABEL,
        portalAnswerable: true,
        questionKey: QUESTION_KEY,
        valueType: "NUMBER",
        integerOnly: true,
      },
      {
        label: "Hatókörbe tartozó szolgáltatások listája",
        portalAnswerable: true,
        questionKey: SECOND_QUESTION_KEY,
        valueType: "STRING",
      },
      {
        label: "Irodai egyeztetést igénylő belső adat",
        portalAnswerable: false,
      },
    ],
    nextAction: null,
    documents: [],
  },
  {
    topicId: "portal/gdpr-general",
    topicLabel: "Általános adatvédelem",
    state: "RESOLVED",
    shortExplanation: "Alapvető adatvédelmi követelmények.",
    missingInformation: [],
    nextAction: null,
    documents: [],
  },
];

let submittedAnswerRequests = [];

function resolveResponse(url, method) {
  if (url.includes("/api/v1/client-portal/me")) return { status: 200, body: MOCK_IDENTITY_CONTEXT };
  if (url.includes("/api/v1/client-portal/workspace")) {
    return { status: 200, body: { actions: [], documents: [], messages: [], upcomingDeadlines: [], matterCount: 0 } };
  }
  if (url.includes("/api/v1/client-portal/home")) {
    return {
      status: 200,
      body: {
        portalActionsEnabled: true,
        relationshipMode: "PORTAL_CENTRIC",
        identity: { displayName: "Kovács Péter", email: "kovacs.peter@tesztvallalat.hu" },
        access: { state: "ACTIVE", grantCount: 1 },
        attention: [],
        matters: [],
        updates: [],
      },
    };
  }
  if (url.includes("/api/v1/client-portal/org/action-center")) {
    return {
      status: 200,
      body: { items: [COMPLIANCE_ACTION_ITEM], counts: { open: 1, overdue: 0, dueSoon: 0 } },
    };
  }
  if (url.includes("/api/v1/client-portal/org/home")) {
    return {
      status: 200,
      body: {
        customer: { name: "Teszt Vállalat Kft." },
        matters: [],
        actions: [],
        recentDocuments: [],
        contactSummary: { openCount: 0, unreadCount: 0, latestPreview: null, latestUpdatedAt: null },
      },
    };
  }
  if (url.includes("/api/v1/client-portal/org/company-profile")) {
    return { status: 200, body: { questions: [], screens: [] } };
  }
  if (url.includes("/api/v1/client-portal/compliance/requests")) {
    return { status: 200, body: { items: [] } };
  }
  if (url.includes("/api/v1/client-portal/compliance")) {
    return { status: 200, body: { topics: COMPLIANCE_TOPICS, controlsSummary: [] } };
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
    const request = route.request();
    if (request.method() === "PUT" && request.url().includes("/company-profile/questions/")) {
      submittedAnswerRequests.push(request.url());
    }
    const res = resolveResponse(request.url(), request.method());
    await route.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) });
  });

  return { context, page, hardErrors };
}

const results = [];
function check(name, ok, detail) {
  results.push(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`);
}

async function waitForPortalReady(page) {
  await page.waitForSelector("[data-testid='client-portal-shell-v3']", { timeout: 20000 });
}

async function waitForTopicDetail(page) {
  await page.waitForSelector("[data-testid='org-compliance-topic-detail']", { timeout: 20000 });
}

async function waitForOverview(page) {
  await page.waitForSelector("[data-testid='compliance-section-nav']", { timeout: 20000 });
}

function urlHasTarget(page) {
  const url = new URL(page.url());
  return url.searchParams.get("topic") === TOPIC_ID && url.searchParams.get("question") === QUESTION_KEY;
}

async function assertExactQuestionOpen(page, tag, label) {
  const answerControl = page.locator("[data-testid='portal-compliance-answer-control']");
  check(`[${tag}] exact topic detail rendered`, await page.locator("[data-testid='org-compliance-topic-detail']").count() === 1);
  check(`[${tag}] exact topic label visible`, (await page.locator("body").innerText()).includes(TOPIC_LABEL));
  check(`[${tag}] exact full question text visible (wrapped, not truncated)`, (await page.locator("body").innerText()).includes(QUESTION_LABEL));
  check(`[${tag}] exact answer control visible`, (await answerControl.count()) === 1, label);
  check(`[${tag}] answer control targets the exact questionKey`, (await answerControl.first().getAttribute("data-question-key")) === QUESTION_KEY);
  check(`[${tag}] answer control starts empty (nothing auto-answered)`, (await answerControl.first().inputValue()) === "");
  const focusedQuestionKey = await page.evaluate(() => document.activeElement?.getAttribute?.("data-question-key") ?? null);
  check(`[${tag}] exact answer control receives focus`, focusedQuestionKey === QUESTION_KEY, `focused=${focusedQuestionKey}`);
  check(`[${tag}] URL carries exact topic + question`, urlHasTarget(page), page.url());
}

async function runMainJourney(browser, viewport) {
  const { context, page, hardErrors } = await createQaPage(browser, viewport);
  const tag = viewport.name;
  try {
    // Home -> compliance action -> exact topic + question.
    await page.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
    await waitForPortalReady(page);
    await page.waitForSelector("[data-testid='portal-action-row'][data-source-type='COMPLIANCE_MISSING_FACT']", { timeout: 20000 });

    const homeRow = page.locator("[data-testid='portal-action-row'][data-source-type='COMPLIANCE_MISSING_FACT']").first();
    const homeTitle = homeRow.locator("p").first();
    const titleWhiteSpace = await homeTitle.evaluate((node) => getComputedStyle(node).whiteSpace);
    const titleOverflow = await homeTitle.evaluate((node) => getComputedStyle(node).textOverflow);
    check(`[${tag}] home action CTA uses the exact canonical href`, (await homeRow.locator("[data-testid='portal-action-cta']").getAttribute("href")) === EXPECTED_HREF);
    check(`[${tag}] long question text wraps on the action row`, titleWhiteSpace !== "nowrap" && titleOverflow !== "ellipsis", `white-space=${titleWhiteSpace} overflow=${titleOverflow}`);

    await homeRow.locator("[data-testid='portal-action-cta']").click();
    await waitForTopicDetail(page);
    await assertExactQuestionOpen(page, `${tag}-home`, "home journey");

    // Browser Back returns to the Home action list, Forward re-opens the exact question.
    await page.goBack({ waitUntil: "domcontentloaded" });
    await waitForPortalReady(page);
    check(`[${tag}] Back returns to Home`, new URL(page.url()).pathname === "/portal", page.url());
    await page.goForward({ waitUntil: "domcontentloaded" });
    await waitForTopicDetail(page);
    await assertExactQuestionOpen(page, `${tag}-forward`, "forward journey");

    // Teendők -> compliance action -> exact topic + question.
    await page.goto(`${BASE_URL}/portal/teendoim`, { waitUntil: "networkidle" });
    await waitForPortalReady(page);
    await page.waitForSelector("[data-testid='portal-action-center-list'] [data-testid='portal-action-row'][data-source-type='COMPLIANCE_MISSING_FACT']", { timeout: 20000 });
    const teendokRow = page.locator("[data-testid='portal-action-center-list'] [data-testid='portal-action-row'][data-source-type='COMPLIANCE_MISSING_FACT']").first();
    check(`[${tag}] Teendők action CTA uses the exact canonical href`, (await teendokRow.locator("[data-testid='portal-action-cta']").getAttribute("href")) === EXPECTED_HREF);
    await teendokRow.locator("[data-testid='portal-action-cta']").click();
    await waitForTopicDetail(page);
    await assertExactQuestionOpen(page, `${tag}-teendok`, "teendok journey");

    check(`[${tag}] no console/page errors`, hardErrors.length === 0, hardErrors.slice(0, 2).join(" || "));
    await page.screenshot({ path: path.join(SHOTS, `exact-question-${tag}.png`), fullPage: true });
  } finally {
    await context.close();
  }
}

async function runSameRouteAndHistoryScenario(browser) {
  const { context, page, hardErrors } = await createQaPage(browser, VIEWPORTS[0]);
  const tag = "desktop-route";
  try {
    // Parameter-less overview.
    await page.goto(`${BASE_URL}/portal/megfeleles`, { waitUntil: "networkidle" });
    await waitForOverview(page);
    check(`[${tag}] no-param load shows the overview`, (await page.locator("[data-testid='org-compliance-topic-detail']").count()) === 0);

    // Same-route Link navigation from the overview worklist (no reload).
    await page.evaluate(() => { window.__ux02Marker = "alive"; });
    const worklistLink = page.locator("a", { hasText: "Adat megadása →" }).first();
    check(`[${tag}] worklist row uses the same canonical route`, (await worklistLink.getAttribute("href")) === EXPECTED_HREF);
    await worklistLink.click();
    await waitForTopicDetail(page);
    await assertExactQuestionOpen(page, tag, "same-route link");
    check(`[${tag}] same-route navigation did not reload the page`, (await page.evaluate(() => window.__ux02Marker)) === "alive");

    // Back / Forward re-sync from the URL.
    await page.goBack({ waitUntil: "domcontentloaded" });
    await waitForOverview(page);
    check(`[${tag}] Back re-syncs to the overview`, new URL(page.url()).search === "", page.url());
    await page.goForward({ waitUntil: "domcontentloaded" });
    await waitForTopicDetail(page);
    await assertExactQuestionOpen(page, `${tag}-forward`, "forward re-sync");
    check(`[${tag}] marker survived Back/Forward`, (await page.evaluate(() => window.__ux02Marker)) === "alive");

    // Manual Állapotok topic detail.
    await page.goto(`${BASE_URL}/portal/megfeleles`, { waitUntil: "networkidle" });
    await waitForOverview(page);
    await page.getByRole("button", { name: "Állapotok", exact: true }).click();
    await page.locator("button", { hasText: "Részletek megnyitása →" }).first().click();
    await waitForTopicDetail(page);
    const manualUrl = new URL(page.url());
    check(`[${tag}] manual Állapotok detail opens the topic`, manualUrl.searchParams.get("topic") !== null, manualUrl.search);
    check(`[${tag}] manual topic detail never guesses a question`, manualUrl.searchParams.get("question") === null, manualUrl.search);

    // Stale question: topic still renders, truthful notice, no guessed question.
    await page.goto(`${BASE_URL}/portal/megfeleles?topic=${encodeURIComponent(TOPIC_ID)}&question=stale_unknown_question`, { waitUntil: "networkidle" });
    await waitForTopicDetail(page);
    check(`[${tag}] stale question keeps the topic visible`, (await page.locator("body").innerText()).includes(TOPIC_LABEL));
    check(`[${tag}] stale question shows the truthful notice`, (await page.locator("[data-testid='portal-compliance-question-unavailable']").count()) === 1);
    check(`[${tag}] stale question opens no answer control`, (await page.locator("[data-testid='portal-compliance-answer-control']").count()) === 0);

    // Unknown topic fails safely back to the overview.
    await page.goto(`${BASE_URL}/portal/megfeleles?topic=unknown%2Ftopic`, { waitUntil: "networkidle" });
    await waitForOverview(page);
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has("topic"), null, { timeout: 10000 });
    check(`[${tag}] unknown topic falls back to the overview and cleans the URL`, new URL(page.url()).search === "", page.url());

    check(`[${tag}] no console/page errors`, hardErrors.length === 0, hardErrors.slice(0, 2).join(" || "));
    await page.screenshot({ path: path.join(SHOTS, "route-history-desktop.png"), fullPage: true });
  } finally {
    await context.close();
  }
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true });
  submittedAnswerRequests = [];
  console.log(`Starting Next.js production server on port ${PORT}...`);
  await startServer();
  console.log("Server ready. Launching Chromium...");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      await runMainJourney(browser, viewport);
    }
    await runSameRouteAndHistoryScenario(browser);
  } finally {
    await browser.close();
    stopServer();
  }
  check("no answer was submitted during browser QA", submittedAnswerRequests.length === 0, `${submittedAnswerRequests.length} PUT request(s)`);
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
