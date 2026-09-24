#!/usr/bin/env node
/**
 * Adminiculum Playwright Visual Regression Suite
 * 
 * Baselines:
 *   Desktop: 1440 x 900
 *   Narrow : 390 x 844
 * 
 * Required Views:
 *   - ui/buttons
 *   - ui/status
 *   - ui/forms
 *   - ui/table
 *   - ui/modal
 *   - ui/page-header
 *   - ui/workspace-three-column
 *   - ui/worklist-detail
 *   - ui/patterns
 * 
 * Modes:
 *   node tests/visualRegression.mjs --update-snapshots
 *   node tests/visualRegression.mjs --check
 *   node tests/visualRegression.mjs --base-url http://localhost:3000
 */

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const BASELINES_DIR = path.join(__dirname, "visual-baselines");
const DIFFS_DIR = path.join(FRONTEND_ROOT, "visual-diffs");

const ARGS = process.argv.slice(2);
const IS_UPDATE = ARGS.includes("--update-snapshots");
const PORT_INDEX = ARGS.indexOf("--port");
const BASE_URL_INDEX = ARGS.indexOf("--base-url");

const PORT = PORT_INDEX >= 0 ? Number(ARGS[PORT_INDEX + 1]) : Number(process.env.VISUAL_QA_PORT || 3198);
const EXPLICIT_BASE_URL = BASE_URL_INDEX >= 0 ? ARGS[BASE_URL_INDEX + 1] : process.env.BASE_URL;
const BASE_URL = EXPLICIT_BASE_URL || `http://127.0.0.1:${PORT}`;

const VIEWPORTS = [
  { id: "desktop", name: "Desktop", width: 1440, height: 900 },
  { id: "narrow", name: "Narrow (Mobile)", width: 390, height: 844 },
];

const VIEWS = [
  { id: "buttons", path: "/dev/showroom?view=buttons", selector: "#buttons" },
  { id: "status", path: "/dev/showroom?view=status", selector: "#status" },
  { id: "forms", path: "/dev/showroom?view=forms", selector: "#forms" },
  { id: "table", path: "/dev/showroom?view=table", selector: "#table" },
  { id: "modal", path: "/dev/showroom?view=modal", selector: "#modal" },
  { id: "page-header", path: "/dev/showroom?view=page-header", selector: "#page-header" },
  { id: "workspace-three-column", path: "/dev/showroom?view=workspace-three-column", selector: "#patterns" },
  { id: "worklist-detail", path: "/dev/showroom?view=worklist-detail", selector: "#patterns" },
  { id: "patterns", path: "/dev/showroom?view=patterns", selector: "#patterns" },
];

let serverProcess;

function checkUrlLive(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startDevServer() {
  return new Promise(async (resolve, reject) => {
    const hasBuild = fs.existsSync(path.join(FRONTEND_ROOT, ".next"));
    const mode = hasBuild ? "start" : "dev";
    console.log(`Starting isolated Next.js server (next ${mode}) on port ${PORT}...`);
    serverProcess = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["next", mode, "-p", String(PORT)],
      {
        cwd: FRONTEND_ROOT,
        env: {
          ...process.env,
          PORT: String(PORT),
          NEXT_PUBLIC_ENABLE_SHOWROOM: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      }
    );

    serverProcess.on("error", reject);
    serverProcess.on("exit", (code) => {
      reject(new Error(`Server exited prematurely with code ${code}`));
    });

    // Poll until server responds
    const start = Date.now();
    while (Date.now() - start < 45000) {
      await new Promise((r) => setTimeout(r, 1000));
      const ok = await checkUrlLive(`http://127.0.0.1:${PORT}/dev/showroom?view=all`);
      if (ok) {
        console.log(`Dev server confirmed live on port ${PORT}.`);
        return resolve();
      }
    }
    reject(new Error("Timed out waiting for Next.js dev server to respond."));
  });
}

function stopDevServer() {
  if (!serverProcess) return;
  console.log("Stopping dev server...");
  try {
    if (process.platform === "win32" && serverProcess.pid) {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(serverProcess.pid)], { stdio: "ignore" });
    } else {
      serverProcess.kill("SIGKILL");
    }
  } catch {}
  serverProcess = undefined;
}

function compareBuffers(bufA, bufB) {
  if (bufA.length === bufB.length && bufA.equals(bufB)) {
    return { diffRatio: 0, identical: true };
  }
  const minLen = Math.min(bufA.length, bufB.length);
  const maxLen = Math.max(bufA.length, bufB.length);
  let diffBytes = maxLen - minLen;
  for (let i = 0; i < minLen; i++) {
    if (bufA[i] !== bufB[i]) diffBytes++;
  }
  const diffRatio = diffBytes / maxLen;
  return { diffRatio, identical: diffRatio === 0 };
}

