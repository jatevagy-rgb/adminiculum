# 04 — Outlook / Communication Archaeology

> Deep reconstruction of every Outlook / Microsoft Graph / communication implementation. Evidence: `git log --all`, `git show 50945ecd:<path>`, `git branch -r`. Confidence `PROVEN`/`STRONGLY_INDICATED`/`UNPROVEN`.

## Anchoring facts

| Item | Value | Confidence |
|---|---|---|
| Canonical | `50945ecd309c4c609fc48d07218fe42917ab8e82` (2026-08-28, "Merge pull request #89…") — on `release/editor-ops-workflow-1`; `origin/main` is stale at `1b2f879` (2026-03-11) | PROVEN |
| Current worktree | `peterfi/client-communication-summary-read-model` @ `b36113a` — **not** canonical (4 comms commits ahead) | PROVEN |

## Critical correction (important for the audit premise)

- `clientSummary.service.ts` (`MR-043` client-wide read model) does **NOT** exist at canonical `50945ecd`. It was added on the `peterfi/client-communication-summary-read-model` branch (`1c301b0`→`b36113a`). It is **branch-only / not yet merged**.
- The stale comment in `communications/routes.ts` ("no Graph connection or mailbox access exists yet") belongs to the initial dry-run-only phase and is **contradicted** by the real `/outlook/sync` implementation in the same file.

## Does production Outlook actually contact Graph?

**YES — on the `POST /communications/outlook/sync` path, when enabled (PROVEN).** In `outlookImport.service.ts::syncOutlookMailbox`:
```
messages = await reader.fetchRecentInbound(parseOutlookSyncLimit(undefined))
```
`createOutlookGraphMailReader().fetchRecentInbound` (`outlookGraphLive.ts`) performs:
- **Auth (app-only client-credentials, no user/refresh token):** `POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with `client_id`, `client_secret`, `scope=https://graph.microsoft.com/.default`, `grant_type=client_credentials`.
- **Read:** `GET https://graph.microsoft.com/v1.0/users/{mailboxAddress}/messages?$select=...&$top={50-200}&$expand=attachments($select=id,name,contentType,size)`.
- Then `mapGraphMessagesToOutlookImportPayload` → `importOutlookMessages` (real Prisma `$transaction` writes) → `applySafeConversationLinkage`.

Gated by `ENABLE_OUTLOOK_IMPORT === 'true'` (default OFF) **and** `COMMUNICATIONS_MAILBOX`, `OUTLOOK_GRAPH_CLIENT_ID`, `OUTLOOK_GRAPH_CLIENT_SECRET`, `OUTLOOK_GRAPH_TENANT_ID` (else 501).

**The two normalize-only endpoints never contact Graph:**
- `POST /outlook/import-dry-run` → `runOutlookImportDryRun` (pure normalization + read-only dedupe).
- `POST /outlook/import` → `importOutlookMessages` (persist provider-shaped payload, dedupe `externalMessageId`, **no Graph call**).

## Per-element reconstruction (canonical `50945ecd`)

| Element | What existed | Classification |
|---|---|---|
| Persistence | `Communication` + `CommunicationAttachment` + enums `CommunicationType/CommunicationDirection/CommunicationSource{MANUAL,OUTLOOK}/CommunicationSyncStatus{IMPORTED,PENDING,FAILED}`; provider columns `externalMessageId(unique), providerConversationId, mailboxAddress, direction, receivedAt, sentAt, source, syncStatus, importedAt, metadata(Json), recipients(Json)` | **REAL_FOUNDATION** |
| Thread model | only `providerConversationId` (Graph conversationId) — "provider-derived, not a persisted thread model"; `applySafeConversationLinkage` | **REAL_FOUNDATION** (no persisted thread) |
| Unread/read | **none** for communications; frontend honest empty states ("Státusz: nincs perzisztált adat", "válaszállapot csak későbbi modellből") | **NEVER_REAL / HONEST_EMPTY_STATE** |
| Attachments | metadata-only by design (`ATTACHMENT_METADATA_FIELDS=['id','name','contentType','size']`, `397b770`); no binaries/MIME | **REAL_FOUNDATION** |
| Case linking | `POST /:id/link-case`, `POST /:id/create-case` (atomic `$transaction`, `ab5b96d`), `/:id/extract-task`, `/:id/extract-deadline`, `/:id/link-task`, `/:id/add-attachment` | **REAL_FOUNDATION** |
| Client linking | `POST /:id/link-client` (+ `linkCommunicationToClient`); `CLIENT_CASE_MISMATCH` guard. Phase-5 client-wide summary is **branch-only** | **REAL_FOUNDATION** (canonical) |
| Incoming | real Graph inbound read; `direction` derived from sender==mailbox | **REAL_FOUNDATION** |
| Outgoing | **no outbound mail send API** (no Graph sendMail/draft); `OUTBOUND` only a derived flag | **UNPROVEN / NEVER_REAL** |
| UI | `app/communications/page.tsx`→`CommunicationsOverview.tsx` (`b88fb84`): real "Outlook kommunikáció frissítése" sync button + triage/assign/ignore; `app/notifications/page.tsx`→`CommunicationWorkspace` (filters/detail/create-case/tasks, no sync button) | **REAL_FOUNDATION** |
| Tests | `outlookGraphLive.test.ts`, `outlookSync.service.test.ts`, `outlookImport.route.test.ts`, `outlookImportDryRun.route.test.ts`, `outlookGraph.adapter.test.ts`, `Frontend/tests/communicationsOverview.test.ts` — all Graph contact via fakes; **no live/E2E Graph integration test** | **REAL_FOUNDATION** (no live proof) |

