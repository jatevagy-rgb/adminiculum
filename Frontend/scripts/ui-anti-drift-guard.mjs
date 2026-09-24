#!/usr/bin/env node
/**
 * Adminiculum UI Anti-Drift Guard
 * 
 * Purpose:
 * Prevents NEW UI design drift (arbitrary hex colors, duplicate buttons/pills,
 * marketing cards on operational surfaces) without forcing an unsafe mass cleanup
 * of legacy code.
 * 
 * Usage:
 *   node scripts/ui-anti-drift-guard.mjs --check
 *   node scripts/ui-anti-drift-guard.mjs --update-baseline
 *   node scripts/ui-anti-drift-guard.mjs --changed-only
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const BASELINE_PATH = path.join(__dirname, "ui-drift-baseline.json");

const ARGS = process.argv.slice(2);
const IS_UPDATE = ARGS.includes("--update-baseline");
const IS_CHANGED_ONLY = ARGS.includes("--changed-only");

// Canonical tokens and primitives guidance
const RULES = [
  {
    id: "UI_DRIFT_ARBITRARY_COLOR",
    description: "Arbitrary Tailwind hex color class detected",
    regex: /(?:bg|text|border|ring|fill|stroke)-\[#(?:[0-9a-fA-F]{3,8})\]/g,
    replacement: "Use semantic token (--adm-*) or canonical Adminiculum primitive instead of arbitrary hex.",
  },
  {
    id: "UI_DRIFT_STYLE_COLOR",
    description: "Direct inline style hex color detected",
    regex: /style=\{\{[^}]*(?:color|backgroundColor|borderColor)\s*:\s*["']#(?:[0-9a-fA-F]{3,8})["'][^}]*\}\}/g,
    replacement: "Use semantic token CSS class or Adminiculum primitive instead of inline hex style.",
  },
  {
    id: "UI_DRIFT_DUPLICATE_BUTTON",
    description: "Route-local button element with custom classes duplicating AdminButton",
    regex: /<button\s+[^>]*className=["'][^"']*\b(?:rounded-\[?(?:5px|8px|md)\]?|border)\b[^"']*\b(?:bg-|px-[234]|py-[123])[^"']*["']/g,
    replacement: "Use canonical <AdminButton> or <Button> from '@/components/ui' instead of ad-hoc styled <button>.",
  },
  {
    id: "UI_DRIFT_DUPLICATE_STATUS_PILL",
    description: "Route-local status pill duplicating AdminStatusPill",
    regex: /<span\s+[^>]*className=["'][^"']*\brounded-full\b[^"']*\b(?:px-[23]|py-[01]|text-\[1[01]px\])[^"']*["']/g,
    replacement: "Use canonical <AdminStatusPill> or <AdminBadge> from '@/components/ui' instead of ad-hoc status pills.",
  },
  {
    id: "UI_DRIFT_MARKETING_RADIUS",
    description: "Excessive rounded-3xl / rounded-2xl marketing card on operational workforce surface",
    regex: /\brounded-(?:3xl|2xl)\b/g,
    replacement: "Use canonical operational radius (--adm-radius-md: 8px or --adm-radius-lg: 12px) for workforce surfaces.",
  },
];

// Directories and files to check
const SCAN_DIRS = [
  path.join(FRONTEND_ROOT, "src", "app"),
  path.join(FRONTEND_ROOT, "src", "components"),
];

// Legitimate exceptions allowlist
const FILE_EXCLUDES = [
  /src[\\\/]app[\\\/]dev[\\\/]showroom/, // Showroom showcases the tokens and patterns
  /src[\\\/]components[\\\/]ui[\\\/]tokens\.ts/, // Token definitions file
  /src[\\\/]components[\\\/]adminiculum[\\\/]ui\.tsx/, // Canonical primitive implementations
  /src[\\\/]components[\\\/]adminiculum[\\\/]OperationalPrimitives\.tsx/,
  /\.test\.(?:ts|tsx|mjs|js)$/, // Test files
  /node_modules/,
];

function isExcludedFile(filePath) {
  return FILE_EXCLUDES.some((re) => re.test(filePath));
}

function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else if (/\.(?:tsx|jsx|ts|js)$/.test(entry.name)) {
      if (!isExcludedFile(fullPath)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function getChangedFiles() {
  try {
    const output = execSync("git status --porcelain Frontend/src", {
      cwd: path.resolve(FRONTEND_ROOT, ".."),
      encoding: "utf8",
    });
    const files = [];
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const relPath = trimmed.slice(3).trim();
      const absPath = path.resolve(FRONTEND_ROOT, "..", relPath);
      if (/\.(?:tsx|jsx|ts|js)$/.test(absPath) && fs.existsSync(absPath) && !isExcludedFile(absPath)) {
        files.push(absPath);
      }
    }
    return files;
  } catch {
    return [];
  }
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const violations = [];
  const relPath = path.relative(FRONTEND_ROOT, filePath).replace(/\\/g, "/");

  lines.forEach((line, idx) => {
    // Explicit inline ignore directive: // drift-allow or /* drift-allow */
    if (line.includes("drift-allow")) return;

    // Legitimate exception: Document reader / TipTap text formatting
    if (line.includes("tiptap") || line.includes("highlight-")) return;

    // Legitimate exception: ClientColorKey identity palette mapping
    if (line.includes("ClientColorKey") || line.includes("clientColorKey")) return;

    // Legitimate exception: Print / PDF export styles
    if (line.includes("@media print") || line.includes("pdf-")) return;

    for (const rule of RULES) {
      const matches = line.match(rule.regex);
      if (matches) {
        for (const match of matches) {
          violations.push({
            rule: rule.id,
            file: relPath,
            line: idx + 1,
            matched: match.trim(),
            replacement: rule.replacement,
            fingerprint: `${rule.id}:${relPath}:${match.trim()}`,
          });
        }
      }
    }
  });

  return violations;
}

