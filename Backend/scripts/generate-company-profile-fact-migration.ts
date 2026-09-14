/**
 * Maintenance generator: emits the additive provisioning migration from
 * companyProfileFactProvisioning so the SQL can never drift from the catalogue.
 *
 * Run:  cd Backend && npx tsx scripts/generate-company-profile-fact-migration.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { PROVISIONED_COMPANY_FACTS } from '../src/modules/client-workspace/companyProfileFactProvisioning';

const dir = path.resolve('prisma/migrations/20260914110000_provision_canonical_company_profile_facts');
fs.mkdirSync(dir, { recursive: true });

const esc = (value: string): string => value.replace(/'/g, "''");
const literal = (value: string | null): string => (value === null ? 'NULL::jsonb' : `'${esc(value)}'::jsonb`);

const rows = PROVISIONED_COMPANY_FACTS.map((row) => {
  const json = row.allowedEnumValues ? JSON.stringify(row.allowedEnumValues) : null;
  return `      ('${esc(row.key)}', '${esc(row.questionKey)}', '${row.valueType}', ${literal(json)}, '${row.determinationMethod}', '${row.overlapPolicy}')`;
}).join(',\n');

const sql = `-- Provision the canonical Company Profile 2.0 fact definitions used by the
-- client discovery journey (canonical fact dictionary + structured TE\u00c1OR'25
-- activity + adaptive modules).
--
-- Additive and idempotent. Existing compatible rows are preserved byte-for-byte;
-- incompatible rows fail closed instead of being rewritten. The seven legacy keys
-- provisioned by 20260914100000_... are intentionally absent here; they are
-- retained and reconciled in code via LEGACY_FACT_KEY_ALIASES.
DO $$
DECLARE
  seed RECORD;
  existing_definition RECORD;
BEGIN
  FOR seed IN
    SELECT * FROM (VALUES
${rows}
    ) AS registry("key", "questionKey", "valueType", "allowedEnumValues", "determinationMethod", "overlapPolicy")
  LOOP
    SELECT "id", "valueType", "questionKey", "allowedScopeTypes", "determinationMethod", "status", "temporalPolicy", "overlapPolicy"
      INTO existing_definition
      FROM "fact_definitions"
      WHERE "key" = seed."key"
      FOR UPDATE;

    IF FOUND THEN
      IF existing_definition."valueType"::text <> seed."valueType"
        OR existing_definition."questionKey" IS DISTINCT FROM seed."questionKey"
        OR existing_definition."allowedScopeTypes" <> ARRAY['COMPANY']::"FactScopeType"[]
        OR existing_definition."determinationMethod"::text <> seed."determinationMethod"
        OR existing_definition."status"::text <> 'ACTIVE'
        OR existing_definition."temporalPolicy"::text <> 'OBSERVATION'
        OR existing_definition."overlapPolicy"::text <> seed."overlapPolicy" THEN
        RAISE EXCEPTION 'Incompatible canonical company-profile FactDefinition for key %', seed."key";
      END IF;
    ELSE
      INSERT INTO "fact_definitions" (
        "id", "key", "domainCode", "valueType", "allowedEnumValues", "allowedScopeTypes",
        "determinationMethod", "overlapPolicy", "temporalPolicy", "questionKey", "status"
      ) VALUES (
        gen_random_uuid()::text,
        seed."key",
        'CLIENT_COMPANY_PROFILE',
        seed."valueType"::"FactValueType",
        seed."allowedEnumValues",
        ARRAY['COMPANY']::"FactScopeType"[],
        seed."determinationMethod"::"FactDeterminationMethod",
        seed."overlapPolicy"::"FactOverlapPolicy",
        'OBSERVATION'::"FactTemporalPolicy",
        seed."questionKey",
        'ACTIVE'::"FactDefinitionStatus"
      );
    END IF;
  END LOOP;
END
$$;
`;

fs.writeFileSync(path.join(dir, 'migration.sql'), sql, 'utf8');
console.log(`WROTE ${PROVISIONED_COMPANY_FACTS.length} rows to ${path.join(dir, 'migration.sql')}`);
