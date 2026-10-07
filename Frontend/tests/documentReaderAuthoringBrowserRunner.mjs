// Bounded, local-only preview owned by this test. No build and no backend.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logs = path.join(root, "test-results/document-remediation");
fs.mkdirSync(logs, { recursive: true });
const env = { ...process.env, NEXT_PUBLIC_BACKEND_BASE_URL: "http://127.0.0.1:3142", QA_BASE_URL: "http://127.0.0.1:3142" };
const children = [];
const stop = () => {
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 10000, stdio: "ignore" });
      else child.kill();
    }
  }
};
const timeout = setTimeout(() => { console.error("TIMEOUT: preview + browser checks exceeded 420 seconds"); stop(); process.exit(124); }, 420000);
const PORT = 3142;
const preview = spawn(process.execPath, ["tests/wordWorkflowPreview.mjs"], { cwd: root, env: { ...env, PREVIEW_PORT: String(PORT) }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
try {
  children.push(preview);
  preview.stdout.pipe(fs.createWriteStream(path.join(logs, "dev.stdout.log")));
  preview.stderr.pipe(fs.createWriteStream(path.join(logs, "dev.stderr.log")));
  await new Promise((resolve, reject) => {
    preview.stdout.on("data", (chunk) => { if (chunk.toString().includes("Ready in")) resolve(); });
    preview.on("error", reject);
    preview.on("exit", (code) => reject(new Error(`Preview exited ${code}`)));
  });
  const qa = spawn(process.execPath, ["tests/documentReaderAuthoringBrowserQA.mjs"], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  children.push(qa);
  qa.stdout.pipe(process.stdout); qa.stderr.pipe(process.stderr);
  process.exitCode = await new Promise((resolve, reject) => { qa.on("exit", resolve); qa.on("error", reject); });
} finally { clearTimeout(timeout); stop(); }
