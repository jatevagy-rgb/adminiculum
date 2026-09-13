# MAILBOX_ARCHITECTURE_AUDIT

Mission: Universal Mailbox Connection (separate feature). Base: `master` @ `972301b7`.
Rule: additive only; preserve the fixed Microsoft app-only path and all case-first behavior.

## 1. Existing communications architecture (verified)

**Canonical model — `Communication`** already carries a provider-import foundation (additive, nullable):
`type, subject, senderName/Email, recipientName/Email, content, summary, caseId, clientId, documentId, isPrimaryForCase`
plus: `externalMessageId` (global unique dedupe key), `providerConversationId`, `mailboxAddress`, `direction`, `receivedAt`, `sentAt`, `source` (MANUAL/OUTLOOK), `syncStatus`, `importedAt`, `metadata`, `recipients` (Json), `createdById`, `relatedTasks`.

**`CommunicationAttachment`** already has `providerAttachmentId` + `sizeBytes` and a unique `[communicationId, providerAttachmentId]`. Bytes are not stored (metadata-only safety boundary).

**Backend module** `Backend/src/modules/communications/`:
- `outlookImport.service.ts` (670 lines): `normalizeEmailAddress`, `normalizeOutlookMessage`, `runOutlookImportDryRun`, dedupe read-only by `externalMessageId`.
- `outlookGraphLive.ts` (222 lines): fixed app-only reader; env `COMMUNICATIONS_MAILBOX`, `OUTLOOK_GRAPH_CLIENT_ID/SECRET/TENANT_ID`; `ATTACHMENT_METADATA_EXPAND` (metadata-only).
- `outlookGraph.adapter.ts`, `clientSummary.service.ts`.
- `routes.ts` (1469 lines): case-first endpoints (`/:id/link-case`, `/:id/create-case`, `/:id/link-task`, `/:id/link-client`, tasks, attachments) + fixed Outlook endpoints (`/outlook/status`, `/outlook/import-dry-run`, `/outlook/import`, `/outlook/sync`). All `authenticate` + foundation flags.

**Frontend**: `CommunicationWorkspace.tsx` (case-first: create new case / link existing / continue in linked case; task actions secondary), `communicationIntake.ts`, case communication pages.

## 2. Classification of proposed additions

| Component | Class | Rationale |
|---|---|---|
| `Communication(type=EMAIL)` as the synced target | **REUSE** | Canonical model already supports provider email fields |
| `CommunicationAttachment` metadata + provider id | **REUSE** | Existing unique + metadata-only boundary |
| Normalization helpers (`normalizeEmailAddress`) | **REUSE** | Already present |
| Fixed app-only Outlook reader | **DO_NOT_BUILD (preserve)** | Keep untouched; not the personal mailbox path |
| `CommunicationMailboxConnection` | **NEW_REQUIRED** | No per-user mailbox connection exists |
| `EmailVerificationChallenge` | **NEW_REQUIRED** | No hashed ownership-challenge model exists |
| `secretReference` indirection | **NEW_REQUIRED** | No per-user secret store; must not store tokens in config JSON |
| `MailboxProvider` interface + MS/Google/IMAP-SMTP adapters | **NEW_REQUIRED** | One abstraction; no provider switch statements in routes |
| Sync service (bounded initial + cursor incremental) | **NEW_REQUIRED (reuse job infra)** | No mailbox sync exists |
| Threading model | **EXTEND (minimal)** | `providerConversationId` exists; add additive `Internet Message-ID`/`In-Reply-To`/`References` capture + thread key |
| HTML sanitizer | **NEW_REQUIRED** | Untrusted email HTML must not render raw |
| Second malware scanner / second workflow engine | **DO_NOT_BUILD** | Reuse existing scanner + scheduler |
| Parallel email application | **DO_NOT_BUILD** | Synced mail stays `Communication` |

## 3. Privacy boundary (hard requirement)
- A mailbox connection is **owner-only by default** (`ownerUserId`). Connecting a mailbox must not grant firm-wide read.
- A synced `Communication` retains provenance to its `mailboxConnectionId`; visibility is owner-only unless the user explicitly links it to a Case.
- Linking to a Case must **not** silently widen visibility in v1; explicit "Megosztás az ügy csapatával" is out of scope for v1 (documented).
- Enforce cross-user and cross-tenant denial in tests.

## 4. Dedupe semantics
- Legacy path dedupes by global-unique `externalMessageId` (preserve).
- User mailboxes use a **per-connection** key `[mailboxConnectionId, mailboxProviderMessageId]` to avoid global Message-ID collisions across unrelated mailboxes. Do not remove/alter the existing global unique (destructive).
- Outbound send then Sent-folder sync must reconcile to one logical Communication.

## 5. REGRESSION_INVENTORY
```
REGRESSION_INVENTORY=
 - Communication list / pagination / filtering
 - case-first create/link flow and canonical caseId/clientId projection
 - Task.sourceCommunicationId linkage
 - Dashboard + client communication summary
 - fixed Outlook app-only path (outlookGraphLive / outlookImport)
 - client/case authorization helpers
 - attachment metadata-only behavior
 - existing Communication rows (legacy validity)
POTENTIALLY_AFFECTED_WORKING_BEHAVIORS=
 - all of the above (schema additions must be nullable/additive; routes additive; no changes to existing endpoints)
MITIGATION=
 - additive nullable columns + new tables only; new routes under a new prefix; existing service functions unchanged
```

## 6. Secret storage — hard blocker
No per-user dynamic secret store was found in the repo. Provider refresh tokens and IMAP/SMTP credentials must not be stored in Prisma JSON, logs, or Git. Plan: `secretReference` + a `SecretStore` adapter.
- **Azure Key Vault is the intended production store**, but is a **CONFIGURATION_BLOCKER** (not provisioned/permitted for dynamic per-user secrets in this environment).
- Until a production-safe store exists: Microsoft/Google code may be completed, but **generic credential-based IMAP/SMTP stays feature-gated**. No hard-coded "encryption" key.

## 7. External provider configuration — blockers
```
MICROSOFT_ENTRA_APP=NOT_CONFIGURED (delegated Mail.Read/Mail.Send + offline_access)
GOOGLE_CLOUD_PROJECT=NOT_CONFIGURED (gmail.readonly is a restricted scope -> external verification)
TRANSACTIONAL_MAIL_TRANSPORT=NOT_CONFIGURED (needed for verification codes)
SECRET_STORE=NOT_CONFIGURED (Azure Key Vault)
```
Classified: `CONFIGURATION_BLOCKER` (Microsoft/transport/secret store) and `EXTERNAL_PROVIDER_APPROVAL` (Google restricted-scope verification).

## 8. Conclusion
The feature is feasible as an additive layer that REUSES `Communication` + `CommunicationAttachment` + the existing Outlook normalization, and adds a minimal connection/challenge/secret-reference layer plus one provider abstraction. It cannot be live-accepted without the external configuration in §6–§7. Implementation proceeds on `kilo/universal-mailbox`, additive only, with generic credentials gated.
