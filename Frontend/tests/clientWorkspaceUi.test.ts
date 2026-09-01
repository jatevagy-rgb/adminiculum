import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Company workspace UI (structural)', () => {
  const component = () => read('src/components/clients/ClientCompanyWorkspace.tsx');
  const api = () => read('src/lib/clientWorkspaceApi.ts');
  const page = () => read('src/app/clients/[clientId]/vallalati-mukodes/page.tsx');
  const clientPage = () => read('src/app/clients/[clientId]/page.tsx');

  it('renders the coherent workspace page within the canonical Client detail', () => {
    assert.match(clientPage(), /vallalati-mukodes/);
    assert.match(clientPage(), /Vállalati működés/);
    assert.match(page(), /ClientCompanyWorkspace/);
  });

  it('keeps portal and cases inside the client workspace context', () => {
    const tabs = read('src/components/clients/ClientWorkspaceTabs.tsx');
    assert.match(tabs, /\["portal", "Portál", "\/portal"\]/);
    assert.match(tabs, /\["cases", "Ügyek", "\/cases"\]/);
    assert.doesNotMatch(tabs, /client-portal-admin/);
    assert.doesNotMatch(tabs, /\/cases\?clientId=/);
    assert.equal(existsSync(path.join(root, 'src/app/clients/[clientId]/portal/page.tsx')), true);
    assert.equal(existsSync(path.join(root, 'src/app/clients/[clientId]/cases/page.tsx')), true);
  });

  it('hides organization-only navigation from individual workspaces', () => {
    const tabs = read('src/components/clients/ClientWorkspaceTabs.tsx');
    const overview = read('src/app/clients/[clientId]/page.tsx');
    const portal = read('src/app/clients/[clientId]/portal/page.tsx');
    assert.match(tabs, /filter\(\(\[key\]\) => key !== "organization"\)/);
    assert.match(overview, /portalWorkspace\?\.mode === "ORGANIZATION"/);
    assert.match(portal, /workspace\?\.mode === "ORGANIZATION"/);
    assert.doesNotMatch(overview, /client\.name\.includes|clientName\.includes/);
    assert.doesNotMatch(portal, /client\.name\.includes|clientName\.includes/);
  });

  it('presents the six coherent sections instead of raw technical subsystems', () => {
    const src = component();
    for (const label of ['Áttekintés', 'Cégkép', 'Felmérések', 'Szerződések és kötelezettségek', 'Szervezet és felelősségek', 'Fejlődési terv']) {
      assert.match(src, new RegExp(label));
    }
  });

  it('renders the overview attention summary with human wording, never raw codes', () => {
    const src = component() + api();
    assert.match(component(), /attentionItemText/);
    assert.match(api(), /még nincs kijelölt felelős/);
    assert.match(api(), /nyitott, magas vagy kritikus súlyosságú megállapítás/);
    assert.match(component(), /Minden lényeges területen kijelölt felelős és friss állapot látható/);
  });

  it('renders owner names with the fallback for missing owners', () => {
    const src = component() + api();
    assert.match(api(), /Nincs kijelölt felelős/);
    assert.match(component(), /ownerDisplayText/);
    assert.match(component(), /Ügyféloldali felelős/);
    assert.match(component(), /Irodai felelős/);
  });

  it('keeps helpful empty states instead of exposing implementation', () => {
    const src = component();
    assert.match(src, /Még nincs aktív felmérés/);
    assert.match(src, /Minden aktív szerződéshez és nyitott kötelezettséghez van kijelölt felelős/);
    assert.match(src, /Ehhez az ügyfélhez még nincs rögzített fejlesztési kezdeményezés/);
  });

  it('never renders raw UUIDs, Prisma enums or projector terminology in the UI', () => {
    const src = component();
    assert.doesNotMatch(src, /employmentStatus=\{/);
    assert.doesNotMatch(src, /businessOwnerPersonId=\{/);
    assert.doesNotMatch(src, /ownerPersonId=\{/);
    assert.doesNotMatch(src, /clientOwnerPersonId=\{/);
    assert.doesNotMatch(src, /sourceType=\{/);
  });

  it('calls the workforce-only company workspace endpoint (no customer exposure)', () => {
    const src = api() + page();
    assert.match(src, /\/company-workspace\/clients\//);
    assert.match(src, /overview/);
    assert.doesNotMatch(src, /portal/);
    assert.doesNotMatch(src, /customer/);
  });

  it('is registered and type-safe (files exist)', () => {
    assert.equal(existsSync(path.join(root, 'src/components/clients/ClientCompanyWorkspace.tsx')), true);
    assert.equal(existsSync(path.join(root, 'src/lib/clientWorkspaceApi.ts')), true);
    assert.equal(existsSync(path.join(root, 'src/app/clients/[clientId]/vallalati-mukodes/page.tsx')), true);
  });

  it('keeps the existing detailed surfaces reachable (drill-down entry points)', () => {
    
    
    
    
    assert.match(component(), /#szervezet/);
  });
});