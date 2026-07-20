import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv from 'ajv';
import ts from 'typescript';

import {
  currentGitCommit,
  deriveJestParityResults,
} from './parity-results.mjs';

export const defaultManifestPath = 'fixtures/parity/react-chessboard-5.10.json';

const pinnedTarget = {
  ccBySaLicenseSha256:
    '3f941b3b89cf7b8370ceb83cc76d2120d471b58735d8ca60238a751a48d7f72f',
  commit: 'b74704af988396d3da32a8c1627d95341e1e0061',
  commitTree: 'ce320e6926f680c9880a7a4f5af7e92f7b7e972a',
  fixture: 'fixtures/parity/upstream-b74704a',
  licenseSha256:
    '3081fe03f1fc49022e944ab7854004c8027e92b06f8cdaf177cb0781dcf06ba0',
  package: 'react-chessboard',
  provenanceSha256:
    '813bc7cca1557bb3a8a73b188c85da1416d18ae131c129dc41c47c2d1c615a17',
  repository: 'https://github.com/Clariity/react-chessboard',
  sourceTree: '1a18be85a7cc4af14e21fb575fc594f9a349eb19',
  tag: 'v5.10.0',
  version: '5.10.0',
};

const pinnedDocumentation = 'docs/parity/react-chessboard-5.10.md';

const kindOrder = new Map([
  ['export', 0],
  ['option', 1],
  ['behavior', 2],
]);

const allowedTransitions = new Set([
  'planned:planned',
  'planned:in-progress',
  'planned:implemented',
  'in-progress:in-progress',
  'in-progress:implemented',
  'implemented:implemented',
]);

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function gitObjectDigest(type, content) {
  const header = Buffer.from(`${type} ${content.length}\0`);
  return createHash('sha1').update(header).update(content).digest();
}

async function gitTreeDigest(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) =>
    Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)),
  );
  const encodedEntries = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    let mode;
    let digest;

    if (entry.isDirectory()) {
      mode = '40000';
      digest = await gitTreeDigest(entryPath);
    } else if (entry.isFile()) {
      mode = '100644';
      digest = gitObjectDigest('blob', await readFile(entryPath));
    } else {
      throw new Error(
        `Pinned source tree cannot contain links or special files: ${entryPath}`,
      );
    }

    encodedEntries.push(
      Buffer.concat([Buffer.from(`${mode} ${entry.name}\0`), digest]),
    );
  }

  return gitObjectDigest('tree', Buffer.concat(encodedEntries));
}

function physicalLineCount(source) {
  if (source.length === 0) {
    return 0;
  }

  const newlineCount = source.match(/\n/g)?.length ?? 0;
  return source.endsWith('\n') ? newlineCount : newlineCount + 1;
}

