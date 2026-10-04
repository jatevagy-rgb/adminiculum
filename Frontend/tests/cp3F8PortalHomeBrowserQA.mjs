/** CP3 F8 synthetic browser QA — ORGANIZATION portal home + shell after the
 * Antigravity UX adoption (351a9c91) and the R1-R4 truthfulness repairs.
 *
 * Local production build (next start) + intercepted customer APIs.
 * This is NOT live authenticated acceptance. No real API writes are made.
 * Run (after the bounded production build):
 *   node tests/cp3F8PortalHomeBrowserQA.mjs
 * QA-only synthetic auth values, never deployment configuration.
 *
 * Honest scope: synthetic route APIs cannot prove live authentication,
 * scanner, or server authorization; those remain NOT_RUN here.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.CP3_F8_HOME_QA_PORT || 3112);
const base = `http://127.0.0.1:${port}`;
const shots = process.env.CP3_F8_HOME_QA_OUTPUT || path.join(os.tmpdir(), "cp3-f8-home-qa");
fs.mkdirSync(shots, { recursive: true });

const workspace = {
  publicReference: "ws-f8",
  name: "Szervezeti munkatér",
  clientDisplayName: "F8 Teszt Kft.",
  mode: "ORGANIZATION",
  status: "ACTIVE",
  communicationMode: "PORTAL_PRIMARY",
  connectedSystemState: "NOT_CONFIGURED",
  membershipRole: "APPROVER",
  capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true },
};

const matterRow1 = {
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

const matterRow2 = {
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
  lastPublishedUpdateAt: "2026-10-02T09:00:00.000Z",
};

// The server-resolved featured matter is mp-demo-2 even though it is the
// SECOND card: the badge must follow currentMatter.publicationId, not order.
const orgHomeFixture = {
  customer: { name: "F8 Teszt Kft." },
  currentMatter: {
    publicationId: "mp-demo-2",
    title: matterRow2.publicTitle,
    status: matterRow2.publicStatus,
    currentPosition: "Irodai tervezet készítése",
    nextStep: matterRow2.nextStep,
    waitingOn: matterRow2.waitingOn,
    publicTargetDate: matterRow2.publicTargetDate,
    progressPercentage: 40,
    milestones: [],
  },
  matters: [matterRow1, matterRow2],
  mattersTotal: 4,
  actions: [],
  recentDocuments: [
    {
      id: "doc-1",
      matterTitle: "Kereskedelmi megállapodás",
      title: "Szerződéstervezet v4.2",
      publishedAt: "2026-09-28T10:00:00.000Z",
      downloadAvailable: true,
    },
  ],
  contactSummary: { openCount: 1, unreadCount: 0, latestPreview: null, latestUpdatedAt: null },
  growSummary: {
    activeInitiativesCount: 2,
    initiatives: [{ id: "g1", title: "Beszerzési folyamat digitalizálása", statusLabel: "Folyamatban", targetState: null }],
    knownProcessesCount: 3,
  },
  complianceSummary: {
    attentionCount: 1,
    inProgressCount: 1,
    noActionExpectedCount: 1,
    topics: [{ topicId: "t1", topicLabel: "Adatvédelem", state: "ACTION_IN_PROGRESS", nextAction: "Adatkezelési tájékoztató pontosítása" }],
  },
};

const actionItems = [
  {
    id: "act-1",
    sourceType: "CLIENT_ACTION_REQUEST",
    sourceId: "req-01",
    domain: "LEGAL",
    kind: "UPLOAD",
    title: "Cégkivonat feltöltése",
    contextLabel: "Kereskedelmi megállapodás · PER-2026-042",
    dueAt: "2026-09-30T10:00:00.000Z",
    urgency: "OVERDUE",
    state: "CORRECTION_REQUIRED",
    actionLabel: "Feltöltés megnyitása",
    href: "/portal/matters/mp-demo-1/requests/req-01",
    canCompleteInPortal: true,
    matterPublicationId: "mp-demo-1",
  },
  {
    id: "act-2",
    sourceType: "COMPLIANCE_MISSING_FACT",
    sourceId: "t1-adatkezeles",
    domain: "COMPLIANCE",
    kind: "ANSWER",
    title: "Adatkezelési hozzájárulások pontosítása",
    contextLabel: "Adatvédelem",
    dueAt: "2026-10-05T17:00:00.000Z",
    urgency: "DUE_SOON",
    state: "OPEN",
    actionLabel: "Kérdések megválaszolása",
    href: "/portal/megfeleles?topic=adatvedelem",
    canCompleteInPortal: true,
    matterPublicationId: null,
  },
];

const actionCenterFixture = {
  items: actionItems,
  counts: { open: 2, overdue: 1, dueSoon: 1 },
};

let server, browser;
let actionsFail = false;

async function start() {
  server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local server startup timeout")), 45000);
    const ready = (chunk) => {
      if (/ready/i.test(String(chunk))) {
        clearTimeout(timer);
        resolve();
      }
    };
    server.stdout.on("data", ready);
    server.stderr.on("data", ready);
    server.once("error", reject);
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Local server exit ${code}`));
    });
  });
}

async function prepare(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(Object.prototype, "controller", {
      configurable: true,
      set(value) {
        Object.defineProperty(this, "controller", { value, writable: true, configurable: true });
        if (typeof this.getAllAccounts === "function" && typeof this.acquireTokenSilent === "function") {
          const proto = Object.getPrototypeOf(this);
          const account = { homeAccountId: "f8-qa", environment: "login.windows.net", tenantId: "", username: "f8@example.test", localAccountId: "f8-qa", name: "F8 Teszt" };
          proto.getAllAccounts = () => [account];
          proto.getActiveAccount = () => account;
          proto.acquireTokenSilent = async () => ({ accessToken: "synthetic-f8-token" });
          proto.handleRedirectPromise = async () => null;
        }
      },
    });
    localStorage.setItem("adminiculum:client-portal-workspace", "ws-f8");
    localStorage.setItem("adminiculum:auth_token:customer", "synthetic-f8-token");
  });
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname.replace(/^\/api\/v1/, "");
    let body = {};
    let status = 200;
    if (pathname === "/client-portal/me") body = { identity: { displayName: "F8 Teszt", email: "f8@example.test", accountType: "ORGANIZATION" }, state: "READY", workspaces: [workspace], selectedWorkspace: workspace };
    else if (pathname === "/client-portal/home") body = { portalActionsEnabled: true, relationshipMode: "PORTAL_CENTRIC", access: { state: "READY", grantCount: 1 }, attention: [], matters: [], updates: [] };
    else if (pathname === "/client-portal/workspace") body = { actions: [], documents: [], messages: [], upcomingDeadlines: [], matterCount: 1 };
    else if (pathname === "/client-portal/org/home") body = orgHomeFixture;
    else if (pathname === "/client-portal/org/action-center") {
      if (actionsFail) {
        status = 503;
        body = { message: "Synthetic action-center outage" };
      } else {
        body = actionCenterFixture;
      }
    } else if (pathname === "/client-portal/org/cases") body = { items: [], total: 0 };
    else if (pathname === "/client-portal/org/company-profile") body = { questions: [], screens: [] };
    else if (pathname === "/client-portal/compliance") body = { topics: [], controlsSummary: [] };
    else if (pathname === "/client-portal/compliance/requests") body = { items: [], counts: { awaitingCustomer: 0, officeProcessing: 0, closed: 0, requestedDocuments: 0, openQuestions: 0 }, generatedAt: new Date().toISOString() };
    else if (pathname === "/client-portal/org/grow") body = { processes: [], initiatives: [], opportunities: [], outcomes: { measured: [], calculatedOrEstimated: [] }, surveys: [] };
    else if (pathname === "/client-portal/org/grow-assessments") body = { packs: [], aggregatedFindings: [] };
    else if (pathname === "/client-portal/org/grow-survey") body = { items: [] };
    else { status = 404; body = { message: "Synthetic endpoint not configured" }; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return { context, page, errors };
}

async function screenshot(page, name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(shots, name), fullPage: true });
}

const results = [];

async function homeSuccessChecks(page, tag) {
  await page.goto(`${base}/portal`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='portal-home-v3']", { timeout: 15000 });
  await page.waitForSelector("[data-testid='portal-home-v3-stats']", { timeout: 15000 });

  const statsText = await page.evaluate(() => document.querySelector("[data-testid='portal-home-v3-stats']")?.textContent || "");
  assert.match(statsText, /Közzétett ügy/, `Közzétett ügy stat missing at ${tag}`);
  assert.match(statsText, /4/, `canonical mattersTotal (4) missing at ${tag}: ${statsText}`);
  assert.match(statsText, /Teendő/, `Teendő stat missing at ${tag}`);
  assert.match(statsText, /2/, `action count missing at ${tag}`);
  assert.match(statsText, /Lejárt/, `overdue stat missing at ${tag}`);

  const sectionTestIds = ["portal-home-v3-actions", "portal-home-v3-matters", "portal-home-v3-grow", "portal-home-v3-compliance", "portal-home-v3-documents"];
  for (const id of sectionTestIds) {
    assert.ok(await page.locator(`[data-testid='${id}']`).count() > 0, `section ${id} missing at ${tag}`);
  }

  const badgeRows = await page.evaluate(() =>
    [...document.querySelectorAll("[data-testid='portal-home-v3-matters'] li")]
      .filter((li) => (li.textContent || "").includes("Kiemelt ügy"))
      .map((li) => li.querySelector("a")?.getAttribute("href")),
  );
  assert.deepEqual(badgeRows, ["/portal/matters/mp-demo-2"], `Kiemelt ügy must follow currentMatter identity, got ${JSON.stringify(badgeRows)} at ${tag}`);

  const nextStepIn = await page.evaluate(() => {
    const lis = [...document.querySelectorAll("[data-testid='portal-home-v3-matters'] li")];
    return lis.map((li) => ({ text: li.textContent || "", href: li.querySelector("a")?.getAttribute("href") || "" }));
  });
  const featured = nextStepIn.find((row) => row.href.endsWith("mp-demo-2"));
  assert.ok(featured && featured.text.includes("Következő lépés:"), `featured next-step callout missing at ${tag}`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, `horizontal overflow at ${tag}`);
  await screenshot(page, `home-success-${tag}.png`);
}

async function touchTargetChecks(page, tag) {
  const rects = await page.evaluate(() => {
    const pick = (id) => {
      const el = document.querySelector(`[data-testid='${id}']`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    };
    return { cta: pick("portal-cta-new-intake"), trigger: pick("portal-account-menu-trigger") };
  });
  assert.ok(rects.cta && rects.cta.height >= 40, `CTA touch target too small at ${tag}: ${JSON.stringify(rects.cta)}`);
  assert.ok(rects.trigger && rects.trigger.height >= 40, `account trigger touch target too small at ${tag}: ${JSON.stringify(rects.trigger)}`);
}

async function actionsFailureChecks(page, tag) {
  actionsFail = true;
  await page.goto(`${base}/portal`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='portal-home-v3']", { timeout: 15000 });
  await page.waitForSelector("[data-testid='portal-home-v3-actions-unavailable']", { timeout: 15000 });

  const statsText = await page.evaluate(() => document.querySelector("[data-testid='portal-home-v3-stats']")?.textContent || "");
  assert.match(statsText, /Közzétett ügy/, `matters stat must survive action failure at ${tag}`);
  assert.doesNotMatch(statsText, /Teendő(?!k)/, `Teendő stat must not render on action failure at ${tag}: ${statsText}`);
  assert.doesNotMatch(statsText, /Lejárt/, `Lejárt stat must not render on action failure at ${tag}`);
  assert.match(statsText, /Teendők nem érhetők el/, `truthful unavailable state missing at ${tag}`);

  assert.ok(await page.locator("[data-testid='portal-home-v3-matters']").count() > 0, `matters section must stay usable at ${tag}`);
  assert.ok(await page.locator("[data-testid='portal-home-v3-grow']").count() > 0, `grow section must stay usable at ${tag}`);

  // Retry while the API is still failing: the truthful state persists, never
  // stale success and never a fabricated zero.
  await page.click("[data-testid='portal-home-v3-actions-unavailable']");
  await page.waitForSelector("[data-testid='portal-home-v3-actions-unavailable']", { timeout: 15000 });
  const statsAfterRetry = await page.evaluate(() => document.querySelector("[data-testid='portal-home-v3-stats']")?.textContent || "");
  assert.doesNotMatch(statsAfterRetry, /Teendő(?!k)/, `stale success must not appear after a failed retry at ${tag}`);
  assert.match(statsAfterRetry, /Teendők nem érhetők el/, `unavailable state must persist after a failed retry at ${tag}`);
  await screenshot(page, `home-actions-failure-${tag}.png`);

  // Recovery: API returns, retry chip fetches and the stats come back truthful.
  actionsFail = false;
  await page.click("[data-testid='portal-home-v3-actions-unavailable']");
  await page.waitForFunction(() => {
    const stats = document.querySelector("[data-testid='portal-home-v3-stats']");
    return stats && /Teendő(?!k)/.test(stats.textContent || "");
  }, { timeout: 15000 });
  const recovered = await page.evaluate(() => document.querySelector("[data-testid='portal-home-v3-stats']")?.textContent || "");
  assert.match(recovered, /Teendő(?!k)/, `Teendő stat must recover after retry at ${tag}`);
  assert.equal(await page.locator("[data-testid='portal-home-v3-actions-unavailable']").count(), 0, `unavailable chip must clear after recovery at ${tag}`);
  await screenshot(page, `home-actions-recovered-${tag}.png`);
  actionsFail = false;
}

async function accountMenuChecks(page, tag) {
  await page.goto(`${base}/portal`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='portal-home-v3']", { timeout: 15000 });
  await page.click("[data-testid='portal-account-menu-trigger']");
  await page.waitForSelector("[data-testid='portal-account-menu']", { timeout: 5000 });

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[data-testid='portal-account-menu']"), { timeout: 5000 });
  const focusedAfterEscape = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(focusedAfterEscape, "portal-account-menu-trigger", `Escape must refocus the trigger at ${tag}, got ${focusedAfterEscape}`);

  await page.click("[data-testid='portal-account-menu-trigger']");
  await page.waitForSelector("[data-testid='portal-account-menu']", { timeout: 5000 });
  await page.keyboard.press("ArrowDown");
  const first = await page.evaluate(() => document.activeElement?.getAttribute("role"));
  assert.equal(first, "menuitem", `ArrowDown must focus a menuitem at ${tag}, got ${first}`);
  const itemIds = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.getAttribute("data-testid")));
  if (itemIds.length > 1) {
    await page.keyboard.press("ArrowDown");
    const second = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
    assert.notEqual(second, itemIds[0], `ArrowDown must advance focus at ${tag}`);
    await page.keyboard.press("ArrowUp");
    const back = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
    assert.equal(back, itemIds[0], `ArrowUp must return focus at ${tag}`);
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[data-testid='portal-account-menu']"), { timeout: 5000 });
  await screenshot(page, `home-account-menu-${tag}.png`);
}

async function mobileMoreChecks(page, tag) {
  await page.goto(`${base}/portal`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='portal-home-v3']", { timeout: 15000 });
  await page.click("[data-testid='org-portal-more-trigger']");
  await page.waitForSelector("[role='dialog']", { timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[role='dialog']"), { timeout: 5000 });
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(focused, "org-portal-more-trigger", `More close must refocus the trigger after unmount at ${tag}, got ${focused}`);
}

try {
  await start();
  browser = await chromium.launch({ headless: true });

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    const tag = `${viewport.width}x${viewport.height}`;
    const { context, page, errors } = await prepare(viewport);

    await homeSuccessChecks(page, tag);
    await touchTargetChecks(page, tag);
    await actionsFailureChecks(page, tag);

    if (viewport.width === 1440) await accountMenuChecks(page, tag);
    if (viewport.width === 390) await mobileMoreChecks(page, tag);

    assert.deepEqual(errors, [], `page errors at ${tag}: ${errors.join(" | ")}`);
    results.push({ viewport: tag, home: true, actionsFailure: true, touch: true, menu: viewport.width === 1440, mobileMore: viewport.width === 390 });
    await context.close();
  }

  const manifest = { generatedAt: new Date().toISOString(), results, screenshots: fs.readdirSync(shots).sort() };
  fs.writeFileSync(path.join(shots, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve)).catch(() => {});
  }
}
