import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export const requiredGuidePaths = Object.freeze([
  'docs/api-reference.md',
  'docs/comparison.md',
  'docs/migrating-from-react-chessboard.md',
  'docs/support-matrix.md',
]);

export const requiredApiReferenceSections = Object.freeze([
  'Entry points',
  '`Chessboard`',
  'Controlled value tiers',
  'Move requests and observations',
  'Providers and spare pieces',
  'Visual contracts',
  'Accessibility',
  'Pure helpers',
  'Errors',
  'Compatibility entry point',
]);

export const requiredApiReferenceSymbols = Object.freeze([
  'Chessboard',
  'ChessboardProvider',
  'ChessboardProviderProps',
  'SparePieceProps',
  'PositionProp',
  'ControlledPosition',
  'SelectionProp',
  'AnnotationsProp',
  'ControlledAnnotations',
  'MoveIntent',
  'MoveDecision',
  'applyAnnotationOperation',
  'findMatchingAnnotationIds',
  'ChessboardTheme',
  'ChessboardStyles',
  'SquareStyles',
  'SquareRenderer',
  'PieceRenderer',
  'defaultTheme',
  'defaultAnnotationStyle',
  'defaultPieceRenderers',
  'ChessboardAccessibility',
  'ChessboardError',
  'parseFenPosition',
  'generateBoardGeometry',
  'squareToBoardPoint',
  'ReactChessboardOptions',
]);

const publicImportSpecifiers = Object.freeze([
  '@vibechess/chessboard-native',
  '@vibechess/chessboard-native/pieces',
  '@vibechess/chessboard-native/react-chessboard-compat',
]);

export function extractCatalogRouteNames(source) {
  const names = [];
  const pattern = /\bname:\s*['"]([a-z0-9-]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    names.push(match[1]);
  }
  return names;
}

function collectDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function sameSortedValues(left, right) {
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return (
    leftSorted.length === rightSorted.length &&
    leftSorted.every((value, index) => value === rightSorted[index])
  );
}

function extractSecondLevelHeadings(source) {
  const headings = new Set();
  const pattern = /^##[ \t]+(.+?)[ \t]*$/gm;
  for (const match of source.matchAll(pattern)) {
    headings.add(match[1]);
  }
  return headings;
}

