/**
 * Dossier shell/layout + capability verification against the real built app.
 * Deterministic synthetic session + contract-compatible API mocks; never touches Azure/PG.
 *
 * Run against an already-served frontend (dev or built):
 *   npx next dev -p 3099
 *   DOSSIER_BASE=http://127.0.0.1:3099 node tests/dossierLayoutQA.mjs
 *
 * Verifies at 1366px and 1728px, ORGANIZATION and INDIVIDUAL:
 *   - exactly one canonical top navigation, no competing "Grow with us";
 *   - exactly one visible "••• Haladó" and exactly one "Ügyfélműveletek";
 *   - Ügyfélműveletek opens ClientLifecycleControls; Új ügy opens the dialog;
 *   - Ügyfélportál kezelése and További eszközök destinations remain reachable;
 *   - the collapsed legacy detail area is closed and below the fold by default;
 *   - organization-only surfaces (workgroups, #szervezet preview, top-nav
 *     organization modules) stay hidden in INDIVIDUAL mode.
 */
import { chromium } from "playwright";

const BASE = process.env.DOSSIER_BASE || "http://127.0.0.1:3099";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const CASE_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_ME = { id: "33333333-3333-4333-8333-333333333333", name: "QA Ügyvéd", email: "qa@example.test", role: "ADMIN", organizationId: "44444444-4444-4444-8444-444444444444" };
const CLIENT = { id: CLIENT_ID, name: "QA Ügyfél Kft.", email: "qa@client.test", phone: null, address: null, taxNumber: null, companyRegistrationNumber: null, authorizedRepresentative: null, contactPerson: null, colorKey: null, archivedAt: null };

function mock(url, wsMode) {
  if (url.includes("/auth/me")) return { status: 200, body: AUTH_ME };
  if (url.includes("/client-identity/admin/workspaces")) return { status: 200, body: { items: [{ id: "qa-ws", clientId: CLIENT_ID, name: "QA szervezet", mode: wsMode, status: "ACTIVE", communicationMode: "PORTAL", connectedSystemState: "NOT_CONNECTED" }] } };
  if (url.includes("/hourly-rates/clients/")) return { status: 200, body: { asOf: "2026-01-01T00:00:00.000Z", canManage: false, effective: { status: "UNRESOLVED", currency: "HUF", hourlyRate: null, scope: "UNRESOLVED", rateVersionId: null, effectiveFrom: null, caseMode: "INHERIT_CLIENT", caseVersionId: null }, next: null, history: [] } };
  if (url.includes("/house-style")) return { status: 200, body: null };
  if (url.includes("/client-company/clients/")) return { status: 200, body: { items: [] } };
  if (url.includes("/client-contracts/clients/")) return { status: 200, body: { items: [] } };
  if (url.includes("/client-organization/clients/")) return { status: 200, body: { items: [] } };
  if (url.includes("/communications/client/")) return { status: 200, body: { communications: [], client: { id: CLIENT_ID, name: CLIENT.name } } };
  if (url.includes(`/cases/${CASE_ID}/documents`)) return { status: 200, body: [] };
  if (/\/cases\?/.test(url)) return { status: 200, body: { data: [{ id: CASE_ID, caseNumber: "QA-1", title: "QA ügy", matterType: "QA", status: "ACTIVE", assignedLawyer: null, updatedAt: "2026-01-01T00:00:00.000Z" }], page: 1, limit: 100, total: 1, totalPages: 1 } };
  if (url.endsWith(`/clients/${CLIENT_ID}`)) return { status: 200, body: CLIENT };
  return { status: 200, body: { items: [] } };
}

const results = [];
const record = (name, pass, detail) => results.push(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);

