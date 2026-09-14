-- Align `eu_sme_size_class` FactDefinition metadata with the canonical catalogue.
--
-- The catalogue classifies `eu_sme_size_class` as LEGAL_CLASSIFICATION_REQUIRED
-- (SME classification needs partner/linked-enterprise aggregation that three raw
-- size facts cannot establish). The canonical provisioning migration recorded
-- `DERIVED` instead, which contradicts the catalogue. The runtime already fails
-- closed; this additive, idempotent migration only corrects the persisted
-- metadata so it no longer disagrees with the source of truth.
--
-- Idempotent and safe on existing databases: it updates only the one row, only
-- when it is still mislabelled, and never mutates an already-correct row.
UPDATE "fact_definitions"
   SET "determinationMethod" = 'LEGAL_CLASSIFICATION_REQUIRED'
 WHERE "key" = 'eu_sme_size_class'
   AND "determinationMethod" = 'DERIVED';
