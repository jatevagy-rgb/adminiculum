---
name: adminiculum-targeted-repair
description: Use for every Adminiculum bugfix, regression repair, live defect, failed acceptance, Codex finding, CI repair, or targeted production issue.
---

# Adminiculum Targeted Repair Protocol

PRESERVATION RULE:
This is a targeted repair, not a rewrite.

Preserve all currently working behavior.

Do not delete or replace legacy code merely because it is old, duplicated,
awkward, or architecturally imperfect unless you first prove it is unreachable
or superseded and regression-safe.

No broad cleanup.
No architecture rewrite.
No opportunistic refactor.
No unrelated feature removal.

The final authority is live user acceptance.

Before coding establish:

1. live/current symptom
2. reproducible behavior
3. root cause
4. owning backend/frontend/runtime layer
5. regression inventory
6. smallest targeted repair
7. exact expected end state

Print:

LIVE_OR_CURRENT_SYMPTOM=
REPRODUCTION=
ROOT_CAUSE=
OWNING_LAYER=
CURRENT_MASTER=
CURRENT_HEAD=
OWNER=
FILES_EXPECTED=
REGRESSION_INVENTORY=
MINIMUM_REPAIR=
EXPECTED_END_STATE=

Every already-working behavior potentially affected must receive:
- automated regression coverage;
- browser/live smoke;
- or explicit technical justification.

Do not perform destructive cleanup during a bugfix.

For a valid reviewer P1/P2:

same owner
same PR
root-cause confirmation
minimum repair
regression test
exact-head CI
fresh review

Do not create parallel repair branches.

Never use:

git add .
git add -A
git push --force
git reset --hard
destructive Prisma reset

without explicit human authorization.

Agent PASS is not final authority.
CI PASS is not final authority.
Reviewer PASS is not final authority.

Required completion state:

TARGETED_TESTS=PASS
REGRESSION_TESTS=PASS
EXACT_HEAD_CI=GREEN
FRESH_REVIEW=NO_VALID_P1_P2
MERGED=YES
DEPLOYED=YES
LIVE_USER_ACCEPTANCE=YES

If live behavior is wrong:

REPAIR_STATUS=NOT_COMPLETE
