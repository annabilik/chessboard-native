import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractCatalogRouteNames,
  requiredApiReferenceSections,
  requiredApiReferenceSymbols,
  validateDocumentationSnapshot,
} from '../check-documentation.mjs';

const guidePaths = [
  'docs/api-reference.md',
  'docs/comparison.md',
  'docs/migrating-from-react-chessboard.md',
  'docs/support-matrix.md',
];
const packageName = '@vibechess/chessboard-native';

function validSnapshot() {
  const guideNames = guidePaths.map((guidePath) => guidePath.split('/').at(-1));
  return {
    apiReference: [
      ...requiredApiReferenceSections.map((section) => `## ${section}`),
      ...requiredApiReferenceSymbols.map((symbol) => `\`${symbol}\``),
      packageName,
      `${packageName}/pieces`,
      `${packageName}/react-chessboard-compat`,
    ].join('\n'),
    apiReports: { compatibility: 'documented', primary: 'documented' },
    catalogSource: "name: 'alpha'\nname: 'beta'\n",
    comparison:
      '[ledger](parity/react-chessboard-5.10.md) react-chessboard@5.10.0',
    docsIndex: guideNames.join('\n'),
    manifest: {
      peerDependencies: { react: '19.2.x', 'react-native': '0.86.x' },
    },
    migration:
      '[ledger](parity/react-chessboard-5.10.md) react-chessboard@5.10.0',
    packageReadme: guideNames.join('\n'),
    rootReadme: guidePaths.join('\n'),
    routeNames: ['alpha', 'beta'],
    supportMatrix: [
      'react 19.2.x',
      'react-native 0.86.x',
      packageName,
      `${packageName}/pieces`,
      `${packageName}/react-chessboard-compat`,
    ].join('\n'),
  };
}

test('extracts canonical route names from the gallery catalog', () => {
  assert.deepEqual(
    extractCatalogRouteNames(
      "name: 'first-route', title: 'First'\nname: \"second-route\"",
    ),
    ['first-route', 'second-route'],
  );
});

test('accepts complete guides, gallery routes, peers, and API reports', () => {
  assert.deepEqual(validateDocumentationSnapshot(validSnapshot()), {
    documentedReports: 2,
    guideCount: 4,
    routeCount: 2,
  });
});

test('rejects undocumented API members and gallery drift', () => {
  const snapshot = validSnapshot();
  snapshot.apiReports.primary = '// (undocumented)';
  snapshot.routeNames = ['alpha', 'missing'];

  assert.throws(
    () => validateDocumentationSnapshot(snapshot),
    /gallery catalog routes.*primary contains undocumented/s,
  );
});

test('rejects an API reference with a missing required section', () => {
  const snapshot = validSnapshot();
  snapshot.apiReference = snapshot.apiReference.replace(
    '## Errors',
    '## Error handling',
  );

  assert.throws(
    () => validateDocumentationSnapshot(snapshot),
    /missing required sections: Errors/,
  );
});

test('rejects an API reference with a missing public symbol or entry point', () => {
  const snapshot = validSnapshot();
  snapshot.apiReference = snapshot.apiReference
    .replace('`ChessboardError`', 'ChessboardError')
    .replace(`${packageName}/pieces`, 'pieces entry point');

  assert.throws(
    () => validateDocumentationSnapshot(snapshot),
    /missing required symbols: ChessboardError.*does not contain entry point @vibechess\/chessboard-native\/pieces/s,
  );
});

test('rejects duplicate catalog routes and stale support versions', () => {
  const snapshot = validSnapshot();
  snapshot.catalogSource = "name: 'alpha'\nname: 'alpha'\nname: 'beta'";
  snapshot.supportMatrix = snapshot.supportMatrix.replace('19.2.x', '18.x');

  assert.throws(
    () => validateDocumentationSnapshot(snapshot),
    /duplicate routes: alpha.*react@19\.2\.x/s,
  );
});

test('requires every guide to be discoverable from both READMEs and the docs index', () => {
  const snapshot = validSnapshot();
  snapshot.docsIndex = snapshot.docsIndex.replace('comparison.md', '');
  snapshot.rootReadme = snapshot.rootReadme.replace(
    'docs/support-matrix.md',
    '',
  );
  snapshot.packageReadme = snapshot.packageReadme.replace(
    'migrating-from-react-chessboard.md',
    '',
  );

  assert.throws(
    () => validateDocumentationSnapshot(snapshot),
    /docs\/README\.md does not link comparison\.md.*package README does not link migrating-from-react-chessboard\.md.*README\.md does not link docs\/support-matrix\.md/s,
  );
});
