import assert from "node:assert/strict";
import test from "node:test";
import { buildClientRequestDraftPayload, validateRequestFields } from "../src/components/client-portal/ClientRequestComposer";

test("request composer builds a client-safe DATA_FORM draft with stable field order", () => {
  const payload = buildClientRequestDraftPayload({
    clientId: "client-1", caseId: "case-1", type: "DATA_FORM", title: "Tulajdonosi adatok", instructions: "Töltse ki a mezőket.", why: "Az ügy előkészítéséhez szükséges.", required: true, dueAt: "2026-08-12",
    fields: [
      { label: "Cégnév", type: "SHORT_TEXT", required: true, order: 99 },
      { label: "Tulajdonos", type: "SINGLE_CHOICE", options: ["A", "B"], order: 0 },
    ], documentSpec: {},
  });
  assert.equal(payload.clientSafeInstructions, "Töltse ki a mezőket.\n\nMiért szükséges: Az ügy előkészítéséhez szükséges.");
  assert.deepEqual(payload.fields?.map((field) => field.order), [0, 1]);
  assert.equal(payload.documentSpec, undefined);
});

test("request composer rejects empty and duplicate choice options", () => {
  assert.equal(validateRequestFields([{ label: "", type: "SHORT_TEXT" }]), "Minden adatmezőnek kell ügyfélbiztos címke.");
  assert.equal(validateRequestFields([{ label: "Típus", type: "SINGLE_CHOICE", options: ["A", "A"] }]), "A választási lehetőségek nem lehetnek üresek vagy ismétlődők.");
  assert.equal(validateRequestFields([{ label: "Típus", type: "SINGLE_CHOICE", options: ["A", "B"] }]), null);
});
