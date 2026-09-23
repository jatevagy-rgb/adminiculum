import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Button,
  ConfirmationDialog,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmpty,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
  EmptyState,
  QuietLink,
} from "../src/components/ui";

test("QuietLink renders a link and button variant", () => {
  const link = renderToStaticMarkup(
    React.createElement(QuietLink as React.ElementType, { href: "/tasks", icon: "→", size: "sm" }, "Megnyitás"),
  );
  assert.match(link, /<a[^>]+href="\/tasks"/);
  assert.match(link, /aria-hidden="true"/);
  assert.match(link, /Megnyitás/);

  const button = renderToStaticMarkup(
    React.createElement(QuietLink as React.ElementType, { onClick: () => undefined }, "Művelet"),
  );
  assert.match(button, /<button[^>]+type="button"/);
  assert.match(button, /Művelet/);
});

test("DataTable renders semantic table primitives", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      DataTable,
      { minWidth: 640, "aria-label": "Ügyek" },
      React.createElement(
        DataTableHead,
        null,
        React.createElement(
          DataTableRow,
          null,
          React.createElement(DataTableHeaderCell, null, "Ügy"),
        ),
      ),
      React.createElement(
        DataTableBody,
        null,
        React.createElement(
          DataTableRow,
          { selected: true },
          React.createElement(DataTableCell, { muted: true }, "Minta"),
        ),
      ),
    ),
  );
  assert.match(html, /<table/);
  assert.match(html, /<thead/);
  assert.match(html, /<th[^>]+scope="col"/);
  assert.match(html, /<tbody/);
  assert.match(html, /min-width:640px/);
  assert.match(html, /bg-\[#F8FAF9\]/);
});

test("DataTableEmpty renders a spanning empty row", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      DataTableEmpty as React.ElementType,
      { colSpan: 3 },
      React.createElement(EmptyState, {
        title: "Nincs adat",
        className: "border-0 rounded-none",
      }),
    ),
  );
  assert.match(html, /<tr>/);
  assert.match(html, /colSpan="3"/);
  assert.match(html, /Nincs adat/);
  assert.match(html, /border-0 rounded-none/);
});

test("ConfirmationDialog stays closed when requested", () => {
  const html = renderToStaticMarkup(
    React.createElement(ConfirmationDialog, {
      open: false,
      title: "Törlés megerősítése",
      confirmLabel: "Törlés",
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }),
  );
  assert.equal(html, "");
});

test("ConfirmationDialog renders cancel before confirm and marks danger", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      ConfirmationDialog,
      {
        open: true,
        title: "Törlés megerősítése",
        description: "A művelet nem vonható vissza.",
        confirmLabel: "Törlés",
        variant: "danger",
        onConfirm: () => undefined,
        onCancel: () => undefined,
      },
      React.createElement("p", null, "Extra tartalom"),
    ),
  );
  assert.match(html, /role="dialog"/);
  assert.match(html, /Mégse/);
  assert.match(html, /Törlés/);
  assert.match(html, /data-variant="danger"/);
  assert.ok(html.indexOf(">Mégse<") < html.indexOf(">Törlés<"));
});

test("ConfirmationDialog busy disables both actions and uses busy label", () => {
  const html = renderToStaticMarkup(
    React.createElement(ConfirmationDialog, {
      open: true,
      title: "Mentés",
      confirmLabel: "Mentés",
      busy: true,
      busyLabel: "Mentés…",
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }),
  );
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /Mentés…/);
});