function normalizeExpression(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function sourceFileFor(filePath, source) {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function declarationLine(sourceFile, node) {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function hasExportModifier(node) {
  return node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

function relativePosix(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

function resolveInside(root, relativePath, label) {
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, relativePath);

  if (
    resolved !== absoluteRoot &&
    !resolved.startsWith(`${absoluteRoot}${path.sep}`)
  ) {
    throw new Error(`${label} escapes its allowed root: ${relativePath}`);
  }

  return resolved;
}

async function readJson(filePath) {
  let source;

  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${filePath}: ${error.message}`, {
      cause: error,
    });
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Cannot parse ${filePath}: ${error.message}`, {
      cause: error,
    });
  }
}

function formatSchemaErrors(errors = []) {
  return errors
    .map(
      (error) =>
        `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
    )
    .join('; ');
}

async function validateWithSchema(value, schemaPath, label) {
  const schema = await readJson(schemaPath);
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);

  if (!validate(value)) {
    throw new Error(
      `${label} violates its schema: ${formatSchemaErrors(validate.errors)}`,
    );
  }
}

export async function validateManifestSchema(repositoryRoot, manifest) {
  await validateWithSchema(
    manifest,
    path.join(repositoryRoot, 'fixtures/parity/manifest.schema.json'),
    'parity manifest',
  );
}

async function listFiles(directory) {
  const output = [];

  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        output.push(entryPath);
      } else {
        throw new Error(
          `Parity fixture cannot contain links or special files: ${entryPath}`,
        );
      }
    }
  }

  await visit(directory);
  return output.sort((left, right) => left.localeCompare(right));
}

function collectExportedDeclarations(sourceFile, relativePath) {
  const declarations = [];

  for (const statement of sourceFile.statements) {
    if (!hasExportModifier(statement)) {
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          throw new Error(
            `Unsupported exported binding pattern in ${relativePath}:${declarationLine(sourceFile, declaration)}`,
          );
        }

        declarations.push({
          exportKind: 'runtime',
          line: declarationLine(sourceFile, statement),
          name: declaration.name.text,
          path: relativePath,
        });
      }

      continue;
    }

    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (!statement.name) {
        throw new Error(`Anonymous root export in ${relativePath}`);
      }

      declarations.push({
        exportKind: 'runtime',
        line: declarationLine(sourceFile, statement),
        name: statement.name.text,
        path: relativePath,
      });
      continue;
    }

    if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement)
    ) {
      declarations.push({
        exportKind: 'type',
        line: declarationLine(sourceFile, statement),
        name: statement.name.text,
        path: relativePath,
      });
    }
  }

  return declarations;
}

async function collectRootExports(fixtureRoot) {
  const indexPath = path.join(fixtureRoot, 'src/index.ts');
  const indexSource = await readFile(indexPath, 'utf8');
  const indexFile = sourceFileFor(indexPath, indexSource);
  const exports = [];

  for (const statement of indexFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.exportClause ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteralLike(statement.moduleSpecifier)
    ) {
      continue;
    }

    const specifier = statement.moduleSpecifier.text;

    if (!specifier.startsWith('./') || !specifier.endsWith('.js')) {
      throw new Error(`Unsupported root export specifier: ${specifier}`);
    }

    const base = path.resolve(
      path.dirname(indexPath),
      specifier.slice(0, -'.js'.length),
    );
    const candidates = [`${base}.ts`, `${base}.tsx`];
    let targetPath;

    for (const candidate of candidates) {
      try {
        if ((await stat(candidate)).isFile()) {
          targetPath = candidate;
          break;
        }
      } catch {
        // Try the next supported TypeScript source extension.
      }
    }

    if (!targetPath) {
      throw new Error(`Cannot resolve root export ${specifier}`);
    }

    const targetSource = await readFile(targetPath, 'utf8');
    const targetFile = sourceFileFor(targetPath, targetSource);
    const relativePath = relativePosix(fixtureRoot, targetPath);
    exports.push(...collectExportedDeclarations(targetFile, relativePath));
  }

  return exports.sort((left, right) => left.name.localeCompare(right.name));
}

function bindingName(element) {
  if (element.propertyName && ts.isIdentifier(element.propertyName)) {
    return element.propertyName.text;
  }

  return ts.isIdentifier(element.name) ? element.name.text : undefined;
}

function findOptionDefaults(sourceFile, optionNames) {
  let defaults;

  function visit(node) {
    if (defaults || !ts.isVariableDeclaration(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    if (!ts.isObjectBindingPattern(node.name)) {
      ts.forEachChild(node, visit);
      return;
    }

    const names = node.name.elements.map(bindingName).filter(Boolean);
    const matches = optionNames.every((name) => names.includes(name));

    if (!matches || names.length !== optionNames.length) {
      ts.forEachChild(node, visit);
      return;
    }

    defaults = new Map(
      node.name.elements.map((element) => {
        const name = bindingName(element);
        return [
          name,
          element.initializer
            ? normalizeExpression(element.initializer.getText(sourceFile))
            : undefined,
        ];
      }),
    );
  }

  visit(sourceFile);

  if (!defaults) {
    throw new Error('Cannot find the ChessboardOptions default destructuring');
  }

  return defaults;
}

async function collectOptions(fixtureRoot) {
  const providerPath = path.join(fixtureRoot, 'src/ChessboardProvider.tsx');
  const source = await readFile(providerPath, 'utf8');
  const sourceFile = sourceFileFor(providerPath, source);
  const declaration = sourceFile.statements.find(
    (statement) =>
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === 'ChessboardOptions',
  );

  if (!declaration || !ts.isTypeLiteralNode(declaration.type)) {
    throw new Error('Cannot find the ChessboardOptions type literal');
  }

  const options = declaration.type.members.map((member) => {
    if (
      !ts.isPropertySignature(member) ||
      !member.name ||
      !ts.isIdentifier(member.name) ||
      !member.type
    ) {
      throw new Error(
        `Unsupported ChessboardOptions member at src/ChessboardProvider.tsx:${declarationLine(sourceFile, member)}`,
      );
    }

    const type = normalizeExpression(member.type.getText(sourceFile));

    return {
      callback: ts.isFunctionTypeNode(member.type),
      line: declarationLine(sourceFile, member),
      name: member.name.text,
      path: 'src/ChessboardProvider.tsx',
      renderer: member.name.text === 'squareRenderer',
      style: type.includes('React.CSSProperties'),
      type,
    };
  });
  const defaults = findOptionDefaults(
    sourceFile,
    options.map((option) => option.name),
  );

  return options.map((option) => ({
    ...option,
    defaultExpression: defaults.get(option.name),
  }));
}

function findExportedObject(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer &&
        ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        return declaration.initializer;
      }
    }
  }

  throw new Error(`Cannot find exported object ${name}`);
}

function objectMembers(sourceFile, object) {
  return object.properties.map((property) => {
    if (
      !ts.isPropertyAssignment(property) ||
      (!ts.isIdentifier(property.name) &&
        !ts.isStringLiteralLike(property.name))
    ) {
      throw new Error(
        `Unsupported object member at ${sourceFile.fileName}:${declarationLine(sourceFile, property)}`,
      );
    }

    return {
      expression: normalizeExpression(property.initializer.getText(sourceFile)),
      name: property.name.text,
    };
  });
}

async function collectNestedDefaults(fixtureRoot) {
  const defaultsPath = path.join(fixtureRoot, 'src/defaults.ts');
  const defaultsSource = await readFile(defaultsPath, 'utf8');
  const defaultsFile = sourceFileFor(defaultsPath, defaultsSource);
  const arrowOptionDefaults = objectMembers(
    defaultsFile,
    findExportedObject(defaultsFile, 'defaultArrowOptions'),
  );
  const piecesPath = path.join(fixtureRoot, 'src/pieces.tsx');
  const piecesSource = await readFile(piecesPath, 'utf8');
  const piecesFile = sourceFileFor(piecesPath, piecesSource);
  const defaultPieceRenderers = objectMembers(
    piecesFile,
    findExportedObject(piecesFile, 'defaultPieces'),
  ).map((member) => member.name);

  return { arrowOptionDefaults, defaultPieceRenderers };
}

export async function collectUpstreamInventory(repositoryRoot, manifest) {
  const fixtureRoot = resolveInside(
    repositoryRoot,
    manifest.target.fixture,
    'target.fixture',
  );
  const sourceRoot = path.join(fixtureRoot, 'src');
  const sourcePaths = await listFiles(sourceRoot);
  const sourceFiles = [];

  for (const filePath of sourcePaths) {
    const content = await readFile(filePath);
    const source = content.toString('utf8');
    sourceFiles.push({
      lines: physicalLineCount(source),
      path: relativePosix(fixtureRoot, filePath),
      sha256: sha256(content),
    });
  }

  const license = await readFile(path.join(fixtureRoot, 'LICENSE'));
  const ccBySaLicense = await readFile(
    path.join(fixtureRoot, 'LICENSE.CC-BY-SA-3.0.txt'),
  );
  const provenance = await readFile(path.join(fixtureRoot, 'PROVENANCE.md'));
  const exports = await collectRootExports(fixtureRoot);
  const options = await collectOptions(fixtureRoot);
  const nestedDefaults = await collectNestedDefaults(fixtureRoot);

  return {
    arrowOptionDefaults: nestedDefaults.arrowOptionDefaults,
    ccBySaLicenseSha256: sha256(ccBySaLicense),
    defaultPieceRenderers: nestedDefaults.defaultPieceRenderers,
    exports,
    licenseSha256: sha256(license),
    options,
    provenanceSha256: sha256(provenance),
    sourceFiles,
    sourceLines: sourceFiles.reduce((total, file) => total + file.lines, 0),
    sourceTree: (await gitTreeDigest(sourceRoot)).toString('hex'),
  };
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertUnique(values, label, errors) {
  const seen = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      errors.push(`Duplicate ${label}: ${value}`);
    }
    seen.add(value);
  }
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

function compareExactSet(label, actualValues, expectedValues, errors) {
  const actual = new Set(actualValues);
  const expected = new Set(expectedValues);
  const missing = setDifference(actual, expected);
  const extra = setDifference(expected, actual);

  if (missing.length > 0) {
    errors.push(`${label} missing from manifest: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    errors.push(`${label} not present upstream: ${extra.join(', ')}`);
  }
}

function expectedCount(name, actual, manifest, errors) {
  if (manifest.expectedCounts[name] !== actual) {
    errors.push(
      `expectedCounts.${name} is ${manifest.expectedCounts[name]}, derived ${actual}`,
    );
  }
}

function refKey(reference) {
  return `${reference.path}:${reference.startLine}-${reference.endLine}`;
}

export function documentationAnchor(entry) {
  return entry.id.replaceAll('.', '-');
}

export function validateManifestSemantics(manifest, inventory) {
  const errors = [];

  for (const [key, value] of Object.entries(pinnedTarget)) {
    if (manifest.target[key] !== value) {
      errors.push(`target.${key} must remain pinned to ${value}`);
    }
  }
  if (manifest.documentation !== pinnedDocumentation) {
    errors.push(`documentation must remain pinned to ${pinnedDocumentation}`);
  }

  if (manifest.target.licenseSha256 !== inventory.licenseSha256) {
    errors.push(
      `target.licenseSha256 does not match fixture LICENSE (${inventory.licenseSha256})`,
    );
  }
  if (manifest.target.ccBySaLicenseSha256 !== inventory.ccBySaLicenseSha256) {
    errors.push(
      `target.ccBySaLicenseSha256 does not match fixture CC BY-SA license (${inventory.ccBySaLicenseSha256})`,
    );
  }
  if (manifest.target.provenanceSha256 !== inventory.provenanceSha256) {
    errors.push(
      `target.provenanceSha256 does not match fixture provenance (${inventory.provenanceSha256})`,
    );
  }
  if (manifest.target.sourceTree !== inventory.sourceTree) {
    errors.push(
      `Pinned Git source tree changed: expected ${manifest.target.sourceTree}, found ${inventory.sourceTree}`,
    );
  }

  assertUnique(
    manifest.target.sourceFiles.map((file) => file.path),
    'target source file path',
    errors,
  );
  compareExactSet(
    'Fixture source file',
    inventory.sourceFiles.map((file) => file.path),
    manifest.target.sourceFiles.map((file) => file.path),
    errors,
  );

  const actualFileByPath = new Map(
    inventory.sourceFiles.map((file) => [file.path, file]),
  );
  for (const expected of manifest.target.sourceFiles) {
    const actual = actualFileByPath.get(expected.path);
    if (!actual) {
      continue;
    }
    if (actual.lines !== expected.lines) {
      errors.push(
        `${expected.path} line count changed: expected ${expected.lines}, found ${actual.lines}`,
      );
    }
    if (actual.sha256 !== expected.sha256) {
      errors.push(
        `${expected.path} SHA-256 changed: expected ${expected.sha256}, found ${actual.sha256}`,
      );
    }
  }

  if (
    stableJson(manifest.target.arrowOptionDefaults) !==
    stableJson(inventory.arrowOptionDefaults)
  ) {
    errors.push(
      'target.arrowOptionDefaults does not match defaultArrowOptions',
    );
  }
  if (
    stableJson(manifest.target.defaultPieceRenderers) !==
    stableJson(inventory.defaultPieceRenderers)
  ) {
    errors.push('target.defaultPieceRenderers does not match defaultPieces');
  }

  const exportEntries = manifest.entries.filter(
    (entry) => entry.kind === 'export',
  );
  const optionEntries = manifest.entries.filter(
    (entry) => entry.kind === 'option',
  );
  const behaviorEntries = manifest.entries.filter(
    (entry) => entry.kind === 'behavior',
  );
  const runtimeExports = inventory.exports.filter(
    (entry) => entry.exportKind === 'runtime',
  );
  const typeExports = inventory.exports.filter(
    (entry) => entry.exportKind === 'type',
  );
  const defaultExports = inventory.exports.filter(
    (entry) =>
      entry.path === 'src/defaults.ts' || entry.name === 'defaultPieces',
  );
  const explicitDefaults = inventory.options.filter(
    (option) => option.defaultExpression !== undefined,
  );
  const undefinedDefaults = inventory.options.filter(
    (option) => option.defaultExpression === undefined,
  );
  const callbackOptions = inventory.options.filter((option) => option.callback);
  const styleOptions = inventory.options.filter((option) => option.style);
  const rendererOptions = inventory.options.filter((option) => option.renderer);

  expectedCount('sourceFiles', inventory.sourceFiles.length, manifest, errors);
  expectedCount('sourceLines', inventory.sourceLines, manifest, errors);
  expectedCount('exports', inventory.exports.length, manifest, errors);
  expectedCount('runtimeExports', runtimeExports.length, manifest, errors);
  expectedCount('typeExports', typeExports.length, manifest, errors);
  expectedCount('defaultExports', defaultExports.length, manifest, errors);
  expectedCount('options', inventory.options.length, manifest, errors);
  expectedCount(
    'explicitOptionDefaults',
    explicitDefaults.length,
    manifest,
    errors,
  );
  expectedCount(
    'implicitUndefinedOptionDefaults',
    undefinedDefaults.length,
    manifest,
    errors,
  );
  expectedCount('callbackOptions', callbackOptions.length, manifest, errors);
  expectedCount('styleOptions', styleOptions.length, manifest, errors);
  expectedCount('rendererOptions', rendererOptions.length, manifest, errors);
  expectedCount(
    'arrowOptionFields',
    inventory.arrowOptionDefaults.length,
    manifest,
    errors,
  );
  expectedCount(
    'defaultPieceRenderers',
    inventory.defaultPieceRenderers.length,
    manifest,
    errors,
  );
  expectedCount('behaviors', behaviorEntries.length, manifest, errors);
  expectedCount('entries', manifest.entries.length, manifest, errors);

  compareExactSet(
    'Root export',
    inventory.exports.map((entry) => entry.name),
    exportEntries.map((entry) => entry.upstream.name),
    errors,
  );
  compareExactSet(
    'ChessboardOptions field',
    inventory.options.map((entry) => entry.name),
    optionEntries.map((entry) => entry.upstream.name),
    errors,
  );

  assertUnique(
    manifest.entries.map((entry) => entry.id),
    'entry ID',
    errors,
  );
  assertUnique(
    manifest.entries.map((entry) => entry.contractTestId),
    'contract-test ID',
    errors,
  );
  assertUnique(
    manifest.entries
      .filter(
        (entry) =>
          entry.disposition === 'redesign' || entry.disposition === 'drop',
      )
      .map(documentationAnchor),
    'documentation anchor',
    errors,
  );
  assertUnique(
    manifest.entries.map((entry) => `${entry.kind}:${entry.upstream.name}`),
    'upstream identity',
    errors,
  );

  const sourceFileByPath = new Map(
    inventory.sourceFiles.map((file) => [file.path, file]),
  );
  const upstreamExportByName = new Map(
    inventory.exports.map((entry) => [entry.name, entry]),
  );
  const upstreamOptionByName = new Map(
    inventory.options.map((entry) => [entry.name, entry]),
  );

  for (const entry of manifest.entries) {
    if (!entry.id.startsWith(`${entry.kind}.`)) {
      errors.push(`${entry.id} does not match kind ${entry.kind}`);
    }

    const expectedContractPrefix = `PARITY-${entry.kind.toUpperCase()}-`;
    if (!entry.contractTestId.startsWith(expectedContractPrefix)) {
      errors.push(
        `${entry.id} contract-test ID must start with ${expectedContractPrefix}`,
      );
    }

    if (entry.disposition === 'drop') {
      if (
        entry.native.surface !== 'none' ||
        entry.native.symbols.length !== 0
      ) {
        errors.push(`${entry.id} is dropped but has a native API mapping`);
      }
    } else if (
      entry.native.surface === 'none' ||
      entry.native.symbols.length === 0
    ) {
      errors.push(`${entry.id} must have a native API mapping`);
    }

    if (entry.disposition === 'redesign' || entry.disposition === 'drop') {
      if (!entry.rationale || entry.rationale.trim().length < 20) {
        errors.push(`${entry.id} needs a written redesign/drop rationale`);
      }
      const expectedDocumentation = `${manifest.documentation}#${documentationAnchor(entry)}`;
      if (entry.documentation !== expectedDocumentation) {
        errors.push(
          `${entry.id} documentation must resolve to ${expectedDocumentation}`,
        );
      }
    } else if (entry.rationale || entry.documentation) {
      errors.push(
        `${entry.id} may only carry rationale/documentation for redesign or drop`,
      );
    }

    for (const reference of entry.upstream.references) {
      const sourceFile = sourceFileByPath.get(reference.path);
      if (!sourceFile) {
        errors.push(`${entry.id} references unknown source ${reference.path}`);
        continue;
      }
      if (
        reference.endLine < reference.startLine ||
        reference.endLine > sourceFile.lines
      ) {
        errors.push(
          `${entry.id} has invalid source range ${refKey(reference)}`,
        );
      }
    }

    if (entry.kind === 'export') {
      const upstream = upstreamExportByName.get(entry.upstream.name);
      if (!upstream) {
        continue;
      }
      if (entry.upstream.exportKind !== upstream.exportKind) {
        errors.push(
          `${entry.id} export kind is ${entry.upstream.exportKind}, derived ${upstream.exportKind}`,
        );
      }
      const firstReference = entry.upstream.references[0];
      if (
        firstReference.path !== upstream.path ||
        firstReference.startLine !== upstream.line
      ) {
        errors.push(
          `${entry.id} must begin at ${upstream.path}:${upstream.line}`,
        );
      }
      const shouldBeDefault =
        upstream.path === 'src/defaults.ts' ||
        upstream.name === 'defaultPieces';
      if (entry.facets.includes('default') !== shouldBeDefault) {
        errors.push(`${entry.id} has an incorrect default facet`);
      }
      if (entry.upstream.default) {
        errors.push(`${entry.id} export cannot carry an option default`);
      }
      const expectedMembers =
        upstream.name === 'defaultArrowOptions'
          ? inventory.arrowOptionDefaults
          : upstream.name === 'defaultPieces'
            ? inventory.defaultPieceRenderers.map((name) => ({
                expression: 'renderer',
                name,
              }))
            : undefined;
      if (expectedMembers) {
        if (
          stableJson(entry.upstream.members) !== stableJson(expectedMembers)
        ) {
          errors.push(`${entry.id} members do not match the vendored export`);
        }
      } else if (entry.upstream.members) {
        errors.push(`${entry.id} cannot carry nested members`);
      }
    } else if (entry.kind === 'option') {
      const upstream = upstreamOptionByName.get(entry.upstream.name);
      if (!upstream) {
        continue;
      }
      if (entry.upstream.exportKind || entry.upstream.members) {
        errors.push(`${entry.id} has export-only upstream metadata`);
      }
      const firstReference = entry.upstream.references[0];
      if (
        firstReference.path !== upstream.path ||
        firstReference.startLine !== upstream.line
      ) {
        errors.push(
          `${entry.id} must begin at ${upstream.path}:${upstream.line}`,
        );
      }
      const expectedDefault =
        upstream.defaultExpression === undefined
          ? { kind: 'undefined' }
          : {
              expression: upstream.defaultExpression,
              kind: 'expression',
            };
      if (stableJson(entry.upstream.default) !== stableJson(expectedDefault)) {
        errors.push(
          `${entry.id} default does not match ${stableJson(expectedDefault)}`,
        );
      }
      const expectedFacets = [
        ...(upstream.callback ? ['callback'] : []),
        ...(upstream.renderer ? ['renderer'] : []),
        ...(upstream.style ? ['style'] : []),
      ];
      if (
        stableJson([...entry.facets].sort()) !==
        stableJson(expectedFacets.sort())
      ) {
        errors.push(
          `${entry.id} facets do not match ${expectedFacets.join(', ') || 'none'}`,
        );
      }
    } else {
      if (
        entry.facets.length !== 0 ||
        entry.upstream.exportKind ||
        entry.upstream.default ||
        entry.upstream.members
      ) {
        errors.push(`${entry.id} behavior carries export/option-only metadata`);
      }
    }
  }

  return errors;
}

export function validateStatusTransitions(previousManifest, manifest) {
  const errors = [];

  if (!previousManifest) {
    return errors;
  }

  if (
    previousManifest.target.commit !== manifest.target.commit ||
    previousManifest.target.version !== manifest.target.version
  ) {
    errors.push(
      'A new upstream target requires a new manifest; do not mutate this pin',
    );
    return errors;
  }
  if (stableJson(previousManifest.target) !== stableJson(manifest.target)) {
    errors.push(
      'Pinned target metadata changed; add a new manifest for a new upstream target',
    );
  }
  if (previousManifest.documentation !== manifest.documentation) {
    errors.push('Pinned parity documentation path changed');
  }

  const currentById = new Map(
    manifest.entries.map((entry) => [entry.id, entry]),
  );

  for (const previous of previousManifest.entries) {
    const current = currentById.get(previous.id);
    if (!current) {
      errors.push(`Parity entry was removed: ${previous.id}`);
      continue;
    }
    if (
      previous.kind !== current.kind ||
      previous.upstream.name !== current.upstream.name
    ) {
      errors.push(`Upstream identity changed for ${previous.id}`);
    }
    if (!allowedTransitions.has(`${previous.status}:${current.status}`)) {
      errors.push(
        `Invalid status transition for ${previous.id}: ${previous.status} -> ${current.status}`,
      );
    }
    if (previous.status === 'implemented') {
      if (previous.disposition !== current.disposition) {
        errors.push(`Implemented disposition changed for ${previous.id}`);
      }
      if (stableJson(previous.native) !== stableJson(current.native)) {
        errors.push(`Implemented native mapping changed for ${previous.id}`);
      }
      if (previous.contractTestId !== current.contractTestId) {
        errors.push(`Implemented contract-test ID changed for ${previous.id}`);
      }
    }
  }

  return errors;
}

async function collectJsonPaths(inputPath) {
  const inputStat = await stat(inputPath);

  if (inputStat.isFile()) {
    return [inputPath];
  }
  if (!inputStat.isDirectory()) {
    throw new Error(
      `Parity result path is not a file or directory: ${inputPath}`,
    );
  }

  return (await listFiles(inputPath)).filter((file) =>
    file.endsWith('.parity.json'),
  );
}

export function isTrackedResultArtifact(repositoryRoot, filePath) {
  const relative = path.relative(repositoryRoot, filePath);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return false;
  }

  return (
    spawnSync('git', ['ls-files', '--error-unmatch', '--', relative], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).status === 0
  );
}

async function verifyResultEvidence(repositoryRoot, resultPath, shard) {
  if (shard.commit !== currentGitCommit(repositoryRoot)) {
    throw new Error(
      `${resultPath} was collected for ${shard.commit}, not the checked-out commit`,
    );
  }
  if (!shard.command.includes('jest')) {
    throw new Error(`${resultPath} does not record the Jest command`);
  }
  if (isTrackedResultArtifact(repositoryRoot, resultPath)) {
    throw new Error(
      `${resultPath} is tracked; parity results must be freshly collected`,
    );
  }

  const evidencePath = resolveInside(
    path.dirname(resultPath),
    shard.evidence.path,
    'result evidence path',
  );
  if (isTrackedResultArtifact(repositoryRoot, evidencePath)) {
    throw new Error(
      `${evidencePath} is tracked; runner evidence must be freshly collected`,
    );
  }
  const rawContent = await readFile(evidencePath);
  if (sha256(rawContent) !== shard.evidence.sha256) {
    throw new Error(`${resultPath} evidence SHA-256 does not match`);
  }

  let rawResult;
  try {
    rawResult = JSON.parse(rawContent.toString('utf8'));
  } catch (error) {
    throw new Error(`${resultPath} has invalid Jest evidence JSON`, {
      cause: error,
    });
  }
  const derived = deriveJestParityResults(rawResult, repositoryRoot);
  if (stableJson(derived) !== stableJson(shard.results)) {
    throw new Error(
      `${resultPath} normalized results do not match executed Jest evidence`,
    );
  }
  for (const result of derived) {
    const sourcePath = resolveInside(
      repositoryRoot,
      result.source,
      'collected test source',
    );
    if (!(await stat(sourcePath)).isFile()) {
      throw new Error(
        `${resultPath} test source is not a file: ${result.source}`,
      );
    }
  }
}

export async function loadResultShards(repositoryRoot, resultInputs) {
  const schemaPath = path.join(
    repositoryRoot,
    'fixtures/parity/results.schema.json',
  );
  const shards = [];

  for (const input of resultInputs) {
    const inputPath = path.resolve(repositoryRoot, input);
    let paths;

    try {
      paths = await collectJsonPaths(inputPath);
    } catch (error) {
      throw new Error(`Cannot load parity results ${input}: ${error.message}`, {
        cause: error,
      });
    }

    if (paths.length === 0) {
      throw new Error(
        `Parity result directory contains no *.parity.json shards: ${input}`,
      );
    }

    for (const resultPath of paths) {
      const shard = await readJson(resultPath);
      await validateWithSchema(shard, schemaPath, resultPath);
      await verifyResultEvidence(repositoryRoot, resultPath, shard);
      shards.push({ path: resultPath, value: shard });
    }
  }

  return shards;
}

export function validateResults(
  manifest,
  shards,
  complete = false,
  requireImplemented = true,
) {
  const errors = [];
  const entryByContract = new Map(
    manifest.entries.map((entry) => [entry.contractTestId, entry]),
  );
  const resultByContract = new Map();

  for (const shard of shards) {
    for (const result of shard.value.results) {
      if (!entryByContract.has(result.id)) {
        errors.push(`Unknown parity result ID ${result.id} in ${shard.path}`);
      }
      if (resultByContract.has(result.id)) {
        errors.push(
          `Duplicate executed parity result ${result.id} in ${resultByContract.get(result.id).path} and ${shard.path}`,
        );
      } else {
        resultByContract.set(result.id, { path: shard.path, result });
      }
      if (result.status !== 'passed') {
        errors.push(
          `Parity result ${result.id} is ${result.status}, not passed (${shard.path})`,
        );
      }
    }
  }

  for (const entry of manifest.entries) {
    const executed = resultByContract.get(entry.contractTestId);
    const mustResolve =
      complete ||
      (requireImplemented &&
        entry.status === 'implemented' &&
        (entry.disposition === 'keep' || entry.disposition === 'adapt'));

    if (mustResolve && !executed) {
      errors.push(
        `${entry.id} (${entry.status}) has no executed result for ${entry.contractTestId}`,
      );
    }
    if (complete && entry.status !== 'implemented') {
      errors.push(`${entry.id} remains ${entry.status} at the complete gate`);
    }
  }

  return errors;
}

function escapeTable(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function markdownReference(manifest, reference) {
  const lineFragment =
    reference.startLine === reference.endLine
      ? `#L${reference.startLine}`
      : `#L${reference.startLine}-L${reference.endLine}`;
  return `[${reference.path}:${reference.startLine}-${reference.endLine}](../../${manifest.target.fixture}/${reference.path}${lineFragment})`;
}

function defaultText(entry) {
  const value = entry.upstream.default;
  if (!value) {
    return '—';
  }
  return value.kind === 'undefined' ? '`undefined`' : `\`${value.expression}\``;
}

function summaryRows(manifest) {
  const dispositions = ['keep', 'adapt', 'redesign', 'drop'];
  const statuses = ['planned', 'in-progress', 'implemented'];
  const rows = [];

  for (const kind of ['export', 'option', 'behavior']) {
    const entries = manifest.entries.filter((entry) => entry.kind === kind);
    rows.push(
      `| ${kind} | ${entries.length} | ${dispositions
        .map(
          (value) =>
            `${value}: ${entries.filter((entry) => entry.disposition === value).length}`,
        )
        .join('<br>')} | ${statuses
        .map(
          (value) =>
            `${value}: ${entries.filter((entry) => entry.status === value).length}`,
        )
        .join('<br>')} |`,
    );
  }

  return rows;
}

function sortedEntries(manifest, kind) {
  return manifest.entries
    .filter((entry) => entry.kind === kind)
    .sort((left, right) => {
      if (kind === 'behavior') {
        return left.id.localeCompare(right.id);
      }
      const byName = left.upstream.name.localeCompare(right.upstream.name);
      return byName || left.id.localeCompare(right.id);
    });
}

export function renderParityDocumentation(manifest) {
  const lines = [
    '<!-- Generated by `pnpm parity:update`; do not edit by hand. -->',
    '<!-- markdownlint-disable MD013 MD033 -->',
    '',
    '# `react-chessboard` 5.10 parity ledger',
    '',
    `This is the rendered view of [the machine-readable manifest](../../fixtures/parity/react-chessboard-5.10.json) for \`${manifest.target.package}@${manifest.target.version}\`.`,
    `The target is pinned to tag \`${manifest.target.tag}\`, commit \`${manifest.target.commit}\`; its complete ${manifest.expectedCounts.sourceFiles}-file, ${manifest.expectedCounts.sourceLines.toLocaleString('en-US')}-line \`src/\` tree and licenses are available in the [offline fixture](../../${manifest.target.fixture}/PROVENANCE.md).`,
    '',
    'Parity means every upstream item has one reviewed disposition and one implementation status. It does not mean copying the browser implementation. Incremental validation accepts reserved tests for planned/in-progress rows; implemented keep/adapt rows must resolve to one collected passing result. Required CI uses the `--complete` gate, which requires every reviewed disposition to be implemented and every ledger contract to resolve uniquely to a pass. For a drop row, implemented records a tested exclusion, not an implementation of the browser feature.',
    '',
    '## Pinned inventory',
    '',
    '| Inventory | Count |',
    '| --- | ---: |',
    `| Root named exports | ${manifest.expectedCounts.exports} |`,
    `| Runtime / type-only exports | ${manifest.expectedCounts.runtimeExports} / ${manifest.expectedCounts.typeExports} |`,
    `| Exported defaults | ${manifest.expectedCounts.defaultExports} |`,
    `| \`ChessboardOptions\` fields | ${manifest.expectedCounts.options} |`,
    `| Explicit / implicit \`undefined\` option defaults | ${manifest.expectedCounts.explicitOptionDefaults} / ${manifest.expectedCounts.implicitUndefinedOptionDefaults} |`,
    `| Callback / style / renderer options | ${manifest.expectedCounts.callbackOptions} / ${manifest.expectedCounts.styleOptions} / ${manifest.expectedCounts.rendererOptions} |`,
    `| \`defaultArrowOptions\` fields | ${manifest.expectedCounts.arrowOptionFields} |`,
    `| Default piece renderers | ${manifest.expectedCounts.defaultPieceRenderers} |`,
    `| Reviewed observable behaviors | ${manifest.expectedCounts.behaviors} |`,
    `| Total ledger rows | ${manifest.expectedCounts.entries} |`,
    '',
    'The source-derived counts are checked from the vendored TypeScript AST. The behavior set is a finite reviewed inventory; baseline comparison prevents silent deletion after this pin lands.',
    '',
    '## Disposition and status summary',
    '',
    '| Kind | Rows | Dispositions | Statuses |',
    '| --- | ---: | --- | --- |',
    ...summaryRows(manifest),
    '',
  ];

  for (const kind of ['export', 'option', 'behavior']) {
    const title = `${kind[0].toUpperCase()}${kind.slice(1)}s`;
    lines.push(`## ${title}`, '');
    if (kind === 'option') {
      lines.push(
        '| ID | Upstream | Facets | Default | Disposition | Native mapping | Status | Contract | Source | Notes |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      );
    } else {
      lines.push(
        '| ID | Upstream | Disposition | Native mapping | Status | Contract | Source | Notes |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
      );
    }

    for (const entry of sortedEntries(manifest, kind)) {
      const id = `\`${entry.id}\``;
      const upstream = `\`${escapeTable(entry.upstream.name)}\``;
      const disposition = entry.documentation
        ? `[${entry.disposition}](#${documentationAnchor(entry)})`
        : entry.disposition;
      const mapping = entry.native.symbols.length
        ? entry.native.symbols
            .map((symbol) => `\`${escapeTable(symbol)}\``)
            .join('<br>')
        : 'None (dropped)';
      const source = entry.upstream.references
        .map((reference) => markdownReference(manifest, reference))
        .join('<br>');
      const common = [
        id,
        upstream,
        disposition,
        mapping,
        entry.status,
        `\`${entry.contractTestId}\``,
        source,
        escapeTable(entry.compatibilityNotes),
      ];

      if (kind === 'option') {
        common.splice(
          2,
          0,
          entry.facets.length ? entry.facets.join(', ') : '—',
          defaultText(entry),
        );
      }
      lines.push(`| ${common.join(' | ')} |`);
    }
    lines.push('');
  }

  const deviations = manifest.entries
    .filter(
      (entry) =>
        entry.disposition === 'redesign' || entry.disposition === 'drop',
    )
    .sort((left, right) => {
      const byKind = kindOrder.get(left.kind) - kindOrder.get(right.kind);
      return byKind || left.upstream.name.localeCompare(right.upstream.name);
    });
  lines.push('## Redesign and drop rationale', '');
  for (const entry of deviations) {
    lines.push(
      `<a id="${documentationAnchor(entry)}"></a>`,
      '',
      `### \`${entry.id}\` — ${entry.upstream.name}`,
      '',
      `**${entry.disposition}.** ${entry.rationale}`,
      '',
      `Native mapping: ${
        entry.native.symbols.length
          ? entry.native.symbols.map((symbol) => `\`${symbol}\``).join(', ')
          : 'none for 1.0'
      }. ${entry.compatibilityNotes}`,
      '',
      `Contract: \`${entry.contractTestId}\`. Source: ${entry.upstream.references
        .map((reference) => markdownReference(manifest, reference))
        .join(', ')}.`,
      '',
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function gitShow(repositoryRoot, reference, manifestPath) {
  const result = spawnSync('git', ['show', `${reference}:${manifestPath}`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  if (result.status === 0) {
    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(
        `Baseline manifest at ${reference}:${manifestPath} is invalid JSON: ${error.message}`,
        { cause: error },
      );
    }
  }

  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (
    combined.includes('does not exist in') ||
    combined.includes('exists on disk, but not in') ||
    (combined.includes('Path') && combined.includes('does not exist'))
  ) {
    return undefined;
  }

  throw new Error(
    `Cannot read baseline ${reference}:${manifestPath}: ${combined.trim()}`,
  );
}

export async function checkParity({
  baselineRef,
  complete = false,
  manifestPath = defaultManifestPath,
  repositoryRoot,
  resultInputs = [],
  writeDocumentation = false,
}) {
  const absoluteManifestPath = resolveInside(
    repositoryRoot,
    manifestPath,
    'manifest path',
  );
  const manifest = await readJson(absoluteManifestPath);
  await validateManifestSchema(repositoryRoot, manifest);
  const inventory = await collectUpstreamInventory(repositoryRoot, manifest);
  const errors = validateManifestSemantics(manifest, inventory);
  const previousManifest = baselineRef
    ? gitShow(repositoryRoot, baselineRef, manifestPath)
    : undefined;
  errors.push(...validateStatusTransitions(previousManifest, manifest));

  const shards = await loadResultShards(repositoryRoot, resultInputs);
  if (complete && resultInputs.length === 0) {
    errors.push('--complete requires at least one --results path');
  }
  errors.push(
    ...validateResults(manifest, shards, complete, !writeDocumentation),
  );

  const documentation = renderParityDocumentation(manifest);
  const documentationPath = resolveInside(
    repositoryRoot,
    manifest.documentation,
    'documentation path',
  );

  if (errors.length === 0 && writeDocumentation) {
    await mkdir(path.dirname(documentationPath), { recursive: true });
    await writeFile(documentationPath, documentation);
  } else if (!writeDocumentation) {
    let committedDocumentation;
    try {
      committedDocumentation = await readFile(documentationPath, 'utf8');
    } catch (error) {
      errors.push(
        `Cannot read generated documentation ${manifest.documentation}: ${error.message}`,
      );
    }
    if (
      committedDocumentation !== undefined &&
      committedDocumentation !== documentation
    ) {
      errors.push(`${manifest.documentation} is stale; run pnpm parity:update`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Parity validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  return { inventory, manifest, previousManifest, shards };
}
