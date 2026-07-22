# Shared Attention Category — Dashboard & UX Plan (Phases 7–11)

Date: 2026-07-22

## Task creation/edit UX (Phase 7)

Add to the Task form:

- **Figyelmi kategória** (attention category) — select of the five labels
  (Gyors átfutás / Jóváhagyás / Aláírás / Szerkesztés / Részletes ellenőrzés),
  bound to `Task.attentionCategory`.
- **Becsült idő** (estimated time) — default presentation
  "Automatikus a kategória alapján: 5–15 perc" (the band for the chosen
  category), with an **optional** exact override "Egyedi becslés: [ 25 ] perc"
  bound to `Task.estimatedMinutes`.

Decisions:
- **Required?** Attention category is **optional at creation** in v1 (nullable
  column, legacy tasks unclassified). It becomes **required only** at the point
  it already is today — preparing a review submission (`REVIEW_ATTENTION_REQUIRED`
  stays on the submission's `requestedAttention`). This avoids forcing minutes or
  categories on every task and avoids a blocking behavior change.
- **Estimate not forced** — users never must enter minutes; the band supplies a
  planning range.
- **Editable after assignment?** Yes, while the task is open; edited by the task
  assignee or a user with task-manage authorization (same authorization as other
  task edits — see risks/authorization).
- **Audit** — a category/estimate change emits a content-light audit event
  (field name, old→new value, actor, timestamp), reusing the existing task
  assignment/lifecycle audit pattern; no document/legal content in the log.

## Task list UX (Phase 8)

On the Tasks page, **add** (never replace status/deadline/priority/assignee):
- a **category badge** (icon + label, shared `ATTENTION_MARKS` tone);
- a **category filter** (mirror of the Review filter concept, not a copy of its bar);
- **estimated effort** display per row;
- optional **grouping/sorting** by attention category, incl. an optional
  quick-work vs deep-work split (Gyors átfutás/Jóváhagyás/Aláírás vs
  Szerkesztés/Részletes ellenőrzés).

Suggested row:
```
Szerződés ellenőrzése
Részletes ellenőrzés · kb. 60–120 perc
Határidő: …
```

## Dashboard workload block (Phase 9)

Add a **distinct** block titled **"Milyen munkák várnak rám?"** with five cards
(canonical order): Gyors átfutás, Jóváhagyás, Aláírás, Szerkesztés, Részletes
ellenőrzés — plus a **Nincs besorolva** card when unclassified tasks exist.

Each card shows:
- category label + icon;
- item count;
- approximate total duration **range** (min–max) — omitted for Nincs besorolva;
- optionally the nearest deadline in that bucket.

Example: `Részletes ellenőrzés · 3 feladat · kb. 3–6 óra`.

Clicking a card opens the **Tasks** workspace filtered to that category (Review
workspace for the reviewer-workload variant, if later added).

Constraints honoured:
- Does **not** replace the restored historical six-card **"Napi munka
  összefoglaló"** KPI grid (that remains).
- Does **not** modify the four light Quick Actions.

## Dashboard placement (Phase 9)

**Recommended: after "Napi munka összefoglaló", before "Ügyek, ahol lépés
szükséges".** Rationale:
- keeps the two summary strips (KPI counts, then attention-workload) adjacent and
  above the operational case list;
- avoids duplicating the "Mai munkám" panels;
- the alternative (start of "Mai munkám") risks excessive dashboard height and
  visual competition with the three Mai-munkám panels.

Final order:
1. Műszerfal → 2. Gyors műveletek → 3. Itt folytasd → 4. Napi munka
összefoglaló → **5. Milyen munkák várnak rám?** → 6. Ügyek, ahol lépés szükséges
→ 7. Mai munkám → 8. Napi események → 9. Kommunikáció → 10. További jelzések.

To control height, the block is a compact single row of cards (same grid rhythm
as the KPI strip), not full panels.

## Visual language (Phase 10)

Reuse the Review page's category language: icon (`↗ ✓ ✎ ▤ ◎`), label, count,
selected state, and the pill tones (gold/sage/violet/blue/burgundy from the
`AdminBadge` palette). The Dashboard cards **additionally** show the aggregate
duration range, so they are more than a copy of the Review filter bar.

Rules:
- restrained category colors from the shared palette;
- **not** `ClientColorKey`;
- **not** urgency colors (urgency stays its own signal);
- colors are **semantically stable** across Review, Tasks, and Dashboard (one
  shared source of tones).

## Unclassified items (Phase 11)

- Present an explicit **"Nincs besorolva"** category in the UI representing
  `attentionCategory = null` (not a persisted enum member).
- Dashboard shows `Nincs besorolva · N feladat` — **count only, no time range**.
- Never silently fold unclassified tasks into Gyors átfutás; never fabricate a
  time estimate for them.
