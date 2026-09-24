/**
 * Focused browser QA for the /clients directory convergence.
 *
 * Uses the canonical workforce QA pattern: a production `next start` server
 * receives a deterministic synthetic session and contract-compatible API
 * responses. It never contacts Azure, PostgreSQL, or production data and it
 * does not build any new auth infrastructure.
 *
 * Run after `npm run build`:  node tests/clientsBrowserQA.mjs
 */
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CLIENTS_QA_PORT || 3097);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(os.tmpdir(), "kilo", "clients-directory-qa");

const AUTH_ME = {
  id: "qa-user",
  email: "qa-user@adminiculum.test",
  name: "Dr. Adminiculum Ügyvéd",
  role: "ADMIN",
};

let MOCK_CLIENTS = [
  { id: "c1", name: "Acme Corp Kft.", colorKey: "BLUE", contactPerson: "Kovács János", email: "kovacs@acme.test", phone: "+36 30 123 4567", taxNumber: "12345678-2-41", relationshipMode: "PORTAL_CENTRIC" },
  { id: "c2", name: "Budapest Tech Nyrt.", colorKey: "GREEN", contactPerson: "Nagy Anna", email: "anna@budapesttech.test", phone: "+36 20 987 6543", taxNumber: "87654321-2-42", relationshipMode: "PORTAL_CENTRIC" },
  { id: "c3", name: "Corvinus Legal Zrt.", colorKey: "RED", contactPerson: "Szabó Péter", email: "szabo@corvinus.test", phone: null, taxNumber: "11223344-2-43", relationshipMode: "STANDARD" },
  { id: "c4", name: "Danubius Invest Kft.", colorKey: "AMBER", contactPerson: null, email: "info@danubius.test", phone: "+36 1 234 5678", taxNumber: null, relationshipMode: "STANDARD" },
  { id: "c5", name: "Etele Logistics Kft.", colorKey: "PURPLE", contactPerson: "Tóth Gábor", email: null, phone: "+36 70 555 1234", taxNumber: "33445566-2-44", relationshipMode: "PORTAL_CENTRIC" },
  { id: "c6", name: "Fórum Média Kft.", colorKey: null, contactPerson: "Varga Eszter", email: "varga@forum.test", phone: null, taxNumber: null, relationshipMode: "STANDARD" },
  { id: "c7", name: "Gellért Pharma Kft.", colorKey: "TEAL", contactPerson: null, email: null, phone: null, taxNumber: null, relationshipMode: "STANDARD" },
  { id: "c8", name: "Hungária Ingatlan Kft.", colorKey: "ORANGE", contactPerson: "Molnár Zoltán", email: "molnar@hungaria.test", phone: "+36 30 999 8888", taxNumber: "99887766-2-45", relationshipMode: "PORTAL_CENTRIC" },
  { id: "c9", name: "Infopark Capital Zrt.", colorKey: "INDIGO", contactPerson: "Farkas Dóra", email: "dora@infopark.test", phone: "+36 20 111 2222", taxNumber: "55667788-2-46", relationshipMode: "STANDARD" },
  { id: "c10", name: "Józsefváros Dental Kft.", colorKey: "ROSE", contactPerson: "Balogh Tamás", email: "balogh@dental.test", phone: "+36 70 444 3333", taxNumber: "77889900-2-47", relationshipMode: "PORTAL_CENTRIC" },
  { id: "c11", name: "Kárpátia Szálloda Kft.", colorKey: "SLATE", contactPerson: "Kiss László", email: "kiss@karpatia.test", phone: "+36 1 888 7777", taxNumber: "44556677-2-48", relationshipMode: "STANDARD" },
  { id: "c12", name: "Lánchíd Consulting Kft.", colorKey: null, contactPerson: null, email: "consulting@lanchid.test", phone: "+36 30 777 6666", taxNumber: "66778899-2-49", relationshipMode: "STANDARD" },
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
        setTimeout(resolve, 1000);
      }
    };
    server.stdout.on("data", onOutput);
    server.stderr.on("data", onOutput);
    server.on("error", reject);
    server.on("exit", (code) => {
      if (!ready) reject(new Error(`next start exited before ready: ${code}`));
    });
    setTimeout(() => {
      if (!ready) reject(new Error("Timed out waiting for next start"));
    }, 30000);
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

async function setupPage(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const hardErrors = [];
  page.on("pageerror", (err) => hardErrors.push(String(err)));

  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-clients-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_ME });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (url.includes("/auth/me")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AUTH_ME) });
    }

    if (/\/clients(\?|$)/.test(url.split("/api/v1")[1] || "") && method === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: MOCK_CLIENTS }) });
    }

    const patchMatch = url.match(/\/clients\/([^/?#]+)/);
    if (patchMatch && method === "PATCH") {
      const clientId = decodeURIComponent(patchMatch[1]);
      const payload = JSON.parse(request.postData() || "{}");
      const client = MOCK_CLIENTS.find((c) => c.id === clientId);
      if (client) {
        if (payload.colorKey !== undefined) client.colorKey = payload.colorKey;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(client) });
      }
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) });
    }

    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });

  return { context, page, hardErrors };
}

async function tileCount(page) {
  return page.locator('[data-testid^="client-tile-"]').count();
}

