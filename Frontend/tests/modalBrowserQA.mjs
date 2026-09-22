// Browser QA for the canonical Modal hardening on the real /clients page.
// Covers: initial focus, Tab/Shift+Tab trap, overlay-safe dismissal,
// form-data preservation, Escape close, focus restore, and the
// closeOnOverlayClick={true} opt-in via an isolated esbuild harness.
//
// Usage (after `npm run build`): node tests/modalBrowserQA.mjs
import { chromium } from "playwright";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.MODAL_QA_PORT || 3096);
const BASE_URL = `http://localhost:${PORT}`;

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

let passed = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name} ${detail}`);
  }
}

const FOCUSABLE_EXPR = `el => el.matches('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])')`;

async function runClientsModalFlow(page) {
  console.log("\n[clients] real /clients modal flow");
  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/me")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(QA_USER) });
    }
    if (url.includes("/clients/lookup")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
    }
    if (url.includes("/clients")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  await page.goto(`${BASE_URL}/clients`, { waitUntil: "networkidle" });

  const trigger = page.getByRole("button", { name: "+ Új ügyfél", exact: true }).first();
  await trigger.waitFor({ state: "visible", timeout: 15000 });

  // 1. focus trigger before opening
  await trigger.focus();
  check("trigger receives focus before open", await page.evaluate(
    () => document.activeElement?.textContent?.includes("Új ügyfél")
  ));

  // 2. open modal with keyboard
  await page.keyboard.press("Enter");
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: "visible" });
  check("dialog opened via trigger", await dialog.isVisible());
  check("dialog has aria-modal", (await dialog.getAttribute("aria-modal")) === "true");
  check("dialog labelled by title", Boolean(await dialog.getAttribute("aria-labelledby")));

  // 3. initial focus moved inside the dialog
  await page.waitForTimeout(300);
  const focusInside = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return d && d.contains(document.activeElement);
  });
  check("initial focus moved inside dialog", focusInside);

  // 4-5. Tab wrap: focus last focusable -> Tab -> first focusable
  const wrap = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const sel = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';
    const items = Array.from(d.querySelectorAll(sel)).filter((e) => e.tabIndex >= 0);
    return { count: items.length };
  });
  check("dialog has tabbable elements", wrap.count >= 2, `count=${wrap.count}`);

  await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const sel = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';
    const items = Array.from(d.querySelectorAll(sel)).filter((e) => e.tabIndex >= 0);
    items[items.length - 1].focus();
  });
  await page.keyboard.press("Tab");
  const wrappedToFirst = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const sel = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';
    const items = Array.from(d.querySelectorAll(sel)).filter((e) => e.tabIndex >= 0);
    return document.activeElement === items[0];
  });
  check("Tab from last wraps to first", wrappedToFirst);

  // 6. Shift+Tab wrap: first -> last
  await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const sel = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';
    const items = Array.from(d.querySelectorAll(sel)).filter((e) => e.tabIndex >= 0);
    items[0].focus();
  });
  await page.keyboard.press("Shift+Tab");
  const wrappedToLast = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const sel = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';
    const items = Array.from(d.querySelectorAll(sel)).filter((e) => e.tabIndex >= 0);
    return document.activeElement === items[items.length - 1];
  });
  check("Shift+Tab from first wraps to last", wrappedToLast);

  // 7. type deterministic text into the name field
  const nameInput = dialog.locator("input").first();
  const marker = "QA TESZT UGYFEL KFT";
  await nameInput.fill(marker);

  // 8-10. outside (overlay) click: modal stays open, data preserved
  await page.mouse.click(8, 8);
  await page.waitForTimeout(200);
  check("overlay click does not close modal by default", await dialog.isVisible());
  check("typed data survives overlay click", (await nameInput.inputValue()) === marker);

  // 11-13. Escape closes, focus restored to trigger
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  check("Escape closes modal", (await dialog.count()) === 0 || !(await dialog.isVisible()));
  await page.waitForTimeout(200);
  const restored = await page.evaluate(
    () => document.activeElement?.textContent?.includes("Új ügyfél")
  );
  check("focus restored to trigger after close", restored);

  // Re-open and close via Mégse (explicit cancel path)
  await trigger.focus();
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Mégse" }).click();
  await dialog.waitFor({ state: "hidden" });
  check("explicit Cancel closes modal", (await dialog.count()) === 0 || !(await dialog.isVisible()));
}

function buildOptInHarness(tmpDir) {
  const entry = path.join(tmpDir, "harness.jsx");
  const bundle = path.join(tmpDir, "harness.js");
  fs.writeFileSync(
    entry,
    `import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Modal } from "${path.join(ROOT, "src/components/ui/Modal.tsx").replace(/\\/g, "/")}";
