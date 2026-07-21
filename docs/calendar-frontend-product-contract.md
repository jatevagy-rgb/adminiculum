# Calendar Frontend Product Contract

Date: 2026-07-21

## Overview

This document defines the frontend product contract for the shared office calendar. It specifies views, interactions, and presentation rules without prescribing component implementation.

## Views

### Month view

**Primary navigation view.** Displays a grid of day cells for one calendar month.

- Grid: 7 columns (Hétfő–Vasárnap), 4-6 rows depending on month
- Week starts on Monday (Hungarian convention)
- Each cell shows up to 3 event items; overflow shows "+N további" ("+N more") chip
- All-day events render as full-width bars spanning their date range
- Timed events render as single-line items with time prefix: "10:00 Tárgyalás"
- Items are color-coded by clientColorKey when available, neutral gray otherwise
- Today's cell is highlighted with accent border
- Weekend columns may be visually de-emphasized (lighter background)
- Clicking a day navigates to day view
- Clicking an event opens event detail

### Week view

**Detailed time-grid view.** Displays 7 days with hourly slots.

- Time axis: 00:00–23:00 in 1-hour increments, left column
- Day columns: Monday–Sunday
- All-day events render in a dedicated row above the time grid
- Timed events render as positioned blocks proportional to their duration
- Overlapping events are displayed side-by-side (max 3 columns)
- Current time is indicated by a horizontal red line
- Working hours (08:00–18:00) are visually distinct from off-hours
- Clicking empty space opens event creation with pre-filled date/time

### Day view

**Single-day detail view.** Displays one day with hourly slots.

- Same time axis as week view but single-column
- All events for the day are visible without overflow
- Shows full event titles (no truncation)
- Event blocks are wider and can show subtitle (case number, location)
- Clicking empty space opens event creation with pre-filled time

### Agenda view (list)

**Scrollable list view.** Displays upcoming events in chronological order.

- Groups items by date with date headers
- Shows all CalendarItem fields in list row format
- No time grid — items are listed vertically
- Supports infinite scroll or "load more" pagination
- Filters: event type, source type, case, responsible user
- This replaces/evolves the existing `/deadlines` Munkasor view over time

## Navigation

- Month/Week/Day/Agenda view switcher (tabs or segmented control)
- Previous/Next navigation arrows
- "Ma" (Today) button returns to current date
- Date picker for jumping to specific date
- URL reflects current view and date: `/calendar?view=week&date=2026-08-15`

## Event creation

### Quick create

- Click empty space in day/week view → opens inline creation form
- Pre-fills: date, time (from clicked position), current user as responsible
- Minimal fields: title, event type, start/end time
- "Mentés" (Save) creates the event
- "Több részlet" (More details) opens full creation dialog

### Full creation dialog

- Modal or slide-over panel
- All fields from CreateCalendarEventRequest
- Event type selector with icons
- Date/time pickers
- Case selector (searchable dropdown)
- Participant selector (searchable, multi-select)
- Recurrence rule builder (simple: daily/weekly/monthly/yearly, with end condition)
- Visibility selector
- Location text field
- Online meeting URL field
- Description textarea

### Validation feedback

- Required field indicators
- Inline validation errors (not just on submit)
- Date/time conflict warnings (e.g., event outside working hours)
- Timed event duration validation (max 7 days)
- All-day event duration validation (max 90 days)

## Event detail

### Detail panel

- Opens when clicking an event item in any view
- Shows all event fields with labels
- Shows participant list with roles
- Shows case link (navigates to case detail)
- Shows client name and color indicator
- Shows recurrence information in human-readable form: "Minden hétfőn, 10:00–11:00" (Every Monday, 10:00–11:00)
- Action buttons based on capabilities: "Szerkesztés" (Edit), "Törlés" (Delete), "Lemondás" (Cancel)

### Edit mode

- Same fields as full creation dialog
- For recurring events: scope selector appears — "Csak ezt" (Only this), "Ezt és az összes következőt" (This and all following), "Az összes eseményt" (All events)
- Version conflict handling: if save returns 409, show "Az eseményt közben módosították. Frissítse az oldalt." (The event was modified. Refresh the page.)

## Projected items (task/case deadlines)

### Visual distinction

Task and case deadline projections are visually distinct from native CalendarEvent items:

| Property | CalendarEvent | Task deadline | Case deadline |
|---|---|---|---|
| Icon | Event type icon | Task icon (checkmark) | Case icon (briefcase) |
| Badge | None | "Feladat" (Task) | "Ügyhatáridő" (Case deadline) |
| Color | Client color or neutral | Client color or task accent | Client color or case accent |
| Interaction | Click → event detail | Click → task detail | Click → case detail |
| Edit | Full edit capability | Reschedule only | Navigate to case |

### Reschedule interaction

For task deadline projections with `canReschedule: true`:
- "Átütemezés" (Reschedule) button in detail panel
- Date picker for new due date
- Confirmation: "Biztosan átütemezi a feladat határidejét?" (Are you sure you want to reschedule the task deadline?)
- Calls `POST /api/v1/tasks/{taskId}/reschedule`

## Private event placeholder

Events where `isPlaceholder: true` render as:
- Title: "Foglalt" (Busy)
- Background: neutral gray, slightly transparent
- No click interaction (no detail panel)
- Time range is visible
- No case, client, or participant information

## Color contract

Events inherit color from `clientColorKey` when associated with a case that has a client with a color key.

| Source | Color determination |
|---|---|
| CalendarEvent with case → client → colorKey | Client color palette |
| CalendarEvent without case | Neutral gray |
| Task deadline with case → client → colorKey | Client color palette |
| Case deadline with case → client → colorKey | Client color palette |
| Placeholder (Foglalt) | Neutral gray |

The existing 10-color client palette (from `clientColors.ts`) is reused. No new colors are introduced.

## Responsive behavior

| Breakpoint | View |
|---|---|
| Desktop (≥1280px) | Full month/week grid, side-by-side detail panel |
| Tablet (768–1279px) | Month grid with fewer visible items, detail panel as overlay |
| Mobile (<768px) | Agenda view default, day view available, week/month views show simplified grid |

## Accessibility

- All interactive elements are keyboard navigable
- Events are focusable with Enter to open detail
- Arrow keys navigate between days in month/week view
- Screen reader announces event title, time, type, and case
- Color is never the sole indicator — icons and text labels accompany color coding
- Focus traps in modal dialogs
- ARIA labels on grid cells: "2026. augusztus 15., péntek, 3 esemény" (August 15, 2026, Friday, 3 events)

## Loading states

- Skeleton grid while calendar data loads
- Individual event items fade in as data arrives
- "Betöltés..." (Loading...) text for slow connections
- Error state: "Nem sikerült betölteni a naptárt. Próbálja újra." (Failed to load the calendar. Try again.) with retry button
