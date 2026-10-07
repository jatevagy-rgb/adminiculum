import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import type { PortalGrowOutcome } from '../src/lib/clientPortalApi';

const views = [
  '../src/components/client-portal/OrgGrowView.tsx',
  '../src/components/client-portal-v3/grow/PortalGrowV3.tsx',
];

for (const view of views) {
  test(`${view}: same-title initiatives never cross-associate customer outcomes`, () => {
    const source = readFileSync(new URL(view, import.meta.url), 'utf8');
    const ast = ts.createSourceFile(view, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const initializers: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'relatedOutcomes' && node.initializer) {
        initializers.push(node.initializer.getText(ast));
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    assert.equal(initializers.length, 1, 'exercise the actual initiative-detail outcome selector');
    // Execute the production selector rather than copying its predicate into the test.
    const select = new Function('allOutcomes', 'activeInitiative', `return ${initializers[0]};`) as (
      outcomes: PortalGrowOutcome[], initiative: { id: string; title: string },
    ) => PortalGrowOutcome[];
    const outcome = (id: string, initiativeId: string | null, basis: PortalGrowOutcome['basis']): PortalGrowOutcome => ({
      id, initiativeId, initiativeTitle: 'Same title', basis, basisLabel: basis, processName: null,
    });
    const outcomes = [
      outcome('measured-a', 'initiative-a', 'MEASURED'),
      outcome('calculated-b', 'initiative-b', 'CALCULATED'),
      outcome('estimated-a', 'initiative-a', 'ESTIMATED'),
      outcome('unlinked', null, 'MEASURED'),
    ];

    assert.deepEqual(select(outcomes, { id: 'initiative-a', title: 'Same title' }).map((item) => item.id), ['measured-a', 'estimated-a']);
    assert.deepEqual(select(outcomes, { id: 'initiative-b', title: 'Same title' }).map((item) => item.id), ['calculated-b']);
    assert.deepEqual(select(outcomes, { id: 'initiative-c', title: 'Same title' }), []);
    assert.deepEqual(select(outcomes, { id: 'initiative-a', title: 'Renamed initiative' }).map((item) => item.id), ['measured-a', 'estimated-a']);
    assert.deepEqual(select([], { id: 'initiative-a', title: 'Same title' }), []);
  });
}
