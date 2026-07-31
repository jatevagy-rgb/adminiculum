# Client Portal V0.2 Product Contract

## Release intent

Client Portal V0.2 extends the read-only portal baseline into a gated interaction foundation. The portal must remain client-safe by default: customers only see explicitly published matter status, documents, updates, action requests and interaction records for cases where an active portal identity grant exists.

## User surfaces

- Customer portal home and matter pages show active matters, current status, waiting state, next step, responsible contact label, public deadlines, published documents, public updates, action requests, request responses and question threads.
- Customer request response supports structured answers, PDF/JPEG/PNG upload, optional customer note, submission state display and client-safe error messaging.
- Customer questions support creating a bounded question thread and listing visible thread status.
- Internal portal admin supports membership review, inline canonical client creation, identity grants and operational queue summaries for requests, questions, submissions and notification failures.

## Security and rollout gates

- `CLIENT_PORTAL_READ_ENABLED` gates the read-only portal.
- `CLIENT_PORTAL_ACTIONS_ENABLED` gates legacy/publication action links.
- Client interaction capabilities remain individually gated by `CLIENT_PORTAL_QUESTIONS_ENABLED`, `CLIENT_PORTAL_DOCUMENT_REQUESTS_ENABLED`, `CLIENT_PORTAL_DATA_FORMS_ENABLED`, `CLIENT_PORTAL_DOCUMENT_UPLOADS_ENABLED`, `CLIENT_PORTAL_EMAIL_NOTIFICATIONS_ENABLED` and `CLIENT_PORTAL_SUBMISSION_REVIEW_ENABLED`.
- Customer APIs must use the customer auth context; workforce APIs must use the workforce auth context.
- Uploaded files must remain quarantined until server-side validation and scan outcome allow internal acceptance into matter documents.
- Mail notification delivery and real malware scanning are provider integrations; production completion requires configured providers and acceptance evidence.

## Explicit non-goals

- No Outlook inbox integration.
- No external workflow application redesign.
- No AI legal approval.
- No customer legal acceptance workflow.
- No replacement of the internal contract/document workspace.
- No production migration or deploy without green feature validation and release reconciliation.

## Production acceptance standard

Production complete requires green CI, migration replay, real PostgreSQL integration tests, release merge validation, production deployment, authenticated API acceptance, browser/responsive acceptance, read-only production database verification and screenshots. If provider-independent acceptance passes but scanner/mail providers are absent, the honest classification is blocked on those provider dependencies rather than production-complete.
