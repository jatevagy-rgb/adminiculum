/**
 * Adminiculum Playwright Visual Regression Suite
 * 
 * Baselines (Candidate Canonical Baselines — User Review Pending):
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
 *   node tests/visualRegression.mjs --contact-sheets
 */

import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pixelmatch from "pixelmatch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "..");
export const BASELINES_DIR = path.join(__dirname, "visual-baselines");
export const DIFFS_DIR = path.join(FRONTEND_ROOT, "visual-diffs");

const ARGS = process.argv.slice(2);
export const IS_UPDATE = ARGS.includes("--update-snapshots");
export const IS_CHECK = ARGS.includes("--check") || (!IS_UPDATE && !ARGS.includes("--contact-sheets"));
export const IS_CONTACT_SHEETS = ARGS.includes("--contact-sheets");
const PORT_INDEX = ARGS.indexOf("--port");
const BASE_URL_INDEX = ARGS.indexOf("--base-url");

export const PIXEL_THRESHOLD = 0.1; // Pixel color difference sensitivity (0 to 1)
export const MAX_ALLOWED_DIFF_RATIO = 0.0005; // 0.05% tolerance for anti-aliasing rendering variations

const PORT = PORT_INDEX >= 0 ? Number(ARGS[PORT_INDEX + 1]) : Number(process.env.VISUAL_QA_PORT || 3198);
const EXPLICIT_BASE_URL = BASE_URL_INDEX >= 0 ? ARGS[BASE_URL_INDEX + 1] : process.env.BASE_URL;
const BASE_URL = EXPLICIT_BASE_URL || `http://127.0.0.1:${PORT}`;

export const VIEWPORTS = [
  { id: "desktop", name: "Desktop", width: 1440, height: 900 },
  { id: "narrow", name: "Narrow (Mobile)", width: 390, height: 844 },
];

export const VIEWS = [
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
          NODE_ENV: hasBuild ? "production" : (process.env.NODE_ENV ?? "development"),
          ADMINICULUM_ENABLE_UI_SHOWROOM: "true",
        },
        stdio: "ignore",
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
    } else if (serverProcess.pid) {
      try {
        process.kill(-serverProcess.pid, "SIGKILL");
      } catch {
        serverProcess.kill("SIGKILL");
      }
    }
  } catch {}
  serverProcess = undefined;
}

/**
 * Compare two PNG buffers pixel-by-pixel using sharp and pixelmatch
 */
