# Prisma Migration Inventory — 2026-07-26

Repository branch: `codex/prisma-migration-replayability-recovery`
Scope: checked-in legacy Prisma migration directories. Checksums are repository SHA-256 of `migration.sql`. Production checksum comparison still requires read-only production metadata.

| Migration | SHA-256 | Tables created | Tables altered | Enums created | Guarding notes |
|---|---|---|---|---|---|
| `20260211153100_baseline` | `5ed4f7d9db1fda4ec3ece38c5d26439790771aa28dffc1a4e96164a22ce679d2` | — | — | — | intentional no-op baseline |
| `20260212180000_add_workload_tracking` | `4221e23d720b7c89e79b46adfd41f6781abf8947a8c743bf84b9ab54940f3677` | `client_workgroups`<br>`workload_records` | — | — | IF NOT EXISTS |
| `20260330120000_add_generation_drafts` | `d3a239d6ef504ce4f027faaf13701870f65f1f85bb0d95a36f30456f078a30b5` | `generation_drafts` | — | — | unguarded or plain SQL |
| `20260331090100_add_anonymous_documents` | `4d5d2e6a692d67d4824d3ddd54c681889199e74731038c84f2943a52c1e19a49` | `anonymous_documents` | — | — | unguarded or plain SQL |
| `20260331100000_add_rehydration_fields` | `5522766343085727cda3975633529dc59a4def1209b7682960b56ab084ca97d8` | — | `anonymous_documents` | — | IF NOT EXISTS |
| `20260402131500_add_client_identity_fields` | `d5f8d3473ba78e4af3d92fa17d72607fc4c5166f26a45650b95c48818071f09f` | — | `clients` | — | IF NOT EXISTS |
| `20260405183100_add_case_client_role` | `000113616d6820bfffeb484c39772e68c84157e59909710c6042c852c4cce4c2` | — | `cases` | — | IF NOT EXISTS |
| `20260406120000_add_client_color` | `71048a1a093d4e04e4b096f72526e281aa965129e88a0c26820434882ee3cc64` | — | `clients` | — | unguarded or plain SQL |
| `20260408140000_add_case_collaborators` | `a89133bc4f598477b7c2369c390de693b96bfe15abcd684d4fcb1b51c5f861d5` | `case_collaborators` | — | — | unguarded or plain SQL |
| `20260416175000_add_comparison_snapshot_foundation` | `eeee44cf5d9ecf552e4c72f2e44fb626aad8a71ff8f22ba7b15dfd763b2d3e84` | — | `contract_generations` | — | IF NOT EXISTS |
| `20260417100000_add_timesheet_report_instances` | `6e7a50122b2450cd06d081fff470d80dc3638336e41c549ea5c8773e2605909d` | `timesheet_report_instances` | — | `TimesheetReportTemplateFamily`<br>`TimesheetReportInstanceStatus` | unguarded or plain SQL |
| `20260417113000_add_timesheet_report_artifacts` | `92bf797bae4e48d0591a0fab859ce0c13eb7c5130cb00399778dcc3c6d52ffe7` | `timesheet_report_artifacts` | — | `TimesheetReportArtifactFormat` | unguarded or plain SQL |
| `20260417123000_add_timesheet_presets` | `2600338680e3a710a752b0f09e1f2319ab4a653e10e60c57cccec5985a71a737` | `timesheet_presets` | — | `TimesheetPresetLayer` | unguarded or plain SQL |
| `20260514201500_add_legal_analyses` | `7cc42006bd475a9fba81c1c68767ba807d4d3f47bfdbf2338b9782a8b408d097` | `legal_analyses` | `legal_analyses` | `LegalAnalysisStatus`<br>`LegalAnalysisSourceType`<br>`LegalAnalysisSourceDocumentType` | unguarded or plain SQL |
| `20260517175500_add_client_house_style_profile` | `92f5097145e3b1267374738d2e783e0605c8fb396bdf6437dd183b934a2fb5d4` | `client_house_style_profiles` | `client_house_style_profiles` | — | unguarded or plain SQL |
| `20260517191600_add_client_house_style_header_fields` | `f3abba1d821b327e090cfd4cd9510e30c699132aa92b6e8390d008352e4431cd` | — | `client_house_style_profiles` | — | IF NOT EXISTS |
| `20260518120000_add_workspace_text` | `0ec4db855f6a01439d9673af7cf96accd9d865f2806d86a753dc9e861b108d1c` | — | `documents` | — | unguarded or plain SQL |
| `20260622150000_add_lawyer_handoff_packages_foundation` | `0e0ccfe4ab620add81b3db83ff1566aa10f7b0e93cd0dc98e9f76eefaf0e9c4b` | `lawyer_handoff_packages` | `lawyer_handoff_packages` | `LawyerHandoffPackageType`<br>`LawyerHandoffStatus`<br>`LawyerHandoffDecision` | unguarded or plain SQL |
| `20260628190000_add_communication_baseline` | `45bc8a64bb30837eb6f1d6143ea906600e203d2f69d3a3f99f28c5a35fb8834a` | `communications`<br>`communication_attachments` | `tasks`<br>`communication_attachments` | `CommunicationType` | IF NOT EXISTS<br>DO block |
| `20260701120000_add_outlook_communication_provider_fields` | `7b1161d962a3b1d333e1dfa74fada061ff6bbc4f7b668aca53045f4e16f77f8f` | — | `communications`<br>`communication_attachments` | `CommunicationDirection`<br>`CommunicationSource`<br>`CommunicationSyncStatus` | IF NOT EXISTS<br>DO block |
| `20260718120000_add_task_submission_workflow` | `f353be8a19783f4742d4d352dabcf98cbcea8d1baa180047c3cfacf2e83f007e` | `task_submissions`<br>`task_submission_documents`<br>`task_review_decisions`<br>`task_submission_time_entries` | `time_entries`<br>`task_submissions`<br>`task_submission_documents`<br>`task_review_decisions`<br>`task_submission_time_entries` | `TaskSubmissionStatus`<br>`ReviewAttentionLevel`<br>`TaskReviewDecisionType`<br>`TaskSubmissionDocumentRole`<br>`ExternalActionType` | IF NOT EXISTS |
| `20260719120000_add_client_color_key` | `f76f8bf8a1aa6a4289ce13f03f68f1423417741cec9c4e421f7914d9c1c1978c` | — | `clients` | `ClientColorKey` | unguarded or plain SQL |
| `20260722135148_add_task_attention_category` | `817c88a3bebb28dd976afe52f8f8b349f7c9dc8e72b358dc848f71d88303426f` | — | `tasks` | — | unguarded or plain SQL |
| `20260723143000_contract_workspace_version_foundation` | `ee4ab513aaa77ea8402c968f57259cb964bdd1df015f80fbaae5dfaa2c812cb2` | `document_versions`<br>`document_reviews`<br>`review_snapshots` | `document_versions`<br>`document_reviews`<br>`review_snapshots` | `DocumentVersionReviewStatus`<br>`DocumentVersionPublicationStatus`<br>`DocumentVersionUploadSource`<br>`DocumentVersionType`<br>`DocumentReviewStatus` | IF NOT EXISTS<br>DO block |
| `20260723152000_contract_workspace_annotations` | `4bbb9e6ca39922ae3d93423cd0b7002d5fbee4d327a7d674a71064ed0e687c8f` | `document_annotations`<br>`document_annotation_comments`<br>`document_annotation_events` | `document_annotations`<br>`document_annotation_comments`<br>`document_annotation_events` | `DocumentAnnotationType`<br>`DocumentAnnotationAnchorType`<br>`DocumentAnnotationStatus`<br>`DocumentAnnotationVisibility`<br>`DocumentAnnotationEventType` | IF NOT EXISTS<br>DO block |
| `20260724120000_case_intake_redesign` | `21e089ea01f49efc3226e4b234d8184eff41d45d0190f09c2ccbb8b5edfdb91d` | `case_external_participants`<br>`case_intake_deadlines` | `cases`<br>`communications`<br>`case_external_participants`<br>`case_intake_deadlines` | — | IF NOT EXISTS<br>DO block |
| `20260724140000_document_work_context` | `63056e9c1c23ea668466de51039c38ae93b64378e829e3b4baba54606dae2f3b` | `document_task_links` | `documents`<br>`document_task_links` | `DocumentWorkStatus` | IF NOT EXISTS<br>DO block |

## Key Findings

- `20260211153100_baseline` is a no-op and creates no foundational objects.
- `20260212180000_add_workload_tracking` assumes `clients` exists and fails from empty with PostgreSQL `42P01`.
- Many current Prisma models have no active create migration because production/foundational schema was historically bootstrapped outside the checked-in incremental chain.
- Later migrations include unguarded `CREATE TABLE`, `CREATE TYPE`, `CREATE INDEX`, and `ALTER TABLE ADD COLUMN`, so prepending a full-current foundation migration to the legacy chain would collide with later SQL.
- The implemented recovery therefore separates fresh empty bootstrap from legacy production-history migrations.
