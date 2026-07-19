# Task Lifecycle Browser Idempotency Proof

Date: 2026-07-19

## Browser Actions

The submit, return, approval, and external-completion confirmation actions were deliberately double-clicked during authenticated local QA. Each action produced one persisted business result.

## Persisted Results

| Flow | Revisions | Decisions | External completions | Result |
| --- | ---: | ---: | ---: | --- |
| Ordinary return/resubmit/approve | 2 | 2 | 0 | Task closed once |
| Explicit zero time | 1 | 1 | 0 | Task closed once |
| External action | 1 | 1 | 1 | External completion and closure recorded once |

Timeline and notification counts were consistent with the intended transitions; no duplicate revision, decision, external-completion event, or task-completed event appeared.

## Client Contract Proof

- One mutation attempt keeps one stable `Idempotency-Key` until completion.
- A deliberate later mutation receives a new key.
- Return and approval send quoted `If-Match` plus the stable idempotency key.
- Stale-version and uncertain-outcome branches force a bounded reread rather than presenting raw API text.

The stable-key, new-key, stale-version, and uncertain-outcome behavior is covered by the focused frontend tests. Browser QA directly proved double-click safety and persisted deduplication; it did not intentionally sever the network after a committed mutation.

Classification: `TASK_LIFECYCLE_BROWSER_CLOSEOUT_READY_FOR_RELEASE_INTEGRATION`