async function openPage(browser, width, wsMode) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-workforce-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_ME });
  await page.route("**/api/v1/**", (route) => {
    const r = mock(route.request().url(), wsMode);
    return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
  });
  await page.goto(`${BASE}/clients/${CLIENT_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header.adm-board-hero", { timeout: 90000 });
  await page.waitForSelector("#reszletes-dosszie-adatok", { timeout: 30000 });
  await page.waitForTimeout(1200);
  return { context, page };
}

async function staticChecks(browser, width, wsMode) {
  const label = `${width}/${wsMode}`;
  const { context, page } = await openPage(browser, width, wsMode);

  const info = await page.evaluate(() => {
    const visible = (el) => el && el.checkVisibility ? el.checkVisibility() : Boolean(el && el.offsetParent !== null);
    const links = [...document.querySelectorAll("a")].filter(visible);
    const summaries = [...document.querySelectorAll("summary")].filter(visible);
    const navCount = links.filter((a) => a.textContent.trim() === "Vállalati működés").length;
    const haladoCount = summaries.filter((s) => s.textContent.trim() === "••• Haladó").length;
    const muveletCount = summaries.filter((s) => s.textContent.trim() === "Ügyfélműveletek").length;
    const visibleTabs = links.map((a) => a.textContent.trim());
    const growWithUs = [...document.querySelectorAll("*")].filter((n) => n.children.length === 0 && visible(n) && n.textContent.trim() === "Grow with us").length;
    const d = document.getElementById("reszletes-dosszie-adatok");
    const inner = d ? d.querySelector("section") : null;
    return {
      navCount, haladoCount, muveletCount, visibleTabs, growWithUs,
      legacy: d ? { open: d.hasAttribute("open"), top: Math.round(d.getBoundingClientRect().top), innerVisible: inner ? (inner.checkVisibility ? inner.checkVisibility() : inner.offsetParent !== null) : null, innerHeight: inner ? Math.round(inner.getBoundingClientRect().height) : 0 } : null,
    };
  });

  record(`${label} exactly one canonical top navigation`, wsMode === "ORGANIZATION" ? info.navCount === 1 : info.navCount === 0, "count=" + info.navCount);
  record(`${label} exactly one visible "••• Haladó"`, info.haladoCount === 1, "count=" + info.haladoCount);
  record(`${label} exactly one "Ügyfélműveletek"`, info.muveletCount === 1, "count=" + info.muveletCount);
  record(`${label} no competing "Grow with us"`, info.growWithUs === 0);
  for (const t of ["Szervezet", "Vállalati működés", "Grow", "Megfelelés"]) {
    if (wsMode === "ORGANIZATION") record(`${label} top nav has ${t}`, info.visibleTabs.includes(t));
    else record(`${label} individual hides ${t}`, !info.visibleTabs.includes(t));
  }

  record(`${label} Ügyfélportál kezelése reachable`, await page.locator(`a[href="/clients/${CLIENT_ID}/portal"]`).first().isVisible());
  const tools = page.locator('section[aria-label="További eszközök"]');
  record(`${label} További eszközök visible`, await tools.isVisible());
  for (const text of ["Nyitott ügyek", "Lezárt ügyek megnyitása", "Munkaórák", "Számlázás előkészítése", "Dokumentum hozzáadása"]) {
    record(`${label} tools has ${text}`, await tools.locator("a", { hasText: text }).first().isVisible().catch(() => false));
  }
  const newCase = page.locator("button", { hasText: "Új ügy" }).first();
  record(`${label} Új ügy visible+enabled`, (await newCase.isVisible()) && (await newCase.isEnabled()));

  record(`${label} legacy detail collapsed by default`, Boolean(info.legacy) && info.legacy.open === false);
  record(`${label} legacy detail content not visible`, Boolean(info.legacy) && info.legacy.innerVisible === false, JSON.stringify(info.legacy));
  record(`${label} legacy detail below the fold`, Boolean(info.legacy) && info.legacy.top >= 400, "top=" + (info.legacy ? info.legacy.top : "n/a"));

  const workgroupsVisible = await page.locator(`a[href="/clients/${CLIENT_ID}/workgroups"]:visible`).first().isVisible().catch(() => false);
  const szervezetInDom = await page.locator("#szervezet").count();
  if (wsMode === "ORGANIZATION") {
    record(`${label} organization shows workgroups link`, workgroupsVisible);
    record(`${label} organization renders #szervezet preview`, szervezetInDom === 1);
  } else {
    record(`${label} individual hides workgroups link`, !workgroupsVisible);
    record(`${label} individual omits #szervezet preview`, szervezetInDom === 0);
  }
  await context.close();
}

async function interactionChecks(browser, width, wsMode) {
  const label = `${width}/${wsMode}`;

  // 1. Ügyfélműveletek opens the lifecycle controls.
  {
    const { context, page } = await openPage(browser, width, wsMode);
    await page.locator("summary", { hasText: "Ügyfélműveletek" }).click();
    await page.waitForTimeout(400);
    const archiveVisible = await page.locator("text=Ügyfél archiválása").first().isVisible().catch(() => false);
    record(`${label} Ügyfélműveletek opens lifecycle controls`, archiveVisible);
    await context.close();
  }

  // 2. Új ügy opens the canonical dialog (isolated; may navigate on submit).
  {
    const { context, page } = await openPage(browser, width, wsMode);
    await page.locator("button", { hasText: "Új ügy" }).first().click();
    const dialog = page.locator("h2", { hasText: "Új ügy" }).first();
    const appeared = await dialog.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
    record(`${label} Új ügy opens the canonical dialog`, appeared);
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1366, 1728]) {
      await staticChecks(browser, width, "ORGANIZATION");
      await staticChecks(browser, width, "INDIVIDUAL");
    }
    for (const width of [1366, 1728]) {
      await interactionChecks(browser, width, "ORGANIZATION");
    }
  } finally {
    await browser.close();
  }
  console.log(results.join("\n"));
  console.log("FAILED=" + results.filter((r) => r.startsWith("FAIL")).length);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
