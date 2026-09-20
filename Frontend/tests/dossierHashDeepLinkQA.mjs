/**
 * Dossier legacy-hash deep-link verification against the real built app.
 * Deterministic synthetic session + contract-compatible API mocks; never touches Azure/PG.
 *
 * Run against an already-served frontend (dev or built):
 *   npx next dev -p 3099
 *   DOSSIER_BASE=http://127.0.0.1:3099 node tests/dossierHashDeepLinkQA.mjs
 *
 * Verifies: the collapsed "Részletes dosszié-adatok" auto-opens for
 * #vallalati-mukodes / #szerzodes-tar / #szervezet, the requested target is
 * actually scrolled into view, the open state is stable (no oscillation), and
 * hashchange + back/forward preserve the behavior.
 */
import { chromium } from "playwright";

const BASE = process.env.DOSSIER_BASE || "http://127.0.0.1:3099";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const CASE_ID = "22222222-2222-4222-8222-222222222222";

const AUTH_ME = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "QA Ügyvéd",
  email: "qa@example.test",
  role: "ADMIN",
  organizationId: "44444444-4444-4444-8444-444444444444",
};
const CLIENT = { id: CLIENT_ID, name: "QA Ügyfél Kft.", email: "qa@client.test", phone: null, address: null, taxNumber: null, companyRegistrationNumber: null, authorizedRepresentative: null, contactPerson: null, colorKey: null, archivedAt: null };

function mock(url) {
  if (url.includes("/auth/me")) return { status: 200, body: AUTH_ME };
  if (url.includes(`/client-identity/admin/workspaces`)) return { status: 200, body: { items: [{ id: "qa-ws", clientId: CLIENT_ID, name: "QA szervezet", mode: "ORGANIZATION", status: "ACTIVE", communicationMode: "PORTAL", connectedSystemState: "NOT_CONNECTED" }] } };
  if (url.includes("/hourly-rates/clients/")) return { status: 200, body: { asOf: "2026-01-01T00:00:00.000Z", canManage: false, effective: { status: "UNRESOLVED", currency: "HUF", hourlyRate: null, scope: "UNRESOLVED", rateVersionId: null, effectiveFrom: null, caseMode: "INHERIT_CLIENT", caseVersionId: null }, next: null, history: [] } };
  if (url.includes("/house-style")) return { status: 200, body: null };
  if (url.includes("/client-company/clients/")) return { status: 200, body: { items: [] } };
  if (url.includes("/client-contracts/clients/")) return { status: 200, body: { items: [] } };
  if (url.includes("/client-organization/clients/")) return { status: 200, body: { items: [] } };
  if (url.includes(`/communications/client/`)) return { status: 200, body: { communications: [], client: { id: CLIENT_ID, name: CLIENT.name } } };
  if (url.includes(`/cases/${CASE_ID}/documents`)) return { status: 200, body: [] };
  if (/\/cases\?/.test(url)) return { status: 200, body: { data: [{ id: CASE_ID, caseNumber: "QA-1", title: "QA ügy", matterType: "QA", status: "ACTIVE", assignedLawyer: null, updatedAt: "2026-01-01T00:00:00.000Z" }], page: 1, limit: 100, total: 1, totalPages: 1 } };
  if (url.endsWith(`/clients/${CLIENT_ID}`)) return { status: 200, body: CLIENT };
  return { status: 200, body: { items: [] } };
}

async function newPage(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-workforce-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_ME });
  await page.route("**/api/v1/**", (route) => {
    const r = mock(route.request().url());
    return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
  });
  return { context, page };
}

const DETAILS = "#reszletes-dosszie-adatok";
const isOpen = (page) => page.locator(DETAILS).evaluate((el) => el.hasAttribute("open"));

async function visibility(page, anchor) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return { found: false };
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      found: true,
      display: style.display,
      width: rect.width,
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      viewport: window.innerHeight,
      inViewport: rect.bottom > 0 && rect.top < window.innerHeight && rect.height > 0,
    };
  }, anchor);
}

const results = [];
function record(name, pass, detail) {
  results.push(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const anchor of ["vallalati-mukodes", "szerzodes-tar", "szervezet"]) {
      const { context, page } = await newPage(browser, { width: 1366, height: 900 });
      await page.goto(`${BASE}/clients/${CLIENT_ID}#${anchor}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("header.adm-board-hero", { timeout: 90000 });
      await page.waitForSelector(DETAILS, { timeout: 30000 });
      await page.waitForTimeout(1200);
      const open = await isOpen(page);
      record(`deeplink ${anchor} opens details`, open);
      const vis = await visibility(page, anchor);
      record(`deeplink ${anchor} target visible`, Boolean(vis.found && vis.display !== "none" && vis.width > 0), JSON.stringify(vis));
      record(`deeplink ${anchor} scrolled into view`, Boolean(vis.inViewport), JSON.stringify(vis));

      // stability: no oscillation over ~1.6s
      const states = [];
      for (let i = 0; i < 8; i += 1) { states.push(await isOpen(page)); await page.waitForTimeout(200); }
      record(`deeplink ${anchor} details state stable`, states.every((s) => s === true), states.join(","));
      await context.close();
    }

    // hashchange on an already-loaded page (no reload)
    {
      const { context, page } = await newPage(browser, { width: 1366, height: 900 });
      await page.goto(`${BASE}/clients/${CLIENT_ID}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("header.adm-board-hero", { timeout: 90000 });
      await page.waitForSelector(DETAILS, { timeout: 30000 });
      await page.waitForTimeout(800);
      const closedInitially = await isOpen(page);
      record("default dossier details closed", !closedInitially);
      await page.evaluate(() => { window.location.hash = "#szerzodes-tar"; });
      await page.waitForTimeout(700);
      const open = await isOpen(page);
      const vis = await visibility(page, "szerzodes-tar");
      record("hashchange opens details", open);
      record("hashchange target visible", Boolean(vis.found && vis.display !== "none" && vis.width > 0), JSON.stringify(vis));
      record("hashchange scrolled into view", Boolean(vis.inViewport), JSON.stringify(vis));

      // back/forward
      await page.goBack();
      await page.waitForTimeout(500);
      const afterBack = await isOpen(page);
      record("back keeps details stable (no crash)", typeof afterBack === "boolean", "open=" + afterBack);
      await page.goForward();
      await page.waitForTimeout(500);
      const afterFwd = await isOpen(page);
      const visFwd = await visibility(page, "szerzodes-tar");
      record("forward restores hash and keeps target reachable", afterFwd && visFwd.display !== "none" && visFwd.width > 0, JSON.stringify(visFwd));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`FAILED=${failed.length}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });


