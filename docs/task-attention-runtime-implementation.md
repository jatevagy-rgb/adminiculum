# Task attention runtime implementation

## Status

The runtime branch implements Task attention category and estimated duration support on top of the already-applied production schema migration `20260722135148_add_task_attention_category`.

This runtime ticket does not create or apply migrations and does not add an attention-category index.

## Scope implemented

- Task read DTOs include `attentionCategory` and `estimatedMinutes`.
- Task creation accepts the two nullable fields with backend validation.
- Task attention updates are handled through a narrow authenticated route.
- Dashboard operational overview includes a server-computed workload projection.
- Tasks workspace shows category badges, category filters, and estimated effort text.
- Dashboard shows the `Milyen munkák várnak rám?` workload block.

## Out of scope

- No Review lifecycle change.
- No TimeEntry behavior change.
- No schema or migration change.
- No Azure configuration change.
- No Client Portal change.
- No AI-derived classification.

## Current implementation classification

Implementation-ready on branch `claude/task-attention-runtime-1`; production deployment evidence must be recorded separately after backend and frontend deployments are performed.