export async function compareImages(baselinePngBuf, actualPngBuf, options = {}) {
  const img1 = await sharp(baselinePngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img2 = await sharp(actualPngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const width = img1.info.width;
  const height = img1.info.height;

  if (img2.info.width !== width || img2.info.height !== height) {
    return {
      match: false,
      diffPixels: width * height,
      diffRatio: 1.0,
      dimensionMismatch: true,
      baselineDimensions: { width, height },
      actualDimensions: { width: img2.info.width, height: img2.info.height },
      diffPngBuffer: null,
      width,
      height,
    };
  }

  const diffBuf = Buffer.alloc(width * height * 4);
  const threshold = options.threshold ?? PIXEL_THRESHOLD;

  const numDiffPixels = (pixelmatch.default || pixelmatch)(
    img1.data,
    img2.data,
    diffBuf,
    width,
    height,
    {
      threshold,
      includeAA: false,
      diffColor: [255, 0, 85], // vibrant magenta for changed pixels
    }
  );

  const totalPixels = width * height;
  const diffRatio = numDiffPixels / totalPixels;

  const diffPngBuffer = await sharp(diffBuf, {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();

  const maxDiffRatio = options.maxDiffRatio ?? MAX_ALLOWED_DIFF_RATIO;

  return {
    match: diffRatio <= maxDiffRatio,
    diffPixels: numDiffPixels,
    diffRatio,
    diffPngBuffer,
    width,
    height,
    dimensionMismatch: false,
  };
}

/**
 * Deterministic font and layout readiness assertion contract (Phase 2)
 */
export async function assertDeterministicReadiness(page, options = {}) {
  const timeoutMs = options.timeout ?? 15000;

  // 1. Wait for document.fonts.ready with bounded timeout
  await Promise.race([
    page.evaluate(async () => {
      await document.fonts.ready;
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout waiting for document.fonts.ready")), timeoutMs)
    ),
  ]);

  // 2. Inspect document.fonts.status and verify resolved font families
  const fontAudit = await page.evaluate(() => {
    const fontsStatus = document.fonts.status;
    const bodyFont = window.getComputedStyle(document.body).fontFamily;
    const headingEl = document.querySelector("h1, h2, h3, h4");
    const headingFont = headingEl ? window.getComputedStyle(headingEl).fontFamily : "";
    const buttonEl = document.querySelector("button");
    const buttonFont = buttonEl ? window.getComputedStyle(buttonEl).fontFamily : "";
    const loadedFaces = Array.from(document.fonts)
      .filter((f) => f.status === "loaded")
      .map((f) => f.family);

    return {
      fontsStatus,
      bodyFont,
      headingFont,
      buttonFont,
      loadedFaces,
    };
  });

  if (fontAudit.fontsStatus !== "loaded") {
    throw new Error(
      `Font readiness failed: document.fonts.status is "${fontAudit.fontsStatus}" (expected "loaded")`
    );
  }

  // Canonical font is Inter (Next.js font variable --font-inter resolves to Inter or __Inter)
  const hasInter =
    fontAudit.bodyFont.includes("Inter") ||
    fontAudit.bodyFont.includes("__Inter") ||
    fontAudit.loadedFaces.some((f) => f.includes("Inter"));

  if (!hasInter && fontAudit.loadedFaces.length > 0) {
    throw new Error(
      `Canonical font verification failed: Inter not resolved in body font ("${fontAudit.bodyFont}")`
    );
  }

  // 3. Post-layout settling (300ms) only after font readiness is proven
  await page.waitForTimeout(300);

  return fontAudit;
}

/**
 * Generate human review contact sheet for a viewport
 */
export async function generateContactSheet(viewportId, options = {}) {
  const dir = options.dir ?? path.join(BASELINES_DIR, viewportId);
  const suffix = options.suffix ?? ".png";
  const defaultOutName = `adminiculum-ui-baselines-${viewportId}-contact-sheet.png`;
  const outPath = options.outPath ?? path.join(BASELINES_DIR, defaultOutName);

  if (!fs.existsSync(dir)) return null;

  const imageFiles = VIEWS.map((v) => {
    const filename = suffix.startsWith("-") ? `${v.id}${suffix}` : `${v.id}.png`;
    return path.join(dir, filename);
  }).filter((p) => fs.existsSync(p));

  if (imageFiles.length === 0) return null;

  const loadedImages = await Promise.all(
    imageFiles.map(async (f) => {
      // Normalize width for consistent column stacking
      const targetWidth = viewportId === "desktop" ? 800 : 390;
      const resized = await sharp(f).resize({ width: targetWidth }).toBuffer({ resolveWithObject: true });
      return { file: f, name: path.basename(f, suffix), ...resized };
    })
  );

  const composites = [];
  let currentY = 50;

  for (const img of loadedImages) {
    composites.push({
      input: img.data,
      top: currentY,
      left: 20,
    });
    currentY += img.info.height + 24;
  }

  const sheetWidth = viewportId === "desktop" ? 840 : 430;
  const sheetBuffer = await sharp({
    create: {
      width: sheetWidth,
      height: currentY + 30,
      channels: 4,
      background: { r: 248, g: 250, b: 249, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, sheetBuffer);
  console.log(`Generated contact sheet: ${path.relative(FRONTEND_ROOT, outPath)}`);
  return outPath;
}

export async function run() {
  console.log("==================================================");
  console.log("  ADMINICULUM PLAYWRIGHT VISUAL REGRESSION SUITE");
  console.log("  Status: CANDIDATE CANONICAL BASELINES (REVIEW PENDING)");
  console.log("==================================================");

  if (IS_CONTACT_SHEETS) {
    console.log("Mode: GENERATE REVIEW CONTACT SHEETS");
    for (const vp of VIEWPORTS) {
      await generateContactSheet(vp.id);
    }
    return;
  }

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
  const allResults = [];

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
        locale: "hu-HU",
        colorScheme: "light",
        timezoneId: "Europe/Budapest",
        reducedMotion: "reduce",
      });

      const page = await context.newPage();

      for (const view of VIEWS) {
        const fullUrl = `${BASE_URL}${view.path}`;
        const snapshotName = `${view.id}.png`;
        const baselinePath = path.join(vpBaselineDir, snapshotName);
        const diffPath = path.join(vpDiffDir, `${view.id}-diff.png`);
        const actualPath = path.join(vpDiffDir, `${view.id}-actual.png`);
        const expectedPath = path.join(vpDiffDir, `${view.id}-expected.png`);

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

          // Deterministic font and layout readiness contract (Phase 2)
          await assertDeterministicReadiness(page);

          let screenshotBuf;
          const targetLocator = page.locator(view.selector);
          if ((await targetLocator.count()) > 0) {
            screenshotBuf = await targetLocator.first().screenshot({ timeout: 5000 });
          } else {
            screenshotBuf = await page.screenshot({ fullPage: false });
          }

          if (IS_UPDATE) {
            // Update mode: Explicitly requested snapshot creation/update
            fs.writeFileSync(baselinePath, screenshotBuf);
            console.log(`[UPDATED] ${vp.name.padEnd(16)} : ${view.id} -> ${path.relative(FRONTEND_ROOT, baselinePath)}`);
            updated++;
          } else {
            // CHECK MODE: NEVER write baselines. Missing baseline must fail closed!
            if (!fs.existsSync(baselinePath)) {
              console.error(
                `[FAIL - MISSING BASELINE] ${vp.name.padEnd(16)} : ${view.id} - Baseline missing at ${path.relative(
                  FRONTEND_ROOT,
                  baselinePath
                )}. CHECK mode is read-only and never writes baselines.`
              );
              failures++;
              allResults.push({
                viewport: vp.id,
                view: view.id,
                match: false,
                missingBaseline: true,
                expectedDimensions: { width: 0, height: 0 },
                actualDimensions: { width: 0, height: 0 },
                diffPixels: 0,
                diffRatio: 100,
                dimensionMismatch: true,
              });
              continue;
            }

            const baselineBuf = fs.readFileSync(baselinePath);
            const comp = await compareImages(baselineBuf, screenshotBuf, {
              threshold: PIXEL_THRESHOLD,
              maxDiffRatio: MAX_ALLOWED_DIFF_RATIO,
            });

            if (comp.match) {
              console.log(
                `[PASS]    ${vp.name.padEnd(16)} : ${view.id} (diff: ${(comp.diffRatio * 100).toFixed(3)}%, diffPixels: ${
                  comp.diffPixels
                })`
              );
              passed++;
            } else {
              console.error(
                `[FAIL]    ${vp.name.padEnd(16)} : ${view.id} (diff: ${(comp.diffRatio * 100).toFixed(2)}%, diffPixels: ${
                  comp.diffPixels
                })`
              );
              // Write distinct EXPECTED, ACTUAL, and highlighted DIFF artifacts
              fs.writeFileSync(expectedPath, baselineBuf);
              fs.writeFileSync(actualPath, screenshotBuf);
              if (comp.diffPngBuffer) {
                fs.writeFileSync(diffPath, comp.diffPngBuffer);
              }
              failures++;
            }

            allResults.push({
              viewport: vp.id,
              view: view.id,
              match: comp.match,
              expectedDimensions: comp.dimensionMismatch ? comp.baselineDimensions : { width: comp.width, height: comp.height },
              actualDimensions: comp.dimensionMismatch ? comp.actualDimensions : { width: comp.width, height: comp.height },
              diffPixels: comp.diffPixels,
              diffRatio: Number((comp.diffRatio * 100).toFixed(4)),
              dimensionMismatch: Boolean(comp.dimensionMismatch),
            });
          }
        } catch (err) {
          console.error(`[ERROR]   ${vp.name.padEnd(16)} : ${view.id} - ${err.message}`);
          failures++;
          allResults.push({
            viewport: vp.id,
            view: view.id,
            match: false,
            error: err.message,
            expectedDimensions: { width: 0, height: 0 },
            actualDimensions: { width: 0, height: 0 },
            diffPixels: 0,
            diffRatio: 100,
            dimensionMismatch: true,
          });
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
    console.log(`Candidate snapshots updated: ${updated}`);
    // Auto-generate contact sheets after update
    for (const vp of VIEWPORTS) {
      await generateContactSheet(vp.id);
    }
    process.exit(0);
  } else {
    // Phase 9: Write machine-readable failure summary and Linux candidate contact sheets
    if (allResults.length > 0) {
      fs.mkdirSync(DIFFS_DIR, { recursive: true });
      fs.writeFileSync(path.join(DIFFS_DIR, "summary.json"), JSON.stringify(allResults, null, 2));

      const summaryLines = allResults.map((r) =>
        `[${r.match ? "PASS" : "FAIL"}] ${r.viewport.padEnd(8)} / ${r.view.padEnd(24)} ` +
        `expected: ${r.expectedDimensions.width}x${r.expectedDimensions.height} ` +
        `actual: ${r.actualDimensions.width}x${r.actualDimensions.height} ` +
        `diff: ${r.diffRatio.toFixed(3)}% (${r.diffPixels}px)` +
        (r.dimensionMismatch ? " [DIMENSION MISMATCH]" : "") +
        (r.error ? ` [ERROR: ${r.error}]` : "")
      );
      fs.writeFileSync(path.join(DIFFS_DIR, "summary.txt"), summaryLines.join("\n") + "\n");

      // Generate Linux candidate contact sheets from actual screenshots in visual-diffs
      for (const vp of VIEWPORTS) {
        const actualDir = path.join(DIFFS_DIR, vp.id);
        const outContactSheet = path.join(DIFFS_DIR, `adminiculum-ui-linux-${vp.id}-candidate-contact-sheet.png`);
        try {
          await generateContactSheet(vp.id, {
            dir: actualDir,
            suffix: "-actual.png",
            outPath: outContactSheet,
          });
        } catch {
          // Skip if actual images are not available
        }
      }
    }

    console.log(`Passed: ${passed} | Failed: ${failures}`);
    if (failures > 0) {
      console.error("\nVisual regression check FAILED. See visual-diffs/ for expected, actual, and diff outputs.");
      process.exit(1);
    } else {
      console.log("\nVisual regression check PASSED. All views match candidate baselines!");
      process.exit(0);
    }
  }
}

// Self-execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error("Visual regression run crashed:", err);
    process.exit(1);
  });
}
