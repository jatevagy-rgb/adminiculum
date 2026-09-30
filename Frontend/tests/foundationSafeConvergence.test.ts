import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Alert,
  MetricTile,
} from "../src/components/ui";

test("MetricTile renders static label and value", () => {
  const html = renderToStaticMarkup(
    React.createElement(MetricTile, {
      label: "Ügyek",
      value: "42",
      hint: "Aktív ügyek száma",
    })
  );

  assert.match(html, /Ügyek/);
  assert.match(html, /42/);
  assert.match(html, /Aktív ügyek száma/);
  assert.match(html, /<div[^>]+rounded-\[8px\]/);
});

test("MetricTile applies semantic tones correctly", () => {
  const successHtml = renderToStaticMarkup(
    React.createElement(MetricTile, {
      label: "Megfelelő",
      value: "19",
      tone: "success",
    })
  );
  assert.match(successHtml, /border-emerald-200/);
  assert.match(successHtml, /bg-emerald-50/);

  const dangerHtml = renderToStaticMarkup(
    React.createElement(MetricTile, {
      label: "Lejárt figyelem",
      value: "3",
      tone: "danger",
    })
  );
  assert.match(dangerHtml, /border-red-200/);
});

test("MetricTile overdue flag routes to danger tone", () => {
  const overdueHtml = renderToStaticMarkup(
    React.createElement(MetricTile, {
      label: "Lejárt határidő",
      value: "5",
      overdue: true,
    })
  );
  assert.match(overdueHtml, /border-red-200/);
});

test("MetricTile renders interactive button when onClick is provided", () => {
  const interactiveHtml = renderToStaticMarkup(
    React.createElement(MetricTile, {
      label: "Szűrés",
      value: "12",
      selected: true,
      onClick: () => undefined,
    })
  );
  assert.match(interactiveHtml, /<button[^>]+type="button"/);
  assert.match(interactiveHtml, /aria-pressed="true"/);
  assert.match(interactiveHtml, /min-h-\[40px\]/);
  assert.match(interactiveHtml, /focus-visible:ring-2/);
});

test("Alert renders semantic status and alert roles based on variant", () => {
  const infoHtml = renderToStaticMarkup(
    React.createElement(Alert, {
      variant: "info",
      title: "Tájékoztatás",
      children: "Rendszerfrissítés elérhető.",
    })
  );
  assert.match(infoHtml, /role="status"/);
  assert.match(infoHtml, /aria-live="polite"/);
  assert.match(infoHtml, /Tájékoztatás/);
  assert.match(infoHtml, /Rendszerfrissítés elérhető\./);
  assert.match(infoHtml, /border-blue-200/);

  const errorHtml = renderToStaticMarkup(
    React.createElement(Alert, {
      variant: "error",
      title: "Hiba",
      children: "A mentés meghiúsult.",
    })
  );
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /aria-live="assertive"/);
  assert.match(errorHtml, /border-red-200/);
});

test("Alert renders optional dismiss button with accessible label", () => {
  const dismissHtml = renderToStaticMarkup(
    React.createElement(Alert, {
      variant: "warning",
      title: "Figyelmeztetés",
      onDismiss: () => undefined,
      children: "Figyelem szükséges.",
    })
  );
  assert.match(dismissHtml, /aria-label="Értesítés bezárása"/);
  assert.match(dismissHtml, /<button[^>]+type="button"/);
});

test("Alert supports custom action slot", () => {
  const actionHtml = renderToStaticMarkup(
    React.createElement(Alert, {
      variant: "info",
      action: React.createElement("button", { type: "button" }, "Részletek"),
      children: "További információ",
    })
  );
  assert.match(actionHtml, /Részletek/);
  assert.match(actionHtml, /További információ/);
});
