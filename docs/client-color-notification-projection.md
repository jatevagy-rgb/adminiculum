# Client Color Notification Projection

## Finding

`Notification` stores `userId`, type, title, message, link, read state, and timestamp. It has no persisted task, case, document, communication, submission, or client relation.

## Safe Behavior

The DTO returns `clientColorKey: null`. No client lookup is performed. Route-looking links, titles, messages, and templates are not parsed to infer identity.

## Blocker

Colored notification rows require a separate additive relation design plus authorization review. No schema change is permitted in this slice, and there is currently no dedicated frontend notification list beyond unread counters.
