/** F7 synthetic browser QA. Local production build + intercepted customer APIs.
 * This is NOT live authenticated acceptance. No real API writes are made.
 * Build with synthetic public auth configuration (PowerShell):
 * $env:NEXT_PUBLIC_ENTRA_CLIENT_ID='f7-synthetic-client'
 * $env:NEXT_PUBLIC_ENTRA_AUTHORITY='https://f7.ciamlogin.com/f7'
 * $env:NEXT_PUBLIC_ENTRA_REDIRECT_URI='http://127.0.0.1:3107/portal'
 * $env:NEXT_PUBLIC_ADMINICULUM_API_SCOPE='api://f7-synthetic/access_as_client'
 * npm run build
 * node tests/clientPortalV3CheckpointF7BrowserQA.mjs
 * These values are QA-only, never deployment configuration.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.CP3_F7_QA_PORT || 3107);
const base = `http://127.0.0.1:${port}`;
const shots = process.env.CP3_F7_QA_OUTPUT || path.join(os.tmpdir(), "cp3-f7-qa");
fs.mkdirSync(shots, { recursive: true });
const workspace = { publicReference: "ws-f7", name: "Szervezeti munkatér", clientDisplayName: "F7 Teszt Kft.", mode: "ORGANIZATION", status: "ACTIVE", communicationMode: "PORTAL_PRIMARY", connectedSystemState: "NOT_CONFIGURED", membershipRole: "APPROVER", capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true } };
const matter = { publicReference: "F7-2026-01", matterPublicationId: "mp-1", publicTitle: "Szerződés felülvizsgálata", relationshipToCase: "OWN", publicStatus: "Folyamatban", customerActionRequired: true, nextStep: null, publicTargetDate: null };
const request = { id: "r1", caseId: "case-1", type: "INFORMATION_REQUEST", title: "Szerződés adatainak pontosítása", instructions: null, dueAt: null, required: true, status: "PUBLISHED", documentSpec: null, publishedAt: "2026-09-30T10:00:00Z", fields: [] };
const thread = { id: "t1", subject: "Hosszú kérdés tárgya — " + "Szerződésrészlet".repeat(10), status: "ANSWERED" };
const messageBody = "Az iroda válasza.\nA következő bekezdés külön sorban olvasható.\n" + "HosszúDokumentumHivatkozás".repeat(12);
let server, browser;

async function start() {
  server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local server startup timeout")), 45000);
    const ready = (chunk) => { if (/ready/i.test(String(chunk))) { clearTimeout(timer); resolve(); } };
    server.stdout.on("data", ready);
    server.stderr.on("data", ready);
    server.once("error", reject);
    server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Local server exit ${code}`)); });
  });
}

async function prepare(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Same synthetic MSAL seam as the existing CP3 checkpoint browser harnesses.
  await page.addInitScript(() => {
    Object.defineProperty(Object.prototype, "controller", {
      configurable: true,
      set(value) {
        Object.defineProperty(this, "controller", { value, writable: true, configurable: true });
        if (typeof this.getAllAccounts === "function" && typeof this.acquireTokenSilent === "function") {
          const proto = Object.getPrototypeOf(this);
          const account = { homeAccountId: "f7-qa", environment: "login.windows.net", tenantId: "", username: "f7@example.test", localAccountId: "f7-qa", name: "F7 Teszt" };
          proto.getAllAccounts = () => [account];
          proto.getActiveAccount = () => account;
          proto.acquireTokenSilent = async () => ({ accessToken: "synthetic-f7-token" });
          proto.handleRedirectPromise = async () => null;
        }
      },
    });
    localStorage.setItem("adminiculum:client-portal-workspace", "ws-f7");
    localStorage.setItem("auth_token", "synthetic-f7-token");
  });
  const state = { failList: true, failThread: true, writes: 0, empty: false, denySend: false, calls: [] };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname.replace(/^\/api\/v1/, "");
    state.calls.push(`${req.method()} ${pathname}`);
    let body = {}, status = 200;
    if (pathname === "/client-portal/me") body = { identity: { displayName: "F7 Teszt", email: "f7@example.test", accountType: "ORGANIZATION" }, state: "READY", workspaces: [workspace], selectedWorkspace: workspace };
    else if (pathname === "/client-portal/home") body = { portalActionsEnabled: true, relationshipMode: "PORTAL_CENTRIC", access: { state: "READY", grantCount: 1 }, attention: [], matters: [], updates: [] };
    else if (pathname === "/client-portal/workspace") body = { actions: [], documents: [], messages: [], upcomingDeadlines: [], matterCount: 1 };
    else if (pathname === "/client-portal/org/cases") body = { items: [matter], total: 1 };
    else if (pathname === "/client-portal/org/cases/F7-2026-01") body = { ...matter, currentStatusText: "Az iroda dolgozik az ügyön.", safeMilestones: [], capabilities: { showTimeline: true, showDocuments: true, allowUploads: true, showMessages: true, allowMessages: !state.denySend, showHours: false, showBillingStatement: false } };
    else if (pathname === "/client-portal/matters/mp-1") body = { id: "mp-1", caseId: "case-1", title: matter.publicTitle, statusLabel: "Folyamatban", documents: [], actionRequests: [], updates: [], milestones: [] };
    else if (pathname === "/client-portal/org/action-center") body = { items: [], counts: { total: 0 } };
    else if (pathname === "/client-interaction/cases/case-1/requests/r1") body = request;
    else if (pathname === "/client-interaction/cases/case-1/requests") body = { items: [] };
    else if (pathname === "/client-interaction/cases/case-1/submissions") body = { items: [] };
    else if (pathname === "/client-interaction/cases/case-1/questions") {
      if (req.method() === "POST") {
        assert.deepEqual(req.postDataJSON(), { subject: "Új kérdés", bodySafe: "Az ügy részleteiről érdeklődöm." });
        state.writes++;
        state.failList = true;
        body = thread;
      } else if (state.failList) { status = 503; body = { message: "Unavailable" }; }
      else body = { items: state.empty ? [] : [thread] };
    } else if (pathname === "/client-interaction/cases/case-1/questions/t1") {
      if (state.failThread) { status = 503; body = { message: "Unavailable" }; }
      else body = { ...thread, messages: [{ id: "m1", authorType: "INTERNAL", body: messageBody, sentAt: "2026-09-30T10:00:00Z" }] };
    } else { status = 404; body = { message: "Synthetic endpoint not configured" }; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return { context, page, state, errors };
}

async function verifyLayout(page) {
  const result = await page.evaluate(() => {
    const elements = [...document.querySelectorAll('[data-testid="portal-questions-panel"] button, [data-testid="portal-questions-panel"] input, [data-testid="portal-questions-panel"] textarea')].filter((el) => el.getClientRects().length);
    return { overflow: document.documentElement.scrollWidth > innerWidth, targets: elements.map((el) => ({ label: el.textContent || el.getAttribute("name"), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })) };
  });
  assert.equal(result.overflow, false, JSON.stringify(result));
  for (const target of result.targets) assert.ok(target.w >= 40 && target.h >= 40, JSON.stringify(target));
}

async function screenshot(page, name) {
  // Capture from the top so sticky portal chrome is not stranded halfway
  // down a full-page image after Playwright scrolled a control into view.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(shots, name), fullPage: true });
}

try {
  await start();
  browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    const { context, page, state, errors } = await prepare(viewport);
    for (const [routeName, url] of [["matter", "/portal/matters/mp-1"], ["request", "/portal/matters/mp-1/requests/r1"]]) {
      state.failList = true; state.failThread = true; state.empty = false;
      await page.goto(base + url, { waitUntil: "networkidle" });
      const panel = page.getByTestId("portal-questions-panel");
      await panel.getByRole("button", { name: "Újratöltés" }).waitFor();
      assert.equal(await panel.getByText("Még nincs kérdésszál.", { exact: true }).count(), 0);
      state.failList = false;
      await panel.getByRole("button", { name: "Újratöltés" }).click();
      const toggle = panel.getByRole("button", { name: /Hosszú kérdés tárgya/ });
      await toggle.waitFor();
      await page.keyboard.press("Tab");
      await toggle.focus();
      assert.equal(await toggle.evaluate((el) => el.matches(":focus-visible")), true);
      await page.keyboard.press("Enter");
      await panel.getByRole("button", { name: "Újratöltés" }).waitFor();
      await verifyLayout(page);
      state.failThread = false;
      await panel.getByRole("button", { name: "Újratöltés" }).click();
      await panel.getByText(/Az iroda válasza/).waitFor();
      assert.equal(await panel.getByText("Az adatok betöltése sikertelen.").count(), 0);
      await verifyLayout(page);
      await screenshot(page, `${routeName}-${viewport.width}.png`);
      await toggle.focus(); await page.keyboard.press("Space");
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      await page.getByRole("textbox", { name: /^Tárgy/ }).fill("Új kérdés");
      await page.getByRole("textbox", { name: /^Kérdés szövege/ }).fill("Az ügy részleteiről érdeklődöm.");
      const before = state.writes;
      await page.getByTestId("portal-question-send").click();
      await page.getByText("A kérdés beküldve. Az iroda válasza itt fog megjelenni.", { exact: true }).waitFor();
      await panel.getByRole("button", { name: "Újratöltés" }).waitFor();
      assert.equal(state.writes, before + 1);
      await verifyLayout(page);
      await screenshot(page, `${routeName}-refresh-error-${viewport.width}.png`);
      state.failList = false;
      await panel.getByRole("button", { name: "Újratöltés" }).click(); await toggle.waitFor();
      assert.equal(state.writes, before + 1);
      await page.reload({ waitUntil: "networkidle" });
      await panel.waitFor();
      assert.ok(page.url().endsWith(url), "refresh keeps exact deep link");
    }
    // Read-only and successful empty list on the actual matter route.
    state.denySend = true; state.empty = true; state.failList = false;
    await page.goto(base + "/portal/matters/mp-1", { waitUntil: "networkidle" });
    await page.getByText("Még nincs kérdésszál.", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("portal-question-send").count(), 0);
    await verifyLayout(page);
    if (viewport.width < 1024) {
      const more = page.getByTestId("org-portal-more-trigger");
      await more.focus(); await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog"); await dialog.waitFor();
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true);
      }
      await page.keyboard.press("Escape");
      assert.equal(await more.evaluate((el) => el === document.activeElement), true);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}px: both routes, retry, send/refresh split, keyboard, long content, targets, read-only, refresh identity`);
    await context.close();
  }
  console.log(`SYNTHETIC_BROWSER_QA=PASS; screenshots=${shots}; LIVE_ACCEPTANCE=NOT_RUN`);
} catch (error) {
  for (const context of browser?.contexts() || []) for (const page of context.pages()) {
    await page.screenshot({ path: path.join(shots, "failure.png"), fullPage: true }).catch(() => {});
    console.error((await page.locator("body").innerText()).slice(0, 2500));
  }
  throw error;
} finally {
  await browser?.close();
  if (server?.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/F", "/T", "/PID", String(server.pid)], { windowsHide: true, stdio: "ignore" });
    else server.kill("SIGTERM");
  }
}