## Delta sync / subscriptions / webhooks / refresh tokens

**NONE FOUND** (PROVEN). No `/subscriptions`, no webhook/change-notification registration, no `$delta`/`$filter`, no delta token, no refresh-token flow (app-only client-credentials; tokens fetched fresh, never stored/refreshed). Only a bounded recent-window `$top=N` poll.

## Branch lineage of "the Outlook stack"

- **Lineage A (incremental, `codex/ops-pages-ux-cleanup-1`)** — `03d0854`, `ccf992d`, `59269eb`, `d950e87`, `2cf1594`, `1499ad7` (172 ahead, not ancestors). Added provider fields → dry-run → mock import → service extract → Graph adapter skeleton.
- **Lineage B (canonical)** — `27ab674` (reconstructed baseline: `outlookImport.service.ts`), `b88fb84` (2026-08-20: the **live Graph reader + frontend sync UI** — most load-bearing), `06ed825`, `397b770` (attachment metadata-only constraint), `ab5b96d` (create-case atomic), `9248e64`.

### Branch classification of historical elements

| Element | SHA (introduced) | Merged to canonical? | Classification |
|---|---|---|---|
| Communication provider fields + enums | `03d0854` (codex) | yes (via `27ab674`+`b88fb84`) | REAL_FOUNDATION (in canonical) |
| Dry-run endpoint | `ccf992d` | yes | STILL_EXISTS |
| Mock import endpoint | `59269eb` | yes | STILL_EXISTS (normalize-only) |
| Import service extract | `d950e87` | yes | STILL_EXISTS |
| Graph adapter skeleton | `2cf1594` | yes | STILL_EXISTS |
| **Live Graph reader + sync + triage UI** | **`b88fb84`** | **ancestor** | **REAL_FOUNDATION (STILL_EXISTS)** |
| Hardened boundaries | `06ed825` | ancestor | STILL_EXISTS |
| Attachment metadata-only | `397b770` | ancestor | STILL_EXISTS |
| Create-case atomic | `ab5b96d` | ancestor | STILL_EXISTS |
| Frontend comm intake | `9248e64` | ancestor | STILL_EXISTS / SUPERSEDED (by `b88fb84`) |
| **Client-wide summary read model (Phase 5)** | `1c301b0`→`b36113a` | NO (ahead) | **BRANCH_ONLY / DRAFT_ONLY** |
| Workspace canonical composition | `a2b5b78` | NO | BRANCH_ONLY |
| Incoming workspace wave1 | `1570495`,`874933a` (devin) | NO | BRANCH_ONLY |
| Case-first / case-overview / client-overview snapshots | `peterfi/*` | NO | BRANCH_ONLY |
| Outlook attachment metadata security fix | `claude/outlook-attachment-metadata-security-fix` | YES (0 ahead) | STILL_EXISTS |
| Communications live integration | `opencode/communications-live-integration` | YES (0 ahead) | STILL_EXISTS |

## Bottom-line verdict

- **Production Outlook IS genuinely connected end-to-end** on the sync path (real app-only Graph auth + inbound read + persist + safe thread→case linkage), gated OFF-by-default. This is **REAL_FOUNDATION**, not a facade.
- **It is NOT a complete mail system**: inbound-only (no send/drafts); bounded poll (no delta/subscription/webhook); no unread/read/reply state (honestly shown as empty states); no conversation entity (thread = provider `conversationId` + linkage inference); app-only auth (no user OAuth/MSAL in the sync path); feature-gated OFF → every Outlook endpoint (incl. the UI button) returns 501 unless enabled.
- **The dry-run + `/outlook/import` endpoints normalize only** — they never open a Graph connection.
- **No in-repo live/E2E Graph test exists** — all Graph contact is via fakes.

## Best recoverable path (Outlook → …)

```
OUTLOOK (MS Graph, app-only)
  → MAILBOX SYNC (fetchRecentInbound, gated)           [REAL_FOUNDATION]
  → COMMUNICATION (Communication, metadata-only)        [REAL_FOUNDATION]
  → CLIENT (link-client; client-wide read model = branch) [canonical link; summary branch]
  → CASE (link-case / create-case atomic)                [REAL_FOUNDATION]
  → ATTACHMENT (CommunicationAttachment metadata)        [REAL_FOUNDATION]
  → DOCUMENT (documentId link; no direct attach→document) [MISSING]
  → TASK (extract-task)                                  [REAL_FOUNDATION]
  → NEW CASE (create-case)                               [REAL_FOUNDATION]
  → DASHBOARD ATTENTION (attentionCategory, notifications) [PARTIAL — global attention not fully wired]
```

**What must still be built:** outgoing mail (send/draft), true thread/unread/reply persistence (schema needed → `THREAD_PERSISTENCE_FOLLOWUP=YES`, **out of scope here**), delta/subscription sync, document-attachment→document conversion, and wiring the client-wide read model (branch) into canonical.
