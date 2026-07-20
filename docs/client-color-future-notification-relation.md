# Future Notification Client Relation

## Deferred Option

A future notification color feature may be considered only after introducing an explicit typed domain relation, such as a task, case, document, or communication reference whose authorization scope is evaluated before projection.

## Required Separate Work

1. Product decision for supported relation types.
2. Additive nullable schema design and migration review.
3. Authorization-scoped read projection.
4. Backfill policy that makes no text-based assumptions.
5. Wrong-user and cross-client isolation tests.
6. Neutral fallback for old or unrelated notifications.

## Prohibitions

Do not infer client identity from notification title, body, link, actor, email, payload, or template data. Do not expose hidden client identity through notifications. This future work is not part of the current rollout.
