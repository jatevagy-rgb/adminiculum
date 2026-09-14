---
name: adminiculum-agent-coordination
description: Use before starting or continuing any Adminiculum implementation, repair, PR, architecture task, review handoff, or delegated agent work. Prevents agent collisions, stale branches, duplicate ownership, and accidental cross-PR edits.
---

# Adminiculum Agent Coordination

ONE OWNER PER CHANGE STREAM.

Before any implementation, repair, or continuation:

1. git fetch origin
2. resolve current origin/master
3. inspect open pull requests
4. identify active owners
5. identify changed-file collision risk
6. determine whether the requested behavior is already owned elsewhere

Print:

CURRENT_MASTER=
CURRENT_BRANCH=
CURRENT_HEAD=
OPEN_RELEVANT_PRS=
TASK_OWNER=
TARGET_BRANCH=
TARGET_PR=
OWNED_SCOPE=
FORBIDDEN_SCOPE=
COLLISION_RISK=

If another active PR already owns the same defect or behavior:

STOP.

Do not create a competing implementation.

Never delete, replace, close, or rewrite another active branch merely because
it looks stale or duplicated.

If master moves during active work:

git fetch origin

Merge origin/master INTO the reviewed branch.

Do not silently rebase.

Resolve semantically and rerun affected tests.

Never use:

git add .
git add -A
git push --force
git reset --hard

unless a human explicitly authorizes that exact operation.

Use explicit staging.

COMMIT != MERGED
MERGED != DEPLOYED
DEPLOYED != LIVE ACCEPTED

Final handoff:

START_MASTER=
CURRENT_MASTER_AT_FINISH=
BRANCH=
FINAL_HEAD=
PR=
OWNER=
FILES_CHANGED=
OTHER_ACTIVE_STREAMS_TOUCHED=
CURRENT_MASTER_RECONCILED=
WORKTREE_CLEAN=
REMOTE_HEAD_VERIFIED=
TARGETED_TESTS=
REGRESSION_TESTS=
CI_EXACT_HEAD=
FRESH_REVIEW=
UNRESOLVED_P1_P2=
MERGE_READY=
MERGED=
DEPLOYED=
LIVE_USER_ACCEPTANCE=
