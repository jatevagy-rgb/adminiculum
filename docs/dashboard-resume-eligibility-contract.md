# Dashboard Resume Eligibility Contract

## Purpose

`Itt folytasd` may promote only work for which the authenticated actor has a real, backend-supported next action.

## Eligible Actions

| Action code | Display label | Eligibility |
| --- | --- | --- |
| `START_TASK` | `Munka megkezdése` | Assigned task is `PENDING` or equivalent non-terminal todo state. |
| `OPEN_TASK` | `Feladat megnyitása` | Assigned task is actively in progress. |
| `CONTINUE_SUBMISSION` | `Leadás folytatása` | Latest submission is an actor-owned draft. |
| `OPEN_REVIEW` | `Review megnyitása` | Submission is assigned to the actor for review. |
| `CONTINUE_RETURNED_WORK` | `Javítás folytatása` | Latest submission was returned to the responsible submitter. |
| `RECORD_EXTERNAL_COMPLETION` | `Külső lépés rögzítése` | Actor is the assigned reviewer and the approved item still has an explicit incomplete external action. |

## Exclusions

- Terminal task states: `COMPLETED`, `DONE`, `CANCELLED`, or equivalent.
- Terminal case states: `FINAL`, `CANCELLED`, `ARCHIVED`.
- `VIEW_COMPLETED` and unknown next-action values.
- Submitted work for a non-reviewer.
- Approved work without an outstanding external action.
- Superseded or cancelled submissions.
- Stale local or activity-feed records.
- Records assigned to another actor or otherwise outside the actor's case authorization scope.

## Ranking

Candidates are sorted deterministically by persisted deadline rank, supported action rank, deadline timestamp, and stable title. Updated-at recency does not allow completed work to outrank actionable work.

## Empty State

Title: `Nincs félbehagyott vagy azonnali beavatkozást igénylő munkája.`

Detail: `Az új feladatokat és határidőket az alábbi áttekintésekben találja.`

An honest empty state is required when no eligible candidate exists.
