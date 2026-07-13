# Workflow Core Workload Contract

## Endpoint
`GET /api/v1/workload`

## Scopes
- `MY_WORK`: authenticated user's assigned open task context and own recorded time.
- `MY_CASES`: cases the authenticated user can participate in through responsibility/creation/collaboration.
- `TEAM`: privileged internal overview for `ADMIN` / `PARTNER` only.

## Response Shape
- `summary`: case count, open task count, overdue count, due-soon count, recorded manual minutes, active timer support flag.
- `people`: internal participants with operational task counts and recorded manual minutes where available.
- `cases`: linked case cards with open/overdue/due-soon counts.
- `availability`: flags for team scope, case time support, active timer support, passive tracking support.

## Privacy and Fairness
The contract intentionally avoids rankings, scores, utilization percentages, passive tracking, surveillance language, and employee performance claims. Sorting is operational attention order only.
