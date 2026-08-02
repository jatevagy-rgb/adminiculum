CREATE OR REPLACE FUNCTION client_portal_validate_grant() RETURNS trigger AS $$
DECLARE expected_client TEXT;
DECLARE user_role TEXT;
BEGIN
  SELECT "clientId" INTO expected_client FROM "cases" WHERE "id" = NEW."caseId";
  IF NEW."clientPortalIdentityId" IS NULL THEN
    SELECT "role"::text INTO user_role FROM "users" WHERE "id" = NEW."clientUserId";
    IF user_role <> 'CLIENT' THEN
      RAISE EXCEPTION 'client portal grant user must be CLIENT role';
    END IF;
  ELSIF NEW."clientUserId" IS NOT NULL THEN
    RAISE EXCEPTION 'identity grant cannot include legacy client user';
  END IF;
  IF expected_client IS NULL OR expected_client <> NEW."clientId" THEN
    RAISE EXCEPTION 'client portal grant case/client mismatch';
  END IF;
  IF NEW."validUntil" IS NOT NULL AND NEW."validUntil" <= NEW."validFrom" THEN
    RAISE EXCEPTION 'client portal grant invalid validity window';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
