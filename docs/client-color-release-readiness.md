# Client Color Release Readiness

## Ready

- Dashboard relationship-backed accents and neutral fallback.
- Communication list/detail accents from persisted `clientId`.
- Communication reassignment updates both persisted case and client relations.
- Review queue/detail accents from task/case/client relations.
- One shared decorative `ClientAccent` and unchanged palette keys.
- Status, urgency, attention, selection, and read state remain independent.
- Notifications remain explicitly neutral without inference or client lookup.

## Release Decision

Neutral Notifications is not a release blocker. Notifications currently has no authorization-scoped domain relation, therefore client color is intentionally unavailable and rendered neutrally.

The future notification relation is deferred. It requires a typed domain relation, authorization-scoped projection, migration review, and tests; text inference is prohibited.

The complete client-color and Dashboard correction chain is now integrated into the official release branch. The final release recommendation is recorded in `client-color-dashboard-release-go-no-go.md`; production execution remains a separate approval.

## Gates

Browser, screenshot, console, network, accessibility, focused performance, backend, frontend, and protected-scope checks passed on disposable local data. Release integration is ready; production deployment remains a separate approved operation.
