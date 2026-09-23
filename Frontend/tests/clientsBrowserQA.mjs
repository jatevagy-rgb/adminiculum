import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CLIENTS_QA_PORT || 3097);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "qa-screenshots-clients");

const AUTH_USER = {
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
  return new Promise(async (resolve, reject) => {
    try {
      const existing = await fetch(`http://127.0.0.1:${PORT}/clients`);
      if (existing.status === 200 || existing.status === 304 || existing.status === 307) {
        console.log(`Using already running server at http://127.0.0.1:${PORT}`);
        resolve();
        return;
      }
    } catch {}

    const standalonePath = path.join(ROOT, ".next", "standalone", "Frontend", "server.js");
    server = spawn(process.execPath, [standalonePath], {
      cwd: path.join(ROOT, ".next", "standalone", "Frontend"),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let ready = false;
    const checkReady = () => {
      if (ready) return;
      ready = true;
      resolve();
    };

    const poll = async () => {
      for (let i = 0; i < 60; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${PORT}/clients`);
          if (res.status === 200 || res.status === 304 || res.status === 307) {
            checkReady();
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!ready) reject(new Error("Timed out waiting for next start"));
    };

    server.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (/ready|started server|Local:|http/i.test(text)) {
        checkReady();
      }
    });
    server.stderr.on("data", (chunk) => {
      console.error("[next stderr]", chunk.toString());
    });
    server.on("error", reject);
    server.on("exit", (code) => {
      if (!ready) reject(new Error(`next start exited before ready: ${code}`));
    });

    poll();
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

  page.on("console", (msg) => console.log("[BROWSER CONSOLE]", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.error("[BROWSER ERROR]", err));
  page.on("requestfailed", (req) => console.log("[FAILED REQ]", req.url(), req.failure()?.errorText));
  page.on("response", (res) => {
    if (res.status() >= 400) console.log("[HTTP ERROR]", res.status(), res.url());
  });

  await page.addInitScript(({ profile }) => {
    localStorage.setItem("adminiculum:auth_token:workforce", "qa-token");
    localStorage.setItem("auth_token", "qa-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_USER });

  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/auth/me")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AUTH_USER) });
    }

    if (url.includes("/clients") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: MOCK_CLIENTS }),
      });
    }

    if (url.includes("/clients/") && method === "PATCH") {
      const match = url.match(/\/clients\/([^/?#]+)/);
      const clientId = match ? match[1] : null;
      const payload = JSON.parse(route.request().postData() || "{}");
      if (clientId) {
        const client = MOCK_CLIENTS.find((c) => c.id === clientId);
        if (client) {
          if (payload.colorKey !== undefined) {
            client.colorKey = payload.colorKey;
          }
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(client),
          });
        }
      }
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) });
    }

    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });

  return page;
}

async function runQA() {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

  console.log("Starting Next.js test server...");
  await startServer();
  console.log(`Server ready at ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Wide Desktop Tile Grid
    console.log("Capturing 1: Wide Desktop Tile Grid (1440x900)...");
    const pageWide = await setupPage(browser, { width: 1440, height: 900 });
    await pageWide.goto(`${BASE_URL}/clients`, { waitUntil: "networkidle" });
    await pageWide.waitForSelector('[data-testid="client-tile-c1"]');
    await pageWide.screenshot({ path: path.join(SHOTS, "01-clients-desktop-grid.png"), fullPage: true });

    // 2. Search Result
    console.log("Capturing 2: Search Result...");
    const searchInput = pageWide.locator('input[type="search"]');
    await searchInput.fill("Tech");
    await pageWide.waitForTimeout(300);
    await pageWide.screenshot({ path: path.join(SHOTS, "02-clients-search-result.png"), fullPage: true });
    await searchInput.fill("");
    await pageWide.waitForTimeout(300);

    // 3. Color Selector Modal Open on Neutral Client c6
    console.log("Capturing 3: Color Selector Modal Open...");
    const colorBtnC6 = pageWide.locator('[data-testid="client-tile-c6"] button[aria-label*="Ügyfélszín módosítása"]');
    await colorBtnC6.click();
    await pageWide.waitForSelector('text=Ügyfélszín módosítása');
    await pageWide.screenshot({ path: path.join(SHOTS, "03-clients-color-selector-open.png"), fullPage: true });

    // 4. Select Rose color and Save -> Updated Tile
    console.log("Capturing 4: Updated Tile After Save...");
    const roseOption = pageWide.locator('label:has-text("Rózsaszín")');
    await roseOption.click();
    await pageWide.locator('button:has-text("Mentés")').click();
    await pageWide.waitForTimeout(500);
    await pageWide.screenshot({ path: path.join(SHOTS, "04-clients-color-updated.png"), fullPage: true });

    // 5. Medium Viewport (768x1024) -> 2 columns
    console.log("Capturing 5: Medium Viewport (768x1024)...");
    const pageMedium = await setupPage(browser, { width: 768, height: 1024 });
    await pageMedium.goto(`${BASE_URL}/clients`, { waitUntil: "networkidle" });
    await pageMedium.waitForSelector('[data-testid="client-tile-c1"]');
    await pageMedium.screenshot({ path: path.join(SHOTS, "05-clients-medium-viewport.png"), fullPage: true });

    // 6. Narrow Mobile Viewport (390x844) -> 1 column
    console.log("Capturing 6: Narrow Mobile Viewport (390x844)...");
    const pageNarrow = await setupPage(browser, { width: 390, height: 844 });
    await pageNarrow.goto(`${BASE_URL}/clients`, { waitUntil: "networkidle" });
    await pageNarrow.waitForSelector('[data-testid="client-tile-c1"]');
    await pageNarrow.screenshot({ path: path.join(SHOTS, "06-clients-narrow-mobile.png"), fullPage: true });

    console.log("All screenshots captured successfully in qa-screenshots-clients/ !");
  } finally {
    await browser.close();
    stopServer();
  }
}

runQA().catch((err) => {
  console.error("QA Error:", err);
  stopServer();
  process.exit(1);
});
