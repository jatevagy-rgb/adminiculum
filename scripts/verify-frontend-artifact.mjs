#!/usr/bin/env node
/**
 * Frontend deployment artifact verifier.
 *
 * Root cause of the frontend recovery incident: a deploy artifact contained the
 * source/package files but NOT the built `.next` runtime, and another prebuilt
 * artifact contained `.next` but NOT `node_modules/next` — so `npm run start`
 * had nothing to serve (and a temporary `npm install` startup masked it).
 *
 * The frontend App Service now runs prebuilt (SCM_DO_BUILD_DURING_DEPLOYMENT and
 * ENABLE_ORYX_BUILD are false) with startup `npm run start`, so the uploaded
 * artifact MUST be a complete runtime. This script fails (exit 1) unless the
 * given directory is a complete, deployable prebuilt Next.js runtime, and
 * contains no forbidden files. Run it in the deploy pipeline before upload.
 *
 *   node scripts/verify-frontend-artifact.mjs <artifactDir>
 */
import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
if (!dir) { console.error('usage: verify-frontend-artifact.mjs <artifactDir>'); process.exit(2); }

const report = { artifactDir: dir, checkedAt: new Date().toISOString(), mode: null, checks: [], forbidden: [] };
function check(name, ok, detail) { report.checks.push({ name, ok, detail }); if (!ok) report.ok = false; }
const exists = (rel) => fs.existsSync(path.join(dir, rel));

if (report.ok === undefined) report.ok = true;

// Required package metadata + start script.
check('package.json', exists('package.json'), 'app manifest');
let startsWithNextStart = false;
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  startsWithNextStart = /next\s+start/.test(String(pkg.scripts?.start || ''));
  check('start-script-is-next-start', startsWithNextStart, `scripts.start=${pkg.scripts?.start || '(none)'}`);
} catch { check('package.json-parseable', false, 'could not parse package.json'); }

// The two incident invariants: a complete built .next AND the next runtime.
const standalone = exists('.next/standalone/server.js');
report.mode = standalone ? 'standalone' : 'prebuilt+node_modules';
check('.next/BUILD_ID', exists('.next/BUILD_ID'), 'built output present (not a source-only artifact)');
check('.next/static', exists('.next/static'), 'static chunks present');
if (standalone) {
  check('standalone-server', true, '.next/standalone/server.js present');
} else {
  // Non-standalone: `next start` needs the next runtime in node_modules.
  check('node_modules/next', exists('node_modules/next/package.json'), 'next runtime dependency present (not a prebuilt-without-deps artifact)');
  check('node_modules/react', exists('node_modules/react/package.json'), 'react runtime present');
  check('node_modules/.bin/next', exists('node_modules/.bin/next') || exists('node_modules/next/dist/bin/next'), 'next binary present');
}
check('public', exists('public'), 'public assets directory');

// Forbidden content — never ship these.
const FORBIDDEN = ['.env', '.env.local', '.env.production', '.artifacts', 'graphify-out', 'graphify-out/graph.json', '.git', 'browser-profiles'];
for (const f of FORBIDDEN) if (exists(f)) report.forbidden.push(f);
// Any dotenv-style file at root.
try { for (const e of fs.readdirSync(dir)) if (/^\.env(\.|$)/.test(e)) report.forbidden.push(e); } catch { /* ignore */ }
check('no-forbidden-files', report.forbidden.length === 0, report.forbidden.length ? `found: ${[...new Set(report.forbidden)].join(', ')}` : 'none');

for (const c of report.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`);
console.log(`MODE: ${report.mode}`);
if (process.env.ARTIFACT_VERIFY_JSON) fs.writeFileSync(process.env.ARTIFACT_VERIFY_JSON, JSON.stringify(report, null, 2));

if (!report.ok) { console.error('\nRESULT: FAIL — artifact is not a complete deployable frontend runtime. Do not deploy.'); process.exit(1); }
console.log('\nRESULT: PASS — complete deployable frontend runtime.');
