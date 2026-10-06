/**
 * Behavioral proof for the case-thread linking error mapping.
 *
 * The mapping translates the existing `link-case` failure surface into
 * product-level Hungarian wording so the picker never shows raw server text and
 * always names the state the user hit: unauthorized, not-found, cross-client
 * conflict, cross-case task conflict, or a generic failure.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkThreadErrorMessage } from "../src/lib/communicationLinkErrors";

describe("linkThreadErrorMessage", () => {
  it("names unauthorized access", () => {
    assert.equal(
      linkThreadErrorMessage({ status: 403 }),
      "Nincs jogosultságod a beszélgetés ehhez az ügyhöz kapcsolásához.",
    );
  });

  it("names a missing conversation or case", () => {
    assert.equal(
      linkThreadErrorMessage({ status: 404 }),
      "A kiválasztott beszélgetés vagy az ügy nem található.",
    );
  });

  it("names a cross-client mismatch", () => {
    assert.equal(
      linkThreadErrorMessage({ status: 409, code: "CLIENT_CASE_MISMATCH" }),
      "A beszélgetés másik ügyfélhez tartozik, ezért nem kapcsolható ehhez az ügyhöz.",
    );
  });

  it("names a cross-case task conflict", () => {
    assert.equal(
      linkThreadErrorMessage({ status: 409, code: "COMMUNICATION_TASK_CASE_MISMATCH" }),
      "A beszélgetéshez kapcsolt feladat másik ügyhöz tartozik; előbb rendezd a feladat kapcsolatát.",
    );
  });

  it("names a generic conflict without exposing the code", () => {
    const message = linkThreadErrorMessage({ status: 409, code: "SOMETHING_ELSE" });
    assert.match(message, /ütközés miatt nem sikerült/);
    assert.doesNotMatch(message, /SOMETHING_ELSE/);
  });

  it("falls back to a generic failure for unknown errors", () => {
    assert.equal(
      linkThreadErrorMessage({ status: 500 }),
      "A beszélgetés hozzárendelése nem sikerült. Próbáld újra.",
    );
    assert.equal(
      linkThreadErrorMessage(null),
      "A beszélgetés hozzárendelése nem sikerült. Próbáld újra.",
    );
  });
});
