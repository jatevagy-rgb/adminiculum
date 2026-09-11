DO $$
DECLARE
  old_id TEXT;
  canonical_id TEXT;
BEGIN
  SELECT id INTO old_id FROM fact_definitions WHERE key = 'DEMO_KFT_COMPANY_EMPLOYEE_COUNT';
  SELECT id INTO canonical_id FROM fact_definitions WHERE key = 'employee_count';

  IF canonical_id IS NOT NULL AND old_id IS NOT NULL AND canonical_id <> old_id THEN
    RAISE EXCEPTION 'Cannot reconcile employee_count: canonical FactDefinition already exists on a different id';
  ELSIF old_id IS NOT NULL AND canonical_id IS NULL THEN
    UPDATE fact_definitions SET key = 'employee_count' WHERE id = old_id;
  END IF;
END $$;
