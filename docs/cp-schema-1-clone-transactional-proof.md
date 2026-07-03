\# CP-SCHEMA-1 clone transactional proof



\## Executive summary



A clone-only transactional proof was executed manually against the confirmed non-production production-like clone `adminiculum-bp3-rc1b-clone`.



The CP-SCHEMA-1 migration SQL file executed successfully inside an explicit transaction and was rolled back.



No migration was applied permanently. No production database was targeted. No Prisma migrate command was used. No runtime was deployed or enabled. No existing data became client-visible.



\## Scope



Migration file tested:



`Backend/prisma/migrations/20260702140000\_add\_client\_portal\_foundation/migration.sql`



Repo state used in Cloud Shell clone:



`1f43dab`



Clone target:



\- Server: `adminiculum-bp3-rc1b-clone`

\- Database: `adminiculum`

\- Classification: PITR / production-like clone

\- Production targeted: no



\## Safety handling



The proof was executed manually through Azure Cloud Shell / `psql`.



No secrets or connection strings are recorded in this document.



The migration was executed only inside:



```sql

BEGIN;

\-- migration.sql

ROLLBACK;

```



There was no `COMMIT`.



\## First proof note



The first transactional proof execution successfully ran the migration SQL and rolled back, but the verification queries searched for PascalCase table names such as `ClientPortalUser`.



The actual migration creates snake\_case table names, so the first in-transaction table/index/FK verification returned 0 rows even though the SQL had created tables, indexes, and constraints.



A second proof with snake\_case / pattern-based checks was then executed.



\## V2 transactional execution result



The V2 proof executed successfully.



Observed SQL execution inside transaction:



\- `CREATE TYPE`: 16 CP-SCHEMA-1 enum types

\- `CREATE TABLE`: 7 CP-SCHEMA-1 tables

\- `CREATE INDEX`: 39 CP-SCHEMA-1 indexes

\- `ALTER TABLE`: 18 CP-SCHEMA-1 foreign-key constraints



No error was observed during migration execution.



\## In-transaction CP table verification



The following 7 CP-SCHEMA-1 tables were visible inside the transaction:



\- `client\_portal\_audit\_events`

\- `client\_portal\_grants`

\- `client\_portal\_memberships`

\- `client\_portal\_users`

\- `client\_submission\_attachments`

\- `client\_submissions`

\- `client\_visible\_artifacts`



\## In-transaction CP enum verification



The following 16 CP-SCHEMA-1 enum types were visible inside the transaction:



\- `ClientPortalActorType`

\- `ClientPortalAuditAction`

\- `ClientPortalAuditOutcome`

\- `ClientPortalGrantAction`

\- `ClientPortalGrantScope`

\- `ClientPortalGrantStatus`

\- `ClientPortalMembershipRole`

\- `ClientPortalMembershipStatus`

\- `ClientPortalUserStatus`

\- `ClientSubmissionAttachmentScanStatus`

\- `ClientSubmissionAttachmentStatus`

\- `ClientSubmissionStatus`

\- `ClientSubmissionType`

\- `ClientVisibleArtifactStatus`

\- `ClientVisibleArtifactType`

\- `ClientVisibleSourceType`



\## In-transaction index verification



The proof observed 39 CP-SCHEMA-1 indexes, including primary, unique, lookup, grant-resolution, submission-triage, artifact-source, and audit indexes.



Important examples:



\- `client\_portal\_users\_pkey`

\- `client\_portal\_users\_email\_provider\_key`

\- `client\_portal\_memberships\_pkey`

\- `client\_portal\_grants\_pkey`

\- `client\_visible\_artifacts\_pkey`

\- `client\_submissions\_pkey`

\- `client\_submission\_attachments\_pkey`

\- `client\_portal\_audit\_events\_pkey`



\## In-transaction FK verification



The proof observed 18 CP-SCHEMA-1 foreign keys.



Important FK examples:



\- `client\_portal\_memberships.clientPortalUserId` to `client\_portal\_users.id`

\- `client\_portal\_memberships.clientId` to `clients.id`

\- `client\_visible\_artifacts.clientId` to `clients.id`

\- `client\_portal\_grants.artifactId` to `client\_visible\_artifacts.id`

\- `client\_portal\_grants.clientId` to `clients.id`

\- `client\_submissions.clientId` to `clients.id`

\- `client\_submissions.clientPortalUserId` to `client\_portal\_users.id`

\- `client\_submissions.membershipId` to `client\_portal\_memberships.id`

\- `client\_submission\_attachments.submissionId` to `client\_submissions.id`

\- `client\_portal\_audit\_events.artifactId` to `client\_visible\_artifacts.id`

\- `client\_portal\_audit\_events.submissionId` to `client\_submissions.id`



\## Rollback confirmation



Rollback completed successfully.



After rollback, CP-SCHEMA-1 tables were absent:



```text

0 rows

```



After rollback, CP-SCHEMA-1 enum types were absent:



```text

0 rows

```



This confirms that the transactional proof did not leave the CP-SCHEMA-1 schema applied on the clone.



\## Post-rollback baseline table presence check



After rollback, the following baseline tables remained present:



\- `\_prisma\_migrations`

\- `cases`

\- `clients`

\- `communications`

\- `documents`

\- `tasks`

\- `users`



This confirms that rollback did not damage the baseline clone schema.



\## Safety classification



\- Runtime change: no

\- Schema file change: no

\- Migration file change: no

\- DB connection used: yes, clone only

\- DB target: clone only / not production

\- Transaction committed: no

\- Rollback executed: yes

\- Persisted DB change: no

\- Production DB touched: no

\- Secrets printed: no

\- Existing data made client-visible: no



\## Readiness assessment



The CP-SCHEMA-1 migration file can execute successfully on the production-like clone schema inside a transaction.



This supports moving to a later clone apply proof, if needed.



Production apply remains blocked.



Before production migration, the project still needs at least:



1\. clone apply proof or migration-history-safe apply rehearsal;

2\. post-apply Prisma status verification on clone;

3\. rollback/restore plan;

4\. explicit production migration approval;

5\. confirmation that Client Portal runtime remains feature-flagged/off;

6\. verification that no publication/grant rows are seeded by the migration.



\## Recommended next prompt



`Adminiculum — CP-SCHEMA-1 clone apply proof gate no production`



Expected classification after documentation:



`cp\_schema1\_clone\_transactional\_proof\_documented\_rollback\_no\_persisted\_db\_change\_no\_runtime\_change`

