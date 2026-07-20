# Client Color Next Module Rollout

The foundation source is `Client.colorKey`; downstream modules must only project and render this field through relationships.

## Recommended Next Slice

1. Communication workspace: project `communication -> case/client -> colorKey` where a real relationship exists.
2. Calendar/deadline views: inherit through a real case/client relationship only.
3. Review queues: inherit through task or document case context without changing review status semantics.
4. Notifications: show color only when a real related client is already available.

## Rules For Every Slice

- no new color column on downstream objects;
- no name hashing or local mapping;
- no second request per row;
- no client color on status, urgency, or action controls;
- neutral fallback for absent/inaccessible relationships;
- explicit DTO projection and authorization review;
- narrow tests and authenticated visual QA.

Document editor, clause library, Client Portal, Outlook/Graph, AI, and external integrations remain deferred until separate approved tickets.

## Rollout 1 Audit Result

Dashboard, communications, and review have proven relation paths and a narrow projection implementation. Notifications remain blocked: the persisted model has no domain-object/client relation, and link/text parsing is forbidden. A later notification relation ticket must precede any colored notification list.
