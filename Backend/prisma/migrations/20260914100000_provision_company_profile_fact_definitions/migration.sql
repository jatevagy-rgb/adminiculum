-- Provision the canonical company-profile fact definitions used by the
-- client portal.  This is an additive, idempotent data migration: existing
-- compatible rows are preserved byte-for-byte and incompatible rows fail
-- closed rather than being rewritten.
DO $$
DECLARE
  seed RECORD;
  existing_definition RECORD;
BEGIN
  FOR seed IN
    SELECT * FROM (VALUES
      ('company_main_activity', 'company_main_activity', 'STRING'),
      ('company_operating_country', 'company_operating_country', 'STRING'),
      ('company_regulated_activity', 'company_regulated_activity', 'BOOLEAN'),
      ('company_sensitive_data_usage', 'company_sensitive_data_usage', 'BOOLEAN'),
      ('company_important_it_system', 'company_important_it_system', 'BOOLEAN'),
      ('company_ai_usage', 'company_ai_usage', 'BOOLEAN'),
      ('company_export_activity', 'company_export_activity', 'BOOLEAN')
    ) AS registry("key", "questionKey", "valueType")
  LOOP
    SELECT "id", "valueType", "questionKey", "allowedScopeTypes", "status"
      INTO existing_definition
      FROM "fact_definitions"
      WHERE "key" = seed."key"
      FOR UPDATE;

    IF FOUND THEN
      IF existing_definition."valueType"::text <> seed."valueType"
        OR existing_definition."questionKey" IS DISTINCT FROM seed."questionKey"
        OR existing_definition."allowedScopeTypes" <> ARRAY['COMPANY']::"FactScopeType"[]
        OR existing_definition."status"::text <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Incompatible company-profile FactDefinition for key %', seed."key";
      END IF;
    ELSE
      INSERT INTO "fact_definitions" (
        "id",
        "key",
        "domainCode",
        "valueType",
        "allowedEnumValues",
        "allowedScopeTypes",
        "determinationMethod",
        "overlapPolicy",
        "temporalPolicy",
        "questionKey",
        "status"
      ) VALUES (
        gen_random_uuid()::text,
        seed."key",
        'CLIENT_COMPANY_PROFILE',
        seed."valueType"::"FactValueType",
        NULL,
        ARRAY['COMPANY']::"FactScopeType"[],
        'USER_PROVIDED'::"FactDeterminationMethod",
        'DISALLOW'::"FactOverlapPolicy",
        'OBSERVATION'::"FactTemporalPolicy",
        seed."questionKey",
        'ACTIVE'::"FactDefinitionStatus"
      );
    END IF;
  END LOOP;
END
$$;
