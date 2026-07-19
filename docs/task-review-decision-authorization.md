# Task Review Decision Authorization

Date: 2026-07-18

## Actors

| Actor | Read detail | Return/approve | Revise | External completion |
|---|---:|---:|---:|---:|
| Original submitter/current worker | Yes | No | Returned latest revision only | No |
| Assigned internal reviewer | Yes | Yes, unless self-review | No | Only when also task/case-scoped supervisor |
| Task assigner | Yes | Yes with reviewer-capable role | No | Yes with reviewer-capable role |
| Case responsible lawyer/creator | Yes | Yes with reviewer-capable role | No | Yes with reviewer-capable role |
| Case collaborator | Yes | Yes with reviewer-capable role | No | Yes with reviewer-capable role |
| Global Admin/Partner without task/case scope | Hidden | No | No | No |
| Unrelated authenticated actor | Hidden | No | No | No |
| `CLIENT` / `EXTERNAL_REVIEWER` | Hidden | No | No | No |

Reviewer-capable roles are `ADMIN`, `PARTNER`, `LAWYER`, and `COLLAB_LAWYER`. Admin/Partner status never bypasses self-review.

## Ordering

1. Load task, submission, and actor.
2. Apply internal-role and task/case participation checks.
3. Return hidden `404 TASK_SUBMISSION_NOT_FOUND` for inaccessible resources.
4. Apply actor-specific decision/revise/completion checks.
5. Only after authorization, resolve the persisted idempotency receipt.
6. Validate review version/state and execute the mutation.

This ordering prevents an unrelated actor from probing a known idempotency key. Authorized but ineligible decision actors receive `403 REVIEW_FORBIDDEN`; a valid self-review conflict receives `409 SELF_REVIEW_NOT_ALLOWED`.
