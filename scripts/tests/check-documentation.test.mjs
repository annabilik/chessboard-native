import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractCatalogRouteNames,
  extractInlineCodeValues,
  extractMarkdownLinkDestinations,
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
const piecesForgottenExports = [
  'MoveSource',
  'PieceData',
  'PieceRenderer',
  'PieceRendererProps',
  'PieceRenderers',
  'PieceType',
  'PieceVisualState',
  'SquareId',
]
  .map(
    (symbol) =>
      `// Warning: (ae-forgotten-export) The symbol "${symbol}" needs to be exported by the entry point index.d.ts`,
  )
  .join('\n');

function validSnapshot() {
  const guideNames = guidePaths.map((guidePath) => guidePath.split('/').at(-1));
  return {
    apiReference: [
      ...requiredApiReferenceSections.map((section) => `## ${section}`),
      ...requiredApiReferenceSymbols.map((symbol) => `\`${symbol}\``),
      `\`${packageName}\``,
      `\`${packageName}/pieces\``,
      `\`${packageName}/react-chessboard-compat\``,
    ].join('\n'),
    apiReports: {
      compatibility: 'documented',
      pieces: `${piecesForgottenExports}\ndocumented`,
      primary: 'documented',
    },
    catalogSource: "name: 'alpha'\nname: 'beta'\n",
    comparison:
      '[ledger](parity/react-chessboard-5.10.md) react-chessboard@5.10.0',
    docsIndex: guideNames
      .map((guideName) => `[${guideName}](${guideName})`)
      .join('\n'),
    manifest: {
      peerDependencies: { react: '19.2.x', 'react-native': '0.86.x' },
    },
    migration:
      '[ledger](parity/react-chessboard-5.10.md) react-chessboard@5.10.0',
    packageReadme: guidePaths
      .map(
        (guidePath) =>
          `[${guidePath}](https://github.com/example/repository/blob/main/${guidePath})`,
      )
      .join('\n'),
    rootReadme: guidePaths
      .map((guidePath) => `[${guidePath}](./${guidePath})`)
      .join('\n'),
    routeNames: ['alpha', 'beta'],
    supportMatrix: [
      'react 19.2.x',
      'react-native 0.86.x',
      `\`${packageName}\``,
      `\`${packageName}/pieces\``,
      `\`${packageName}/react-chessboard-compat\``,
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

test('extracts actual Markdown destinations and exact inline code values', () => {
  assert.deepEqual(
    extractMarkdownLinkDestinations(
      '[relative](./docs/api-reference.md) [absolute](<https://example.com/a b>) bare.md',
    ),
    ['./docs/api-reference.md', 'https://example.com/a b'],
  );
  assert.deepEqual(
    [...extractInlineCodeValues('`root` and `root/subpath`')],
    ['root', 'root/subpath'],
  );
});

test('accepts complete guides, gallery routes, peers, and API reports', () => {
  assert.deepEqual(validateDocumentationSnapshot(validSnapshot()), {
    documentedReports: 3,
    guideCount: 4,
    routeCount: 2,
  });
});

test('rejects undocumented API members and gallery drift', () => {
  const snapshot = validSnapshot();
  snapshot.apiReports.pieces = '// (undocumented)';
  snapshot.routeNames = ['alpha', 'missing'];

  assert.throws(
    () => validateDocumentationSnapshot(snapshot),
    /gallery catalog routes.*pieces contains undocumented/s,
  );
});

test('rejects a missing public entry-point API report', () => {
  const snapshot = validSnapshot();
  delete snapshot.apiReports.pieces;

  assert.throws(
    () => validateDocumentationSnapshot(snapshot),
    /missing required API reports: pieces/,
  );
});

test('rejects missing package documentation and unreviewed API warnings', () => {
  const missingPackageDocumentation = validSnapshot();
  missingPackageDocumentation.apiReports.primary =
    '// (No @packageDocumentation comment for this package)';
  assert.throws(
    () => validateDocumentationSnapshot(missingPackageDocumentation),
    /primary is missing package documentation/,
  );

  const unreviewedWarning = validSnapshot();
  unreviewedWarning.apiReports.compatibility =
    '// Warning: (ae-forgotten-export) Unexpected';
  assert.throws(
    () => validateDocumentationSnapshot(unreviewedWarning),
    /compatibility forgotten exports do not match the reviewed allowlist/,
  );

  const missingReviewedWarning = validSnapshot();
  missingReviewedWarning.apiReports.pieces = 'documented';
  assert.throws(
    () => validateDocumentationSnapshot(missingReviewedWarning),
    /pieces forgotten exports do not match the reviewed allowlist/,
  );

  const differentDiagnostic = validSnapshot();
  differentDiagnostic.apiReports.primary =
    '// Warning: (ae-internal-missing-underscore)';
  assert.throws(
    () => validateDocumentationSnapshot(differentDiagnostic),
    /primary contains unreviewed API Extractor diagnostics/,
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

test('rejects bare guide filenames that are not Markdown links', () => {
  const snapshot = validSnapshot();
  const guideNames = guidePaths.map((guidePath) => guidePath.split('/').at(-1));
  snapshot.docsIndex = guideNames.join('\n');
  snapshot.rootReadme = guidePaths.join('\n');
  snapshot.packageReadme = guideNames.join('\n');

  assert.throws(
    () => validateDocumentationSnapshot(snapshot),
    /docs\/README\.md does not link api-reference\.md.*README\.md does not link docs\/api-reference\.md.*package README does not link api-reference\.md/s,
  );
});

test('rejects a missing root entry point despite documented subpaths', () => {
  const snapshot = validSnapshot();
  snapshot.apiReference = snapshot.apiReference.replace(
    `\`${packageName}\``,
    'root package entry point',
  );
  snapshot.supportMatrix = snapshot.supportMatrix.replace(
    `\`${packageName}\``,
    'root package entry point',
  );

  assert.throws(
    () => validateDocumentationSnapshot(snapshot),
    /API reference does not contain entry point @vibechess\/chessboard-native.*support matrix does not contain entry point @vibechess\/chessboard-native/s,
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
  snapshot.docsIndex = snapshot.docsIndex.replaceAll('comparison.md', '');
  snapshot.rootReadme = snapshot.rootReadme.replaceAll(
    'docs/support-matrix.md',
    '',
  );
  snapshot.packageReadme = snapshot.packageReadme.replaceAll(
    'migrating-from-react-chessboard.md',
    '',
  );

  assert.throws(
    () => validateDocumentationSnapshot(snapshot),
    /docs\/README\.md does not link comparison\.md.*package README does not link migrating-from-react-chessboard\.md.*README\.md does not link docs\/support-matrix\.md/s,
  );
});
