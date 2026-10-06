// Deterministic real-component viewport QA; no Next app or MSAL session required.
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

await build({
  stdin: {
    resolveDir: ROOT,
    loader: "tsx",
    sourcefile: "harness.tsx",
    contents: `import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AnonymizeModal } from "${path.join(ROOT, "src/components/documents/AnonymizeModal.tsx").replace(/\\/g, "/")}";
import { CaseTimeEntryDialog } from "${path.join(ROOT, "src/components/cases/CaseTimeEntryDialog.tsx").replace(/\\/g, "/")}";
function Harness() {
  const [which, setWhich] = useState("");
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const contract = { id: "qa-document", title: "Viewport QA", fileName: "qa.docx", templateName: "QA", revisionNumber: 1, status: "DRAFT" };
  return <><button id="trigger" onClick={() => { setWhich(window.qaNext); setOpen(true); }}>Open dialog</button>
    {open && which === "anon" && <AnonymizeModal isOpen onClose={close} contract={contract} />}
    {open && which === "time" && <CaseTimeEntryDialog caseId="qa-case" tasks={[]} onClose={close} onSaved={close} />}
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
        contents: args.path === "api" ? "export async function getAnonymizationSourceText(){return {success:false,textAvailable:false}}; export async function anonymizeDocument(){return {success:false}}" :
          args.path === "time-api" ? "export async function recordCaseTime(){}" :
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
</style><main class="app-shell-content"><div id="root"></div><script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></main>`;

const browser = await chromium.launch({ headless: true });
const results = {};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => console.error("PAGE_ERROR", error));
  await page.route("**/b2-harness", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://localhost/b2-harness");
  for (const which of ["anon", "time"]) {
    results[which] = {};
    for (const [width, height] of [[390, 844], [654, 654], [768, 1000], [1440, 1000]]) {
      await page.setViewportSize({ width, height });
      await page.goto("http://localhost/b2-harness");
      await page.evaluate((kind) => { window.qaNext = kind; }, which);
      await page.locator("#trigger").evaluate((el) => el.scrollIntoView());
      await page.evaluate(() => window.scrollTo(0, 1750));
      const trigger = page.locator("#trigger");
      await trigger.focus();
      const focusBefore = await page.evaluate(() => document.activeElement?.id);
      await trigger.click();
      const dialog = page.locator('[role="dialog"]');
      await dialog.waitFor({ state: "visible" });
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
          scroller: scroller && { scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight },
          focusInsideOnOpen: d.contains(document.activeElement),
          focusTagOnOpen: document.activeElement?.tagName,
        };
      });
      assert.ok(measurement.scrollY > 1000, `${which} ${width}: deep scroll not reached`);
      assert.ok(measurement.dialog.left >= 0 && measurement.dialog.right <= width, `${which} ${width}: dialog outside viewport`);
      assert.ok(measurement.header?.top >= 0 && measurement.header.bottom <= height, `${which} ${width}: header not visible`);
      assert.ok(measurement.action?.top >= 0 && measurement.action.bottom <= height, `${which} ${width}: bottom action not reachable/visible`);
      assert.equal(measurement.documentScrollWidth, width, `${which} ${width}: horizontal document overflow`);
      assert.equal(focusBefore, "trigger");

      if (width === 390 && height === 844) {
        results[which].tabTrap = await page.evaluate(() => {
          const d = document.querySelector('[role="dialog"]');
          const selector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';
          const items = Array.from(d.querySelectorAll(selector));
          items.at(-1).focus();
          return { count: items.length, last: items.at(-1), first: items[0] };
        }).then(async ({ count }) => {
          await page.keyboard.press("Tab");
          return { count, wrapsLastToFirst: await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"]');
            const selector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';
            return document.activeElement === d.querySelectorAll(selector)[0];
          }) };
        });
        await page.keyboard.press("Escape");
        results[which].escapeClosed = !(await dialog.isVisible());
        assert.equal(results[which].tabTrap.wrapsLastToFirst, false, `${which}: dialog unexpectedly traps focus`);
        assert.equal(results[which].escapeClosed, false, `${which}: Escape unexpectedly closes dialog`);
      }

      if (which === "time" && measurement.scroller.scrollHeight > measurement.scroller.clientHeight) {
        await page.locator('[role="dialog"] .overflow-y-auto').evaluate((el) => { el.scrollTop = el.scrollHeight; });
        assert.ok(await page.getByRole("button", { name: "Idő mentése" }).isVisible(), "time save action inaccessible after internal scroll");
      } else if (which === "anon") {
        const scrollArea = page.locator('[role="dialog"] .overflow-y-auto');
        await scrollArea.evaluate((el) => { el.scrollTop = el.scrollHeight; });
        assert.ok(await page.getByRole("button", { name: "Anonimizált másolat készítése" }).isVisible(), "anonymize action inaccessible after internal scroll");
      }

      results[which][width] = measurement;
      console.log(`${which.toUpperCase()} ${width}x${height} ${JSON.stringify(measurement)}`);
      const close = which === "anon" ? page.getByRole("button", { name: "Mégse" }) : page.getByRole("button", { name: "Bezárás" });
      await close.click();
      await dialog.waitFor({ state: "detached" });
      results[which][width].focusReturnToTrigger = await page.evaluate(() => document.activeElement?.id === "trigger");
    }
  }
  console.log(`FOCUS: entry target=${results.anon[390].focusTagOnOpen}; Tab last-to-first wraps=${results.anon.tabTrap.wrapsLastToFirst}/${results.time.tabTrap.wrapsLastToFirst}; Escape closed=${results.anon.escapeClosed}/${results.time.escapeClosed}; explicit close=passed; focus return to trigger=${results.anon[390].focusReturnToTrigger ? "passed" : "not implemented (focus falls to document body)"}.`);
  console.log("B2_MODAL_VIEWPORT_QA=PASS");
} finally {
  await browser.close();
  await fs.rm(TMP, { recursive: true, force: true });
}
