# Dashboard Operational Case Overview Correction

## Scope

This narrow correction restores the Dashboard's operational purpose without deployment, schema changes, migrations, package changes, Azure changes, authentication changes, or TaskSubmission lifecycle changes.

Base: `7dec5d2058580e8548074a6ac3b9887426e386db`

Branch: `codex/dashboard-operational-case-overview-1`

## Problems Corrected

- The shell context and page heading both rendered `Műszerfal`.
- The previous resume selector used recent activity and could promote terminal work with the generic action `Munka folytatása`.
- A bare open-case total did not explain where action was required or what the next safe step was.

## Correction

- The shell context is now `Belső munkapad`; the page heading remains `Műszerfal`.
- `Itt folytasd` consumes one authorization-scoped backend projection with explicit resumable action codes.
- Terminal, unknown, unauthorized, stale, and fully completed work is excluded.
- A compact `Ügyek, ahol lépés szükséges` section replaces the bare counter as the primary matter overview.
- The open-case total remains a secondary link to `/cases`.
- Client color is used only as a narrow identity accent through the existing `ClientAccent` contract.

## Product Truthfulness

Only persisted case status, responsibility, task state, submission state, stuck reason, and deadlines are used. Communication text, task titles, and other free text are not interpreted as workflow state. Counterparty and authority/court waiting groups remain unsupported until an explicit persisted state exists.

## Safety

- No Prisma schema or migration change.
- No TaskSubmission transition or review-decision change.
- No communications, calendar, auth, CORS, Client Portal, editor, AI, Outlook/Graph, package, environment, Azure, or deployment change.

## Visual Hierarchy Candidate

The follow-up branch `codex/dashboard-visual-hierarchy-1` preserves this backend contract while presenting the five authoritative groups as a bounded grouped list: maximum six visible cases and maximum two per group. Actual open, group, unspecified, and remaining counts remain derived from the same response. Known raw case-type suffixes are mapped only for display. Release/deployment status is unchanged until separate integration approval.
