import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('internal portal-admin UI', () => {
  const api = () => read('src/lib/clientPortalAdminApi.ts');
  const page = () => read('src/app/client-portal-admin/page.tsx');
  const caseGrant = () => read('src/components/documents/publication/CasePortalIdentityGrant.tsx');
  const publicationApi = () => read('src/lib/clientPublicationApi.ts');
  const publicationPanel = () => read('src/components/documents/publication/ClientPublicationPanel.tsx');
  const interactionApi = () => read('src/lib/clientInteractionApi.ts');
  const portalShell = () => read('src/components/client-portal/ClientPortalShell.tsx');
  const matterWorkspace = () => read('src/components/client-portal/MatterWorkspace.tsx');
  const customerCard = () => read('src/components/client-portal/CustomerInteractionCard.tsx');
  const orgViews = () => read('src/components/client-portal/OrganizationPortalViews.tsx');

  it('defines the admin page route', () => {
    assert.equal(existsSync(path.join(root, 'src/app/client-portal-admin/page.tsx')), true);
  });

  it('api client targets the identity-based admin endpoints only', () => {
    const src = api();
    assert.match(src, /\/client-identity\/admin\/membership-requests/);
    assert.match(src, /\/client-identity\/admin\/memberships/);
    assert.match(src, /\/client-identity\/admin\/grants/);
    // Grant payload is membership/case/permissions/validity — no clientUserId.
    assert.match(src, /membershipId/);
    assert.match(src, /permissions/);
    assert.match(src, /validUntil/);
    // no clientUserId property is ever sent on the identity grant path
    assert.doesNotMatch(src, /clientUserId\s*[:=]/);
  });

  it('page wires approve, reject and identity grant', () => {
    const src = page();
    assert.match(src, /approveMembershipRequest/);
    assert.match(src, /rejectMembershipRequest/);
    assert.match(src, /createIdentityGrant/);
    // Guided assignment flow: choose existing-vs-new client, no dead-end.
    assert.match(src, /Meglévő ügyfélhez rendelem/);
    assert.match(src, /Új ügyfelet hozok létre/);
    assert.match(src, /assignmentMode/);
    assert.match(src, /newClientInput/);
    // Customer surface is auto-selected or created inline (no forced pre-created workspace).
    assert.match(src, /createWorkspaceInput/);
    assert.match(src, /surface-auto|surface-create/);
    // Portal role and organizational-unit role are presented separately.
    assert.match(src, /Portálon belüli szerep/);
    assert.match(src, /Szervezeti egységen belüli szerep/);
    // Confirmation summary states no automatic case access.
    assert.match(src, /Ügyhozzáférés nem kerül automatikusan létrehozásra/);
    assert.match(src, /membership-request-row/);
    assert.match(src, /active-membership-row/);
    assert.match(src, /create-grant-btn/);
    // approval passes the request revision (optimistic concurrency).
    assert.match(src, /revision: r\.revision/);
    // no legacy clientUserId grant path in the admin surface.
    assert.doesNotMatch(src, /clientUserId/);
    // no raw status enum in the primary card.
    assert.match(src, /Jóváhagyásra vár/);
    // caseId is guarded before .slice — invitation notifications and other rows
    // can have a null caseId and must not crash the interaction/grant render.
    assert.doesNotMatch(src, /ügy: \{item\.caseId\.slice/);
    assert.doesNotMatch(src, /font-mono">\{g\.caseId\.slice/);
    assert.match(src, /item\.caseId \? /);
    assert.match(src, /g\.caseId \? /);
  });

  it('productizes workspace administration as client-first portal activation', () => {
    const src = page();
    for (const marker of [
      'activation-wizard',
      'Ügyfélportál aktiválása',
      'Ügyfél kiválasztása',
      'activation-new-client-form',
      'Milyen ügyfél?',
      'Együttműködés módja',
      'Portálon keresztül',
      'Elsősorban e-mailben',
      'Kapcsolt rendszer',
      'Ügyhozzáférés nem jön létre automatikusan',
      'client-centric-portal-list',
      'Aktív ügyfélportálok',
      'Archiváltak',
      'client-portal-detail',
      'Áttekintés',
      'Felhasználók',
      'Szervezeti egységek',
      'Ügyhozzáférések',
      'Vezetői rálátás',
      'Beállítások',
      'Audit',
      'Technikai adatok / Audit',
      'Meghívás elküldve',
      'Meghívás lejárt',
      'Jóváhagyásra vár',
    ]) assert.match(src, new RegExp(marker));
    assert.match(src, /\+ Új ügyfél létrehozása/);
    assert.match(src, /modeFromActivation/);
    assert.match(src, /relationship === "CONNECTED_SYSTEM" \? "CASE_RELAY" : "ORGANIZATION"/);
    assert.match(src, /if \(relationship === "EMAIL_CENTRIC"\) return "EMAIL_LINKED"/);
    assert.match(src, /createClient\(\{/);
    assert.match(src, /updateClient\(targetClient\.id,\s*\{\s*portalAccessEnabled: true/);
    assert.match(src, /createAdminWorkspace/);
    assert.match(src, /transitionAdminWorkspace\(workspace\.id, "activate"/);
    assert.match(src, /createWorkspaceUnit/);
    assert.match(src, /activationFromWorkspace/);
    assert.match(src, /workspace\.mode === "INDIVIDUAL" \? "INDIVIDUAL" : "ORGANIZATION"/);
    assert.match(src, /activation-role-\$\{customerType\}-\$\{option\.value\}/);
    assert.match(src, /workspace\.mode === "INDIVIDUAL"[\s\S]*Meghatalmazott \/ kapcsolattartó/);
    assert.match(src, /Szervezeti adminisztrátor \/ kapcsolattartó/);
    assert.doesNotMatch(src, /<option value="APPROVER">/);
    assert.match(src, /Haladó szervezeti eszközök és audit/);
    assert.match(src, /permissionLabel\(p\)/);
    assert.match(src, /permissionLabel\(permission\)/);
    assert.match(src, /permissionList\(g\.permissions\)/);
    assert.doesNotMatch(src, />\{p\}<\/button>/);
    assert.doesNotMatch(src, />\{permission\}<\/button>/);
  });

  it('shows a bounded workforce admin loading error with retry', () => {
    const src = page();
    assert.match(src, /client-portal-admin-load-error/);
    assert.match(src, /Az ügyfélportál-kezelő adatai nem tölthetők be\./);
    assert.match(src, /Újrapróbálás/);
    assert.match(src, /loadError \? null :/);
    assert.doesNotMatch(src, /Invalid token|Bearer|stack/i);
  });

  it('defines explicit customer and workforce interaction API boundaries', () => {
    const src = interactionApi();
    assert.match(src, /customerInteractionApi/);
    assert.match(src, /workforceInteractionApi/);
    assert.match(src, /authContext: "customer"/);
    assert.match(src, /authContext: "workforce"/);
    assert.match(src, /\/client-interaction\/cases/);
    assert.match(src, /\/internal\/client-interaction\/requests/);
    assert.match(src, /completeRequest/);
    assert.doesNotMatch(src, /Invalid token/);
  });

  it('customer portal matter view renders client interaction foundation', () => {
    const src = portalShell() + matterWorkspace() + customerCard() + orgViews();
    assert.match(src, /CustomerInteractionCard/);
    assert.match(src, /Kommunikáció/);
    assert.match(src, /customerInteractionApi\.createQuestion/);
    assert.match(src, /customerInteractionApi\.submitAnswers/);
    assert.match(src, /customerInteractionApi\.uploadFile/);
    assert.match(src, /customerInteractionApi\.submitSubmission/);
    assert.match(src, /Mire várunk\?/);
    assert.match(src, /Most itt tartunk/);
    assert.match(src, /caseId=\{matter\.caseId\}/);
  });

  it('customer shell exposes coherent customer routes without workforce navigation', () => {
    const shell = portalShell();
    assert.match(shell, /'\/portal\/ugyeim'/);
    assert.match(shell, /'\/portal\/teendoim'/);
    assert.match(shell, /'\/portal\/dokumentumok'/);
    assert.match(shell, /'\/portal\/uzenetek'/);
    assert.match(shell, /Amit most érdemes elintézni/);
    assert.match(shell, /Kérdések és válaszok/);
    assert.match(shell, /'Szerződések', '\/portal\/szerzodesek'/);
    assert.match(shell, /'Vállalat', '\/portal\/vallalat'/);
    assert.match(shell, /OrgHomeView/);
    assert.match(read('src/lib/clientPortalApi.ts'), /intakes\?: boolean/);
    assert.match(read('src/lib/clientPortalApi.ts'), /leadership\?: boolean/);
    assert.doesNotMatch(shell, /Belső munkapad|Review sor|Munkaórák/);
  });

  it('uses the customer-safe workspace aggregate for documents, actions and questions', () => {
    const source = portalShell() + read('src/lib/clientPortalApi.ts');
    assert.match(source, /getPortalWorkspace/);
    assert.match(source, /Most intézendő/);
    assert.match(source, /Közelgő/);
    assert.match(source, /Befejezett/);
    assert.match(source, /Megosztott dokumentumok és kérések/);
    assert.match(source, /Itt csak az Ön kérdései/);
    assert.doesNotMatch(source, /storageProvider|quarantineStorageReference|scanProvider|scanCodeSafe/);
  });

  it('presents the configured relationship mode without a customer mode selector', () => {
    const source = portalShell() + read('src/lib/clientPortalApi.ts') + read('../Backend/src/modules/client-publication/publicationService.ts');
    assert.match(source, /relationshipMode/);
    assert.match(source, /Az e-mail továbbra is az elsődleges/);
    assert.match(source, /nem indít automatikus szinkronizációt/);
    assert.doesNotMatch(portalShell(), /Válasszon működési módot/);
  });

  it('case-level identity grant is available and identity-based', () => {
    const src = caseGrant();
    assert.match(src, /createIdentityGrant/);
    assert.match(src, /case-identity-grant/);
    assert.doesNotMatch(src, /clientUserId\s*[:=]/);
  });

  it('embeds canonical request creation and review workflows in the Case portal panel', () => {
    const source = publicationPanel();
    assert.match(source, /ClientRequestComposer/);
    assert.match(source, /ClientInteractionInternalActions/);
    assert.match(source, /workforceInteractionApi\.listQuestions/);
    assert.match(source, /workforceInteractionApi\.listSubmissions/);
    assert.match(source, /A tervezet rejtve marad/);
  });

  it('exposes workforce-only operational grant observability', () => {
    const api = publicationApi();
    const panel = publicationPanel();
    assert.match(api, /validFrom: string \| null/);
    assert.match(api, /createdAt: string/);
    assert.match(api, /updatedAt: string/);
    assert.match(api, /revokedAt: string \| null/);
    assert.match(api, /grantId: string \| null/);
    assert.match(panel, /Ügyfélhozzáférés/);
    assert.match(panel, /Grant ID/);
    assert.match(panel, /grant\.revision/);
    assert.match(panel, /permissionList\(grant\.permissions\)/);
    assert.match(panel, /grant\.revokedAt/);
    assert.match(panel, /grant-lifecycle-history/);
    assert.match(panel, /transitionClientPortalGrant\(grant\.id/);
    assert.doesNotMatch(panel, /localStorage|getAuthToken|Authorization/);
  });

  it('renders exact operational metadata only in the workforce grant list', () => {
    const src = page();
    const apiSrc = api();
    assert.match(apiSrc, /createdAt: string/);
    assert.match(apiSrc, /updatedAt: string/);
    assert.match(apiSrc, /revokedAt: string \| null/);
    assert.match(apiSrc, /lifecycleEvents/);
    assert.match(src, /Grant ID/);
    assert.match(src, /\{g\.id\}/);
    assert.doesNotMatch(src, /g\.id\.slice/);
    assert.match(src, /g\.revision/);
    assert.match(src, /grant-lifecycle-\$\{g\.id\}/);
    assert.doesNotMatch(src, /Authorization|Bearer|localStorage|getAuthToken/);
  });

  it('is registered in internal navigation', () => {
    const sidebar = read('src/components/Sidebar.tsx');
    assert.match(sidebar, /"client-portal-admin": "\/client-portal-admin"/);
    assert.match(sidebar, /client-portal-admin/);
    const nav = read('src/lib/mockData.ts');
    assert.match(nav, /id: 'client-portal-admin'/);
  });
});
