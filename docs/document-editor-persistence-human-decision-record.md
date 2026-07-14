# Document Editor Persistence Human Decision Record

## Decision recorded

DOCUMENT-EDITOR-PERSISTENCE-VERSIONING-READINESS-1 completed with **Mode C preserved**.

## What this does not approve

No schema change, migration, manual DB query, deployment, Client Portal change, AI API, n8n, workspaceText storage, unrelated-field storage, fake autosave, fake versions, or silent stale overwrite was approved.

## Open human decisions

- Dedicated DB model versus backend-controlled file storage.
- Storage provider and folder/key layout.
- Content version identity and stale-write token.
- Retention, archive, deletion, restore and backup policy.
- Document-level comment model and version anchoring.
- Audit event shape and redaction.
- Feature flag name/default and production rollout sequence.

## Required next approval

A future implementation prompt must explicitly approve either a schema-backed persistence model or a proven file-backed storage strategy with clone/staging proof before any save route is added.
