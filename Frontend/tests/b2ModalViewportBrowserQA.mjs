// Deterministic real-component viewport + accessibility QA; no Next app or MSAL session required.
// Mounts the ACTUAL AnonymizeModal and CaseTimeEntryDialog React components through esbuild.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = await fs.mkdtemp(path.join(os.tmpdir(), "b2-modal-viewport-"));
const BUNDLE = path.join(TMP, "harness.js");

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

await build({
  stdin: {
    resolveDir: ROOT,
    loader: "tsx",
    sourcefile: "harness.tsx",
    contents: `import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AnonymizeModal } from "${path.join(ROOT, "src/components/documents/AnonymizeModal.tsx").replace(/\\/g, "/")}";
import { CaseTimeEntryDialog } from "${path.join(ROOT, "src/components/cases/CaseTimeEntryDialog.tsx").replace(/\\/g, "/")}";
import { ViewportDialog } from "${path.join(ROOT, "src/components/ui/ViewportDialog.tsx").replace(/\\/g, "/")}";
function Harness() {
  const [which, setWhich] = useState("");
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  const close = () => setOpen(false);
  const contract = { id: "qa-document", title: "Viewport QA", fileName: "qa.docx", templateName: "QA", revisionNumber: 1, status: "DRAFT" };
  return <><button id="trigger" onClick={() => { setWhich(window.qaNext); setOpen(true); }}>Open dialog</button>
    {open && which === "anon" && <AnonymizeModal isOpen onClose={close} contract={contract} />}
    {open && which === "time" && <CaseTimeEntryDialog caseId="qa-case" tasks={[]} onClose={close} onSaved={close} />}
    {open && which === "shared" && <ViewportDialog title="Közös ablak" onClose={close} footer={<button onClick={close}>Kész</button>}><button id="nested-trigger" onClick={() => setNested(true)}>Megerősítés</button><textarea aria-label="Hosszú szöveg" style={{height:1400}} defaultValue="Hosszú ügyadat" /></ViewportDialog>}
    {nested && <ViewportDialog title="Megerősítés" onClose={() => setNested(false)}><button onClick={() => setNested(false)}>Mégse</button></ViewportDialog>}
  </>;
}
createRoot(document.getElementById("root")).render(<Harness />);`,
  },
  bundle: true,
  platform: "browser",
  jsx: "automatic",
  format: "iife",
  outfile: BUNDLE,
  plugins: [{
    name: "safe-component-stubs",
    setup(build) {
      build.onResolve({ filter: /^@\/lib\/api$/ }, () => ({ path: "api", namespace: "qa" }));
      build.onResolve({ filter: /^@\/lib\/caseTimeBillingApi$/ }, () => ({ path: "time-api", namespace: "qa" }));
      build.onResolve({ filter: /^@\/components\/documents\/(AIPromptPanel|OrganizationPersonPicker)$/ }, (args) => ({ path: args.path, namespace: "qa" }));
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "qa" }));
      build.onLoad({ filter: /.*/, namespace: "qa" }, (args) => ({
        loader: "tsx",
        contents: args.path === "api" ? "export class ApiError extends Error {}; export async function getAnonymizationSourceText(){return {success:false,textAvailable:false}}; export async function anonymizeDocument(){ window.__b2Mutated = (window.__b2Mutated||0)+1; return {success:false} }" :
          args.path === "time-api" ? "export async function recordCaseTime(){ window.__b2Mutated = (window.__b2Mutated||0)+1; }" :
          args.path === "navigation" ? "export function useRouter(){return {push(){}}}" :
          "import React from 'react'; export function AIPromptPanel(){return null}; export function OrganizationPersonPicker(){return null}",
      }));
    },
  }],
});