export function extractInlineCodeValues(source) {
  const values = new Set();
  const pattern = /`([^`\n]+)`/g;
  for (const match of source.matchAll(pattern)) {
    values.add(match[1]);
  }
  return values;
}

function extractInlineCodeIdentifiers(values) {
  const identifiers = new Set();
  const identifierPattern = /\b[A-Za-z_$][A-Za-z0-9_$]*\b/g;
  for (const value of values) {
    for (const identifier of value.matchAll(identifierPattern)) {
      identifiers.add(identifier[0]);
    }
  }
  return identifiers;
}

export function extractMarkdownLinkDestinations(source) {
  const destinations = [];
  const pattern =
    /(?<!!)\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)\n]+))(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
  for (const match of source.matchAll(pattern)) {
    destinations.push(match[1] ?? match[2]);
  }
  return destinations;
}

function linkPath(destination) {
  let value = destination;
  try {
    value = new URL(destination).pathname;
  } catch {
    // Relative Markdown destinations are paths rather than absolute URLs.
  }
  const withoutFragment = value.split('#', 1)[0].split('?', 1)[0];
  try {
    return decodeURIComponent(withoutFragment).replace(/^\.\//, '');
  } catch {
    return withoutFragment.replace(/^\.\//, '');
  }
}

function linksTo(destinations, expectedPath) {
  return destinations.some((destination) => {
    const destinationPath = linkPath(destination);
    return (
      destinationPath === expectedPath ||
      destinationPath.endsWith(`/${expectedPath}`)
    );
  });
}

export function validateDocumentationSnapshot({
  apiReference,
  apiReports,
  catalogSource,
  comparison,
  docsIndex,
  manifest,
  migration,
  packageReadme,
  rootReadme,
  routeNames,
  supportMatrix,
}) {
  const failures = [];
  const catalogRouteNames = extractCatalogRouteNames(catalogSource);
  const duplicateCatalogRoutes = collectDuplicates(catalogRouteNames);

  if (duplicateCatalogRoutes.length > 0) {
    failures.push(
      `gallery catalog contains duplicate routes: ${duplicateCatalogRoutes.join(', ')}`,
    );
  }
  if (!sameSortedValues(catalogRouteNames, routeNames)) {
    failures.push(
      `gallery catalog routes (${[...catalogRouteNames].sort().join(', ')}) do not match route files (${[...routeNames].sort().join(', ')})`,
    );
  }

  for (const [reportName, report] of Object.entries(apiReports)) {
    if (report.includes('(undocumented)')) {
      failures.push(`${reportName} contains undocumented public API members`);
    }
  }

  const apiReferenceSections = extractSecondLevelHeadings(apiReference);
  const missingApiReferenceSections = requiredApiReferenceSections.filter(
    (section) => !apiReferenceSections.has(section),
  );
  if (missingApiReferenceSections.length > 0) {
    failures.push(
      `API reference is missing required sections: ${missingApiReferenceSections.join(', ')}`,
    );
  }

  const apiReferenceInlineCode = extractInlineCodeValues(apiReference);
  const apiReferenceSymbols = extractInlineCodeIdentifiers(
    apiReferenceInlineCode,
  );
  const missingApiReferenceSymbols = requiredApiReferenceSymbols.filter(
    (symbol) => !apiReferenceSymbols.has(symbol),
  );
  if (missingApiReferenceSymbols.length > 0) {
    failures.push(
      `API reference is missing required symbols: ${missingApiReferenceSymbols.join(', ')}`,
    );
  }

  const docsIndexLinks = extractMarkdownLinkDestinations(docsIndex);
  const rootReadmeLinks = extractMarkdownLinkDestinations(rootReadme);
  const packageReadmeLinks = extractMarkdownLinkDestinations(packageReadme);
  for (const guidePath of requiredGuidePaths) {
    const basename = path.basename(guidePath);
    if (!linksTo(docsIndexLinks, basename)) {
      failures.push(`docs/README.md does not link ${basename}`);
    }
    if (!linksTo(rootReadmeLinks, guidePath)) {
      failures.push(`README.md does not link ${guidePath}`);
    }
    if (!linksTo(packageReadmeLinks, guidePath)) {
      failures.push(`package README does not link ${basename}`);
    }
  }

  for (const [peerName, peerRange] of Object.entries(
    manifest.peerDependencies ?? {},
  )) {
    if (
      !supportMatrix.includes(peerName) ||
      !supportMatrix.includes(peerRange)
    ) {
      failures.push(
        `support matrix does not contain peer ${peerName}@${peerRange}`,
      );
    }
  }
  const supportMatrixInlineCode = extractInlineCodeValues(supportMatrix);
  for (const specifier of publicImportSpecifiers) {
    if (!apiReferenceInlineCode.has(specifier)) {
      failures.push(`API reference does not contain entry point ${specifier}`);
    }
    if (!supportMatrixInlineCode.has(specifier)) {
      failures.push(`support matrix does not contain entry point ${specifier}`);
    }
  }

  for (const [documentName, document] of [
    ['comparison', comparison],
    ['migration guide', migration],
  ]) {
    if (!document.includes('react-chessboard@5.10.0')) {
      failures.push(
        `${documentName} does not name the pinned upstream version`,
      );
    }
    if (!document.includes('parity/react-chessboard-5.10.md')) {
      failures.push(
        `${documentName} does not link the exhaustive parity ledger`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`Documentation check failed:\n- ${failures.join('\n- ')}`);
  }

  return Object.freeze({
    documentedReports: Object.keys(apiReports).length,
    guideCount: requiredGuidePaths.length,
    routeCount: routeNames.length,
  });
}

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

export async function checkRepositoryDocumentation() {
  const appDirectory = path.join(repositoryRoot, 'apps/example/app');
  const routeNames = (await readdir(appDirectory, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.tsx') &&
        entry.name !== '_layout.tsx' &&
        entry.name !== 'index.tsx',
    )
    .map((entry) => entry.name.slice(0, -'.tsx'.length));

  const [
    primaryApiReport,
    compatibilityApiReport,
    apiReference,
    catalogSource,
    comparison,
    docsIndex,
    manifestSource,
    migration,
    packageReadme,
    rootReadme,
    supportMatrix,
  ] = await Promise.all([
    read('packages/chessboard-native/etc/chessboard-native.api.md'),
    read(
      'packages/chessboard-native/etc/chessboard-native.react-chessboard-compat.api.md',
    ),
    read('docs/api-reference.md'),
    read('apps/example/src/gallery-routes.ts'),
    read('docs/comparison.md'),
    read('docs/README.md'),
    read('packages/chessboard-native/package.json'),
    read('docs/migrating-from-react-chessboard.md'),
    read('packages/chessboard-native/README.md'),
    read('README.md'),
    read('docs/support-matrix.md'),
  ]);

  return validateDocumentationSnapshot({
    apiReference,
    apiReports: {
      compatibility: compatibilityApiReport,
      primary: primaryApiReport,
    },
    catalogSource,
    comparison,
    docsIndex,
    manifest: JSON.parse(manifestSource),
    migration,
    packageReadme,
    rootReadme,
    routeNames,
    supportMatrix,
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;

if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkRepositoryDocumentation();
    process.stdout.write(
      `Documentation complete: ${String(result.guideCount)} guides, ${String(result.routeCount)} gallery routes, ${String(result.documentedReports)} documented API reports.\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