async function expectNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, `${label} must not have horizontal overflow`);
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log("Starting production server...");
  await startServer();
  console.log(`Server ready at ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });
  let failures = 0;

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const label = `${viewport.width}x${viewport.height}`;
    const { context, page, hardErrors } = await setupPage(browser, viewport);
    try {
      await page.goto(`${BASE_URL}/clients`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="client-tile-c1"]');

      // 1. Tile grid is the default view and renders every client exactly once.
      assert.equal(await tileCount(page), MOCK_CLIENTS.length, `${label}: all clients render as tiles`);
      assert.equal(await page.locator("table").count(), 0, `${label}: table is not the default view`);
      await expectNoOverflow(page, label);
      await page.screenshot({ path: path.join(SHOTS, `clients-${label}-tiles.png`), fullPage: true });

      // 2. Search preserves behavior and renders a single matching tile.
      const search = page.locator('input[type="search"]');
      await search.fill("Acme");
      await page.waitForTimeout(250);
      assert.equal(await tileCount(page), 1, `${label}: search filters to exactly one tile`);
      assert.equal(await page.locator('[data-testid="client-tile-c1"]').count(), 1, `${label}: searched client visible`);
      await search.fill("");
      await page.waitForTimeout(250);

      // 3. Table/list remains reachable as the secondary view.
      await page.getByRole("button", { name: "Lista" }).click();
      await page.waitForTimeout(150);
      assert.equal(await page.locator("table").count(), 1, `${label}: Lista shows the table`);
      assert.equal(await tileCount(page), 0, `${label}: tiles hidden in table view`);
      await page.getByRole("button", { name: "Csempék" }).click();
      await page.waitForTimeout(150);
      assert.equal(await tileCount(page), MOCK_CLIENTS.length, `${label}: Csempék restores the tile grid`);

      // 4. Direct tile color edit is reachable, accessible, server-driven.
      const neutralTrigger = page.locator('[data-testid="client-tile-c6"] button[aria-label*="Ügyfélszín módosítása"]');
      await neutralTrigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog.locator('label:has-text("Rózsaszín")').click();
      await dialog.getByRole("button", { name: "Mentés" }).click();
      await dialog.waitFor({ state: "detached" });
      await page.waitForTimeout(200);
      const c6Class = (await page.locator('[data-testid="client-tile-c6"]').getAttribute("class")) || "";
      assert.match(c6Class, /border-l-rose-600/, `${label}: saved server color is reflected on the tile`);

      // 5. Clearing color returns the tile to neutral.
      const blueTrigger = page.locator('[data-testid="client-tile-c1"] button[aria-label*="Ügyfélszín módosítása"]');
      await blueTrigger.click();
      const clearDialog = page.getByRole("dialog");
      await clearDialog.waitFor();
      await clearDialog.locator('label:has-text("Nincs színjelölés")').click();
      await clearDialog.getByRole("button", { name: "Mentés" }).click();
      await clearDialog.waitFor({ state: "detached" });
      await page.waitForTimeout(200);
      const c1Class = (await page.locator('[data-testid="client-tile-c1"]').getAttribute("class")) || "";
      assert.doesNotMatch(c1Class, /border-l-blue-600/, `${label}: cleared color removes the blue rail`);
      assert.match(c1Class, /border-\[var\(--adm-border\)\]/, `${label}: cleared color resolves to the canonical neutral rail`);

      // 6. Dosszié and + Új ügy destinations are preserved.
      const dossier = page.locator('[data-testid="client-tile-c1"] a', { hasText: "Dosszié" }).first();
      const dossierHref = await dossier.getAttribute("href");
      assert.equal(dossierHref, "/clients/c1", `${label}: Dosszié destination preserved`);
      const newCaseHref = await page
        .locator('[data-testid="client-tile-c1"] a[aria-label*="Új ügy indítása"]')
        .getAttribute("href");
      assert.ok(newCaseHref && newCaseHref.includes("/cases?newCase=1&clientId=c1"), `${label}: + Új ügy preserves clientId`);

      if (viewport.width <= 390) {
        // Narrow: actions and color control stay reachable and named.
        assert.equal(await dossier.isVisible(), true, "narrow: Dosszié visible");
        assert.equal(
          await page.locator('[data-testid="client-tile-c1"] a[aria-label*="Új ügy indítása"]').isVisible(),
          true,
          "narrow: + Új ügy visible",
        );
        assert.match(
          (await blueTrigger.getAttribute("aria-label")) || "",
          /Ügyfélszín módosítása: Acme Corp Kft\./,
          "narrow: color control names the client",
        );
      }

      assert.deepEqual(hardErrors, [], `${label}: no page errors`);

      await page.screenshot({ path: path.join(SHOTS, `clients-${label}-final.png`), fullPage: true });
      console.log(`PASS ${label}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${label}: ${error.message}`);
      await page.screenshot({ path: path.join(SHOTS, `clients-${label}-failure.png`), fullPage: true }).catch(() => {});
    } finally {
      await context.close();
    }
  }

  await browser.close();
  stopServer();

  console.log(`Screenshots: ${SHOTS}`);
  if (failures > 0) process.exit(1);
  console.log("CLIENTS_BROWSER_QA=PASS");
}

run().catch((error) => {
  console.error("CLIENTS_BROWSER_QA=ERROR", error);
  stopServer();
  process.exit(1);
});
