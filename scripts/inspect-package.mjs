import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const packageRoot = path.join(repositoryRoot, 'packages/chessboard-native');
const parityFixturesRoot = path.join(repositoryRoot, 'fixtures/parity');
const expectedPackageLicense = '(MIT AND CC-BY-SA-3.0)';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const argumentsList = process.argv.slice(2);

if (
  argumentsList.length !== 0 &&
  (argumentsList.length !== 2 || argumentsList[0] !== '--output')
) {
  throw new Error(
    'Usage: node scripts/inspect-package.mjs [--output <archive.tgz>]',
  );
}

const outputArchive = argumentsList[1]
  ? path.resolve(repositoryRoot, argumentsList[1])
  : undefined;

if (outputArchive && path.extname(outputArchive) !== '.tgz') {
  throw new Error('The --output path must end in .tgz');
}

const requiredPackageFiles = new Set([
  'CHANGELOG.md',
  'LICENSE',
  'LICENSE.CC-BY-SA-3.0.txt',
  'NOTICE.md',
  'README.md',
  'lib/module/index.js',
  'lib/module/pieces/index.js',
  'lib/module/react-chessboard-compat/index.js',
  'lib/typescript/src/index.d.ts',
  'lib/typescript/src/pieces/index.d.ts',
  'lib/typescript/src/react-chessboard-compat/index.d.ts',
  'package.json',
  'src/index.ts',
  'src/pieces/index.ts',
  'src/react-chessboard-compat/index.ts',
]);
const forbiddenPackagePathPatterns = [
  /(?:^|\/)fixtures?(?:\/|$)/i,
  /(?:^|\/)parity(?:\/|$)/i,
  /(?:^|\/)provenance\.md$/i,
  /(?:^|\/)third_party_notices\.md$/i,
  /upstream-b74704a/i,
];
const permittedFixtureDuplicates = new Set(['LICENSE.CC-BY-SA-3.0.txt']);
const requiredNoticeMarkers = new Map([
  [
    'NOTICE.md',
    [
      'Colin M.L. Burnett',
      'commons.wikimedia.org/wiki/Category:SVG_chess_pieces',
      'Creative Commons Attribution-ShareAlike 3.0 Unported',
      'LICENSE.CC-BY-SA-3.0.txt',
    ],
  ],
  ['LICENSE.CC-BY-SA-3.0.txt', ['Attribution-ShareAlike 3.0 Unported']],
]);
const builtinModuleSpecifiers = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);
const moduleFilePattern = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), 'chessboard-native-package-'),
);

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status}`,
    );
  }
}

function runAndCapture(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status}`,
    );
  }

  return result.stdout;
}

function assertPackageContents(files) {
  const paths = files.map((file) => file.path);
  const missing = [...requiredPackageFiles].filter(
    (requiredFile) => !paths.includes(requiredFile),
  );
  const unexpected = paths.filter(
    (file) =>
      file !== 'CHANGELOG.md' &&
      file !== 'LICENSE' &&
      file !== 'LICENSE.CC-BY-SA-3.0.txt' &&
      file !== 'NOTICE.md' &&
      file !== 'README.md' &&
      file !== 'package.json' &&
      !file.startsWith('lib/') &&
      !file.startsWith('src/'),
  );
  const forbidden = paths.filter((file) =>
    forbiddenPackagePathPatterns.some((pattern) => pattern.test(file)),
  );

  if (missing.length > 0) {
    throw new Error(`Packed archive is missing: ${missing.join(', ')}`);
  }

  if (unexpected.length > 0) {
    throw new Error(
      `Packed archive contains files outside the allowlist: ${unexpected.join(', ')}`,
    );
  }

  if (forbidden.length > 0) {
    throw new Error(
      `Packed archive contains vendored parity material: ${forbidden.join(', ')}`,
    );
  }
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function collectFixtureHashes(directory, hashes = new Map()) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await collectFixtureHashes(entryPath, hashes);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const content = await readFile(entryPath);
    const digest = sha256(content);
    const relativePath = path.relative(repositoryRoot, entryPath);
    const matches = hashes.get(digest) ?? [];

    matches.push({ content, relativePath });
    hashes.set(digest, matches);
  }

  return hashes;
}

async function assertPackageExcludesParityFixture(files) {
  const fixtureHashes = await collectFixtureHashes(parityFixturesRoot);

  for (const file of files) {
    const packedContent = await readFile(path.join(packageRoot, file.path));

    if (permittedFixtureDuplicates.has(file.path)) {
      continue;
    }

    const exactFixtureMatches = fixtureHashes.get(sha256(packedContent)) ?? [];
    const exactFixtureMatch = exactFixtureMatches.find(({ content }) =>
      content.equals(packedContent),
    );

    if (exactFixtureMatch) {
      throw new Error(
        `Packed archive file ${file.path} duplicates parity fixture ${exactFixtureMatch.relativePath}`,
      );
    }
  }
}

async function assertPackageNotices(files) {
  const filePaths = new Set(files.map((file) => file.path));

  for (const [filePath, markers] of requiredNoticeMarkers) {
    if (!filePaths.has(filePath)) {
      continue;
    }

    const content = await readFile(path.join(packageRoot, filePath), 'utf8');

    for (const marker of markers) {
      if (!content.includes(marker)) {
        throw new Error(`${filePath} is missing required notice: ${marker}`);
      }
    }
  }
}

