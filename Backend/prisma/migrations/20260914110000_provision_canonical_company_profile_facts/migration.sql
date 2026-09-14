-- Provision the canonical Company Profile 2.0 fact definitions used by the
-- client discovery journey (canonical fact dictionary + structured TEÁOR'25
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
      ('company_legal_form', 'company_legal_form', 'ENUM', '["Kft.","Zrt.","Nyrt.","Bt.","Kkt.","Egyéni vállalkozó","Egyesület","Alapítvány","Közszerv","Egyéb"]'::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('registered_country', 'registered_country', 'JURISDICTION', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('operating_countries', 'operating_countries', 'MULTI_ENUM', NULL::jsonb, 'USER_PROVIDED', 'ALLOW'),
      ('primary_teaor25_code', 'primary_teaor25_code', 'STRING', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('additional_teaor25_codes', 'additional_teaor25_codes', 'MULTI_ENUM', NULL::jsonb, 'USER_PROVIDED', 'ALLOW'),
      ('sites_count', 'sites_count', 'NUMBER', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('group_member', 'group_member', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('parent_country', 'parent_country', 'JURISDICTION', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('listed_company', 'listed_company', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('state_or_public_control', 'state_or_public_control', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('employee_count', 'employee_count', 'NUMBER', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('annual_net_revenue_eur', 'annual_net_revenue_eur', 'NUMBER', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('balance_sheet_total_eur', 'balance_sheet_total_eur', 'NUMBER', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('eu_sme_size_class', 'eu_sme_size_class', 'ENUM', '["MIKRO","KIS","KÖZEPES","NAGY"]'::jsonb, 'DERIVED', 'DISALLOW'),
      ('public_interest_entity', 'public_interest_entity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('customer_types', 'customer_types', 'MULTI_ENUM', '["Vállalkozások (B2B)","Fogyasztók (B2C)","Közszféra","Kapcsolt vállalkozások","Egyéb"]'::jsonb, 'USER_PROVIDED', 'ALLOW'),
      ('b2c_sales', 'b2c_sales', 'BOOLEAN', NULL::jsonb, 'DERIVED', 'DISALLOW'),
      ('distance_sales', 'distance_sales', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('off_premises_sales', 'off_premises_sales', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('ecommerce_site', 'ecommerce_site', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('digital_service_provider', 'digital_service_provider', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('online_intermediary_service', 'online_intermediary_service', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('public_sector_customer', 'public_sector_customer', 'BOOLEAN', NULL::jsonb, 'DERIVED', 'DISALLOW'),
      ('public_procurement_activity', 'public_procurement_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('cross_border_eu_sales', 'cross_border_eu_sales', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('export_outside_eu', 'export_outside_eu', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('import_into_eu', 'import_into_eu', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('personal_data_processing', 'personal_data_processing', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('special_category_data', 'special_category_data', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('criminal_data', 'criminal_data', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('children_data', 'children_data', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('employee_monitoring', 'employee_monitoring', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('cctv_monitoring', 'cctv_monitoring', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('systematic_monitoring', 'systematic_monitoring', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('large_scale_processing', 'large_scale_processing', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('third_country_data_transfer', 'third_country_data_transfer', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('processor_for_clients', 'processor_for_clients', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('direct_marketing', 'direct_marketing', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('critical_it_dependency', 'critical_it_dependency', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('cloud_or_saas_use', 'cloud_or_saas_use', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('managed_it_service_provider', 'managed_it_service_provider', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('data_center_or_cloud_provider', 'data_center_or_cloud_provider', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('nis2_sector', 'nis2_sector', 'ENUM', '["ENERGIA","KÖZLEKEDÉS","BANK","PÉNZÜGYI PIACI INFRASTRUKTÚRA","EGÉSZSÉGÜGY","IVÓVÍZ","SZENNYVÍZ","DIGITÁLIS INFRASTRUKTÚRA","IKT-SZOLGÁLTATÁSMENEDZSMENT","KÖZIGAZGATÁS","ŰR","POSTAI ÉS FUTÁRSZOLGÁLTATÁS","HULLADÉKGAZDÁLKODÁS","VEGYI ANYAGOK","ÉLELMISZER","GYÁRTÁS","DIGITÁLIS SZOLGÁLTATÁSOK","KUTATÁS"]'::jsonb, 'LEGAL_CLASSIFICATION_REQUIRED', 'DISALLOW'),
      ('ai_use', 'ai_use', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('ai_role', 'ai_role', 'MULTI_ENUM', '["Fejlesztő/szolgáltató","Üzembe helyező/felhasználó","Importőr","Forgalmazó","MI-t tartalmazó termék gyártója","Nem tudom"]'::jsonb, 'USER_PROVIDED', 'ALLOW'),
      ('ai_high_risk_context', 'ai_high_risk_context', 'MULTI_ENUM', '["Toborzás/HR","Hitelképesség/árképzés","Biometria","Egészségügy","Oktatás","Alapvető szolgáltatáshoz hozzáférés","Biztonsági funkció","Egyéb","Nem tudom"]'::jsonb, 'USER_PROVIDED', 'ALLOW'),
      ('ai_customer_facing', 'ai_customer_facing', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('has_employees', 'has_employees', 'BOOLEAN', NULL::jsonb, 'DERIVED', 'DISALLOW'),
      ('temporary_agency_work', 'temporary_agency_work', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('posted_workers', 'posted_workers', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('whistle_special_sector', 'whistle_special_sector', 'BOOLEAN', NULL::jsonb, 'LEGAL_CLASSIFICATION_REQUIRED', 'DISALLOW'),
      ('financial_service_activity', 'financial_service_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('payment_service_activity', 'payment_service_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('investment_service_activity', 'investment_service_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('insurance_activity', 'insurance_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('crypto_asset_activity', 'crypto_asset_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('aml_obliged_entity', 'aml_obliged_entity', 'BOOLEAN', NULL::jsonb, 'LEGAL_CLASSIFICATION_REQUIRED', 'DISALLOW'),
      ('sanctions_exposure', 'sanctions_exposure', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('product_market_role', 'product_market_role', 'MULTI_ENUM', '["Gyártó","Importőr","Forgalmazó","Meghatalmazott képviselő","Nincs"]'::jsonb, 'USER_PROVIDED', 'ALLOW'),
      ('consumer_products', 'consumer_products', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('machinery_activity', 'machinery_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('electrical_electronic_equipment', 'electrical_electronic_equipment', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('battery_activity', 'battery_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('packaging_activity', 'packaging_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('epr_product_category', 'epr_product_category', 'MULTI_ENUM', '["Csomagolás","Elektromos/elektronikus berendezés","Elem/akkumulátor","Gépjármű","Gumiabroncs","Irodai/reklámhordozó papír","Sütőolaj/zsír","Textil","Fa bútor","Egyéb","Nem tudom"]'::jsonb, 'USER_PROVIDED', 'ALLOW'),
      ('waste_generation', 'waste_generation', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('hazardous_waste', 'hazardous_waste', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('chemical_substances', 'chemical_substances', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('hazardous_chemicals', 'hazardous_chemicals', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('industrial_installation', 'industrial_installation', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('eu_ets_activity', 'eu_ets_activity', 'BOOLEAN', NULL::jsonb, 'LEGAL_CLASSIFICATION_REQUIRED', 'DISALLOW'),
      ('water_use_or_discharge', 'water_use_or_discharge', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('high_energy_use', 'high_energy_use', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('cbam_imports', 'cbam_imports', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('eudr_commodities', 'eudr_commodities', 'MULTI_ENUM', '["Szarvasmarha","Kakaó","Kávé","Olajpálma","Gumi","Szója","Fa","Egyik sem","Nem tudom"]'::jsonb, 'USER_PROVIDED', 'ALLOW'),
      ('food_business', 'food_business', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('healthcare_provider', 'healthcare_provider', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('medical_device_role', 'medical_device_role', 'MULTI_ENUM', '["Gyártó","Importőr","Forgalmazó","Egészségügyi intézmény","Nincs"]'::jsonb, 'USER_PROVIDED', 'ALLOW'),
      ('construction_activity', 'construction_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('energy_sector_activity', 'energy_sector_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('regulated_or_licensed_activity', 'regulated_or_licensed_activity', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW'),
      ('dual_use_goods_or_technology', 'dual_use_goods_or_technology', 'BOOLEAN', NULL::jsonb, 'USER_PROVIDED', 'DISALLOW')
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
