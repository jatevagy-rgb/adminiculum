import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Organization internal UI (structural)', () => {
  const component = () => read('src/components/clients/ClientOrganization.tsx');
  const api = () => read('src/lib/clientOrganizationApi.ts');

  it('renders Szervezet within the canonical Client detail', () => {
    const page = read('src/app/clients/[clientId]/page.tsx');
    assert.match(page, /ClientOrganization/);
    assert.match(page, /szervezet/);
    assert.match(component(), /Szervezet/);
  });

  it('renders hierarchy, people, person detail and distinct access concepts', () => {
    const src = component();
    for (const label of ['Szervezeti hierarchia', 'Személyek keresése', 'Felelősségek', 'Portál-hozzáférés', 'Felelősségi hiányosságok', 'Vezető:', 'Helyettes:']) {
      assert.match(src, new RegExp(label));
    }
  });

  it('keeps empty, loading and error states', () => {
    const src = component();
    assert.match(src, /betöltése…/);
    assert.match(src, /nem tölthetők be/);
    assert.match(src, /Nincs rögzített adat/);
  });

  it('localizes statuses instead of exposing raw enums/IDs', () => {
    const src = component();
    assert.match(src, /personStatusLabel|responsibilityTypeLabel|contractOwnerStatusLabel|obligationOwnerStatusLabel/);
    assert.doesNotMatch(src, /HR_CONFIDENTIAL\}|portalMembershipId\}|employmentStatus\}/);
  });

  it('calls the internal workforce organization endpoints', () => {
    const src = api() + component();
    for (const token of ['/client-organization/clients/', '/groups', '/persons', '/gaps']) {
      assert.match(src, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('provides a real organization route and safe person edit contract', () => {
    const page = read('src/app/clients/[clientId]/szervezet/page.tsx');
    assert.match(page, /ClientOrganization/);
    assert.match(component(), /updatePerson/);
    assert.match(api(), /method: "PATCH"/);
  });

  it('uses the coherent client workspace projection for facts and cases', () => {
    const src = component();
    assert.match(src, /clientWorkspaceApi\.getOverview/);
    assert.match(src, /Szervezeti adatok/);
    assert.match(src, /Ügyek/);
    assert.match(src, /\/clients\/\$\{encodeURIComponent\(clientId\)\}\/cases/);
    assert.doesNotMatch(src, /grant|workspaceId|permission JSON/i);
  });

  it('keeps the route client-scoped and does not use portal access for workforce auth', () => {
    const backend = read('../Backend/src/modules/client-organization/service.ts');
    assert.match(backend, /assertClientReadAccess\(actor, clientId/);
    assert.match(backend, /assertClientReadAccess\(actor, row\.clientId/);
    assert.doesNotMatch(component(), /portalMembershipId.*authorize|authorize.*portalMembershipId/i);
  });

  it('is registered and type-safe (component exists)', () => {
    assert.equal(existsSync(path.join(root, 'src/components/clients/ClientOrganization.tsx')), true);
    assert.equal(existsSync(path.join(root, 'src/lib/clientOrganizationApi.ts')), true);
  });

  it('exposes full organization editor API foundation methods and contact fields', () => {
    const src = api();
    assert.match(src, /email:\s*string\s*\|\s*null/);
    assert.match(src, /phone:\s*string\s*\|\s*null/);
    assert.match(src, /createGroup\(/);
    assert.match(src, /updateGroup\(/);
    assert.match(src, /createPerson\(/);
    assert.match(src, /updatePerson\(/);
    assert.match(src, /transitionPerson\(/);
    assert.match(src, /CreateOrgGroupInput/);
    assert.match(src, /UpdateOrgGroupInput/);
    assert.match(src, /CreateOrgPersonInput/);
    assert.match(src, /UpdateOrgPersonInput/);
    assert.match(src, /JSON\.stringify\(\{\s*employmentStatus\s*\}\)/);
  });

  it('renders a semantic group and manager tree with manager-only contextual actions', () => {
    const src = component();
    const hierarchy = read('src/lib/organizationHierarchy.ts');
    for (const token of ['Vezetői szint', 'Nincs közvetlen vezető megadva.', 'aria-label="Vezetői kapcsolat"', 'parentGroupId', '+ Kolléga', '+ Alcsoport', 'Szerkesztés']) {
      assert.ok(src.includes(token), `missing organization tree contract: ${token}`);
    }
    assert.match(hierarchy, /managerPersonId/);
    assert.match(src, /canManageOrganization \? <div className="flex gap-2/);
  });

  it('keeps removal lifecycle-based and keeps hierarchy separate from access', () => {
    const editor = read('src/components/clients/OrganizationEditor.tsx');
    assert.match(editor, /transitionPerson\(person\.id, "ENDED"\)/);
    assert.doesNotMatch(editor, /deletePerson|deleteGroup/);
    assert.match(editor, /ügy- vagy dokumentumhozzáférést nem ad/);
    assert.match(editor, /nem ad portál-, ügy- vagy dokumentumhozzáférést/);
  });

  it('invites only through an explicitly selected active organization workspace', () => {
    const editor = read('src/components/clients/OrganizationEditor.tsx');
    assert.match(editor, /workspace\.status === "ACTIVE" && workspace\.mode === "ORGANIZATION"/);
    assert.match(editor, /organizationWorkspaces\.length > 1/);
    assert.match(editor, /PORTAL_WORKSPACE_SELECTION_REQUIRED/);
    assert.match(editor, /inviteAdminWorkspaceMember\(workspaceId/);
    assert.match(editor, /transitionAdminWorkspaceMembership\(portal\.membership\.id, "revoke", portal\.membership\.revision\)/);
  });

  it('keeps the portal-admin lookup optional for read-only organization readers', () => {
    const src = component();
    assert.match(src, /listAdminWorkspaces\(clientId\)\.catch\(\(\) => \(\{ items: \[\] \}\)\)/);
    assert.match(src, /onManagePermissionChanged/);
  });

  it('renders each person once: manager roots are excluded from their group card list and cross-group reports do not recurse', () => {
    const src = component();
    assert.match(src, /organizationGroupStarts\(filteredPersons, group\.id\)/);
    assert.match(src, /organizationReportsInScope\(filteredPersons, person\.id, groupScope\)/);
    assert.match(src, /organizationRootPeople\(filteredPersons\)/);
  });

  it('renders root and nested groups as visible hierarchy nodes', () => {
    const src = component();
    assert.match(src, /rounded-xl border border-\[var\(--adm-border\)\] bg-\[var\(--adm-surface\)\] p-4 shadow-sm/);
    assert.match(src, /border-l-2 border-\[var\(--adm-green-300\)\] pl-5/);
    assert.match(src, /children\.map\(\(child\) => renderGroup\(child, depth \+ 1, nextAncestors\)\)/);
  });

  it('keeps person save and invitation as truthful independent phases', () => {
    const editor = read('src/components/clients/OrganizationEditor.tsx');
    assert.match(editor, /let savedPerson: OrgPersonDTO \| null = null/);
    assert.match(editor, /A személy mentve, de a portálmeghívás nem sikerült/);
    assert.match(editor, /setSelectedId\(savedPerson\.id\); setMode\("person"\); setRetryPersonId\(savedPerson\.id\)/);
  });
});
