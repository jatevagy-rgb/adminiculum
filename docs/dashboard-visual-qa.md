# Dashboard Visual QA

## Environment

- Authenticated local frontend: `http://localhost:3410`
- Loopback backend: `http://127.0.0.1:3411`
- Disposable PostgreSQL database with synthetic QA-only records
- No production data, Azure resource, or deployed runtime used

## Coverage

Fourteen PNG screenshots were retained outside git under `%TEMP%\adminiculum-dashboard-visual-hierarchy-screenshots`:

1. populated viewport at 1366×768
2. populated full page at 1366 px
3. populated viewport at 1440×900
4. populated full page at 1440 px
5. operational case groups
6. operational warning/counts
7. populated daily work, calendar, and communications
8. empty selected calendar day
9. collapsed further signals
10. expanded further signals
11. quick actions and populated resume
12. responsive 1100×800 wrap
13. compact empty resume
14. empty daily work, calendar, and communications

## Result

- Four light primary actions; no saturated strip.
- Clear resume, intervention, assigned-work, calendar, and communication hierarchy.
- Operational list is readable and bounded to six items.
- Raw `LITIGATION` and `CONTRACT_DRAFTING` values discovered during QA were removed from display through the local formatter.
- Compact empty states contain no nested heavy card.
- Client identity, workflow, and urgency remain distinct.
- Document width equals viewport width at 1100 and 1440; no horizontal overflow.
- Clean browser tab produced zero console warnings/errors.

Screenshots are QA evidence only and are intentionally not tracked.
