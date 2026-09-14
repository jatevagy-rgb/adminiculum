# Universal mailbox frontend handoff

Backend-only PR #219 adds owner-scoped `/api/v1/mailboxes` contracts. The later
Communications Workspace integration must preserve the existing case-first flow
and use the canonical Communication list rather than create an inbox model.

Required later surfaces: **Email-fiókok**, **+ Email-fiók csatlakoztatása**,
verification, provider authorization, truthful connection status, Inbox, Sent,
All communications, Reply, Reply all, Forward, Sync, and Disconnect.

Connections are owner-only; case membership does not grant mailbox access.
Statuses are `EMAIL_UNVERIFIED`, `AUTHORIZATION_REQUIRED`, `CONNECTED`,
`CONNECTED_READ_ONLY`, `SYNCING`, `PAUSED`, `REVOKED`, and `ERROR`. Do not expose
secret references, provider errors, verification codes, credentials, or raw HTML.

## Routes

- `GET /api/v1/mailboxes` — owner-scoped connection list.
- `GET /api/v1/mailboxes/:id` — owner-scoped connection detail.
- `POST /api/v1/mailboxes/verification/start` — accepts `email` and `provider`.
- `POST /api/v1/mailboxes/verification/confirm` — confirms the verification code.
- `POST /api/v1/mailboxes/:id/authorize/microsoft/start` — starts delegated Graph OAuth.
- `POST /api/v1/mailboxes/:id/authorize/google/start` — starts delegated Gmail OAuth.
- `GET|POST /api/v1/mailboxes/oauth/microsoft/callback` — completes Microsoft OAuth.
- `GET|POST /api/v1/mailboxes/oauth/google/callback` — completes Google OAuth.
- `POST /api/v1/mailboxes/:id/sync` — performs a bounded provider sync.
- `POST /api/v1/mailboxes/:id/send` — sends and persists a canonical outbound Communication.
- `POST /api/v1/mailboxes/:id/disconnect` — revokes the connection and removes provider access.

Verification requires `email` and provider (`MICROSOFT_GRAPH`, `GOOGLE_GMAIL`, or
`IMAP_SMTP`); verification alone never indicates a connected mailbox. Generic
IMAP/SMTP remains feature-gated until a production SecretStore and connectivity
implementation are enabled.

## Safe DTO contract

Connection responses may expose only `id`, `mailboxAddress`, `provider`, `status`,
`readCapability`, `sendCapability`, `lastSyncedAt`, and safe sync status fields.
They never expose `secretReference`, tokens, credentials, verification codes, raw
provider payloads, raw provider errors, or unsanitized HTML. Sent messages are
returned as canonical Communication data; provider-specific credentials remain
server-side.

## CASE_LINK_VISIBILITY_RULE

Linking a mailbox-synced Communication to a Case is an explicit classification and
sharing action. After linking, the Communication follows the existing canonical
Case/Communication authorization. Case access does not expose the mailbox
connection, credentials, provider account data, or other unlinked messages.

## UNASSIGNED_OWNER_PRIVACY_RULE

An unassigned mailbox-synced Communication remains private to its creator/owner
(subject to the existing privileged-role rules). Case membership alone never
grants access to an unassigned message or to its mailbox connection.

## CONTEXT_READINESS_FIELDS

Canonical email records preserve, when supplied by the provider: subject, full safe
plain-text body in `Communication.content`, sanitized HTML, body preview, sender,
TO, CC, BCC, mailbox address, direction, sent/received timestamps, provider
message ID, Internet Message-ID, provider conversation ID, `In-Reply-To`,
`References`, mailbox connection provenance, attachment metadata, and import/sync
status. The body preview is not the source of truth; no `.txt` Document is created
per email.

Microsoft Graph and Gmail remain configuration-dependent delegated integrations.
Google restricted-scope verification and production SecretStore provisioning are
external readiness requirements. `IMAP_SMTP` is intentionally not represented as
production-ready.
