# Grow With Us v2 — T1 Canonical Business Process & Business System Foundation

This document defines the canonical domain data models, tenant safety rules, delete semantics, and architectural boundaries introduced in **Slice T1**.

---

## 1. Canonical Ownership

The new models—`BusinessProcess`, `BusinessProcessStep`, and `BusinessSystem`—are **COMPANY DATA** owned by the client company (`Client`).

* They represent how a client operates internally and which software/systems are used by their operations.
* They live in `Backend/src/modules/client-company/`.
* Grow With Us (the continuous improvement layer) is an **orchestration & read projection module** over this canonical data; it does **NOT** maintain duplicate storage.

---

## 2. Domain Model & Responsibility Distinctions

### BusinessProcess vs. WorkflowTemplate
* **BusinessProcess**: Describes a real-world client company operational process (e.g. Vendor Onboarding, Invoice Processing, HR Employee Onboarding). Owned by `Client`. Not executable by law firm staff.
* **WorkflowTemplate**: Describes an internal law firm legal work package DAG template (e.g. Contract Review DAG, Real Estate Conveyancing DAG). Used to instantiate law firm `Task` objects.

### BusinessProcessStep vs. Task
* **BusinessProcessStep**: Diagnostic description of a step within a client's business process (position, name, stepType, active/waiting minutes, system used, responsible person). **NOT executable**.
* **Task**: An actionable, trackable work item assigned to a specific lawyer/user with status, deadlines, and submissions.

### BusinessSystem vs. IMPORTANT_IT_SYSTEM ClientFact
* **ClientFact (`IMPORTANT_IT_SYSTEM`)**: A lightweight, key-value temporal fact recording audit events or simple facts.
* **BusinessSystem**: A canonical, structured software asset entity (category, vendor, purpose, ownerPersonId, status) referenced relationally by `BusinessProcessStep` and future integration analyses.

---

## 3. Tenant Safety & Same-Client Integrity

Database and application-layer constraints strictly guarantee tenant isolation:

1. **Prisma Composite / Foreign Key Constraints**:
   * `BusinessProcess`, `BusinessSystem`, and `BusinessProcessStep` require `clientId`.
   * Foreign keys enforce `onDelete: Cascade` when a `Client` is deleted.
2. **Service Layer Assertion Rules**:
   * A `BusinessProcess` for Client A **cannot** reference a Client B `OrganizationPerson` or `ClientOrganizationGroup`.
   * A `BusinessProcessStep` for Client A **cannot** reference a Client B `BusinessSystem` or `OrganizationPerson`.
   * Any cross-client reference attempt throws a machine-readable `400 CROSS_CLIENT_REFERENCE` error.

---

## 4. Deletion & Client Lifecycle Semantics

### Client Archive
* Archiving a client sets `archivedAt`. All `BusinessProcess`, `BusinessProcessStep`, and `BusinessSystem` records remain intact for compliance and audit trail.

### Client Dependency Preview
* `getClientDependencySummary` includes `businessProcesses` and `businessSystems` in the `complianceAndFoundation` count.
* If a client has any business processes or systems, `canHardDelete` returns `false`, blocking hard deletion with `409 CLIENT_DELETE_BLOCKED`.

### Client Hard Delete
* When a 0-dependency client is hard deleted, Prisma `onDelete: Cascade` cleanly removes all process and system records.

### Process & System Deletion
* Deleting a `BusinessProcess` cascade-deletes its `BusinessProcessStep` children, but leaves referenced `BusinessSystem` and `OrganizationPerson` records intact.
* Deleting a `BusinessSystem` sets `systemId` on referencing `BusinessProcessStep` rows to `NULL` (`onDelete: SetNull`), preserving process integrity.
* Deleting an `OrganizationPerson` sets `ownerPersonId` and `responsiblePersonId` to `NULL` (`onDelete: SetNull`).

---

## 5. Explicitly Out of Scope for T1

* **BPMN Execution / Workflow Engines**: Process steps are diagnostic data only.
* **Portal UI / Frontend Changes**: T1 is purely canonical backend data.
* **External Integration Engines**: No Activepieces, SurveyJS, or React Flow installed.
* **Automatic Fact Migration**: Existing `IMPORTANT_IT_SYSTEM` facts remain intact as historical facts.
