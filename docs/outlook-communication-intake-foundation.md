# Outlook communication intake — foundation & phasing (OI1)

> Status: **OI1A foundation only.** No live Outlook/Microsoft Graph connection exists.
> The dashboard communication modules render from existing app data (the communications
> console) plus honest foundation/empty states. Nothing here reads real mailboxes,
> requests Graph permissions, or stores email content.

## Product intent

Make the internal dashboard operationally useful by separating internal vs external
communication, allowing watched/pinned clients, and preparing future Outlook/Graph
email intake. Incoming/outgoing email will eventually be shown and sorted by: sender,
recipient, internal/external, client, case/matter, thread/conversation, urgency,
reply-needed, attachment/document signal, and deadline/date signal.

## Intended flow (future)

1. Microsoft Graph receives or exposes a new message.
2. Adminiculum stores or displays a minimal communication **signal** (not raw body).
3. Sender/domain matching **proposes** a client.
4. Subject/thread/entity matching **proposes** a case.
5. The lawyer **approves, corrects, or ignores** the classification.
6. Only **approved** communication becomes part of a case timeline/workflow.
7. The dashboard shows only safe summary signals — never sensitive raw email body by default.

No automatic legal conclusion. No automatic client-facing disclosure. No "AI classified
this perfectly" language. No public client access. No client portal enablement.

## Phases

### Phase OI1A — current foundation (this pass)
- Frontend types: `Frontend/src/lib/communicationIntake.ts`
  (`CommunicationSignal`, audience/direction/source/status enums, `ClientMatchSuggestion`).
- Pure matching helpers: `normalizeEmail`, `extractEmailDomain`, `isInternalDomain`,
  `matchSenderToClient` (exact / domain / weak / none), `classifyAudience`,
  `toCommunicationSignal`. No external calls.
- Dashboard modules: `Kommunikációs figyelő` (Külső/Belső), `Figyelt ügyfelek`
  (foundation examples, not persisted), `Válaszra vár` (foundation state).
- No real Outlook connection; no backend/schema/Graph changes.

### Phase OI1B — Graph readiness audit
- Entra app registration review.
- Required Graph permissions (e.g. `Mail.Read` scope decisions).
- Mailbox scope (which mailboxes / shared vs user).
- Delegated vs application permissions decision.
- Admin consent plan.
- Data protection / privacy review (what is stored, retention, redaction).

### Phase OI1C — backend inbox foundation
- Communication records (persistence).
- Sender → client mapping table.
- Case suggestion table.
- Manual confirmation workflow.
- **No automatic case attachment.**

### Phase OI1D — Graph sync
- Microsoft Graph delta query or webhook subscription.
- Subscription lifecycle handling (create/renew/expire).
- Idempotency.
- Retry / dedupe.
- Privacy logging.
- Feature flag gating.

### Phase OI1E — dashboard live activation
- Real communication feed.
- Pinned clients (persisted, user-editable).
- Reply-needed classification.
- User-editable dashboard modules.

## Guardrails (apply to every phase until explicitly lifted)
- No raw email body on the dashboard by default — summary signals only.
- Classification is always a suggestion a human confirms.
- No client portal / email-code / public access enablement.
- No fake live email data or "connected to Outlook" claims while gated.