function collectModuleSpecifiers(filePath, source) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const specifiers = new Set();

  function addStringLiteral(node) {
    if (node && ts.isStringLiteralLike(node)) {
      specifiers.add(node.text);
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addStringLiteral(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      addStringLiteral(node.arguments[0]);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      addStringLiteral(node.argument.literal);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return specifiers;
}

function dependencyNameFromSpecifier(specifier) {
  const segments = specifier.split('/');

  return specifier.startsWith('@')
    ? segments.slice(0, 2).join('/')
    : segments[0];
}

function resolvePackedRelativeImport(importer, specifier, filePaths) {
  const target = path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), specifier),
  );
  const javascriptExtension = ['.cjs', '.js', '.mjs'].find((extension) =>
    target.endsWith(extension),
  );
  const typedTarget = javascriptExtension
    ? target.slice(0, -javascriptExtension.length)
    : undefined;
  const candidates = [
    target,
    ...(typedTarget
      ? [
          `${typedTarget}.d.ts`,
          `${typedTarget}.cts`,
          `${typedTarget}.mts`,
          `${typedTarget}.ts`,
          `${typedTarget}.tsx`,
        ]
      : []),
    `${target}.cjs`,
    `${target}.cts`,
    `${target}.js`,
    `${target}.jsx`,
    `${target}.json`,
    `${target}.mjs`,
    `${target}.mts`,
    `${target}.ts`,
    `${target}.tsx`,
    `${target}/index.cjs`,
    `${target}/index.cts`,
    `${target}/index.js`,
    `${target}/index.jsx`,
    `${target}/index.mjs`,
    `${target}/index.mts`,
    `${target}/index.ts`,
    `${target}/index.tsx`,
  ];

  return candidates.find((candidate) => filePaths.has(candidate));
}

function collectManifestTargets(value, targets = []) {
  if (typeof value === 'string') {
    targets.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      collectManifestTargets(entry, targets);
    }
  } else if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      collectManifestTargets(entry, targets);
    }
  }

  return targets;
}

async function assertPackageModuleGraph(files) {
  const filePaths = new Set(files.map((file) => file.path));
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
  );

  if (manifest.license !== expectedPackageLicense) {
    throw new Error(
      `Package license must be ${expectedPackageLicense}; received ${String(manifest.license)}`,
    );
  }

  const declaredRuntimeDependencies = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const manifestTargets = [
    manifest.main,
    manifest.module,
    manifest.source,
    manifest.types,
    manifest['react-native'],
    ...collectManifestTargets(manifest.exports),
    ...collectManifestTargets(manifest.imports),
  ].filter((target) => typeof target === 'string');

  for (const target of manifestTargets) {
    if (!target.startsWith('./') || target.includes('*')) {
      throw new Error(`Cannot verify package manifest target: ${target}`);
    }

    const packedTarget = target.slice(2);

    if (!filePaths.has(packedTarget)) {
      throw new Error(`Package manifest target is not packed: ${target}`);
    }
  }

  for (const filePath of filePaths) {
    if (!moduleFilePattern.test(filePath)) {
      continue;
    }

    const source = await readFile(path.join(packageRoot, filePath), 'utf8');

    for (const specifier of collectModuleSpecifiers(filePath, source)) {
      if (specifier.startsWith('.')) {
        if (!resolvePackedRelativeImport(filePath, specifier, filePaths)) {
          throw new Error(
            `Packed module ${filePath} cannot resolve relative import ${specifier}`,
          );
        }

        continue;
      }

      if (
        builtinModuleSpecifiers.has(specifier) ||
        dependencyNameFromSpecifier(specifier) === manifest.name
      ) {
        continue;
      }

      if (specifier.startsWith('#')) {
        if (!Object.hasOwn(manifest.imports ?? {}, specifier)) {
          throw new Error(
            `Packed module ${filePath} uses unmapped package import ${specifier}`,
          );
        }

        continue;
      }

      const dependencyName = dependencyNameFromSpecifier(specifier);

      if (!declaredRuntimeDependencies.has(dependencyName)) {
        throw new Error(
          `Packed module ${filePath} imports undeclared runtime dependency ${dependencyName}`,
        );
      }
    }
  }
}

try {
  const packOutput = runAndCapture(
    npmCommand,
    [
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      temporaryDirectory,
    ],
    packageRoot,
  );
  const packResults = JSON.parse(packOutput);

  if (!Array.isArray(packResults) || packResults.length !== 1) {
    throw new Error('npm pack did not report exactly one package archive');
  }

  assertPackageContents(packResults[0].files);
  await assertPackageExcludesParityFixture(packResults[0].files);
  await assertPackageNotices(packResults[0].files);
  await assertPackageModuleGraph(packResults[0].files);

  const archives = (await readdir(temporaryDirectory)).filter((file) =>
    file.endsWith('.tgz'),
  );

  if (archives.length !== 1) {
    throw new Error(`Expected one package archive, found ${archives.length}`);
  }

  const archive = path.join(temporaryDirectory, archives[0]);

  process.stdout.write(
    `Inspecting ${archives[0]} (${packResults[0].entryCount} files, ${packResults[0].size} bytes)\n`,
  );

  run(pnpmCommand, ['exec', 'publint', archive, '--strict']);
  run(pnpmCommand, [
    'exec',
    'attw',
    archive,
    '--profile',
    'esm-only',
    '--no-definitely-typed',
  ]);

  if (outputArchive) {
    await mkdir(path.dirname(outputArchive), { recursive: true });
    await copyFile(archive, outputArchive);
    process.stdout.write(`Saved inspected archive to ${outputArchive}\n`);
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
