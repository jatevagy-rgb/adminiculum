# Task Leadás And Review Error Mapping

Date: 2026-07-19

## Bounded User Messages

| Backend code / condition | Hungarian display |
| --- | --- |
| `TASK_NOT_FOUND` | A feladat nem található vagy nincs hozzáférése. |
| `TASK_SUBMISSION_STATE_CONFLICT` | A Leadás állapota időközben megváltozott. |
| `REVIEW_ALREADY_DECIDED` | Erről a Leadásról már döntés született. |
| `SELF_REVIEW_NOT_ALLOWED` | Saját Leadás nem review-zható. |
| `REVIEWER_INELIGIBLE` | A kiválasztott reviewer nem jogosult. |
| `HANDOFF_NOT_READY` | A Leadás még nem küldhető review-ra. |
| `IDEMPOTENCY_KEY_REUSED` | A műveletazonosító már más kéréshez tartozik. Frissítse az oldalt. |
| stale ETag / `If-Match` conflict | A Review időközben megváltozott. Az adatokat újratöltöttük. |
| uncertain network outcome | A művelet eredménye bizonytalan; újraolvasás szükséges. |

Unknown errors use a safe generic retry message and a content-free diagnostic. Raw JSON, Prisma codes, storage paths, stack traces and network-library wording are not rendered to the user.

Readiness codes are separately mapped. Missing prerequisites use corrective language; fulfilled prerequisites use positive language so a green check never repeats a negative “hiányzik” statement.