function App() {
  const [open, setOpen] = useState(false);
  return React.createElement("div", null,
    React.createElement("button", { id: "open", onClick: () => setOpen(true) }, "Open"),
    React.createElement(Modal, { open, onClose: () => setOpen(false), title: "Harness", closeOnOverlayClick: true },
      React.createElement("button", { id: "inside" }, "Inside")
    )
  );
}
createRoot(document.getElementById("root")).render(React.createElement(App));`
  );
  execFileSync(path.join(ROOT, "node_modules/.bin/esbuild"), [
    entry, "--bundle", "--format=iife", "--jsx=automatic", `--outfile=${bundle}`,
  ], { env: { ...process.env, NODE_PATH: path.join(ROOT, "node_modules") } });
  return bundle;
}

async function runOverlayOptInHarness(page) {
  console.log("\n[harness] closeOnOverlayClick={true} opt-in");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "modal-qa-"));
  const bundlePath = buildOptInHarness(tmpDir);
  const bundleJs = fs.readFileSync(bundlePath, "utf8");

  await page.route("**/modal-qa-harness", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html><head><style>.fixed.inset-0{position:fixed;inset:0}.relative{position:relative}.z-10{z-index:10}</style></head><body><div id='root'></div><script src='/modal-qa-harness.js'></script></body></html>" })
  );
  await page.route("**/modal-qa-harness.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: bundleJs })
  );

  await page.goto(`${BASE_URL}/modal-qa-harness`);
  const dialog = page.locator('[role="dialog"]');
  await page.locator("#open").click();
  await dialog.waitFor({ state: "visible" });

  // inside click must not close
  await page.locator("#inside").click();
  check("inside click does not trigger overlay dismissal (opt-in)", await dialog.isVisible());

  // overlay click closes when opted in
  await page.mouse.click(8, 8);
  await dialog.waitFor({ state: "hidden" });
  check("overlay click closes when closeOnOverlayClick={true}", (await dialog.count()) === 0 || !(await dialog.isVisible()));

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

async function seedAuth(page) {
  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-workforce-token");
    localStorage.setItem("adminiculum:auth_token:workforce", "qa-workforce-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));

    Object.defineProperty(Object.prototype, "controller", {
      set(val) {
        Object.defineProperty(this, "controller", { value: val, writable: true, configurable: true });
        if (typeof this.getAllAccounts === "function" && typeof this.acquireTokenSilent === "function") {
          const proto = Object.getPrototypeOf(this);
          proto.getAllAccounts = function () {
            return [{
              homeAccountId: profile.id,
              environment: "login.windows.net",
              tenantId: "",
              username: profile.email,
              localAccountId: profile.id,
              name: profile.name,
            }];
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
      get() { return undefined; },
      configurable: true,
    });
  }, { profile: QA_USER });
}

async function main() {
  console.log(`[modal-qa] Starting Next.js server on port ${PORT}...`);
  await startServer();
  console.log("Server ready, launching Chromium...");

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error("PAGE_ERROR:", err.message));
    await seedAuth(page);

    await runClientsModalFlow(page);
    await runOverlayOptInHarness(page);
  } finally {
    await browser.close();
    stopServer();
  }

  console.log(`\n[modal-qa] ${passed} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("Failed checks:", failures.join(", "));
    process.exit(1);
  }
  console.log("[modal-qa] ALL CHECKS PASSED");
}

main().catch((err) => {
  console.error(err);
  stopServer();
  process.exit(1);
});
