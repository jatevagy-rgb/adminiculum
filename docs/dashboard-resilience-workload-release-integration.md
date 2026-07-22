# Dashboard Resilience + Workload Cards — Release Integration

Date: 2026-07-22

## Integrated branch

`claude/dashboard-legacy-workload-cards-restore-1` @ `77bece8` fast-forwarded
into `release/editor-ops-workflow-1`.

## Ancestry (proven)

`aa98c70` (prior release HEAD) → resilience closeout `c969a9b` → restoration
`742423f`, `bddeb81`, `d45177f`, `77bece8`. Linear chain; `merge-base` confirms
each link; fast-forward possible. Resilience runtime (`aed07b3`, `a5b91a0`) and
workload restoration runtime (`bddeb81`) each included exactly once. No parked
commit (`24bc6c5` absent), no cherry-pick, no unrelated branch.

## Integration method

`git merge --ff-only origin/claude/dashboard-legacy-workload-cards-restore-1`.
No merge commit, no history rewrite, no force push. Pre-integration HEAD
`aa98c70`; post-integration HEAD `77bece8`.

## Runtime source commit

Last commit changing production runtime (`Frontend/src` / `Backend/src`):
**`bddeb81`** (`fix: restore legacy dashboard workload cards`). Commits after it
(`d45177f` test, `77bece8` docs) do not touch runtime — the frontend artifact's
runtime is `bddeb81`, the release HEAD is `77bece8`.

## Independent diff review (`aa98c70..77bece8`)

Runtime (exactly the 3 expected):
- `Frontend/src/components/DashboardFocused.tsx` (M)
- `Frontend/src/lib/dashboardLoadState.ts` (A)
- `Frontend/src/lib/dashboardWorkloadSummary.ts` (A)

Non-runtime: 4 frontend test/harness files, 3 backend static **test** files
(stale guards updated), `.gitignore`, and documentation.

Zero changes to: Backend/src, Prisma, migrations, API routes, auth, CORS,
package.json, lockfiles, ClientColorKey, TaskSubmission, Review decisions,
Communications backend, Calendar, Azure/config, environment files.

## Contract reviews

- **Resilience:** `DashboardFocused` imports `@/lib/dashboardLoadState`; tests
  import the same helper; comms failure → "A kommunikációs adatok most nem
  érhetők el.", comms empty → "Nincs megjeleníthető kommunikáció."; critical
  banner "A műszerfal alapadatai nem tölthetők be." only when tasks+cases fail.
- **Workload:** 6 cards in exact order (Nyitott ügyek/Mai teendők/Közeli
  határidők/Review tételek/Külső kommunikáció/Belső kommunikáció), tones
  petrol/amber/gold/navy/terracotta/green, placed Itt folytasd → Napi munka
  összefoglaló → Ügyek, ahol lépés szükséges. Matches historical `a948839`.
