# Task Leadás And Review Browser Lifecycle Proof

Date: 2026-07-19
Result: partial authenticated proof; API contract blocker

## Safe Environment

- Created one uniquely named localhost PostgreSQL database from the current Prisma datamodel.
- Used only synthetic worker, reviewer, client, matter, case, task, document and time-entry records.
- Used the existing local password/JWT login path; no auth bypass or production token was used.
- No production, shared database, Azure resource or external service was contacted.
- Stopped both local servers and dropped the disposable database after QA.

## Browser-Proven Steps

1. Worker authenticated and opened `/tasks`.
2. Three synthetic tasks rendered with separate task and Leadás state columns.
3. Ordinary task drawer opened.
4. Revision 1 draft was created.
5. Summary, open points and reviewer note were explicitly saved.
6. Detailed review attention and the backend-returned eligible reviewer were selected.
7. An existing same-case document and a 45-minute existing time entry were linked.
8. Backend readiness changed from missing prerequisites to ready.
9. Submission confirmation accurately summarized task, revision, reviewer, attention, one output, 45 minutes and no external action.
10. Browser submit was blocked before route execution by CORS preflight.

## Blocked Steps

Return, revise, resubmit, approve, zero-time submit, external-action approve and external completion were not executed. Continuing through direct API calls would not prove the requested browser workflow and was intentionally avoided.

Preflight evidence: status `204`, correct local origin, but `Access-Control-Allow-Headers` omitted `Idempotency-Key` and `If-Match`.

Classification: `TASK_LEADAS_REVIEW_FRONTEND_API_CONTRACT_BLOCKER`
