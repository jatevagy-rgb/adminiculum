/**
 * GWU-2A: Internal Read-Only Diagnostic Workbench — Production-Server Browser QA.
 *
 * Proves in a real headless Chromium browser:
 *  1. /clients/[clientId]/grow loads the operational Grow workbench by default.
 *  2. /clients/[clientId]/grow?tab=diagnosztika loads GrowDiagnosticWorkbench.
 *  3. Áttekintés → Diagnosztika navigation works.
 *  4. Diagnosztika → Áttekintés works.
 *  5. Browser back/forward behaves correctly.
 *  6. No diagnostics mutation controls exist (WORKBENCH_MUTATION_CONTROLS=0).
 *  7. DECLARED and MEASURED sections render distinctly.
 *  8. EVIDENCE_RECORD and RESEARCH_EVIDENCE render distinctly.
 *  9. Linked vs unlinked research distinction is truthful.
 * 10. UNKNOWN wording is precise (explicit unknown, not completeness/unverified).
 * 11. Legacy ?view=journey still renders GrowJourney (detail/publication flow).
 * 12. No uncaught browser/page errors.
 * 13. Verified at desktop (1440x900) and mobile (390x844) viewports.
 */

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTH_ME, WORKFORCE_FIXTURE } from "./workforceBrowserFixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.WORKFORCE_QA_PORT || 3099);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "qa-screenshots-diagnostic-workbench");
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
      if (!ready && /ready|started server/i.test(chunk.toString())) {
        ready = true;
        setTimeout(resolve, 1000);
      }
    };
    server.stdout?.on("data", onOutput);
    server.stderr?.on("data", onOutput);
    server.on("error", reject);
    server.on("exit", (code) => {
      if (!ready) reject(new Error(`next start exited before ready: ${code}`));
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

const MOCK_DIAGNOSTIC_DTO = {
  client: {
    id: WORKFORCE_FIXTURE.client.id,
    name: WORKFORCE_FIXTURE.client.name,
    operatingProfile: {
      provenanceClass: "CANONICAL_STATE",
      status: "ACTIVE",
      complianceEnrollmentStatus: "MEGFELELŐ",
      summary: "QA operating profile summary.",
      lastReviewedAt: "2026-01-01T00:00:00.000Z",
      nextReviewAt: "2026-12-31T00:00:00.000Z",
    },
  },
  known: {
    facts: [
      {
        id: "fact-1",
        provenanceClass: "CANONICAL_STATE",
        type: "LEGAL_FORM",
        value: "Kft.",
        factDefinition: { key: "legal_form", domainCode: "LEGAL", valueType: "STRING" },
        scopeType: "COMPANY",
        factSubjectId: null,
        verificationStatus: "VERIFIED",
        determinationMethod: "CÉGKIVONAT",
        observedAt: "2026-01-01T00:00:00.000Z",
        effectiveAt: "2026-01-01T00:00:00.000Z",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
        supersededAt: null,
      },
      {
        id: "fact-2",
        provenanceClass: "CANONICAL_STATE",
        type: "EMPLOYEE_COUNT",
        value: "UNKNOWN",
        factDefinition: { key: "employee_count", domainCode: "HR", valueType: "NUMBER" },
        scopeType: "COMPANY",
        factSubjectId: null,
        verificationStatus: "UNKNOWN",
        determinationMethod: null,
        observedAt: null,
        effectiveAt: null,
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: null,
        supersededAt: null,
      },
    ],
    processes: [
      {
        id: "proc-1",
        provenanceClass: "CANONICAL_STATE",
        name: "Megrendelés teljesítés",
        category: "OPERATIONS",
        description: "Standard rendelési folyamat",
        criticality: "HIGH",
        frequency: "DAILY",
        status: "ACTIVE",
        owner: { id: AUTH_ME.id, name: AUTH_ME.name },
        organizationGroup: { id: "grp-1", name: "Operáció" },
        steps: [
          {
            id: "step-1",
            position: 0,
            name: "Rendelés felvétele",
            stepType: "DATA_ENTRY",
            isApproval: false,
            responsiblePerson: { id: AUTH_ME.id, name: AUTH_ME.name },
            system: { id: "sys-1", name: "ERP", category: "ERP" },
            estimatedActiveMinutes: 15,
            estimatedWaitingMinutes: 30,
          },
          {
            id: "step-2",
            position: 1,
            name: "Vezetői jóváhagyás",
            stepType: "APPROVAL",
            isApproval: true,
            responsiblePerson: { id: AUTH_ME.id, name: AUTH_ME.name },
            system: { id: "sys-1", name: "ERP", category: "ERP" },
            estimatedActiveMinutes: 10,
            estimatedWaitingMinutes: 60,
          },
        ],
      },
    ],
    systems: [
      {
        id: "sys-1",
        provenanceClass: "CANONICAL_STATE",
        name: "ERP Rendszer",
        category: "ERP",
        vendor: "SAP",
        purpose: "Vállalatirányítás",
        status: "ACTIVE",
        owner: { id: AUTH_ME.id, name: AUTH_ME.name },
      },
    ],
  },
  observed: {
    observations: [
      {
        id: "obs-1",
        provenanceClass: "DECLARED_OBSERVATION",
        observationType: "SURVEY_PAIN_POINT",
        observedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        sourceRecordId: "rec-survey-1",
        inputDigest: "sha256-inputhash123",
        source: { id: "src-1", sourceType: "PORTAL_SURVEY", name: "Digitális felmérés" },
        discoveryRun: { id: "run-1", status: "COMPLETED", startedAt: "2026-01-01T00:00:00.000Z" },
      },
    ],
    processSnapshots: [
      {
        id: "snap-1",
        provenanceClass: "MEASURED_SNAPSHOT",
        businessProcess: { id: "proc-1", name: "Megrendelés teljesítés" },
        metricVersion: "GROW_PROCESS_METRICS_V1",
        observedAt: "2026-01-01T00:00:00.000Z",
        inputDigest: "sha256-inputhash456",
        snapshotDigest: "sha256-snapdigest789",
        metrics: [
          { code: "TOTAL_ACTIVE_MINUTES", value: 25, unit: "MINUTES", metricVersion: "GROW_PROCESS_METRICS_V1" },
          { code: "TOTAL_WAITING_MINUTES", value: 90, unit: "MINUTES", metricVersion: "GROW_PROCESS_METRICS_V1" },
          { code: "TOTAL_CYCLE_MINUTES", value: 115, unit: "MINUTES", metricVersion: "GROW_PROCESS_METRICS_V1" },
          { code: "WAITING_SHARE", value: 0.78, unit: "RATIO", metricVersion: "GROW_PROCESS_METRICS_V1" },
          { code: "APPROVAL_STEP_COUNT", value: 1, unit: "COUNT", metricVersion: "GROW_PROCESS_METRICS_V1" },
          { code: "DATA_ENTRY_STEP_COUNT", value: 1, unit: "COUNT", metricVersion: "GROW_PROCESS_METRICS_V1" },
          { code: "HANDOFF_STEP_COUNT", value: 1, unit: "COUNT", metricVersion: "GROW_PROCESS_METRICS_V1" },
          { code: "RESPONSIBLE_PERSON_CHANGE_COUNT", value: 0, unit: "COUNT", metricVersion: "GROW_PROCESS_METRICS_V1" },
          { code: "SYSTEM_COUNT", value: 1, unit: "COUNT", metricVersion: "GROW_PROCESS_METRICS_V1" },
          { code: "SYSTEM_SWITCH_COUNT", value: 0, unit: "COUNT", metricVersion: "GROW_PROCESS_METRICS_V1" },
          { code: "UNASSIGNED_STEP_COUNT", value: 0, unit: "COUNT", metricVersion: "GROW_PROCESS_METRICS_V1" },
          { code: "PROCESS_OWNER_PRESENT", value: true, unit: "BOOLEAN", metricVersion: "GROW_PROCESS_METRICS_V1" },
        ],
        provenance: {
          source: "PROCESS_STEP_OBSERVATION",
          calculatedBy: "GROW_PROCESS_METRIC_ENGINE",
          stepCount: 2,
          inputFieldInventory: ["estimatedActiveMinutes", "estimatedWaitingMinutes", "isApproval"],
        },
      },
    ],
  },
  problems: {
    domains: [
      { id: "dom-1", provenanceClass: "DERIVED_DIAGNOSIS", key: "OPERATIONAL_EFFICIENCY", name: "Működési hatékonyság", description: "Folyamatsebesség", status: "ACTIVE" },
    ],
    diagnoses: [
      {
        id: "diag-1",
        provenanceClass: "DERIVED_DIAGNOSIS",
        title: "Kritikus várakozási torlódás a jóváhagyási pontnál",
        summary: "A jóváhagyási lépés várakozási ideje az átfutási idő 78%-át teszi ki.",
        status: "CONFIRMED",
        problemDomain: { id: "dom-1", key: "OPERATIONAL_EFFICIENCY", name: "Működési hatékonyság" },
        businessProcess: { id: "proc-1", name: "Megrendelés teljesítés" },
        evidence: [
          { id: "res-linked-1", title: "Tanulmány a jóváhagyási folyamatokról", verificationStatus: "VERIFIED", strength: "STRONG" },
        ],
      },
    ],
    sufficiency: [
      { recommendationId: "rec-1", provenanceClass: "RECOMMENDATION", decision: "SUPPORTED", evidenceCount: 1 },
    ],
  },
  proposed: {
    recommendations: [
      {
        id: "rec-1",
        provenanceClass: "RECOMMENDATION",
        title: "Automatizált küszöbérték-alapú jóváhagyás bevezetése",
        problemStatement: "A manuális vezetői jóváhagyás jelentős késleltetést okoz alacsony kockázatú rendeléseknél.",
        direction: "Be kell vezetni a szabályalapú automatikus routingot.",
        kind: "PROCESS_IMPROVEMENT",
        impactTags: ["efficiency", "cycle_time"],
        interventionCodes: ["REDESIGN_APPROVAL_ROUTING"],
        status: "ACCEPTED",
        sufficiency: "SUPPORTED",
        diagnosisId: "diag-1",
        domain: { key: "OPERATIONAL_EFFICIENCY", name: "Működési hatékonyság" },
        businessProcess: { id: "proc-1", name: "Megrendelés teljesítés" },
        evidence: [
          { id: "res-linked-1", title: "Tanulmány a jóváhagyási folyamatokról", verificationStatus: "VERIFIED", strength: "STRONG" },
        ],
      },
    ],
  },
  evidence: {
    records: [
      {
        id: "ev-rec-1",
        provenanceClass: "EVIDENCE_RECORD",
        sourceType: "CONTRACT_DOCUMENT",
        status: "VALID",
        title: "Éves beszállítói keretszerződés",
        description: "Mért átfutási idő határidőkkel",
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: "2026-12-31T00:00:00.000Z",
        clientFactId: null,
        observationId: "obs-1",
        documentVersionId: null,
      },
    ],
    research: [
      {
        id: "res-linked-1",
        provenanceClass: "RESEARCH_EVIDENCE",
        kind: "BENCHMARK_STUDY",
        title: "Tanulmány a jóváhagyási folyamatokról",
        origin: "ONLINE_VERIFIED",
        boundedClaim: "Az automatizált jóváhagyási útvonalak átlagosan 40%-kal csökkentik a várakozást.",
        verificationStatus: "VERIFIED",
        strength: "STRONG",
        domainKeys: ["OPERATIONAL_EFFICIENCY"],
      },
      {
        id: "res-unlinked-2",
        provenanceClass: "RESEARCH_EVIDENCE",
        kind: "GENERAL_REPORT",
        title: "Országos KKV Digitalizációs Felmérés 2025",
        origin: "USER_LIBRARY",
        boundedClaim: "Általános digitalizációs megállapítások",
        verificationStatus: "REPORTED",
        strength: "MODERATE",
        domainKeys: ["IT_SYSTEMS"],
      },
    ],
  },
  missing: {
    hasUnknownFacts: true,
    hasConflictingEvidence: false,
    insufficientRecommendationCount: 0,
    unresolvedItems: [],
  },
};

function responseFor(url) {
  if (url.includes("/auth/me")) return { status: 200, body: AUTH_ME };
  if (url.includes(`/clients/${WORKFORCE_FIXTURE.client.id}/grow/diagnostic-workbench`)) {
    return { status: 200, body: MOCK_DIAGNOSTIC_DTO };
  }
  if (url.includes(`/clients/${WORKFORCE_FIXTURE.client.id}/grow/home`)) {
    return {
      status: 200,
      body: {
        client: WORKFORCE_FIXTURE.client,
        currentResearchRun: null,
        latestRun: null,
        opportunities: [],
        stats: { total: 0, actionable: 0, bySufficiency: {} },
      },
    };
  }
  if (url.includes("/client-identity/admin/workspaces") || url.includes("workspaces")) {
    return {
      status: 200,
      body: {
        items: [
          {
            id: "qa-workspace-org",
            clientId: WORKFORCE_FIXTURE.client.id,
            mode: "ORGANIZATION",
            status: "ACTIVE",
            name: "QA Szervezeti munkaterület",
          },
        ],
      },
    };
  }
  if (url.includes(`/clients/${WORKFORCE_FIXTURE.client.id}`)) {
    return { status: 200, body: WORKFORCE_FIXTURE.client };
  }
  if (url.includes("/client-company/clients/")) {
    return { status: 200, body: { items: [] } };
  }
  return { status: 200, body: { items: [] } };
}

async function createQaPage(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const hardErrors = [];

  page.on("pageerror", (err) => hardErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("[API]") && !msg.text().includes("Failed to load resource")) {
      hardErrors.push(msg.text());
    }
  });

  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-workforce-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_ME });

  await page.route("**/api/v1/**", async (route) => {
    const res = responseFor(route.request().url());
    await route.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) });
  });

  return { context, page, hardErrors };
}

