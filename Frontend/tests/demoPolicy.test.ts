import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_WARNING, isDemoMode } from "../src/lib/demoPolicy";

describe("demo content policy", () => {
  it("defaults to production mode", () => {
    delete process.env.NEXT_PUBLIC_ADMINICULUM_DEMO_MODE;
    assert.equal(isDemoMode(), false);
  });

  it("enables demo mode only for the explicit true flag", () => {
    process.env.NEXT_PUBLIC_ADMINICULUM_DEMO_MODE = "true";
    assert.equal(isDemoMode(), true);
    process.env.NEXT_PUBLIC_ADMINICULUM_DEMO_MODE = "TRUE";
    assert.equal(isDemoMode(), false);
    delete process.env.NEXT_PUBLIC_ADMINICULUM_DEMO_MODE;
  });

  it("defines the required persistent warning copy", () => {
    assert.equal(DEMO_WARNING, "DEMO ADAT – nem jogi forrásból származó tartalom");
  });
});
