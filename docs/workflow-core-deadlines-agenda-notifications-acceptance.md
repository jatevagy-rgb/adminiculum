# Workflow Core Deadlines Agenda Notifications Acceptance

## Backend

- [ ] `GET /api/v1/agenda` requires authentication.
- [ ] `scope=MY_WORK` returns only assigned task due dates.
- [ ] `scope=MY_CASES` returns task due dates and case deadlines for accessible cases.
- [ ] `scope=CASE&caseId=...` verifies case access.
- [ ] `scope=TEAM` returns `TEAM_SCOPE_NOT_AVAILABLE`.
- [ ] invalid date ranges return `400`.
- [ ] all agenda item urgency values come from the backend deadline engine.
- [ ] no raw Prisma rows or relation `include` are returned.
- [ ] `POST /api/v1/tasks/:id/reschedule` accepts only `dueAt`.
- [ ] reschedule writes a content-minimal `DEADLINE_SET` timeline event.
- [ ] notifications list/mark-read use explicit DTOs and remain idempotent.

## Frontend

- [ ] `/deadlines` loads agenda groups and shows honest empty/error states.
- [ ] Dashboard agenda rail uses `GET /api/v1/agenda`, not local date bucketing.
- [ ] Case Detail shows next/overdue/upcoming case agenda information from the same contract.
- [ ] Completion/reschedule controls render only when backend capabilities allow them.
- [ ] Copy states that hearings/reminders/external calendar/AI recognition are not present.

## Safety

- [ ] no schema or migration files changed;
- [ ] no DB command/manual SQL executed;
- [ ] no Client Portal route or frontend changed;
- [ ] no Outlook/Graph/provider sync enabled;
- [ ] no n8n direct DB integration added;
- [ ] no fake AI, fake notifications, or fake deadline/legal significance claims.