async function runGrowDiagnosticBrowserQA() {
  fs.mkdirSync(SHOTS, { recursive: true });
  await startServer();
  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n--- Running Grow Diagnostic Browser QA on ${viewport.name} (${viewport.width}x${viewport.height}) ---`);
      const { context, page, hardErrors } = await createQaPage(browser, viewport);

      const growUrl = `/clients/${WORKFORCE_FIXTURE.client.id}/grow`;

      // 1. Default loads the operational workbench (Áttekintés), not GrowJourney
      await page.goto(`${BASE_URL}${growUrl}`, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-testid='grow-sub-nav']", { timeout: 10000 });
      const overviewVisible = await page.getByTestId("grow-overview-tab").isVisible();
      if (!overviewVisible) throw new Error("Overview workbench is not visible on default route");
      const defaultContent = await page.textContent("body");
      for (const label of ["Áttekintés", "Diagnosztika", "Bizonyítékok", "Döntések", "Kezdeményezések", "Eredmények", "Adatforrások"]) {
        if (!defaultContent.includes(label)) throw new Error(`Missing sub-nav label: ${label}`);
      }
      // Ensure diagnostic workbench is NOT rendered by default
      const wbOnDefault = await page.locator("[data-testid='grow-diagnostic-workbench']").count();
      if (wbOnDefault !== 0) throw new Error("Diagnostic workbench rendered on default route!");

      await page.screenshot({ path: path.join(SHOTS, `grow-default-${viewport.name}.png`), fullPage: true });

      // 2. Click Diagnosztika link to navigate to ?tab=diagnosztika
      await page.getByTestId("grow-subnav-diagnosztika").click();
      await page.waitForURL(`**${growUrl}?tab=diagnosztika`, { timeout: 10000 });
      await page.waitForSelector("[data-testid='grow-diagnostic-workbench']", { timeout: 10000 });

      // 3. Verify Workbench Content
      const wbContent = await page.textContent("body");

      // Banner check
      if (!wbContent.includes("BELSŐ TERVEZET — AZ ÜGYFÉLPORTÁLON NEM LÁTHATÓ")) {
        throw new Error("Missing prominent internal-only draft banner");
      }

      // Canonical state check
      if (!wbContent.includes("Megfelelőségi státusz:")) {
        throw new Error("Missing truthful 'Megfelelőségi státusz:' label in canonical state");
      }
      if (wbContent.includes("Megfelelőségi szint")) {
        throw new Error("Found illegal 'Megfelelőségi szint' in canonical state");
      }

      // Declared vs Measured sections check
      const observationPanel = page.getByTestId("diagnostic-observation-panel");
      if ((await observationPanel.count()) !== 1) throw new Error("Observation panel missing");
      if (!wbContent.includes("Deklarált megfigyelések") || !wbContent.includes("Mért pillanatképek")) {
        throw new Error("Missing Declared vs Measured distinction tabs");
      }

      // Evidence distinction check
      const evidencePanel = page.getByTestId("diagnostic-evidence-panel");
      if ((await evidencePanel.count()) !== 1) throw new Error("Evidence panel missing");
      if (!wbContent.includes("Ügyfélspecifikus bizonyítékok") || !wbContent.includes("Kutatási háttér")) {
        throw new Error("Missing client evidence vs research evidence distinction");
      }

      // Linked vs Unlinked Research check
      if (!wbContent.includes("Kapcsolt kutatási háttér")) {
        throw new Error("Missing 'Kapcsolt kutatási háttér' section header");
      }
      if (!wbContent.includes("Ez a kutatási háttér a jelenlegi diagnózis/javaslat alátámasztásához kapcsolódik; nem a vállalat saját mért adata.")) {
        throw new Error("Missing truthful linked research explanatory disclaimer");
      }
      if (!wbContent.includes("További kutatási corpus")) {
        throw new Error("Missing 'További kutatási corpus' section header");
      }
      if (!wbContent.includes("Jelenleg nincs az adott diagnózishoz vagy javaslathoz kapcsolva.")) {
        throw new Error("Missing unlinked research explicit labeling");
      }

      // UNKNOWN wording check
      if (!wbContent.includes("Van explicit ismeretlenként jelölt tény.")) {
        throw new Error("Missing precise true UNKNOWN wording");
      }
      if (wbContent.includes("Van megerősítetlen tény")) {
        throw new Error("Found illegal unverified wording for UNKNOWN facts");
      }

      // Mutation controls check (WORKBENCH_MUTATION_CONTROLS = 0)
      const formCount = await page.locator("[data-testid='grow-diagnostic-workbench'] form").count();
      if (formCount !== 0) throw new Error(`Found ${formCount} forms inside diagnostic workbench!`);
      const buttons = await page.locator("[data-testid='grow-diagnostic-workbench'] button").allTextContents();
      for (const btnText of buttons) {
        const forbidden = ["Elfogadom", "Elutasítom", "Beszéljünk róla", "Most nem", "Közzététel", "Mentés", "Új"];
        if (forbidden.some((f) => btnText.includes(f))) {
          throw new Error(`Found mutation button '${btnText}' inside diagnostic workbench!`);
        }
      }

      // Accepted recommendation status check
      if (!wbContent.includes("Belsőleg elfogadott")) {
        throw new Error("Accepted recommendation does not display 'Belsőleg elfogadott'");
      }
      if (!wbContent.includes("Ügyféloldali közzététel ebben a verzióban nem támogatott.")) {
        throw new Error("Missing customer publication disclaimer on accepted recommendation");
      }

      await page.screenshot({ path: path.join(SHOTS, `grow-diagnostics-${viewport.name}.png`), fullPage: true });

      // 4. Diagnosztika → Áttekintés navigation via subnav link
      await page.getByTestId("grow-subnav-attekintes").click();
      await page.waitForURL(`**${growUrl}?tab=attekintes`, { timeout: 10000 });
      const wbAfterOverviewClick = await page.locator("[data-testid='grow-diagnostic-workbench']").count();
      if (wbAfterOverviewClick !== 0) throw new Error("Workbench did not disappear after navigating back to Áttekintés");

      // 5. Browser back / forward behaves correctly
      await page.goBack();
      await page.waitForURL(`**${growUrl}?tab=diagnosztika`, { timeout: 10000 });
      await page.waitForSelector("[data-testid='grow-diagnostic-workbench']", { timeout: 10000 });

      await page.goForward();
      await page.waitForURL(`**${growUrl}?tab=attekintes`, { timeout: 10000 });

      // 5b. Legacy ?view=journey still renders GrowJourney (full detail/publication flow)
      await page.goto(`${BASE_URL}${growUrl}?view=journey`, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-testid='grow-sub-nav']", { timeout: 10000 });
      const journeyStillRenders = await page.locator("[data-testid='grow-journey']").count();
      if (journeyStillRenders === 0) throw new Error("Legacy ?view=journey no longer renders GrowJourney");

      // 6. Check for hard page errors
      if (hardErrors.length > 0) {
        throw new Error(`Uncaught browser/page errors detected on ${viewport.name}: ${hardErrors.join("; ")}`);
      }

      await context.close();
      console.log(`✓ ${viewport.name} browser QA passed completely with 0 errors.`);
    }

    console.log("\n==========================================");
    console.log("BROWSER_QA=PASSED");
    console.log("DESKTOP_QA=PASSED");
    console.log("MOBILE_QA=PASSED");
    console.log(`SCREENSHOT_EVIDENCE=${SHOTS}`);
    console.log("==========================================");
  } finally {
    await browser.close();
    stopServer();
  }
}

runGrowDiagnosticBrowserQA()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Browser QA failed:", err);
    stopServer();
    process.exit(1);
  });
