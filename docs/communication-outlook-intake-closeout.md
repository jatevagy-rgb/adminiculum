# Communication / Outlook Intake Closeout

Status: phase closeout. This note documents the deployed Communication → Matter Intake and Outlook import foundation before starting the Client Portal block. It does not authorize a deploy, migration, Azure configuration change, Graph connection, mailbox read, or feature-flag enablement.

## Current deployed capabilities

- `ENABLE_COMMUNICATIONS_PERSISTENCE=true` in production.
- `/notifications` is the active Communication Workspace for intake triage.
- Communication rows can be assigned to an existing case where real linked context exists.
- A new case can be created from a communication through the atomic backend create-case endpoint.
- A task can be extracted from a linked communication.
- Case detail links to the case-side communication workspace at `/cases/{caseId}/communications`.
- The authenticated read-only communications list contract remains available for workspace display.

## Outlook import foundation

- Outlook provider schema fields are present in production for provider-shaped communication records, including external message IDs, provider conversation IDs, mailbox address, sync status, direction, received/sent/import timestamps, recipients, metadata, and attachment metadata.
- The production Outlook provider migration has been applied and verified.
- The dry-run endpoint is deployed and gated:
  - `POST /api/v1/communications/outlook/import-dry-run`
  - normalizes provider-shaped messages;
  - performs read-only duplicate detection by `externalMessageId`;
  - does not write communications or attachments.
- The mock write import endpoint is deployed and gated:
  - `POST /api/v1/communications/outlook/import`
  - writes only provider-shaped payloads when enabled;
  - stores attachment metadata only;
  - does not infer case/client/task/document relationships.
- `Backend/src/modules/communications/outlookImport.service.ts` contains the extracted normalization, dry-run, and write-import service logic.
- `Backend/src/modules/communications/outlookGraph.adapter.ts` exists in commit `2cf1594` as a pure Graph-message-to-provider-payload mapper, but it is not deployed yet.

## Feature flags

- `ENABLE_COMMUNICATIONS_PERSISTENCE=true`
- `ENABLE_OUTLOOK_IMPORT=off` / absent in production
- `ENABLE_CLIENT_PORTAL_PUBLIC=false` / client portal remains disabled

## Not implemented yet

- No live Microsoft Graph connector.
- No mailbox read from `hubay.mate@balintfy.hu`.
- No automatic polling.
- No webhook or delta sync.
- No attachment binary download.
- No AI classification.
- No Outlook calendar sync.
- No client portal exposure for communications.

## Safety and rollback

- Communication persistence can be rolled back operationally by disabling `ENABLE_COMMUNICATIONS_PERSISTENCE`, which keeps mutating/detail communication operations behind the existing gate.
- Outlook import remains safely off because `ENABLE_OUTLOOK_IMPORT` is absent/off.
- With the Outlook gate off, authenticated dry-run/import calls return `501 FEATURE_NOT_AVAILABLE`, feature `OUTLOOK_IMPORT`, reason `OUTLOOK_IMPORT_NOT_ENABLED`.
- The dry-run endpoint remains read-only even when the Outlook gate is later enabled.
- No Microsoft Graph secrets, refresh tokens, mailbox credentials, or provider tokens are stored in the repo.
- Client portal spoofed summary/export routes must remain `501 FEATURE_NOT_AVAILABLE`, reason `CLIENT_PORTAL_NOT_ENABLED`.

## Recommended next steps

### If continuing Outlook

1. Deploy the Graph adapter skeleton if production availability is useful.
2. Design the Azure delegated Graph permission path around least privilege, starting with `Mail.Read`.
3. Design backend OBO/token handling separately from the existing Adminiculum API access token.
4. Add a manual Graph dry-run endpoint that fetches only from the approved dedicated folder, such as `Adminiculum Import`.
5. Add a manual Graph import endpoint only after dry-run proof is stable.
6. Keep polling, webhooks, delta sync, attachment binary download, and classification out of scope until the manual path is proven.

### If moving to Client Portal

1. Keep `ENABLE_CLIENT_PORTAL_PUBLIC=false`.
2. Start with a read-only client portal contract and security audit.
3. Preserve the current `CLIENT_PORTAL_NOT_ENABLED` guard until authentication, authorization, route scope, and data exposure rules are explicitly approved.

## Recorded classifications

- `communication_intake_backend_frontend_deployed_smoke_passed`
- `communications_persistence_gate_enabled_auth_limited_smoke_passed`
- `outlook_communication_provider_schema_production_applied_verified_no_runtime_change`
- `outlook_import_dry_run_backend_deployed_gate_off_smoke_passed`
- `outlook_mock_import_backend_deployed_gate_off_smoke_passed`
- `outlook_import_service_backend_deployed_gate_off_smoke_passed`
- `outlook_graph_adapter_skeleton_backend_only_not_deployed`

## Closeout classification

```text
communication_outlook_intake_closeout_documented_no_runtime_change
```
