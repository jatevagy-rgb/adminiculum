# Client Color Notification Neutral Contract

Notifications currently has no authorization-scoped domain relation, therefore client color is intentionally unavailable and rendered neutrally.

## Current Contract

- `clientColorKey` is always `null`.
- No client name is inferred or exposed.
- No client query is made.
- Title, message, link, read state, and unread badge behavior remain unchanged.
- Text, link, actor, email, payload, and template data are not treated as identity relations.

## Evidence

The disposable authenticated API returned two synthetic notifications and zero non-null colors. The focused service test verifies `clientColorKey: null` and zero `Client.findMany`/`Client.findUnique` calls.

There is no dedicated frontend notification list in the current product, so closeout did not manufacture or redesign one. Neutrality is a deliberate security boundary, not unfinished colored-module work.
