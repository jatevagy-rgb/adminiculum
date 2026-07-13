# Workflow Core Deadlines Agenda Notifications 1

## Summary

This pass adds an internal lawyer agenda built on existing task due dates and case deadlines. The agenda is backend-owned, route-safe, and intentionally narrower than a calendar system.

## Implemented

- `GET /api/v1/agenda` for authenticated internal agenda lists.
- `GET /api/v1/cases/:caseId/deadlines` as a case-scoped compatibility view.
- `POST /api/v1/tasks/:id/reschedule` for explicit task due-date changes.
- Shared deadline urgency/status/capability engine.
- `/deadlines` frontend page now reads the backend agenda contract.
- Dashboard agenda rail reads the backend agenda instead of local task bucketing.
- Case Detail shows a case agenda strip using the same backend contract.
- Notification service uses explicit DTO mapping and idempotent mark-read behavior.

## Not Implemented

- hearings/court events;
- reminders/recurrence;
- team-wide agenda scope;
- external calendar, Outlook, Teams, email, or n8n delivery;
- AI date extraction;
- legal significance inference;
- Client Portal deadline publication.

## Privacy Posture

The agenda exposes safe operational metadata only: ids, title, compact task description, date, status, urgency, source link, responsible users, and capabilities. It does not expose raw documents, raw communication bodies, workspace text, AI prompts/outputs, or timeline payloads.

## Runtime Posture

No schema or migration change. No Azure/deploy/config/package change. The feature is internal backend/frontend workflow behavior only.
