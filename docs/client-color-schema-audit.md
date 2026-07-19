# Client Color Schema Audit

## Existing State

`Client` already had `color String? @db.VarChar(16)`, introduced by `20260406120000_add_client_color`. It accepts arbitrary hexadecimal-like text and has no bounded database constraint.

Classification: **existing but semantically unsuitable**.

It cannot truthfully guarantee:

- one controlled palette;
- stable frontend tokens;
- rejection of arbitrary values;
- database-level bounded values.

## Decision

Add nullable `Client.colorKey ClientColorKey?` and retain the legacy `color` column without using it as a rendering source. No existing value is copied or interpreted.

The enum representation was selected over a bounded string because this repository already uses Prisma/PostgreSQL enums, the allowed set is small and stable, and invalid values must be rejected at both API and database boundaries.

## Existing Hardcoding Found

`Frontend/src/components/CasesList.tsx` derived colors from `clientName` through a hash and a page-local palette. That behavior is removed. No automatic assignment based on a client name remains.

## Existing Data Safety

- `colorKey` is nullable.
- No default exists.
- No backfill exists.
- Existing clients remain neutral until a user selects a color.
- The legacy column remains physically unchanged except for a clarifying Prisma comment.
