import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = () => fs.readFileSync("src/app/clients/[clientId]/calendar/page.tsx", "utf8");
const tabs = () => fs.readFileSync("src/components/clients/ClientWorkspaceTabs.tsx", "utf8");
const overview = () => fs.readFileSync("src/app/clients/[clientId]/page.tsx", "utf8");
const api = () => fs.readFileSync("src/lib/clientCalendarApi.ts", "utf8");

test("/clients/[clientId]/calendar exists and is a client-scoped workforce page", () => {
  const src = page();
  assert.match(src, /<AuthenticatedApp\b/);
  assert.match(src, /<ClientWorkspaceTabs clientId=\{client\.id\} active="calendar" organizationMode=\{organizationMode\}/);
  assert.match(src, /getClient\(clientId\)/);
  assert.match(src, /listAdminWorkspaces\(clientId\)/);
  assert.match(src, /<h1[^>]*>\{client\.name\}<\/h1>/);
  assert.match(src, /Naptár<\/p>/);
  // Client identity accent preserved via the client color system.
  assert.match(src, /getClientColorDefinition\(client\.colorKey\)/);
  assert.doesNotMatch(src, /createPortal|\/portal\b(?!szab)/);
});

test("ClientWorkspaceTabs exposes a client-scoped Naptár destination", () => {
  const src = tabs();
  assert.match(src, /\["calendar", "Naptár", "\/calendar"\]/);
  assert.match(src, /\| "calendar"/);
  // Href is built on the client route — never /deadlines.
  assert.match(src, /\/clients\/\$\{encodeURIComponent\(clientId\)\}\$\{suffix\}/);
  assert.doesNotMatch(src, /\/deadlines/);
});

test("client overview Naptár tile links to the real client calendar", () => {
  const src = overview();
  assert.match(src, /\/clients\/\$\{encodeURIComponent\(clientId\)\}\/calendar/);
  assert.match(src, />Naptár →</);
  assert.doesNotMatch(src, /Ügyfélnaptár kialakítás alatt/);
});

