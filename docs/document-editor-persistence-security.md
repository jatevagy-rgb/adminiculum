# Document Editor Persistence Security

## Current posture

Mode C remains export-only. The new metadata endpoint authenticates first, authorizes by owning case, returns scalar DTO fields, and excludes storage paths, SharePoint identifiers, `workspaceText`, raw content, raw Prisma rows, and broad includes.

## Forbidden storage targets

Editor content must not be stored in `documents.workspaceText`, `Document.description`, `Case.description`, `Task.description`, `Comment.content`, `ContractGeneration.templateData`, `ContractTemplate.variables`, `SystemSetting.value`, timeline metadata, notification payloads, audit payloads, or browser storage.

## AI and n8n boundary

No AI or n8n integration was added. Future persistence cannot delegate content state, audit state, or version ownership to n8n.

## Logging

Future content routes must never log request bodies, editor JSON, rejected content, comments, storage responses, or raw adapter exceptions.
