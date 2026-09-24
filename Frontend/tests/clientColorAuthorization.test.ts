import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Targeted repair for #374: the direct tile color-edit control must mirror the
// backend client-identity manage gate (CLIENT_IDENTITY_MANAGER_ROLES =
// ADMIN | PARTNER in Backend/src/modules/clients/routes.ts). GET /clients may
// return case-scoped clients to non-managers, but PATCH /clients/:clientId is
// manager-only, so the mutation control must be omitted for everyone else.
const source = readFileSync("src/app/clients/page.tsx", "utf8");

// Independent mirror of the canonical rule the page must implement. The page
// source is additionally pinned below so this mirror cannot silently drift.
function canonicalManager(role?: string | null): boolean {
  const normalized = String(role || "").toUpperCase();
  return normalized === "ADMIN" || normalized === "PARTNER";
}

test("color edit resolves the role from the canonical current-user API, not session caches", () => {
  assert.match(source, /getCurrentUser\(\)/);
  assert.match(source, /import \{[^}]*getCurrentUser[^}]*\} from "@\/lib\/api"/);
  assert.doesNotMatch(source, /sessionStorage/);
  assert.doesNotMatch(source, /adminiculum_auth_profile/);
});

test("role predicate mirrors the backend ADMIN/PARTNER gate with uppercase normalization", () => {
  assert.match(source, /function isClientIdentityManager\(role\?: string \| null\): boolean \{/);
  assert.match(source, /String\(role \|\| ""\)\.toUpperCase\(\)/);
  assert.match(source, /normalized === "ADMIN" \|\| normalized === "PARTNER"/);
  // Backend parity is documented at the definition site.
  assert.match(source, /CLIENT_IDENTITY_MANAGER_ROLES/);
});

test("A/B: ADMIN and PARTNER are recognized as client identity managers", () => {
  for (const role of ["ADMIN", "PARTNER", "admin", "partner"]) {
    assert.equal(canonicalManager(role), true, `${role} must manage client identity`);
  }
});

test("C/D: LAWYER, TRAINEE, LEGAL_ASSISTANT and unknown roles are not managers", () => {
  for (const role of ["LAWYER", "TRAINEE", "LEGAL_ASSISTANT", "ASSISTANT", "COLLABORATOR", "CLIENT", "lawyer", ""]) {
    assert.equal(canonicalManager(role), false, `${role || "<empty>"} must NOT manage client identity`);
  }
  assert.equal(canonicalManager(null), false);
  assert.equal(canonicalManager(undefined), false);
});

test("E: role resolution failure fails closed", () => {
  assert.match(source, /const \[canManageClientIdentity, setCanManageClientIdentity\] = useState\(false\)/);
  assert.match(source, /\.catch\(\(\) => \{\s*if \(active\) setCanManageClientIdentity\(false\);/);
});

test("mutation control is conditionally omitted, never disabled or advertised", () => {
  assert.match(source, /\{canManageClientIdentity \? \(\s*<IconButton/);
  // No disabled replacement button and no tooltip advertising the capability.
  assert.doesNotMatch(source, /Ügyfélszín módosítása[\s\S]{0,400}disabled=/);
  assert.doesNotMatch(source, /title=\{canManageClientIdentity/);
});

test("color modal entry and PATCH are additionally guarded for non-managers", () => {
  assert.match(source, /const handleOpenColorModal = \(client: Client\) => \{\s*if \(!canManageClientIdentity\) return;/);
  assert.match(source, /if \(!colorModalClient \|\| !canManageClientIdentity\) return;/);
});

test("the role gate does not remove read-only tile identity content", () => {
  const tileStart = source.indexOf("const renderClientTile");
  const tile = source.slice(tileStart, source.indexOf("\n  return (", tileStart));
  assert.match(tile, /\$\{color\.borderClass\}/);
  assert.match(tile, /client\.name/);
  assert.match(tile, /href=\{`\/clients\/\$\{client\.id\}`\}/);
  assert.match(tile, /href=\{`\/cases\?newCase=1&clientId=\$\{encodeURIComponent\(client\.id\)\}`\}/);
});