function run() {
  console.log("==================================================");
  console.log("  ADMINICULUM UI ANTI-DRIFT GUARD");
  console.log("==================================================");

  let filesToScan = [];
  if (IS_CHANGED_ONLY) {
    filesToScan = getChangedFiles();
    console.log(`Mode: CHANGED FILES ONLY (${filesToScan.length} files detected)`);
  } else {
    for (const d of SCAN_DIRS) {
      getAllFiles(d, filesToScan);
    }
    console.log(`Mode: FULL WORKSPACE SCAN (${filesToScan.length} candidate files)`);
  }

  const allViolations = [];
  for (const file of filesToScan) {
    const v = scanFile(file);
    allViolations.push(...v);
  }

  // Load baseline
  let baselineFingerprints = new Set();
  if (fs.existsSync(BASELINE_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
      if (Array.isArray(data.fingerprints)) {
        baselineFingerprints = new Set(data.fingerprints);
      }
    } catch (e) {
      console.warn("Warning: Could not parse baseline file:", e.message);
    }
  }

  if (IS_UPDATE) {
    const distinctFingerprints = Array.from(new Set(allViolations.map((v) => v.fingerprint))).sort();
    const baselineData = {
      updatedAt: new Date().toISOString(),
      violationCount: allViolations.length,
      distinctCount: distinctFingerprints.length,
      fingerprints: distinctFingerprints,
    };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baselineData, null, 2) + "\n", "utf8");
    console.log(`\nBaseline successfully updated with ${distinctFingerprints.length} distinct violations.`);
    console.log(`Saved to: ${path.relative(process.cwd(), BASELINE_PATH)}`);
    process.exit(0);
  }

  // Check mode: find NEW violations not in baseline
  const newViolations = allViolations.filter((v) => !baselineFingerprints.has(v.fingerprint));

  console.log(`Total detected violations : ${allViolations.length}`);
  console.log(`Pre-existing baseline debt: ${allViolations.length - newViolations.length} (tolerated)`);
  console.log(`New drift violations      : ${newViolations.length}`);

  if (newViolations.length > 0) {
    console.error("\n[FAIL] NEW UI DESIGN DRIFT VIOLATIONS DETECTED:\n");
    for (const v of newViolations) {
      console.error("--------------------------------------------------");
      console.error(`${v.rule}`);
      console.error(`Frontend/${v.file}:${v.line}`);
      console.error(`Matched: ${v.matched}`);
      console.error(`CANONICAL_REPLACEMENT:`);
      console.error(`  ${v.replacement}`);
    }
    console.error("--------------------------------------------------");
    console.error(`\nFailed with ${newViolations.length} new drift violations.`);
    console.error("Please use canonical tokens / primitives from '@/components/ui'.");
    process.exit(1);
  }

  console.log("\n[PASS] UI Anti-Drift Guard passed! Zero new design drift violations.\n");
  process.exit(0);
}

run();
