-- CP1 organizational workspaces may each have their own HR/Finance/etc. units.
-- The previous client-wide uniqueness blocked separate customer surfaces for
-- the same Client from using the same business unit names.
DROP INDEX IF EXISTS "client_organization_groups_clientId_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "client_organization_groups_clientId_workspaceId_name_key"
  ON "client_organization_groups"("clientId", "workspaceId", "name");
