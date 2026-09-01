import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

const route = fs.readFileSync(
  path.join(process.cwd(), "src", "app", "api", "release-identity", "route.ts"),
  "utf8"
);

test("frontend release identity route returns only public build identity metadata", () => {
  assert.match(route, /NEXT_PUBLIC_APP_COMMIT_SHA/);
  assert.match(route, /NEXT_PUBLIC_APP_BUILD_TIME/);
  assert.match(route, /commitSha:/);
  assert.match(route, /buildTime:/);
  assert.doesNotMatch(route, /DATABASE_URL|SECRET|TOKEN/);
});
