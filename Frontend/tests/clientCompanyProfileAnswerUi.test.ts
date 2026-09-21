import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("Organization Customer Company Profile / AnswerState UI", () => {
  const profileSrc = () => read("src/components/client-portal/OrganizationCompanyProfile.tsx");
  const viewsSrc = () => read("src/components/client-portal/OrganizationPortalViews.tsx");
  const apiSrc = () => read("src/lib/clientPortalApi.ts");

  it("exposes canonical Company Profile Discovery & AnswerState API methods and DTOs", () => {
    const api = apiSrc();
    assert.match(api, /export async function getPortalCompanyProfileDiscovery/);
    assert.match(api, /'\/client-portal\/org\/company-profile'/);
    assert.match(api, /export async function answerPortalCompanyProfileQuestion/);
    assert.match(api, /\/client-portal\/org\/company-profile\/questions\//);
    assert.match(api, /export async function answerPortalCompanyProfileScreen/);
    assert.match(api, /\/client-portal\/org\/company-profile\/screens\//);
    assert.match(api, /PortalCompanyProfileDiscovery/);
    assert.match(api, /PortalCompanyProfileQuestion/);
    assert.match(api, /PortalCompanyProfileAnswerPayload/);
    assert.match(api, /status:\s*"ANSWERED"\s*\|\s*"UNKNOWN"/);
  });

  it("loads the canonical adaptive discovery and saves through the grouped screen endpoint", () => {
    const src = profileSrc();
    assert.match(src, /OrganizationCompanyProfile/);
    assert.match(src, /getPortalCompanyProfileDiscovery/);
    assert.match(src, /answerPortalCompanyProfileScreen\(activeScreen\.screenKey, facts\)/);
    assert.match(src, /companyProfileCompletion\(questions, screens\)/);
    // The backend question keys stay the canonical fact bindings of the screen.
    assert.match(src, /facts\[atom\.questionKey\] = payload/);
    // Keys are never hardcoded as string literals or exposed as display labels.
    assert.doesNotMatch(src, /questionKey\s*:\s*"/);
  });

  it("renders one focused question group at a time instead of every question simultaneously", () => {
    const src = profileSrc();
    assert.match(src, /const activeScreen: PortalCompanyProfileScreen \| undefined = screens\[activeIndex\]/);
    assert.match(src, /data-testid="company-profile-screen"/);
    assert.match(src, /activeAtoms\.map\(\(atom\)/);
    // Exactly one screen is rendered; the whole screen list is never mapped into the form.
    assert.doesNotMatch(src, /screens\.map\(\(screen, index\) => \(/);
    assert.doesNotMatch(src, /activeAtoms\.flatMap/);
  });

  it("replaces the anonymous step strip with a grouped, labelled topic list behind progressive disclosure", () => {
    const src = profileSrc();
    // The dense strip of unlabelled pills is gone.
    assert.doesNotMatch(src, /h-2 w-6 rounded-full/);
    assert.doesNotMatch(src, /screens\.map\(\(screen, index\) => \(/);
    // All reachable topics remain selectable, grouped by canonical section title.
    assert.match(src, /const topicGroups = useMemo/);
    assert.match(src, /group\.sectionTitle/);
    assert.match(src, /group\.topics\.map\(\(topic\)/);
    assert.match(src, /topic\.screen\.titleHu/);
    assert.match(src, /data-testid="company-profile-topics"/);
    assert.match(src, /data-testid="company-profile-topic"/);
    assert.match(src, /aria-expanded=\{topicListOpen\}/);
    assert.match(src, /const \[topicListOpen, setTopicListOpen\] = useState\(false\)/);
    // Selecting a topic focuses it and collapses the list again.
    assert.match(src, /const selectTopic = \(index: number\) =>/);
    assert.match(src, /setTopicListOpen\(false\)/);
  });

  it("hides the repeated per-question explanations behind a disclosure", () => {
    const src = profileSrc();
    assert.match(src, /Miért kérdezzük\?/);
    assert.match(src, /<details className="mt-2">/);
    assert.match(src, /<details className="min-w-0">/);
    // Screen-level explanation renders once, not once per question.
    assert.match(src, /activeScreen\.whyHu \? \(/);
  });

  it("preserves the Nem tudom (UNKNOWN) control and the save/continue actions", () => {
    const src = profileSrc();
    assert.match(src, /Nem tudom/);
    assert.match(src, /const markUnknown = async \(question: PortalCompanyProfileQuestion\) =>/);
    assert.match(src, /status: "UNKNOWN"/);
    assert.match(src, /Mentés és tovább →/);
    assert.match(src, /const saveActiveScreen = async \(advance: boolean\) =>/);
    assert.match(src, /← Vissza/);
  });

  it("shows completion context without presenting it as a legal compliance score", () => {
    const src = profileSrc();
    assert.match(src, /Profiladat-kitöltöttség/);
    assert.match(src, /progress\.answered} \/ \{progress\.total/);
    assert.match(src, /Nem jogi megfelelőségi minősítés/);
    assert.doesNotMatch(src, /100% megfelelés/);
    assert.doesNotMatch(src, /megfelelőségi pontszám/);
  });

  it("separates customer profile input from the published company overview", () => {
    const src = profileSrc();
    assert.match(src, /Itt az Ön által megadott profiladatokat rögzítjük/);
    assert.match(src, /közzétett vállalati áttekintést/);
    assert.match(src, /Profiladatok/);
  });

  it("keeps previously saved answers and UNKNOWN state visible next to the control", () => {
    const src = profileSrc();
    assert.match(src, /function draftLabel\(question: PortalCompanyProfileQuestion, draft: DraftValue \| undefined\)/);
    assert.match(src, /Nem ismertként jelölve/);
    assert.match(src, /Nincs megadva/);
    assert.match(src, /\{draft \? <span className="text-xs text-stone-500">\{draftLabel\(atom, draft\)\}<\/span> : null\}/);
  });

  it("renders typed adaptive controls", () => {
    const src = profileSrc();
    assert.match(src, /atom\.valueType === "BOOLEAN"/);
    assert.match(src, /atom\.valueType === "ENUM"/);
    assert.match(src, /atom\.valueType === "DATE"/);
    assert.match(src, /atom\.valueType === "NUMBER"/);
    assert.match(src, /atom\.valueType === "JURISDICTION"/);
    assert.match(src, /atom\.valueType === "MULTI_ENUM"/);
  });

  it("keeps the follow-up evidence journey progressive: collapsed, one control at a time", () => {
    const src = profileSrc();
    assert.match(src, /const \[evidenceOpen, setEvidenceOpen\] = useState\(false\)/);
    assert.match(src, /const \[openEvidenceKey, setOpenEvidenceKey\] = useState<string \| null>\(null\)/);
    assert.match(src, /aria-expanded=\{evidenceOpen\}/);
    assert.match(src, /open=\{openEvidenceKey === item\.controlKey\}/);
    // The three customer-safe answers survive inside the expanded control.
    assert.match(src, /submit\("NO"\)/);
    assert.match(src, /submit\("UNKNOWN"\)/);
    assert.match(src, /setMode\("YES"\)/);
    assert.match(src, /answerPortalCompanyProfileEvidence\(item\.controlKey/);
  });

  it("stays usable on narrow viewports", () => {
    const src = profileSrc();
    // The full-width mobile layout for the progress card and the topic rows.
    assert.match(src, /w-full rounded-2xl border border-\[#eadfbf\] bg-\[#fffdf8\] px-4 py-3 sm:w-auto/);
    assert.match(src, /flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm/);
  });

  it("never exposes a technical question key as a visible label or test marker", () => {
    const src = profileSrc();
    assert.match(src, /return question\.label\?\.trim\(\) \|\| "Szervezeti adat"/);
    assert.doesNotMatch(src, /return question\.label \|\| question\.questionKey/);
    assert.match(src, /data-testid="company-profile-question"/);
    assert.doesNotMatch(src, /data-testid=\{`company-profile-question-\$\{question\.questionKey\}\`\}/);
  });

  it("strictly prohibits internal technical IDs, rule ASTs, and severity scores from leaking", () => {
    const src = profileSrc();
    assert.doesNotMatch(src, /factDefinitionId/);
    assert.doesNotMatch(src, /clientFactId/);
    assert.doesNotMatch(src, /ruleAst|astExpression|operator/i);
    assert.doesNotMatch(src, /internalSeverity|severityScore/i);
    assert.doesNotMatch(src, /workforceOwner|internalReviewer/i);
  });

  it("is designed for arbitrary authorized organization clients (no hardcoded Demo Kft strings/IDs)", () => {
    const src = profileSrc();
    assert.doesNotMatch(src, /Demo Kft/);
    assert.doesNotMatch(src, /DEMO_KFT_/);
    assert.doesNotMatch(src, /Péterfi János/);
  });

  it("is integrated into OrganizationPortalViews under the company view (/portal/vallalat)", () => {
    const views = viewsSrc();
    assert.match(views, /import \{.*OrganizationCompanyProfile.*\} from "\.\/OrganizationCompanyProfile"/);
    assert.match(views, /<OrganizationCompanyProfile onProfileUpdated=\{onProfileUpdated\} \/>/);
    assert.match(views, /view === "company" \? <OrganizationCompany company=\{state\.company\} onProfileUpdated=\{refreshCompany\} \/>/);
    // The profile edit callback must never be the full parent `load`, whose
    // loading=true state unmounts OrganizationCompanyProfile and resets the wizard.
    assert.doesNotMatch(views, /onProfileUpdated=\{load\}/);
  });

  it("counts pending follow-up evidence (never the applicable total) and keeps UNKNOWN seeded", () => {
    const src = profileSrc();
    // The follow-up header is the machine-readable pending count, not the total.
    assert.match(src, /countPendingEvidence\(applicableEvidence\)/);
    assert.match(src, /evidencePendingLabel\(applicableEvidence\.length, pendingEvidenceCount\)/);
    assert.doesNotMatch(src, /\$\{applicableEvidence\.length\} megválaszolandó/);
    // Persisted UNKNOWN is reconstructed when drafts are seeded from discovery.
    assert.match(src, /seedDrafts\(previous, activeAtoms\)/);
    assert.match(src, /import \{ draftToPayload, seedDrafts, type DraftValue \} from "@\/lib\/companyProfileDraft"/);
    const evidenceLib = read("src/lib/companyProfileEvidence.ts");
    assert.match(evidenceLib, /Mind megválaszolva/);
    assert.match(evidenceLib, /megválaszolandó/);
  });

  it("refreshCompany preserves the previously loaded company summary on failure", () => {
    const views = viewsSrc();
    const refresh = views.slice(views.indexOf("const refreshCompany"), views.indexOf("const hasLeadership"));
    assert.match(refresh, /try\s*\{/);
    assert.match(refresh, /getPortalOrganizationCompany\(\)/);
    assert.match(refresh, /catch\s*\{/);
    assert.doesNotMatch(refresh, /\.catch\(\(\) => null\)/);
    assert.doesNotMatch(refresh, /company:\s*null/);
  });
});
