# Document Editor Version and Concurrency Contract

## Current state

No real editor-content versions exist. The metadata endpoint returns Mode C with `versionToken: null` and all save/version/restore capabilities false.

## Required future token

A future save must require `expectedVersionToken` backed by a real storage ETag, checksum, stable version id, or equivalent durable identity. Metadata-only `Document.version` must not be used as a fake content token.

## Save rule

No silent overwrite. A stale token must return `409 EDITOR_VERSION_CONFLICT` and preserve the user local content.

## Version rule

A listed editor version must correspond to genuine saved `TIPTAP_JSON` content. Do not create `DocumentVersion` rows that point to no actual content.

## Restore rule

Restore is allowed only if storage can open the selected version and create a new current version without destroying history. Otherwise `canRestoreVersion` remains false.