const bundle = await fs.readFile(BUNDLE, "utf8");
const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;font:14px Arial,sans-serif}body{min-width:0}
.app-shell-content{backdrop-filter:saturate(105%);min-height:2400px;padding:20px}
#trigger{margin-top:1850px}.fixed{position:fixed}.inset-0{inset:0}.z-50{z-index:50}
.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1 1 0%}.shrink-0{flex-shrink:0}
.items-center{align-items:center}.items-start{align-items:flex-start}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.justify-end{justify-content:flex-end}
.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.min-h-0{min-height:0}.w-full{width:100%}
.max-w-2xl{max-width:672px}.max-w-lg{max-width:512px}.border{border:1px solid #ddd}.bg-white{background:white}.shadow-2xl{box-shadow:0 20px 40px #0003}
.max-h-\\[calc\\(100dvh-2rem\\)\\]{max-height:calc(100dvh - 2rem)}
.px-4{padding-left:16px;padding-right:16px}.py-4{padding-top:16px;padding-bottom:16px}.p-4{padding:16px}.p-5{padding:20px}.p-6{padding:24px}
.px-5{padding-left:20px;padding-right:20px}.py-4{padding-top:16px;padding-bottom:16px}.px-6{padding-left:24px;padding-right:24px}
.gap-2{gap:8px}.gap-3{gap:12px}.space-y-4>*+*{margin-top:16px}
.bg-black\\/30{background:rgba(0,0,0,.3)}.backdrop-blur-sm{backdrop-filter:blur(4px)}
button,input,select,textarea{font:inherit}button{cursor:pointer}
details>summary{cursor:pointer}
</style><main class="app-shell-content"><div id="root"></div><script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></main>`;

const browser = await chromium.launch({ headless: true });
const results = {};
let checks = 0;
const failures = [];
function check(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  PASS ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name} ${detail}`);
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => console.error("PAGE_ERROR", error));
  await page.route("**/b2-harness", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://localhost/b2-harness");

  for (const which of ["anon", "time", "shared"]) {
    results[which] = {};
    for (const [width, height] of [[390, 844], [654, 654], [768, 1000], [1440, 1000]]) {
      const tag = `${which.toUpperCase()} ${width}x${height}`;
      await page.setViewportSize({ width, height });
      await page.goto("http://localhost/b2-harness");
      await page.evaluate((kind) => { window.qaNext = kind; window.__b2Mutated = 0; }, which);
      await page.locator("#trigger").evaluate((el) => el.scrollIntoView());
      await page.evaluate(() => window.scrollTo(0, 1750));
      const trigger = page.locator("#trigger");
      await trigger.focus();
      const focusBefore = await page.evaluate(() => document.activeElement?.id);
      await trigger.click();

      const dialog = page.locator('[role="dialog"]');
      await dialog.waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const d = document.querySelector('[role="dialog"]');
        return !!d && d.contains(document.activeElement) && document.activeElement !== document.body;
      }, null, { timeout: 4000 });

      const measurement = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        const r = d.getBoundingClientRect();
        const scroller = d.querySelector(".overflow-y-auto");
        const header = d.querySelector("h2")?.getBoundingClientRect();
        const action = Array.from(d.querySelectorAll("button")).at(-1)?.getBoundingClientRect();
        return {
          viewport: { width: innerWidth, height: innerHeight }, scrollY,
          dialog: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
          documentScrollWidth: document.documentElement.scrollWidth,
          header: header && { top: header.top, bottom: header.bottom },
          action: action && { top: action.top, bottom: action.bottom },
          scroller: scroller && {
            scrollHeight: scroller.scrollHeight,
            clientHeight: scroller.clientHeight,
            overflowY: getComputedStyle(scroller).overflowY,
          },
          focusInsideOnOpen: d.contains(document.activeElement),
          focusTagOnOpen: document.activeElement?.tagName,
          portaledToBody: (() => {
            let root = d;
            while (root.parentElement && root.parentElement !== document.body) root = root.parentElement;
            return root.parentElement === document.body;
          })(),
          insideAppShellContent: !!d.closest(".app-shell-content"),
        };
      });

      // --- preserved viewport repair -------------------------------------------------
      assert.ok(measurement.scrollY > 1000, `${tag}: deep scroll not reached`);
      assert.ok(measurement.dialog.left >= 0 && measurement.dialog.right <= width, `${tag}: dialog outside viewport`);
      assert.ok(measurement.header?.top >= 0 && measurement.header.bottom <= height, `${tag}: header not visible`);
      assert.ok(measurement.action?.top >= 0 && measurement.action.bottom <= height, `${tag}: bottom action not reachable/visible`);
      assert.equal(measurement.documentScrollWidth, width, `${tag}: horizontal document overflow`);
      assert.equal(focusBefore, "trigger");
      check(`${tag} PORTAL_POSITIONING_STILL_PASS`, measurement.portaledToBody && !measurement.insideAppShellContent,
        `portaledToBody=${measurement.portaledToBody} insideShell=${measurement.insideAppShellContent}`);
      check(`${tag} DEEP_SCROLL_STILL_PASS`, measurement.scrollY > 1000);
      check(`${tag} HORIZONTAL_OVERFLOW=NO`, measurement.documentScrollWidth === width);
      check(`${tag} INTERNAL_SCROLL_STILL_PASS`, !!measurement.scroller && ["auto", "scroll"].includes(measurement.scroller.overflowY),
        `overflowY=${measurement.scroller?.overflowY}`);

      // --- FOCUS_ENTRY ---------------------------------------------------------------
      check(`${tag} FOCUS_ENTRY`, measurement.focusInsideOnOpen && measurement.focusTagOnOpen === "BUTTON",
        `inside=${measurement.focusInsideOnOpen} tag=${measurement.focusTagOnOpen}`);

      // --- FOCUS_TRAP_FORWARD (last -> Tab -> first) ---------------------------------
      const forward = await page.evaluate((sel) => {
        const d = document.querySelector('[role="dialog"]');
        const items = Array.from(d.querySelectorAll(sel)).filter((e) => e.tabIndex >= 0 && e.getClientRects().length > 0);
        items[items.length - 1].focus();
        return { last: items[items.length - 1] === document.activeElement, count: items.length };
      }, FOCUSABLE_SELECTOR);
      await page.keyboard.press("Tab");
      const afterForward = await page.evaluate((sel) => {
        const d = document.querySelector('[role="dialog"]');
        const items = Array.from(d.querySelectorAll(sel)).filter((e) => e.tabIndex >= 0 && e.getClientRects().length > 0);
        return { firstFocused: document.activeElement === items[0], inside: d.contains(document.activeElement) };
      }, FOCUSABLE_SELECTOR);
      check(`${tag} FOCUS_TRAP_FORWARD`, forward.last && afterForward.firstFocused && afterForward.inside,
        `lastFocus=${forward.last} wrapped=${afterForward.firstFocused} inside=${afterForward.inside} count=${forward.count}`);

      // --- FOCUS_TRAP_BACKWARD (first -> Shift+Tab -> last) --------------------------
      await page.evaluate((sel) => {
        const d = document.querySelector('[role="dialog"]');
        const items = Array.from(d.querySelectorAll(sel)).filter((e) => e.tabIndex >= 0 && e.getClientRects().length > 0);
        items[0].focus();
      }, FOCUSABLE_SELECTOR);
      await page.keyboard.press("Shift+Tab");
      const afterBackward = await page.evaluate((sel) => {
        const d = document.querySelector('[role="dialog"]');
        const items = Array.from(d.querySelectorAll(sel)).filter((e) => e.tabIndex >= 0 && e.getClientRects().length > 0);
        return { lastFocused: document.activeElement === items[items.length - 1], inside: d.contains(document.activeElement) };
      }, FOCUSABLE_SELECTOR);
      check(`${tag} FOCUS_TRAP_BACKWARD`, afterBackward.lastFocused && afterBackward.inside,
        `wrapped=${afterBackward.lastFocused} inside=${afterBackward.inside}`);

      // --- background isolation: focused page control cannot escape ------------------
      await page.evaluate(() => document.getElementById("trigger").focus());
      await page.keyboard.press("Tab");
      const backgroundIsolated = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        return { inside: d.contains(document.activeElement), tag: document.activeElement?.tagName };
      });
      check(`${tag} BACKGROUND_FOCUS_ISOLATED`, backgroundIsolated.inside, `active=${backgroundIsolated.tag}`);

      if (which === "shared") {
        await page.locator("#nested-trigger").click();
        await page.getByRole("dialog", { name: "Megerősítés", exact: true }).waitFor();
        check(`${tag} NESTED_PARENT_INERT`, await page.locator('[role="dialog"]').first().evaluate(el => !!el.closest('[inert]')));
        await page.keyboard.press("Escape");
        await page.getByRole("dialog", { name: "Megerősítés", exact: true }).waitFor({ state: "detached" });
        check(`${tag} ESCAPE_ONLY_TOPMOST`, await page.getByRole("dialog", { name: "Közös ablak", exact: true }).isVisible());
        await page.waitForFunction(() => document.activeElement?.id === "nested-trigger");
        check(`${tag} NESTED_FOCUS_RETURN`, true);
      }
      // --- ESCAPE closes + never mutates + restores focus ---------------------------
      const mutatedBeforeEscape = await page.evaluate(() => window.__b2Mutated || 0);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      await page.waitForFunction(() => document.activeElement?.id === "trigger", null, { timeout: 2000 }).catch(() => {});
      results[which][width] = measurement;
      const escapedClosed = (await dialog.count()) === 0;
      const afterEscape = await page.evaluate(() => ({ active: document.activeElement?.id, mutated: window.__b2Mutated || 0 }));
      check(`${tag} ESCAPE`, escapedClosed, `dialogCount=${await dialog.count()}`);
      check(`${tag} ESCAPE_NO_MUTATION`, afterEscape.mutated === mutatedBeforeEscape,
        `mutated ${mutatedBeforeEscape} -> ${afterEscape.mutated}`);
      check(`${tag} FOCUS_RETURN_AFTER_ESCAPE`, afterEscape.active === "trigger", `active=${afterEscape.active}`);

      // --- EXPLICIT_CLOSE + focus return --------------------------------------------
      await trigger.focus();
      await trigger.click();
      await dialog.waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const d = document.querySelector('[role="dialog"]');
        return !!d && d.contains(document.activeElement);
      }, null, { timeout: 4000 });
      const closeButton = which === "anon"
        ? page.getByRole("button", { name: "Mégse" })
        : page.getByRole("button", { name: "Bezárás" });
      await closeButton.click();
      await dialog.waitFor({ state: "detached" });
      await page.waitForFunction(() => document.activeElement?.id === "trigger", null, { timeout: 2000 }).catch(() => {});
      const afterExplicitClose = await page.evaluate(() => document.activeElement?.id);
      check(`${tag} EXPLICIT_CLOSE`, true);
      check(`${tag} FOCUS_RETURN`, afterExplicitClose === "trigger", `active=${afterExplicitClose}`);

      // --- internal scroll reaches the action when content overflows ----------------
      await trigger.focus();
      await trigger.click();
      await dialog.waitFor({ state: "visible" });
      const overflow = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        const scroller = d.querySelector(".overflow-y-auto");
        return scroller ? scroller.scrollHeight > scroller.clientHeight : false;
      });
      if (overflow) {
        await page.locator('[role="dialog"] .overflow-y-auto').evaluate((el) => { el.scrollTop = el.scrollHeight; });
        const actionName = which === "anon" ? "Anonimizált másolat készítése" : which === "time" ? "Idő mentése" : "Kész";
        assert.ok(await page.getByRole("button", { name: actionName }).isVisible(), `${tag}: action inaccessible after internal scroll`);
      }
      // close for the next iteration (Escape is canonical close)
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      console.log(`${tag} ${JSON.stringify(measurement)}`);
    }
  }
} finally {
  await browser.close();
  await fs.rm(TMP, { recursive: true, force: true });
}

console.log(`\nB2_MODAL_ACCESSIBILITY_QA: ${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  console.log("Failed checks:", failures.join(", "));
  process.exitCode = 1;
} else {
  console.log("B2_MODAL_VIEWPORT_QA=PASS");
  console.log("B2_MODAL_ACCESSIBILITY_QA=PASS");
}