test("day/month/year/five-year controls and URL query state exist", () => {
  const src = page();
  for (const label of ['"Nap"', '"Hónap"', '"Év"', '"5 év"']) {
    assert.ok(src.includes(label), `missing view label ${label}`);
  }
  assert.match(src, /useSearchParams/);
  assert.match(src, /<Suspense fallback/);
  assert.match(src, /searchParams\?\.get\("view"\)/);
  assert.match(src, /searchParams\?\.get\("date"\)/);
  assert.match(src, /paramsNext\.set\("view", view\)/);
  assert.match(src, /router\.replace/);
  assert.match(src, /Előző időszak|Következő időszak|>Ma<\//);
});

test("all seven canonical source categories have labels and restrained indicators", () => {
  const src = page();
  for (const key of ["CONTRACT", "OBLIGATION", "ENTITLEMENT", "COMPANY_MILESTONE", "CASE_DEADLINE", "TASK", "CASE_INTAKE_DEADLINE"]) {
    assert.ok(src.includes(`${key}: "`), `missing source label ${key}`);
    assert.ok(src.includes(`${key}: "bg-`), `missing source indicator for ${key}`);
  }
  assert.match(src, /Szerződés/);
  assert.match(src, /határidő/i);
  // Legend exists so categories stay distinguishable.
  assert.match(src, /Object\.keys\(sourceLabels\)/);
});

test("calendar fetches only the dedicated client-scoped endpoint", () => {
  const apiSrc = api();
  assert.match(apiSrc, /\/client-calendar\/clients\/\$\{encodeURIComponent\(clientId\)\}/);
  assert.match(apiSrc, /new URLSearchParams\(\{ from: range\.from, to: range\.to \}\)/);
  const src = page();
  assert.match(src, /getClientCalendar\(clientId,/);
  assert.doesNotMatch(src, /\/deadlines|\/agenda|listCases|getCases\(/);
});

test("five-year view spans five calendar years with a grouped timeline", () => {
  const src = page();
  assert.match(src, /`\$\{y \+ 4\}-12-31`/); // Jan 1 y → Dec 31 y+4
  assert.match(src, /itemsByMonth/);
  assert.match(src, /view === "five-year"/);
  // Long-range timeline grouped by year then month — not 60 grids.
  assert.match(src, /border-l-2/);
});

test("month view is a compact grid and day detail has truthful empty state", () => {
  const src = page();
  assert.match(src, /grid-cols-7/);
  assert.match(src, /WEEKDAY_NAMES/);
  assert.match(src, /Nincs rögzített esemény ezen a napon\./);
  assert.match(src, /itemsByDay/);
});

test("a failed calendar load never renders as a truthful empty state", () => {
  const src = page();
  // Dedicated error state — a 4xx/5xx/network failure is not "no events".
  assert.match(src, /setCalendarError\("A naptáradatok most nem érhetők el\."\)/);
  assert.doesNotMatch(src, /\.catch\(\(\) => setItems\(\[\]\)\)/);
  // Empty-state copy is gated behind the absence of a load error.
  assert.match(src, /calendarError \?/);
  assert.match(src, /Nincs rögzített esemény ezen a napon\./);
  // Day view renders only the selected day's items, never the whole range.
  assert.match(src, /dayItems\.length \? dayItems\.map\(renderItemRow\)/);
});

test("anchor and selectedDay stay synchronized across navigation and view switches", () => {
  const src = page();
  // Prev/next moves the selected day together with the navigated period.
  assert.match(src, /const stepPeriod = \(direction: -1 \| 1\) => \{\s*const next = stepAnchor\(view, anchor, direction\);\s*setAnchor\(next\);\s*setSelectedDay\(dateKey\(next\)\);\s*\};/);
  assert.match(src, /onClick=\{\(\) => stepPeriod\(-1\)\}/);
  assert.match(src, /onClick=\{\(\) => stepPeriod\(1\)\}/);
  // Switching to Day view anchors on the selected grid day — never a stale day.
  assert.match(src, /key === "day"[\s\S]*?setAnchor\(selected\)/);
  assert.match(src, /onClick=\{\(\) => selectView\(key\)\}/);
  // "Ma" aligns anchor and selectedDay on the same day.
  assert.match(src, /setAnchor\(t\);\s*setSelectedDay\(dateKey\(t\)\)/);
  // Year-view month selection keeps a deterministic valid day in the new month.
  assert.match(src, /setAnchor\(new Date\(y, monthIndex, 1\)\); setView\("month"\); setSelectedDay\(`\$\{monthKey\}-01`\)/);
  // Month-cell clicks only move the selected day inside the already-fetched
  // range — the fetch effect depends on anchor/view, never selectedDay.
  assert.match(src, /\}, \[clientId, view, anchor\]\);/);
  assert.doesNotMatch(src, /\[clientId, view, anchor, selectedDay\]|selectedDay.*getClientCalendar/);
  // No raw setView/setAnchor bypass paths on the navigation controls.
  assert.doesNotMatch(src, /onClick=\{\(\) => setView\(key\)\}/);
  assert.doesNotMatch(src, /onClick=\{\(\) => setAnchor\(stepAnchor/);
});

test("deep-links only to proven existing surfaces", () => {
  const src = page();
  assert.match(src, /\/cases\/\$\{encodeURIComponent\(item\.caseId\)\}/);
  assert.match(src, /\/clients\/\$\{encodeURIComponent\(clientId\)\}\/vallalati-mukodes/);
  assert.doesNotMatch(src, /\/client-portal-admin|\/deadlines/);
});

test("portal dashboard and customer portal are not touched by the calendar slice", () => {
  const portal = fs.readFileSync("src/app/clients/[clientId]/portal/page.tsx", "utf8");
  assert.doesNotMatch(portal, /client-calendar|Naptár/);
  const customerPortal = fs.readFileSync("src/app/portal/page.tsx", "utf8");
  assert.doesNotMatch(customerPortal, /client-calendar/);
});
