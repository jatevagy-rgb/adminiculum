import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Workgroup write-capability presentation vs canonical backend authorization.
 *
 * #332 gates every workgroup/workload WRITE endpoint on the canonical
 * client-manager rule (ADMIN/PARTNER) after resolving ownership from the
 * persisted ClientWorkgroup row. The browser-auth workgroups surface therefore
 * must not present create/edit/delete/workload-recording affordances to roles
 * the backend now canonically forbids. Reading stays available to anyone with
 * legitimate client read access.
 */

const root = process.cwd();
const content = () =>
  readFileSync(path.join(root, 'src/app/clients/[clientId]/workgroups/WorkgroupsPageContent.tsx'), 'utf8');

describe('workgroup write capability presentation', () => {
  it('resolves the actor role and applies the canonical ADMIN/PARTNER manager rule', () => {
    const src = content();

    assert.match(src, /const \[canManageWorkgroups, setCanManageWorkgroups\] = useState\(false\);/);
    assert.match(src, /getCurrentUser\(\)/, 'the surface must resolve the canonical current user');
    assert.match(src, /\['ADMIN', 'PARTNER'\]\.includes\(user\.role\)/, 'the rule must mirror the backend manager rule');
  });

  it('fails closed when the actor role cannot be resolved', () => {
    const src = content();

    assert.match(
      src,
      /\.catch\(\(\) => \{\s*if \(active\) setCanManageWorkgroups\(false\);\s*\}\)/,
      'an unresolvable actor must not be granted write capability',
    );
  });

  it('gates every write affordance: create, edit/delete and workload recording', () => {
    const src = content();

    assert.equal(
      (src.match(/\{canManageWorkgroups && \(/g) || []).length,
      3,
      'the create, edit/delete and record-workload affordances must each be gated',
    );
    assert.match(src, /canManageWorkgroups && \(\s*<button[\s\S]{0,220}\+ Új/);
    assert.match(src, /canManageWorkgroups && \([\s\S]{0,700}\+ Terhelés rögzítése/);

    // The mutation modals themselves cannot be opened by a non-manager.
    assert.match(src, /\{showWorkgroupModal && canManageWorkgroups && \(/);
    assert.match(src, /\{showWorkloadModal && selectedWorkgroup && canManageWorkgroups && \(/);
  });

  it('keeps read-only workgroup, workload and summary visibility for non-managers', () => {
    const src = content();

    for (const api of ['getClientWorkgroups(', 'getWorkgroupWorkload(', 'getClientWorkloadSummary(']) {
      assert.ok(src.includes(api), `expected ${api} to remain available for read-only roles`);
    }
    assert.match(src, /Munkacsoportok/, 'the workgroup list must stay visible');
    assert.match(src, /Összesített terhelés/, 'the workload summary must stay visible');
  });

  it('does not weaken or duplicate backend authorization in the browser', () => {
    const src = content();

    // Presentation only: no role claim is attached to requests, and no alternate
    // authorization path is invented client-side.
    assert.doesNotMatch(src, /localStorage[\s\S]{0,40}role/);
    assert.doesNotMatch(src, /Bearer /);
    assert.doesNotMatch(src, /x-actor-role/i);
  });
});
