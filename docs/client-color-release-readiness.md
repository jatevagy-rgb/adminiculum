# Client Color Release Readiness

## Ready Components

- Dashboard projection
- Communication list and selected detail projection
- Review queue and review detail projection
- shared, decorative, neutral-safe frontend accent
- batch/select performance shape

## Blocking Component

Notifications cannot carry client color safely: the current model has no explicit domain-object relation and the frontend has no dedicated notification list. Parsing link/title/message would violate the identity and authorization contract.

## Decision

Do not integrate this rollout as complete. Either add an approved, additive notification relation in a separate schema ticket with authorization tests, or explicitly remove Notifications from this rollout's acceptance criteria.
