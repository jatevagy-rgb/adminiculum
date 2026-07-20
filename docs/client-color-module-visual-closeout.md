# Client Color Module Visual Closeout

## Decision

The client-color rollout is visually accepted for Dashboard, Communications, and Review. Notifications is accepted as intentionally neutral under the current relationless model.

## Browser Summary

- Dashboard: mixed RED/BLUE/GREEN/neutral operational rows; RED to PURPLE refresh; cleared neutral fallback; compact layout preserved.
- Communications: assigned RED/BLUE rows, an unassigned neutral row, selected detail consistency, and Alpha to Beta reassignment refresh.
- Review: QUICK_SCAN, APPROVAL, DETAILED_REVIEW, legacy relation-backed row, neutral row, selected detail, and BLUE to PURPLE refresh.
- Notifications: API DTOs remain `clientColorKey: null`; no client label or lookup is invented.

## Closeout Fixes

1. Case reassignment now persists the case's actual `clientId`, preventing stale communication color.
2. Review detail reads use `cache: "no-store"`, preventing a stale color after an authorized client color change.

No palette, lifecycle, review-decision, schema, migration, notification model, authorization, or deferred-module behavior changed.
