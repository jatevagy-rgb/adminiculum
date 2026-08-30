# Product island reconnects

## Compliance / Company

```text
EXISTING_CAPABILITIES=company facts and AnswerState; temporal requirement/rule evaluation; applicability; findings; proposals; task creation; organization-safe read models; company profile UI
MISSING_EDGES=proposal action into the canonical case/work-package composer; customer-safe publication of accepted progress; coherent workspace entry
MINIMUM_RECONNECT=use existing bindProposalToCase and confirmed-task transaction; add an explicit action to an existing Case first; only later permit create-case through the canonical composer
USER_RESULT=a finding becomes owned legal work without exposing compliance internals to the client
```

## Clause / Contracts

```text
EXISTING_CAPABILITIES=Clause Library page/routes/service; template-backed generation; contract workspace; review; publication
MISSING_EDGES=contextual clause insertion into exact active document/version; review provenance; publication explanation
MINIMUM_RECONNECT=one Document Workspace action that opens the existing clause selection/assembly with case and document context; preserve Word-primary output
USER_RESULT=lawyer finds and applies approved language without leaving the case spine
```

## Time / Workload

```text
EXISTING_CAPABILITIES=TimeEntry CRUD; billable flag; timesheet reports; work summary; workload views; TaskSubmissionTimeEntry; Task.workPackageItemId
MISSING_EDGES=public taskId recording; deterministic Case attribution; package/task context in time UI; agenda relationship
MINIMUM_RECONNECT=replay Time-0 fail-closed attribution and authorize task-context time creation; never infer billing
USER_RESULT=recorded work is attributable to the actual legal task and visible in workload summaries
```

## Communication

```text
EXISTING_CAPABILITIES=global ledger; case/client scalar links; inbox; case communications; Outlook import/dedupe; providerConversationId grouping; action routes
MISSING_EDGES=safe contextual aggregate; canonical case composer; persisted Outlook unread/reply state; outgoing mail
MINIMUM_RECONNECT=repair PR95, then replay b361 projection; keep thread/outgoing work greenfield
USER_RESULT=inbound messages become scoped, actionable legal work
```

## Handoff

```text
EXISTING_CAPABILITIES=authorized CRUD/review/archive; panel; case/documents/compare/communications entry points
MISSING_EDGES=live environment foundation and broader acceptance, not product navigation
MINIMUM_RECONNECT=none in product code; verify foundation and live behavior
USER_RESULT=existing handoff remains available without another implementation
```

## Work Package

```text
EXISTING_CAPABILITIES=Case Type; template admin; atomic snapshot; workflow provenance; Task.workPackageItemId
MISSING_EDGES=operational runtime, compact creation, Case Workspace block on canonical
MINIMUM_RECONNECT=PR96 -> PR98 -> PR100
USER_RESULT=case scope becomes a usable operational plan
```

## Portal / Organization

```text
EXISTING_CAPABILITIES=identity; membership; workspaces; grants; Individual/Organization modes; publication; company/contracts/work summary
MISSING_EDGES=correct multi-workspace selection; explicit internal-intake publication policy
MINIMUM_RECONNECT=PR92, then a workforce-controlled grant/publication command using current services
USER_RESULT=the right customer sees only deliberately published work in the right workspace
```

## Document specialist tools

```text
EXISTING_CAPABILITIES=versions; compare; review; annotation; Legal Analysis; Handoff; Clause Library; anonymize/rehydrate
MISSING_EDGES=PR94 formats; mounted Legal Analysis panel; coherent specialist-action grouping
MINIMUM_RECONNECT=merge PR94; mount existing LegalAnalysisIntakePanel; group actions under Document Workspace without a new editor
USER_RESULT=one document journey from source to lawyer decision and client explanation
```
