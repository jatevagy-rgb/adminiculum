#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const frontendRoot = path.resolve(__dirname, "..");
const defaultTargets = [
  path.join(frontendRoot, ".next", "server"),
  path.join(frontendRoot, ".next", "static"),
  path.join(frontendRoot, ".next", "standalone"),
].filter((targetPath) => fs.existsSync(targetPath));

const targets = process.argv.slice(2).map((targetPath) => path.resolve(process.cwd(), targetPath));
const scanTargets = targets.length > 0 ? targets : defaultTargets;

const forbiddenPatterns = [
  "localhost:3001",
  "127.0.0.1:3001",
  "0.0.0.0:3001",
];

const ignoredDirectoryNames = new Set(["cache", "node_modules"]);
const findings = [];

function walk(entryPath) {
  if (!fs.existsSync(entryPath)) {
    return;
  }

  const stats = fs.statSync(entryPath);
  if (stats.isDirectory()) {
    const name = path.basename(entryPath);
    if (ignoredDirectoryNames.has(name)) {
      return;
    }

    for (const childName of fs.readdirSync(entryPath)) {
      walk(path.join(entryPath, childName));
    }
    return;
  }

  if (!stats.isFile()) {
    return;
  }

  const content = fs.readFileSync(entryPath, "utf8");
  for (const pattern of forbiddenPatterns) {
    const index = content.indexOf(pattern);
    if (index >= 0) {
      findings.push({
        file: path.relative(frontendRoot, entryPath),
        pattern,
        index,
      });
    }
  }
}

if (scanTargets.length === 0) {
  console.error("[prod-env-guard] No .next runtime output found. Run `npm run build` first.");
  process.exit(1);
}

for (const targetPath of scanTargets) {
  walk(targetPath);
}

if (findings.length > 0) {
  console.error("[prod-env-guard] Forbidden local API/auth target found in production bundle:");
  for (const finding of findings.slice(0, 20)) {
    console.error(`- ${finding.file}: ${finding.pattern}`);
  }
  if (findings.length > 20) {
    console.error(`- ...and ${findings.length - 20} more finding(s)`);
  }
  console.error("Rebuild with production NEXT_PUBLIC_* values and without Frontend/.env.local loaded.");
  process.exit(1);
}

console.log("[prod-env-guard] OK: no localhost API/auth targets found in .next runtime output.");
