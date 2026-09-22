import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PILOT_PORT || 3099);
const BASE_URL = `http://localhost:${PORT}`;
const MODE = process.argv[2] || "before";
const OUT_DIR = path.join(ROOT, "qa-screenshots-pilot", MODE);

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

let server;

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT)], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), NEXT_PUBLIC_ENABLE_LOCAL_DEV_AUTH: "true" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    let ready = false;
    const onOutput = (chunk) => {
      const text = chunk.toString();
      if (!ready && /ready|started server/i.test(text)) {
        ready = true;
        setTimeout(resolve, 1500);
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

const QA_USER = {
  id: "user-1",
  name: "Dr. Adminiculum Ügyvéd",
  email: "ugyved@adminiculum.hu",
  role: "ADMIN",
};

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

const MOCK_PORTAL_WORKSPACE = {
  actions: [
    {
      id: "act-1",
      title: "Aláírás szükséges az adásvételi szerződéshez",
      matterTitle: "Acme Kft. Ingatlan",
      status: "OPEN",
      bucket: "now",
      dueAt: "2026-03-30T12:00:00.000Z",
      actionUrl: "/portal/teendoim",
    },
    {
      id: "act-2",
      title: "Hiányzó adóazonosító megadása",
      matterTitle: "Acme Kft. Ingatlan",
      status: "OPEN",
      bucket: "upcoming",
      dueAt: "2026-04-05T12:00:00.000Z",
      actionUrl: "/portal/teendoim",
    },
    {
      id: "act-3",
      title: "Cégkivonat megküldése",
      matterTitle: "Acme Kft. Ingatlan",
      status: "COMPLETED",
      bucket: "completed",
      dueAt: "2026-02-15T12:00:00.000Z",
      actionUrl: "/portal/teendoim",
    },
  ],
  documents: [
    {
      id: "doc-1",
      title: "Adásvételi szerződés tervezete v1.docx",
      kind: "SHARED_DOCUMENT",
      status: "Elérhető",
      publishedAt: "2026-03-20T10:00:00.000Z",
      matterTitle: "Acme Kft. Ingatlan",
      actionUrl: "/portal/documents/doc-1",
    },
  ],
  messages: [],
  upcomingDeadlines: [],
  matterCount: 1,
};

async function main() {
  console.log(`[${MODE.toUpperCase()}] Starting Next.js server on port ${PORT}...`);
  await startServer();
  console.log("Server ready, launching browser...");

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });

    await context.route("**/api/v1/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/auth/me")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(QA_USER),
        });
      }
      if (url.includes("/client-portal/me")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_IDENTITY_CONTEXT),
        });
      }
      if (url.includes("/client-portal/home")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ activeMatters: [], recentDocuments: [], contactSummary: { openCount: 0, unreadCount: 0, latestPreview: null }, complianceSummary: null, relationshipMode: "PORTAL_CENTRIC", attention: [], updates: [] }),
        });
      }
      if (url.includes("/client-portal/workspace")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PORTAL_WORKSPACE),
        });
      }
      if (url.includes("/client-portal/org/home")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            customer: { name: "Teszt Vállalat Kft." },
            matters: [],
            actions: [
              {
                id: "act-1",
                title: "Aláírás szükséges az adásvételi szerződéshez",
                context: "Acme Kft. Ingatlan",
                bucket: "now",
                dueAt: "2026-03-30T12:00:00.000Z",
                href: "/portal/teendoim",
              },
              {
                id: "act-2",
                title: "Hiányzó adóazonosító megadása",
                context: "Acme Kft. Ingatlan",
                bucket: "upcoming",
                dueAt: "2026-04-05T12:00:00.000Z",
                href: "/portal/teendoim",
              },
            ],
            recentDocuments: [],
            contactSummary: { openCount: 0, unreadCount: 0, latestPreview: null, latestUpdatedAt: null },
            complianceSummary: { attentionCount: 1, inProgressCount: 2, noActionExpectedCount: 5, topics: [] },
          }),
        });
      }
      if (url.includes("/client-portal/org/units")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: "u-1", name: "Ingatlanjog" }] }) });
      }
      if (url.includes("/client-portal/org/cases")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                id: "case-1",
                caseNumber: "UGY-2026-001",
                title: "Acme Kft. Ingatlan adásvételi szerződés",
                status: "ACTIVE",
                assignedUnit: "Ingatlanjog",
                description: "Szerződéskötés előkészítése",
              },
            ],
          }),
        });
      }
      if (url.includes("/client-portal/org/intakes")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
      }
      if (url.includes("/client-portal/org/summary")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ units: [] }) });
      }
      if (url.includes("/client-portal/org/contracts")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
      }
      if (url.includes("/client-portal/org/company")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ companyName: "Teszt Vállalat Kft.", profileHeadline: "Vállalati működés.", groups: [], visibleMattersByArea: [], totalVisibleMatterCount: 0, milestones: [], initiatives: [] }) });
      }
      if (url.includes("/client-portal/compliance")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            topics: [
              {
                topicId: "top-1",
                topicLabel: "GDPR Adatkezelés",
                state: "RESOLVED",
                shortExplanation: "Adatkezelési tájékoztató és nyilvántartások felülvizsgálata.",
                missingInformation: [],
                nextAction: null,
                documents: [],
              },
            ],
            controlsSummary: [],
            attentionCount: 1,
            inProgressCount: 2,
            noActionExpectedCount: 5,
          }),
        });
      }
      if (url.includes("/cases/attention")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [] }),
        });
      }
      if (url.includes("/cases?")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [
              {
                id: "case-1",
                caseNumber: "UGY-2026-001",
                title: "Acme Kft. Ingatlan adásvételi szerződés",
                matterType: "REAL_ESTATE",
                clientId: "client-1",
                clientName: "Acme Kereskedelmi Kft.",
                status: "ACTIVE",
                priority: "HIGH",
                assignedLawyer: { id: "user-1", name: "Dr. Adminiculum Ügyvéd" },
                clientColorKey: "blue",
                createdAt: "2026-01-15T10:00:00.000Z",
              },
              {
                id: "case-2",
                caseNumber: "UGY-2026-002",
                title: "Beta Zrt. Munkaszerződés felülvizsgálat",
                matterType: "EMPLOYMENT",
                clientId: "client-2",
                clientName: "Beta Solutions Zrt.",
                status: "ACTIVE",
                priority: "NORMAL",
                assignedLawyer: { id: "user-1", name: "Dr. Adminiculum Ügyvéd" },
                clientColorKey: "gold",
                createdAt: "2026-02-01T14:30:00.000Z",
              },
            ],
            total: 2,
          }),
        });
      }
      if (url.includes("/clients")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [
              {
                id: "client-1",
                name: "Acme Kereskedelmi Kft.",
                email: "info@acme.hu",
                phone: "+36 1 234 5678",
                taxNumber: "12345678-2-41",
                contactPerson: "Kovács János",
                colorKey: "blue",
                relationshipMode: "COLLABORATIVE",
              },
              {
                id: "client-2",
                name: "Beta Solutions Zrt.",
                email: "kapcsolat@betasolutions.hu",
                phone: "+36 20 987 6543",
                taxNumber: "87654321-2-42",
                contactPerson: "Nagy Éva",
                colorKey: "gold",
                relationshipMode: "PORTAL_CENTRIC",
              },
            ],
          }),
        });
      }
      if (url.includes("/settings/workflows") || url.includes("/workflow-templates")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                id: "wf-1",
                key: "ingatlan-standard",
                name: "Ingatlan adásvétel standard",
                description: "Standard 4-lépéses folyamat ingatlanügyletekhez",
                version: 1,
                status: "ACTIVE",
                usageCount: 14,
                steps: [
                  { key: "lepes-1", title: "Tulajdoni lap ellenőrzése", dependsOn: [], publicMilestoneCandidate: true },
                  { key: "lepes-2", title: "Szerződéstervezet készítése", dependsOn: ["lepes-1"], publicMilestoneCandidate: false },
                ],
              },
              {
                id: "wf-2",
                key: "szerzodes-review",
                name: "Általános szerződés-review",
                description: "Bejövő partneri szerződések jogi ellenőrzése",
                version: 2,
                status: "DRAFT",
                usageCount: 0,
                steps: [
                  { key: "lepes-1", title: "Kockázatelemzés", dependsOn: [], publicMilestoneCandidate: false },
                ],
              },
            ],
          }),
        });
      }
      if (url.includes("/users")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([QA_USER]),
        });
      }

      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });

    const page = await context.newPage();

    page.on("pageerror", (err) => console.error("PAGE_ERROR:", err.message));

    // Minification-safe MSAL controller interceptor
    await page.addInitScript(({ profile }) => {
      localStorage.setItem("auth_token", "qa-workforce-token");
      localStorage.setItem("adminiculum:auth_token:workforce", "qa-workforce-token");
      localStorage.setItem("adminiculum:auth_token:customer", "qa-customer-token");
      localStorage.setItem("adminiculum:client-portal-token", "qa-customer-token");
      localStorage.setItem("adminiculum:client-portal-workspace", "ws-tesztvallalat-org");
      sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));

      Object.defineProperty(Object.prototype, "controller", {
        set(val) {
          Object.defineProperty(this, "controller", { value: val, writable: true, configurable: true });
          if (typeof this.getAllAccounts === "function" && typeof this.acquireTokenSilent === "function") {
            const proto = Object.getPrototypeOf(this);
            proto.getAllAccounts = function () {
              return [
                {
                  homeAccountId: profile.id,
                  environment: "login.windows.net",
                  tenantId: "",
                  username: profile.email,
                  localAccountId: profile.id,
                  name: profile.name,
                },
              ];
            };
            proto.acquireTokenSilent = async function () {
              return { accessToken: "qa-workforce-token" };
            };
            proto.handleRedirectPromise = async function () {
              return null;
            };
            proto.getActiveAccount = function () {
              return {
                homeAccountId: profile.id,
                environment: "login.windows.net",
                tenantId: "",
                username: profile.email,
                localAccountId: profile.id,
                name: profile.name,
              };
            };
          }
        },
        get() {
          return undefined;
        },
        configurable: true,
      });
    }, { profile: QA_USER });

    // 1. Cases Page
    console.log("Capturing /cases...");
    await page.goto(`${BASE_URL}/cases`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "screen_1_cases.png"), fullPage: true });

    // 2. Clients Page
    console.log("Capturing /clients...");
    await page.goto(`${BASE_URL}/clients`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "screen_2_clients.png"), fullPage: true });

    // 3. Settings Workflows Page
    console.log("Capturing /settings/workflows...");
    await page.goto(`${BASE_URL}/settings/workflows`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "screen_3_settings_workflows.png"), fullPage: true });

    // 4. Portal Tasks Page (PILOT)
    console.log("Capturing /portal/teendoim...");
    await page.goto(`${BASE_URL}/portal/teendoim`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "screen_4_portal_teendoim.png"), fullPage: true });

    // 5. Portal Home (NON-PILOT)
    console.log("Capturing /portal...");
    await page.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "nonpilot_1_portal.png"), fullPage: true });

    // 6. Portal Matters (NON-PILOT)
    console.log("Capturing /portal/ugyek...");
    await page.goto(`${BASE_URL}/portal/ugyek`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "nonpilot_2_portal_ugyek.png"), fullPage: true });

    // 7. Portal Documents (NON-PILOT)
    console.log("Capturing /portal/dokumentumok...");
    await page.goto(`${BASE_URL}/portal/dokumentumok`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "nonpilot_3_portal_dokumentumok.png"), fullPage: true });

    // 8. Portal Compliance (NON-PILOT)
    console.log("Capturing /portal/megfeleles...");
    await page.goto(`${BASE_URL}/portal/megfeleles`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "nonpilot_4_portal_megfeleles.png"), fullPage: true });

    console.log(`[${MODE.toUpperCase()}] screenshots captured successfully to:`, OUT_DIR);
  } finally {
    await browser.close();
    stopServer();
  }
}

main().catch((err) => {
  console.error("Capture failed:", err);
  stopServer();
  process.exit(1);
});
