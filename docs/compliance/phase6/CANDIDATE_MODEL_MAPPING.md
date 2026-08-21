# Candidate Model Mapping

This stress-tests the current 46 requirement / 46 rule / 61 fact / 11 DOCX
candidate dataset against the Phase 6 conceptual model. Rows are engineering
mappings, not legal conclusions. Every legal citation remains subject to the
reviewed source anchor and approved `RequirementVersion` lifecycle.

| Candidate area | Legal/source representation | Requirement and rule | Fact definitions and scope | Evaluation and delivery mapping |
|---|---|---|---|---|
| GDPR processing records | `LegalSourceVersion` for the reviewed GDPR capture; `LegalProvision` for Art. 30 anchor. | Versioned record-of-processing requirement; deterministic rule for controller/processor context and exemptions. | processing activity, employee count, role; `COMPANY` and `PRODUCT_SERVICE`, reference period. | `RequirementApplicability`; gap becomes finding/task; ROPA evidence is `DocumentVersion`. |
| Whistleblowing channel | Reviewed EU/Hungarian source versions and threshold provisions. | Channel/policy requirement with effective date and threshold rule. | employee count, reporting channel, group exemption; `COMPANY`, valid/effective period. | Missing count is `INSUFFICIENT_FACTS`; legal threshold uncertainty is `LEGAL_REVIEW_REQUIRED`; policy output later uses template catalog. |
| AI Act | Source/version/provisions for literacy, role and high-risk duties. | Separate requirement versions for literacy and high-risk system obligations. | AI use, provider/deployer role, system classification, personnel; `PRODUCT_SERVICE` or `COMPANY`; technical method where needed. | Technical classification produces `TECHNICAL_REVIEW_REQUIRED`, never an inferred false answer. |
| Cybersecurity | Reviewed cyber source/provision records. | Requirement version for scope, governance or incident readiness. | network/system presence, criticality, responsible owner; `COMPANY`/`PRODUCT_SERVICE`, technical classification. | Evaluation snapshot records scope; controls/evidence catalogue can defer. |
| REACH / CLP | Regulation/source versions and provision anchors. | Substance, classification or label requirement versions. | substance/product, market placement, classification, supplier role; `PRODUCT_SERVICE`/`TRANSACTION`. | Missing technical classification is explicit; SDS/label evidence uses existing document/version. |
| Dual-use / customs | Reviewed EU/national source capture and provision anchors. | Screening/declaration requirement version with transaction rule. | goods, destination, counterparty, customs event; `TRANSACTION`/`REPORTING_EVENT`. | Each evaluation snapshots transaction facts; a remediation finding may create existing task. |
| Workplace risk | Source/version anchor for risk assessment duties. | Periodic and change-triggered risk-assessment requirement. | site, work activity, assessment date, change event; `WORKPLACE_SITE`/`EVENT`, reference period. | Structured periodic/change deadline; assessment session can present the result and evidence. |
| Accident notification | Source/version anchor for reportable accident duties. | Event-triggered notification requirement version. | accident time, severity/classification, site, authority notice; `EVENT` with technical/legal method. | Offset deadline is separate from law effective date; inconclusive event classification is review-required. |
| Consumer withdrawal | Consumer-law source version and withdrawal provisions. | Distance/off-premises withdrawal and refund requirement version. | sales channel, consumer contract, delivery/notice dates; `SALES_CHANNEL`/`CONTRACT`/`EVENT`. | Event-offset logic yields a traceable performance deadline; rendered form later has document type/template version. |
| Complaint handling | Consumer complaint source/provision records. | Complaint receipt/response requirement version. | complaint channel, received date, response/evidence; `EVENT`/`SALES_CHANNEL`. | Assessment item can collect evidence; open gap produces finding/task, not a second task model. |
| Accounting policy | Accounting source version and policy provisions. | Accounting-policy maintenance requirement with reporting-cycle rule. | financial year, accounting policy existence, approval/review date; `TAX_PERIOD`/`REPORTING_EVENT`. | Existing document/version stores the policy; template governance can defer. |
| VAT invoice | VAT source version and invoice-content provisions. | Invoice content/issuance requirement version. | transaction date, issuer/recipient identifiers, VAT status, invoice fields; `TRANSACTION`/`TAX_PERIOD`. | Deterministic checks use typed facts and record source/rule inputs; do not use free-text `ClientFact.value` alone. |

## Candidate ingestion controls

The candidate JSON can become a controlled fixture only after an ingestion
normalizer requires all of the following:

1. Each requirement citation resolves to a reviewed source-version and provision
   anchor, including hash and excerpt hash.
2. Each rule references declared fact-definition keys and a supported AST
   operator with compatible value types.
3. Each fact declares value type, permitted scope, determination method and
   temporal semantics. Missing scope is not silently treated as `COMPANY`.
4. Every rule outcome maps to a multi-valued evaluation status; unresolved legal
   or technical classification is not coerced into `DOES_NOT_APPLY`.
5. Every client-visible explanation is generated from approved client-safe text,
   never raw source review or internal legal notes.

The current counts demonstrate that the proposed relationships cover the
candidate set, but they do not authorize converting candidates into runtime
legal determinations before the lifecycle and Phase 5 acceptance gates exist.
