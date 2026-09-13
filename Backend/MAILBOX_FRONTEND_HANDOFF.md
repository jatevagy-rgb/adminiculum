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

Core routes: list/get, verification start/confirm, provider authorization start
and callback, sync, send, disconnect. Verification requires `email` and provider
(`MICROSOFT_GRAPH`, `GOOGLE_GMAIL`, or `IMAP_SMTP`); verification alone never
indicates a connected mailbox. Generic IMAP/SMTP remains feature-gated until a
production SecretStore and connectivity implementation are enabled.