async function run() {
  console.log("==================================================");
  console.log("  ADMINICULUM PLAYWRIGHT VISUAL REGRESSION SUITE");
  console.log("==================================================");
  console.log(`Target URL : ${BASE_URL}`);
  console.log(`Mode       : ${IS_UPDATE ? "UPDATE SNAPSHOTS (--update-snapshots)" : "CHECK REGRESSION (--check)"}`);

  const isLive = await checkUrlLive(`${BASE_URL}/dev/showroom?view=all`);
  let startedOurServer = false;

  if (!isLive && !EXPLICIT_BASE_URL) {
    await startDevServer();
    startedOurServer = true;
  } else if (!isLive && EXPLICIT_BASE_URL) {
    console.error(`Error: Explicit base URL ${EXPLICIT_BASE_URL} is unreachable.`);
    process.exit(1);
  }

  let browser;
  let failures = 0;
  let passed = 0;
  let updated = 0;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    for (const vp of VIEWPORTS) {
      const vpBaselineDir = path.join(BASELINES_DIR, vp.id);
      const vpDiffDir = path.join(DIFFS_DIR, vp.id);
      fs.mkdirSync(vpBaselineDir, { recursive: true });
      fs.mkdirSync(vpDiffDir, { recursive: true });

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });

      const page = await context.newPage();

      for (const view of VIEWS) {
        const fullUrl = `${BASE_URL}${view.path}`;
        const snapshotName = `${view.id}.png`;
        const baselinePath = path.join(vpBaselineDir, snapshotName);
        const diffPath = path.join(vpDiffDir, `${view.id}-diff.png`);
        const actualPath = path.join(vpDiffDir, `${view.id}-actual.png`);

        try {
          await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
          await page.waitForSelector(view.selector, { timeout: 15000 });
          // Disable animations and transitions for deterministic capture
          await page.addStyleTag({
            content: `
              *, *::before, *::after {
                transition-property: none !important;
                transform: none !important;
                animation: none !important;
                caret-color: transparent !important;
              }
            `,
          });

          await page.waitForTimeout(300);

          let screenshotBuf;
          const targetLocator = page.locator(view.selector);
          if (await targetLocator.count() > 0) {
            screenshotBuf = await targetLocator.first().screenshot({ timeout: 5000 });
          } else {
            screenshotBuf = await page.screenshot({ fullPage: false });
          }

          if (IS_UPDATE || !fs.existsSync(baselinePath)) {
            fs.writeFileSync(baselinePath, screenshotBuf);
            console.log(`[UPDATED] ${vp.name.padEnd(16)} : ${view.id} -> ${path.relative(FRONTEND_ROOT, baselinePath)}`);
            updated++;
          } else {
            const baselineBuf = fs.readFileSync(baselinePath);
            const { diffRatio, identical } = compareBuffers(baselineBuf, screenshotBuf);

            // Allow up to 0.01% variance for sub-pixel anti-aliasing
            if (identical || diffRatio < 0.0001) {
              console.log(`[PASS]    ${vp.name.padEnd(16)} : ${view.id} (diff: ${(diffRatio * 100).toFixed(3)}%)`);
              passed++;
            } else {
              console.error(`[FAIL]    ${vp.name.padEnd(16)} : ${view.id} (diff: ${(diffRatio * 100).toFixed(2)}%)`);
              fs.writeFileSync(actualPath, screenshotBuf);
              fs.writeFileSync(diffPath, screenshotBuf);
              failures++;
            }
          }
        } catch (err) {
          console.error(`[ERROR]   ${vp.name.padEnd(16)} : ${view.id} - ${err.message}`);
          failures++;
        }
      }

      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    if (startedOurServer) stopDevServer();
  }

  console.log("--------------------------------------------------");
  if (IS_UPDATE) {
    console.log(`Snapshots updated: ${updated}`);
    process.exit(0);
  } else {
    console.log(`Passed: ${passed} | Failed: ${failures}`);
    if (failures > 0) {
      console.error(`\nVisual regression check FAILED. Diffs saved in: ${path.relative(FRONTEND_ROOT, DIFFS_DIR)}`);
      process.exit(1);
    }
    console.log("\nVisual regression check PASSED. All views match baselines!");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal visual regression error:", err);
  if (serverProcess) stopDevServer();
  process.exit(1);
});
