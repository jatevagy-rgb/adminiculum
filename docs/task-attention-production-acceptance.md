# Task attention production acceptance

## Backend acceptance

- `/health` returns `200`.
- Protected unauthenticated routes return `401`.
- Authenticated Task reads include nullable `attentionCategory` and `estimatedMinutes`.
- Dashboard workload projection returns all five categories plus unclassified.
- No missing-column or Prisma errors occur.

## Frontend acceptance

- Dashboard shows `Milyen munkák várnak rám?`.
- Tasks page shows badges, filters, and effort text.
- Review categories and decisions remain unchanged.
- Existing routes do not crash.

## Current status

Production acceptance is pending deployment and authenticated browser verification.
