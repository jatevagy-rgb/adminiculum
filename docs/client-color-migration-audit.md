# Client Color Migration Audit

Migration: `20260719120000_add_client_color_key`.

## SQL

1. Create enum `ClientColorKey` with the ten approved keys.
2. Add nullable `clients.colorKey` using that enum.

## Safety Review

| Check | Result |
| --- | --- |
| Table drop | 0 |
| Column drop | 0 |
| `TRUNCATE` | 0 |
| `DELETE` | 0 |
| `UPDATE` / backfill | 0 |
| `NOT NULL` | 0 |
| Default assignment | 0 |
| Existing client mutation | 0 |

The migration is additive and was not applied to production. `prisma format` initially produced unrelated legacy formatting noise; that noise was reverted and only the enum/field lines remain in the schema diff.
