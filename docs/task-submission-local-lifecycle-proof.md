# Task Submission Local Lifecycle Proof

Date: 2026-07-18
Status: completed and cleaned up

## Safety Boundary

- Host: `localhost`.
- Successful disposable database: `adminiculum_task_submission_backend_20260718_05`.
- Credential source: existing local environment file, consumed without printing.
- Synthetic data only.
- Production/Azure/shared databases: not accessed.
- Database deleted after proof.

## Applied Schema

The proof generated a temporary schema-equivalent baseline from pre-candidate commit `d81a476`, then applied the unchanged inherited migration `20260718120000_add_task_submission_workflow`. Prisma reported both temporary-chain migrations applied and schema up to date.

## Exercised Lifecycle

1. unrelated-user hidden read;
2. concurrent draft create;
3. returned-revision successor allocation;
4. reviewer listing and self-review rejection;
5. summary/attention update;
6. same-case primary output attach and duplicate retry;
7. cross-case document rejection;
8. same-matter owned time attach and task attribution;
9. cross-matter time rejection;
10. readiness validation;
11. submit with idempotency key;
12. non-assignee submit denial;
13. unrelated-actor idempotency replay denial;
14. identical assignee submit retry;
15. queue/task-state/audit/notification verification;
16. submitted immutability verification;
17. separate zero-time submit;
18. forced transaction rollback;
19. safe DTO/audit content scan;
20. legacy handoff preservation.

## Results

- Service integration tests: 13/13 passed.
- Duplicate active drafts: 0.
- Duplicate submit audit rows: 0.
- Duplicate submit notifications: 0.
- Duplicate queue records: 0.
- DB-to-schema diff: empty.
- Cleanup: successful.
